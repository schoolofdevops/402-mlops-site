# CourseSmith Whiteboard Deck — Style Contract

The founder's slide style: a hand-drawn whiteboard sketch on white paper. Cursive handwriting, black ink, gray pencil, wobbly boxes, sketchy arrows. Nothing else. This document is the contract every CourseSmith explainer deck must satisfy. Reference implementations: `303-containerai/site/static/decks/*.html` (note: 303 used CDNs — new decks must not, see §8) and `304-kubeadv/site/static/decks/m1-reconciliation-engine.html` (fully self-contained).

---

## 0. The slide shape (founder directive, 2026-07-21 — visual-first)

Slides carry pictures; the narration carries the words. Every content slide follows one shape, in
this order:
1. **Title** — big ink handwriting, one line, states the point (not the topic).
2. **Subtitle** — ONE line of gray handwriting, ≤80 characters: a single framing sentence in
   spoken register. Omit it entirely when the visual already carries the idea. Never a
   paragraph, never a recap of what the lab/lesson said — facts and numbers belong inside the
   visual as labels, not in subtitle prose. (Founder-rejected anti-pattern, 2026-07-25:
   130–260-char multi-line subtitles that shrink the visual.)
3. **ONE dominant visual** — a drawn diagram or scene occupying the majority of the remaining
   area, pastel-accented per §1, with short handwritten labels and at most one colored payoff
   annotation (green good / red bad).

**Title-slide balance (founder, 2026-07-25):** the title slide carries a real scene visual too —
never text-only. Scale the title font by length so it wraps ≤2 lines (≤40 chars → 2.1em,
≤60 → 1.8em, longer → 1.55em) and guarantee the scene a band:
`.reveal .slides section:first-of-type svg{ min-height:32% }`. A long title at full size
squeezes the flexed SVG to a strip — the exact regression caught on 305-llmops M7.

**Anchored layout (founder, 2026-07-25):** title anchors to the TOP, the subtitle anchors to the
BOTTOM edge, and the visual centers in the band between (`section{justify-content:flex-start}`,
`svg{flex:1; margin:auto 0; max-height:68%}`, `p.s{order:3; margin:0}` — and
`Reveal.initialize({display:'flex'})`, because Reveal writes `config.display` as an INLINE style
on visible slides and the default `'block'` silently disables the flex column). The subtitle
reads as a caption under the picture, pinned to the slide's bottom, never hugging the image.

No bullet lists. No second paragraph. If an idea needs more, it needs more slides — split the
visual into a build across slides instead of adding text. The narration carries everything else.

**Coverage beats economy — there is NO slide-count cap.** The deck must give every major concept
in its lesson a slide of its own (the sequence spec's coverage check is a hard gate: list each
lesson section/concept → the slide(s) that teach it → no orphans). A slide teaching two ideas at
once is a defect: split it into a build. Twenty-five visual slides beat fourteen crowded ones.

**Density check (305-llmops M1, 2026-08-10) — run this before generating HTML.** A narration
segment is not automatically one slide's worth of content. Before locking slide count, scan every
segment for: (1) parallel items named in sequence, each with its own sub-explanation — one slide
per item, never a shared table of rows; (2) two paired/contrasted quantities sharing one canvas as
half-width panels — give each its own full-width slide unless the side-by-side comparison IS the
point; (3) an explicit "let me give you an analogy" cue with no dedicated scene slide; (4) a
mechanism named only abstractly (labeled boxes, no real data) — add a worked-example slide with one
concrete instance; (5) multi-step maths or a formula narrated as a derivation — never show it
pre-solved on one static slide, build it fragment by fragment, one step per sentence; (6) abstract
labels standing in for a worked example (a box titled `per-token cost` with no number is parroting
narration into a shape, not illustrating it) — pull a REAL number from the module's `lab.md` where
one exists, and build one continuous worked example across the whole sequence. ≥2 minutes of
narration (≈260+ words at 130 wpm) on one static visual is the objective trigger to re-check
against these six. Also check slide ORDER: narration markers must be non-decreasing against deck
pageno order (live-sequential recording is the default assumption — a backward jump is a live bug,
not a callback; reorder the deck or give a recap its own slide instead). Full detail + precedent:
deck-author skill §2.1a–§2.1b.

