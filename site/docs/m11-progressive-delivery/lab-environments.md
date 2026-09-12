---
sidebar_position: 4
title: "Lab: Running Staging and Production from the Same Manifests"
---
# Running Staging and Production from the Same Manifests

You now have a gated rollout, but you have one environment. Every experiment happens where real
users are. The gate protects you, and still, the only place a candidate has ever run is the
cluster that serves production.

In this lab you would split the system into staging and production. Same model, same manifests,
different blast radius. Staging gets loose thresholds and runs from `main`. Production gets
strict thresholds and runs from `release`.

And you would stop deploying `latest`, which has been quietly lying to you since Lab 6.

## What will you learn

  * Why one namespace for everything makes failures hard to read
  * How kustomize bases and overlays give you one definition and two environments
  * How to patch a value per environment without duplicating a single manifest
  * Why commit-SHA image tags make rollback deterministic, and `latest` does not
  * How to stop accidental rollouts with a single explicit restart knob
  * How to run two Argo CD Applications from one repository

## Pre Requisites

Labs 10 and 11 finished. You should have a gated Rollout running.

```
kubectl argo rollouts get rollout model
kubectl get analysistemplate
```

## Where everything lives now, and where it is going

Right now almost everything sits in `default`. That was fine while learning, and it is the
reason your KEDA and Argo CD trouble in Lab 9 was so hard to read. When a ScaledObject, a
Rollout, a ServiceMonitor and an Application all share one namespace, you cannot tell at a glance
which one is fighting which.

```bash
   BEFORE                          AFTER

   default                         argocd           GitOps control plane
     model rollout                 argo-rollouts    rollout controller
     services                      keda             autoscaling control plane
     scaledobject                  monitoring       Prometheus, Grafana
     servicemonitor                model-staging    staging workloads + gates
     streamlit                     model-prod       production workloads + gates
   argocd
   keda
   monitoring
```

The rule worth taking away: **metrics, services, rollouts and autoscaling for a workload should
live in the same namespace as the workload they control.** Once that is true, a failure is
scoped to one namespace and you can read it.

## PART I - Restructuring into a base and two overlays

Kustomize has two ideas. A **base** defines the system once. An **overlay** layers changes on
top for one environment. You never copy a manifest.

**Create** the new structure.

```
cd house-price-predictor
mkdir -p deployment/gitops/base/model
mkdir -p deployment/gitops/overlays/staging
mkdir -p deployment/gitops/overlays/prod
```

**Move** what you already have into the base.

```
git mv deployment/kubernetes/model-rollout.yaml deployment/gitops/base/model/
git mv deployment/kubernetes/model-active.yaml deployment/gitops/base/model/
git mv deployment/kubernetes/model-preview.yaml deployment/gitops/base/model/
git mv deployment/kubernetes/analysis-template.yaml deployment/gitops/base/model/
git mv deployment/kubernetes/analysistemplate-slo-post.yaml deployment/gitops/base/model/
git mv deployment/kubernetes/fastapi-scaledobject.yaml deployment/gitops/base/model/
git mv deployment/kubernetes/synthetic-traffic-cronjob.yaml deployment/gitops/base/model/
git mv deployment/kubernetes/keda-rollouts-rbac.yaml deployment/gitops/base/model/
git mv deployment/monitoring/servicemonitor.yaml deployment/gitops/base/model/model-servicemonitor.yaml
```

Using `git mv` keeps the history readable. Git records a rename rather than a delete plus an add.

### The namespace problem

Here is a wrinkle. Your AnalysisTemplate queries Prometheus with
`namespace="{{args.namespace}}"`, and the Rollout passes that argument. But the base cannot know
which namespace it is going to be deployed into.

The usual trick is a placeholder in the base that each overlay replaces.

`file: deployment/gitops/base/model/model-rollout.yaml`

```
      prePromotionAnalysis:
        templates:
          - templateName: model-gate-latency-errors
        args:
          - name: namespace
            value: PLACEHOLDER_NAMESPACE
          - name: service
            value: model-preview

      postPromotionAnalysis:
        templates:
          - templateName: model-slo-post
        args:
          - name: namespace
            value: PLACEHOLDER_NAMESPACE
          - name: service
            value: model-active
```

