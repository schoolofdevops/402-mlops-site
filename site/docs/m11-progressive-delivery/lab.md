---
sidebar_position: 2
title: "Lab: Releasing a Model Safely with Argo Rollouts"
---
# Releasing a Model Safely with Argo Rollouts

In Lab 9 you handed deployment over to Argo CD. Push to the release branch, and the new
version goes out. That is fine for a web application. For a model it is not.

Software usually fails loudly. It crashes, the container exits, the probe goes red, and you
know within seconds. A model fails quietly. It starts up, it answers every request, it returns
a number for every input, and the number is wrong. Nothing goes red.

A rolling Deployment cannot catch that, because it only knows whether the pod is running. In
this lab you would replace it with something that can run the new version and the old version
side by side, so you can look at the new one before any real traffic reaches it.

## What will you learn

  * Why a `Deployment` is the wrong object for shipping a model
  * How an Argo Rollout differs from a Deployment, and what it adds
  * The blue/green pattern, that is an active version and a preview version running together
  * How to send a candidate model to preview while production keeps serving
  * How to promote explicitly, and how to abort without a redeploy
  * Why KEDA needs extra permission before it can scale a Rollout

## Pre Requisites

You should have finished Lab 9. Your cluster should have the model running under Argo CD.

```
kubectl get applications -n argocd
kubectl get deploy,svc,pods
```

You also need the monitoring stack from Lab 7, because the next lab gates promotions on
Prometheus metrics and it is easier to install everything now.

```
kubectl get pods -n monitoring
```

## What blue/green actually means

```bash
                         +---------------------+
        real traffic --->|  model-active (svc) |
                         +----------+----------+
                                    |
                                    v
                         +---------------------+
                         |  ReplicaSet  rev 5  |   <-- the version serving users
                         |  (stable)           |
                         +---------------------+

                         +---------------------+
      your testing  ---->| model-preview (svc) |
                         +----------+----------+
                                    |
                                    v
                         +---------------------+
                         |  ReplicaSet  rev 6  |   <-- the candidate, no real traffic
                         |  (preview)          |
                         +---------------------+
```

where,

  * **model-active** is the Service real users hit. It never points at an unproven version
  * **model-preview** is a second Service pointing at the candidate
  * both ReplicaSets exist at the same time, so rolling back is a label change and not a rebuild
  * promotion is the moment `model-active` is repointed from the old ReplicaSet to the new one

A normal Deployment replaces pods in place and then hopes the metrics look alright. Blue/green
runs both, lets you measure, and only then decides.

## PART I - Installing Argo Rollouts

Argo Rollouts is a separate controller from Argo CD. Argo CD decides *what* should be running.
Argo Rollouts decides *how* a change gets rolled out.

**Create** the namespace and **install** the controller.

```
kubectl create namespace argo-rollouts
kubectl apply -n argo-rollouts -f https://github.com/argoproj/argo-rollouts/releases/latest/download/install.yaml
```

**Verify** the controller is up.

```
kubectl get pods -n argo-rollouts
```

Wait until `argo-rollouts` shows `Running`.

**Install** the kubectl plugin as well. You would use it constantly in this lab, and it gives
you a far better view than plain `kubectl get`.

  * **macOS** : `brew install argoproj/tap/kubectl-argo-rollouts`
  * **Linux** :

```
curl -LO https://github.com/argoproj/argo-rollouts/releases/latest/download/kubectl-argo-rollouts-linux-amd64
chmod +x kubectl-argo-rollouts-linux-amd64
sudo mv kubectl-argo-rollouts-linux-amd64 /usr/local/bin/kubectl-argo-rollouts
```

**Verify** the plugin.

```
kubectl argo rollouts version
```

## PART II - Turning the Deployment into a Rollout

A Rollout spec looks almost exactly like a Deployment spec. Same selector, same pod template,
same replica count. What changes is `kind`, and the addition of a `strategy` block.

Let's build it up. Here is the skeleton.

`file: deployment/kubernetes/model-rollout.yaml`