## 1. Palette — ink + gray linework, five pastel fills

```css
:root{
  --ink:#1e1e1e;    /* primary strokes, headings, emphasized labels */
  --gray:#757575;   /* secondary strokes, subtitles, annotations, de-emphasis */
  --paper:#ffffff;  /* background — always plain white */
}
```

- **Pastel accent fills (founder directive, 2026-07-21).** Linework stays ink/gray, but shapes MAY
  take soft pastel FILLS to emphasize meaning on the otherwise black-and-white page. The palette
  (the classic diagram pastels) and its semantics:

  ```css
  --p-green:#d5e8d4;   /* good · healthy · used-well · pass        */
  --p-red:#f8cecc;     /* bad · full · waste · fail · warning      */
  --p-blue:#dae8fc;    /* neutral data · the thing being studied   */
  --p-orange:#ffe6cc;  /* caution · attention · in-between states  */
  --p-purple:#e1d5e7;  /* special · meta · management/control      */
  ```

  Rules: fills are ALWAYS these five pastels (no saturated colors, no gradients); stroke stays
  `--ink` (or `--gray` for de-emphasis); text on a pastel fill stays ink/gray. Colored ANNOTATION
  text is allowed sparingly for the payoff line of a diagram — muted green `#2e7d32` for the good
  reading, muted red `#c62828` for the bad reading — one or two short labels per slide, never body
  text. Semantic consistency across the whole deck matters more than variety: green always means
  good, red always means bad/full. Entities that merely *are* (a service, a store, a component
  chosen by fit rather than judged good/bad) stay NEUTRAL — outline-only or `--p-blue` as "the
  thing being studied" — never green/red, which would smuggle in a verdict.
- Emphasis hierarchy: **pastel fill** (what to look at) → **ink vs gray** → **stroke weight**
  (3 → 2.2) → **solid vs dashed** → **bold labels**.
- The only extra value allowed is `#bdbdbd` for the page number (a faded pencil mark).
- No emoji, no icons, no images. If a concept needs a picture, draw it as a wobbly SVG sketch.

## 2. Typography — Patrick Hand everywhere

