# Simulator Toolkit — conventions for course simulators

A **simulator** is a small interactive that teaches the *model* behind a concept — the learner drives it,
sees cause and effect, and builds intuition a static diagram can't give. It is optional per module; the
module author flags a concept as sim-worthy when hands-on manipulation of the model clearly beats reading.

Simulators live in `site/static/sims/mN-<slug>.html` and embed in the lesson via `<Embed>`:

```mdx
import Embed from '@site/src/components/Embed';

<Embed src="/sims/mN-<slug>.html" title="<Concept> Playground" ratio="16 / 9" />
```

This document is the contract every simulator must satisfy. It is topic-agnostic — the *mechanism* a sim
visualizes is course-specific, the conventions below are not. It is the reference the future
`sim-author` skill generates against.

---

## 1. Self-contained, single file, zero external refs

One `.html` file. All CSS and JS inlined; any font as a base64 data URI. **No CDN, no external
`<script src>`, no external `<link>`, no network fetch at runtime.** The sim must render identically
offline and inside the Docusaurus `<Embed>` iframe. This is a hard verification gate.

## 2. Affordance rule — every element is interactive or visibly inert

Every on-screen element is either clearly interactive (cursor, hover state, obvious control) **or**
visibly inert (read-only panels styled with `cursor:default`, labeled as status/output). A learner must
never wonder "can I click this?" Read-only status cards and the event log are deliberately styled as
non-interactive so the interactive controls stand out.

## 3. Fluid scaling with `clamp()` — no fixed pixel layout

The sim renders in iframes from ~620px wide up to a full 2560px screen (and fullscreen via the Embed
toolbar). Scale type and layout fluidly:

```css
/* fluid type scale: floor small, grow to a cap */
html{font-size:clamp(10.5px, 0.4vw + 9.1px, 16px)}
/* fluid grid columns */
#main{grid-template-columns:clamp(236px, 20.5rem, 340px) 1fr}
```

Use `rem`/`em` off the fluid root, `clamp()` on structural widths. `body{overflow:hidden}` and a
flex/grid column that fills `height:100%` so the sim fits its frame without page scroll.

## 4. `prefers-reduced-motion`

Honor the OS setting — kill animations and transitions for learners who ask for it:

```css
@media (prefers-reduced-motion: reduce){
  *{animation:none !important; transition:none !important}
}
```

## 5. TRY-THIS challenge

A guided challenge banner drives the learner through a short sequence of steps (dots that light up as
each is completed), ending in a success state. It turns "here's a toy" into "do this, notice that." One
challenge per sim, 2–4 steps, with a clear success message that states the takeaway.

## 6. Event log

A read-only, scrolling stream that narrates what the model just did in the domain's own vocabulary (the
way the real tool would log it — a command line, an API event, a state transition). It makes the
invisible mechanism legible: the learner acts, the log shows the consequence. Styled as inert (rule 2).

## 7. Honest-model footnote

Every sim carries a short, visible footnote stating it is a **teaching model, not the real system** —
what it simplifies and what it omits. Learners must never mistake the sim's simplified dynamics for exact
production behavior. One or two honest sentences; do not oversell fidelity.

## 8. Headless-Chrome assertion harness

Every sim ships with an automated check that loads the file in headless Chrome and asserts its core
invariants (it renders without console errors, the challenge can be completed, the event log responds to
input, no external request is attempted). This is the sim's regression test — it runs in the build gate.
Keep assertions behavioral (what the learner sees), not implementation-coupled.

---

## Palette / visual language note

Sims share a coherent dark technical palette (deep navy panels, one or two accents, semantic ok/warn/bad
colors) so all of a course's sims read as a family, and so the sim's visual language can mirror any live
domain tool the course ships (`labs/tools/`): the sim teaches the model, the live tool shows reality, and
they should look like two views of the same thing.
