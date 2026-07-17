import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const planRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(planRoot, "..", "..");
const errors = [];
const expectedPhaseArg = process.argv.find((argument) => argument.startsWith("--expect-phase="));
const expectedPhase = expectedPhaseArg?.split("=")[1] ?? null;

function fail(message) {
  errors.push(message);
}

function relative(filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`Cannot parse ${relative(filePath)}: ${error.message}`);
    return null;
  }
}

function listRegularFiles(root) {
  const files = [];
  if (!fs.existsSync(root)) return files;

  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const next = path.join(current, entry.name);
      if (entry.isSymbolicLink()) {
        fail(`canonical-tree-sha256/v1 rejects symlink: ${relative(next)}`);
      } else if (entry.isDirectory()) {
        walk(next);
      } else if (entry.isFile()) {
        files.push(next);
      }
    }
  }

  walk(root);
  return files.sort((left, right) => {
    const a = relative(left).normalize("NFC");
    const b = relative(right).normalize("NFC");
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

function hashRecords(records) {
  const body = records
    .map(({ filePath, bytes }) => {
      const normalizedPath = filePath.split(path.sep).join("/").normalize("NFC");
      const fileHash = crypto.createHash("sha256").update(bytes).digest("hex");
      return `file\0${normalizedPath}\0${bytes.length}\0${fileHash}\n`;
    })
    .join("");
  return crypto.createHash("sha256").update(body, "utf8").digest("hex");
}

function workingTreeHash(relativeRoot) {
  const files = listRegularFiles(path.join(repoRoot, relativeRoot));
  return {
    fileCount: files.length,
    treeSha256: hashRecords(
      files.map((filePath) => ({ filePath: relative(filePath), bytes: fs.readFileSync(filePath) })),
    ),
  };
}

function gitTreeHash(commit, relativeRoot) {
  const output = execFileSync(
    "git",
    ["ls-tree", "-r", "--name-only", commit, "--", relativeRoot],
    { cwd: repoRoot, encoding: "utf8", maxBuffer: 100 * 1024 * 1024 },
  );
  const paths = output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((value) => value.split("\\").join("/").normalize("NFC"))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const records = paths.map((filePath) => ({
    filePath,
    bytes: execFileSync("git", ["show", `${commit}:${filePath}`], {
      cwd: repoRoot,
      encoding: null,
      maxBuffer: 100 * 1024 * 1024,
    }),
  }));
  return { fileCount: records.length, treeSha256: hashRecords(records) };
}

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function resolveLocalRef(rootSchema, reference) {
  if (!reference.startsWith("#/$defs/")) return null;
  const key = reference.slice("#/$defs/".length);
  return rootSchema.$defs?.[key] ?? null;
}

function matchesType(value, type) {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === type;
}

function validateInstance(value, schema, rootSchema, dataPath = "$") {
  const found = [];
  if (schema === true || schema == null) return found;
  if (schema === false) return [`${dataPath} is forbidden by schema`];
  if (schema.$ref) {
    const resolved = resolveLocalRef(rootSchema, schema.$ref);
    if (!resolved) return [`${dataPath} has unresolved local $ref ${schema.$ref}`];
    return validateInstance(value, resolved, rootSchema, dataPath);
  }

  if (schema.allOf) {
    for (const subSchema of schema.allOf) {
      found.push(...validateInstance(value, subSchema, rootSchema, dataPath));
    }
  }
  if (schema.anyOf) {
    const passes = schema.anyOf.some(
      (subSchema) => validateInstance(value, subSchema, rootSchema, dataPath).length === 0,
    );
    if (!passes) found.push(`${dataPath} does not satisfy anyOf`);
  }
  if (schema.oneOf) {
    const passCount = schema.oneOf.filter(
      (subSchema) => validateInstance(value, subSchema, rootSchema, dataPath).length === 0,
    ).length;
    if (passCount !== 1) found.push(`${dataPath} must satisfy exactly one oneOf branch, got ${passCount}`);
  }
  if (schema.if) {
    const conditionPasses = validateInstance(value, schema.if, rootSchema, dataPath).length === 0;
    if (conditionPasses && schema.then) {
      found.push(...validateInstance(value, schema.then, rootSchema, dataPath));
    } else if (!conditionPasses && schema.else) {
      found.push(...validateInstance(value, schema.else, rootSchema, dataPath));
    }
  }

  const allowedTypes = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  if (allowedTypes.length > 0 && !allowedTypes.some((type) => matchesType(value, type))) {
    found.push(`${dataPath} expected type ${allowedTypes.join("|")}`);
    return found;
  }
  if (Object.hasOwn(schema, "const") && !deepEqual(value, schema.const)) {
    found.push(`${dataPath} must equal ${JSON.stringify(schema.const)}`);
  }
  if (schema.enum && !schema.enum.some((candidate) => deepEqual(value, candidate))) {
    found.push(`${dataPath} is not in enum`);
  }

  if (typeof value === "string") {
    if (schema.minLength != null && value.length < schema.minLength) {
      found.push(`${dataPath} is shorter than ${schema.minLength}`);
    }
    if (schema.maxLength != null && value.length > schema.maxLength) {
      found.push(`${dataPath} is longer than ${schema.maxLength}`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      found.push(`${dataPath} does not match ${schema.pattern}`);
    }
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    if (schema.minimum != null && value < schema.minimum) found.push(`${dataPath} is below minimum`);
    if (schema.maximum != null && value > schema.maximum) found.push(`${dataPath} is above maximum`);
  }

  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) {
      found.push(`${dataPath} has fewer than ${schema.minItems} items`);
    }
    if (schema.maxItems != null && value.length > schema.maxItems) {
      found.push(`${dataPath} has more than ${schema.maxItems} items`);
    }
    if (schema.uniqueItems) {
      const serialized = value.map((item) => JSON.stringify(item));
      if (new Set(serialized).size !== serialized.length) found.push(`${dataPath} items are not unique`);
    }
    if (schema.items) {
      value.forEach((item, index) => {
        found.push(...validateInstance(item, schema.items, rootSchema, `${dataPath}[${index}]`));
      });
    }
    if (schema.contains) {
      const containsCount = value.filter(
        (item, index) =>
          validateInstance(item, schema.contains, rootSchema, `${dataPath}[${index}]`).length === 0,
      ).length;
      const minimum = schema.minContains ?? 1;
      const maximum = schema.maxContains ?? Number.POSITIVE_INFINITY;
      if (containsCount < minimum || containsCount > maximum) {
        found.push(`${dataPath} contains-match count ${containsCount} is outside ${minimum}..${maximum}`);
      }
    }
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const keys = Object.keys(value);
    if (schema.minProperties != null && keys.length < schema.minProperties) {
      found.push(`${dataPath} has fewer than ${schema.minProperties} properties`);
    }
    if (schema.maxProperties != null && keys.length > schema.maxProperties) {
      found.push(`${dataPath} has more than ${schema.maxProperties} properties`);
    }
    for (const requiredKey of schema.required ?? []) {
      if (!Object.hasOwn(value, requiredKey)) found.push(`${dataPath}.${requiredKey} is required`);
    }
    for (const [key, propertySchema] of Object.entries(schema.properties ?? {})) {
      if (Object.hasOwn(value, key)) {
        found.push(...validateInstance(value[key], propertySchema, rootSchema, `${dataPath}.${key}`));
      }
    }
    const knownProperties = new Set(Object.keys(schema.properties ?? {}));
    for (const key of keys.filter((candidate) => !knownProperties.has(candidate))) {
      if (schema.additionalProperties === false) {
        found.push(`${dataPath}.${key} is an unknown property`);
      } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        found.push(
          ...validateInstance(value[key], schema.additionalProperties, rootSchema, `${dataPath}.${key}`),
        );
      }
    }
  }

  return found;
}

