---
sidebar_position: 3
title: "Lab: Closing the Loop — Retraining Triggered by Evidence"
---
# Closing the Loop — Retraining Triggered by Evidence

You have every piece now. A pipeline that trains and publishes. Two environments. Gated,
reversible releases. And a drift signal that says when the model has stopped seeing the world it
was trained on.

They are still separate pieces. A human reads the drift alert and decides to retrain. In this
lab you would connect them, so that sustained drift triggers a retrain, the retrain produces a
new model and a new baseline, and that change flows through the gated rollout on its own.

This is the capstone. After this, the system observes itself and responds.

## What will you learn

  * The difference between retraining on a schedule and retraining on evidence
  * How a pipeline queries Prometheus and gates itself on the answer
  * Why the retrain must regenerate the baseline, and what breaks if it does not
  * How a pipeline commits back to Git instead of touching the cluster
  * Where to keep a human in the loop, and why the last step stays manual
  * How to trace one full cycle from drift to a promoted model

## Pre Requisites

Labs 10 to 13 finished. Drift metrics flowing and gates working.

```
kubectl -n model-staging port-forward svc/model-active 8000:8000
curl -s http://localhost:8000/drift
```

`baseline_loaded must be 1. If it is 0, go back to Lab 13. Everything here depends on it`

You also need Prometheus reachable from GitHub Actions. On a local KIND cluster it is not, so
read PART IV before running the workflow for real.

## The loop

```bash
   T0  healthy
       drift score near zero, gates passing
              |
              v
   T1  drift appears
       abnormal requests hit the active service
       model_drift_score climbs, model_drift_high_total increments
       Grafana shows the spike, alert fires
              |
              v
   T2  retrain triggered
       workflow queries Prometheus, confirms drift is real
       trains a new model, regenerates the baseline
       builds and pushes a SHA-tagged image
       updates the staging overlay and commits back to Git
              |
              v
   T3  new preview
       Argo CD syncs the commit
       Rollout creates a preview ReplicaSet
       PrePromotion analysis runs latency, 5xx, rps and drift gates
              |
              v
   T4  human promotes
       active service repointed
       PostPromotion analysis validates under real traffic
              |
              v
   T5  normalised
       baseline now matches the current distribution
       drift score returns to near zero
```

Notice where Git sits. The pipeline never runs `kubectl`. It builds an artifact and writes a
commit. Argo CD does the deploying. That separation is what makes the whole thing auditable.

## PART I - Retraining on evidence, not on a calendar

Most teams retrain on a schedule. Every Sunday, or every month. It is simple and it is wrong in
both directions.

If the data has not changed, you have burnt compute, produced a new model that needs validating,
and taken on release risk for no benefit. If the data changed on Tuesday, you have been serving a
stale model for five days.

Retraining should happen because the world changed. You have a measurement of exactly that, so
use it.

The workflow below keeps a schedule as a *check*, not as a trigger. It wakes up, asks Prometheus
whether drift is real, and only then does any work.

## PART II - The retraining workflow

`file: .github/workflows/retrain-and-deploy.yaml`

