# CLAUDE.md — Ultimate DevOps to MLOps Bootcamp (course build)

Project instructions for building this Docusaurus course with CourseSmith. Apply to all work here.

## What this repo is

Course content for **"Ultimate DevOps to MLOps Bootcamp"** (School of DevOps & AI). Audience: DevOps and platform engineers supporting ML workloads, backend engineers moving toward ML infrastructure, and data scientists who want their models to reach production..
Delivered as a Docusaurus site. Per module, the **full set** is authored and every lab is validated
live before publish (see "Per-module deliverables" below).

- **Design spec:** `planning/specs/` (approved). **Config:** `course.config.json`.
- **Build tracker:** `planning/ROADMAP.md`. **Plans:** `planning/plans/`. **Lab evidence:** `planning/lab-tests/`.

## ⛑ Continuity — resuming after a context clear (READ FIRST)

All important state lives on disk; a `/clear` loses nothing.
1. **`CLAUDE.md`** (this file) — index + conventions.
2. **`planning/STATE.md`** — active phase, the NEXT action, locked decisions. A SessionStart hook
   (`.claude/settings.json`) auto-injects it every session.
3. **`planning/ROADMAP.md`** — per-module status.
4. **`planning/lab-tests/*.md`** — captured evidence of what's validated.
5. **`course-resume` skill** — one-step restore + brief.

After every task, UPDATE `planning/STATE.md` and `planning/ROADMAP.md`. Stale state is the only failure mode.

## Publishing — the three-repo rule

This course splits across three repositories so learners get a clean surface and the source stays private:

- **`schoolofdevops/402-mlops-src`** (PRIVATE) — THIS repo: full course source (`site/`, `planning/`,
  `labs/` source of truth, decks/sims). It is never published as-is.
- **`schoolofdevops/402-mlops-labs`** (public) — what LEARNERS clone: the `labs/` tree + a slim README.
  Synced from here on every module completion (copy `labs/` verbatim — paths stay identical, so lab
  commands are unchanged).
- **`schoolofdevops/402-mlops-site`** (public) — the built site ONLY (Pages served from the `gh-pages`
  branch). Deploy = build `site/`, push `site/build/` to that repo's `gh-pages` branch.
- **Live site:** https://schoolofdevops.github.io/402-mlops-site/
- **Learner-facing rule:** docs must NEVER point learners at the src repo — the labs clone is
  `402-mlops-labs`, the content is the rendered site.

## Authoring conventions (fixed)

### Why-first framing (hard rule)
Every concept/section answers **"why do I care — how does this help me at work?"** via a concrete,
realistic scenario from the learner's actual job (an incident, a review, a migration, a postmortem —
whatever is real in this audience's daily work). NEVER frame value as novelty ("most people have never
seen this", "a hidden trick"). The learner's question is *when will I use this*, not *is this obscure*.

### No AI-writing clichés (banned list)
Plain, professional language only. Banned: "2am/3am pages", "superpowers", "let's dive in",
"game-changer", "here's the thing", "unlock", "level up", breathless rhetorical questions, and
dramatized war-story flourishes. Prefer "during an incident", "on call", "in production". If a phrase
sounds like a blog intro, cut it.

### Voice, analogy, diagrams
- Author/trainer voice: **Gourav Shah**. Instructional, second person, confident.
- **Analogy REQUIRED** for every major concept, stated before the technical definition.
- **Diagram REQUIRED** wherever a concept is spatial/flow/architecture (≥1 Mermaid diagram per lesson).
- **Admonitions:** bracket form `:::type[Title]` only. Never the space form (renders literally).

### Quiz
`<Quiz>` from `@site/src/components/Quiz`, 4–6 questions, ≥1 `multiSelect`, every option has an
`explanation`. Keys are `prompt`/`options`/`multiSelect` and `{text,correct,explanation}` — never
`type`/`correctAnswers`/`id`.

### Labs
Every command copy-runnable and actually executed against the real workstation; each command
block is followed by a real **Expected output** block (captured from an actual run, not invented); every
lab ends with **Teardown**. Machine-readable checks live in `labs/mN/checks.json`.

### Whiteboard decks (concept explainers)
Concept decks are hand-drawn whiteboard sketches: cursive handwriting, black ink + one gray, wobbly
boxes, sketchy arrows, plain white paper. No accent colors, no icons, no photos, no external refs — the
deck is a single self-contained HTML file with fonts inlined as data URIs. Full contract:
`planning/decks/whiteboard-style-guide.md` (or the CourseSmith `templates/deck/` skeleton). Decks embed in
the lesson via `<Slides>`.