const knownSchemaKeywords = new Set([
  "$schema",
  "$id",
  "$ref",
  "$defs",
  "$comment",
  "title",
  "description",
  "type",
  "const",
  "enum",
  "pattern",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "minItems",
  "maxItems",
  "uniqueItems",
  "items",
  "contains",
  "minContains",
  "maxContains",
  "minProperties",
  "maxProperties",
  "required",
  "properties",
  "additionalProperties",
  "allOf",
  "anyOf",
  "oneOf",
  "if",
  "then",
  "else",
  "default",
  "examples",
]);

function lintSchema(schema, schemaPath = "$schema") {
  if (typeof schema === "boolean") return;
  if (schema == null || typeof schema !== "object" || Array.isArray(schema)) {
    fail(`${schemaPath} must be a schema object or boolean`);
    return;
  }
  for (const key of Object.keys(schema)) {
    if (!knownSchemaKeywords.has(key)) fail(`${schemaPath} uses unsupported draft keyword ${key}`);
  }
  for (const [name, child] of Object.entries(schema.properties ?? {})) {
    lintSchema(child, `${schemaPath}.properties.${name}`);
  }
  for (const [name, child] of Object.entries(schema.$defs ?? {})) {
    lintSchema(child, `${schemaPath}.$defs.${name}`);
  }
  if (schema.items) lintSchema(schema.items, `${schemaPath}.items`);
  if (schema.contains) lintSchema(schema.contains, `${schemaPath}.contains`);
  if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
    lintSchema(schema.additionalProperties, `${schemaPath}.additionalProperties`);
  }
  for (const keyword of ["allOf", "anyOf", "oneOf"]) {
    schema[keyword]?.forEach((child, index) => lintSchema(child, `${schemaPath}.${keyword}[${index}]`));
  }
  for (const keyword of ["if", "then", "else"]) {
    if (schema[keyword]) lintSchema(schema[keyword], `${schemaPath}.${keyword}`);
  }
}

