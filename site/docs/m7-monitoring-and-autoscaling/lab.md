---
sidebar_position: 2
title: "Lab: Setting up Monitoring for your Model"
---
# Setting up Monitoring for your Model

Your model is running on Kubernetes and you have no idea how it is doing. How many predictions
is it serving? How long does each one take? Is anything failing? Right now you would only find
out when somebody complains.

In this lab you would set up Prometheus and Grafana, make the API report its own numbers, and
build a dashboard from them. You need this before Lab 8, because you cannot autoscale on a
signal you are not collecting.

## What will you learn

  * Which parts of a model serving system are worth monitoring, and which are out of scope here
  * How to install the Prometheus and Grafana stack with Helm
  * How to instrument a FastAPI application so it exposes its own metrics
  * How a ServiceMonitor tells Prometheus where to collect from
  * How to check your metrics are arriving, before blaming the dashboard
  * How to build a dashboard that shows request rate, latency and error rate

## Pre Requisites

You should have finished Lab 6. Your cluster should be running with the model and the web
interface on it.

```
kubectl get deploy,svc,pods
```

Both `model` and `streamlit` should be there and healthy.

## Two kinds of model monitoring

Before you build anything, it is worth being clear about what you are and are not doing.

**System monitoring** is about the application. How many requests per second, how long a
prediction takes, how many errors are coming back, how much CPU and memory the Pod is using.
This is what you would build in this lab.

**Model monitoring** is about the predictions themselves. Has the incoming data started to look
different from the data the model was trained on? Is the model becoming less accurate over
time? Is it biased against some group? That is data drift and bias detection, and it is a
different subject.

For this lab you would treat the model as just another application that receives requests and
has to keep up. That is capacity monitoring, and it is what feeds the autoscaling in Lab 8.

## What you are about to build

```bash
   +-------------------+           +---------------------+
   |  model pod        |  scrapes  |    Prometheus       |
   |  /metrics endpoint|<----------+   (monitoring ns)   |
   +-------------------+           +----------+----------+
            ^                                 |
            | ServiceMonitor tells            | queries
            | Prometheus where to look        v
            |                      +---------------------+
            |                      |     Grafana         |
            |                      |   dashboard         |
            |                      +---------------------+
```

where,

  * the **/metrics endpoint** is added to your FastAPI app by an instrumentation library
  * **Prometheus** pulls from that endpoint on a schedule. It collects, your app does not send
  * the **ServiceMonitor** is a custom resource that says which Service to scrape and how often
  * **Grafana** does not collect anything. It only draws pictures of what Prometheus already has

The pull model is worth noticing. Your application does not need to know Prometheus exists. It
just exposes numbers at a URL, and something else comes and reads them.

## PART I - Installing Prometheus and Grafana

### Installing Helm

Helm is a package manager for Kubernetes. Instead of applying dozens of manifests yourself, you
install a chart which brings all of them along.

**Install** Helm 3 on Linux or macOS.

```
curl https://raw.githubusercontent.com/helm/helm/master/scripts/get-helm-3 | bash
```

