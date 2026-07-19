import Ajv2020 from "ajv/dist/2020.js";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const libraryRoot = path.resolve(here, "..");
const repoRoot = path.resolve(libraryRoot, "..");
const packRoot = path.join(libraryRoot, "packs", "zelda-mainline");

const option = (name) => process.argv.find((argument) => argument.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const paths = {
  patternSchema: path.join(libraryRoot, "schemas", "design-pattern.schema.json"),
  patterns: path.join(packRoot, "patterns", "released-patterns.json"),
  maturity: path.join(packRoot, "patterns", "maturity-contracts.json"),
  quarantineRegister: path.join(packRoot, "patterns", "quarantine-register.json"),
  observations: path.join(packRoot, "observations", "observation-registry.json"),
  works: path.join(packRoot, "works", "work-registry.json"),
  claims: path.join(packRoot, "claims", "claim-registry.json"),
  fixtures: path.join(libraryRoot, "benchmarks", "fixture-registry.json"),
  originalityCases: path.resolve(option("originality-registry") ?? path.join(libraryRoot, "benchmarks", "originality-case-registry.json")),
  originalityPolicy: path.join(libraryRoot, "governance", "originality-validation-policy.json"),
  retrieval: path.join(libraryRoot, "indexes", "retrieval-index.json"),
  compositionRule: path.join(libraryRoot, "core", "composition-rules", "default-1-plus-3.json"),
  report: path.resolve(option("report") ?? path.join(packRoot, "coverage", "pattern-contract-test-report.json"))
};

const failures = [];
const checks = [];
const diagnostics = [];
const metrics = {};
let activeCheck = "inputs";

function relative(target) {
  return path.relative(repoRoot, target).replaceAll("\\", "/");
}

function fail(code, message, context = {}) {
  failures.push({ checkId: activeCheck, code, message, ...context });
}

function diagnose(code, message, context = {}) {
  diagnostics.push({ checkId: activeCheck, code, message, ...context });
}

async function runCheck(checkId, operation) {
  const start = failures.length;
  activeCheck = checkId;
  try {
    await operation();
  } catch (error) {
    fail("UNCAUGHT_CHECK_ERROR", error instanceof Error ? error.message : String(error));
  }
  checks.push({ checkId, passed: failures.length === start, failureCount: failures.length - start });
}

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function readJsonInput(label, target, missingCode = "INPUT_MISSING") {
  if (!(await exists(target))) {
    fail(missingCode, `${label} is missing at ${relative(target)}.`, { input: relative(target) });
    return null;
  }
  try {
    return JSON.parse(await readFile(target, "utf8"));
  } catch (error) {
    fail("INPUT_INVALID_JSON", `${label} cannot be parsed: ${error.message}`, { input: relative(target) });
    return null;
  }
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueSet(values) {
  return new Set(values);
}

function sameSet(left, right) {
  const a = uniqueSet(left);
  const b = uniqueSet(right);
  return a.size === b.size && [...a].every((value) => b.has(value));
}

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated].sort();
}

function groupBy(values, keyFor) {
  const groups = new Map();
  for (const value of values) {
    const key = keyFor(value);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(value);
  }
  return groups;
}

function meaningful(value, minimum = 1) {
  return typeof value === "string" && value.trim().length >= minimum && !/(?:^|\b)(?:todo|tbd|placeholder)(?:\b|$)|__.+__/i.test(value);
}