- One typeface for the entire deck, **including all SVG text**: `'Patrick Hand', cursive` (Google's handwriting face, 400 weight; bold is faux-bolded by the browser and looks right).
- The font is **inlined as a base64 woff2 data URI** (latin subset, ~19 KB) — see §8. Never loaded from a CDN.
- HTML type scale (reveal base font-size 42px):
  - `h2.t` title — `1.75em` (title/closing slides may inline `2.3em`)
  - `p.s` subtitle — `0.95em`, gray (title slide may inline `1.2em` — a size allowance only; the ≤80-char length rule applies to EVERY slide, title and closing included)
  - `.kicker` — `.8em`, gray, `letter-spacing:2px`, ALL CAPS
  - `.credit` — `.85em`, gray, `<b>` names in ink
  - `.pageno` — `.6em`, `#bdbdbd`
- SVG text classes (px sizes are relative to a `viewBox` ~1100 wide):
  - `.lbl` — ink 21px (standard label) · `.lbl-b` — ink 23px bold (box titles, key terms)
  - `.lbl-sm` — ink 17px (dense/secondary) · `.lbl-g` — gray 17px (annotations, arrow captions)
  - `.num` — ink 24px bold (numbered circles)
- `code` renders in Patrick Hand too — on a whiteboard, code is just handwriting.

## 3. Slide anatomy

Every content slide is exactly this stack, vertically centered on a 1280×720 canvas:

```html
<section>
  <h2 class="t">Canonical Technical Term</h2>
  <p class="s">Short reinforcing phrase.</p>
  <svg viewBox="0 0 1100 380" role="img" aria-label="…">…</svg>
  <div class="pageno">M1·04</div>
</section>
```

- **Title** (`h2.t`): a sentence with a verb ("Scheduler binds, kubelet makes it real"), not a noun phrase ("The Scheduler").
- **Subtitle** (`p.s`): ONE line, ≤80 chars (§0) — a single framing sentence, or omitted when the visual covers it; may carry the "N of M" marker for multi-slide build-ups.
- **Diagram** (`svg`): the slide's body. `width:100%; flex:1; max-height:68%` — the autofit script (§9) shrinks it if text wraps.
- **Takeaway: REMOVED (founder, 2026-07-25).** The `→ ` exit-line predated the visual-first pivot and had become a second text band. Do NOT emit `p.takeaway` on slides — the exit line lives in the NARRATION (per-slide closing sentence) and in the sequence spec's Takeaway column (presenter guidance only). Any load-bearing fact it would have carried goes into the SVG as a label. The freed height goes to the visual: `svg{max-height:68%}`.
- **Pageno** (`.pageno`): `M<module>·<nn>`, bottom-right, faded.
- **Title & closing slides** carry `.kicker` above the title and `.credit` below the diagram:
  - kicker: `MODULE 1 · KUBERNETES INTERNALS` (context breadcrumb, ALL CAPS)
  - credit: `<b>Gourav Shah</b> · School of DevOps &amp; AI · Lesson + Lab + Quiz` (title) / `Now open <b>Module N · Lab</b>. · <b>Gourav Shah</b> · School of DevOps &amp; AI` (closing)
- **Content slides never carry `.kicker`.** A per-slide breadcrumb repeating the section name on
  every slide reads as clutter — it duplicates the title without adding information (founder
  correction, 2026-08-05, after a 307-aipython M1 draft added a kicker to every content slide).
  `.kicker` is reserved for the title slide (course/module breadcrumb) and the closing slide
  only. Use a **divider slide** (below) to mark a section boundary instead.
- Slide count: **no cap** (see §0 — coverage beats economy). One idea per slide; typical decks land 13–20.

## 3a. Section divider slides

Every lesson ships with numbered `##` sections (e.g. `## 1. Why learn Python when agents write
Python?`). The deck must give the learner the same map: **one divider slide per lesson section**,
inserted immediately before that section's first content slide. A divider carries the section
title and nothing else — no subtitle, no visual, no kicker:

```html
<section>
  <h2 class="t" style="font-size:2.2em">1 &middot; Why learn Python when agents write Python?</h2>
  <div class="pageno">M1&middot;06</div>
</section>
```

- **Title text matches the lesson's `##` header, verbatim** (numeral, middle-dot, then the
  header text) — the deck and the lesson must use the exact same words for the exact same
  section, or the learner cannot map one to the other. Propagate any header rename in either
  direction immediately (same propagation rule as the voice pipeline — see `deck-author`
  SKILL.md).
- **The leading numeral follows DECK presentation order, not lesson.md's document order.**
  A deck is allowed to teach lesson sections in a different sequence than they appear in the
  lesson (e.g. explaining chunking before the vector database it feeds, because that reads
  better as a build-up) — the deck-author is not required to walk `##` headers in file order.
  When that happens, number the dividers by where they actually sit in the deck (1, 2, 3… in
  presentation order), never by the lesson section's own number. Caught on the 305-llmops
  rollout (2026-08-06): a deck that taught §5 before §3/§4 shipped dividers numbered
  1, 2, 5, 3, 4, 6, 7, 8 — the learner sees them out of sequence scrolling through, which
  defeats the whole point of a navigable divider. Title TEXT still mirrors the lesson header
  verbatim either way — only the numeral is deck-order, not lesson-order.
- **No visual, no subtitle, no kicker.** The `h2.t` alone (bumped to ~2.2em so it reads as a
  break, not just another title) is the whole slide. Long titles wrap to 2–3 lines and stay
  centered — do not shrink the font to force one line.