## Per-module deliverables (the full set)

Every module ships the complete set — none are optional except where noted:

- **Lesson** (`site/docs/mN/lesson.md`, sidebar_position 1) — analogy-first concepts, ≥1 Mermaid,
  the embedded whiteboard **concept deck** (`<Slides>` from `static/decks/`), and an embedded
  **simulator** (`<Embed>` from `static/sims/`) where the concept benefits from one.
- **Lab** (`lab.md`, sidebar_position 2) — validated live, real output folded in, ends with Teardown.
- **Quiz** (`quiz.mdx`, sidebar_position 3).
- **Deep Dive** (`deep-dive.md`, sidebar_position 4) — the advanced Part-2 page (see below), where the
  topic supports going under the hood.
- **Simulator(s)** — self-contained HTML in `static/sims/` (see `SIM-TOOLKIT.md`), optional per module.
- **Narration** — voiceover/screencast scripts in `planning/narration/` (see its README + video map).

### Advanced depth bar (toggle: ON)
When ON: the audience already operates in this domain in production — **never re-teach basics.** Every
module goes under the hood (mechanism-level evidence, failure modes, "what most practitioners don't
know"). Familiar commands are allowed only as scaffolding for deeper observation. Each module ships a
**Deep Dive page** beyond the core lab when the topic supports it, framed as Part 2 — it extends, it does
not repeat. When OFF: teach foundations at the level this audience needs; the Deep Dive page is
optional.

## Lab folding rules (how real output enters the docs)

When you fold captured lab output into `lab.md` / `deep-dive.md`, four rules hold:

1. **Point-in-time.** Captured output is a snapshot of one real run. Never present it as invariant —
   timestamps, generated names, resource IDs, and counts will differ on the learner's machine.
2. **Capture-matches-command.** The Expected-output block under a command must be the actual output of
   *that exact command*, unedited except for the redactions in rule 4. Never hand-write plausible output.
3. **State-tolerant.** Prose around folded output must tolerate the values a learner will actually see —
   describe the *shape* ("a `Running` status", "a non-zero count"), don't hardcode the run-specific value.
4. **Fold-pairing.** Every folded output block is paired to its command block immediately above it; a
   command with no output and an output with no command are both bugs. Redact only genuinely
   host/identity-specific noise, consistently.

## Setup-doc quality bar

`site/docs/setup/{prerequisites,environment}.md` must get a learner from a bare machine to a verified
environment with zero guesswork:
- Exact install steps **per supported OS**, in dependency order.
- A single **verification probe** block (one command per lab tool) plus an expected-output table.
- A troubleshooting section covering the real failures learners hit (see the scaffolded templates —
  keep the environment-specific gotchas relevant to workstation).
- Points the learner at `402-mlops-labs` to clone — never the src repo.

## The project spine

A house price prediction service. One forked repository grown module by module, from raw CSV through to a GitOps-delivered, self-scaling inference service on Kubernetes.

## Lab environment

The lab environment for this course is: workstation. Only the tools below are assumed;
they are verified by the CourseSmith Phase-0 probe and documented on the Environment page.

**Lab tools** (verified by the Phase-0 probe):

- **python** (≥ 3.11) — probe: `python --version`
- **uv** — probe: `uv --version`
- **git** — probe: `git --version`
- **docker** — probe: `docker version --format '{{.Server.Version}}'`
- **kubectl** — probe: `kubectl version --client`
- **kind** — probe: `kind --version`
- **helm** — probe: `helm version --short`
- **hey** — probe: `command -v hey`

- **Spine:** `house-price-predictor/` (A forked project repository grown module by module. Modules 2 and 3 add data, features and a trained model. Module 4 adds Dockerfiles and a compose stack. Module 5 adds .github/workflows. Modules 6 to 8 add deployment/kubernetes, deployment/monitoring and the Argo CD application., grow-in-place)

Learners fork github.com/mlopsbootcamp/house-price-predictor and work in their own fork throughout, because later modules require write access for CI pipelines and GitOps. A three node KIND cluster is built in Module 6 and reused by Modules 7 and 8 without being torn down.

<!--
  Pattern note (not baked): some courses run a single long-lived workstation that many
  modules share and is never torn down between them, with dedicated per-module environments only where
  physically unavoidable. That is a per-course choice — configure it in `course.config.json` lab.spine,
  do not assume it here.
-->
