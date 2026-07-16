#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || process.cwd());
const specs = [
  ['brief', 'generated/00-brief/production-charter.json', ['schemaVersion', 'status', 'sourcePaths']],
  ['story', 'generated/10-story/story-model.json', ['schemaVersion', 'status', 'playerRole', 'facts', 'characters', 'reveals', 'motifs']],
  ['gameplay', 'generated/20-design/gameplay-design.json', ['schemaVersion', 'status', 'experienceGoals', 'coreLoop', 'mechanics', 'interactionTransactions']],
  ['performance', 'generated/30-performance/performance-plan.json', ['schemaVersion', 'status', 'playerKnowledgeAtStart', 'onboarding', 'beats']],
  ['world', 'generated/40-world/stage-plan.json', ['schemaVersion', 'status', 'maps', 'portals', 'stateVariants']],
  ['artBible', 'generated/50-art/art-bible.json', ['schemaVersion', 'status', 'style', 'palette', 'characterRules', 'environmentRules']],
  ['assets', 'generated/50-art/asset-manifest.json', ['schemaVersion', 'status', 'assets']],
  ['build', 'generated/60-build/production.json', ['$schema', 'schemaVersion']],
  ['acceptance', 'reports/acceptance-report.json', ['schemaVersion', 'status', 'gates']]
];

let failures = 0;
const results = [];

for (const [phase, relative, keys] of specs) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) {
    results.push({ phase, file: relative, state: 'pending' });
    continue;
  }
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    const missing = keys.filter((key) => value[key] === undefined);
    const invalidStatus = value.status && !['draft', 'approved', 'blocked', 'pass', 'fail'].includes(value.status);
    if (missing.length || invalidStatus) {
      failures += 1;
      results.push({ phase, file: relative, state: 'invalid', missing, invalidStatus: Boolean(invalidStatus) });
    } else {
      results.push({ phase, file: relative, state: value.status || 'present' });
    }
  } catch (error) {
    failures += 1;
    results.push({ phase, file: relative, state: 'invalid-json', error: error.message });
  }
}

console.log(JSON.stringify({ root, failures, results }, null, 2));
process.exitCode = failures ? 1 : 0;
