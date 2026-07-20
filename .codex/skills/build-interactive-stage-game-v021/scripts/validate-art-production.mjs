#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const rootArg = args.find((arg) => !arg.startsWith('--'));
if (!rootArg) {
  console.error('Usage: node validate-art-production.mjs <project-root> [--strict]');
  process.exit(2);
}

const root = path.resolve(rootArg);
const failures = [];
const results = [];
const requiredCategories = ['character-identity', 'portrait', 'four-direction-sprite', 'environment-base', 'map-state-variant', 'interactive-prop', 'ui'];
const visualCriteria = ['perspective', 'palette', 'identityOrMaterial', 'detailDensity', 'interactionReadability', 'stateContrast', 'pixelIntegrity', 'nativeScaleReadability'];

function read(relative, required = strict) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) {
    results.push({ file: relative, state: required ? 'missing' : 'pending' });
    if (required) failures.push({ file: relative, issue: 'missing required artifact' });
    return null;
  }
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    results.push({ file: relative, state: value.status || 'present' });
    return value;
  } catch (error) {
    failures.push({ file: relative, issue: `invalid JSON: ${error.message}` });
    return null;
  }
}
function expect(ok, file, field, expected) { if (!ok) failures.push({ file, field, expected }); }
function assetFileExists(asset) { return typeof asset.path === 'string' && fs.existsSync(path.resolve(root, 'generated/50-art', asset.path)); }

const stylePath = 'generated/50-art/style-contract.json';
const coveragePath = 'generated/50-art/asset-coverage.json';
const manifestPath = 'generated/50-art/asset-manifest.json';
const visualPath = 'generated/50-art/visual-validation.json';
const style = read(stylePath);
const coverage = read(coveragePath);
const manifest = read(manifestPath);
const visual = read(visualPath);

if (style) {
  expect(style.status === 'approved', stylePath, 'status', 'approved');
  expect(Boolean(style.styleId), stylePath, 'styleId', 'stable style ID');
  expect(Boolean(style.styleFrameAssetId), stylePath, 'styleFrameAssetId', 'approved style frame ID');
  for (const key of ['perspective','nativeDimensions','palette','pixelLanguage','detailDensity','lighting','prohibitedDrift']) {
    expect(style[key] !== undefined, stylePath, key, 'locked style field');
  }
  expect(style.placeholderPolicy?.allowAtAcceptance === false, stylePath, 'placeholderPolicy.allowAtAcceptance', false);
}

const assets = manifest?.assets || [];
const assetIds = new Set(assets.map((asset) => asset.id));
if (manifest) {
  expect(manifest.status === 'approved', manifestPath, 'status', 'approved');
  for (const category of requiredCategories) expect(assets.some((asset) => asset.category === category), manifestPath, 'assets.category', `include ${category}`);
  for (const asset of assets) {
    expect(Boolean(asset.id), manifestPath, 'asset.id', 'stable ID');
    expect(Boolean(asset.ownerId), manifestPath, `${asset.id}.ownerId`, 'owner ID');
    expect(Boolean(asset.state), manifestPath, `${asset.id}.state`, 'asset state');
    expect(asset.status === 'approved', manifestPath, `${asset.id}.status`, 'approved');
    expect(assetFileExists(asset), manifestPath, `${asset.id}.path`, 'existing file under generated/50-art');
    if (asset.category !== 'reference') {
      expect(asset.productionUse === true, manifestPath, `${asset.id}.productionUse`, true);
      expect(!String(asset.generationMethod).toLowerCase().includes('placeholder'), manifestPath, `${asset.id}.generationMethod`, 'non-placeholder method');
      expect(Array.isArray(asset.referenceAssetIds) && asset.referenceAssetIds.length > 0, manifestPath, `${asset.id}.referenceAssetIds`, 'nonempty approved lineage');
      expect(Array.isArray(asset.qaEvidence) && asset.qaEvidence.length > 0, manifestPath, `${asset.id}.qaEvidence`, 'nonempty visual evidence');
    }
  }
  for (const asset of assets) for (const ref of asset.referenceAssetIds || []) expect(assetIds.has(ref), manifestPath, `${asset.id}.referenceAssetIds`, `resolve ${ref}`);
  if (style) expect(assetIds.has(style.styleFrameAssetId), manifestPath, 'style frame', `include ${style.styleFrameAssetId}`);
}

if (coverage) {
  expect(coverage.status === 'approved', coveragePath, 'status', 'approved');
  expect(Array.isArray(coverage.requirements) && coverage.requirements.length > 0, coveragePath, 'requirements', 'nonempty coverage');
  for (const requirement of coverage.requirements || []) {
    expect(requirement.status === 'approved', coveragePath, `${requirement.id}.status`, 'approved');
    expect(Array.isArray(requirement.producedAssetIds) && requirement.producedAssetIds.length > 0, coveragePath, `${requirement.id}.producedAssetIds`, 'nonempty assets');
    for (const id of requirement.producedAssetIds || []) expect(assetIds.has(id), coveragePath, `${requirement.id}.producedAssetIds`, `resolve ${id}`);
    for (const state of requirement.requiredStates || []) expect((requirement.coveredStates || []).includes(state), coveragePath, `${requirement.id}.coveredStates`, `include ${state}`);
  }
}

if (visual) {
  expect(visual.status === 'pass', visualPath, 'status', 'pass');
  expect(Array.isArray(visual.comparisons) && visual.comparisons.length > 0, visualPath, 'comparisons', 'nonempty comparisons');
  for (const comparison of visual.comparisons || []) {
    expect(assetIds.has(comparison.anchorAssetId), visualPath, `${comparison.id}.anchorAssetId`, 'approved asset ID');
    expect(Array.isArray(comparison.productionAssetIds) && comparison.productionAssetIds.length > 0, visualPath, `${comparison.id}.productionAssetIds`, 'nonempty asset IDs');
    for (const id of comparison.productionAssetIds || []) expect(assetIds.has(id), visualPath, `${comparison.id}.productionAssetIds`, `resolve ${id}`);
    expect(typeof comparison.inEngineScreenshot === 'string' && fs.existsSync(path.resolve(root, comparison.inEngineScreenshot)), visualPath, `${comparison.id}.inEngineScreenshot`, 'existing screenshot');
    for (const criterion of visualCriteria) expect(comparison.criteria?.[criterion] === 'pass', visualPath, `${comparison.id}.criteria.${criterion}`, 'pass');
  }
}

console.log(JSON.stringify({ root, strict, status: failures.length ? 'fail' : 'pass', results, failures }, null, 2));
process.exitCode = failures.length ? 1 : 0;
