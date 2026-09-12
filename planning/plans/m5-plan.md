# Plan: M5 · CI Pipelines with GitHub Actions — Building an MLOps CI Pipeline with GitHub Actions

**Goal:** Author Building an MLOps CI Pipeline with GitHub Actions fully (lesson + lab + quiz) and validate the lab live.

**Learning objectives:**
- Read GitHub Actions workflow syntax and explain triggers, jobs and steps
- Store registry credentials correctly as a variable and a secret
- Build a multi-stage pipeline where each job depends on the one before it
- Pass files between jobs using artifacts, since jobs share no filesystem
- Explain why an ML pipeline is an ordinary CI pipeline with a different payload

**Lab intent:** Write a single-job workflow first, wire up Docker Hub credentials, then build the three-stage pipeline from data processing through model training to image publish.

## Tasks
- [ ] Lesson — analogy-first concepts + ≥1 Mermaid diagram
- [ ] Lab — copy-runnable steps + Expected output + Teardown
- [ ] Validate lab live → evidence in `planning/lab-tests/m5.md`
- [ ] Quiz — 4–6 questions, ≥1 multiSelect, every option explained
- [ ] Build green; ROADMAP + STATE updated