```
apiVersion: xxx
kind: xxx
metadata:
  name: model
spec:
  replicas: xxx
  selector:
    matchLabels:
      app: model
  template:
    xxx
  strategy:
    blueGreen:
      activeService: xxx
      previewService: xxx
      autoPromotionEnabled: xxx
```

**Problem Statement**

  * keep the name `model`, so nothing else in your cluster has to change
  * run 2 replicas, so there is something to observe during a rollout
  * keep the same pod template you already have, with the same image and ports
  * point `activeService` at a Service named `model-active`
  * point `previewService` at a Service named `model-preview`
  * **do not** promote automatically. A human decides
  * keep a few old revisions around so rollback has something to go back to

Now the full spec.

`file: deployment/kubernetes/model-rollout.yaml`

```
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: model
  labels:
    app: models

spec:
  revisionHistoryLimit: 3
  replicas: 2

  selector:
    matchLabels:
      app: model

  template:
    metadata:
      labels:
        app: model

    spec:
      containers:
        - name: house-price-model
          image: docker.io/xxxxxx/house-price-model:latest
          imagePullPolicy: Always

          env:
            - name: DRIFT_THRESHOLD
              value: "1.5"
            - name: SERVICE_NAME
              value: "model"

          ports:
            - containerPort: 8000
              protocol: TCP

          resources:
            limits:
              cpu: 1
              memory: 1Gi
            requests:
              cpu: 200m
              memory: 512Mi

  strategy:
    blueGreen:
      activeService: model-active
      previewService: model-preview
      autoPromotionEnabled: false
      abortScaleDownDelaySeconds: 60
```

`replace xxxxxx with your docker id`

Three fields carry the behaviour.

**autoPromotionEnabled: false** is the whole point of this lab. Set it to `true` and the
Rollout promotes the moment the preview pods are healthy, which puts you back where you started.
Healthy is not the same as correct.

**abortScaleDownDelaySeconds: 60** keeps the aborted ReplicaSet alive for a minute after you
abort. That gives you time to read its logs and work out what was wrong, instead of the evidence
disappearing.

**The two env vars** are not used yet. `DRIFT_THRESHOLD` and `SERVICE_NAME` are read by the
drift code you would add in Lab 12. They are here now so the pod spec does not change again
later, because a pod template change triggers a fresh rollout.

### The two Services

The Rollout needs two Services to point at. Both select the same `app: model` label, and the
controller manages the difference by injecting a rollout-specific hash label at promotion time.
You do not manage that yourself.

`file: deployment/kubernetes/model-active.yaml`

```
apiVersion: v1
kind: Service
metadata:
  name: model-active
  labels:
    app: model
    role: active
spec:
  type: ClusterIP
  selector:
    app: model
  ports:
    - name: http
      port: 8000
      targetPort: 8000
      protocol: TCP
    - name: metrics
      port: 9100
      targetPort: 9100
      protocol: TCP
```

`file: deployment/kubernetes/model-preview.yaml`

```
apiVersion: v1
kind: Service
metadata:
  name: model-preview
  labels:
    app: model
    role: preview
spec:
  type: ClusterIP
  selector:
    app: model
  ports:
    - name: http
      port: 8000
      targetPort: 8000
      protocol: TCP
    - name: metrics
      port: 9100
      targetPort: 9100
      protocol: TCP
```

Both carry the `metrics` port on 9100, which is the separate metrics endpoint you added in
Lab 8. Keeping it named `metrics` matters, because the ServiceMonitor selects the port by name.

### Wiring it into kustomize

**Remove** the old Deployment and Service from the kustomization, and **add** the three new
files.

`file: deployment/kubernetes/kustomization.yaml`

```
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - model-rollout.yaml
  - model-active.yaml
  - model-preview.yaml
  - streamlit-deploy.yaml
  - streamlit-svc.yaml
  - fastapi-scaledobject.yaml
```

`model-deploy.yaml and model-svc.yaml are gone. Delete the files so Argo CD prunes the old objects`

```
git rm deployment/kubernetes/model-deploy.yaml deployment/kubernetes/model-svc.yaml
```

### Point Streamlit at the active Service

The frontend currently calls `http://model:8000`. That Service no longer exists.

`file: deployment/kubernetes/streamlit-deploy.yaml`

