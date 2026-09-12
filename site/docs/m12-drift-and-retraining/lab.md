---
sidebar_position: 2
title: "Lab: Detecting Drift — Is the Model Still Seeing the World it was Trained On?"
---
# Detecting Drift — Is the Model Still Seeing the World it was Trained On?

Every gate you have built so far measures the *service*. Is it fast, is it erroring, is anyone
calling it. All three can be perfectly green while the model is quietly wrong.

Models do not fail like software. They fail like a weather forecast that was written for last
year. The code is fine. The predictions are fine-looking numbers. But the houses coming in are
no longer the houses the model learned from, and nobody notices for six months.

In this lab you would make the model report on the data it is receiving, compare it against what
it was trained on, and turn the difference into a number you can alert on and gate releases with.

## What will you learn

  * What drift is, and why it is invisible to every check you have built so far
  * Why the baseline has to be captured in the transformed feature space, not the raw one
  * How a z-score turns "this value looks unusual" into a number
  * Why the mean of the top few z-scores beats the mean of all of them
  * Three metrics to export, and why one of them is about your own misconfiguration
  * How to alert on drift, and how to gate a promotion on it

## Pre Requisites

Labs 10 to 12 finished. Two environments running, gated rollouts working.

```
kubectl get applications -n argocd
kubectl -n model-staging argo rollouts get rollout model
```

You also need the trained model and the preprocessor from Lab 3, in the repository.

```
ls models/trained/
```

## What drift actually is

Your model learned a relationship from the training data. Houses of this size, in this
neighbourhood, of this age, sell for about this much.

That relationship holds while the incoming data looks like the training data. When it stops
looking like the training data, the model keeps answering confidently and starts being wrong.

```bash
   TRAINING TIME                      LATER, IN PRODUCTION

   sqft:      1200 - 2400             sqft:      3800 - 6500
   year:      1960 - 2010             year:      2019 - 2024
   location:  mostly suburban         location:  mostly urban
        |                                  |
        v                                  v
   model learns this shape            model still answers
                                      but has never seen this shape
```

Nothing crashes. Latency is unchanged. Every request returns 200. Your existing gates all pass.

The only way to see it is to measure the shape of the incoming data and compare it against the
shape you trained on.

## PART I - Capturing a baseline

Here is the part that is easy to get subtly wrong.

Your model does not see `sqft = 1500` and `location = "suburban"`. It sees whatever comes out of
`preprocessor.transform()`, which is a vector of scaled numbers and one-hot columns. That is the
space the model actually learned in.

So the baseline must be captured **in the transformed space too**. Compare raw values against
transformed statistics and every number is meaningless.

**Write** the baseline generator.

`file: scripts/make_baseline.py`

```
"""Generate src/api/baseline_stats.json for drift detection.

Creates mean/std in the *transformed model feature space*.

Matches inference:
  - load preprocessor.pkl
  - add engineered columns (house_age, bed_bath_ratio, price_per_sqft)
  - preprocessor.transform(...)
"""

import json
import joblib
import numpy as np
import pandas as pd
from datetime import datetime

DATA_PATH = "data/raw/house_data.csv"
PREPROCESSOR_PATH = "models/trained/preprocessor.pkl"
OUT_PATH = "src/api/baseline_stats.json"


def main() -> None:
    df = pd.read_csv(DATA_PATH)

    required = ["sqft", "bedrooms", "bathrooms", "location", "year_built", "condition"]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise RuntimeError(
            f"Missing columns in {DATA_PATH}: {missing}\nColumns are: {df.columns.tolist()}"
        )

    # Match inference feature engineering
    df = df.copy()
    df["house_age"] = datetime.now().year - df["year_built"]
    df["bed_bath_ratio"] = df["bedrooms"] / df["bathrooms"].replace(0, np.nan)
    df["bed_bath_ratio"] = df["bed_bath_ratio"].fillna(0)
    df["price_per_sqft"] = 0  # dummy compatibility feature

    preprocessor = joblib.load(PREPROCESSOR_PATH)
    X = preprocessor.transform(df)

    # Convert sparse to dense
    if hasattr(X, "toarray"):
        X = X.toarray()
    X = np.asarray(X)

    means = X.mean(axis=0)
    stds = X.std(axis=0, ddof=0)
    stds = np.where(stds < 1e-9, 1e-9, stds)

    features = [str(i) for i in range(X.shape[1])]
    baseline = {
        f: {"mean": float(means[i]), "std": float(stds[i])}
        for i, f in enumerate(features)
    }

    with open(OUT_PATH, "w", encoding="utf-8") as fp:
        json.dump({"features": features, "baseline": baseline}, fp, indent=2)

    print(f"✅ wrote {OUT_PATH} with {X.shape[1]} features")


if __name__ == "__main__":
    main()
```

