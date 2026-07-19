import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const libraryRoot = path.resolve(here, "..");
const repoRoot = path.resolve(libraryRoot, "..");
const compiler = path.join(libraryRoot, "scripts", "compile-release.mjs");
const validator = path.join(libraryRoot, "scripts", "validate-release.mjs");
const patternCompiler = path.join(libraryRoot, "scripts", "compile-patterns.mjs");
const benchmarkCompiler = path.join(libraryRoot, "scripts", "compile-benchmarks.mjs");
const benchmarkRunner = path.join(libraryRoot, "scripts", "run-selector-benchmarks.mjs");
const adapterRunner = path.join(libraryRoot, "scripts", "run-adapter-contract-tests.mjs");
const packManifestPath = path.join(libraryRoot, "packs", "zelda-mainline", "pack-manifest.json");
const releasePath = path.join(libraryRoot, "releases", "0.3.0.json");
const reportPath = path.join(repoRoot, "planning", "v03-zelda-mainline", "reports", "p5-release-determinism.json");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

function run(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: repoRoot, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${path.basename(script)} failed: ${result.stderr || result.stdout}`);
  return result;
}

async function snapshot() {
  const pack = await readFile(packManifestPath);
  const release = await readFile(releasePath);
  return {
    packBytes: pack.length,
    packSha256: sha(pack),
    releaseBytes: release.length,
    releaseSha256: sha(release),
    pack,
    release
  };
}

function parseValidation(result) {
  const report = JSON.parse(result.stdout);
  if (report.ok !== true) throw new Error(`validate-release.mjs reported failure: ${(report.errors ?? []).join("; ")}`);
  return report;
}

run(patternCompiler);
run(benchmarkCompiler);
run(benchmarkRunner);
run(adapterRunner);
run(compiler);
const firstValidation = parseValidation(run(validator, ["--json"]));
const first = await snapshot();
run(compiler);
const secondValidation = parseValidation(run(validator, ["--json"]));
const second = await snapshot();
const byteIdentical = first.pack.equals(second.pack) && first.release.equals(second.release);
const report = {
  reportVersion: "1.0.0",
  reportId: "report.p5.release-determinism",
  generatedAt: "2026-07-18",
  prerequisiteEvidence: {
    patternRegistryRegenerated: true,
    benchmarkCasesRegenerated: true,
    selectorBenchmarksRegenerated: true,
    adapterContractsRegenerated: true
  },
  compilerRuns: 2,
  byteIdentical,
  first: { packBytes: first.packBytes, packSha256: first.packSha256, releaseBytes: first.releaseBytes, releaseSha256: first.releaseSha256 },
  second: { packBytes: second.packBytes, packSha256: second.packSha256, releaseBytes: second.releaseBytes, releaseSha256: second.releaseSha256 },
  releaseValidations: [
    { compilerRun: 1, ok: firstValidation.ok === true, metrics: firstValidation.metrics ?? null, errors: firstValidation.errors ?? [] },
    { compilerRun: 2, ok: secondValidation.ok === true, metrics: secondValidation.metrics ?? null, errors: secondValidation.errors ?? [] }
  ],
  recursiveReleaseValidation: { ok: firstValidation.ok === true && secondValidation.ok === true, metrics: secondValidation.metrics ?? null, errors: [...(firstValidation.errors ?? []), ...(secondValidation.errors ?? [])] },
  summary: {
    adjudication: byteIdentical && firstValidation.ok === true && secondValidation.ok === true ? "pass" : "fail",
    blockers: [
      ...(!byteIdentical ? ["Two release compiler runs were not byte-identical."] : []),
      ...(firstValidation.ok === true ? [] : firstValidation.errors ?? ["First recursive release validation failed."]),
      ...(secondValidation.ok === true ? [] : secondValidation.errors ?? ["Second recursive release validation failed."])
    ]
  }
};
await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`P5 release determinism ${report.summary.adjudication}: ${first.packSha256.slice(0, 12)} / ${first.releaseSha256.slice(0, 12)}.`);
if (report.summary.adjudication !== "pass") process.exitCode = 1;