- **Centering needs an explicit rule — do not assume the base skeleton does it for you.**
  Verified on the 305-llmops rollout (2026-08-05): the base `section{ justify-content:
  flex-start }` layout does NOT auto-center a lone `h2.t`, it hugs the top. Give the `<section>`
  a `class="divider"` and add this once per deck (each deck is self-contained, so the rule is
  copied into every deck's own `<style>` block, not shared):
  ```css
  .reveal .slides section.divider{ justify-content:center; align-items:center; }
  .reveal .slides section.divider h2.t{ order:0; font-size:2.2em; max-width:88%; }
  ```
- **`Reveal.initialize({...})` MUST include `display: 'flex',` as its first key, or the CSS
  above does nothing (304-kubeadv M1, 2026-08-12).** reveal.js sets the active slide's `display`
  from `Reveal.getConfig().display` as an INLINE style, not from CSS cascade — default `'block'`
  silently defeats every `order`/`justify-content` rule above and renders the divider in plain
  DOM order (title first/huge, image last/small), with CSS and HTML that both read as correct.
  Only a rendered screenshot catches this. `templates/deck/deck-skeleton.html.tmpl` has carried
  the fix as its first `Reveal.initialize` key since before this course's build — this only
  bites a deck hand-copied before that line existed, or copy-pasted from an older sibling deck
  instead of a fresh skeleton copy. Verify: `grep -c "display: 'flex'" deck.html` must be ≥1.
- **Once a divider has an image (§5a), the `<h2 class="t">` NEVER carries an inline
  `style="font-size:..."` attribute (304-kubeadv M2–M11, 2026-08-12).** The example above (no
  image) is the only case that gets the inline `style="font-size:2.2em"` — it's a fallback for
  when there's no CSS class rule to size it. Once an illustration is added and the deck's
  `.divider.h2.t` gets the smaller override rule (§5a, `order:2; font-size:1.1em; max-width:76%`),
  a leftover inline style on the `<h2>` overrides that CSS rule regardless of cascade order or
  specificity — inline always beats an external stylesheet — and the title renders at the old
  huge size again, silently defeating the whole point of the image pass. This shipped broken
  across 10 modules (M2-M11) in one rollout because the mechanical/divider-class fix stage
  copied the bare-divider markup verbatim (inline style included) and the later image-insertion
  stage never removed it. Rule: the moment a divider gets `class="divider"` treatment intended
  to carry an image, its `<h2>` must be plain `<h2 class="t">` — size lives in CSS only, never
  inline. Verify by rendering (a CSS/HTML read won't catch this — see §5a's render-check note).
- **Once a divider has an image (§5a), drop the leading numeral from the `h2.t` title text
  (304-kubeadv, 2026-08-12; reference: `305-llmops/site/static/decks/m1-concepts.html`, no
  divider carries a numeral).** The numeral prefix (`1 · `, `2 · `) exists to give a **text-only**
  divider a wayfinding cue — once the illustration itself makes the slide visually distinct at a
  glance, the numeral is redundant clutter competing with the image for attention. Keep the
  numeral ONLY on dividers that ship with no illustration; strip it the moment `§5a`'s image pass
  reaches that slide. Title text otherwise stays verbatim to the lesson's `##` header (middle-dot
  numeral removed, everything after it unchanged).
- The module's intro/destination section (a lesson's unnumbered lead-in, if it has one — e.g.
  "Where this course ends" / "What are we building in this course?") gets a divider too, placed
  right after the title slide.
- **Do not skip this for a short module.** Even a 2-section lesson gets 2 dividers — the
  mechanism is what lets a learner jump straight to a section from the deck, not a nice-to-have
  for long decks only.
- **The one exception (founder-approved, 2026-08-06): a section with ZERO dedicated deck
  content may skip its divider if an adjacent mandatory slide already carries its function.**
  The proven case: a lesson's closing "what you'll do next" / lab-bridge section — concept
  decks don't cover lab content, so that section has no content slides to introduce, and the
  deck's own closing slide (`.kicker`="…TAKEAWAYS", credit line pointing to the lab) already
  performs the hand-off. Adding a bare divider right before/after it would announce a section
  and then show nothing new. This is narrow: apply it ONLY when the section truly has zero
  deck content of its own, never as a shortcut for a section that does. Document every skip
  explicitly as its own coverage-table row ("no divider — closing slide covers hand-off"),
  never as a silent omission — a reviewer must be able to see the decision was made on purpose.