Two lines deserve a second look.

**The feature engineering block is duplicated from the inference path on purpose.** It has to
match exactly. If inference computes `house_age` one way and the baseline computes it another,
your drift score measures the difference between your two code paths rather than anything about
the data. This duplication is a real weakness, and the exercise at the end asks you to deal with
it.

**`stds = np.where(stds < 1e-9, 1e-9, stds)`** guards against a constant feature. A one-hot
column that is the same value in every training row has a standard deviation of zero, and
dividing by it gives infinity. Clamping it to a tiny number keeps the arithmetic sane.

**Run** it.

```
python scripts/make_baseline.py
```

**Verify** the output.

```
ls -la src/api/baseline_stats.json
python -c "import json;d=json.load(open('src/api/baseline_stats.json'));print(len(d['features']),'features')"
```

The feature count should match the transformed width from Lab 3, which was 18.

## PART II - Scoring drift at request time

Now the runtime half. For each prediction, compare the transformed feature vector against the
baseline and produce one number.

The measure is the **z-score**, which is nothing but how many standard deviations a value sits
away from the mean.

```
  z = | (x - mu) / sigma |

  where,
    x      = the incoming feature value
    mu     = the training mean for that feature
    sigma  = the training standard deviation for that feature
    | |    = magnitude only. We do not care which direction
```

Read it as a table.

| z | What it means |
|---|---|
| 0 | identical to the training mean |
| 1 | one standard deviation away, completely normal |
| 2 | a moderate shift |
| 3 | a strong anomaly |
| 5+ | extreme, almost certainly outside what the model learned |

**Write** the drift module.

`file: src/api/drift.py`

```
"""
Simple online drift metric exported to Prometheus.

We compute a single scalar drift score as the average absolute z-score across the
TRANSFORMED feature vector (the exact feature space your model sees).

If baseline stats are missing, we DO NOT crash the API; we expose a metric flag
`model_drift_baseline_loaded` so you can alert on misconfiguration.
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict

from prometheus_client import Counter, Gauge

DRIFT_SCORE = Gauge(
    "model_drift_score",
    "Avg abs z-score across transformed model features vs training baseline.",
)

DRIFT_HIGH_TOTAL = Counter(
    "model_drift_high_total",
    "Count of requests where drift score exceeded threshold.",
)

DRIFT_HIGH_THRESHOLD = Gauge(
    "model_drift_high_threshold",
    "Threshold used to increment model_drift_high_total.",
)

BASELINE_LOADED = Gauge(
    "model_drift_baseline_loaded",
    "1 if baseline_stats.json loaded successfully, else 0.",
)

DRIFT_THRESHOLD = float(os.getenv("DRIFT_THRESHOLD", "3.0"))
DRIFT_HIGH_THRESHOLD.set(DRIFT_THRESHOLD)
BASELINE_PATH = os.getenv("BASELINE_PATH", "baseline_stats.json")


def _safe_load_baseline(path: str) -> Dict[str, Any] | None:
    try:
        with open(path, "r", encoding="utf-8") as fp:
            baseline = json.load(fp)
        if "features" not in baseline or "baseline" not in baseline:
            return None
        return baseline
    except FileNotFoundError:
        return None
    except Exception:
        return None


_BASELINE: Dict[str, Any] | None = _safe_load_baseline(BASELINE_PATH)
BASELINE_LOADED.set(1 if _BASELINE is not None else 0)


def record_drift_metrics(processed_features) -> float:
    """
    Record drift metrics from the output of `preprocessor.transform(...)`.

    `processed_features` may be a sparse matrix or dense array. We use the first row.
    """
    DRIFT_HIGH_THRESHOLD.set(DRIFT_THRESHOLD)

    if _BASELINE is None:
        DRIFT_SCORE.set(0.0)
        return 0.0

    features = _BASELINE["features"]
    stats = _BASELINE["baseline"]

    row = processed_features[0]

    if hasattr(row, "toarray"):
        row = row.toarray()[0]
    if hasattr(row, "ravel"):
        row = row.ravel()

    zscores = []
    for i, f in enumerate(features):
        try:
            x = float(row[i])
            mu = float(stats[f]["mean"])
            sigma = float(stats[f]["std"]) or 1e-9
            zscores.append(abs((x - mu) / sigma))
        except Exception:
            continue

    # Make score responsive: mean of top-K z-scores (dramatic, still stable)
    if not zscores:
        score = 0.0
    else:
        zscores.sort(reverse=True)
        k = min(25, len(zscores))
        score = sum(zscores[:k]) / float(k)
    DRIFT_SCORE.set(score)

    if score >= DRIFT_THRESHOLD:
        DRIFT_HIGH_TOTAL.inc()

    return score
```

