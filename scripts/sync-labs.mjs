// sync-labs — copy this course's labs/ tree verbatim into the PUBLIC labs repo
// checkout (the repo learners clone). Paths stay identical, so lab commands are
// unchanged. Node built-ins only; run from the course root after each module
// completes:
//
//   node scripts/sync-labs.mjs <path-to-labs-repo-checkout>
//
// Then commit + push inside the labs repo checkout.
import { cpSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';

const dest = process.argv[2];
if (!dest) {
  console.error('usage: node scripts/sync-labs.mjs <path-to-labs-repo-checkout>');
  process.exit(1);
}
const destRoot = resolve(dest);
if (!existsSync('labs') || !existsSync('course.config.json')) {
  console.error('run from the course root (needs ./labs and ./course.config.json)');
  process.exit(1);
}
if (!existsSync(destRoot)) {
  console.error(`labs repo checkout not found: ${destRoot}`);
  process.exit(1);
}

// Runtime artifacts a learner generates locally — never belong in the public repo.
// "Verbatim" means the AUTHORED tree, not whatever the author's machine happens to
// have lying around from running the labs.
const EXCLUDE_NAMES = new Set([
  '.venv', 'venv', '__pycache__', 'node_modules', '.DS_Store',
  '.env', 'events.jsonl',
]);
const EXCLUDE_EXTS = new Set(['.pyc']);
function isRuntimeArtifact(path) {
  const name = basename(path);
  if (EXCLUDE_NAMES.has(name)) return true;
  const dot = name.lastIndexOf('.');
  if (dot !== -1 && EXCLUDE_EXTS.has(name.slice(dot))) return true;
  return false;
}

// Verbatim mirror: prune, then copy — the labs repo tree must exactly match ./labs,
// minus runtime artifacts (see isRuntimeArtifact above).
rmSync(join(destRoot, 'labs'), { recursive: true, force: true });
cpSync('labs', join(destRoot, 'labs'), {
  recursive: true,
  filter: (src) => !isRuntimeArtifact(src),
});

// Slim README (only when the repo has none — never clobber a curated one).
const readme = join(destRoot, 'README.md');
if (!existsSync(readme)) {
  const cfg = JSON.parse(readFileSync('course.config.json', 'utf8'));
  const site = `${cfg.pages.url}${cfg.pages.baseUrl}`;
  writeFileSync(readme, `# ${cfg.course.title} — labs

Lab materials for **${cfg.course.title}** (${cfg.course.organization}).

- **Course site:** ${site}
- Clone this repo, then follow the setup pages on the site. Every lab command
  assumes your current directory is the root of this repo.
`);
}

console.log(`labs/ synced → ${join(destRoot, 'labs')}`);