- Number the divider into the same `.pageno` sequence as every other slide (it is a real slide,
  not a decoration) — see the coverage/sequence-spec rules in §2, which must list divider slides
  as their own rows.

## 4. SVG hand-drawn idioms — how to fake the wobble

The sketch effect comes from one shared filter plus disciplined stroke style — not from hand-tracing paths.

**The `#rough` filter** (declared once, in a hidden `<svg width="0" height="0">` before `.reveal`):

```xml
<filter id="rough" x="-5%" y="-5%" width="110%" height="110%">
  <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="7" result="n"/>
  <feDisplacementMap in="SourceGraphic" in2="n" scale="2.6" xChannelSelector="R" yChannelSelector="G"/>
</filter>
```

Rules:

- Apply `filter="url(#rough)"` to **shape groups only** (`<g filter="url(#rough)" fill="none" stroke=…>`), **never to text** — wobbled text is illegible; Patrick Hand already looks handwritten.
- Author geometry as clean `<rect rx="8–14">`, `<circle>`, `<ellipse>`, `<line>`, `<path>` — the filter supplies the jitter. Always `fill:none`, `stroke-linecap:round`.
- Extra hand-drawn cues, used sparingly:
  - **Slight irregularity by intent**: vary box widths/heights a little across a row; don't grid-align everything to the pixel.
  - **Curved connectors**: prefer a gentle `C` curve over a ruler-straight line for long arrows (`d="M290,105 C400,105 420,175 448,190"`).
  - **Path jitter**: for a deliberately rough single stroke (a cross-out, an underline), draw it at a slight angle (`M120,180 L480,95`) instead of horizontal.
- Stroke vocabulary (semantics, not decoration):
  - ink `stroke-width:3` — the slide's protagonist box
  - ink `2.4–2.8` — normal structure
  - gray `2–2.4` — secondary structure
  - `stroke-dasharray:"9 7"` — soft/negated/conditional ("the old assumption", a rule box)
  - `stroke-dasharray:"4 6"` or `"5 5"` — boundaries and watch/read relations
- **Arrows**: never `fill`-triangle markers. Two shared open-chevron markers:

```xml
<marker id="ah"  markerWidth="14" markerHeight="14" refX="8" refY="5" orient="auto" markerUnits="userSpaceOnUse">
  <path d="M0,0 L10,5 L0,10" fill="none" stroke="#1e1e1e" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
</marker>
<marker id="ahg" …same with stroke="#757575" stroke-width="2"…/>
```

  `#ah` (ink) = action/causation; `#ahg` (gray) = secondary flow/fan-out. Dashed gray + `#ahg` = watch/observe.
- **Label placement**: box title (`.lbl-b`/`.lbl`) centered in the upper third of its box, gray detail lines below it, ~28–35px line pitch; arrow captions (`.lbl-g`) floated just above (or straddling above/below) the arrow midpoint; `text-anchor="middle"` for boxed labels, `start` for list rows.
- **Recurring visual patterns** (reuse before inventing): fan-out (1 source → N targets → converge), two-panel comparison, big-box anatomy (outer box + 4 inner boxes), numbered rows (circles 1–5 — the "what you'll learn"/"takeaways" idiom), pipeline with hop-by-hop fragments, hub-and-spoke, staircase/ladder, crossed-out-old → boxed-new.
- Canvas: `viewBox="0 0 1100 300–400"`. Include `role="img"` and a full-sentence `aria-label` on every diagram.

## 5. Sequence spec convention (authoring order: spec → HTML)

Every deck is planned first in `<planning>/decks/<module>-sequence.md` (in 303 this lived in `decks/`; use the template `sequence.md.tmpl`). The spec is the review artifact — get it approved, then build the HTML. It contains:

