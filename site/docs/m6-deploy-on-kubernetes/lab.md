---
sidebar_position: 2
title: "Lab: Deploying the Model on Kubernetes"
---
# Deploying the Model on Kubernetes

Your image is in a registry, built by a pipeline. Right now the only way to run it is
`docker run` on somebody's laptop. That does not scale, it does not restart when it crashes,
and it does not survive the laptop being closed.

In this lab you would build a small Kubernetes cluster and deploy both the model and the web
interface onto it. Then you would replace the commands you typed with YAML files, so the whole
setup lives in your repository.

## What will you learn

  * Why Kubernetes is worth the trouble for model inference
  * The three objects you need to know to start, which are Pods, Deployments and Services
  * How to build a three node cluster on your own machine with KIND
  * How to deploy an image and expose it so you can reach it from the browser
  * How the web interface finds the model without knowing any IP address
  * A quick way to generate YAML instead of writing it from scratch
  * How to manage a set of manifests together with kustomize

## Pre Requisites

You should have finished Lab 5, and both images should be published to Docker Hub.

Go to your Docker Hub account and confirm you have two repositories.

  * `xxxxxx/house-price-model` with a `latest` tag
  * `xxxxxx/streamlit` with a `latest` tag

`if either is missing, go back to Lab 5 and run the pipelines. This lab pulls both images from the registry`

You also need `kubectl` on your machine.

```
kubectl version --client
```

## Why Kubernetes for a model

Think about what happens when your model gets popular.

One container serving predictions is fine until it is not. You would need more copies of it
when traffic goes up, and fewer when it goes down. You would need a new copy started
automatically when one crashes. You would need to roll out a new model version without any
downtime. And you would need the web interface to keep finding the model even as copies come
and go.

Writing all of that yourself is a lot of work. Kubernetes does it for you, and that is the
whole reason you would put a model on it.

## The three objects to know

**A Pod** is the smallest thing Kubernetes runs. It wraps one container, or sometimes a few
that belong together. Pods are disposable. They get created and destroyed all the time, and
each new one gets a new IP address. You would rarely create one directly.

**A Deployment** manages Pods for you. You tell it which image to run and how many copies you
want, and it makes sure that is true. If a Pod dies, the Deployment starts another one. If you
change the image, it replaces the Pods one at a time.

**A Service** gives you a stable name and address in front of a set of Pods. Since Pod IPs keep
changing, nothing could reliably talk to them without this. The Service also spreads requests
across all the Pods behind it.

That is enough to deploy your model. Everything else in Kubernetes is built on top of these.

## PART I - Building the cluster

You would use KIND, which stands for Kubernetes in Docker. It creates a cluster where each
node is a container on your machine. It is the quickest way to get a real multi node cluster
without paying for cloud servers.

