#!/usr/bin/env node
// Regenerate docs/codebase-overview.md and docs/high_signal_file_index.json.
//
// Every tracked file must carry a purpose. A file map that silently omits things
// is worse than none, because it is trusted — so an undescribed file fails here.
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

// -z so filenames containing spaces survive.
const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0').filter(Boolean);

const PURPOSE = {
  'Grindr Middle-Click Block.user.js': 'The entire userscript. One IIFE: observation (patched fetch/XHR/WebSocket), actuation (block queue, greet flow, album rotation, DOM sweep), and surface (hotkeys, HUD, diagnostic recorder).',
  'README.md': 'Project overview, feature table, HUD, console API, and what the tests deliberately do not cover.',
  'package.json': 'Scripts only — check / test / verify. No dependencies.',
  'LICENSE': 'MIT.',
  'CONTRIBUTING.md': "How to change a matcher without repeating this project's history: read the interaction library first, never match by substring, refuse rather than guess.",
  'CODE_OF_CONDUCT.md': "Conduct, plus the non-negotiable rule about not posting other people's identifiers.",
  '.editorconfig': 'Cross-editor formatting.',
  '.gitattributes': 'Line endings and binary markers.',
  '.nvmrc': 'Pinned Node major for CI.',
  '.gitignore': 'Ignore rules, including local captures and the identifier mapping.',
  'docs/ARCHITECTURE.md': 'Layers, the identity problem and how it is resolved, the two block tiers, the enforcement sweep, and the decisions worth knowing.',
  'docs/DEVELOPMENT.md': 'The edit-verify-paste-record loop, repo layout, conventions, and debugging aids.',
  'docs/INSTALLATION.md': 'Install, verify, first-run setup, upgrade, and a real uninstall including stored state.',
  'docs/TESTING.md': 'What the suite covers, why coverage is not a line percentage, and what is left to live verification.',
  'docs/SECURITY.md': 'Threat model. The interesting risks are acting on the wrong profile and the page abusing our own functions.',
  'docs/logging.md': 'Levels, why every line reaches the recorder before the verbosity gate, the partitioned buffer, and what is never logged.',
  'docs/external-calls.md': 'Every request the script makes, its failure handling, the rate limiter, auth handling, and the localStorage keys.',
  'docs/grindr-dom-and-api.md': 'The interaction library: observed routes, DOM shapes, endpoints and traps, each with how it was confirmed.',
  'docs/function-reference.md': 'Every named function, generated from source.',
  'docs/codebase-overview.md': 'This file map.',
  'docs/high_signal_file_index.json': 'Machine-readable index of the same, for retrieval.',
  'test/stubs.cjs': 'Minimal browser stubs. Deliberately dumb: every DOM query returns empty, so tests exercise logic rather than a simulated page.',
  'test/load.test.cjs': 'Boots the whole IIFE — catches "the script dies at document-start", which a syntax check cannot.',
  'test/keymap.test.cjs': 'Hotkey routing, alias matching, rebinding, and pass-through when nothing can be acted on.',
  'test/helpers.test.cjs': 'The pure helpers, imported for real. Each block states why the helper exists and what it must guarantee.',
  'test/regression.test.cjs': 'Bugs that actually shipped, each named in a comment.',
  'test/settings.test.cjs': 'Persisted settings, greetings, block-tier invariants, auto-drain, and the recorder.',
  'scripts/gen-function-reference.mjs': 'Regenerates the function reference from source.',
  'scripts/gen-codebase-index.mjs': 'Regenerates this overview and the file index.',
  'scripts/check-docs.mjs': 'CI drift gate: functions documented, version consistent, reference current, links resolve, no real identifiers.',
  '.github/workflows/ci.yml': 'Syntax check, test suite, docs drift check.',
  '.github/dependabot.yml': 'Actions only — the script has no runtime dependencies.',
  '.github/SECURITY.md': 'How to report, and what is actually worth reporting.',
  '.github/CODEOWNERS': 'Reviewer mapping.',
  '.github/PULL_REQUEST_TEMPLATE.md': 'PR template. Asks for evidence, because "it looks right" has been wrong here.',
  '.github/ISSUE_TEMPLATE/bug_report.md': 'Bug template — asks for a diagnostic capture, redacted.',
  '.github/ISSUE_TEMPLATE/feature_request.md': 'Feature template — asks how it should fail safe.',
  'CLAUDE.md': 'Working rules for agents and contributors: read the interaction library first, and the five rules that came from real failures.',
  'GEMINI.md': 'The same working rules, for Gemini CLI.',
  '.github/copilot-instructions.md': 'The same working rules, for Copilot CLI.',
  'AGENTS.md': 'No repo-local agents. Points at the script\'s own self-diagnosis surfaces, which are what to reach for instead.',
};

const kindOf = (f) =>
  f.endsWith('.user.js') ? 'source'
    : f.startsWith('test/') ? 'test'
      : f.startsWith('scripts/') ? 'script'
        : f.endsWith('.md') ? 'doc' : 'config';

const missing = tracked.filter((f) => !PURPOSE[f]);
const groups = new Map();
for (const f of tracked) {
  const d = dirname(f) === '.' ? '(root)' : dirname(f);
  if (!groups.has(d)) groups.set(d, []);
  groups.get(d).push(f);
}

const out = ['# Codebase overview', '',
  'Every file in the repository and what it is for.', '',
  'Generated by `scripts/gen-codebase-index.mjs`.',
  '`high_signal_file_index.json` is the machine-readable twin.', ''];
const index = [];
for (const d of [...groups.keys()].sort()) {
  out.push(`## \`${d}\``, '', '| File | Purpose |', '|---|---|');
  for (const f of groups.get(d).sort()) {
    const purpose = PURPOSE[f] || '';
    out.push(`| \`${basename(f)}\` | ${purpose} |`);
    let bytes = 0;
    try { bytes = statSync(f).size; } catch { /* deleted between listing and stat */ }
    index.push({ path: f, purpose, bytes, kind: kindOf(f) });
  }
  out.push('');
}

writeFileSync('docs/codebase-overview.md', out.join('\n'));
writeFileSync('docs/high_signal_file_index.json',
  `${JSON.stringify({ generated_by: 'scripts/gen-codebase-index.mjs',
    repo: 'grindr-middle-click-block', files: index }, null, 2)}\n`);
console.log(`indexed ${index.length} files across ${groups.size} directories`);
if (missing.length) {
  console.error('Tracked files with no purpose recorded:');
  for (const f of missing) console.error(`  ${f}`);
  process.exitCode = 1;
}