```
name: Retrain and Deploy (Staging)

on:
  workflow_dispatch:
    inputs:
      force:
        type: boolean
        description: "Force retrain/deploy even if drift is below threshold"
        default: false
  schedule:
    - cron: "0 3 * * *"

permissions:
  contents: write

concurrency:
  group: retrain-deploy-staging
  cancel-in-progress: false

jobs:
  drift_check:
    runs-on: ubuntu-latest
    outputs:
      retrain: ${{ steps.chk.outputs.retrain }}
      drift_value: ${{ steps.chk.outputs.drift_value }}

    steps:
      - name: Check drift in Prometheus
        id: chk
        env:
          PROM_URL: ${{ secrets.PROM_URL }}
          DRIFT_THRESHOLD: "1.5"
        run: |
          set -euo pipefail
          QUERY='max(max_over_time(model_drift_score{namespace="model-staging",service="model-active"}[15m])) or on() vector(0)'
          JSON="$(curl -fsS -G "${PROM_URL}/api/v1/query" --data-urlencode "query=${QUERY}")"
          VAL="$(echo "${JSON}" | jq -r '.data.result[0].value[1] // "0"')"
          echo "drift_value=${VAL}" >> "${GITHUB_OUTPUT}"
          if awk "BEGIN {exit !(${VAL} > ${DRIFT_THRESHOLD})}"; then
            echo "retrain=true" >> "${GITHUB_OUTPUT}"
          else
            echo "retrain=false" >> "${GITHUB_OUTPUT}"
          fi

  retrain_build_deploy:
    needs: drift_check
    if: (github.event_name == 'workflow_dispatch' && inputs.force == true) || (needs.drift_check.outputs.retrain == 'true')
    runs-on: ubuntu-latest

    steps:
      - name: Checkout main
        uses: actions/checkout@v4
        with:
          ref: main
          fetch-depth: 0

      - name: Set tag
        run: echo "TAG=sha-${GITHUB_SHA::7}-${GITHUB_RUN_NUMBER}" >> "$GITHUB_ENV"

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Docker login
        uses: docker/login-action@v3
        with:
          username: ${{ vars.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Build base image
        uses: docker/build-push-action@v6
        with:
          context: .
          file: Dockerfile
          tags: docker.io/${{ vars.DOCKERHUB_USERNAME }}/house-price-model:${{ env.TAG }}
          load: true
          push: false

      - name: Train inside the image
        run: |
          set -euo pipefail
          IMG=docker.io/${{ vars.DOCKERHUB_USERNAME }}/house-price-model:${TAG}
          docker run --rm -v "${{ github.workspace }}:/work" -w /work $IMG \
            python src/data/run_processing.py --input data/raw/house_data.csv --output data/processed/cleaned_house_data.csv
          docker run --rm -v "${{ github.workspace }}:/work" -w /work $IMG \
            python src/features/engineer.py --input data/processed/cleaned_house_data.csv --output data/processed/featured_house_data.csv --preprocessor models/trained/preprocessor.pkl
          docker run --rm -v "${{ github.workspace }}:/work" -w /work $IMG \
            python src/models/train_model.py --config configs/model_config.yaml --data data/processed/featured_house_data.csv --models-dir models

      - name: Regenerate baseline_stats.json
        run: |
          set -euo pipefail
          docker run --rm -v "${{ github.workspace }}:/work" -w /work \
            docker.io/${{ vars.DOCKERHUB_USERNAME }}/house-price-model:${TAG} \
            python scripts/make_baseline.py

      - name: Verify artifacts
        run: |
          set -euo pipefail
          test -f models/trained/house_price_model.pkl
          test -f models/trained/preprocessor.pkl
          test -f src/api/baseline_stats.json

      - name: Rebuild image with the new model
        uses: docker/build-push-action@v6
        with:
          context: .
          file: Dockerfile
          tags: docker.io/${{ vars.DOCKERHUB_USERNAME }}/house-price-model:${{ env.TAG }}
          load: true
          push: false

      - name: Push image
        run: docker push docker.io/${{ vars.DOCKERHUB_USERNAME }}/house-price-model:${TAG}

      - name: Install kustomize
        run: |
          set -euo pipefail
          curl -fsSL -o kustomize.tar.gz https://github.com/kubernetes-sigs/kustomize/releases/download/kustomize%2Fv5.4.3/kustomize_v5.4.3_linux_amd64.tar.gz
          tar -xzf kustomize.tar.gz
          sudo mv kustomize /usr/local/bin/kustomize

      - name: Update the staging image tag
        run: |
          set -euo pipefail
          cd deployment/gitops/overlays/staging
          kustomize edit set image docker.io/${{ vars.DOCKERHUB_USERNAME }}/house-price-model=docker.io/${{ vars.DOCKERHUB_USERNAME }}/house-price-model:${{ env.TAG }}

      - name: Commit and push
        run: |
          set -euo pipefail
          git config user.name "github-actions"
          git config user.email "actions@github.com"
          git add deployment/gitops/overlays/staging
          git commit -m "auto: retrain deploy ${TAG}" || echo "No changes"
          git push origin main
```

### Reading the important parts

**The `drift_check` job is a gate, not a trigger.** The cron fires daily, but the second job runs
only when drift is genuinely above threshold, or when a human forces it with the
`workflow_dispatch` input. That `force` input matters more than it looks. You need a way to
retrain deliberately, for instance after adding new training data.

