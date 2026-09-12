---
sidebar_position: 3
title: "Lab: Gating Promotions on Real Metrics"
---
# Gating Promotions on Real Metrics

In Lab 10 you decided whether a candidate was good by looking at it. That works while you are
watching. It does not work at three in the morning, and it does not work when there are twenty
models instead of one.

In this lab you would hand that judgement to Prometheus. The Rollout would run a set of queries
against the preview version, and promotion would happen only if the numbers pass. If they do
not, the rollout halts and the stable version keeps serving.

Along the way you would meet the problem that makes most people give up on metric gates, which
is a gate that fails when nothing is wrong.

## What will you learn

  * How an `AnalysisTemplate` turns a Prometheus query into a pass or fail decision
  * The difference between pre-promotion and post-promotion analysis, and why you want both
  * Three gates worth having: p95 latency, error rate, and a traffic floor
  * Why `histogram_quantile()` returns `NaN` at low traffic, and how to guard against it
  * Why an idle service passes a naive latency gate, and what to do about it
  * How to generate synthetic traffic so a staging environment has enough signal to judge

## Pre Requisites

Lab 10 finished, with the model running as a Rollout.

```
kubectl argo rollouts get rollout model
```

Prometheus scraping the model, from Lab 7.

```
kubectl get servicemonitor
```

