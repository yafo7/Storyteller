import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const fixtureRoot = path.join(root, "benchmarks", "story-fixtures");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

const specs = [
  { id:"locked-room", category:"locked-room", file:"locked-room.json", expected:["Select one stateful core with observable before/after world consequences","Include safe teaching and revisit development"], forbidden:["No cooperative-only or open-world scale pattern","No source-specific room or object sequence"], abstain:"must-select" },
  { id:"relationship-drama", category:"relationship-drama", file:"relationship-drama.json", expected:["Prefer NPC state, schedule, or agency-performance patterns","Keep spatial mechanics subordinate to relationship revelation"], forbidden:["No combat boss or object-composition core","No forced high-area exploration"], abstain:"must-select" },
  { id:"journey-chase", category:"journey-chase", file:"comedy-chase.json", expected:["Support route decisions under schedule pressure","Preserve comedy and passenger response"], forbidden:["No reset loop that erases comic continuity","No solitary contemplative core"], abstain:"must-select" },
  { id:"open-exploration", category:"open-exploration", file:"open-exploration.json", expected:["Prefer landmark, systemic rule, or possibility-expanding reward patterns","Permit multiple causal routes within runtime budget"], forbidden:["No forced fixed-order puzzle solution","No long authored cutscene core"], abstain:"must-select" },
  { id:"comedy", category:"comedy", file:"comedy-chase.json", expected:["Selected patterns must tolerate fast feedback and comic failure","At most one core and three supports"], forbidden:["No solemn source surface or boss-script transfer","No schedule system that makes recovery punitive"], abstain:"must-select" },
  { id:"dialogue-heavy", category:"dialogue-heavy", file:"relationship-drama.json", expected:["Use interaction windows and NPC memory without rewriting authored facts","Preserve reveal order"], forbidden:["No dialogue dump disguised as a mechanic","No spatial transformation unrelated to character action"], abstain:"may-abstain" },
  { id:"low-spatial-change", category:"low-spatial-change", file:"low-spatial-change.json", expected:["Prefer schedule, social response, or performance pacing over map replacement","Keep topology cost low"], forbidden:["No open-world or dense-overworld core","No multi-layer map requirement"], abstain:"may-abstain" },
  { id:"negative-monologue", category:"negative-control", file:"low-fit-monologue.json", expected:["Abstain because uninterrupted fixed rhetoric has insufficient causal interaction fit"], forbidden:["No Zelda-derived core pattern","No invented spatial or inventory conflict"], abstain:"must-abstain" },
  { id:"reward-2-complete-bindings", category:"regression", file:"reward-2-complete-bindings.json", expected:["Select the Reward 2.0 pattern only with complete explicit bindings"], forbidden:["No synthesized placeholder may satisfy a Reward 2.0 manual binding"], abstain:"must-select" },
  { id:"reward-2-missing-bindings", category:"regression", file:"reward-2-missing-bindings.json", expected:["Reject Reward 2.0 when explicit bindings are absent"], forbidden:["No incomplete Reward 2.0 application may be emitted"], abstain:"may-abstain" }
];

const cases = [];
for (const spec of specs) {
  const bytes = await readFile(path.join(fixtureRoot, spec.file));
  const fixture = JSON.parse(bytes);
  cases.push({
    schemaVersion: "1.0.0", benchmarkId: `benchmark.${spec.id}`, category: spec.category,
    inputFixture: {
      path: `design-library/benchmarks/story-fixtures/${spec.file}`, hash: sha(bytes), originalityStatement: fixture.originalityStatement
    },
    productProfile: fixture.productProfile.id, runtimeCapabilities: fixture.runtimeCapabilities,
    expectedProperties: spec.expected, forbiddenProperties: spec.forbidden, abstentionExpectation: spec.abstain,
    seeds: [101, 202, 303],
    metrics: [
      { metricId: "metric.hard-veto-count", comparator: "equals", threshold: 0, unit: "count", hardGate: true },
      { metricId: "metric.core-count", comparator: spec.abstain === "must-abstain" ? "equals" : "less-or-equal", threshold: spec.abstain === "must-abstain" ? 0 : 1, unit: "count", hardGate: true },
      { metricId: "metric.support-count", comparator: "less-or-equal", threshold: 3, unit: "count", hardGate: true }
    ],
    status: "active", failureOwner: "select-game-design-patterns"
  });
}

await mkdir(path.join(root, "benchmarks", "expected"), { recursive: true });
await writeFile(path.join(root, "benchmarks", "benchmark-cases.json"), `${JSON.stringify(cases, null, 2)}\n`);
console.log(`Compiled ${cases.length} active selector benchmark cases.`);