**`or on() vector(0)` in the PromQL again.** Same discipline as Labs 11 and 13. If Prometheus has
no data, the query returns zero rather than nothing, `jq` finds a value, and the job decides "no
retrain" rather than crashing.

**`max_over_time(...[15m])`** looks at a window, not an instant. Drift at the moment of the scrape
could be a single odd request. Over fifteen minutes it is a pattern.

**Training happens *inside* the image.** The same container that will serve the model is the one
that trains it, so the library versions used at training time are exactly those used at inference
time. This removes an entire class of "works in CI, fails in production" bugs.

**The baseline is regenerated in the same run.** This is the step people forget, and forgetting it
is subtle. The whole point of retraining is to teach the model the new distribution. If you leave
the old baseline in place, the new model immediately reports massive drift against data it now
handles perfectly well, and your gates block a release that was correct.

**`Verify artifacts` before pushing.** Three `test -f` lines. Cheap, and they stop a broken image
reaching the registry when a training step failed quietly.

**The pipeline commits back to Git. It never touches the cluster.** `kustomize edit set image`
rewrites the overlay, and the commit is the deploy trigger. Argo CD notices and syncs.

**`concurrency` with `cancel-in-progress: false`** stops two retrains racing. You do not want two
runs pushing different image tags to the same overlay.

## PART III - Why the last step stays human

The loop stops short of full automation, on purpose. Argo CD deploys the candidate to preview and
the gates evaluate it, but a person still runs `promote`.

That is a deliberate choice, not a missing feature.

Automation should **propose**. A human should **approve**, for as long as the model affects real
outcomes. The gates already rule out the obvious failures, so the human is not checking latency
by hand. They are answering the question no metric can answer, which is whether the new behaviour
is what the business actually wants.

There is also a practical argument. You want to watch the loop fail a few times before you trust
it to run unattended. Observe, stabilise, then automate. In that order.

When you are ready to remove the human, `autoPromotionEnabled: true` on the staging overlay only
is the sensible first step. Leave production manual for a lot longer.

## PART IV - Reaching Prometheus from GitHub Actions

There is a problem with running this for real on a KIND cluster: GitHub's runners cannot reach
`localhost:30300` on your laptop.

You have three options.

**Run the workflow locally with `act`**, so it executes on your machine and can reach your
cluster.

**Expose Prometheus temporarily** with a tunnel, and put the URL in the `PROM_URL` secret. Fine
for a demo, not something to leave running.

**Simulate the drift check.** Skip the real query, set `drift_value` by hand, and trigger the
workflow with `force: true`. This is the honest option for a laptop cluster and it exercises
every other step.

```
gh workflow run retrain-and-deploy.yaml -f force=true
```

`in a real environment Prometheus would be reachable from your CI, and the drift_check job would work as written`

**Add** the secret if you have a reachable Prometheus.

```
gh secret set PROM_URL --body "https://prometheus.your-domain.example"
```

## PART V - Running one full cycle

Let's watch the whole loop.

**T1, create drift.** Send drifted payloads at the staging active service.

```
kubectl -n model-staging port-forward svc/model-active 8000:8000
```

```
for i in $(seq 1 200); do
  curl -s -X POST http://localhost:8000/predict \
    -H "Content-Type: application/json" -d @drifted.json > /dev/null
done
```

**Verify** the signal in Prometheus.

```
max_over_time(model_drift_score{namespace="model-staging"}[15m])
```

```
increase(model_drift_high_total{namespace="model-staging"}[5m])
```

Check your Grafana drift panel too. You should see a clear spike.

**T2, trigger the retrain.**

```
gh workflow run retrain-and-deploy.yaml -f force=true
gh run watch
```

Follow the job. Train, regenerate baseline, verify, push, `kustomize edit`, commit.

**Verify** the commit landed.

```
git fetch origin main
git log origin/main --oneline -3
```

You should see an `auto: retrain deploy sha-...` commit. Look at the diff, and confirm it touched
exactly one line of the staging overlay.

**T3, watch Argo CD and the Rollout.**

```
kubectl -n model-staging argo rollouts get rollout model --watch
```

```
kubectl -n model-staging get analysisrun --watch
```

A preview ReplicaSet appears. The PrePromotion AnalysisRun starts. Drive a little traffic at the
preview service so the gates have data, then wait for the verdict.

**T4, promote.**

