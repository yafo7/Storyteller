#!/usr/bin/env node

import fs from 'node:fs';

const [designPath, capabilitiesPath] = process.argv.slice(2);
if (!designPath || !capabilitiesPath) {
  console.error('Usage: node check-runtime-capabilities.mjs <gameplay-design.json> <runtime-capabilities.json>');
  process.exit(2);
}

const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const design = read(designPath);
const capabilities = read(capabilitiesPath);
const effects = new Set(capabilities.effects || []);
const verbs = new Set(capabilities.verbs || []);
const requirements = design.runtimeRequirements || [];
const missing = [];

for (const requirement of requirements) {
  const requiredEffects = requirement.effects || requirement.requiredEffects || [];
  const requiredVerbs = requirement.verbs || requirement.requiredVerbs || [];
  const missingEffects = requiredEffects.filter((item) => !effects.has(item));
  const missingVerbs = requiredVerbs.filter((item) => !verbs.has(item));
  if (missingEffects.length || missingVerbs.length) {
    missing.push({ id: requirement.id || 'unnamed', missingEffects, missingVerbs });
  }
}

console.log(JSON.stringify({ checked: requirements.length, missing }, null, 2));
process.exitCode = missing.length ? 1 : 0;
