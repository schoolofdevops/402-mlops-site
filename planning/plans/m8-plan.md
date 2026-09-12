# Plan: M8 · GitOps with Argo CD — Continuous Delivery with GitOps and Argo CD

**Goal:** Author Continuous Delivery with GitOps and Argo CD fully (lesson + lab + quiz) and validate the lab live.

**Learning objectives:**
- State the four principles of GitOps and map each to something already built
- Install Argo CD into the cluster that runs the model
- Write an Application resource mapping a Git repository to a cluster
- Use a release branch and a pull request as the approval step before deployment
- Take a change from a code edit to a running Pod without running kubectl apply
- Debug a deployment that reports Synced while still serving the old version

**Lab intent:** Install Argo CD, create the Application against a release branch, remove the hand-applied workloads and let Argo CD recreate them, then run a change end to end through CI and GitOps.

## Tasks
- [ ] Lesson — analogy-first concepts + ≥1 Mermaid diagram
- [ ] Lab — copy-runnable steps + Expected output + Teardown
- [ ] Validate lab live → evidence in `planning/lab-tests/m8.md`
- [ ] Quiz — 4–6 questions, ≥1 multiSelect, every option explained
- [ ] Build green; ROADMAP + STATE updated