Open [http://localhost:30300/targets](http://localhost:30300/targets) and confirm your model
targets are `UP` before you go any further. Every gate in this lab reads from Prometheus. If
Prometheus has no data, every gate fails and you would waste an hour looking in the wrong place.

## Where analysis fits in a rollout

```bash
   new image in the release branch
              |
              v
      preview pods come up
              |
              v
   +---------------------------+
   |  PrePromotion AnalysisRun |   queries Prometheus against model-preview
   +------------+--------------+
                |
        pass ---+--- fail ---> rollout degraded, active untouched
         |
         v
    human promotes
         |
         v
   active service repointed
         |
         v
   +----------------------------+
   | PostPromotion AnalysisRun  |   queries Prometheus against model-active
   +------------+---------------+
                |
        pass ---+--- fail ---> rollback to the previous revision
         |
         v
    rollout complete
```

Both halves matter. Pre-promotion asks "is the candidate healthy before we give it users".
Post-promotion asks "now that it has real traffic, is it still healthy". A model can pass the
first and fail the second, because synthetic traffic is never quite like the real thing.

## PART I - The problem nobody warns you about

Before writing a single gate, let's look at why the obvious query is wrong.

The natural way to express a p95 latency gate is the same query you put on your Grafana
dashboard in Lab 7.

```
histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket[2m])))
```

**Run** it in Prometheus at [http://localhost:30300/](http://localhost:30300/) right now, while
your preview pods are up but nothing is calling them.

You would get `NaN`, or no data at all.

Here is why. A histogram quantile is computed from bucket counts. With no requests in the last
two minutes, every bucket rate is zero, and the quantile of nothing is undefined. Prometheus
returns `NaN`.

Now think about what that does to a gate. Your success condition says `result[0] < 0.50`. A
comparison against `NaN` is false. So the gate fails. The rollout halts. You go and look at the
candidate, and the candidate is completely fine. It was just idle.

This is the single most common reason people abandon metric-gated deployments. The gates cry
wolf in exactly the environments where they matter most, which is staging, where traffic is
thin.

There is a second, opposite failure. Suppose you guard against `NaN` by defaulting to zero.
Now an idle service reports a latency of zero, which is below your threshold, so the gate
passes. A service that is completely dead now passes your health check.

So you need two things at once. A query that does not return `NaN` when idle, and a separate
check that there was enough traffic for the answer to mean anything.

#### Observe

Try it yourself. With no traffic, run these two in Prometheus and compare.

```
histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket[2m])))
```

```
sum(rate(http_request_duration_seconds_count[2m]))
```

The first is `NaN`. The second is `0`. The second one is the one that tells you the truth about
whether you can trust the first.

## PART II - A traffic-safe query

The guard has two parts. Multiply the quantile by a condition that is only true when traffic
exists, then fall back to an explicit zero when the whole expression is empty.

```
(
  histogram_quantile(
    0.95,
    sum by (le) (rate(http_request_duration_seconds_bucket{...}[2m]))
  )
  *
  on() group_left()
  (
    sum(rate(http_request_duration_seconds_count{...}[2m])) > 0
  )
) or on() vector(0)
```

Read it from the inside out.

**`sum(rate(..._count[2m])) > 0`** is a filter. In PromQL a comparison keeps the sample when
true and drops it when false. So this produces one sample when there has been traffic, and
nothing at all when there has not.

**`* on() group_left()`** multiplies the quantile by that sample. `on()` means match on no
labels, that is treat both sides as scalars. `group_left()` allows the many-to-one match. When
the right side is empty, the multiplication produces nothing.

**`or on() vector(0)`** supplies a value when the left side produced nothing. So an idle
service returns `0` rather than `NaN`.

That kills the false failure. It does not fix the dead-service case, and that is what the
traffic floor gate is for.

## PART III - Writing the AnalysisTemplate

An `AnalysisTemplate` is a named, reusable set of measurements. The Rollout references it, and
Argo creates an `AnalysisRun` from it at rollout time.

`file: deployment/kubernetes/analysis-template.yaml`

```
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: model-gate-latency-errors
spec:
  args:
    - name: namespace
    - name: service

  metrics:
    - name: p95-latency-seconds
      interval: 30s
      count: 5
      failureLimit: 1
      provider:
        prometheus:
          address: http://prom-kube-prometheus-stack-prometheus.monitoring.svc:9090
          query: |
            (
              histogram_quantile(
                0.95,
                sum by (le) (
                  rate(http_request_duration_seconds_bucket{
                    namespace="{{args.namespace}}",
                    service="{{args.service}}"
                  }[2m])
                )
              )
              *
              on() group_left()
              (
                sum(rate(http_request_duration_seconds_count{
                  namespace="{{args.namespace}}",
                  service="{{args.service}}"
                }[2m])) > 0
              )
            ) or on() vector(0)
      successCondition: len(result) > 0 && result[0] < 0.50

    - name: http-5xx-rate
      interval: 30s
      count: 5
      failureLimit: 1
      provider:
        prometheus:
          address: http://prom-kube-prometheus-stack-prometheus.monitoring.svc:9090
          query: |
            (
              sum(rate(http_requests_total{
                namespace="{{args.namespace}}",
                service="{{args.service}}",
                status=~"5.."
              }[2m]))
              /
              clamp_min(
                sum(rate(http_requests_total{
                  namespace="{{args.namespace}}",
                  service="{{args.service}}"
                }[2m])),
                1
              )
            ) or on() vector(0)
      successCondition: len(result) > 0 && result[0] < 0.01

    - name: min-rps
      interval: 30s
      count: 5
      failureLimit: 1
      provider:
        prometheus:
          address: http://prom-kube-prometheus-stack-prometheus.monitoring.svc:9090
          query: |
            sum(rate(http_requests_total{
              namespace="{{args.namespace}}",
              service="{{args.service}}"
            }[2m])) or on() vector(0)
      successCondition: len(result) > 0
```

`the serverAddress here assumes Prometheus is in the monitoring namespace, as installed in Lab 7. Check yours with kubectl get svc -n monitoring`

Three measurements, and each one is doing a different job.

**p95-latency-seconds** is the traffic-safe query from PART II. It runs every 30 seconds, five
times, and tolerates one failure. Tolerating one failure matters, because a single scrape can
land badly and you do not want one unlucky sample to block a release.

**http-5xx-rate** is the fraction of requests returning a 5xx. Note `clamp_min(..., 1)` on the
denominator. Without it, zero traffic gives you zero divided by zero, which is `NaN` again, and
you are back to the same bug in a different shape.

**min-rps** is the traffic floor. This is the gate that catches the dead service. It does not
care about the value, only that a result came back at all.

### Reading a success condition

`successCondition` is an expression, not just a number. `len(result) > 0` guards against an
empty result, and `result[0] < 0.50` checks the value. Both halves are needed. Drop the first
and an empty result would throw rather than fail cleanly.

### Wiring it into the Rollout

**Add** the analysis blocks to the blue/green strategy.

`file: deployment/kubernetes/model-rollout.yaml`

```
  strategy:
    blueGreen:
      activeService: model-active
      previewService: model-preview
      autoPromotionEnabled: false
      abortScaleDownDelaySeconds: 60

      prePromotionAnalysis:
        templates:
          - templateName: model-gate-latency-errors
        args:
          - name: namespace
            value: default
          - name: service
            value: model-preview

      postPromotionAnalysis:
        templates:
          - templateName: model-gate-latency-errors
        args:
          - name: namespace
            value: default
          - name: service
            value: model-active
```

Same template, different arguments. Before promotion it measures `model-preview`. After
promotion it measures `model-active`. That is the whole reason the template takes `service` as
an argument instead of hard coding it.

**Add** the template to the kustomization and push it through the pull request flow.

```
git add deployment/kubernetes
git commit -am "gate model promotion on latency, error rate and a traffic floor"
git push origin main
```

## PART IV - Giving staging something to measure

Your preview pods receive no traffic, because no user knows they exist. So the traffic floor
gate would fail every single time.

The fix is to generate a small amount of synthetic traffic against both Services, continuously.

`file: deployment/kubernetes/synthetic-traffic-cronjob.yaml`

```
apiVersion: batch/v1
kind: CronJob
metadata:
  name: model-synthetic-traffic
  labels:
    app: model
spec:
  schedule: "*/1 * * * *"   # every minute
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 1
  failedJobsHistoryLimit: 1
  jobTemplate:
    spec:
      backoffLimit: 0
      template:
        metadata:
          labels:
            app: model
        spec:
          restartPolicy: Never
          containers:
            - name: curl
              image: curlimages/curl:8.6.0
              imagePullPolicy: IfNotPresent
              command:
                - sh
                - -lc
                - |
                  set -e
                  for svc in model-active model-preview; do
                    curl -sS -m 2 "http://${svc}:8000/health" \
                      -H "X-Synth: 1" \
                      >/dev/null || true
                  done
```

Two details are deliberate.

**It calls `/health`, not `/predict`.** Hitting `/predict` with fabricated payloads would pollute
the prediction distribution, and that same distribution is what Lab 12 uses to detect drift. You
would be generating your own false drift signal.

**It marks the request with an `X-Synth: 1` header.** You would use that in Lab 12 to tell
synthetic traffic apart from real traffic in the metrics.

**`concurrencyPolicy: Forbid`** stops jobs piling up if one hangs, and `|| true` stops a failed
curl from marking the job failed and filling your cluster with error events.

**Apply** it through the same pull request flow.

## PART V - Watching a gate do its job

**Ship** a candidate that is deliberately slow, the same trick as Lab 10.

`file: src/api/main.py`

```
@app.post("/predict", response_model=PredictionResponse)
async def predict(request: HousePredictionRequest):
    import time
    time.sleep(1.2)          # deliberately over the 0.5s gate, remove afterwards
    ...
```

Push it, let the pipeline build, merge into `release`.

**Watch** the rollout and the analysis run together.

```
kubectl argo rollouts get rollout model --watch
```

In a second terminal,

```
kubectl get analysisrun --watch
```

The preview pods come up. The AnalysisRun starts. It takes five measurements 30 seconds apart,
so give it around two and a half minutes.

Meanwhile, drive some traffic at the preview Service so the latency gate has something to
measure.

```
kubectl port-forward svc/model-preview 8100:8000
```

```
hey -z 2m -c 5 -m POST -H "Content-Type: application/json" \
  -D predict.json http://localhost:8100/predict
```

**Verify** the gate caught it.

```
kubectl get analysisrun
kubectl describe analysisrun <name>
```

The describe output shows each measurement, its value, and whether it passed. You should see the
p95 latency measurement sitting well above 0.50 and the run marked `Failed`.

**Confirm** production was never touched.

```
kubectl argo rollouts get rollout model
```

The rollout is degraded. The active Service is still on the previous revision. Nobody got the
slow model.

`remove the time.sleep line and push again before moving on`

#### Observe

Now run the opposite experiment. Delete the synthetic traffic CronJob, ship a perfectly good
candidate, and watch what the `min-rps` gate does.

```
kubectl delete cronjob model-synthetic-traffic
```

The candidate is healthy. The latency gate returns `0` because of the `or on() vector(0)`
fallback, so it passes. But `min-rps` returns nothing, so the gate fails and the promotion is
blocked.

Is that the right behaviour? Yes. The system is telling you it cannot make a judgement, rather
than pretending everything is fine. A gate that cannot see should refuse to pass, not wave
things through.

Put the CronJob back before continuing.

## PART VI - A stricter gate after promotion

Pre-promotion and post-promotion do not have to use the same thresholds. After cutover the
service has real traffic, so you can afford to be stricter and you have better data.

There is also a subtlety about which latency metric to use.

`prometheus-fastapi-instrumentator` emits two latency histograms.
**`http_request_duration_seconds`** carries a `handler` label, so you can look at `/predict`
separately from `/health`, but it uses coarse buckets. **`http_request_duration_highr_seconds`**
has no `handler` label but uses high resolution buckets, so the quantile is more accurate.

For a per-endpoint gate, use the first. For an overall service SLO, the second gives a better
number.

`file: deployment/kubernetes/analysistemplate-slo-post.yaml`

```
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: model-slo-post
spec:
  args:
  - name: namespace
  - name: service

  metrics:
  - name: p95-latency
    interval: 30s
    count: 4
    failureLimit: 0
    provider:
      prometheus:
        address: http://prom-kube-prometheus-stack-prometheus.monitoring.svc:9090
        query: |
          (
            histogram_quantile(
              0.95,
              sum by (le) (
                rate(http_request_duration_highr_seconds_bucket{
                  namespace="{{args.namespace}}",
                  service="{{args.service}}"
                }[2m])
              )
            )
            *
            on() group_left()
            (
              sum(rate(http_request_duration_highr_seconds_count{
                namespace="{{args.namespace}}",
                service="{{args.service}}"
              }[2m])) > 0
            )
          ) or on() vector(0)
    successCondition: len(result) > 0 && result[0] < 0.25

  - name: min-rps-floor
    interval: 30s
    count: 4
    failureLimit: 0
    provider:
      prometheus:
        address: http://prom-kube-prometheus-stack-prometheus.monitoring.svc:9090
        query: |
          sum(
            rate(http_request_duration_highr_seconds_count{
              namespace="{{args.namespace}}",
              service="{{args.service}}"
            }[2m])
          ) or on() vector(0)
    successCondition: len(result) > 0 && (result[0] == 0 || result[0] >= 0.005)
```

Two differences from the pre-promotion template are worth reading.

**`failureLimit: 0`** means no tolerance. After cutover, real users are affected, so a single
bad measurement is enough to trigger a rollback.

**The `min-rps-floor` success condition** allows either exactly zero or at least 0.005 requests
per second. That looks strange until you think about the genuinely idle case. Zero traffic is
accepted as "no opinion", but a trickle below the floor is treated as a broken service. It is a
judgement call, and you may want it stricter in production.

**Point** post-promotion analysis at the new template.

`file: deployment/kubernetes/model-rollout.yaml`

```
      postPromotionAnalysis:
        templates:
          - templateName: model-slo-post
        args:
          - name: namespace
            value: default
          - name: service
            value: model-active
```

Push it through, and **verify** on the next release that two different AnalysisRuns appear, one
before promotion and one after.

```
kubectl get analysisrun --sort-by=.metadata.creationTimestamp
```

## Exercise

Derive your own thresholds instead of using the ones in this lab.

  * Run a load test against the current stable model for five minutes
  * From Grafana, record the p95 latency and the error rate under that load
  * Set the pre-promotion latency threshold about 50 percent above the observed p95
  * Set the post-promotion threshold about 20 percent above it
  * Write one sentence for each threshold explaining where the number came from

The numbers in this lab are examples. A threshold you cannot justify is a threshold that will
either block good releases or wave bad ones through, and you will not know which.

## Cleanup

Keep everything. Lab 12 adds drift metrics to this same template.

If a rollout is stuck degraded from an experiment, abort it and let the stable version continue.

```
kubectl argo rollouts abort model
```

To clear out old analysis runs,

```
kubectl delete analysisrun --all
```

`that only deletes the records. It does not affect what is running`

#### Summary

In this lab you turned promotion from a judgement call into a measurement. You wrote an
AnalysisTemplate with three gates, a latency gate, an error rate gate and a traffic floor, and
wired it into both the pre-promotion and post-promotion stages of the Rollout.

The important part was not the YAML. It was understanding that `histogram_quantile()` returns
`NaN` when there is no traffic, that a naive gate therefore fails when nothing is wrong, and
that guarding against it naively creates the opposite bug where a dead service passes. The
traffic-safe query plus a separate traffic floor handles both.

You also learned why staging needs synthetic traffic before any of this can work, and why that
traffic must avoid `/predict`.

Your gates now measure whether the service is fast and whether it is erroring. They say nothing
about whether the model is still *right*. A model can be fast, return 200 for every request, and
be quietly wrong because the world changed underneath it. That is drift, and it is Lab 12.

##### Reading List

  * [Argo Rollouts analysis and progressive delivery](https://argo-rollouts.readthedocs.io/en/stable/features/analysis/)
  * [AnalysisTemplate specification](https://argo-rollouts.readthedocs.io/en/stable/features/specification/#analysis)
  * [Prometheus histograms and quantiles](https://prometheus.io/docs/practices/histograms/)
  * [PromQL operators, including group_left](https://prometheus.io/docs/prometheus/latest/querying/operators/)
  * [prometheus-fastapi-instrumentator metrics](https://github.com/trallnag/prometheus-fastapi-instrumentator)
  * [Kubernetes CronJob](https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/)

## Search Keywords

  * argo rollouts analysistemplate prometheus
  * prepromotion postpromotion analysis
  * histogram_quantile NaN no traffic
  * promql or on vector 0 fallback
  * promql group_left scalar multiply
  * clamp_min divide by zero promql
  * argo rollouts successCondition len result
  * synthetic traffic cronjob kubernetes
  * http_request_duration_highr_seconds
