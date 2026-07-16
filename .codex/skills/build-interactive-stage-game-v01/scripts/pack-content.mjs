#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

function usage() {
  console.log("Usage: node pack-content.mjs <package-directory> (--out file.stagepack.json | --dry-run) [--pretty] [--max-bytes N]");
}
function parseArgs(argv) {
  const result = { root: null, out: null, dryRun: false, pretty: false, maxBytes: 50 * 1024 * 1024 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") { usage(); process.exit(0); }
    if (arg === "--dry-run") result.dryRun = true;
    else if (arg === "--pretty") result.pretty = true;
    else if (arg === "--out" || arg === "--max-bytes") {
      const value = argv[index + 1]; index += 1;
      if (!value) throw new Error(`${arg} requires a value`);
      if (arg === "--out") result.out = value;
      else result.maxBytes = Number(value);
    } else if (arg.startsWith("--")) throw new Error(`unknown option ${arg}`);
    else if (result.root) throw new Error("accepts one package directory");
    else result.root = arg;
  }
  if (!result.root) throw new Error("missing package directory");
  if (!result.dryRun && !result.out) throw new Error("provide --out or --dry-run");
  if (!Number.isInteger(result.maxBytes) || result.maxBytes < 1) throw new Error("--max-bytes must be a positive integer");
  return result;
}
function mediaType(file) {
  const types = { ".json": "application/json", ".txt": "text/plain", ".md": "text/markdown", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav" };
  return types[path.extname(file).toLowerCase()] || "application/octet-stream";
}

let options;
try { options = parseArgs(process.argv.slice(2)); }
catch (error) { console.error(`pack-content: ${error.message}`); usage(); process.exit(2); }
const rootPath = path.resolve(options.root);
if (!fs.existsSync(rootPath) || !fs.statSync(rootPath).isDirectory()) { console.error(`pack-content: not a directory: ${rootPath}`); process.exit(2); }
const productionPath = path.join(rootPath, "production.json");
if (!fs.existsSync(productionPath)) { console.error("pack-content: package root must contain production.json"); process.exit(2); }
let production;
try { production = JSON.parse(fs.readFileSync(productionPath, "utf8").replace(/^\uFEFF/, "")); }
catch (error) { console.error(`pack-content: invalid production.json: ${error.message}`); process.exit(2); }
if (production.$schema !== "interactive-stage-production/v1") { console.error("pack-content: unsupported production schema"); process.exit(2); }

const outputPath = options.out ? path.resolve(options.out) : null;
const excludedDirectories = new Set([".git", "node_modules"]);
const secretNames = new Set([".env", ".env.local", ".npmrc"]);
const secretExtensions = new Set([".pem", ".key", ".p12", ".pfx"]);
const files = [];
let totalBytes = 0;

function walk(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (outputPath && path.resolve(fullPath) === outputPath) continue;
    if (entry.isSymbolicLink()) throw new Error(`refusing symbolic link: ${fullPath}`);
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) walk(fullPath);
      continue;
    }
    if (!entry.isFile()) continue;
    if (secretNames.has(entry.name.toLowerCase()) || secretExtensions.has(path.extname(entry.name).toLowerCase())) throw new Error(`refusing possible secret file: ${fullPath}`);
    const relative = path.relative(rootPath, fullPath).split(path.sep).join("/");
    if (relative.startsWith("../") || path.isAbsolute(relative)) throw new Error(`unsafe relative path: ${relative}`);
    const data = fs.readFileSync(fullPath);
    totalBytes += data.length;
    if (totalBytes > options.maxBytes) throw new Error(`package exceeds --max-bytes (${options.maxBytes})`);
    files.push({
      path: relative,
      mediaType: mediaType(fullPath),
      bytes: data.length,
      sha256: crypto.createHash("sha256").update(data).digest("hex"),
      encoding: "base64",
      ...(options.dryRun ? {} : { data: data.toString("base64") }),
    });
  }
}

try { walk(rootPath); }
catch (error) { console.error(`pack-content: ${error.message}`); process.exit(1); }
const digest = crypto.createHash("sha256");
for (const file of files) digest.update(`${file.path}\0${file.sha256}\0${file.bytes}\n`, "utf8");
const bundle = {
  format: "interactive-stage-pack",
  formatVersion: 1,
  production: { id: production.id, title: production.title, schemaVersion: production.schemaVersion },
  contentSha256: digest.digest("hex"),
  totalBytes,
  files,
};

if (options.dryRun) {
  console.log(`PASSED: would pack ${files.length} file(s), ${totalBytes} byte(s), content ${bundle.contentSha256}.`);
} else {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const serialized = options.pretty ? JSON.stringify(bundle, null, 2) : JSON.stringify(bundle);
  fs.writeFileSync(outputPath, `${serialized}\n`, "utf8");
  console.log(`Packed ${files.length} file(s), ${totalBytes} byte(s) to ${outputPath}.`);
  console.log(`Content SHA-256: ${bundle.contentSha256}`);
}
