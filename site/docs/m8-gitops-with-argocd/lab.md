---
sidebar_position: 2
title: "Lab: Setting up Continuous Delivery for your Model with GitOps and Argo CD"
---
# Setting up Continuous Delivery for your Model with GitOps and Argo CD

So far you have been deploying the model by running `kubectl apply` yourself. It works, but
it means every change to the cluster depends on someone remembering to run a command. This
time you are going to hand that job over to an agent running inside the cluster. You would
push your change to Git, and Argo CD would notice it and apply it for you.

This is the last piece of the system you have been building since Lab 2.

## What will you learn

  * The four principles of GitOps, and how each one maps to something you already have
  * How to install Argo CD into the same cluster where your model runs
  * How to write an Argo CD `Application`, which is nothing but a mapping from a Git repo to a cluster
  * How to set up a `release` branch so that only approved changes get deployed
  * How to run a change all the way from a code edit to a running pod, without touching `kubectl`
  * How to debug a deployment that says it is synced but is still serving the old version

## Pre Requisites

You should have finished Lab 6, Lab 7 and Lab 8 before starting this one. Specifically, you
need,

  * a three node KIND cluster, with the `model` and `streamlit` deployments running
  * Prometheus, Grafana and KEDA installed from the previous two labs
  * your fork of `house-price-predictor` cloned locally, with `deployment/kubernetes` and
    `deployment/monitoring` already committed
  * `kubectl` working against the cluster

Check the cluster is healthy before you begin.

```
kubectl get nodes
```

[sample output]
```
NAME                 STATUS   ROLES           AGE   VERSION
kind-control-plane   Ready    control-plane   16d   v1.32.2
kind-worker          Ready    <none>          16d   v1.32.2
kind-worker2         Ready    <none>          16d   v1.32.2
```

Make sure all three nodes are in `Ready` state.

## The system you are about to build

```bash
                    +---------------------------+
                    |   GitHub  (your fork)     |
                    |                           |
   you push  --->   |   main  ---PR--->  release|
                    +-------------+-------------+
                                  |
                                  | (1) GitHub Actions builds
                                  |     and pushes the image
                                  v
                    +---------------------------+
                    |        Docker Hub         |
                    +---------------------------+
                                  ^
                                  | (3) kubelet pulls image
                                  |
   +------------------------------|--------------------------------+
   |  KIND cluster                |                                |
   |                              |                                |
   |   +----------------+         |      +----------------------+  |
   |   |  namespace:    |  (2) watches   |  namespace: default  |  |
   |   |  argocd        |  the release   |                      |  |
   |   |                |  branch and    |   model     pods     |  |
   |   |   Argo CD  ----+---applies-->   |   streamlit pods     |  |
   |   +----------------+                +----------------------+  |
   |                                                               |
   +---------------------------------------------------------------+
```

where,

  * **main** is where you and your team work day to day
  * **release** is the branch Argo CD watches. Nothing reaches the cluster unless it lands here
  * **Argo CD** runs inside the same cluster it deploys to, in its own `argocd` namespace
  * **deployment/kubernetes** is the path inside the repo that holds the manifests to apply

## PART I - Following the four principles of GitOps

GitOps came out of the Kubernetes community around 2017. There are four principles, and the
good news is that you have already done most of them without calling them by name.

**Principle one says everything should be declarative.** You have been writing YAML since
Lab 6, so this one is done.

**Principle two says the desired state should be stored in Git.** Let's check whether that
is actually true for you right now.

Switch to the root of your project.

```
cd house-price-predictor
git status
```

Anything that shows up as untracked here is state that lives only on your laptop. If Argo CD
cannot see it in Git, it does not exist as far as the cluster is concerned.

`replace nothing below, these are the two paths that usually get missed`

```
git add deployment/kubernetes deployment/monitoring
git commit -am "check in all deployment manifests"
git push origin main
```

Now **confirm** the manifests are really there. Open your fork on GitHub and browse to
`deployment/kubernetes`. You should see the four manifests and the kustomization file.

```
model-deploy.yaml
model-svc.yaml
streamlit-deploy.yaml
streamlit-svc.yaml
kustomization.yaml
```

**Principle three says apply approved changes automatically.** This is where branching comes
in. You would keep `main` as the branch where work happens, and add a second branch which
represents what should be running in the cluster.