```
kubectl argo rollouts promote model -n model-staging
```

Watch PostPromotion analysis run against the active service.

**T5, confirm drift normalised.**

```
curl -s http://localhost:8000/drift
```

The score should now be low again, even for data that was drifted before, because the baseline
was regenerated from the new training data. That return to near-zero is the loop closing.

#### Observe

Look at the drift panel across the whole cycle. You should see a flat line, a spike, a period of
elevated values while the retrain runs, and a return to flat.

Now ask the harder question. The drift went away because the baseline moved, not because the
world went back to normal. Is that always the right response?

Not necessarily. If the new data is genuinely the new normal, retraining is correct. If the new
data is a bug in an upstream system sending garbage, you have just trained your model on garbage
and told it that garbage is normal. The drift metric cannot tell those apart. **A human still has
to ask why the data changed.**

## Exercise

Make the loop prove it did the right thing.

  * Before the retrain, record the model's score on a held-out test set
  * Have the workflow record the new model's score on the same test set
  * Add a step that fails the build if the new model is worse than the old one by more than a
    small margin
  * Trigger a retrain with deliberately bad training data and confirm the build fails

Right now your loop validates that the new model is *fast* and *not drifting*. It never checks
that it is *accurate*. That is the biggest gap left in this system.

## Cleanup

Keep the platform. This is the finished system.

To stop the nightly cron while you are not working on it, comment out the `schedule` block, or
disable the workflow.

```
gh workflow disable retrain-and-deploy.yaml
```

If your laptop is struggling, scale staging down and leave production running.

```
kubectl -n model-staging scale rollout model --replicas=1
```

#### Summary

In this lab you closed the loop. Drift in production triggers a retrain, the retrain produces a
new model and a matching baseline, the pipeline commits the new image tag to Git, Argo CD deploys
it as a preview, the gates evaluate it, and a human promotes it.

Production behaviour now influences retraining. Retraining influences deployment. Deployment is
validated before traffic shifts. And validation prevents regressions.

The pieces that made it work were unglamorous. Retraining gated on evidence rather than a
calendar. Regenerating the baseline in the same run as the model. Verifying artifacts before
publishing. The pipeline writing a commit instead of running `kubectl`. And a human on the last
step, on purpose.

You also saw the loop's blind spot. It knows whether the model is fast, healthy and seeing
familiar data. It does not know whether the model is *right*, and the exercise above is how you
would start fixing that.

That is the end of the build. What you have is not a collection of Kubernetes objects and
pipelines. It is a control loop, and every movement in it is measurable, every promotion is
justified, and every rollback is explainable.

##### Reading List

  * [GitHub Actions scheduled workflows](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#schedule)
  * [GitHub Actions concurrency](https://docs.github.com/en/actions/using-jobs/using-concurrency)
  * [Prometheus HTTP query API](https://prometheus.io/docs/prometheus/latest/querying/api/)
  * [kustomize edit set image](https://kubectl.docs.kubernetes.io/references/kustomize/cmd/edit_set_image/)
  * [act — run GitHub Actions locally](https://github.com/nektos/act)
  * [Continuous delivery for machine learning](https://martinfowler.com/articles/cd4ml.html)

## Search Keywords

  * retraining trigger drift threshold
  * github actions query prometheus api curl jq
  * github actions job outputs conditional if
  * workflow_dispatch boolean input force
  * train model inside docker image ci
  * kustomize edit set image pipeline commit
  * gitops pipeline commits back to repo
  * argo rollouts promote human in the loop
  * closed loop mlops control loop

## Mini Project

Build the accuracy gate the Exercise pointed at, and make it the fourth gate in the system.

You are asked to stop a worse model from ever being promoted, automatically.

Requirements,

  * a held-out evaluation set that is never used for training, committed to the repository
  * the retraining workflow scores both the outgoing and the incoming model on that set
  * the score is published as a Prometheus metric from the model service
  * an AnalysisTemplate measurement gates promotion on it, so a model that scores meaningfully
    worse than the one it replaces cannot reach the active service
  * the threshold is derived from observed run-to-run variation, not guessed, and the derivation
    is written down
  * a deliberately worse model is blocked, and you have the AnalysisRun output proving it

No walkthrough. You have every technique you need across Labs 11, 13 and 14.
