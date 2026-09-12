# Plan: M9 · Progressive Delivery for Models — Releasing Models Safely with Argo Rollouts

**Goal:** Author Releasing Models Safely with Argo Rollouts fully (lesson + lab + quiz) and validate the lab live.

**Learning objectives:**
- Explain why a Deployment cannot protect you from a model that fails quietly
- Run a candidate and the stable version side by side with an Argo Rollout
- Promote and abort explicitly, without a redeploy or a rollback
- Turn a Prometheus query into a pass or fail promotion gate
- Write PromQL that stays honest when traffic is low or absent
- Run staging and production from one set of manifests with kustomize overlays

**Lab intent:** Three labs. Replace the Deployment with a blue/green Rollout, gate promotion on latency, error rate and a traffic floor, then split the system into staging and production overlays with commit-SHA image tags.

## Tasks
- [ ] Lesson — analogy-first concepts + ≥1 Mermaid diagram
- [ ] Lab — copy-runnable steps + Expected output + Teardown
- [ ] Validate lab live → evidence in `planning/lab-tests/m11.md`
- [ ] Quiz — 4–6 questions, ≥1 multiSelect, every option explained
- [ ] Build green; ROADMAP + STATE updated