Create the release branch and push it.

```
git checkout -b release
git push origin release
git checkout main
```

From now on, a change reaches the cluster only when someone raises a pull request from
`main` into `release` and it gets merged. That pull request is your approval step. It is a
habit developers have been using for years, and you are borrowing it for deployments.

**Principle four says check and correct with a software agent.** That agent is Argo CD, and
setting it up is PART II.

#### Observe

You now have two branches with identical content. Ask yourself, what would happen if someone
ran `kubectl edit deployment model` directly on the cluster? Hold that question. You will
answer it at the end of PART III.

## PART II - Installing Argo CD

Argo CD is one of a family of tools, along with Argo Workflows, Argo Events and Argo
Rollouts. The one you want here is Argo CD, which is the continuous delivery piece. It is
simple to start with, it comes with a web UI, and you can move to writing everything as code
later.

Before you install anything, keep a second terminal open watching the namespace, so that you
can see the components come up.

```
kubectl get all -n argocd --watch
```

In your main terminal, **list** the existing namespaces first, to confirm `argocd` is not
already there.

```
kubectl get ns
```

Then **create** the namespace.

```
kubectl create namespace argocd
```

And **install** Argo CD into it.

```
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```

Watch the second terminal. A number of components would come up, and the important ones to
know about are,

  * **argocd-application-controller**, which is the part that actually compares Git with the cluster and corrects the difference
  * **argocd-repo-server**, which clones and renders your manifests
  * **argocd-server**, which is the web UI and the API you would log in to
  * **argocd-dex-server** and **argocd-redis**, which support the above

Give it a couple of minutes, then **verify** every pod is running.

```
kubectl get pods -n argocd
```

Make sure none of them are stuck in `Pending` or `CrashLoopBackOff`.

### Getting access to the web UI

The `argocd-server` service comes up as `ClusterIP`, which means it is reachable only from
inside the cluster. You would change it to a `NodePort` so that you can open it from your
browser.

```
kubectl -n argocd patch svc argocd-server -p '{"spec":{"type":"NodePort"}}'
```

Then find out which port it landed on.

```
kubectl -n argocd get svc argocd-server
```

Look at the `443:3xxxx/TCP` entry in the `PORT(S)` column. That five digit number is the one
you would use. Browse to `https://localhost:<that port>`.

`if the page does not open, your KIND cluster may not be mapping that port to your host`

In that case use port forwarding instead, which always works.

```
kubectl port-forward svc/argocd-server -n argocd 8080:443
```