for (const relativePath of [
  "README.md",
  "MASTER_PLAN.md",
  "QUALITY_GATES.md",
  "DEPLOYMENT_RUNBOOK.md",
  "deployment-manifest.json",
  "baseline/legacy-skill-lock.json",
]) {
  if (!fs.existsSync(path.join(planRoot, relativePath))) fail(`Missing planning deliverable: ${relativePath}`);
}

const manifest = readJson(path.join(planRoot, "deployment-manifest.json"));
const baseline = readJson(path.join(planRoot, "baseline", "legacy-skill-lock.json"));

if (manifest) {
  const expectedPhases = Array.from({ length: 9 }, (_, index) => `P${index}`);
  const phaseIds = (manifest.phases ?? []).map((phase) => phase.id);
  if (!deepEqual(phaseIds, expectedPhases)) fail(`Phase sequence must be ${expectedPhases.join(", ")}`);

  const currentPhase = manifest.lifecycle?.currentPhase;
  const currentIndex = expectedPhases.indexOf(currentPhase);
  if (currentIndex < 0) fail(`Unknown lifecycle.currentPhase ${currentPhase}`);
  if (expectedPhase && currentPhase !== expectedPhase) {
    fail(`Expected ${expectedPhase} freeze, but deployment is at ${currentPhase}`);
  }

  manifest.phases?.forEach((phase, index) => {
    if (index < currentIndex && phase.status !== "completed") {
      fail(`${phase.id} must be completed before ${currentPhase}`);
    }
    if (index === currentIndex && !["in-progress", "completed"].includes(phase.status)) {
      fail(`${phase.id} must be in-progress or completed while current`);
    }
    if (index > currentIndex && phase.status !== "pending") fail(`${phase.id} must remain pending`);
  });
  const currentPhaseRecord = manifest.phases?.[currentIndex];
  if (currentPhaseRecord && manifest.status !== currentPhaseRecord.manifestStatus) {
    fail(`Manifest status must be ${currentPhaseRecord.manifestStatus} at ${currentPhase}`);
  }

  const expectedGates = Array.from({ length: 15 }, (_, index) => `G${index}`);
  if (!deepEqual(manifest.qualityGates, expectedGates)) {
    fail(`Quality gate registry must be exactly ${expectedGates.join(", ")}`);
  }
  for (const phase of manifest.phases ?? []) {
    for (const gate of phase.exitGates ?? []) {
      if (!expectedGates.includes(gate)) fail(`${phase.id} references unknown gate ${gate}`);
    }
  }

  for (const [flagId, flag] of Object.entries(manifest.lifecycle?.flags ?? {})) {
    const introducedIndex = expectedPhases.indexOf(flag.introducedInPhase);
    if (introducedIndex < 0) fail(`${flagId} has invalid introducedInPhase`);
    const shouldBeStarted = currentIndex >= introducedIndex;
    if (flag.value !== shouldBeStarted) {
      fail(`lifecycle.flags.${flagId}.value must be ${shouldBeStarted} at ${currentPhase}`);
    }
  }

  for (const entry of manifest.plannedFormalPaths ?? []) {
    const introducedIndex = expectedPhases.indexOf(entry.introducedInPhase);
    if (introducedIndex < 0) fail(`${entry.path} has invalid introducedInPhase`);
    const exists = fs.existsSync(path.join(repoRoot, entry.path));
    if (currentIndex < introducedIndex && exists) fail(`Future-phase path exists early: ${entry.path}`);
    if (currentIndex >= introducedIndex && entry.requiredWhenAdmitted && !exists) {
      fail(`Admitted path is missing at ${currentPhase}: ${entry.path}`);
    }
  }

  const contractDir = path.join(planRoot, "contracts");
  const templateDir = path.join(planRoot, "templates");
  const mappings = manifest.contractTemplateMap ?? [];
  const contractNames = mappings.map((mapping) => mapping.contract);
  const templateNames = mappings.map((mapping) => mapping.template);
  if (new Set(contractNames).size !== contractNames.length) fail("contractTemplateMap has duplicate contracts");
  if (new Set(templateNames).size !== templateNames.length) fail("contractTemplateMap has duplicate templates");

  const actualContracts = listRegularFiles(contractDir)
    .filter((filePath) => filePath.endsWith(".schema.json"))
    .map((filePath) => path.basename(filePath))
    .sort();
  const actualTemplates = listRegularFiles(templateDir)
    .filter((filePath) => filePath.endsWith(".json"))
    .map((filePath) => path.basename(filePath))
    .sort();
  if (!deepEqual([...contractNames].sort(), actualContracts)) {
    fail("contractTemplateMap and contracts/ directory do not match exactly");
  }
  if (!deepEqual([...templateNames].sort(), actualTemplates)) {
    fail("contractTemplateMap and JSON templates do not match exactly");
  }

  for (const mapping of mappings) {
    const schema = readJson(path.join(contractDir, mapping.contract));
    const template = readJson(path.join(templateDir, mapping.template));
    if (!schema || !template) continue;
    if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema") {
      fail(`${mapping.contract} must target JSON Schema 2020-12`);
    }
    if (typeof schema.$id !== "string" || !schema.$id.includes("/v03/")) {
      fail(`${mapping.contract} must have a v03 $id`);
    }
    if (schema.type !== "object" || schema.additionalProperties !== false) {
      fail(`${mapping.contract} root must be a closed object`);
    }
    lintSchema(schema, mapping.contract);
    for (const issue of validateInstance(template, schema, schema)) {
      fail(`${mapping.template}: ${issue}`);
    }
    const raw = fs.readFileSync(path.join(templateDir, mapping.template), "utf8");
    if (!raw.includes("__") && !raw.includes("0".repeat(64))) {
      fail(`${mapping.template} lacks an obvious planning placeholder`);
    }
  }

  const workTemplate = readJson(path.join(templateDir, "work.template.json"));
  const dossierTemplate = readJson(path.join(templateDir, "title-dossier.template.json"));
  const dimensions = Object.keys(workTemplate?.dimensionCoverage ?? {}).sort();
  const dossierDimensions = (dossierTemplate?.dimensions ?? []).map((entry) => entry.dimensionId);
  if (dimensions.length !== 20 || new Set(dimensions).size !== 20) fail("Work template must define 20 unique dimensions");
  if (!deepEqual([...dossierDimensions].sort(), dimensions)) {
    fail("Dossier template must contain every controlled dimension exactly once");
  }
  const primaryVersionId = workTemplate?.releaseFamily?.primaryVersionId;
  const primaryMatches = (workTemplate?.releaseFamily?.versions ?? []).filter(
    (version) => version.versionId === primaryVersionId && version.researchTreatment === "primary",
  );
  if (primaryMatches.length !== 1) fail("Work template must have exactly one matching primary release version");

  const patternTemplate = readJson(path.join(templateDir, "design-pattern.template.json"));
  const effectIds = new Set((patternTemplate?.effectPrimitives ?? []).map((effect) => effect.effectId));
  const mappingOwners = new Set(patternTemplate?.hooks?.emit?.mappings?.map((mapping) => mapping.owner) ?? []);
  for (const owner of ["gameplay", "performance", "stage", "evaluation"]) {
    if (!mappingOwners.has(owner)) fail(`Pattern template lacks typed emit mapping for ${owner}`);
  }
  for (const mapping of patternTemplate?.hooks?.emit?.mappings ?? []) {
    for (const effectRef of mapping.effectRefs ?? []) {
      if (!effectIds.has(effectRef)) fail(`Pattern emit mapping references unknown effect ${effectRef}`);
    }
  }
  const assertionIds = new Set(
    (patternTemplate?.tests ?? []).flatMap((test) => test.assertions ?? []).map((item) => item.assertionId),
  );
  for (const assertionRef of patternTemplate?.hooks?.validate?.assertionRefs ?? []) {
    if (!assertionIds.has(assertionRef)) fail(`Pattern validate hook references unknown ${assertionRef}`);
  }
}

