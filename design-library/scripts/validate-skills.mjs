import { spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalTreeHash } from "./lock-utils.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const libraryRoot = path.resolve(here, "..");
const repoRoot = path.resolve(libraryRoot, "..");
const reportPath = path.join(repoRoot, "planning", "v03-zelda-mainline", "reports", "p6-skill-validation.json");
const writeReport = process.argv.includes("--write-report");
const skillNames = ["curate-game-design-library", "select-game-design-patterns", "build-interactive-stage-game-v03"];
const expectedInterface = {
  "curate-game-design-library": { display_name: "Curate Game Design Library", promptToken: "$curate-game-design-library" },
  "select-game-design-patterns": { display_name: "Select Game Design Patterns", promptToken: "$select-game-design-patterns" },
  "build-interactive-stage-game-v03": { display_name: "Build Interactive Stage Game 0.3", promptToken: "$build-interactive-stage-game-v03" }
};
const errors = [];
const checks = [];
const fail = (checkId, detail) => { errors.push(`${checkId}: ${detail}`); checks.push({ checkId, result: "fail", detail }); };
const pass = (checkId, detail) => checks.push({ checkId, result: "pass", detail });
const rel = (target) => path.relative(repoRoot, target).replaceAll("\\", "/").normalize("NFC");
const compare = (a, b) => {
  const left = Array.from(a.normalize("NFC"), (character) => character.codePointAt(0));
  const right = Array.from(b.normalize("NFC"), (character) => character.codePointAt(0));
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return left.length - right.length;
};

async function filesUnder(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) fail("skill.no-symlinks", rel(target));
    else if (entry.isDirectory()) output.push(...await filesUnder(target));
    else if (entry.isFile()) output.push(target);
  }
  return output.sort((a, b) => compare(rel(a), rel(b)));
}

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) return null;
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator < 1) continue;
    data[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return data;
}

function yamlScalar(raw, key) {
  const match = raw.match(new RegExp(`^\\s{2}${key}:\\s*["'](.*)["']\\s*$`, "m"));
  return match?.[1] ?? null;
}

const locks = [];
for (const skillName of skillNames) {
  const skillRoot = path.join(repoRoot, ".codex", "skills", skillName);
  const files = await filesUnder(skillRoot);
  const relativeFiles = files.map((target) => rel(target));
  const allowedTopLevel = new Set(["SKILL.md", "agents", "scripts", "references", "assets"]);
  const topLevel = await readdir(skillRoot);
  const unexpected = topLevel.filter((entry) => !allowedTopLevel.has(entry));
  if (unexpected.length) fail(`${skillName}.layout`, `unexpected top-level entries: ${unexpected.join(", ")}`);
  else pass(`${skillName}.layout`, `${files.length} files; no unexpected top-level entries`);

  const skillPath = path.join(skillRoot, "SKILL.md");
  const raw = await readFile(skillPath, "utf8");
  const frontmatter = parseFrontmatter(raw);
  if (!frontmatter || frontmatter.name !== skillName || !frontmatter.description || Object.keys(frontmatter).some((key) => !["name", "description"].includes(key))) fail(`${skillName}.frontmatter`, "frontmatter must contain only the exact name and a non-empty description");
  else pass(`${skillName}.frontmatter`, `name and trigger description are valid (${frontmatter.description.length} chars)`);
  const lineCount = raw.split(/\r?\n/).length;
  if (lineCount >= 500 || /\b(?:TODO|TBD|FIXME)\b/i.test(raw)) fail(`${skillName}.content`, `${lineCount} lines or an unresolved placeholder was found`);
  else pass(`${skillName}.content`, `${lineCount} lines; no unresolved placeholders`);

  const referenceMatches = [...raw.matchAll(/`(references\/[a-z0-9./-]+\.md)`/g)].map((match) => match[1]);
  const missingReferences = [];
  for (const reference of referenceMatches) {
    try { await stat(path.join(skillRoot, ...reference.split("/"))); }
    catch { missingReferences.push(reference); }
  }
  if (referenceMatches.length < 2 || missingReferences.length) fail(`${skillName}.references`, `declared=${referenceMatches.length}; missing=${missingReferences.join(", ")}`);
  else pass(`${skillName}.references`, `${referenceMatches.length} declared references exist`);

  const yamlPath = path.join(skillRoot, "agents", "openai.yaml");
  const yaml = await readFile(yamlPath, "utf8");
  const displayName = yamlScalar(yaml, "display_name");
  const shortDescription = yamlScalar(yaml, "short_description");
  const defaultPrompt = yamlScalar(yaml, "default_prompt");
  const interfaceKeys = [...yaml.matchAll(/^\s{2}([a-z_]+):/gm)].map((match) => match[1]);
  if (yaml.trim().split(/\r?\n/)[0] !== "interface:" || JSON.stringify(interfaceKeys) !== JSON.stringify(["display_name", "short_description", "default_prompt"]) || displayName !== expectedInterface[skillName].display_name || !shortDescription || shortDescription.length < 25 || shortDescription.length > 80 || !defaultPrompt?.includes(expectedInterface[skillName].promptToken)) fail(`${skillName}.agent-interface`, "agents/openai.yaml interface fields, lengths, or explicit $skill prompt are invalid");
  else pass(`${skillName}.agent-interface`, "display name, concise description, and explicit $skill default prompt are valid");

  const scripts = files.filter((target) => rel(target).includes(`.codex/skills/${skillName}/scripts/`) && target.endsWith(".mjs"));
  const syntaxFailures = [];
  for (const script of scripts) {
    const result = spawnSync(process.execPath, ["--check", script], { cwd: repoRoot, encoding: "utf8" });
    if (result.status !== 0) syntaxFailures.push(`${rel(script)}: ${result.stderr || result.stdout}`);
  }
  if (!scripts.length || syntaxFailures.length) fail(`${skillName}.scripts`, syntaxFailures.join("; ") || "no deterministic helper scripts");
  else pass(`${skillName}.scripts`, `${scripts.length} helper scripts pass node --check`);

  const fileRecords = [];
  for (const target of files) fileRecords.push({ path: rel(target), bytes: await readFile(target) });
  locks.push({ id: skillName, version: "0.3.0", path: rel(skillRoot), algorithm: "canonical-tree-sha256/v1", fileCount: fileRecords.length, treeSha256: await canonicalTreeHash(skillRoot) });
  if (relativeFiles.some((value) => value.endsWith("README.md"))) fail(`${skillName}.no-readme`, "Skill package contains a README.md");
  else pass(`${skillName}.no-readme`, "no redundant README.md");
}