And browse to [https://localhost:8080](https://localhost:8080) instead.

Your browser is going to show a certificate warning. That is expected. Argo CD generates its
own certificate rather than buying one from a certificate authority, so the browser has no
way to trust it. As long as you are running this on your own machine and not exposing it to
the internet, you can go ahead.

### Logging in

The username is `admin`. The password was generated for you at install time and stored in a
secret.

```
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d ; echo
```

Copy that value and log in. Once you are in, have a look around at Applications, Settings,
Repositories, Clusters and Projects. You would use Applications in a minute.

`the output of the above command is a one time generated password and would be different for you, so it is not shown here`

## PART III - Deploying the model the GitOps way

### Cleaning up what you applied by hand

Right now the `model` and `streamlit` deployments exist because you ran `kubectl apply`
yourself in Lab 6. If you leave them there, it becomes hard to tell what Argo CD did and what
you did. So let's remove them first and let Argo CD create them fresh.

```
kubectl delete deploy,svc model streamlit
```

**Verify** they are gone.

```
kubectl get deploy,svc
```

You should no longer see `model` or `streamlit` in the list.

Also confirm there are no Argo CD applications yet.

```
kubectl get applications -A
```

This should come back empty. Leave the monitoring and KEDA pieces alone. Those live in
their own namespaces and are not part of this application.

### Understanding the Application resource

Argo CD adds a new kind of object to your cluster called an `Application`. It is not a native
Kubernetes resource. It is a custom resource, which is nothing but a way of extending
Kubernetes with new object types, and the controller that understands it was installed along
with Argo CD.

You have already used one custom resource without thinking about it. In Lab 8 you created a
`ScaledObject`, and that was brought in by KEDA in exactly the same way.

**List** the custom resources on your cluster to see them together.

```
kubectl get crds
```

```
kubectl api-resources | grep -i -E 'application|scaledobject|servicemonitor'
```

You would see `applications` from Argo CD, `scaledobjects` from KEDA and `servicemonitors`
from Prometheus sitting alongside the native pods and deployments.

### Writing the Application spec

Let's start with the skeleton so you can see the shape of it before the details fill in.

`file: deployment/argocd/house-price-ml.yaml`

```
apiVersion: xxx
kind: xxx
metadata:
  name: xxx
  namespace: xxx
spec:
  project: xxx
  source:
    repoURL: xxx
    targetRevision: xxx
    path: xxx
  destination:
    server: xxx
    namespace: xxx
  syncPolicy:
    xxx
```

**Problem Statement**

  * name it `house-price-ml`, and put the object in the `argocd` namespace
  * use the `default` project, since you are not organising applications into groups yet
  * source
      * repoURL should be your fork of `house-price-predictor`
      * targetRevision should be the `release` branch, not `main`
      * path should be `deployment/kubernetes`, which is where the kustomization file lives
  * destination
      * server should be the same cluster Argo CD is running in
      * namespace should be `default`, which is where the model was running before
  * sync policy
      * sync automatically when the branch changes
      * prune, that is delete objects from the cluster when they are removed from Git
      * self heal, that is undo any manual change made directly on the cluster

Now the complete spec.

`file: deployment/argocd/house-price-ml.yaml`

```
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: house-price-ml
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/xxxxxx/house-price-predictor.git
    targetRevision: release
    path: deployment/kubernetes
  destination:
    server: https://kubernetes.default.svc
    namespace: default
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

`replace xxxxxx with your actual GitHub username`

Notice that the name is `house-price-ml`, all lowercase with hyphens. Kubernetes object names
have to be valid subdomain names. If you try `House Price Predictor` you would get an error
saying a lowercase subdomain is required. It is an easy one to trip over.

**Apply** it.

```
kubectl apply -f deployment/argocd/house-price-ml.yaml
```

You could also create the exact same thing from the web UI, using New App and filling the
same fields in. The UI even scans your repository and suggests the path for you. Both ways
produce the same object, so use whichever you prefer.

### Watching it sync

Switch to the Argo CD UI and open the application. Give it a minute.

You would see a tree of objects appear. The services come up, then the deployments, then the
deployments create replica sets, and the replica sets create the pods. That chain is worth
looking at, because it is the first time you get to see the parent and child relationship of
Kubernetes objects drawn out for you.

From the terminal, **check** the same thing.

```
kubectl get applications -n argocd
```

```
kubectl describe application house-price-ml -n argocd
```

Look at the `Sync Status` and the `Health Status` in the describe output. You are aiming for
`Synced` and `Healthy`.

**Verify** the workloads are actually back.

```
kubectl get deploy,svc,pods
```

And open the Streamlit app at [http://localhost:30000/](http://localhost:30000/) to confirm
predictions still work. Nothing about the application changed. Only the way it got deployed
changed.

#### Observe

Try answering the question from PART I now. Scale the deployment by hand and watch what
happens.

```
kubectl scale deploy streamlit --replicas=3
kubectl get pods --watch
```

Does the change stick? Why not? This is `selfHeal` doing its job. Git says one replica, so
Argo CD puts it back to one. From here on, if you want three replicas, you change the YAML
in Git. The cluster is no longer something you edit.

### When KEDA and Argo CD disagree

If you had a `ScaledObject` from Lab 8 pointing at the `model` deployment, you may notice the
application flipping between `Synced` and `OutOfSync`, and pods being replaced over and over.

Here is what is going on. KEDA creates a horizontal pod autoscaler, which changes the replica
count on the `model` deployment. Argo CD sees a replica count that does not match Git, and
sets it back. KEDA changes it again. The two of them keep correcting each other.

The fix is to bring the scaling configuration under the same Argo CD application, so that
both of them are working from the same source of truth. **Move** the KEDA configuration into
the path Argo CD is watching.

```
git mv deployment/monitoring/fastapi-scaledobject.yaml deployment/kubernetes/
```

Using `git mv` rather than moving the file in your editor keeps the history clean. Git records
it as a rename rather than as a delete plus an add.

Then **add** it to the kustomization so that it actually gets applied.

`file: deployment/kubernetes/kustomization.yaml`

```
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - model-deploy.yaml
  - model-svc.yaml
  - streamlit-deploy.yaml
  - streamlit-svc.yaml
  - fastapi-scaledobject.yaml
```

Commit it, and take it through the pull request flow in PART IV.

## PART IV - The full pipeline, from code change to running pod

Everything is now in place. Let's make one small change and follow it all the way through.

The pieces you already have are, GitHub Actions from Lab 5 which builds the image and pushes
it to Docker Hub, and Argo CD from this lab which deploys whatever is in the `release`
branch. Let's connect them.

### Make the change

**Edit** the Streamlit page title so that you have something visible to look for.

`file: streamlit_app/app.py`

```
st.title("House Price Prediction v2")
```

**Check** what changed.

```
git status
git diff
```

You should see exactly one file changed, and one line different in it.

**Commit and push** to main.

```
git commit -am "update streamlit title to v2"
git push origin main
```

Go to GitHub -> Actions. The Streamlit CI workflow you wrote in Lab 5 triggers, because the
change is under `streamlit_app/`. Wait for it to go green, then check Docker Hub and confirm
a new image was pushed.

`this is your continuous integration half. Nothing has reached the cluster yet`

### Approve the change

Nothing deploys from `main`. Argo CD is watching `release`. So raise a pull request.

Go to your repository on GitHub, then Pull requests -> New pull request. Set the base branch
to `release` and the compare branch to `main`. You would see both of your changes listed,
the Streamlit title and the moved ScaledObject.

Review the diff and merge it.

That merge is principle number three in action. The change was approved before it was
allowed anywhere near the cluster.

### Watch the deployment happen

Switch to the Argo CD UI. By default it polls Git about every three minutes, so either wait,
or press Refresh to pull immediately.

You would see the ScaledObject appear as a new object in the tree, and under it the
horizontal pod autoscaler it creates, and under that the pods it is managing. The whole chain
is drawn out for you, which makes it much easier to reason about than reading `kubectl`
output.

**Verify** in the terminal.

```
kubectl get scaledobject,hpa,pods
```

Then open the Streamlit app and check whether the title now reads `v2`.

If it does, you are done. If it still says the old title, go to the troubleshooting section
below, because that is a real problem and it is worth understanding.

## Troubleshooting - the image that would not update

This one caught me on camera, so let's walk through it properly.

The symptom was simple. Argo CD said `Synced`. The pod was running. Docker Hub had a new
image. But the browser still showed the old title.

The first thing I checked was whether the image had really been rebuilt. It had. So the CI
half was fine, and the problem was somewhere on the cluster side.

The next suspect was the image pull policy. **Set** it explicitly rather than relying on the
default.

`file: deployment/kubernetes/streamlit-deploy.yaml`

```
    spec:
      containers:
      - image: xxxxxx/streamlit:latest
        name: streamlit
        imagePullPolicy: Always
        ports:
        - containerPort: 8501
```

`replace xxxxxx with your docker id`

I applied that and synced again. Still the old version. So that was not it either.

Then I looked at the events and the logs on the replica set and the pod. Nothing. No errors
at all. The pod was healthy, it had simply started from an image it already had.

And that is the actual answer. Your cluster is KIND, which is nothing but Kubernetes running
inside Docker containers. Each node is a container on your machine.

```
docker ps
```

```
kubectl get nodes
```

Compare those two lists. The three nodes are the three containers. Images pulled by
Kubernetes are stored inside those containers, not in your laptop's own Docker. So
`docker image rm` on your machine does nothing to them.

There is no `docker` command inside the nodes either, because KIND uses containerd as the
runtime. The tool you would use is `crictl`.

**List** the images on one of the worker nodes.

```
docker exec -it kind-worker crictl images
```

**Remove** the stale one.

```
docker exec -it kind-worker crictl rmi docker.io/xxxxxx/streamlit:latest
```

Do the same for the second worker.

```
docker exec -it kind-worker2 crictl rmi docker.io/xxxxxx/streamlit:latest
```

Then **restart** the deployment so the pod is recreated and has to pull again.

```
kubectl rollout restart deployment streamlit
kubectl get pods --watch
```

The new pod will sit in `ContainerCreating` for a while, because this time it is genuinely
pulling the image. Once it is `Running`, refresh the browser. The title should now read `v2`.

**The real lesson here is not about crictl.** The root cause is the `latest` tag. Because the
tag never changes, nothing in the system can tell that the contents changed. Kubernetes has
no reason to pull, and Argo CD has nothing new to sync, because the YAML is identical.

We used `latest` in this course to keep things simple for learners coming from a machine
learning background rather than a DevOps one. In real work you would tag every image with
something unique, most commonly the Git commit SHA. Then the manifest changes on every build,
Argo CD sees a genuinely new desired state, and this whole class of problem disappears.

#### Observe

Look back at your `mlops-pipeline.yml` from Lab 5. Where exactly would you change it so that
each build produces a uniquely tagged image? You would need to change two things, the tag in
the build step and the image reference in the manifest. Think about how the second one gets
updated automatically. That is the question the Exercise below asks you to answer.

## Exercise

Move your deployment off the `latest` tag.

  * Update the GitHub Actions workflow to tag the image with the short Git SHA as well as `latest`
  * Update `deployment/kubernetes/streamlit-deploy.yaml` to refer to that specific tag
  * Push to main, raise a pull request into release, merge it
  * Confirm Argo CD picks up the change without you touching the cluster at all

Once this works, you should never need `crictl` again for this problem.

## Cleanup

Argo CD and the application can stay. You would want them for anything you build on top of
this. If you do want to remove them, do it in this order.

**Delete** the application first, so that Argo CD removes what it created.

```
kubectl delete application house-price-ml -n argocd
```

Then remove Argo CD itself.

```
kubectl delete -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl delete namespace argocd
```

`do not delete the KIND cluster if you plan to keep working with this project`

#### Summary

In this lab you took the four principles of GitOps and turned them into a working setup. You
wrote everything as declarative YAML, you stored it in Git, you put a pull request in front of
the `release` branch as your approval step, and you installed Argo CD as the agent that checks
and corrects the cluster continuously.

You also connected the two halves of the pipeline. GitHub Actions builds the image and pushes
it to the registry, and Argo CD takes the manifests from Git and applies them to the cluster.
Between the two of them, a change goes from your editor to a running pod without anyone
running `kubectl apply`.

And you debugged a real failure. A pod that is running, synced and healthy can still be
serving the wrong thing, and the reason was a mutable image tag rather than anything wrong
with Argo CD.

This is where the course ends and where your own platform work starts. The natural next steps
would be progressive delivery, that is releasing a new model version to a small slice of
traffic first and promoting it only if the metrics look good, and drift detection, which is
about noticing when the live data stops looking like the data your model was trained on.
Both build directly on what you have running right now.

##### Reading List

  * [GitOps Principles](https://opengitops.dev/)
  * [Argo CD Getting Started](https://argo-cd.readthedocs.io/en/stable/getting_started/)
  * [Argo CD Application Specification](https://argo-cd.readthedocs.io/en/stable/user-guide/application-specification/)
  * [Argo CD Sync Options](https://argo-cd.readthedocs.io/en/stable/user-guide/sync-options/)
  * [Kustomize Reference](https://kubectl.docs.kubernetes.io/references/kustomize/)
  * [Images and Image Pull Policy](https://kubernetes.io/docs/concepts/containers/images/)
  * [Debugging KIND clusters](https://kind.sigs.k8s.io/docs/user/quick-start/)

## Search Keywords

  * gitops four principles
  * argocd application crd
  * argocd sync policy prune selfheal
  * argocd nodeport access
  * argocd initial admin secret
  * kubernetes custom resource definition
  * kustomize resources
  * kind crictl images
  * imagepullpolicy always latest tag
  * kubectl rollout restart deployment

## Mini Project

Set up a second environment for the same model, using the same manifests.

You are asked to run a `staging` copy of the house price predictor alongside the existing
one, so that changes can be seen working before they reach the main deployment.

Requirements,

  * `staging` runs in its own namespace, and does not interfere with the existing deployment
  * both environments are built from the same base manifests, with no copy pasted YAML
  * staging tracks the `main` branch, and the existing environment continues to track `release`
  * both appear as separate applications in the Argo CD UI
  * a change pushed to `main` should show up in staging within a few minutes, and should not
    reach the other environment until a pull request is merged

No walkthrough is given for this one. You have everything you need between kustomize overlays
and the Application spec you wrote in PART III.
