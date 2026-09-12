#!/usr/bin/env bash
# Re-apply local deviations from the CourseSmith scaffold template.
# The scaffold engine regenerates site/docusaurus.config.ts and
# .github/workflows/deploy.yml, so run this after every scaffold run.
set -euo pipefail
cd "$(dirname "$0")/.."

# 1. This course deploys from a single public repo, not the three-repo layout,
#    so use GitHub's official Pages actions with the built-in GITHUB_TOKEN.
cat > .github/workflows/deploy.yml <<'YAML'
name: Deploy course site

# Single-repo publish: this repo builds site/ and deploys it straight to GitHub
# Pages using the built-in GITHUB_TOKEN. No personal access token required.
# Setup (once): repo Settings -> Pages -> Source = GitHub Actions.
#
# NOTE: the CourseSmith scaffold regenerates this file with a three-repo
# variant. Re-run scripts/patch-scaffold.sh after any scaffold run.

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    name: Build site
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: site
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: site/package-lock.json
      - name: Install dependencies
        run: npm ci
      - name: Build
        run: npm run build
      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          # path is relative to the repo root, not the job working-directory
          path: site/build

  deploy:
    name: Deploy to Pages
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy
        id: deployment
        uses: actions/deploy-pages@v4
YAML

# 2. Docusaurus parses .md as MDX by default, which breaks on ${{ }} in the CI
#    lab and <pod-name> in the Kubernetes lab. Parse .md as CommonMark instead.
# 3. projectName must match pages.baseUrl or GitHub Pages serves a 404.
python3 - <<'PY'
import pathlib
d = pathlib.Path('site/docusaurus.config.ts'); s = d.read_text()
s = s.replace("projectName: '402-mlops',", "projectName: '402-mlops-site',")
if "format: 'detect'" not in s:
    s = s.replace("markdown: { mermaid: true,", "markdown: { format: 'detect', mermaid: true,")
d.write_text(s)
assert "402-mlops-site" in s and "format: 'detect'" in s, "patch failed"
print("docusaurus.config.ts patched")
PY

echo "scaffold patches re-applied"
