---
sidebar_position: 1
title: Prerequisites
---

# Prerequisites

Before you start **Ultimate DevOps to MLOps Bootcamp**, make sure both **you** and **your machine** are ready. This page
covers what you should already know, what hardware you need, and how to get the course repository. The
next page — [Environment](environment.md) — covers installing and verifying every tool.

## What you should already know

This course is written for **DevOps and platform engineers supporting ML workloads, backend engineers moving toward ML infrastructure, and data scientists who want their models to reach production.**. Concretely, you should be comfortable with:

- Comfortable working on a command line
- Basic Git — clone, commit, push, branch
- Able to read Python, though you will not be asked to write much of it
- No machine learning background required
- No Kubernetes background required

{/*
  AUTHORING: replace prereq_knowledge_md with a short bulleted list of concrete, verifiable skills the
  learner must already have (framed as "you can X without a reference"), plus a one-line pointer to a
  foundational course if they don't. Keep it domain-specific to this course — do NOT re-teach it here.
*/}

## System requirements

Every lab in this course runs **locally** unless a module states otherwise — see the Environment page for
the exact per-tool requirements.

| Requirement | Minimum | Recommended |
|---|---|---|
| RAM | 8Gi | 16Gi |
| CPU | 4 | 8 |
| Free disk | 20Gi | 40Gi |
| OS | macOS 13+, Windows 10/11 with WSL2, or a recent Linux (Ubuntu 22.04+, Fedora 39+) | — |

Supported architectures: Apple Silicon (arm64) and Intel/AMD (amd64). On Windows, labs run **inside
WSL2** (Ubuntu recommended) — a native PowerShell shell is not a supported lab shell.

## Get the course repo

All labs live in one repository. Clone it now:

```bash
git clone https://github.com/schoolofdevops/402-mlops-labs.git
cd 402-mlops-labs
```

:::warning[Every lab command runs from the repo root]

Unless a lab explicitly says otherwise, **every command in every lab assumes your current directory is
the root of this repo** (the `402-mlops-labs/` directory you just entered). If a command fails with "No
such file or directory", you are probably in the wrong directory — `cd` back to the repo root.

:::

:::warning[Clone under your home directory]

Clone the repo under your **home directory**, not `/tmp` or a system path. If any part of the lab
environment shares host files into a VM (for example a container runtime running in a lightweight VM, or
WSL2), only certain host paths are shared into that VM — your home directory almost always, `/tmp` and
system paths often not. A repo outside the shared paths can fail environment creation with a cryptic
timeout because a mounted file silently becomes an empty directory inside the VM.

:::

## Repo layout — where you'll live

```text
402-mlops-labs/
├── labs/
│   ├── clusters/     # environment-profile library (if this course uses shared environments)
│   ├── tools/        # any live domain tooling shipped with the course
│   └── mN/           # per-module materials: manifests/configs + checks.json
└── ...               # (site source + planning docs live in the private src repo, not here)
```

{/*
  AUTHORING: adjust this tree to the actual labs/ layout this course scaffolds. Keep it to the two or
  three directories a learner actually touches. Never reference the private src repo here.
*/}

## Next step

Head to [Environment](environment.md) to install the toolchain and run the verification probe. Do not
start Module 1 until every probe command passes.
