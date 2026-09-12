# Legacy Narration Directory

New CourseSmith courses use `planning/voiceover/mN-slide-voiceover.md` through the
`course-slide-voiceover` skill. This directory exists only for older course compatibility.

Do not create lab/deep-dive screencast scripts, demo checklists, shot lists, or fixed hands-on
video plans here.

<!-- Legacy format retained below for courses that have not migrated. -->

**Private. Src repo only — never synced to the public labs repo.** These are the recording
scripts {{course.author}} reads over the whiteboard decks (`site/static/decks/mN-*.html`) when
screen-recording, and later the input to TTS synthesis.

One script per module, matched slide-for-slide to that module's deck and its sequence
spec (`planning/decks/mN-sequence.md`).

## Format (per slide)

```
### Slide N — <deck slide title>   ·   ~<seconds>s

**On screen:** <what the slide shows / which fragment is revealed>

<Narration text. {{course.author}}'s spoken trainer voice — plain, confident, second person.
Conversational, not read-aloud-prose. Contractions fine. Short sentences. The
analogies from the lesson, spoken naturally.>

[pause] where a beat helps the visual land.
```

## Rules

- **Voice = {{course.author}} speaking to a peer.** No AI-slop tells (see `../CLAUDE.md`
  banned list): no "2am", "superpowers", "let's dive in", "here's the thing", breathless
  questions. If a line sounds written, rewrite it spoken.
- **Match the deck exactly** — same slide count, same fragment build-ups. When a slide
  reveals fragments one at a time, the narration paces to them (mark `[click]` at each
  reveal so the recorder knows when to advance).
- **Timing:** 30–60s per slide, ~8–12 min per deck. Total per-deck estimate at top.
- **Pronunciation ledger** at the top of each script: domain terms {{course.author}} says a
  specific way — locked once, consistent across all modules. `FOUNDER-DECIDE:` flags anything
  unconfirmed. The ledger carries forward across modules (continuity protocol).
- **Not the lesson verbatim.** The written lesson reads; the narration is spoken and
  leaner. Reference the lesson for accuracy, rewrite for the ear.
- **Draft until approved.** Header carries a DRAFT/APPROVED line per module; {{course.author}}
  edits before recording. Recording surfaces awkward lines — fold those edits back so the TTS
  version and the human recording use the same approved script.

## Video production map (per module)

Each module is a **series** of videos, not one long recording. Two production modes:
**voiceover-over-slides** ({{course.author}} narrates a whiteboard deck — or TTS later) and
**screencast** ({{course.author}} records a live terminal walkthrough). Asset per video:

| # | Video | Mode | Asset in this repo | Length |
|---|-------|------|--------------------|--------|
| 1 | Concept explainer | VO + deck | `decks/mN-*.html` + `narration/mN-narration.md` | ~10–12 min |
| 2 | Deep dive | Screencast + a few concept slides | `decks/mN-deepdive.html` (short) + `narration/mN-deepdive-screencast.md` (shot-list/talk-track) | ~10–15 min |
| 3 | Case study *(only where a marquee real-world case exists for the module)* | VO + mini-deck | `decks/mN-case-*.html` + `narration/mN-case-narration.md` | ~6–8 min |
| 4 | Lab walkthrough | Screencast | `narration/mN-lab-screencast.md` (talk-track over the validated `lab.md`) | ~20–30 min |

Screencast talk-tracks are **not** full scripts — they are per-step guides: what to
say, what to emphasize, where to pause, which "why" to call out. The `lab.md` /
`deep-dive.md` (with real output already folded) is the spine; the talk-track is the
teaching layer over it. {{course.author}} records these live; TTS does not apply.

Voiceover scripts (concept + case decks) feed both the human recording AND later TTS.

## Status

| Module | Concept | Deep-dive | Case | Lab screencast |
|--------|---------|-----------|------|----------------|
| M1 | ⬜ | ⬜ | — | ⬜ |