```
        env:
        - name: API_URL
          value: http://model-active:8000
```

This is the detail that catches people. The whole point of blue/green is that real traffic only
ever reaches the active Service. If your frontend pointed at `model-preview`, you would be
serving users from an unproven model and would not know it.

## PART III - Letting it deploy

**Commit** everything and take it through the pull request flow from Lab 9.

```
git add deployment/kubernetes
git commit -am "replace model Deployment with an Argo Rollout"
git push origin main
```

Raise a pull request from `main` into `release` and merge it.

**Watch** Argo CD sync, then **watch** the Rollout itself.

```
kubectl argo rollouts get rollout model --watch
```

This is a much better view than `kubectl get pods`. You would see the revision history, which
ReplicaSet is active and which is preview, the number of pods in each, and what the controller
is currently waiting on.

**Verify** the app still works through the active Service at
[http://localhost:30000/](http://localhost:30000/).

The first time a Rollout is created there is nothing to compare against, so it simply brings up
the pods and marks them active. The interesting part starts with the second version.

## PART IV - Shipping a candidate

Let's release a change and watch it stop at the gate.

**Make** a visible change to the model service, so you can tell the two versions apart.

`file: src/api/main.py`

```
app = FastAPI(
    title="House Price Prediction API",
    version="1.1.0",
)
```

**Commit and push** to main, let the pipeline from Lab 5 build and publish the image, then
merge the pull request into `release`.

**Watch** what happens.

```
kubectl argo rollouts get rollout model --watch
```

A new ReplicaSet appears. Its pods come up. And then the Rollout **stops** and reports that it
is paused, waiting for promotion.

**Check** both versions independently. The preview Service is not exposed outside the cluster,
so port-forward to it.

```
kubectl port-forward svc/model-preview 8100:8000
```

In another terminal, send a prediction to the candidate.

```
curl -s http://localhost:8100/ | head -20
```

And compare with the active version.

```
kubectl port-forward svc/model-active 8200:8000
```

```
curl -s http://localhost:8200/ | head -20
```

One should report version 1.1.0 and the other 1.0.0. Real users are still being served by the
active one.

#### Observe

While the Rollout is paused, check who is serving the Streamlit app.

```
kubectl get pods -l app=model
```

Both ReplicaSets have pods running. Now open the Streamlit app and make a prediction. Which
version answered? The active one. That is the guarantee blue/green gives you, and it holds for
as long as you leave the rollout paused.

### Promoting

When you are satisfied, **promote**.

```
kubectl argo rollouts promote model
```

Watch the active Service swing across to the new ReplicaSet. The old one stays around, scaled
down, for as long as `revisionHistoryLimit` allows.

**Verify** the active version is now the new one.

```
kubectl argo rollouts get rollout model
```

### Aborting

Now let's do the more valuable half. **Ship** something broken on purpose.

`file: src/api/main.py`

```
@app.post("/predict", response_model=PredictionResponse)
async def predict(request: HousePredictionRequest):
    import time
    time.sleep(2)          # deliberately slow, remove after this exercise
    ...
```

Push it through the pipeline and the pull request, and wait for the preview pods to come up.

**Test** the candidate through the preview Service and confirm it is slow.

```
kubectl port-forward svc/model-preview 8100:8000
```

```
time curl -s -X POST http://localhost:8100/predict \
  -H "Content-Type: application/json" -d @predict.json
```

Two seconds per prediction. Nobody should get this.

**Abort** it.

```
kubectl argo rollouts abort model
```

**Verify** production never moved.

```
kubectl argo rollouts get rollout model
```

The active Service is still on the previous revision. No rollback was needed, because the
candidate never took traffic in the first place. That is the difference between rolling back and
never rolling forward.

`remove the time.sleep line and push again before moving on, otherwise you would carry a broken model into the next lab`

## PART V - Letting KEDA scale a Rollout

If you kept the `ScaledObject` from Lab 8, it is now broken, and the failure is silent.

**Look** at it.

```
kubectl get scaledobject
kubectl describe scaledobject fastapi-latency-autoscaler
```

The problem is that it targets a `Deployment` named `model`, and there is no longer a Deployment
by that name.

**Point** it at the Rollout instead.

`file: deployment/kubernetes/fastapi-scaledobject.yaml`

```
spec:
  scaleTargetRef:
    apiVersion: argoproj.io/v1alpha1
    kind: Rollout
    name: model
```

Apply that and it still does not work. The reason is permission. KEDA's service account was
never granted access to `argoproj.io` resources, so it cannot read or scale a Rollout. Nothing
logs an obvious error at the ScaledObject level, which is what makes this one annoying to find.

**Check** the operator log to see it for yourself.

```
kubectl logs -n keda deploy/keda-operator --tail=50
```

**Grant** the permission.

`file: deployment/kubernetes/keda-rollouts-rbac.yaml`

```
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: keda-argo-rollouts-scale
rules:
  # Allow KEDA to scale Argo Rollouts
  - apiGroups: ["argoproj.io"]
    resources: ["rollouts", "rollouts/scale"]
    verbs: ["get", "list", "watch", "patch", "update"]

  # Optional but commonly needed for Rollouts tooling / undo paths
  - apiGroups: ["apps"]
    resources: ["replicasets"]
    verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: keda-argo-rollouts-scale
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: keda-argo-rollouts-scale
subjects:
  - kind: ServiceAccount
    name: keda-operator
    namespace: keda
```

Add it to the kustomization, commit, and let it deploy.

**Verify** KEDA can now drive the Rollout.

```
kubectl get scaledobject,hpa
```

Run the load test from Lab 8 and confirm the replica count moves.

`this is worth remembering as a general rule. Whenever you swap a workload for a custom resource, anything that used to scale or watch it needs its RBAC updated, and the failure is usually silent`

## Exercise

Prove to yourself that the preview environment is genuinely isolated.

  * Ship a candidate that returns a deliberately absurd price, for example by multiplying the
    prediction by 100
  * With the Rollout paused, send twenty predictions through the Streamlit app and record the answers
  * Send twenty more through the preview Service with port-forward
  * Confirm the two sets of answers differ, and that no user could have received the absurd ones
  * Abort, and confirm the absurd version leaves no trace in the active Service

## Cleanup

Keep everything. Lab 11 gates these promotions on real metrics, and Lab 12 adds drift detection
to the same Rollout.

Do **remove** any deliberately broken code you pushed during this lab.

```
git diff origin/release -- src/api/main.py
```

Make sure no `time.sleep` and no absurd multiplier survive into the release branch.

#### Summary

In this lab you replaced the Deployment with an Argo Rollout and gained the ability to run two
versions of the model at once. You learned that a model fails by behaving differently rather
than by crashing, which is why a rolling update cannot protect you.

You shipped a candidate to preview while production kept serving, compared the two versions
side by side, promoted one explicitly, and aborted another without any rollback being needed.

You also hit the RBAC problem that shows up whenever a custom resource replaces a built-in one,
and saw that it fails quietly rather than loudly.

But notice what is still true. **You** decided whether the candidate was good, by looking at it.
That does not scale, and it does not work at three in the morning. In Lab 11 you would hand
that judgement to Prometheus, so a promotion only happens when the numbers say it should.

##### Reading List

  * [Argo Rollouts blue/green strategy](https://argo-rollouts.readthedocs.io/en/stable/features/bluegreen/)
  * [Rollout specification](https://argo-rollouts.readthedocs.io/en/stable/features/specification/)
  * [kubectl argo rollouts plugin](https://argo-rollouts.readthedocs.io/en/stable/installation/#kubectl-plugin-installation)
  * [KEDA scaling custom resources](https://keda.sh/docs/latest/concepts/scaling-deployments/#scaling-of-custom-resources)
  * [Kubernetes RBAC](https://kubernetes.io/docs/reference/access-authn-authz/rbac/)

## Search Keywords

  * argo rollouts blue green active preview service
  * autoPromotionEnabled false manual promotion
  * kubectl argo rollouts promote abort
  * abortScaleDownDelaySeconds
  * argo rollouts revisionHistoryLimit
  * keda scale argo rollout rbac clusterrole
  * rollout vs deployment kubernetes
