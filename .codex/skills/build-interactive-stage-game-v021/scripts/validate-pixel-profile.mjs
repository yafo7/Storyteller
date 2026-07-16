#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const rootArg = args.find((arg) => !arg.startsWith('--'));

if (!rootArg) {
  console.error('Usage: node validate-pixel-profile.mjs <project-root> [--strict]');
  process.exit(2);
}

const root = path.resolve(rootArg);
const failures = [];
const results = [];
const requiredTileLayers = ['ground', 'terrain', 'structure', 'props', 'overhead', 'lighting'];
const requiredLogicLayers = ['collision', 'portals', 'triggers', 'interaction', 'spawns', 'npc-routes'];

function read(relative, required = false) {
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

function expect(ok, artifact, field, expected) {
  if (!ok) failures.push({ file: artifact, field, expected });
}

const charterPath = 'generated/00-brief/production-charter.json';
const stagePath = 'generated/40-world/stage-plan.json';
const artPath = 'generated/50-art/art-bible.json';
const manifestPath = 'generated/50-art/asset-manifest.json';
const buildPath = 'generated/60-build/production.json';

const charter = read(charterPath, true);
if (charter) {
  expect(charter.runtimeProfile === 'offline-top-down-pixel-narrative', charterPath, 'runtimeProfile', 'offline-top-down-pixel-narrative');
  expect(charter.visualProfile === 'original-classic-handheld-pixel-rpg', charterPath, 'visualProfile', 'original-classic-handheld-pixel-rpg');
  expect(charter.cameraProfile === 'orthographic-top-down-with-frontal-faces', charterPath, 'cameraProfile', 'orthographic-top-down-with-frontal-faces');
  expect([8, 16, 24, 32].includes(charter.gridProfile?.tileSize), charterPath, 'gridProfile.tileSize', '8, 16, 24, or 32');
  expect(charter.gridProfile?.integerScaleOnly === true, charterPath, 'gridProfile.integerScaleOnly', true);
  expect(charter.gridProfile?.movement === 'four-direction', charterPath, 'gridProfile.movement', 'four-direction');
  expect(charter.gridProfile?.interaction === 'facing-tile', charterPath, 'gridProfile.interaction', 'facing-tile');
  expect(charter.originalityPolicy?.allowFranchiseAssetImitation === false, charterPath, 'originalityPolicy.allowFranchiseAssetImitation', false);
  expect(charter.originalityPolicy?.requireOriginalCharactersMapsTilesUi === true, charterPath, 'originalityPolicy.requireOriginalCharactersMapsTilesUi', true);
}

const stage = read(stagePath, strict);
if (stage) {
  const profile = stage.renderProfile || {};
  expect(profile.view === 'orthographic-top-down', stagePath, 'renderProfile.view', 'orthographic-top-down');
  expect([8, 16, 24, 32].includes(profile.tileSize), stagePath, 'renderProfile.tileSize', 'supported logical tile size');
  expect(profile.integerScale === true, stagePath, 'renderProfile.integerScale', true);
  expect(profile.cameraSnap === 'integer-pixel', stagePath, 'renderProfile.cameraSnap', 'integer-pixel');
  expect(Array.isArray(stage.maps) && stage.maps.length > 0, stagePath, 'maps', 'at least one tile map');
  for (const map of stage.maps || []) {
    expect(Number.isInteger(map.tileGrid?.width) && map.tileGrid.width > 0, stagePath, `${map.id}.tileGrid.width`, 'positive integer');
    expect(Number.isInteger(map.tileGrid?.height) && map.tileGrid.height > 0, stagePath, `${map.id}.tileGrid.height`, 'positive integer');
    expect(map.tileGrid?.tileSize === profile.tileSize, stagePath, `${map.id}.tileGrid.tileSize`, profile.tileSize);
    for (const layer of requiredTileLayers) expect(map.tileLayers?.includes(layer), stagePath, `${map.id}.tileLayers`, `include ${layer}`);
    for (const layer of requiredLogicLayers) expect(map.logicLayers?.includes(layer), stagePath, `${map.id}.logicLayers`, `include ${layer}`);
  }
}

const art = read(artPath, strict);
if (art) {
  const pixel = art.pixelRules || {};
  expect([8, 16, 24, 32].includes(pixel.nativeTileSize), artPath, 'pixelRules.nativeTileSize', 'supported logical tile size');
  expect(Number.isInteger(pixel.paletteBudget) && pixel.paletteBudget >= 8 && pixel.paletteBudget <= 64, artPath, 'pixelRules.paletteBudget', 'integer from 8 to 64');
  expect(pixel.nearestNeighbor === true, artPath, 'pixelRules.nearestNeighbor', true);
  expect(pixel.integerScale === true, artPath, 'pixelRules.integerScale', true);
  expect(Array.isArray(pixel.prohibited) && pixel.prohibited.includes('smoothing'), artPath, 'pixelRules.prohibited', 'include smoothing');
}

const manifest = read(manifestPath, strict);
if (manifest) {
  expect(Array.isArray(manifest.assets) && manifest.assets.length > 0, manifestPath, 'assets', 'at least one asset');
  for (const asset of manifest.assets || []) {
    if (!['approved', 'waived'].includes(asset.status)) {
      failures.push({ file: manifestPath, asset: asset.id, issue: 'asset is not approved or waived' });
    }
    expect(Boolean(asset.pixelSpec), manifestPath, `${asset.id}.pixelSpec`, 'pixel specification');
    expect(asset.pixelSpec?.nearestNeighbor === true, manifestPath, `${asset.id}.pixelSpec.nearestNeighbor`, true);
    expect(Array.isArray(asset.pixelSpec?.nativeDimensions), manifestPath, `${asset.id}.pixelSpec.nativeDimensions`, '[width, height]');
  }
}

const build = read(buildPath, strict);
if (build) {
  const renderer = build.rendererProfile || {};
  expect(renderer.mode === 'top-down-tilemap', buildPath, 'rendererProfile.mode', 'top-down-tilemap');
  expect(renderer.movement === 'four-direction', buildPath, 'rendererProfile.movement', 'four-direction');
  expect(renderer.sampling === 'nearest-neighbor', buildPath, 'rendererProfile.sampling', 'nearest-neighbor');
  expect(renderer.cameraSnap === 'integer-pixel', buildPath, 'rendererProfile.cameraSnap', 'integer-pixel');
}

console.log(JSON.stringify({ root, strict, status: failures.length ? 'fail' : 'pass', results, failures }, null, 2));
process.exitCode = failures.length ? 1 : 0;
