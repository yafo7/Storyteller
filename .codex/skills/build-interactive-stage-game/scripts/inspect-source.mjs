#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const FORMATS = new Set(["auto", "screenplay", "fountain", "subtitle", "transcript", "stage-play", "prose", "outline"]);

function usage() {
  console.log("Usage: node inspect-source.mjs <source.txt> [--format auto|screenplay|fountain|subtitle|transcript|stage-play|prose|outline] [--out report.json]");
}

function die(message, code = 2) {
  console.error(`inspect-source: ${message}`);
  process.exit(code);
}

function parseArgs(argv) {
  const options = { format: "auto", out: null, input: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
    if (arg === "--format" || arg === "--out") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) die(`${arg} requires a value`);
      options[arg.slice(2)] = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--")) die(`unknown option ${arg}`);
    if (options.input) die("accepts exactly one source path");
    options.input = arg;
  }
  if (!options.input) {
    usage();
    die("missing source path");
  }
  if (!FORMATS.has(options.format)) die(`unsupported format ${options.format}`);
  return options;
}

function lineEndingKind(text) {
  const crlf = (text.match(/\r\n/g) || []).length;
  const bareLf = (text.match(/(?<!\r)\n/g) || []).length;
  const bareCr = (text.match(/\r(?!\n)/g) || []).length;
  const kinds = [crlf > 0, bareLf > 0, bareCr > 0].filter(Boolean).length;
  if (kinds > 1) return "mixed";
  if (crlf) return "crlf";
  if (bareLf) return "lf";
  if (bareCr) return "cr";
  return "none";
}

function sampleMatches(lines, predicate, limit = 20) {
  const matches = [];
  lines.forEach((line, index) => {
    if (predicate(line, index) && matches.length < limit) {
      matches.push({ line: index + 1, text: line.trim().slice(0, 160) });
    }
  });
  return matches;
}

function detectFormat(stats) {
  if (stats.timestampCount >= 2 && stats.subtitleIndexCount >= 2) return "subtitle";
  if (stats.timestampCount >= 2) return "transcript";
  if (stats.sceneHeadingCount >= 2 && stats.speakerCandidateCount >= 2) return "screenplay";
  if (stats.sceneHeadingCount >= 1 && stats.parentheticalCount >= 2) return "fountain";
  if (stats.colonSpeakerCount >= 3 || stats.stageDirectionCount >= 3) return "stage-play";
  if (stats.outlineLineRatio >= 0.2) return "outline";
  return "prose";
}

const options = parseArgs(process.argv.slice(2));
const inputPath = path.resolve(options.input);
if (!fs.existsSync(inputPath)) die(`source does not exist: ${inputPath}`, 1);
const stat = fs.statSync(inputPath);
if (!stat.isFile()) die(`source is not a file: ${inputPath}`, 1);

const buffer = fs.readFileSync(inputPath);
if (buffer.length === 0) die("source is empty", 1);
let text = buffer.toString("utf8");
const hasBom = text.charCodeAt(0) === 0xfeff;
if (hasBom) text = text.slice(1);
const normalized = text.replace(/\r\n?/g, "\n");
const lines = normalized.split("\n");
const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
if (nonEmptyLines.length === 0) die("source has no non-whitespace content", 1);

