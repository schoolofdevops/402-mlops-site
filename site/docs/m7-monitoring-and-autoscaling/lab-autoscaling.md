---
sidebar_position: 3
title: "Lab: Autoscaling your Model with KEDA and VPA"
---
# Autoscaling your Model with KEDA and VPA

Your model runs as a single Pod. One copy, fixed size. If prediction traffic doubles, that Pod
gets slower and there is nothing to catch it. If traffic drops to nothing overnight, you are
still paying for the same capacity.

In this lab you would make the model scale itself. More copies when it gets busy, fewer when it
goes quiet, and the right amount of CPU and memory per copy.

## What will you learn

  * The difference between scaling out and scaling up, and when you would use each
  * Why CPU is often the wrong signal for a model serving workload
  * How to install KEDA and scale on a Prometheus query instead
  * How to write a ScaledObject, and how to scale on more than one signal at once
  * How to run a load test and watch the scaling actually happen
  * How to add a Vertical Pod Autoscaler to right size the Pods themselves
  * What to do when metrics stop arriving during a load test

## Pre Requisites

You should have finished Lab 7. Prometheus must be collecting from your model, because it is
the source of the scaling signal.

```
kubectl get pods -n monitoring
kubectl get servicemonitor
```

Confirm your metrics are live before you start, at
[http://localhost:30300/targets](http://localhost:30300/targets). Your model target should say
`UP`.

`if the target is DOWN, go back and finish Lab 7. Nothing in PART I would work otherwise`

## Two directions to scale

**Horizontal scaling** means more copies. Three Pods instead of one, with the Service spreading
requests across them. This is what you would reach for first, because it is simple and each
copy can fail without taking everything down.

**Vertical scaling** means a bigger copy. Same single Pod, but with more CPU and memory. This
helps when one request is heavy and no amount of extra copies makes an individual prediction
faster.

You would do both in this lab. Horizontal in PART I to III, vertical in PART IV.

### Why not just scale on CPU

The usual way to scale on Kubernetes is the Horizontal Pod Autoscaler watching CPU. For a model
serving API, CPU is often a poor signal.

A prediction can be waiting rather than computing, for example on a slow client or on loading
something. CPU would look calm while your users are waiting. Meanwhile latency, which is what
users actually feel, has already gone bad.

So you would scale on the numbers you built in Lab 7. Request rate and 95th percentile latency.
Those describe the experience rather than the machine.

Kubernetes cannot read a Prometheus query on its own. That is where KEDA comes in.

## What you are about to build

```bash
   +--------------+   query    +--------------+
   |    KEDA      +----------->+  Prometheus  |
   |  ScaledObject|            +--------------+
   +------+-------+
          | creates and drives
          v
   +--------------+           +---------------------+
   |     HPA      +---------->+  model deployment   |
   +--------------+  scales   |  1 to 5 replicas    |
                              +----------+----------+
                                         ^
                                         | resource requests and limits
                                         | adjusted by
                              +----------+----------+
                              |        VPA          |
                              +---------------------+
```

where,

  * **KEDA** reads external systems such as Prometheus and turns the answer into something Kubernetes understands
  * the **HPA** is created by KEDA. You would not write it yourself, but you would see it in `kubectl get hpa`
  * the **VPA** changes how big each Pod is, while the HPA changes how many there are

## PART I - Installing KEDA and preparing the deployment

### Installing KEDA

```
helm repo add kedacore https://kedacore.github.io/charts
helm repo update

helm install keda kedacore/keda \
  --namespace keda \
  --create-namespace
```

**Verify** the install.

```
kubectl get all -n keda
```

Wait until the operator and the metrics apiserver Pods are both `Running`.

### Adding a resource spec

Before anything can scale, Kubernetes has to know how much your Pod normally needs. Without a
CPU request there is no percentage to compare against, so CPU based scaling simply does nothing.

**Add** requests and limits to the model deployment.

`file: deployment/kubernetes/model-deploy.yaml`

```
    spec:
      containers:
      - image: xxxxxx/house-price-model:latest
        name: house-price-model
        ports:
        - containerPort: 8000
        # Add the following spec
        resources:
          requests:
            cpu: "50m"
            memory: "64Mi"
          limits:
            cpu: "100m"
            memory: "128Mi"
```

where,

  * **requests** is what the Pod is guaranteed, and what the scheduler uses to decide which node it fits on
  * **limits** is the ceiling it may not go past
  * **50m** means 50 millicores, that is five hundredths of one CPU core

These numbers are deliberately small so that scaling kicks in quickly on a laptop cluster. On
real hardware you would set them from what you measured in Lab 7.

**Apply** the change.

```
kubectl apply -k deployment/kubernetes
```

**Verify** the Pod restarted with the new spec.

```
kubectl describe pod -l app=model | grep -A6 Limits
```

## PART II - Scaling on latency

### Picking the metric

You already have the query. It is the same one behind the latency panel on your Grafana
dashboard.

```
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[1m])) by (le, handler))
```

For scaling you do not want it broken down per handler, since you need one number to compare
against a threshold. **Simplify** it by dropping the handler.

```
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[1m])) by (le))
```

**Test** it first at [http://localhost:30300/query](http://localhost:30300/query). Do not put a
query into a ScaledObject until you have seen it return a number.

Let's say you want more copies when the 95th percentile goes past half a second.

### Writing the ScaledObject

Here is the skeleton.

`file: deployment/kubernetes/fastapi-scaledobject.yaml`

```
apiVersion: xxx
kind: xxx
metadata:
  name: xxx
  namespace: xxx
spec:
  scaleTargetRef:
    name: xxx
  minReplicaCount: xxx
  maxReplicaCount: xxx
  pollingInterval: xxx
  cooldownPeriod: xxx
  triggers:
    - type: xxx
      metadata:
        xxx
```

**Problem Statement**

  * target the `model` deployment in the `default` namespace
  * never go below 1 replica, never above 5
  * check the metric every 30 seconds
  * wait 300 seconds of calm before scaling back down
  * use a Prometheus trigger pointing at the in cluster Prometheus service
  * scale up when the p95 latency goes above 0.5 seconds

Now the complete spec.

`file: deployment/kubernetes/fastapi-scaledobject.yaml`

```
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: fastapi-latency-autoscaler
  namespace: default
spec:
  scaleTargetRef:
    name: model  # update to your actual deployment name
  minReplicaCount: 1
  maxReplicaCount: 5
  pollingInterval: 30  # seconds
  cooldownPeriod: 300  # seconds before scaling down
  triggers:
    - type: prometheus
      metadata:
        serverAddress: http://prom-kube-prometheus-stack-prometheus.monitoring.svc:9090
        metricName: fastapi_latency_p95
        query: |
          histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[1m])) by (le))
        threshold: "0.5"
```

Look at `serverAddress`. That long hostname is the Prometheus Service, addressed from another
namespace. The pattern is `<service>.<namespace>.svc`, and this is the same Kubernetes DNS you
met in Lab 6, now reaching across namespaces.

The `cooldownPeriod` of 300 seconds is worth understanding too. Scaling up should be quick,
because users are waiting. Scaling down should be slow, because traffic comes in bursts and you
do not want to remove copies just before the next burst arrives.

**Apply** it.

```
kubectl apply -f deployment/kubernetes/fastapi-scaledobject.yaml
```

**Verify** both objects.

```
kubectl get scaledobject
kubectl get hpa
```

You would see an HPA that you did not create. KEDA made it, and it is how KEDA actually drives
the replica count. If the HPA is missing, the ScaledObject was rejected. Describe it to find out
why.

```
kubectl describe scaledobject fastapi-latency-autoscaler
```

### Adding a second signal

Latency alone is a lagging signal. By the time it goes up, your users have already had a slow
experience. Request rate goes up first, so let's scale on both.

**Add** a second trigger to the same file.

```
triggers:
  - type: prometheus
    metadata:
      serverAddress: http://...:9090
      metricName: latency
      query: ...histogram_quantile...
      threshold: "0.5"
  # Add only the following to existing code
  - type: prometheus
    metadata:
      serverAddress: http://prom-kube-prometheus-stack-prometheus.monitoring.svc:9090
      metricName: request_rate
      query: sum(rate(http_requests_total[1m]))
      threshold: "1000"
```

When there are several triggers, KEDA scales on whichever one asks for the most replicas. So
either signal on its own is enough to bring more copies up.

**Apply and verify.**

```
kubectl apply -f deployment/kubernetes/fastapi-scaledobject.yaml
```

```
kubectl get scaledobject,hpa,pods
```

**Watch** what KEDA is doing while you work.

```
kubectl logs -n keda deploy/keda-operator -f
```

## PART III - Running a load test

Nothing you have built so far has been proved. A ScaledObject that never scales looks exactly
like one that works. So let's create some load.

### Installing hey

`hey` is a small HTTP load generator.

  * **macOS** : `brew install hey`
  * **Linux** : `sudo snap install hey` or `go install github.com/rakyll/hey@latest`
  * **Windows** : download from the [GitHub releases](https://github.com/rakyll/hey/releases) and add it to your PATH

### Sending one request first

**Create** a request body.

`file: predict.json`

```
{
  "sqft": 4500,
  "bedrooms": 4,
  "bathrooms": 2,
  "year_built": 2014,
  "condition": "Good",
  "location": "Urban"
}
```

**Try** a single prediction before generating thousands of them.

```
curl -X POST http://localhost:30100/predict \
  -H "Content-Type: application/json" \
  -d @predict.json
```

You should get a price back. If this one request fails, the load test would only fail five
thousand times faster.

### Running the load test

Open two extra terminals first, so you can watch while the test runs.

```
kubectl get pods --watch
```

```
kubectl get hpa --watch
```

**Run** the load test.

```
hey -n 5000 -c 200 -m POST \
  -H "Content-Type: application/json" \
  -D predict.json \
  http://localhost:30100/predict
```

where `-n 5000` is the total number of requests and `-c 200` is how many go at once.

You could also run it for a period of time instead of a fixed count, which is better for
watching autoscaling since it keeps the pressure on.

```
hey -z 3m -c 200 -m POST \
  -H "Content-Type: application/json" \
  -D predict.json \
  http://localhost:30100/predict
```

[sample output]
```
Summary:
  Total:	5.9189 secs
  Slowest:	0.5623 secs
  Fastest:	0.0050 secs
  Average:	0.2070 secs
  Requests/sec:	844.7576

  Total data:	725000 bytes
  Size/request:	145 bytes

Response time histogram:
  0.005 [1]	|
  0.061 [157]	|■■■■
  0.116 [230]	|■■■■■■
  0.172 [1628]	|■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
  0.228 [1032]	|■■■■■■■■■■■■■■■■■■■■■■■■■
  0.284 [1203]	|■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
  0.339 [444]	|■■■■■■■■■■■
  0.395 [147]	|■■■■
  0.451 [69]	|■■
  0.507 [60]	|■
  0.562 [29]	|■


Latency distribution:
  10% in 0.1250 secs
  25% in 0.1436 secs
  50% in 0.1951 secs
  75% in 0.2589 secs
  90% in 0.3030 secs
  95% in 0.3541 secs
  99% in 0.4757 secs

Details (average, fastest, slowest):
  DNS+dialup:	0.0005 secs, 0.0050 secs, 0.5623 secs
  DNS-lookup:	0.0001 secs, 0.0000 secs, 0.0114 secs
  req write:	0.0000 secs, 0.0000 secs, 0.0058 secs
  resp wait:	0.2062 secs, 0.0044 secs, 0.5622 secs
  resp read:	0.0002 secs, 0.0000 secs, 0.0231 secs

Status code distribution:
  [200]	5000 responses
```

Read the latency distribution block rather than the average. The average was 0.207 seconds, but
95 percent of requests finished within 0.354 seconds and one percent took nearly half a second.
That gap between the average and the tail is exactly why you scale on p95.

`in this run, the p95 of 0.354 stayed below the 0.5 threshold, so this particular test would not have triggered a scale up. Raise the concurrency or lower the threshold if you want to see it fire`

**Watch** the other two terminals while the test runs. New Pods should appear, and the HPA
should show a rising number of replicas. Then wait five minutes after the test ends and watch
them go away again, which is the cooldown period doing its job.

**Look** at your Grafana dashboard from Lab 7 during the run. Request rate up, latency up,
then both settling as the extra copies take the load.

#### Observe

Run the same test again with the same settings and compare. Does the second run have lower
latency than the first? Why would that be? By the second run there may already be more Pods
running from the first one, so the load is spread further.

## Troubleshooting - metrics disappear during the load test

You may see gaps in the Grafana graphs exactly when the load test is running. No data at all,
right when you most want it.

What is happening is that both the predictions and the metrics scraping go through the same
FastAPI application on the same port. Under heavy load the app is busy serving `/predict`, and
the scrape either times out or is not served in time. So the very moment you want data, you
stop collecting it.

The fix is to serve metrics on a separate port, so scraping does not compete with predictions.

**Add** a second metrics server to the app.

`file: src/api/main.py`

```
from prometheus_client import start_http_server
import threading


# Start Prometheus metrics server on port 9100 in a background thread
def start_metrics_server():
    start_http_server(9100)

```

**Expose** the new port in the image.

`file: Dockerfile`

```
EXPOSE 8000 9100
```

Commit these so the pipeline builds a new image and publishes it.

**Add** the port to the Service.

`file: deployment/kubernetes/model-svc.yaml`

```
spec:
  ports:
  - name: "8000"
    nodePort: 30100
    port: 8000
    protocol: TCP
    targetPort: 8000
  - name: metrics
    port: 9100
    targetPort: 9100
```

**Point** the ServiceMonitor at the new port.

`file: deployment/monitoring/servicemonitor.yaml`

```
spec:
  selector:
    matchLabels:
      app: model
  namespaceSelector:
    matchNames:
      - default  # or your namespace
  endpoints:
    - port: metrics
      path: /
      interval: 15s
      scrapeTimeout: 10s
```

**Apply** both and wait a few minutes.

**Verify** at [http://localhost:30300/targets](http://localhost:30300/targets) that the new
endpoint shows up and is `UP`.

Run the load test again. The graphs should now stay continuous through it.

`the general lesson here is worth keeping. Never let your monitoring path share a resource with the thing it is monitoring, or it will go blind exactly when you need it`

## PART IV - Scaling on CPU and scaling up

### Adding CPU as a third signal

Latency and request rate describe the user experience. CPU describes the machine. Both are
useful, so let's add CPU as another trigger.

Kubernetes needs the metrics server to report CPU usage. **Install** it.

```
cd ~
git clone https://github.com/schoolofdevops/metrics-server.git
kubectl apply -k metrics-server/manifests/overlays/release
```

Give it a couple of minutes to start collecting, then **verify**.

```
kubectl top pods
kubectl top nodes
```

`if this says metrics not available, wait another minute. It needs a collection cycle before it can report anything`

**Update** the ScaledObject with a CPU trigger.

`file: deployment/kubernetes/fastapi-scaledobject.yaml`

```
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: fastapi-latency-autoscaler
  namespace: default
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: model  # update to your actual deployment name
  minReplicaCount: 1
  maxReplicaCount: 5
  pollingInterval: 30  # seconds
  cooldownPeriod: 300  # seconds before scaling down
  triggers:
    - type: prometheus
      metadata:
        serverAddress: http://prom-kube-prometheus-stack-prometheus.monitoring.svc:9090
        metricName: fastapi_latency_p95
        query: |
          histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[1m])) by (le))
        threshold: "0.5"
    - type: cpu
      metricType: Utilization # Allowed types are 'Utilization' or 'AverageValue'
      metadata:
        value: "50"
```

  * Source : [KEDA Autoscaler with Latency and CPU Utilization](https://gist.github.com/initcron/9bcc0569a93ffad83d7b025faf1c6461)

The CPU trigger works only because you set a CPU request back in PART I. `Utilization: 50` means
50 percent of the requested 50 millicores, and without a request there would be nothing to take
a percentage of.

**Apply and verify.**

```
kubectl apply -f deployment/kubernetes/fastapi-scaledobject.yaml
kubectl get scaledobject,hpa,pods
```

Run the load test once more and watch it scale.

### Adding a Vertical Pod Autoscaler

Horizontal scaling adds copies. It does not tell you whether each copy is the right size. The
50 millicores you set in PART I was a guess. The VPA watches actual usage and corrects it.

`before you begin, make sure OpenSSL is installed and up to date on your system`

**Install** the VPA.

```
git clone https://github.com/kubernetes/autoscaler.git
cd autoscaler/vertical-pod-autoscaler/
```

```
./hack/vpa-up.sh
```

**Create** the policy.

`file: model-vpa.yaml`

```
---
apiVersion: "autoscaling.k8s.io/v1"
kind: VerticalPodAutoscaler
metadata:
  name: model
  labels:
    role: model
spec:
  targetRef:
    apiVersion: "apps/v1"
    kind: Deployment
    name: model
  updatePolicy:
    updateMode: "Auto"
  resourcePolicy:
    containerPolicies:
      - containerName: '*'
        minAllowed:
          cpu: 50m
          memory: 64Mi
        maxAllowed:
          cpu: 500m
          memory: 512Mi
        controlledResources: ["cpu", "memory"]
```

  * Source : [model-vpa.yaml](https://gist.github.com/initcron/2bad4244967905930e25feec239d49b5)

`updateMode: Auto` means the VPA would recreate Pods with the corrected size. There is also
`Off`, which only records a recommendation without acting. On anything you care about, start
with `Off`, read the recommendations for a week, and only then switch it on.

**Apply and watch.**

```
kubectl apply -f model-vpa.yaml
```

```
kubectl get vpa model --watch
```

[sample output]
```
NAME   MODE   CPU   MEM   PROVIDED   AGE
vote   Auto                          5s
vote   Auto   50m   262144k   True       30s
```

`this sample was captured against a different workload, so the NAME column reads vote. In your run it would read model. The shape of the output is what matters, that is the CPU and MEM columns filling in and PROVIDED turning True`

At first the columns are empty, because the VPA has no history yet. After about thirty seconds
it has enough to make a recommendation, and `PROVIDED` turns `True`.

Run the load test one more time and watch whether the recommended values move.

#### Observe

You now have an HPA and a VPA acting on the same deployment. Ask yourself what happens if they
disagree. The VPA makes each Pod bigger, which lowers CPU utilisation, which makes the HPA want
fewer Pods. Running both on the same CPU metric is a known conflict, which is one more reason to
scale horizontally on latency and request rate rather than on CPU.

## Exercise

Find your model's real limit.

  * Set `maxReplicaCount` to 3 and apply
  * Run a load test heavy enough to reach all 3 replicas
  * Record the request rate and the p95 latency from Grafana at that point
  * Now raise `maxReplicaCount` to 5 and repeat with the same load

Did latency improve going from 3 to 5? If it did not, something other than replica count is the
bottleneck. Work out what, using the resource limits you set in PART I as the first suspect.

## Cleanup

Keep the cluster and everything on it. Lab 9 deploys this same set of manifests through Argo CD,
including the ScaledObject.

Do clean up your load testing leftovers.

```
kubectl get pods
```

Wait for the replica count to come back down to 1 after the cooldown period, so you are not
leaving extra Pods running.

**Commit** everything you wrote in this lab.

```
git add deployment/kubernetes deployment/monitoring
git commit -am "add keda scaledobject, vpa and metrics port"
git push origin main
```

If you want to remove the autoscalers,

```
kubectl delete scaledobject fastapi-latency-autoscaler
kubectl delete vpa model
```

#### Summary

In this lab you made the model look after its own capacity. You installed KEDA, gave the Pod a
resource spec so scaling has something to measure against, and wrote a ScaledObject that scales
on a Prometheus query rather than on CPU. Then you added request rate as a second signal, ran a
real load test with `hey`, and watched the replica count move up and back down.

You also hit a real problem, where the metrics went blind during the load test because the
scrape was competing with predictions on the same port, and you fixed it by giving metrics their
own port.

Then you scaled in the other direction with a Vertical Pod Autoscaler, and saw why running a VPA
and an HPA on the same CPU metric is something to be careful about.

Your model is now deployed, monitored and self scaling. The one thing left is that every change
still reaches the cluster because you ran `kubectl apply`. In Lab 9 you would hand that last job
over to Argo CD, so a merge in Git is the only thing that deploys anything.

##### Reading List

  * [KEDA ScaledObject specification](https://keda.sh/docs/2.16/reference/scaledobject-spec/)
  * [KEDA Prometheus scaler](https://keda.sh/docs/2.16/scalers/prometheus/)
  * [Horizontal Pod Autoscaler walkthrough](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale-walkthrough/)
  * [Vertical Pod Autoscaler](https://github.com/kubernetes/autoscaler/tree/master/vertical-pod-autoscaler)
  * [Managing resources for containers](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)
  * [hey load generator](https://github.com/rakyll/hey)

## Search Keywords

  * keda install helm
  * keda scaledobject prometheus trigger
  * keda multiple triggers scaling
  * keda cooldown period polling interval
  * kubernetes resource requests limits millicores
  * metrics server kubectl top pods
  * vertical pod autoscaler updatemode auto
  * hey load test post json
  * prometheus service dns cross namespace

## Mini Project

Work out the right scaling configuration for your model, using evidence rather than the numbers
in this lab.

You are asked to produce a scaling setup you could justify to somebody else.

Requirements,

  * measure what one Pod can actually handle, in requests per second, before p95 latency goes past
    half a second
  * set the CPU and memory requests from what you measured in Lab 7, not from the values given here
  * pick a latency threshold and a request rate threshold, and be able to explain where each number
    came from
  * pick a `maxReplicaCount` your cluster can genuinely schedule, and show the working
  * run a load test that proves the setup holds latency under the threshold
  * write it up as a short page with the load test output and a Grafana screenshot

No walkthrough for this one. Everything you need is in Lab 7 and Lab 8.
