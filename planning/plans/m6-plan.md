# Plan: M6 · Deploying on Kubernetes — Deploying the Model on Kubernetes

**Goal:** Author Deploying the Model on Kubernetes fully (lesson + lab + quiz) and validate the lab live.

**Learning objectives:**
- Explain why model inference benefits from an orchestrator
- Use Pods, Deployments and Services correctly, and say what each one is for
- Build a three node KIND cluster and deploy both the model and the frontend
- Connect two services by DNS name rather than IP address
- Generate manifests instead of writing them, and manage them together with kustomize

**Lab intent:** Build the cluster, deploy model and frontend with NodePort services, connect them by service name, then replace every command with generated YAML applied through kustomize.

## Tasks
- [ ] Lesson — analogy-first concepts + ≥1 Mermaid diagram
- [ ] Lab — copy-runnable steps + Expected output + Teardown
- [ ] Validate lab live → evidence in `planning/lab-tests/m6.md`
- [ ] Quiz — 4–6 questions, ≥1 multiSelect, every option explained
- [ ] Build green; ROADMAP + STATE updated