function normalizedCriterionId(criterionId, patternId) {
  const slug = patternId.replace(/^pattern\./, "");
  return String(criterionId ?? "")
    .replace(new RegExp(`^criterion\\.${escapeRegex(slug)}\\.`), "criterion.<pattern>.")
    .replace(/criterion\.pattern\.[a-z0-9.-]+\./, "criterion.<pattern>.");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizedScoreShape(pattern) {
  const criteria = array(pattern.hooks?.score?.criteria).map((criterion) => ({
    criterion: normalizedCriterionId(criterion.criterionId, pattern.patternId),
    evidencePath: criterion.evidencePath,
    weight: Math.round(Number(criterion.weight) * 1e9) / 1e9
  })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return JSON.stringify({
    criteria,
    hardVetoes: [...array(pattern.hooks?.score?.hardVetoes)].sort()
  });
}

const effectKinds = [
  "set-fact", "clear-fact", "grant-item", "consume-item", "toggle-map-layer", "set-map-layer", "unlock-route", "lock-route", "reveal-location",
  "spawn-actor", "despawn-actor", "move-actor", "set-npc-state", "set-dialogue-gate", "open-interaction-window", "emit-performance-cue",
  "performance-cue", "world-transaction", "set-checkpoint", "map-transition", "camera-transition"
];

function normalizedPostcondition(value, pattern) {
  let normalized = String(value ?? "").toLowerCase();
  normalized = normalized.replaceAll(pattern.patternId.toLowerCase(), "<pattern>");
  normalized = normalized.replaceAll(pattern.patternId.replace(/^pattern\./, "").toLowerCase(), "<pattern>");
  if (pattern.name) normalized = normalized.replaceAll(pattern.name.toLowerCase(), "<pattern>");
  normalized = normalized.replace(/(?:effect|parameter|assertion)\.[a-z0-9.-]+/g, "<ref>");
  for (const kind of effectKinds) normalized = normalized.replaceAll(kind, "<effect-kind>");
  return normalized.replace(/\d+/g, "<n>").replace(/\s+/g, " ").trim();
}

function recursivelyContains(value, needle) {
  if (typeof value === "string") return value.includes(needle);
  if (Array.isArray(value)) return value.some((item) => recursivelyContains(item, needle));
  if (value && typeof value === "object") return Object.values(value).some((item) => recursivelyContains(item, needle));
  return false;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function canonicalHash(value) {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

function originalityRecords(registry) {
  if (Array.isArray(registry)) return registry;
  return array(registry?.cases ?? registry?.records ?? registry?.originalityCases);
}

function originalityVerdict(record) {
  const nested = record?.blindAttribution ?? record?.blindReview ?? record?.review;
  return String(record?.verdict ?? record?.result ?? record?.outcome ?? record?.status ?? nested?.verdict ?? nested?.result ?? nested?.outcome ?? "").toLowerCase();
}

function isBlindOriginalityCase(record) {
  const nested = record?.blindAttribution ?? record?.blindReview ?? record?.review;
  const mode = String(record?.reviewMode ?? record?.mode ?? record?.method ?? nested?.mode ?? nested?.method ?? "").toLowerCase();
  return record?.blind === true || record?.reviewerBlind === true || nested?.blind === true || mode.includes("blind");
}

let schema = null;
let patterns = null;
let maturity = null;
let quarantineRegister = null;
let observations = null;
let works = null;
let claims = null;
let fixtureRegistry = null;
let originalityRegistry = null;
let originalityPolicy = null;
let retrievalIndex = null;
let compositionRule = null;

await runCheck("inputs.load", async () => {
  schema = await readJsonInput("formal design-pattern schema", paths.patternSchema);
  patterns = await readJsonInput("released pattern registry", paths.patterns);
  maturity = await readJsonInput("pattern maturity contracts", paths.maturity);
  quarantineRegister = await readJsonInput("reviewed pattern quarantine register", paths.quarantineRegister);
  observations = await readJsonInput("observation registry", paths.observations);
  works = await readJsonInput("work registry", paths.works);
  claims = await readJsonInput("claim registry", paths.claims);
  fixtureRegistry = await readJsonInput("fixture registry", paths.fixtures);
  originalityRegistry = await readJsonInput(
    "blind originality case registry",
    paths.originalityCases,
    "ORIGINALITY_CASE_REGISTRY_MISSING"
  );
  originalityPolicy = await readJsonInput("originality phase-boundary policy", paths.originalityPolicy);
  retrievalIndex = await readJsonInput("production retrieval index", paths.retrieval);
  compositionRule = await readJsonInput("composition rule", paths.compositionRule);
});

patterns = array(patterns);
observations = array(observations);
works = array(works);
claims = array(claims);
const patternById = new Map(patterns.map((pattern) => [pattern.patternId, pattern]));
const observationById = new Map(observations.map((observation) => [observation.observationId, observation]));
const workById = new Map(works.map((work) => [work.workId, work]));
const claimById = new Map(claims.map((claim) => [claim.claimId, claim]));
const released = patterns.filter((pattern) => pattern.status === "released" || pattern.autoSelectable === true);
const reviewed = patterns.filter((pattern) => pattern.status === "reviewed");

await runCheck("schema.formal-pattern-contract", async () => {
  if (!schema) return;
  const ajv = new Ajv2020({ strict: true, allErrors: true, validateSchema: true });
  if (!ajv.validateSchema(schema)) {
    fail("PATTERN_SCHEMA_META_INVALID", "Formal pattern schema is not valid Draft 2020-12 JSON Schema.", { errors: ajv.errors });
    return;
  }
  let validate;
  try {
    validate = ajv.compile(schema);
  } catch (error) {
    fail("PATTERN_SCHEMA_STRICT_COMPILE_FAILED", error.message);
    return;
  }
  for (const pattern of patterns) {
    if (!validate(pattern)) {
      fail("PATTERN_SCHEMA_INVALID", `${pattern.patternId ?? "<missing-pattern-id>"} violates the formal schema.`, {
        patternId: pattern.patternId ?? null,
        errors: structuredClone(validate.errors ?? [])
      });
    }
  }
});

await runCheck("maturity.lossless-lowering", async () => {
  const allContracts = Object.values(maturity?.patterns ?? {});
  const contracts = allContracts.filter((contract) => contract.maturity === "release-candidate");
  const archivedContracts = allContracts.filter((contract) => contract.maturity === "reviewed");
  const releasedById = new Map(released.map((pattern) => [pattern.patternId, pattern]));
  if (contracts.length !== released.length) {
    fail("MATURITY_RELEASE_COUNT_MISMATCH", `Maturity contracts (${contracts.length}) and released records (${released.length}) must close one-to-one.`);
  }
  for (const contract of contracts) {
    const pattern = releasedById.get(contract.patternId);
    if (!pattern) {
      fail("MATURITY_PATTERN_NOT_RELEASED", `${contract.patternId}: no released record exists for the maturity contract.`, { patternId: contract.patternId });
      continue;
    }
    const detectRules = array(pattern.hooks?.detect?.rules);
    const requiredSignals = array(contract.selection?.requiredSignals);
    if (detectRules.length !== requiredSignals.length) {
      fail("DETECT_RULE_COUNT_LOSS", `${contract.patternId}: ${requiredSignals.length} maturity signals became ${detectRules.length} detect rules.`, { patternId: contract.patternId });
    }
    if (pattern.hooks?.detect?.minimumMatches !== requiredSignals.length) {
      fail("DETECT_MINIMUM_MATCHES_LOSS", `${contract.patternId}: minimumMatches must equal all ${requiredSignals.length} required maturity signals.`, { patternId: contract.patternId, expected: requiredSignals.length, actual: pattern.hooks?.detect?.minimumMatches });
    }
    requiredSignals.forEach((signal, index) => {
      const lowered = detectRules[index];
      const expected = { sourcePath: signal.path, operator: signal.operator, expected: signal.value };
      const actual = lowered && { sourcePath: lowered.sourcePath, operator: lowered.operator, expected: lowered.expected };
      if (canonicalJson(actual) !== canonicalJson(expected)) fail("DETECT_RULE_SEMANTIC_LOSS", `${contract.patternId}: required signal ${index + 1} was not lowered exactly.`, { patternId: contract.patternId, expected, actual });
    });

    const expectedCriteria = array(contract.selection?.scoreCriteria).map((criterion) => ({
      criterionId: `criterion.${criterion.criterionId.replace(/^score\./, "")}`,
      weight: criterion.weight,
      evidencePath: criterion.path,
      rule: criterion.rule
    }));
    const actualCriteria = array(pattern.hooks?.score?.criteria);
    if (canonicalJson(actualCriteria) !== canonicalJson(expectedCriteria)) fail("SCORE_CRITERION_SEMANTIC_LOSS", `${contract.patternId}: score criterion path, weight, or scoring rule differs from maturity.`, { patternId: contract.patternId, expected: expectedCriteria, actual: actualCriteria });

    const expectedParameters = array(contract.parameters);
    const actualParameters = array(pattern.hooks?.instantiate?.parameters);
    if (canonicalJson(actualParameters) !== canonicalJson(expectedParameters)) fail("PARAMETER_BINDING_SEMANTIC_LOSS", `${contract.patternId}: parameter source path, constraint, type, or required marker differs from maturity.`, { patternId: contract.patternId, expected: expectedParameters, actual: actualParameters });

    const actualTests = new Map(array(pattern.tests).map((test) => [test.testId, test]));
    for (const sourceTest of array(contract.tests)) {
      const loweredTest = actualTests.get(sourceTest.testId);
      if (!loweredTest) {
        fail("MATURITY_TEST_DROPPED", `${contract.patternId}: maturity test ${sourceTest.testId} is missing.`, { patternId: contract.patternId, testId: sourceTest.testId });
        continue;
      }
      if (loweredTest.inputFixtureRef !== sourceTest.fixtureRef) fail("MATURITY_FIXTURE_REF_LOSS", `${contract.patternId}: ${sourceTest.testId} changed fixture ${sourceTest.fixtureRef} to ${loweredTest.inputFixtureRef}.`, { patternId: contract.patternId, testId: sourceTest.testId, expected: sourceTest.fixtureRef, actual: loweredTest.inputFixtureRef });
      const expectedAssertions = array(sourceTest.assertions).map((assertion) => ({ evidencePath: assertion.path, operator: assertion.operator, expected: assertion.expected, hardGate: true }));
      const actualAssertions = array(loweredTest.assertions).map((assertion) => ({ evidencePath: assertion.evidencePath, operator: assertion.operator, expected: assertion.expected, hardGate: assertion.hardGate }));
      if (canonicalJson(actualAssertions) !== canonicalJson(expectedAssertions)) fail("MATURITY_ASSERTION_SEMANTIC_LOSS", `${contract.patternId}: ${sourceTest.testId} assertions differ from maturity.`, { patternId: contract.patternId, testId: sourceTest.testId, expected: expectedAssertions, actual: actualAssertions });
    }
  }
  for (const contract of archivedContracts) {
    const pattern = patternById.get(contract.patternId);
    if (!pattern || pattern.status !== "reviewed" || pattern.autoSelectable !== false || !meaningful(pattern.quarantineReason, 40)) {
      fail("REJECTED_MATURITY_CONTRACT_NOT_QUARANTINED", `${contract.patternId}: rejected release contract must compile to a substantive reviewed quarantine record.`, { patternId: contract.patternId });
    }
  }
});

await runCheck("registry.identity-and-status", async () => {
  for (const patternId of duplicates(patterns.map((pattern) => pattern.patternId))) {
    fail("DUPLICATE_PATTERN_ID", `Pattern ID is duplicated: ${patternId}.`, { patternId });
  }
  for (const pattern of patterns) {
    const releasedStatus = pattern.status === "released";
    const selectable = pattern.autoSelectable === true;
    const unquarantined = pattern.quarantineReason === null;
    if (!(releasedStatus === selectable && selectable === unquarantined)) {
      fail(
        "RELEASE_STATUS_MARKERS_DISAGREE",
        `${pattern.patternId}: status=release, autoSelectable=true, and quarantineReason=null must be equivalent.`,
        { patternId: pattern.patternId, status: pattern.status, autoSelectable: pattern.autoSelectable, quarantineReason: pattern.quarantineReason }
      );
    }
    if (pattern.status === "reviewed" && (pattern.autoSelectable !== false || !meaningful(pattern.quarantineReason, 20))) {
      fail("REVIEWED_PATTERN_NOT_QUARANTINED", `${pattern.patternId}: reviewed records must be non-selectable with a substantive quarantine reason.`, { patternId: pattern.patternId });
    }
    if (pattern.supportClass === "single-title-research-only" && (pattern.status === "released" || pattern.autoSelectable !== false)) {
      fail("SINGLE_TITLE_PATTERN_SELECTABLE", `${pattern.patternId}: single-title research may not be released or auto-selectable.`, { patternId: pattern.patternId });
    }
  }
});

await runCheck("quarantine.register-closure", async () => {
  const registerRecords = array(quarantineRegister?.records);
  const registerById = new Map(registerRecords.map((record) => [record.patternId, record]));
  for (const patternId of duplicates(registerRecords.map((record) => record.patternId))) fail("DUPLICATE_QUARANTINE_REGISTER_ID", `Quarantine register duplicates ${patternId}.`, { patternId });
  if (registerRecords.length !== reviewed.length || registerById.size !== reviewed.length) fail("QUARANTINE_REGISTER_COUNT_MISMATCH", `Quarantine register must close exactly ${reviewed.length} reviewed patterns, not ${registerRecords.length}.`);
  if (!sameSet([...registerById.keys()], reviewed.map((pattern) => pattern.patternId))) fail("QUARANTINE_REGISTER_SET_MISMATCH", "Quarantine register IDs must exactly equal the reviewed pattern set.", { registered: [...registerById.keys()].sort(), reviewed: reviewed.map((pattern) => pattern.patternId).sort() });

  for (const pattern of patterns) {
    if (pattern.status === "released") {
      if (pattern.quarantineReason !== null || array(pattern.quarantineIssueRefs).length !== 0 || pattern.quarantineEvidenceDisposition !== null || pattern.promotionRequirements !== null) {
        fail("RELEASED_PATTERN_HAS_QUARANTINE_FIELDS", `${pattern.patternId}: released patterns must carry only null/empty quarantine fields.`, { patternId: pattern.patternId });
      }
      continue;
    }
    if (pattern.status !== "reviewed") continue;
    const source = registerById.get(pattern.patternId);
    if (!source) continue;
    const expected = {
      quarantineReason: source.quarantineReason,
      quarantineIssueRefs: source.quarantineIssueRefs,
      quarantineEvidenceDisposition: source.evidenceDisposition,
      promotionRequirements: source.promotionRequires
    };
    const actual = {
      quarantineReason: pattern.quarantineReason,
      quarantineIssueRefs: pattern.quarantineIssueRefs,
      quarantineEvidenceDisposition: pattern.quarantineEvidenceDisposition,
      promotionRequirements: pattern.promotionRequirements
    };
    if (canonicalJson(actual) !== canonicalJson(expected)) fail("QUARANTINE_REGISTER_VALUE_LOSS", `${pattern.patternId}: formal quarantine fields do not exactly match quarantine-register.json.`, { patternId: pattern.patternId, expected, actual });
    for (const assertion of array(pattern.tests).flatMap((test) => array(test.assertions))) {
      if (/provenanceClosed/i.test(String(assertion.evidencePath ?? ""))) fail("REVIEWED_PROVENANCE_CLOSED_ASSERTION_FORBIDDEN", `${pattern.patternId}: reviewed records may not assert provenanceClosed.`, { patternId: pattern.patternId, assertionId: assertion.assertionId, evidencePath: assertion.evidencePath });
    }
  }
});

await runCheck("provenance.evidence-closure", async () => {
  for (const pattern of patterns) {
    const provenance = pattern.provenance ?? {};
    const observationRefs = array(provenance.observationRefs);
    const supportingWorkRefs = array(provenance.supportingWorkRefs);
    const counterRefs = array(provenance.counterEvidenceRefs);
    const bounds = array(provenance.counterEvidenceBounds);

    for (const ref of duplicates(observationRefs)) fail("DUPLICATE_SUPPORT_OBSERVATION", `${pattern.patternId}: duplicate supporting observation ${ref}.`, { patternId: pattern.patternId, ref });
    for (const ref of duplicates(supportingWorkRefs)) fail("DUPLICATE_SUPPORT_WORK", `${pattern.patternId}: duplicate supporting work ${ref}.`, { patternId: pattern.patternId, ref });
    for (const ref of duplicates(counterRefs)) fail("DUPLICATE_COUNTEREVIDENCE", `${pattern.patternId}: duplicate counterevidence ${ref}.`, { patternId: pattern.patternId, ref });

    const derivedWorks = [];
    for (const ref of observationRefs) {
      const observation = observationById.get(ref);
      if (!observation) {
        fail("SUPPORT_OBSERVATION_MISSING", `${pattern.patternId}: supporting observation ${ref} does not exist.`, { patternId: pattern.patternId, ref });
        continue;
      }
      if (!workById.has(observation.workId)) fail("OBSERVATION_WORK_MISSING", `${pattern.patternId}: ${ref} points to unknown work ${observation.workId}.`, { patternId: pattern.patternId, ref, workId: observation.workId });
      derivedWorks.push(observation.workId);
    }
    for (const workRef of supportingWorkRefs) {
      if (!workById.has(workRef)) fail("SUPPORT_WORK_MISSING", `${pattern.patternId}: supporting work ${workRef} does not exist.`, { patternId: pattern.patternId, workRef });
    }
    if (!sameSet(derivedWorks, supportingWorkRefs)) {
      fail("SUPPORT_WORK_CLOSURE_FAILED", `${pattern.patternId}: supportingWorkRefs must exactly equal the distinct workIds of observationRefs.`, {
        patternId: pattern.patternId,
        derivedWorkRefs: [...uniqueSet(derivedWorks)].sort(),
        declaredWorkRefs: [...uniqueSet(supportingWorkRefs)].sort()
      });
    }
    if (pattern.status === "released" && uniqueSet(derivedWorks).size < 2) {
      fail("RELEASED_PATTERN_LACKS_TWO_REAL_WORKS", `${pattern.patternId}: released patterns require direct support from at least two real works.`, { patternId: pattern.patternId, supportingWorkCount: uniqueSet(derivedWorks).size });
    }
    if (pattern.supportClass === "single-title-research-only" && uniqueSet(derivedWorks).size !== 1) {
      fail("SINGLE_TITLE_SUPPORT_CLASS_MISMATCH", `${pattern.patternId}: single-title-research-only must close to exactly one work.`, { patternId: pattern.patternId, supportingWorkCount: uniqueSet(derivedWorks).size });
    }

    for (const ref of counterRefs) {
      if (!observationById.has(ref) && !claimById.has(ref)) fail("COUNTEREVIDENCE_MISSING", `${pattern.patternId}: counterevidence ${ref} does not exist.`, { patternId: pattern.patternId, ref });
    }
    const boundRefs = bounds.map((bound) => bound?.evidenceRef);
    for (const ref of duplicates(boundRefs)) fail("DUPLICATE_COUNTEREVIDENCE_BOUND", `${pattern.patternId}: counterevidence bound is duplicated for ${ref}.`, { patternId: pattern.patternId, ref });
    if (!sameSet(counterRefs, boundRefs) || counterRefs.length !== bounds.length) {
      fail("COUNTEREVIDENCE_BOUND_CLOSURE_FAILED", `${pattern.patternId}: counterEvidenceRefs and counterEvidenceBounds must form a one-to-one mapping.`, {
        patternId: pattern.patternId,
        counterEvidenceRefs: counterRefs,
        boundedEvidenceRefs: boundRefs
      });
    }
  }
});

await runCheck("selection.family-role-precedence-exclusion-budget", async () => {
  const maximumSupportCount = compositionRule?.constraints?.maximumSupportCount ?? 3;
  const allowedRoles = new Set(["core", "support", "specialization", "orchestration"]);
  for (const pattern of patterns) {
    const selection = pattern.selection ?? {};
    if (!/^family\.[a-z0-9.-]+$/.test(selection.familyId ?? "")) fail("SELECTION_FAMILY_INVALID", `${pattern.patternId}: selection.familyId is missing or invalid.`, { patternId: pattern.patternId });
    if (!allowedRoles.has(selection.selectionRole)) fail("SELECTION_ROLE_INVALID", `${pattern.patternId}: invalid selectionRole ${selection.selectionRole}.`, { patternId: pattern.patternId });
    const precedence = array(selection.precedence);
    if (!precedence.length || precedence.some((rule) => !meaningful(rule, 12))) fail("SELECTION_PRECEDENCE_NOT_CONCRETE", `${pattern.patternId}: precedence needs at least one concrete, non-template rule.`, { patternId: pattern.patternId });
    if (!Number.isInteger(selection.maxCoSelections) || selection.maxCoSelections < 0 || selection.maxCoSelections > maximumSupportCount) {
      fail("SELECTION_MAX_CO_SELECTIONS_INVALID", `${pattern.patternId}: maxCoSelections must be an integer from 0 through ${maximumSupportCount}.`, { patternId: pattern.patternId, maxCoSelections: selection.maxCoSelections });
    }
    const exclusive = array(selection.exclusiveWith);
    for (const ref of exclusive) {
      if (ref === pattern.patternId) fail("SELECTION_SELF_EXCLUSIVE", `${pattern.patternId}: a pattern cannot exclude itself.`, { patternId: pattern.patternId });
      const peer = patternById.get(ref);
      if (!peer) fail("SELECTION_EXCLUSIVE_REF_MISSING", `${pattern.patternId}: exclusiveWith references missing pattern ${ref}.`, { patternId: pattern.patternId, ref });
      else if (!array(peer.selection?.exclusiveWith).includes(pattern.patternId)) fail("SELECTION_EXCLUSION_NOT_RECIPROCAL", `${pattern.patternId} and ${ref} must declare exclusion reciprocally.`, { patternId: pattern.patternId, ref });
    }
  }
  const families = groupBy(released.filter((pattern) => pattern.selection?.familyId), (pattern) => pattern.selection.familyId);
  for (const [familyId, members] of families) {
    if (members.length < 2) continue;
    const subtypeIds = members.map((member) => member.selection.subtypeId);
    if (subtypeIds.some((id) => !meaningful(id, 3)) || uniqueSet(subtypeIds).size !== members.length) {
      fail("RELEASED_FAMILY_SUBTYPES_NOT_DISCRIMINATED", `${familyId}: multiple releasable patterns require unique, concrete subtypeIds.`, { familyId, patternIds: members.map((member) => member.patternId) });
    }
    const precedenceShapes = members.map((member) => JSON.stringify(array(member.selection.precedence).map((rule) => rule.trim().toLowerCase()).sort()));
    if (uniqueSet(precedenceShapes).size !== members.length) {
      fail("RELEASED_FAMILY_PRECEDENCE_COLLISION", `${familyId}: releasable family members must not share an identical precedence contract.`, { familyId, patternIds: members.map((member) => member.patternId) });
    }
  }
});

await runCheck("hooks.emit-and-parameter-use", async () => {
  const hookNames = ["detect", "score", "instantiate", "emit", "validate"];
  const releasedOwners = ["gameplay", "performance", "stage", "compile", "evaluation"];
  for (const pattern of patterns) {
    const hooks = pattern.hooks ?? {};
    for (const hook of hookNames) if (!hooks[hook] || typeof hooks[hook] !== "object") fail("HOOK_MISSING", `${pattern.patternId}: missing ${hook} hook.`, { patternId: pattern.patternId, hook });
    const effectIds = new Set(array(pattern.effectPrimitives).map((effect) => effect.effectId));
    const parameters = array(hooks.instantiate?.parameters);
    const parameterIds = new Set(parameters.map((parameter) => parameter.parameterId));
    const mappings = array(hooks.emit?.mappings);

    for (const effect of array(pattern.effectPrimitives)) {
      for (const parameterRef of array(effect.parameters)) if (!parameterIds.has(parameterRef)) fail("EFFECT_PARAMETER_REF_MISSING", `${pattern.patternId}: ${effect.effectId} references undeclared parameter ${parameterRef}.`, { patternId: pattern.patternId, effectId: effect.effectId, parameterRef });
    }
    for (const mapping of mappings) {
      for (const effectRef of array(mapping.effectRefs)) if (!effectIds.has(effectRef)) fail("EMIT_EFFECT_REF_MISSING", `${pattern.patternId}: ${mapping.mappingId} references missing effect ${effectRef}.`, { patternId: pattern.patternId, mappingId: mapping.mappingId, effectRef });
    }
    if (pattern.status === "released") {
      const owners = new Set(mappings.map((mapping) => mapping.owner));
      for (const owner of releasedOwners) if (!owners.has(owner)) fail("RELEASED_EMIT_OWNER_MISSING", `${pattern.patternId}: released emit mappings lack ${owner}.`, { patternId: pattern.patternId, owner });
      for (const parameter of parameters.filter((item) => item.required)) {
        const usedByEffect = array(pattern.effectPrimitives).some((effect) => array(effect.parameters).includes(parameter.parameterId));
        const usedByEmit = recursivelyContains(hooks.emit, parameter.parameterId);
        if (!usedByEffect && !usedByEmit) fail("REQUIRED_PARAMETER_UNUSED", `${pattern.patternId}: required parameter ${parameter.parameterId} is not consumed by an effect or emit mapping.`, { patternId: pattern.patternId, parameterId: parameter.parameterId });
      }
    }
    for (const department of ["gameplay", "performance", "stage", "evaluation"]) {
      if (!pattern.departmentContracts?.[department]) fail("DEPARTMENT_CONTRACT_MISSING", `${pattern.patternId}: missing ${department} department contract.`, { patternId: pattern.patternId, department });
    }
  }
});

await runCheck("score.normalization-and-discrimination", async () => {
  const shapes = new Map();
  for (const pattern of released) {
    const criteria = array(pattern.hooks?.score?.criteria);
    const sum = criteria.reduce((total, criterion) => total + Number(criterion.weight), 0);
    if (!Number.isFinite(sum) || Math.abs(sum - 1) > 1e-9) fail("SCORE_WEIGHTS_NOT_ONE", `${pattern.patternId}: score weights sum to ${sum}, not 1.`, { patternId: pattern.patternId, weightSum: sum });
    const shape = normalizedScoreShape(pattern);
    if (!shapes.has(shape)) shapes.set(shape, []);
    shapes.get(shape).push(pattern.patternId);
  }
  for (const patternIds of shapes.values()) {
    if (patternIds.length > 1) fail("NORMALIZED_SCORE_SHAPE_COLLISION", `Releasable patterns share an indistinguishable normalized score shape: ${patternIds.join(", ")}.`, { patternIds });
  }
  metrics.normalizedScoreShapes = { releasablePatterns: released.length, uniqueShapes: shapes.size };
});

await runCheck("effects.concrete-postconditions", async () => {
  const normalized = new Map();
  for (const pattern of released) {
    for (const effect of array(pattern.effectPrimitives)) {
      for (const postcondition of array(effect.postconditions)) {
        const shape = normalizedPostcondition(postcondition, pattern);
        if (!meaningful(postcondition, 20)) fail("POSTCONDITION_NOT_SUBSTANTIVE", `${pattern.patternId}: ${effect.effectId} has an empty or template postcondition.`, { patternId: pattern.patternId, effectId: effect.effectId, postcondition });
        if (/typed .+ transaction changes an approved story-derived state|changes an approved story-derived state and is visible to the player|approved story-derived state/i.test(postcondition)) {
          fail("GENERIC_POSTCONDITION_TEMPLATE", `${pattern.patternId}: ${effect.effectId} uses the banned generic postcondition template.`, { patternId: pattern.patternId, effectId: effect.effectId, postcondition });
        }
        if (!normalized.has(shape)) normalized.set(shape, []);
        normalized.get(shape).push({ patternId: pattern.patternId, effectId: effect.effectId });
      }
    }
  }
  for (const [shape, uses] of normalized) {
    const patternIds = [...new Set(uses.map((use) => use.patternId))];
    if (patternIds.length >= 3) fail("POSTCONDITION_SHAPE_REUSED", `A normalized postcondition is reused across ${patternIds.length} releasable patterns.`, { normalizedShape: shape, patternIds, uses });
  }
});

await runCheck("tests.four-release-gates-and-fixtures", async () => {
  const fixtures = array(fixtureRegistry?.fixtures);
  const fixtureById = new Map(fixtures.map((fixture) => [fixture.fixtureId, fixture]));
  for (const fixtureId of duplicates(fixtures.map((fixture) => fixture.fixtureId))) fail("DUPLICATE_FIXTURE_ID", `Fixture ID is duplicated: ${fixtureId}.`, { fixtureId });
  for (const fixture of fixtures) {
    const fixturePath = path.resolve(path.dirname(paths.fixtures), fixture.path ?? "");
    if (!fixture.path || !(await exists(fixturePath))) fail("FIXTURE_FILE_MISSING", `${fixture.fixtureId}: fixture file is missing at ${relative(fixturePath)}.`, { fixtureId: fixture.fixtureId, fixturePath: relative(fixturePath) });
  }
  const testIds = [];
  for (const pattern of patterns) {
    const tests = array(pattern.tests);
    testIds.push(...tests.map((test) => test.testId));
    for (const test of tests) if (!fixtureById.has(test.inputFixtureRef)) fail("TEST_FIXTURE_REF_MISSING", `${pattern.patternId}: ${test.testId} references unknown fixture ${test.inputFixtureRef}.`, { patternId: pattern.patternId, testId: test.testId, fixtureRef: test.inputFixtureRef });
    if (pattern.status === "released") {
      const kinds = new Set(tests.map((test) => test.kind));
      for (const kind of ["selection", "runtime", "route", "originality"]) if (!kinds.has(kind)) fail("RELEASED_TEST_KIND_MISSING", `${pattern.patternId}: released tests lack ${kind}.`, { patternId: pattern.patternId, kind });
    }
  }
  for (const testId of duplicates(testIds)) fail("DUPLICATE_PATTERN_TEST_ID", `Pattern test ID is duplicated: ${testId}.`, { testId });
});

await runCheck("composition.reference-and-conflict-closure", async () => {
  for (const pattern of patterns) {
    const composition = pattern.composition ?? {};
    const dependencies = array(composition.dependencies);
    const synergies = array(composition.synergies);
    const conflicts = array(composition.conflicts);
    const exclusive = array(pattern.selection?.exclusiveWith);
    for (const [kind, refs] of Object.entries({ dependencies, synergies, conflicts })) {
      for (const ref of refs) {
        if (ref === pattern.patternId) fail("COMPOSITION_SELF_REF", `${pattern.patternId}: ${kind} may not reference itself.`, { patternId: pattern.patternId, kind, ref });
        if (!patternById.has(ref)) fail("COMPOSITION_REF_MISSING", `${pattern.patternId}: ${kind} references missing pattern ${ref}.`, { patternId: pattern.patternId, kind, ref });
      }
    }
    for (const ref of dependencies.filter((value) => conflicts.includes(value))) fail("DEPENDENCY_CONFLICT_OVERLAP", `${pattern.patternId}: ${ref} is both a dependency and a conflict.`, { patternId: pattern.patternId, ref });
    for (const ref of synergies.filter((value) => conflicts.includes(value))) fail("SYNERGY_CONFLICT_OVERLAP", `${pattern.patternId}: ${ref} is both a synergy and a conflict.`, { patternId: pattern.patternId, ref });
    for (const ref of conflicts) {
      const peer = patternById.get(ref);
      if (peer && !array(peer.composition?.conflicts).includes(pattern.patternId)) fail("COMPOSITION_CONFLICT_NOT_RECIPROCAL", `${pattern.patternId} and ${ref} must declare composition conflict reciprocally.`, { patternId: pattern.patternId, ref });
      if (!exclusive.includes(ref)) fail("CONFLICT_NOT_SELECTION_EXCLUSIVE", `${pattern.patternId}: composition conflict ${ref} must also appear in selection.exclusiveWith.`, { patternId: pattern.patternId, ref });
    }
    for (const ref of exclusive) if (!conflicts.includes(ref)) fail("EXCLUSIVE_NOT_COMPOSITION_CONFLICT", `${pattern.patternId}: selection exclusion ${ref} must also appear in composition.conflicts.`, { patternId: pattern.patternId, ref });
    if (pattern.status === "released") {
      for (const ref of dependencies) {
        const dependency = patternById.get(ref);
        if (dependency && (dependency.status !== "released" || dependency.autoSelectable !== true)) fail("RELEASED_DEPENDS_ON_QUARANTINED_PATTERN", `${pattern.patternId}: released pattern depends on non-selectable ${ref}.`, { patternId: pattern.patternId, ref });
      }
    }
  }

  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  function visit(patternId) {
    if (visiting.has(patternId)) {
      const cycleStart = stack.indexOf(patternId);
      fail("COMPOSITION_DEPENDENCY_CYCLE", `Composition dependency cycle: ${[...stack.slice(cycleStart), patternId].join(" -> ")}.`, { patternIds: [...stack.slice(cycleStart), patternId] });
      return;
    }
    if (visited.has(patternId)) return;
    visiting.add(patternId);
    stack.push(patternId);
    for (const ref of array(patternById.get(patternId)?.composition?.dependencies)) if (patternById.has(ref)) visit(ref);
    stack.pop();
    visiting.delete(patternId);
    visited.add(patternId);
  }
  for (const pattern of patterns) visit(pattern.patternId);
});

await runCheck("originality.static-contract-and-p8-deferral", async () => {
  const staticChecks = originalityPolicy?.p1ThroughP6?.blockingChecks;
  if (originalityPolicy?.policyId !== "policy.originality-validation-boundary" || originalityPolicy?.p1ThroughP6?.patternBlindReview?.blocking !== false || originalityPolicy?.p8?.wholeGameBlindAttribution?.blocking !== true || !array(staticChecks).includes("production-index-source-isolation")) {
    fail("ORIGINALITY_PHASE_BOUNDARY_INVALID", "Originality governance must keep P1-P6 static abstraction checks blocking and defer the blocking whole-game blind gate to P8.");
  }
  for (const pattern of patterns) {
    if (array(pattern.originality?.requiredTransformationAxes).length < 3) fail("ORIGINALITY_TRANSFORMATION_AXES_INSUFFICIENT", `${pattern.patternId}: fewer than three transformation axes.`, { patternId: pattern.patternId });
    if (array(pattern.originality?.structuralDeltaAxes).length < 3) fail("ORIGINALITY_STRUCTURAL_DELTAS_INSUFFICIENT", `${pattern.patternId}: fewer than three structural delta axes.`, { patternId: pattern.patternId });
    if (!array(pattern.originality?.forbiddenSurfaceTransfers).length || !array(pattern.originality?.compositionVetoRefs).length || !array(pattern.originality?.cloneRiskChecks).length) fail("ORIGINALITY_STATIC_VETO_MISSING", `${pattern.patternId}: static surface or composition veto declarations are incomplete.`, { patternId: pattern.patternId });
    if (pattern.status === "released" && pattern.originality?.blindSourceAttributionRequired !== true) fail("P8_BLIND_REVIEW_NOT_DECLARED", `${pattern.patternId}: released pattern does not declare the downstream blind-review obligation.`, { patternId: pattern.patternId });
  }

  const cases = originalityRecords(originalityRegistry);
  const releasedIds = new Set(patterns.filter((record) => record.status === "released" && record.autoSelectable === true).map((record) => record.patternId));
  const casePatternIds = new Set(cases.map((record) => record.patternId).filter(Boolean));
  const combinationCases = array(originalityRegistry?.combinationCases);
  const stalePatternRefs = [...casePatternIds].filter((patternId) => !releasedIds.has(patternId));
  const staleCombinationRefs = combinationCases.flatMap((record) => array(record.patternIds)).filter((patternId) => !releasedIds.has(patternId));
  const releasedWithoutCases = [...releasedIds].filter((patternId) => !casePatternIds.has(patternId));
  const releaseSetAligned = stalePatternRefs.length === 0 && staleCombinationRefs.length === 0 && releasedWithoutCases.length === 0;
  diagnose(
    releaseSetAligned ? "HISTORICAL_BLIND_EVIDENCE_ALIGNED" : "HISTORICAL_BLIND_EVIDENCE_STALE",
    releaseSetAligned
      ? "Historical pattern-level blind evidence happens to align with the current release set; it remains nonblocking until P8 validates a complete game."
      : "Historical pattern-level blind evidence does not align with the current release set and is retained only as a nonblocking diagnostic; P8 will test the frozen whole game.",
    { releaseSetAligned, stalePatternRefs: [...new Set(stalePatternRefs)], staleCombinationRefs: [...new Set(staleCombinationRefs)], releasedWithoutCases }
  );
  metrics.originalityValidation = {
    p1ThroughP6BlockingMode: "static-abstraction",
    patternBlindEvidence: "historical-diagnostic-nonblocking",
    historicalReleaseSetAligned: releaseSetAligned,
    p8WholeGameBlindGate: "required-blocking"
  };
});

await runCheck("retrieval.pre-release-isolation-diagnostic", async () => {
  if (!retrievalIndex) return;
  const records = array(retrievalIndex.records);
  for (const patternId of duplicates(records.map((record) => record.patternId))) fail("DUPLICATE_RETRIEVAL_PATTERN", `Retrieval index duplicates ${patternId}.`, { patternId });
  for (const record of records) {
    const pattern = patternById.get(record.patternId);
    if (!pattern) fail("RETRIEVAL_PATTERN_MISSING", `Retrieval index references missing pattern ${record.patternId}.`, { patternId: record.patternId });
  }
  metrics.retrievalIsolation = { blockingOwner: "P5-release-validation", preReleaseIndexContentsAffectP4: false };
});

metrics.patterns = {
  total: patterns.length,
  released: patterns.filter((pattern) => pattern.status === "released").length,
  reviewed: reviewed.length,
  releasableMarkers: released.length
};
metrics.evidence = {
  observations: observations.length,
  works: works.length,
  claims: claims.length,
  fixtures: array(fixtureRegistry?.fixtures).length,
  originalityCases: originalityRecords(originalityRegistry).length,
  combinationOriginalityCases: array(originalityRegistry?.combinationCases).length,
  quarantineRegisterRecords: array(quarantineRegister?.records).length
};
metrics.checks = {
  total: checks.length,
  passed: checks.filter((check) => check.passed).length,
  failed: checks.filter((check) => !check.passed).length
};

const report = {
  reportVersion: "1.0.0",
  gateId: "gate.P4.pattern-contract-tests",
  generatedAt: "2026-07-18",
  ok: failures.length === 0,
  inputs: Object.fromEntries(Object.entries(paths).filter(([key]) => key !== "report").map(([key, target]) => [key, relative(target)])),
  output: relative(paths.report),
  metrics,
  checks,
  diagnostics,
  failures
};

try {
  await mkdir(path.dirname(paths.report), { recursive: true });
  await writeFile(paths.report, `${JSON.stringify(report, null, 2)}\n`, "utf8");
} catch (error) {
  console.error(`ERROR could not write ${relative(paths.report)}: ${error.message}`);
  process.exitCode = 1;
}

if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
else if (!process.argv.includes("--quiet")) {
  console.log(`Pattern contract tests ${report.ok ? "passed" : "failed"}: ${metrics.checks.passed}/${metrics.checks.total} checks passed.`);
  console.log(`Report: ${relative(paths.report)}`);
  for (const failure of failures) console.error(`ERROR [${failure.checkId}/${failure.code}] ${failure.message}`);
}

if (!report.ok) process.exitCode = 1;
