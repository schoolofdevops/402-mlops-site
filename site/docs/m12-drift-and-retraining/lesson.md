---
sidebar_position: 1
title: 'Lesson: Drift Detection and Automated Retraining'
---

# Drift Detection and Automated Retraining

:::note[Scaffolded — not yet authored]

This lesson is a scaffold stub for **M10 · Drift Detection and Retraining**. `course-authoring` (Slice 2) writes the
analogy-first concepts and at least one Mermaid diagram here.

:::

## What you'll learn

- Describe data drift and why every service-level check misses it
- Capture a baseline in the transformed feature space and explain why the raw space is wrong
- Score incoming requests with z-scores and export drift as Prometheus metrics
- Alert on your own instrumentation being broken, not only on the thing it measures
- Trigger retraining from evidence rather than from a schedule
- Trace one full cycle from drift through retrain to a promoted model