if (manifest && baseline) {
  if (manifest.legacyBaseline?.sourceCommit !== baseline.sourceCommit) {
    fail("Manifest and legacy baseline disagree on sourceCommit");
  }
  if (baseline.lockVersion !== "1.0.0" || baseline.canonicalizationVersion !== "1") {
    fail("Legacy baseline version or canonicalization version is invalid");
  }
  if (!baseline.algorithm?.startsWith("canonical-tree-sha256/v1:")) {
    fail("Legacy baseline must declare canonical-tree-sha256/v1");
  }

  const protectedPaths = manifest.legacyBaseline?.protectedPaths ?? [];
  const entryPaths = (baseline.entries ?? []).map((entry) => entry.path);
  if (new Set(entryPaths).size !== entryPaths.length) fail("Legacy baseline contains duplicate paths");
  if (!deepEqual([...entryPaths].sort(), [...protectedPaths].sort())) {
    fail("Legacy baseline entries must exactly match protectedPaths");
  }

  try {
    execFileSync("git", ["cat-file", "-e", `${baseline.sourceCommit}^{commit}`], {
      cwd: repoRoot,
      stdio: "ignore",
    });
  } catch {
    fail(`Baseline source commit does not exist: ${baseline.sourceCommit}`);
  }

  for (const entry of baseline.entries ?? []) {
    try {
      const committed = gitTreeHash(baseline.sourceCommit, entry.path);
      if (committed.fileCount !== entry.fileCount || committed.treeSha256 !== entry.treeSha256) {
        fail(`${entry.path} baseline hash does not match sourceCommit`);
      }
    } catch (error) {
      fail(`Cannot verify ${entry.path} at sourceCommit: ${error.message}`);
    }
    try {
      execFileSync("git", ["diff", "--quiet", baseline.sourceCommit, "--", entry.path], {
        cwd: repoRoot,
        stdio: "ignore",
      });
    } catch {
      fail(`${entry.path} tracked content drift from frozen baseline`);
    }
    const untracked = execFileSync(
      "git",
      ["ls-files", "--others", "--exclude-standard", "--", entry.path],
      { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    )
      .trim();
    if (untracked) fail(`${entry.path} contains untracked files outside the frozen baseline`);
  }
}

const qualityText = fs.existsSync(path.join(planRoot, "QUALITY_GATES.md"))
  ? fs.readFileSync(path.join(planRoot, "QUALITY_GATES.md"), "utf8")
  : "";
for (let index = 0; index <= 14; index += 1) {
  if (!qualityText.includes(`G${index}`)) fail(`QUALITY_GATES.md does not mention G${index}`);
}

if (errors.length > 0) {
  console.error("V0.3 deployment validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `V0.3 deployment validation passed at ${manifest.lifecycle.currentPhase}: ${manifest.phases.length} phases, ${manifest.qualityGates.length} gates, ${manifest.contractTemplateMap.length} schema-template pairs, ${baseline.entries.length} frozen legacy trees.`,
);
