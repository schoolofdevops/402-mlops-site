#!/usr/bin/env python3
"""Import the reviewed lab guides and quizzes into the scaffolded site.

Source of truth is Content/Labs and Content/quizzes. Nothing here rewrites
content — labs are copied verbatim under new front matter, and quizzes are
transliterated into the Quiz component's props.

Run from the course repo root:  CONTENT_DIR=../Content python3 scripts/import-content.py
"""

import json
import os
import pathlib
import re
import sys

# Where the reviewed lab guides and quizzes live. Override with CONTENT_DIR.
SRC = pathlib.Path(os.environ.get("CONTENT_DIR", "../Content")).expanduser().resolve()
DOCS = pathlib.Path("site/docs")

# module folder -> (lab source file, sidebar_position, page title suffix)
LABS = {
    "m2-environment-setup": [("lab_02_environment_setup.md", "lab")],
    "m3-data-to-model": [("lab_03_data_to_model.md", "lab")],
    "m4-package-and-serve": [("lab_04_package_and_serve.md", "lab")],
    "m5-ci-pipelines": [("lab_05_ci_pipeline.md", "lab")],
    "m6-deploy-on-kubernetes": [("lab_06_deploy_on_kubernetes.md", "lab")],
    "m7-monitoring-and-autoscaling": [
        ("lab_07_model_monitoring.md", "lab"),
        ("lab_08_autoscaling.md", "lab-autoscaling"),
    ],
    "m8-gitops-with-argocd": [("lab_09_gitops_argocd.md", "lab")],
    "m11-progressive-delivery": [
        ("lab_10_progressive_delivery.md", "lab"),
        ("lab_11_metric_gates.md", "lab-metric-gates"),
        ("lab_12_environments.md", "lab-environments"),
    ],
    "m12-drift-and-retraining": [
        ("lab_13_drift_detection.md", "lab"),
        ("lab_14_closed_loop.md", "lab-closed-loop"),
    ],
}

NO_LAB = ["m1-ml-lifecycle-and-project", "m9-mlops-foundations", "m10-ml-algorithms"]

QUIZZES = {
    "m1-ml-lifecycle-and-project": "section-01-introduction.md",
    "m2-environment-setup": "section-02-environment-setup.md",
    "m3-data-to-model": "section-03-from-data-to-model.md",
    "m4-package-and-serve": "section-04-package-and-serve.md",
    "m5-ci-pipelines": "section-05-ci-pipelines-github-actions.md",
    "m6-deploy-on-kubernetes": "section-06-deploy-on-kubernetes.md",
    "m7-monitoring-and-autoscaling": "section-07-monitoring-and-autoscaling.md",
    "m8-gitops-with-argocd": "section-08-gitops-with-argocd.md",
    "m9-mlops-foundations": "section-09-appendix-a-foundations.md",
    "m10-ml-algorithms": "section-10-appendix-b-algorithms.md",
}

Q_RE = re.compile(r"^\*\*Q\d+\.\s*(.+?)\*\*\s*$")
OPT_RE = re.compile(r"^\s*-\s*([A-Z])\)\s*(.+?)\s*$")
ANS_RE = re.compile(r"^\s*-?\s*\*\*Correct:\s*([A-Z])\*\*\s*(?:[—-]\s*)?(.*)$")


def parse_quiz(path):
    """Return [{prompt, options:[{text, correct, explanation}]}] from a quiz markdown file."""
    questions, cur = [], None
    for raw in path.read_text(encoding="utf-8").splitlines():
        m = Q_RE.match(raw)
        if m:
            if cur:
                questions.append(cur)
            cur = {"prompt": m.group(1).strip(), "opts": {}, "order": [], "correct": None, "why": ""}
            continue
        if cur is None:
            continue
        m = ANS_RE.match(raw)
        if m:
            cur["correct"] = m.group(1)
            cur["why"] = m.group(2).strip()
            continue
        m = OPT_RE.match(raw)
        if m:
            letter, text = m.group(1), m.group(2).strip()
            cur["opts"][letter] = text
            cur["order"].append(letter)
    if cur:
        questions.append(cur)

    out = []
    for q in questions:
        if not q["order"] or q["correct"] is None:
            print(f"  !! skipped malformed question in {path.name}: {q['prompt'][:60]!r}")
            continue
        if q["correct"] not in q["opts"]:
            print(f"  !! correct letter {q['correct']} not among options in {path.name}")
            continue
        options = []
        for letter in q["order"]:
            opt = {"text": q["opts"][letter], "correct": letter == q["correct"]}
            if opt["correct"] and q["why"]:
                opt["explanation"] = q["why"]
            options.append(opt)
        out.append({"prompt": q["prompt"], "options": options})
    return out


