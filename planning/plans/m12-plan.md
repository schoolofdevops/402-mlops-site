# Plan: M10 · Drift Detection and Retraining — Drift Detection and Automated Retraining

**Goal:** Author Drift Detection and Automated Retraining fully (lesson + lab + quiz) and validate the lab live.

**Learning objectives:**
- Describe data drift and why every service-level check misses it
- Capture a baseline in the transformed feature space and explain why the raw space is wrong
- Score incoming requests with z-scores and export drift as Prometheus metrics
- Alert on your own instrumentation being broken, not only on the thing it measures
- Trigger retraining from evidence rather than from a schedule
- Trace one full cycle from drift through retrain to a promoted model

**Lab intent:** Two labs. Instrument the model to score drift against a training baseline and gate releases on it, then close the loop so sustained drift triggers a retrain that flows back through GitOps and the gates.

## Tasks
- [ ] Lesson — analogy-first concepts + ≥1 Mermaid diagram
- [ ] Lab — copy-runnable steps + Expected output + Teardown
- [ ] Validate lab live → evidence in `planning/lab-tests/m12.md`
- [ ] Quiz — 4–6 questions, ≥1 multiSelect, every option explained
- [ ] Build green; ROADMAP + STATE updated