**Set up** a three node cluster by following the KIND instructions.

  * [Lab K101 - Install Kubernetes with KIND](https://kubernetes-tutorial.schoolofdevops.com/kind_create_cluster/)

**Verify** the cluster is up.

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

You should see three nodes and all of them in `Ready` state. One control plane and two
workers. Your workloads would land on the two workers.

**Check** the system pods are healthy too.

```
kubectl get pods -A
```

Everything in `kube-system` should be `Running`. If anything is stuck in `Pending`, the cluster
is not ready yet, so wait a minute and check again.

Keep a second terminal open watching what happens, because seeing objects appear as you create
them teaches you more than reading about them.

```
kubectl get all --watch
```

## PART II - Deploying the web interface

Let's start with Streamlit, because it is the simpler of the two.

**Create** the deployment.

`replace xxxxxx with your docker id`

```
kubectl create deployment streamlit --image=xxxxxx/streamlit:v1 --port=8501
```

**Verify** it, in three steps that each tell you something different.

```
kubectl get deploy
kubectl describe deploy streamlit
kubectl get pods
```

`get deploy` tells you whether the desired number of replicas is ready. `describe` tells you
what it is trying to do and shows events at the bottom, which is where you would look when
something is wrong. `get pods` shows the actual running copies.

Now **scale** it and watch the Deployment do its job.

```
kubectl scale deploy streamlit --replicas=3
kubectl get all
```

Three Pods now, and you did not create any of them yourself. The Deployment did, because you
changed what you asked for and it made reality match.

**Scale it back** before moving on.

```
kubectl scale deploy streamlit --replicas=1
```

#### Observe

Delete one of the Pods by hand and watch what happens.

```
kubectl delete pod <pod-name>
kubectl get pods
```

Does the Pod count stay at one? Why? The Deployment noticed a copy was missing and started a
replacement within seconds. This is the self healing behaviour you were paying for.

### Exposing it with a Service

The Pod is running but you cannot reach it from your browser. It has an IP address that only
exists inside the cluster.

**Create** a Service of type NodePort, which opens a port on every node.

```
kubectl create service nodeport streamlit --tcp=8501 --node-port=30000
```

**Verify** the Service found your Pods.

```
kubectl get svc,ep,pods -o wide
kubectl describe svc streamlit
```

The important line is `Endpoints`. If it lists Pod IP addresses, the Service is wired up
correctly. If it says `<none>`, the Service labels do not match any Pod, and nothing would
work.

**Open** [http://localhost:30000/](http://localhost:30000/).

The interface loads. Predictions would not work yet, because there is no model behind it. Same
situation as the middle of Lab 4.

## PART III - Deploying the model

Same two steps as before, different image and different ports.

**Create** the deployment and the service.

```
kubectl create deployment model --image=xxxxxx/house-price-model:latest --port=8000

kubectl create service nodeport model --tcp=8000 --node-port=30100
```

**Verify** everything is up.

```
kubectl get all
```

**Test** the API directly at [http://localhost:30100/docs](http://localhost:30100/docs).

Send a prediction through the interactive docs page and confirm you get a price back. The model
is now serving on Kubernetes.

### Connecting the two

Here is the part worth slowing down for.

**Look** at how the Streamlit app finds the API.

`file: streamlit_app/app.py`

```
       try:
                # Get API endpoint from environment variable or use default
                api_endpoint = os.getenv("API_URL", "http://model:8000")
                predict_url = f"{api_endpoint.rstrip('/')}/predict"

                st.write(f"Connecting to API at: {predict_url}")

```

The default is `http://model:8000`. There is no IP address anywhere. The hostname `model` is
the name of the Service you just created, and Kubernetes runs an internal DNS server that
resolves Service names to the right place.

This is the same idea you met in Lab 4, where `http://fastapi:8000` worked because of Compose
networking. Different platform, same solution. Name the thing, and let the platform find it.

Because the Service name matches what the app already expects, your app should be fully working
now.

**Verify** the whole path. Go back to [http://localhost:30000/](http://localhost:30000/), enter
some house details and press predict. You should get a price.

`if you get a connection error, check that your Service is named exactly model. kubectl get svc will tell you`

## PART IV - Moving from commands to YAML

Creating things with `kubectl create` is fine for learning. It is a bad way to run anything
real, because the only record of what you did is your shell history.

You would move all of it into YAML files that live in your repository. Then the cluster setup
is reviewable, repeatable, and ready for Lab 9 where Argo CD would apply it for you.

### Generating the manifests

You do not have to write the YAML by hand. `kubectl` can print what it would have created.

**Switch** to the deployment directory.

```
cd house-price-predictor/deployment/kubernetes
```

**Generate** all four manifests.

`replace xxxxxx with your username in the two deployment commands`

```
kubectl create deployment streamlit --image=xxxxxx/streamlit:latest --port=8501 -o yaml --dry-run=client > streamlit-deploy.yaml
```

```
kubectl create service nodeport streamlit --tcp=8501 --node-port=30000 -o yaml --dry-run=client > streamlit-svc.yaml
```

```
kubectl create deployment model --image=xxxxxx/house-price-model:latest --port=8000 --dry-run=client -o yaml > model-deploy.yaml
```

```
kubectl create service nodeport model --tcp=8000 --node-port=30100 --dry-run=client -o yaml > model-svc.yaml
```

The two flags doing the work are `--dry-run=client`, which means do not send this to the
cluster, and `-o yaml`, which means print it as YAML instead. Together they turn `kubectl` into
a YAML generator.

**Open** one of the generated files and read it. You would recognise everything in it, since it
is the same information you passed on the command line, just written out in full.

### Grouping them with kustomize

Four files means four `kubectl apply` commands, and remembering the right order. Kustomize lets
you treat them as one unit.

`file: deployment/kubernetes/kustomization.yaml`

```
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - model-deploy.yaml
  - model-svc.yaml
  - streamlit-deploy.yaml
  - streamlit-svc.yaml
```

Kustomize is an alternative to Helm for managing manifests, and it is built into `kubectl`, so
there is nothing extra to install. You would meet it again in Lab 9, because Argo CD reads a
kustomization file directly.

### Applying the manifests

**Delete** what you created by hand first, so that you know the YAML is really doing the work
and not just sitting next to something that was already running.

```
kubectl delete deploy,svc model streamlit
```

**Verify** the cluster is empty of your workloads.

```
kubectl get all
```

**Apply** the whole directory in one command.

```
cd house-price-predictor
kubectl apply -k deployment/kubernetes
```

`the -k flag tells kubectl to read a kustomization file rather than a single manifest`

**Verify** everything came back.

```
kubectl get deploy,svc,pods
```

And test the app once more at [http://localhost:30000/](http://localhost:30000/).

**Commit** the manifests.

```
git add deployment/kubernetes
git commit -am "add kubernetes manifests for model and streamlit"
git push origin main
```

#### Observe

Open `model-deploy.yaml` and look at the `image` line. It says `latest`.

Ask yourself how Kubernetes would know that a new image was published under that same tag.
Hold the question. It comes back and bites in Lab 9, and there is a whole troubleshooting
section about it there.

## Exercise

Change the deployment through YAML rather than through commands.

  * Edit `streamlit-deploy.yaml` and set the replica count to 2
  * Apply the directory again with `kubectl apply -k deployment/kubernetes`
  * Confirm a second Pod appears
  * Now scale it to 4 using `kubectl scale`, then apply the directory again

What happened to your 4 replicas? Why? This is the difference between what Git says and what
somebody typed, and it is exactly the problem GitOps solves in Lab 9.

## Cleanup

Leave the cluster and the workloads running. Lab 7 and Lab 8 both build directly on top of what
you have now.

If you need to stop for the day, leave the cluster alone and just close your terminal. KIND
keeps running in Docker.

If you really do want to remove the workloads, do it through the same kustomization.

```
kubectl delete -k deployment/kubernetes
```

`do not delete the KIND cluster itself. Rebuilding it and redeploying takes far longer than leaving it running`

#### Summary

In this lab you moved the model off a laptop and onto a cluster. You built a three node KIND
cluster, learned the three objects that matter to start with, deployed both the model and the
web interface, exposed them with NodePort Services, and connected the two using Kubernetes DNS
rather than IP addresses.

Then you did it properly. You generated YAML instead of writing it, grouped it with a
kustomization file, deleted everything you had created by hand, and brought it all back from
the manifests in your repository.

Right now your model runs as a single Pod, and you have no idea how it is performing. In Lab 7
you would add Prometheus and Grafana, instrument the API so it reports its own latency and
request rate, and build a dashboard for it.

##### Reading List

  * [Kubernetes Pods](https://kubernetes.io/docs/concepts/workloads/pods/)
  * [Kubernetes Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)
  * [Kubernetes Services](https://kubernetes.io/docs/concepts/services-networking/service/)
  * [DNS for Services and Pods](https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/)
  * [KIND quick start](https://kind.sigs.k8s.io/docs/user/quick-start/)
  * [Kustomize reference](https://kubectl.docs.kubernetes.io/references/kustomize/)

## Search Keywords

  * kind create cluster multi node
  * kubectl create deployment image port
  * kubectl create service nodeport
  * kubectl describe service endpoints none
  * kubernetes service dns name resolution
  * kubectl dry-run client output yaml
  * kubectl apply -k kustomization
  * kubectl scale deployment replicas
