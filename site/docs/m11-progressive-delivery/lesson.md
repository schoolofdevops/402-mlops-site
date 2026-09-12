---
sidebar_position: 1
title: 'Lesson: Releasing Models Safely with Argo Rollouts'
---

# Releasing Models Safely with Argo Rollouts

:::note[Scaffolded — not yet authored]

This lesson is a scaffold stub for **M9 · Progressive Delivery for Models**. `course-authoring` (Slice 2) writes the
analogy-first concepts and at least one Mermaid diagram here.

:::

## What you'll learn

- Explain why a Deployment cannot protect you from a model that fails quietly
- Run a candidate and the stable version side by side with an Argo Rollout
- Promote and abort explicitly, without a redeploy or a rollback
- Turn a Prometheus query into a pass or fail promotion gate
- Write PromQL that stays honest when traffic is low or absent
- Run staging and production from one set of manifests with kustomize overlays
