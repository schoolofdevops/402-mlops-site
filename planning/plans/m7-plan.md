# Plan: M7 · Monitoring and Autoscaling — Monitoring and Autoscaling Model Inference

**Goal:** Author Monitoring and Autoscaling Model Inference fully (lesson + lab + quiz) and validate the lab live.

**Learning objectives:**
- Separate system monitoring from model monitoring and say which this module covers
- Install Prometheus and Grafana with Helm and instrument a FastAPI application
- Point Prometheus at your service with a ServiceMonitor and verify data is arriving
- Explain why CPU is often the wrong scaling signal for model inference
- Scale on a Prometheus query with KEDA, and right-size Pods with a VPA
- Run a load test and read the latency distribution rather than the average

**Lab intent:** Two labs. First install the monitoring stack, instrument the API and build a dashboard. Then install KEDA, scale on latency and request rate, load test it, and add a Vertical Pod Autoscaler.

## Tasks
- [ ] Lesson — analogy-first concepts + ≥1 Mermaid diagram
- [ ] Lab — copy-runnable steps + Expected output + Teardown
- [ ] Validate lab live → evidence in `planning/lab-tests/m7.md`
- [ ] Quiz — 4–6 questions, ≥1 multiSelect, every option explained
- [ ] Build green; ROADMAP + STATE updated
