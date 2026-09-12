# ROADMAP — Ultimate DevOps to MLOps Bootcamp

Build tracker. Each module ships Lesson + Lab + Quiz; each lab is validated live before publish.

Legend: ✅ done · 🔄 in progress · ⬜ pending · — not applicable

## Phase 1 — Scaffold ✅

- ✅ Docusaurus site scaffolded (Quiz + Slides + Mermaid + Pages CI + continuity)
- ✅ Design spec approved · `course.config.json` written · this roadmap generated
- ✅ Nine lab guides imported from `Content/Labs`, verbatim
- ✅ Ten quizzes imported from `Content/quizzes` — 122 questions, all parsed clean
- ✅ Sidebar rebuilt from config; site builds green with 42 pages

## Phase 2+ — Modules

Lesson pages are the remaining authoring work. Each is written from that module's caption
transcripts via `/course-module N`.

| Module | Lesson | Deep dive | Lab | Lab validated | Quiz |
|---|---|---|---|---|---|
| M1 · The ML Lifecycle and the Project | ⬜ | ⬜ | — | — | ✅ 10 Q |
| M2 · Environment Setup | ⬜ | ⬜ | ✅ | ⬜ | ✅ 12 Q |
| M3 · From Data to Model | ⬜ | ⬜ | ✅ | ⬜ | ✅ 12 Q |
| M4 · Packaging and Serving | ⬜ | ⬜ | ✅ | ⬜ | ✅ 12 Q |
| M5 · CI Pipelines with GitHub Actions | ⬜ | ⬜ | ✅ | ⬜ | ✅ 12 Q |
| M6 · Deploying on Kubernetes | ⬜ | ⬜ | ✅ | ⬜ | ✅ 12 Q |
| M7 · Monitoring and Autoscaling | ⬜ | ⬜ | ✅ ✅ two labs | ⬜ | ✅ 14 Q |
| M8 · GitOps with Argo CD | ⬜ | ⬜ | ✅ | ⬜ | ✅ 12 Q |
| M9 · Appendix A — MLOps Foundations | ⬜ | ⬜ | — | — | ✅ 14 Q |
| M10 · Appendix B — ML Algorithms | ⬜ | ⬜ | — | — | ✅ 12 Q |

**Remaining: 10 lesson pages, 10 deep-dive pages.**

Suggested order: M2 before M1. M2 is a vertical slice with a real lab behind it, so it proves
the lesson-to-lab seam. M1 is pure concept and reads better once the shape of the later lessons
is settled.

### Lab validation

The nine labs were written from verified commands, and Labs 2 to 8 carry real captured output.
None of them have been re-run against a live cluster as part of this site build, so the
`Lab validated` column stays ⬜ until `lab-validation` runs.

`lab_09_gitops_argocd` (M8) is the one to validate first. It was written from transcripts with
no captured command output, so it deliberately describes what to look for instead of showing
`[sample output]` blocks. Run it live and fold the real output back in. Do not close those gaps
by generating plausible-looking output.

## Phase — Planned, not started

**Module 11 — Drift, Gates and the Closed Loop.** Five labs on Argo Rollouts, metric-gated
promotion, drift detection, environment overlays, and automated retraining. Source manifests
identified and verified against `joevisco1/MLOps-Kubernetes-KEDA-Argo`. See
`Content/Labs/MODULE-11-SOURCES.md`.

Out of scope for this build. Add as `m11` in `course.config.json` and re-scaffold once the labs
are written.

## Phase — Ship

- ⬜ Create `402-mlops-src`, `402-mlops-labs`, `402-mlops-site` under `schoolofdevops`
- ⬜ Repo Settings → Pages → Source = GitHub Actions
- ⬜ Push with a `workflow`-scoped token (a plain `repo` PAT is rejected)
- ⬜ Confirm the Actions run is green and the site is live at
      https://schoolofdevops.github.io/402-mlops-site/
- ⬜ Live verification pass