### Why three metrics, not one

**`model_drift_score`** is a gauge. The current drift level. This is what you put on a dashboard.

**`model_drift_high_total`** is a counter. How many requests crossed the threshold. A counter is
better than a gauge for alerting, because you can ask "how many in the last five minutes" and get
a stable answer, where a gauge only tells you about the instant it was scraped.

**`model_drift_baseline_loaded`** is the one people leave out, and it is the most important of
the three. If the baseline file is missing, the code does not crash. It reports a drift score of
zero, forever. A dashboard showing a flat zero looks like a perfectly healthy model, and it is
actually a broken monitor.

So the code exports a flag saying whether it managed to load its own configuration. **Alert on
your own instrumentation being broken, not only on the thing it measures.** That habit is what
separates monitoring that works from monitoring that looks like it works.

### Why the top-K average

The obvious score is the mean z-score across all features. It does not work.

Your transformed vector has 18 features, and most of a drifting request looks completely normal.
If two features are wildly off and sixteen are fine, averaging all eighteen divides that signal
by nine and buries it. The score barely moves, and your threshold never fires.

Taking the mean of the top K, here at most 25, keeps the signal responsive while still averaging
across enough features that one noisy value cannot swing it alone. With 18 features, `min(25, 18)`
is 18, so this particular model averages all of them. The cap matters once your feature count
grows.

`this is a design choice, not a law. Try both on your own data and see which one moves when you expect it to`

### Hooking it into the API

`file: src/api/main.py`

```
from drift import record_drift_metrics
```

Call it inside the predict path, right after the preprocessor runs and before returning. The
exact placement depends on your `inference.py`, but the rule is simple: it needs the transformed
vector, which is the same thing the model is about to receive.

**Add** a small endpoint so you can read the current state without scraping Prometheus.

`file: src/api/main.py`

```
@app.get("/drift", response_model=dict)
async def drift_status():
    """JSON drift snapshot for quick checks and for the Streamlit UI."""
    return {
        "drift_score": DRIFT_SCORE._value.get(),
        "drift_threshold": DRIFT_THRESHOLD,
        "baseline_loaded": BASELINE_LOADED._value.get(),
    }
```

**Set** the threshold per environment in the Rollout. You already added the env var in Lab 10.

```
          env:
            - name: DRIFT_THRESHOLD
              value: "1.5"
```

Commit, let the pipeline build, and deploy to staging.

**Verify** the metrics are being exported.

```
kubectl -n model-staging port-forward svc/model-active 8000:8000
```

```
curl -s http://localhost:8000/metrics | grep model_drift
```