def js(value):
    """Emit a JS string literal that is safe inside MDX."""
    return json.dumps(value, ensure_ascii=False)


def render_quiz(title, questions):
    lines = [
        "---",
        "sidebar_position: 90",
        f"title: {js('Quiz: ' + title)}",
        "---",
        "",
        "import Quiz from '@site/src/components/Quiz';",
        "",
        f"# {title} — Quiz",
        "",
        "Answer each question, then press Check. The explanation appears once you have committed to an answer.",
        "",
        "<Quiz questions={[",
    ]
    for q in questions:
        lines.append("  {")
        lines.append(f"    prompt: {js(q['prompt'])},")
        lines.append("    options: [")
        for o in q["options"]:
            parts = [f"text: {js(o['text'])}", f"correct: {str(o['correct']).lower()}"]
            if "explanation" in o:
                parts.append(f"explanation: {js(o['explanation'])}")
            lines.append("      { " + ", ".join(parts) + " },")
        lines.append("    ],")
        lines.append("  },")
    lines.append("]} />")
    return "\n".join(lines) + "\n"


def strip_trailing_tag(text):
    """Remove the Bear-style #courses/mlops tag if one survived into a lab."""
    return re.sub(r"\n#courses/\S+\s*$", "\n", text)


def main():
    if not DOCS.is_dir():
        sys.exit("run me from the course repo root (site/docs not found)")

    lab_count = quiz_count = q_total = 0

    # --- labs -------------------------------------------------------------
    for folder, entries in LABS.items():
        for pos, (src_name, stem) in enumerate(entries, start=2):
            src = SRC / "Labs" / src_name
            if not src.is_file():
                sys.exit(f"missing lab source: {src}")
            body = strip_trailing_tag(src.read_text(encoding="utf-8")).lstrip("\n")
            h1 = body.splitlines()[0].lstrip("# ").strip()
            fm = "\n".join([
                "---",
                f"sidebar_position: {pos}",
                f"title: {js('Lab: ' + h1)}",
                "---",
                "",
            ])
            (DOCS / folder / f"{stem}.md").write_text(fm + body, encoding="utf-8")
            lab_count += 1
            print(f"  lab  {folder}/{stem}.md  <- {src_name}")

    # concept modules carry no lab page at all
    for folder in NO_LAB:
        stub = DOCS / folder / "lab.md"
        if stub.exists():
            stub.unlink()
            print(f"  rm   {folder}/lab.md (concept module, no lab)")

    # --- quizzes ----------------------------------------------------------
    cfg = json.loads(pathlib.Path("course.config.json").read_text(encoding="utf-8"))
    titles = {m["folder"]: m["title"] for m in cfg["modules"]}

    for folder, src_name in QUIZZES.items():
        src = SRC / "quizzes" / src_name
        if not src.is_file():
            sys.exit(f"missing quiz source: {src}")
        questions = parse_quiz(src)
        if not questions:
            sys.exit(f"parsed zero questions from {src}")
        (DOCS / folder / "quiz.mdx").write_text(
            render_quiz(titles[folder], questions), encoding="utf-8"
        )
        quiz_count += 1
        q_total += len(questions)
        print(f"  quiz {folder}/quiz.mdx  <- {src_name}  ({len(questions)} questions)")

    print(f"\nimported {lab_count} labs, {quiz_count} quizzes, {q_total} questions")


if __name__ == "__main__":
    main()