For other options, see the [official install instructions](https://helm.sh/docs/intro/install/).

**Verify** it.

```
helm --help
helm version
```

### Deploying the stack

You would use the `kube-prometheus-stack` chart, which brings Prometheus, Grafana, Alertmanager
and the exporters that collect node and cluster metrics, all in one go.

Have a look at what you are installing first.

  * [kube-prometheus-stack on Artifact Hub](https://artifacthub.io/packages/helm/prometheus-community/kube-prometheus-stack)

**Add** the chart repository.

```
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts

helm repo update
```

**Install** the chart.

```
helm upgrade --install prom \
  -n monitoring \
  --create-namespace \
  prometheus-community/kube-prometheus-stack \
  --set grafana.service.type=NodePort \
  --set grafana.service.nodePort=30200 \
  --set prometheus.service.type=NodePort \
  --set prometheus.service.nodePort=30300
```

where,

  * **upgrade --install** installs it if it is not there and updates it if it is, so you can run
    this command again safely
  * **prom** is the release name. Remember it, because you would need it in the ServiceMonitor
  * **-n monitoring --create-namespace** keeps the whole stack in its own namespace
  * the four **--set** flags expose Prometheus and Grafana on fixed node ports so you can open
    them in a browser

**Verify** the install.

```
helm list -A
kubectl get all -n monitoring
```

Give it two or three minutes. There are several Pods and they do not all come up at once. Wait
until nothing is `Pending` or `ContainerCreating`.

**Open** both interfaces.

  * Prometheus at [http://localhost:30300/](http://localhost:30300/)
  * Grafana at [http://localhost:30200/](http://localhost:30200/)

Log in to Grafana with,

```
Username: admin
Password: prom-operator
```

`this is the chart's default password. It is fine on a local cluster and it is not fine anywhere else`

Have a look around Grafana. Several dashboards come with the chart already, showing cluster and
node level metrics. What is missing is anything about your model, and that is PART II.

## PART II - Instrumenting the model API

Prometheus can only collect what your application publishes. Right now your API publishes
nothing. Let's fix that.

**Add** the instrumentation import.

`file: src/api/main.py`

```
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from inference import predict_price, batch_predict
from schemas import HousePredictionRequest, PredictionResponse
from prometheus_fastapi_instrumentator import Instrumentator  # 👈 Add this
```

**Add** the instrumentation itself, after the middleware block.

`file: src/api/main.py`

```
# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize and instrument Prometheus metrics
Instrumentator().instrument(app).expose(app)  # 👈 Add this
```

Two words, two jobs. `instrument` wraps every route so that timings and counts get recorded.
`expose` adds the `/metrics` endpoint where Prometheus can read them.

**Add** the package to the API requirements.

`file: src/api/requirements.txt`

```
prometheus-fastapi-instrumentator==6.1.0
```

`this is src/api/requirements.txt, not the one in the project root. The Dockerfile installs from this one`

**Commit and push.**

```
git add src/api/main.py src/api/requirements.txt
git commit -am "add fastapi instrumentation"
git push origin
```

Now go and watch your pipeline from Lab 5 do its work. GitHub -> Actions. The MLOps pipeline
runs, builds a new image and publishes it to Docker Hub.

**Verify** the new image appeared on Docker Hub before continuing.

**Roll out** the change to the cluster.

```
kubectl rollout restart deployment model
kubectl rollout status deployment model
```

**Verify** the metrics endpoint exists now. Open
[http://localhost:30100/docs](http://localhost:30100/docs) and look for `/metrics` in the list
of routes. You could also fetch it directly.

```
curl -s http://localhost:30100/metrics | head -20
```

You would see a lot of plain text lines with metric names and numbers. That is the format
Prometheus reads.

## PART III - Telling Prometheus where to look

Prometheus does not scan the cluster for anything that looks scrapeable. You have to tell it.
The way you tell it is a `ServiceMonitor`, which is a custom resource the Prometheus operator
installed for you.

`file: deployment/monitoring/servicemonitor.yaml`

```
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: house-price-api-monitor
  labels:
    release: prom  # Match the label of your Prometheus instance as per helm release
spec:
  selector:
    matchLabels:
      app: model
  namespaceSelector:
    matchNames:
      - default  # or your namespace
  endpoints:
    - port: "8000"  # or match name of your service port
      path: /metrics
      interval: 15s
```

Three fields decide whether this works at all.

**labels.release** must match your Helm release name, which was `prom`. Prometheus only picks
up ServiceMonitors carrying that label. Get this wrong and nothing happens, with no error
anywhere.

**selector.matchLabels** must match the labels on your Service. Get this wrong and the
ServiceMonitor exists but points at nothing.

**endpoints.port** must match the port name on your Service, not the port number, unless the
name is itself a number. Check with `kubectl get svc model -o yaml` if you are unsure.

**Apply** it.

```
kubectl apply -f deployment/monitoring/servicemonitor.yaml
```

**Verify** it was created.

```
kubectl get servicemonitor
kubectl describe servicemonitor house-price-api-monitor
```

### Checking the data is actually arriving

Do not go to Grafana yet. Check Prometheus first, because if the data is not there, no amount
of dashboard work would help.

**Open** [http://localhost:30300/targets](http://localhost:30300/targets).

Find your model target in the list. It should say `UP`. If it says `DOWN`, the error message on
that page tells you why, and it is usually the wrong port. If your target is not listed at all,
go back and check the three fields above.

Now **generate some traffic** so there is something to see. Send a few predictions through the
Streamlit app at [http://localhost:30000/](http://localhost:30000/).

Then **run some queries** in Prometheus at [http://localhost:30300/](http://localhost:30300/).

```
http_requests_total

histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[1m])) by (le, handler))


rate(http_request_size_bytes_sum[1m])
```

[sample output for http_requests_total]
```
http_requests_total{container="house-price-model", endpoint="8000", handler="none", instance="10.244.2.8:8000", job="model", method="GET", namespace="default", pod="model-6798556657-kn6zp", service="model", status="4xx"}
22
http_requests_total{container="house-price-model", endpoint="8000", handler="/predict", instance="10.244.2.8:8000", job="model", method="POST", namespace="default", pod="model-6798556657-kn6zp", service="model", status="2xx"}
2
http_requests_total{container="house-price-model", endpoint="8000", handler="/metrics", instance="10.244.2.8:8000", job="model", method="GET", namespace="default", pod="model-6798556657-kn6zp", service="model", status="2xx"}
29
```

Read one of those lines. Everything inside the curly braces is a label, and every combination of
labels is counted separately. So you can see requests to `/predict` apart from requests to
`/metrics`, and successes apart from errors, without setting anything up specially.

If these queries return results, Prometheus is collecting from your model. The hard part is
done.

## PART IV - Building the dashboard

**Import** a ready made dashboard rather than building panels one at a time.

  * Log in to Grafana at [http://localhost:30200/](http://localhost:30200/)
  * Go to Dashboards -> New -> Import
  * Paste the JSON from
    [enhanced_fastapi_ml_dashboard](https://gist.githubusercontent.com/initcron/ca57251c80bc2f4a2adde0a878ebc585/raw/f6fb4304ebb026725c8c4d0e54c37d87ae64cafb/enhanced_fastapi_ml_dashboard.json)
    into the box that reads `Import via dashboard JSON model`
  * Select your Prometheus data source and press Import

You would now have a dashboard showing your model's own behaviour rather than the cluster's.

### What the four panels tell you

**Request rate**, from `http_requests_total`, is how much traffic the model is getting. It is
the first thing you would look at when something changes, and it is the most obvious signal to
scale on.

**Latency at the 95th percentile**, from the histogram query above, is how long the slowest 5
percent of requests take. Use this rather than the average. An average hides a small number of
very slow requests behind a large number of fast ones, and it is those slow ones your users
actually notice.

**Request size** tells you how heavy the incoming payloads are. Large requests cost more CPU and
memory per prediction, so this is what you would look at when tuning Pod resource limits.

**Response size** tells you how much data you are sending back. It matters for network load and
for slower clients.

Together these give you the numbers to answer the question Lab 8 asks, which is when should
there be more copies of this model running.

#### Observe

Send a burst of predictions through the Streamlit app, as fast as you can click.

Watch the request rate panel go up, and then watch the latency panel. Does latency rise as the
rate rises? At what point? That relationship is what you would turn into an autoscaling rule in
the next lab.

## Exercise

Prove you can find a problem using only the dashboard.

  * Send a deliberately bad request to the API, for example with a missing field or text where a
    number should be
  * Find it on the dashboard. Which panel shows it, and what changed?
  * Then run a Prometheus query that returns only the failing requests

`hint, look at the status label in the sample output above`

Being able to separate errors from successes without adding any new code is the payoff of
having labels on your metrics.

## Cleanup

Leave all of it running. Lab 8 uses the Prometheus you just installed as the source of its
autoscaling signal, and it would not work without it.

**Commit** your monitoring configuration.

```
git add deployment/monitoring
git commit -am "add servicemonitor for model metrics"
git push origin main
```

If you do need to remove the stack later, uninstall it through Helm rather than deleting Pods.

```
helm uninstall prom -n monitoring
kubectl delete namespace monitoring
```

#### Summary

In this lab you gave your model a voice. You installed Prometheus and Grafana with Helm,
instrumented the FastAPI application with two lines of code, pushed that change through the
pipeline you built in Lab 5, and told Prometheus where to collect from with a ServiceMonitor.

You also learned to check the target list and run a query in Prometheus before touching
Grafana. When a dashboard is empty, the problem is almost always upstream of the dashboard.

You now know how many requests your model is getting and how long they take. In Lab 8 you would
use those exact numbers to add more copies of the model automatically when it starts falling
behind, and remove them when the traffic goes away.

##### Reading List

  * [kube-prometheus-stack chart](https://artifacthub.io/packages/helm/prometheus-community/kube-prometheus-stack)
  * [Prometheus ServiceMonitor documentation](https://prometheus-operator.dev/docs/operator/design/#servicemonitor)
  * [prometheus-fastapi-instrumentator](https://github.com/trallnag/prometheus-fastapi-instrumentator)
  * [Prometheus query basics](https://prometheus.io/docs/prometheus/latest/querying/basics/)
  * [Histograms and quantiles in Prometheus](https://prometheus.io/docs/practices/histograms/)
  * [Grafana dashboards](https://grafana.com/docs/grafana/latest/dashboards/)

## Search Keywords

  * helm kube-prometheus-stack install
  * prometheus operator servicemonitor label release
  * prometheus fastapi instrumentator metrics endpoint
  * prometheus targets up down debugging
  * histogram_quantile p95 latency promql
  * rate http_requests_total
  * grafana import dashboard json
  * kubectl rollout restart deployment
