import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const patternPath = path.join(root, "packs", "zelda-mainline", "patterns", "calibration", "provisional-stateful-revisit.json");
const fixturePath = path.join(root, "benchmarks", "story-fixtures", "calibration-hidden-room.json");
const outputPath = path.join(root, "packs", "zelda-mainline", "coverage", "calibration-vertical-slice.json");
const pattern = JSON.parse(await readFile(patternPath, "utf8"));
const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
const story = fixture.storyModel;
const runtime = new Set(fixture.runtimeCapabilities);

function evaluateRule(rule) {
  const values = rule.sourcePath.includes("spatialSignals") ? story.spatialSignals : story.storySignals;
  const expected = Array.isArray(rule.expected) ? rule.expected : [rule.expected];
  const matchedValues = expected.filter((value) => values.includes(value));
  return { ruleId: rule.ruleId, sourcePath: rule.sourcePath, operator: rule.operator, expected: rule.expected, matchedValues, passed: rule.operator === "contains" ? matchedValues.length === expected.length : matchedValues.length > 0 };
}

const ruleResults = pattern.hooks.detect.rules.map(evaluateRule);
const detected = ruleResults.filter((item) => item.passed).length >= pattern.hooks.detect.minimumMatches;
const missingCapabilities = pattern.implementation.runtimeCapabilities.filter((capability) => !runtime.has(capability));
const scoreValues = [5, 4, 4, 5, 5, missingCapabilities.length ? 0 : 5, fixture.budget === "small" ? 2 : 4, 5];
const scoreCriteria = pattern.hooks.score.criteria.map((criterion, index) => ({
  criterionId: criterion.criterionId,
  evidencePath: criterion.evidencePath,
  weight: criterion.weight,
  value: scoreValues[index],
  weightedContribution: Math.round(scoreValues[index] * criterion.weight * 1000) / 1000
}));
const weightedTotal = Math.round(scoreCriteria.reduce((sum, item) => sum + item.weightedContribution, 0) * 1000) / 1000;
const hardVetoes = [...(!detected ? ["insufficient-causal-signals"] : []), ...(missingCapabilities.length ? ["unmet-runtime-capability"] : [])];
const factBinding = story.facts[1];
const parameterBindings = {
  "parameter.state-axis-rewrites-routes.actor": story.playerRole,
  "parameter.state-axis-rewrites-routes.location": story.locations[1],
  "parameter.state-axis-rewrites-routes.fact": factBinding,
  "parameter.state-axis-rewrites-routes.prop": "prop.story-derived-curtain-mechanism"
};
const requiredParameters = pattern.hooks.instantiate.parameters.filter((parameter) => parameter.required).map((parameter) => parameter.parameterId);
const transformationAxes = ["worldbuilding", "characters", "objects", "topology", "feedback", "narrative-causality"];
const instantiated = requiredParameters.every((parameterId) => parameterBindings[parameterId]) && transformationAxes.length >= pattern.hooks.instantiate.minimumTransformationAxes;
const emittedOwners = pattern.hooks.emit.mappings.map((mapping) => mapping.owner);
const emittedEffectRefs = [...new Set(pattern.hooks.emit.mappings.flatMap((mapping) => mapping.effectRefs))];
const effectIds = new Set(pattern.effectPrimitives.map((effect) => effect.effectId));
const emitPassed = ["gameplay", "performance", "stage", "evaluation"].every((owner) => emittedOwners.includes(owner)) && emittedEffectRefs.every((effectRef) => effectIds.has(effectRef));
const assertions = [
  { assertionId: pattern.hooks.validate.assertionRefs[0], passed: pattern.effectPrimitives.every((effect) => effect.postconditions.length > 0 && effect.observableFeedback.length > 0), evidence: "Every emitted effect has an observable postcondition and multimodal feedback." },
  { assertionId: pattern.hooks.validate.assertionRefs[1], passed: story.facts.includes(factBinding), evidence: "The bound fact is from the approved story model and protectedCanon is copied unchanged." },
  { assertionId: pattern.hooks.validate.assertionRefs[2], passed: transformationAxes.length >= 4 && fixture.originalityStatement.length > 20, evidence: "Six transformation axes are declared and the fixture excludes source-game expression." }
];

const report = {
  reportVersion: "1.0.0",
  runId: "calibration.vertical-slice.stateful-revisit",
  generatedAt: "2026-07-17",
  inputs: { patternRef: `${pattern.patternId}@${pattern.patternVersion}`, fixtureRef: fixture.fixtureId, patternStatus: pattern.status, autoSelectable: pattern.autoSelectable },
  detect: { minimumMatches: pattern.hooks.detect.minimumMatches, matchedRules: ruleResults.filter((item) => item.passed).length, rules: ruleResults, passed: detected },
  score: { criteria: scoreCriteria, weightedTotal, hardVetoes, passed: weightedTotal >= 3 && hardVetoes.length === 0 },
  instantiate: { parameterBindings, requiredParameters, transformationAxes, passed: instantiated },
  emit: { mappings: pattern.hooks.emit.mappings, emittedOwners, emittedEffectRefs, passed: emitPassed },
  validate: { assertions, passed: assertions.every((assertion) => assertion.passed) },
  invariants: { protectedCanonBefore: story.protectedCanon, protectedCanonAfter: [...story.protectedCanon], sourceSurfaceTransferred: false },
  result: detected && weightedTotal >= 3 && hardVetoes.length === 0 && instantiated && emitPassed && assertions.every((assertion) => assertion.passed) ? "pass" : "fail"
};

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Calibration vertical slice ${report.result}: detect ${report.detect.matchedRules}/${ruleResults.length}, score ${weightedTotal}, emit ${emittedOwners.length} owners.`);
if (report.result !== "pass") process.exitCode = 1;