`PLACEHOLDER_NAMESPACE is never applied to a cluster. Each overlay replaces it before anything is deployed`

### An explicit restart knob

You will eventually want to force a rollout without changing the image. The tempting way is an
ad-hoc `kubectl patch` with a timestamp. Do not. Every patch creates a new pod template hash,
which creates a new ReplicaSet, and with Argo CD self-heal running you can end up with endless
churn that nobody can explain.

**Add** one explicit knob instead.

`file: deployment/gitops/base/model/patch-rollout-restart.yaml`

```
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: model
spec:
  template:
    metadata:
      annotations:
        gitops/restartNonce: "0"
```

Bump the number when you want a restart, and only then. Nothing else changes it. Controlled
change means controlled behaviour.

### The base kustomization

`file: deployment/gitops/base/model/kustomization.yaml`

```
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - model-rollout.yaml
  - model-active.yaml
  - model-preview.yaml
  - model-servicemonitor.yaml
  - analysis-template.yaml
  - analysistemplate-slo-post.yaml
  - fastapi-scaledobject.yaml
  - synthetic-traffic-cronjob.yaml

patches:
  - path: patch-rollout-restart.yaml
    target:
      group: argoproj.io
      version: v1alpha1
      kind: Rollout
      name: model
```

**Verify** the base renders before you build overlays on top of it.

```
kubectl kustomize deployment/gitops/base/model | head -40
```

`if this errors, fix it now. Every overlay problem is harder to read than the base problem underneath it`

## PART II - The staging overlay

Staging is the proving ground. Looser thresholds, runs from `main`, and a failure there costs
nothing.

`file: deployment/gitops/overlays/staging/namespace.yaml`

```
apiVersion: v1
kind: Namespace
metadata:
  name: model-staging
```

The namespace replacement uses a JSON patch, because you are replacing a value at a specific
path inside a list rather than merging a document.

`file: deployment/gitops/overlays/staging/patch-rollout-analysis-namespace.yaml`

```
- op: replace
  path: /spec/strategy/blueGreen/prePromotionAnalysis/args/0/value
  value: model-staging
- op: replace
  path: /spec/strategy/blueGreen/postPromotionAnalysis/args/0/value
  value: model-staging
```

`args/0 is the namespace argument because it is first in the list. If you reorder the args in the base, fix this path too`

Environment labels, so you can tell pods apart in Grafana.

`file: deployment/gitops/overlays/staging/patch-rollout-podlabels.yaml`

```
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: model
spec:
  strategy:
    blueGreen:
      autoPromotionEnabled: false
  template:
    metadata:
      annotations:
        gitops/restartNonce: "0"
      labels:
        env: staging
```

And the overlay itself.

`file: deployment/gitops/overlays/staging/kustomization.yaml`

```
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - namespace.yaml
  - ../../base/model

commonLabels:
  env: staging

namespace: model-staging

patches:
  - path: patch-rollout-podlabels.yaml
  - target:
      group: argoproj.io
      version: v1alpha1
      kind: Rollout
      name: model
    path: patch-rollout-analysis-namespace.yaml

images:
  - name: docker.io/xxxxxx/house-price-model
    newTag: latest
```

`replace xxxxxx with your docker id`

**`namespace: model-staging`** rewrites the namespace on every object in the overlay. You do not
set it on each manifest.

**`images:`** is how kustomize overrides an image tag without editing the Rollout. This is the
line your retraining pipeline will edit automatically in Lab 14.

**Render** it and read the output before deploying anything.

```
kubectl kustomize deployment/gitops/overlays/staging | grep -E 'namespace:|value: model-|image:'
```

**Verify** three things in that output: every `namespace:` says `model-staging`, no
`PLACEHOLDER_NAMESPACE` survives anywhere, and the image tag is what you expect.

## PART III - The production overlay

Production is the same system with tighter tolerances.

`file: deployment/gitops/overlays/prod/namespace.yaml`

```
apiVersion: v1
kind: Namespace
metadata:
  name: model-prod
```

`file: deployment/gitops/overlays/prod/patch-rollout-analysis-namespace.yaml`

```
- op: replace
  path: /spec/strategy/blueGreen/prePromotionAnalysis/args/0/value
  value: model-prod
- op: replace
  path: /spec/strategy/blueGreen/postPromotionAnalysis/args/0/value
  value: model-prod
```