1. **Header paragraph** — which lesson the deck maps to, the style contract reference, and the one-line narrative arc (`A → B → C`).
2. **Slide table** — one row per slide with columns: `#`, `Slide` (title), `Purpose` (what the learner must get), `Visual` (the diagram pattern + fragment count), `Takeaway` (the exit line — NARRATION/presenter guidance only, never rendered on the slide). A **divider slide** (§3a) is still one row — `Visual` reads `— (divider)` and `Purpose` names the lesson section it opens.
3. **Recommended presentation order** — a paragraph of presenter guidance: where to linger, what to compress under time pressure, which slides are one continuous build-up.
4. **Fragment map** — which slides build up and in how many steps; which are static and why.
5. **Coverage check** — a hard table: every lesson section/concept → slide number(s), closed with an
   explicit "no orphans" statement. This is a GATE (§0): an orphan concept means adding a slide, not
   a justification. A slide with no lesson anchor gets cut.

## 6. Fragment usage — diagram build-up

- Fragments exist for **one purpose**: revealing a diagram hop-by-hop so the presenter narrates causality. Wrap each reveal step in `<g class="fragment">…</g>` (arrow + the node it reaches + its caption together).
- The pre-fragment state must already be a coherent picture (the starting node(s) visible).
- Use natural document order; add `data-fragment-index` only when reveal order must differ from it.
- Comparison slides, contract/rule slides, and anatomy slides stay **static** — they read better whole.
- Never use fragments on bullet text for its own sake; this is a diagram deck, not a bullet deck.

## 7. reveal.js configuration (fixed)

```js
Reveal.initialize({
  width: 1280, height: 720, margin: 0.04,
  minScale: 0.2, maxScale: 2.0,
  hash: true,            // deep links per slide
  center: false,         // sections are flex-centered by our CSS instead
  slideNumber: false,    // we draw our own .pageno
  transition: 'slide',
  controlsTutorial: true
});
```

Plus the **autofit script** (see skeleton): after `ready`/`slidechanged`/`resize`, shrink the current slide's SVG `max-height` from 58% downward until nothing overflows.

## 8. Self-contained rule (new courses — hard requirement)

303 loaded reveal.js, its white theme, and Patrick Hand from CDNs. **New decks must make zero external requests**:

- **reveal.js 5.x runtime inlined**: paste `dist/reset.css` and `dist/reveal.css` into `<style>` blocks and `dist/reveal.js` into a `<script>` block (source from the course site's `node_modules/reveal.js/dist/`). Do **not** inline a reveal theme — the whiteboard CSS block *is* the theme (it sets `.reveal-viewport{background:var(--paper)}` and base font-size 42px).
- **Patrick Hand inlined**: latin-subset woff2 fetched once from Google Fonts (`https://fonts.googleapis.com/css2?family=Patrick+Hand` → follow the latin `fonts.gstatic.com` URL), base64-encoded into `src:url(data:font/woff2;base64,…) format('woff2')`. Latin subset only (~14 KB raw / ~19 KB base64) is sufficient.
- **Verification gate** before publish:
  - `grep -E 'src="http|href="http|url\(http' deck.html` → must return nothing (comment URLs are fine; loadable refs are not).
  - Tag-balance check (e.g. Python `HTMLParser` walk) → no mismatches.
  - Total file size **< 800 KB** (typically ~220 KB: runtime ~165 KB + font ~19 KB + slides).
- Decks live in `site/static/decks/` and are embedded by the lesson page; they must also open as a bare `file://` URL with no network.

## 9. File layout of a finished deck

```
<!DOCTYPE html><html><head>
  <title>{Course} — Module N: {Module title}</title>
  <style>…reset.css…</style>
  <style>…reveal.css…</style>
  <style>…@font-face data URI + whiteboard contract CSS…</style>
</head><body>
  <svg width="0" height="0">…#rough filter + #ah/#ahg markers…</svg>
  <div class="reveal"><div class="slides">
    <section>…title slide…</section>
    <section>…content slides…</section>
    <section>…closing slide…</section>
  </div></div>
  <script>…reveal.js…</script>
  <script>…Reveal.initialize (§7)…</script>
  <script>…autofit…</script>
</body></html>
```

Use `deck-skeleton.html.tmpl` in this directory as the starting point — it already contains all of the above with `{{course.title}}` / `{{module.title}}` tokens and two example slides.
