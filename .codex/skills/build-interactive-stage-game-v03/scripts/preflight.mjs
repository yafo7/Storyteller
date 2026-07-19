import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateAndVerifyLibraryLock } from "../../../../design-library/scripts/lock-utils.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../..");
const positional = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));
const [lockPath, fixturePath] = positional;
const disablePack = process.argv.includes("--disable-pack");
const evidenceArgument = process.argv.slice(2).find((argument) => argument.startsWith("--evidence-out="));
const evidencePath = evidenceArgument ? path.resolve(evidenceArgument.slice("--evidence-out=".length)) : null;
if (!lockPath || !fixturePath) {
  console.error("Usage: node preflight.mjs <library-lock.json> <story-input.json> [--disable-pack] [--evidence-out=<report.json>]");
  process.exit(2);
}

const absoluteLockPath = path.resolve(lockPath);
const absoluteFixturePath = path.resolve(fixturePath);
await validateAndVerifyLibraryLock(absoluteLockPath, { fixturePath: absoluteFixturePath, disablePack });
for (const script of ["design-library/scripts/validate-library.mjs", "planning/v03-zelda-mainline/scripts/validate-deployment.mjs"]) {
  const result = spawnSync(process.execPath, [path.join(root, script)], { cwd: root, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (evidencePath) {
  const hashFile = async (target) => createHash("sha256").update(await readFile(target)).digest("hex");
  const evidence = {
    evidenceVersion: "1.0.0",
    gateId: "director-preflight",
    result: "pass",
    workflowVersion: "0.3.0",
    lockPath: absoluteLockPath,
    lockSha256: await hashFile(absoluteLockPath),
    storyInputPath: absoluteFixturePath,
    storyInputSha256: await hashFile(absoluteFixturePath),
    packMode: disablePack ? "disabled" : "enabled",
    checkedAt: new Date().toISOString()
  };
  const bytes = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  await mkdir(path.dirname(evidencePath), { recursive: true });
  const temporary = `${evidencePath}.next-${process.pid}-${Date.now()}`;
  const handle = await open(temporary, "wx");
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try { await rename(temporary, evidencePath); }
  catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  console.log(`Director preflight evidence: ${evidencePath}`);
}