`file: deployment/gitops/overlays/prod/kustomization.yaml`

```
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - namespace.yaml
  - ../../base/model
  - keda-rollouts-rbac.yaml

commonLabels:
  env: prod

namespace: model-prod

patches:
  - path: patch-rollout-podlabels.yaml
  - target:
      group: argoproj.io
      version: v1alpha1
      kind: Rollout
      name: model
    path: patch-rollout-analysis-namespace.yaml

images:
  - name: docker.io/xxxxxx/house-price-model
    newTag: latest
```

Notice the RBAC is only in the prod overlay. A `ClusterRoleBinding` is cluster-scoped, so
applying the same one from both overlays would have them fight over the same object. Cluster
scoped resources belong in exactly one overlay.

#### Observe

Render both overlays and diff them.

```
kubectl kustomize deployment/gitops/overlays/staging > /tmp/staging.yaml
kubectl kustomize deployment/gitops/overlays/prod > /tmp/prod.yaml
diff /tmp/staging.yaml /tmp/prod.yaml | head -40
```

How many lines actually differ? It should be namespaces, labels and the RBAC. The model
definition itself is identical, because there is only one copy of it. That is the whole value of
base and overlays.

## PART IV - Stopping the lie of `latest`

In Lab 9 you spent a while working out why a synced, healthy pod was serving the old version.
The answer was the `latest` tag, and you fixed it with `crictl` on the nodes. That was a
workaround, not a fix.

Here is the real problem. With a mutable tag, the manifest never changes between releases. Argo
CD compares Git to the cluster, sees no difference, and correctly does nothing. There is no
signal anywhere in the system that anything is new.

**Tag every image with the Git commit SHA.**

`file: .github/workflows/mlops-pipeline.yml`

```
    - name: Set image tag
      run: echo "TAG=sha-${GITHUB_SHA::7}-${GITHUB_RUN_NUMBER}" >> "$GITHUB_ENV"

    - name: Build and push Docker image
      uses: docker/build-push-action@v5
      with:
          context: .
          file: ./Dockerfile
          push: true
          tags: docker.io/${{ vars.DOCKERHUB_USERNAME }}/house-price-model:${{ env.TAG }}
          platforms: linux/amd64,linux/arm64
```

Now every build produces a tag that has never existed before. Three things follow.

Every running pod is traceable to one commit, so "which code is in production" has an exact
answer. The manifest genuinely changes on each release, so Argo CD has something real to sync.
And rollback is deterministic, because reverting the commit restores an image tag that still
exists in the registry.

**Point** the overlay at a specific tag instead of `latest`.

```
cd deployment/gitops/overlays/staging
kustomize edit set image docker.io/xxxxxx/house-price-model=docker.io/xxxxxx/house-price-model:sha-abc1234-42
```

`kustomize edit rewrites the kustomization.yaml for you. This is the exact command your pipeline runs in Lab 14`

## PART V - Two Argo CD Applications

One Application per environment, both from the same repository, each pointing at its own overlay
and its own branch.

`file: deployment/argocd/house-price-staging.yaml`

```
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: house-price-staging
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/xxxxxx/house-price-predictor.git
    targetRevision: main
    path: deployment/gitops/overlays/staging
  destination:
    server: https://kubernetes.default.svc
    namespace: model-staging
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

`file: deployment/argocd/house-price-prod.yaml`

```
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: house-price-prod
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/xxxxxx/house-price-predictor.git
    targetRevision: release
    path: deployment/gitops/overlays/prod
  destination:
    server: https://kubernetes.default.svc
    namespace: model-prod
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

The single most important difference is `targetRevision`. Staging follows `main`, so anything
merged shows up there within minutes. Production follows `release`, so nothing arrives without a
pull request. Your approval step from Lab 9 is now the boundary between two real environments
rather than a formality.

**Remove** the old single Application and **apply** the two new ones.

```
kubectl delete application house-price-ml -n argocd
kubectl apply -f deployment/argocd/house-price-staging.yaml
kubectl apply -f deployment/argocd/house-price-prod.yaml
```

**Verify** both.

```
kubectl get applications -n argocd
kubectl get all -n model-staging
kubectl get all -n model-prod
```

