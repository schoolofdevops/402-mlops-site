---
sidebar_position: 4
title: 'Deep Dive: Continuous Delivery with GitOps and Argo CD'
sidebar_label: 'Deep Dive (Part 2)'
---

# Deep Dive — Continuous Delivery with GitOps and Argo CD

:::note[Scaffolded — not yet authored]

This is a scaffold stub for the **M8 · GitOps with Argo CD** Deep Dive (Part 2). `course-authoring`
(via the `deep-dive-author` skill) writes the advanced "under the hood" material here — the
payload that goes BEYOND the core lab — then `lab-validation` folds real Expected output in and
runs `labs/m8/deep-dive.checks.json` as a separate stage.

:::

## What goes here

Argo CD sync options, prune and self-heal in practice, and why a KEDA-managed replica count fights self-heal until the ScaledObject moves into the same source of truth.