You should see all four metric names. Check `model_drift_baseline_loaded` is `1`. If it is `0`,
the baseline file did not make it into the image, and every drift number from here on would be
meaningless.

## PART III - Making drift visible

**Send** a few normal predictions and watch the score.

```
curl -s -X POST http://localhost:8000/predict \
  -H "Content-Type: application/json" -d @predict.json
curl -s http://localhost:8000/drift
```

The score should be low. Now **send** something the model has never seen.

`file: drifted.json`

```
{
  "sqft": 98000,
  "bedrooms": 42,
  "bathrooms": 31,
  "year_built": 1802,
  "condition": "Poor",
  "location": "Rural"
}
```

```
for i in $(seq 1 20); do
  curl -s -X POST http://localhost:8000/predict \
    -H "Content-Type: application/json" -d @drifted.json > /dev/null
done
curl -s http://localhost:8000/drift
```

The score should jump sharply, and `model_drift_high_total` should be climbing.

#### Observe

Look at the prediction the drifted request returned. Did the API refuse it? Did it error? Did it
warn you?

No. It returned a confident number for a 98,000 square foot house with 42 bedrooms built in 1802.
That is the entire point of this lab. Without the drift metric, nothing in your stack had any
opinion about that request at all.

### A dashboard panel and an alert

**Add** a drift panel to the Grafana dashboard from Lab 7, using `model_drift_score`.

Then **write** recording rules and alerts.

`file: deployment/gitops/base/model/prometheusrule-model-drift.yaml`

```
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: model-drift-rules
  labels:
    release: prom
spec:
  groups:
  - name: model.drift.recording
    rules:
    - record: model:drift_high_ratio:rate5m
      expr: |
        (
          sum(rate(model_drift_high_total[5m]))
          /
          clamp_min(
            sum(rate(http_requests_total{handler="/predict",status="2xx"}[5m])),
            1
          )
        ) or on() vector(0)

  - name: model.drift.alerts
    rules:
    - alert: ModelDriftWarning
      expr: |
        avg_over_time(model:drift_high_ratio:rate5m[30m]) > 0.05
      for: 10m
      labels:
        severity: warning
      annotations:
        summary: "Model drift warning"
        description: "Drift-high ratio sustained above 5%."

    - alert: ModelDriftTriggered
      expr: |
        avg_over_time(model:drift_high_ratio:rate5m[60m]) > 0.15
      for: 10m
      labels:
        severity: critical
      annotations:
        summary: "Model drift triggered"
        description: "Drift-high ratio sustained above 15% (candidate retraining trigger)."
```

The alert is on a **ratio**, not a raw count. Ten drifted requests out of ten matters. Ten out of
ten million does not. Alerting on the count alone would page you every time traffic went up.

Note the `clamp_min(..., 1)` again, and the `or on() vector(0)`. Same traffic-safety discipline
as Lab 11, for the same reason.

Also note the two levels. Warning at 5 percent sustained over 30 minutes, critical at 15 percent
over an hour. Both have `for: 10m` so a brief spike does not page anyone. Drift is a slow
phenomenon, and the alerting should be slow to match.

## PART IV - Gating a promotion on drift

Now add drift to the release gate from Lab 11. A candidate that is already seeing drifted data
should not be promoted.

**Add** two measurements to the AnalysisTemplate.

`file: deployment/gitops/base/model/analysis-template.yaml`

```
  args:
    - name: namespace
    - name: service
    - name: driftScoreMax
      value: "REPLACE_WITH_YOUR_OWN_BASELINE"

  metrics:
    # ... the latency, 5xx and rps gates from Lab 11 stay as they are

    - name: drift-high-increase-5m
      interval: 30s
      count: 1
      failureLimit: 0
      provider:
        prometheus:
          address: http://prom-kube-prometheus-stack-prometheus.monitoring.svc:9090
          query: |
            sum(
              increase(model_drift_high_total{
                namespace="{{args.namespace}}",
                service="{{args.service}}"
              }[5m])
            ) or on() vector(0)
      successCondition: len(result) > 0 && result[0] <= 10

    - name: drift-score-max
      interval: 30s
      count: 3
      failureLimit: 1
      provider:
        prometheus:
          address: http://prom-kube-prometheus-stack-prometheus.monitoring.svc:9090
          query: |
            max(
              model_drift_score{
                namespace="{{args.namespace}}",
                service="{{args.service}}"
              }
            ) or on() vector(0)
      successCondition: len(result) > 0 && result[0] <= asFloat("{{args.driftScoreMax}}")
```