Open the Argo CD UI. You should now see two applications, and each one should reach `Synced` and
`Healthy`.

`give it a few minutes. Two namespaces of pods have to pull images and start`

## PART VI - Writing the runbook

A release process that lives only in your head is not a process. **Write** it down.

`file: deployment/RUNBOOK-RELEASE.md`

```
# Release Runbook

## Staging
1. Confirm the rollout exists:
   kubectl -n model-staging get rollout model

2. Confirm the newest pre-promotion AnalysisRun succeeded:
   kubectl -n model-staging get analysisrun --sort-by=.metadata.creationTimestamp | tail -n 6

3. Promote:
   kubectl argo rollouts promote model -n model-staging

4. Confirm the post-promotion AnalysisRun succeeded:
   kubectl -n model-staging get analysisrun --sort-by=.metadata.creationTimestamp | tail -n 6

## Production
Only after staging is green.

1. Raise a pull request from main into release and merge it.
2. Confirm Argo CD synced house-price-prod.
3. Confirm the pre-promotion AnalysisRun succeeded:
   kubectl -n model-prod get analysisrun --sort-by=.metadata.creationTimestamp | tail -n 6
4. Promote:
   kubectl argo rollouts promote model -n model-prod
   kubectl argo rollouts get rollout model -n model-prod -w
5. Confirm the post-promotion AnalysisRun succeeded.

## Rollback
Revert the commit that changed the image tag in the overlay, and let Argo CD sync.
The previous tag still exists in the registry, so this is deterministic.

## Force a restart without a code change
Bump gitops/restartNonce in patch-rollout-restart.yaml. Nothing else.

## Force Argo CD to refresh immediately
kubectl -n argocd patch app house-price-prod --type merge \
  -p '{"metadata":{"annotations":{"argocd.argoproj.io/refresh":"hard"}}}'
```

## Exercise

Prove the two environments are genuinely independent.

  * Push a visible change to `main` only
  * Confirm it appears in `model-staging` within a few minutes
  * Confirm `model-prod` is unchanged
  * Promote it in staging, verify it, then raise the pull request into `release`
  * Confirm it now reaches `model-prod` and has to pass that environment's gates too

Then answer this. If staging passes and production fails, what does that tell you about your
synthetic traffic?

## Cleanup

Keep both environments. Labs 13 and 14 use staging as the place where drift is detected and
retraining is triggered.

If your laptop is struggling with two environments plus monitoring, scale staging down rather
than deleting it.

```
kubectl -n model-staging scale rollout model --replicas=1
```

#### Summary

In this lab you split one environment into two, without duplicating a single manifest. A base
defines the model once, and two overlays give it a namespace, labels, an image tag and the right
analysis arguments.

You also fixed the `latest` tag problem properly. Commit-SHA tags mean every pod is traceable to
a commit, every release genuinely changes the manifest, and rollback is a revert rather than an
archaeology exercise.

And you replaced ad-hoc restart patches with one explicit knob, and wrote the release process
down so it exists outside your head.

What you have now is a platform. One model definition, two environments with different risk
tolerance, gated promotion in both, and Git as the only way in.

The gates still only measure speed and errors. In Lab 13 you would start measuring whether the
model is still seeing the world it was trained on.

##### Reading List

  * [Kustomize bases and overlays](https://kubectl.docs.kubernetes.io/references/kustomize/kustomization/)
  * [Kustomize images transformer](https://kubectl.docs.kubernetes.io/references/kustomize/kustomization/images/)
  * [JSON 6902 patches in kustomize](https://kubectl.docs.kubernetes.io/references/kustomize/kustomization/patches/)
  * [Argo CD Applications](https://argo-cd.readthedocs.io/en/stable/user-guide/application-specification/)
  * [Argo CD sync options](https://argo-cd.readthedocs.io/en/stable/user-guide/sync-options/)
  * [Kubernetes namespaces](https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/)

## Search Keywords

  * kustomize base overlay multi environment
  * kustomize edit set image
  * kustomize json6902 patch replace path
  * kustomize commonLabels namespace transformer
  * argocd application targetRevision branch per environment
  * argocd CreateNamespace sync option
  * docker image tag git commit sha
  * argo rollouts restart annotation nonce