const timestampPattern = /(?:\d{1,2}:)?\d{2}:\d{2}[,.]\d{3}\s*(?:-->|-)\s*(?:\d{1,2}:)?\d{2}:\d{2}[,.]\d{3}/;
const scenePattern = /^(?:INT\.?|EXT\.?|INT\.?\/EXT\.?|I\/E\.?|内景|外景|场景|第[一二三四五六七八九十百0-9]+[幕场])(?:\s|[.:-]|$)/iu;
const transitionPattern = /^(?:CUT TO|FADE IN|FADE OUT|DISSOLVE TO|SMASH CUT|转场|淡入|淡出)\s*:?(?:\s|$)/iu;
const uppercaseSpeakerPattern = /^[A-Z][A-Z0-9 ._'()\-]{1,40}$/;
const colonSpeakerPattern = /^[\p{L}][\p{L}\p{N} ._'()\-]{0,30}[：:]$/u;
const stageDirectionPattern = /^\s*[\[(（].{2,120}[\])）]\s*$/u;
const parentheticalPattern = /^\s*\(.{1,80}\)\s*$/;
const outlinePattern = /^\s*(?:[-*+] |\d+[.)] |[一二三四五六七八九十]+[、.])/u;

const excludedSpeakerLabels = new Set(["THE END", "CONTINUED", "CONT'D", "CUT TO", "FADE IN", "FADE OUT", "TITLE", "BLACK"]);
const speakerCounts = new Map();
let timestampCount = 0;
let subtitleIndexCount = 0;
let sceneHeadingCount = 0;
let colonSpeakerCount = 0;
let stageDirectionCount = 0;
let parentheticalCount = 0;
let outlineLineCount = 0;

for (let index = 0; index < lines.length; index += 1) {
  const trimmed = lines[index].trim();
  if (timestampPattern.test(trimmed)) timestampCount += 1;
  if (/^\d{1,6}$/.test(trimmed) && timestampPattern.test((lines[index + 1] || "").trim())) subtitleIndexCount += 1;
  if (scenePattern.test(trimmed)) sceneHeadingCount += 1;
  if (stageDirectionPattern.test(trimmed)) stageDirectionCount += 1;
  if (parentheticalPattern.test(trimmed)) parentheticalCount += 1;
  if (outlinePattern.test(trimmed)) outlineLineCount += 1;

  const colonMatch = colonSpeakerPattern.test(trimmed);
  if (colonMatch) colonSpeakerCount += 1;
  const uppercaseMatch = uppercaseSpeakerPattern.test(trimmed) && trimmed === trimmed.toUpperCase();
  const plausibleContext = (lines[index + 1] || "").trim().length > 0;
  if ((colonMatch || uppercaseMatch) && plausibleContext && !scenePattern.test(trimmed) && !transitionPattern.test(trimmed)) {
    const label = trimmed.replace(/[：:]$/, "").replace(/\s+/g, " ").trim();
    if (!excludedSpeakerLabels.has(label)) speakerCounts.set(label, (speakerCounts.get(label) || 0) + 1);
  }
}

const stats = {
  timestampCount,
  subtitleIndexCount,
  sceneHeadingCount,
  speakerCandidateCount: speakerCounts.size,
  colonSpeakerCount,
  stageDirectionCount,
  parentheticalCount,
  outlineLineRatio: outlineLineCount / Math.max(nonEmptyLines.length, 1),
};
const detectedFormat = options.format === "auto" ? detectFormat(stats) : options.format;
const replacementLines = sampleMatches(lines, (line) => line.includes("\uFFFD"));
const longLines = sampleMatches(lines, (line) => line.length > 500);
const tabLines = sampleMatches(lines, (line) => line.includes("\t"));
const mojibakeLines = sampleMatches(lines, (line) => /(?:Ã.|Â.|â€|鈥|锟斤拷)/u.test(line));
const sceneHeadings = sampleMatches(lines, (line) => scenePattern.test(line.trim()));
const timestamps = sampleMatches(lines, (line) => timestampPattern.test(line));
const speakers = [...speakerCounts.entries()]
  .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
  .slice(0, 30)
  .map(([label, occurrences]) => ({ label, occurrences }));

const warnings = [];
if (replacementLines.length) warnings.push({ code: "utf8-replacement", message: "Replacement characters indicate undecodable input.", lines: replacementLines.map((item) => item.line) });
if (buffer.includes(0)) warnings.push({ code: "null-bytes", message: "Null bytes suggest a binary or UTF-16 source." });
if (mojibakeLines.length) warnings.push({ code: "possible-mojibake", message: "Text contains common mojibake sequences.", lines: mojibakeLines.map((item) => item.line) });
if (longLines.length) warnings.push({ code: "long-lines", message: "Very long lines may prevent reliable line-based parsing.", lines: longLines.map((item) => item.line) });
if (stats.sceneHeadingCount === 0 && ["screenplay", "fountain"].includes(detectedFormat)) warnings.push({ code: "missing-scene-headings", message: "Selected screenplay format has no recognized scene headings." });

const report = {
  reportVersion: 1,
  source: {
    path: inputPath,
    bytes: buffer.length,
    sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
    normalizedSha256: crypto.createHash("sha256").update(normalized, "utf8").digest("hex"),
    utf8Bom: hasBom,
    lineEndings: lineEndingKind(text),
  },
  detectedFormat,
  requestedFormat: options.format,
  counts: {
    lines: lines.length,
    nonEmptyLines: nonEmptyLines.length,
    wordsApproximate: (normalized.match(/[\p{L}\p{N}]+/gu) || []).length,
    characters: [...normalized].length,
    sceneHeadings: sceneHeadingCount,
    timestamps: timestampCount,
    speakerCandidates: speakerCounts.size,
    tabs: tabLines.length,
  },
  samples: { sceneHeadings, timestamps, speakers, longLines, tabLines },
  warnings,
};

const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (options.out) {
  const outputPath = path.resolve(options.out);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, serialized, "utf8");
  console.log(`Inspected ${report.counts.lines} lines as ${detectedFormat}; ${warnings.length} warning(s).`);
  console.log(`Report: ${outputPath}`);
} else {
  process.stdout.write(serialized);
}

if (replacementLines.length || buffer.includes(0)) process.exitCode = 1;
