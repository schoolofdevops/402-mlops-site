# Plan: M4 · Packaging and Serving — Packaging the Model and Serving it with FastAPI

**Goal:** Author Packaging the Model and Serving it with FastAPI fully (lesson + lab + quiz) and validate the lab live.

**Learning objectives:**
- Explain what a data scientist hands over and what is missing from that handover
- Wrap a model in a FastAPI service with request validation
- Write a Dockerfile that packages code and model together, ordered for layer caching
- Run the API and the web interface together with Docker Compose
- Debug a container that builds cleanly but exits on start

**Lab intent:** Write Dockerfiles for the API and the Streamlit client, build and test each image, then run both as one stack with Compose.

## Tasks
- [ ] Lesson — analogy-first concepts + ≥1 Mermaid diagram
- [ ] Lab — copy-runnable steps + Expected output + Teardown
- [ ] Validate lab live → evidence in `planning/lab-tests/m4.md`
- [ ] Quiz — 4–6 questions, ≥1 multiSelect, every option explained
- [ ] Build green; ROADMAP + STATE updated
