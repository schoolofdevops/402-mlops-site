---
sidebar_position: 1
title: 'Lesson: Monitoring and Autoscaling Model Inference'
---

# Monitoring and Autoscaling Model Inference

:::note[Scaffolded — not yet authored]

This lesson is a scaffold stub for **M7 · Monitoring and Autoscaling**. `course-authoring` (Slice 2) writes the
analogy-first concepts and at least one Mermaid diagram here.

:::

## What you'll learn

- Separate system monitoring from model monitoring and say which this module covers
- Install Prometheus and Grafana with Helm and instrument a FastAPI application
- Point Prometheus at your service with a ServiceMonitor and verify data is arriving
- Explain why CPU is often the wrong scaling signal for model inference
- Scale on a Prometheus query with KEDA, and right-size Pods with a VPA
- Run a load test and read the latency distribution rather than the average