`use max() and not sum(). With several replicas, sum would grow as you scale out and your threshold would drift with the replica count`

`increase() on the counter is correct. Do not use increase() on model_drift_score, which is a gauge`

### About that threshold

**`driftScoreMax` has no correct default, and you must derive your own.**

The value depends on your feature count, your preprocessor, and the shape of your training data.
A number copied from someone else's cluster is worse than no gate at all, because it will either
never fire or always fire and you will stop trusting it.

**Derive** it like this.

  * Deploy with the gate absent or set impossibly high
  * Send a few hundred *normal* predictions through staging
  * In Prometheus, run `max_over_time(model_drift_score[1h])` and note the value
  * Set `driftScoreMax` to roughly twice that
  * Send drifted payloads and confirm it fires

Write the observed baseline into a comment above the argument, so the next person knows where
the number came from.

## Exercise

Fix the duplication that PART I flagged.

The feature engineering exists in two places: `src/features/engineer.py` for training, and again
inside `scripts/make_baseline.py`. They must agree exactly, and nothing currently enforces that.

  * Extract the engineering steps into one function that both import
  * Write a test that transforms a fixed input through both paths and asserts the vectors match
  * Break it on purpose by changing one path, and confirm the test fails

This is training and inference feature parity, and it is one of the most common sources of
silent model failure in production.

## Cleanup

Keep everything running. Lab 14 turns the drift signal into a retraining trigger.

Reset the counters if your experiments left them high, by restarting the pods.

```
kubectl -n model-staging rollout restart rollout model
```

`counters reset on restart because they live in the process. That is expected, and it is why the alerts use rate() rather than the raw total`

#### Summary

In this lab you gave the model an opinion about its own inputs. You captured a baseline in the
transformed feature space, scored each request against it with z-scores, and exported three
metrics: the current score, a counter of requests that crossed the threshold, and a flag saying
whether the baseline loaded at all.

That third metric is the habit worth keeping. Monitoring that cannot tell you when it is broken
is not monitoring.

You then made drift visible on a dashboard, alerted on a sustained ratio rather than a raw count,
and added it as a release gate so a candidate already seeing drifted data cannot be promoted.

Drift is now a signal. It is not yet an action. Right now a human reads the alert and decides
what to do. In Lab 14 you would close the loop, so that sustained drift triggers a retrain, the
retrain produces a new image and a new baseline, and that change flows through the gated rollout
you built in Labs 10 to 12.

##### Reading List

  * [Prometheus client library for Python](https://prometheus.github.io/client_python/)
  * [Prometheus recording rules](https://prometheus.io/docs/prometheus/latest/configuration/recording_rules/)
  * [Prometheus alerting rules](https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/)
  * [PrometheusRule custom resource](https://prometheus-operator.dev/docs/operator/api/#monitoring.coreos.com/v1.PrometheusRule)
  * [scikit-learn ColumnTransformer](https://scikit-learn.org/stable/modules/generated/sklearn.compose.ColumnTransformer.html)
  * [Argo Rollouts analysis with multiple metrics](https://argo-rollouts.readthedocs.io/en/stable/features/analysis/)

## Search Keywords

  * data drift detection machine learning
  * z-score feature drift baseline
  * training inference feature parity
  * prometheus gauge counter difference
  * prometheus_client Gauge Counter python
  * increase() counter vs gauge promql
  * prometheusrule recording rule alert
  * model drift baseline loaded alert on misconfiguration
  * argo rollouts drift gate
