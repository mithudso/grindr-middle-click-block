#!/usr/bin/env node
// Fail CI when the docs drift from the source.
//
// Index rot is quiet — a reference that lists functions which no longer exist is
// worse than no reference, because it is trusted. These checks are cheap and run
// on every push.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'Grindr Middle-Click Block.user.js'), 'utf8');
const problems = [];

// 1. Every named function is documented in the source itself.
const lines = src.split('\n');
const undocumented = [];
lines.forEach((l, i) => {
  const m = l.match(/^\s*(?:async\s+)?function\s+(\w+)\s*\(/);
  if (!m) return;
  const prev = (lines[i - 1] || '').trim();
  if (!prev.startsWith('//')) undocumented.push(`${i + 1}: ${m[1]}`);
});
if (undocumented.length) {
  problems.push(`${undocumented.length} function(s) with no description above them:\n    ${undocumented.join('\n    ')}`);
}

// 2. The version agrees in all THREE places it is written.
// SCRIPT_VERSION is the one the running script reports — it is what the HUD shows
// and what every diagnostic capture is stamped with. v0.52.0 shipped with the
// header bumped and this constant left behind, so a capture from that install was
// labelled 0.51.0 and would have sent a later diagnosis after the wrong version.
// The header alone is not enough to check.
const headerVersion = (src.match(/@version\s+([0-9.]+)/) || [])[1];
const pkgVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const runtimeVersion = (src.match(/const SCRIPT_VERSION\s*=\s*'([0-9.]+)'/) || [])[1];
if (headerVersion !== pkgVersion) {
  problems.push(`version mismatch: @version is ${headerVersion}, package.json is ${pkgVersion}`);
}
if (runtimeVersion !== headerVersion) {
  problems.push(`version mismatch: SCRIPT_VERSION is ${runtimeVersion}, @version is ${headerVersion} — the running script would report the wrong version in the HUD and in every diagnostic capture`);
}

// 3. The function reference is in step with the source.
const refPath = join(root, 'docs', 'function-reference.md');
if (!existsSync(refPath)) {
  problems.push('docs/function-reference.md is missing — run scripts/gen-function-reference.mjs');
} else {
  const ref = readFileSync(refPath, 'utf8');
  const declared = Number((ref.match(/\| functions \| (\d+) \|/) || [])[1]);
  const actual = (src.match(/^\s*(?:async\s+)?function\s+\w+\s*\(/gm) || []).length;
  if (declared !== actual) {
    problems.push(`docs/function-reference.md lists ${declared} functions, the source has ${actual} — regenerate it`);
  }
}

// 4. Every doc the README links to exists.
const readme = readFileSync(join(root, 'README.md'), 'utf8');
for (const [, link] of readme.matchAll(/\]\((docs\/[^)]+|\.github\/[^)]+)\)/g)) {
  if (!existsSync(join(root, link))) problems.push(`README links to ${link}, which does not exist`);
}

// 5. No real-looking identifiers crept back into tracked docs or source.
//    Placeholders use the 4/5/6/8 hundred-million ranges on purpose.
const idFiles = ['Grindr Middle-Click Block.user.js', 'README.md',
  'docs/grindr-dom-and-api.md', 'docs/external-calls.md', 'docs/ARCHITECTURE.md'];
for (const f of idFiles) {
  const p = join(root, f);
  if (!existsSync(p)) continue;
  for (const [, id] of readFileSync(p, 'utf8').matchAll(/\b(\d{9,10})\b/g)) {
    if (!/^[456]00000\d{3}$/.test(id) && !/^800000\d{3}$/.test(id) && id !== '2147483600') {
      problems.push(`${f}: ${id} looks like a real identifier — use a placeholder`);
    }
  }
}

if (problems.length) {
  console.error('Docs are out of step with the source:\n');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}
console.log('Docs check passed: functions documented, version consistent, reference current, links resolve, no real identifiers.');
