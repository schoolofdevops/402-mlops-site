# planning/decks/ — deck sequence specs + style contract

Each module's whiteboard **concept deck** is authored spec-first:

1. `mN-sequence.md` — the slide sequence spec (one line per slide: title + what it shows + the fragment
   build-up), written before any HTML.
2. Then the self-contained deck HTML in `site/static/decks/mN-<slug>.html`, built from the CourseSmith
   deck skeleton and satisfying the whiteboard style contract.

The whiteboard style contract (palette, Patrick Hand typography inlined as a data URI, self-contained /
no-external-ref rule, fragment reveals) is CourseSmith `templates/deck/whiteboard-style-guide.md`. The
deck skeleton is `templates/deck/deck-skeleton.html.tmpl`; the sequence-spec skeleton is
`templates/deck/sequence.md.tmpl`. Decks embed in the lesson via `<Slides>`.