const runStateSelfTestPath = path.join(repoRoot, ".codex", "skills", "build-interactive-stage-game-v03", "scripts", "test-production-run-state.mjs");
const runStateSelfTest = spawnSync(process.execPath, [runStateSelfTestPath], { cwd: repoRoot, encoding: "utf8", timeout: 120000 });
if (runStateSelfTest.status === 0 && /crash recovery, invalidation, P7 freeze, and P8 gates verified/.test(runStateSelfTest.stdout ?? "")) {
  pass("build-interactive-stage-game-v03.resume-contract", (runStateSelfTest.stdout ?? "").trim());
} else {
  fail("build-interactive-stage-game-v03.resume-contract", `${runStateSelfTest.stdout ?? ""}${runStateSelfTest.stderr ?? ""}`.trim() || `self-test exited ${runStateSelfTest.status}`);
}

const directorSkillText = await readFile(path.join(repoRoot, ".codex", "skills", "build-interactive-stage-game-v03", "SKILL.md"), "utf8");
const checkpointProtocolText = await readFile(path.join(repoRoot, ".codex", "skills", "build-interactive-stage-game-v03", "references", "checkpoint-and-resume-protocol.md"), "utf8");
const phaseBoundaryTokens = [
  [directorSkillText, "P1-P6 build and validate this workflow as a Skill Beta"],
  [directorSkillText, "P7 autonomously generates and freezes one playable candidate"],
  [directorSkillText, "P8 independently validates that frozen candidate"],
  [directorSkillText, "Never report Stable before `99-release` is committed"],
  [checkpointProtocolText, "immutable, content-addressed full snapshots"],
  [checkpointProtocolText, "whole-game P8 blind test"],
  ...[
    "analyze-story-for-game",
    "select-game-design-patterns",
    "design-narrative-gameplay",
    "direct-interactive-drama",
    "design-stage-and-levels",
    "art-direct-game-assets",
    "compile-script-game",
    "evaluate-script-game"
  ].map((skillId) => [directorSkillText, skillId])
];
const missingBoundaryTokens = phaseBoundaryTokens.filter(([source, token]) => !source.includes(token)).map(([, token]) => token);
if (missingBoundaryTokens.length) fail("build-interactive-stage-game-v03.program-boundaries", `missing mandatory boundary text: ${missingBoundaryTokens.join("; ")}`);
else pass("build-interactive-stage-game-v03.program-boundaries", "P1-P6 Skill Beta, complete specialist chain, autonomous P7 candidate, and independent P8 Stable gates are explicit");

const userProfile = process.env.USERPROFILE;
const quickValidator = userProfile ? path.join(userProfile, ".codex", "skills", ".system", "skill-creator", "scripts", "quick_validate.py") : null;
const pythonPath = path.join(repoRoot, "node_modules", ".skill-validator-python");
const bundledPython = userProfile ? path.join(userProfile, ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "python.exe") : "python";
const quickResults = [];
if (quickValidator) {
  try {
    await stat(quickValidator);
    for (const skillName of skillNames) {
      const result = spawnSync(bundledPython, [quickValidator, path.join(repoRoot, ".codex", "skills", skillName)], { cwd: repoRoot, encoding: "utf8", env: { ...process.env, PYTHONUTF8: "1", PYTHONPATH: pythonPath } });
      quickResults.push({ skillName, result: result.status === 0 ? "pass" : "fail", output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() });
    }
    if (quickResults.every((item) => item.result === "pass")) pass("skill-creator.quick-validate", "all three packages pass the installed skill-creator validator");
    else fail("skill-creator.quick-validate", quickResults.filter((item) => item.result === "fail").map((item) => `${item.skillName}: ${item.output}`).join("; "));
  } catch {
    fail("skill-creator.quick-validate", `validator not found at ${quickValidator}`);
  }
} else fail("skill-creator.quick-validate", "USERPROFILE is unavailable");

const report = {
  reportVersion: "1.0.0",
  reportId: "report.p6.skill-validation",
  generatedAt: "2026-07-18",
  skillCreatorValidator: quickResults,
  checks,
  componentLocks: locks,
  legacyProtection: { validator: "planning/v03-zelda-mainline/scripts/validate-deployment.mjs", result: "delegated-hard-gate" },
  summary: { skills: skillNames.length, passedChecks: checks.filter((item) => item.result === "pass").length, failedChecks: checks.filter((item) => item.result === "fail").length, adjudication: errors.length ? "fail" : "pass", blockers: errors }
};
if (writeReport) {
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(`V0.3 Skill validation ${errors.length ? "failed" : "passed"}: ${report.summary.passedChecks} checks, ${errors.length} blockers.${writeReport ? ` Report: ${rel(reportPath)}` : ""}`);
for (const error of errors) console.error(`ERROR ${error}`);
if (errors.length) process.exitCode = 1;
