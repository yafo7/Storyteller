import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const packRoot = path.join(root, "packs", "zelda-mainline");
const profilesRoot = path.join(packRoot, "works", "profiles");
const supplementalPath = path.join(packRoot, "observations", "p4-supplemental-evidence.json");
const dimensions = JSON.parse(await readFile(path.join(root, "taxonomies", "dimensions.json"), "utf8")).terms.map((term) => term.termId);
const dimensionSet = new Set(dimensions);
const works = JSON.parse(await readFile(path.join(packRoot, "works", "work-registry.json"), "utf8"));
const workById = new Map(works.map((work) => [work.workId, work]));

const filenames = (await readdir(profilesRoot)).filter((name) => name.endsWith(".json")).sort();
if (filenames.length !== works.length) throw new Error(`Expected ${works.length} title profiles, found ${filenames.length}.`);

const seenWorks = new Set();
const claims = [];
const observations = [];
const dossiers = [];

for (const filename of filenames) {
  const profile = JSON.parse(await readFile(path.join(profilesRoot, filename), "utf8"));
  const work = workById.get(profile.workId);
  if (!work) throw new Error(`${filename}: unknown workId ${profile.workId}`);
  if (seenWorks.has(profile.workId)) throw new Error(`${filename}: duplicate profile for ${profile.workId}`);
  seenWorks.add(profile.workId);
  if (!profile.author || !profile.reviewer || profile.author === profile.reviewer) throw new Error(`${filename}: author and reviewer must be distinct.`);
  const summaryKeys = Object.keys(profile.dimensionSummaries ?? {}).sort();
  if (summaryKeys.length !== dimensions.length || summaryKeys.some((id, index) => id !== [...dimensions].sort()[index])) {
    throw new Error(`${filename}: dimensionSummaries must contain exactly the frozen 20 dimensions.`);
  }
  for (const [id, summary] of Object.entries(profile.dimensionSummaries)) {
    if (!dimensionSet.has(id) || typeof summary !== "string" || summary.length < 20) throw new Error(`${filename}: invalid summary for ${id}`);
  }
  const notApplicable = profile.notApplicableDimensions ?? {};
  for (const [id, reason] of Object.entries(notApplicable)) {
    if (!dimensionSet.has(id) || typeof reason !== "string" || reason.length < 20) throw new Error(`${filename}: invalid not-applicable rationale for ${id}`);
  }
  if (!Array.isArray(profile.observationThemes) || profile.observationThemes.length !== 5) throw new Error(`${filename}: exactly five observationThemes required.`);

  const covered = new Set();
  const keys = new Set();
  for (const [index, theme] of profile.observationThemes.entries()) {
    const required = ["key", "dimensions", "context", "preconditions", "playerInput", "before", "action", "after", "feedback", "consequences", "factualDescription", "interpretation", "confidence", "disposition"];
    for (const key of required) if (!(key in theme)) throw new Error(`${filename}: theme ${index} missing ${key}`);
    if (!/^[a-z0-9-]+$/.test(theme.key) || keys.has(theme.key)) throw new Error(`${filename}: invalid/duplicate theme key ${theme.key}`);
    keys.add(theme.key);
    if (!Array.isArray(theme.dimensions) || theme.dimensions.length < 1) throw new Error(`${filename}: theme ${theme.key} needs dimensions.`);
    for (const id of theme.dimensions) {
      if (!dimensionSet.has(id)) throw new Error(`${filename}: theme ${theme.key} has unknown dimension ${id}`);
      if (id in notApplicable) throw new Error(`${filename}: theme ${theme.key} cannot cover not-applicable dimension ${id}`);
      covered.add(id);
    }
    for (const key of ["preconditions", "playerInput", "before", "action", "after", "feedback", "consequences"]) {
      if (!Array.isArray(theme[key]) || (key !== "preconditions" && key !== "before" && theme[key].length < 1)) throw new Error(`${filename}: theme ${theme.key} invalid ${key}`);
    }

    const slug = work.workId.slice("work.".length);
    const observationId = `observation.${slug}.${theme.key}`;
    const factClaimId = `claim.${slug}.${theme.key}.fact`;
    const interpretationClaimId = `claim.${slug}.${theme.key}.interpretation`;
    const sourceRef = `source.game.${slug}`;
    const locator = `${theme.context}; observable state/action chain in primary version`;
    claims.push({
      schemaVersion: "1.0.0", claimId: factClaimId, claimType: "fact",
      criticality: index === 0 ? "critical" : "supporting", minimumSourceTier: "A",
      statement: theme.factualDescription, workRefs: [work.workId], versionRefs: [work.releaseFamily.primaryVersionId],
      evidence: [{ sourceRef, locator, relation: "supports" }], confidence: theme.confidence, status: "verified",
      review: { author: profile.author, reviewer: profile.reviewer, notes: ["Behavioral fact kept separate from analyst interpretation."] }
    });
    claims.push({
      schemaVersion: "1.0.0", claimId: interpretationClaimId, claimType: "interpretation",
      criticality: "supporting", minimumSourceTier: "A", statement: theme.interpretation,
      workRefs: [work.workId], versionRefs: [work.releaseFamily.primaryVersionId],
      evidence: [{ sourceRef, locator, relation: "contextualizes" }], confidence: theme.confidence, status: "reviewed",
      review: { author: profile.author, reviewer: profile.reviewer, notes: ["Interpretive claim does not assert creator intent or historical lineage."] }
    });
    observations.push({
      schemaVersion: "1.0.0", observationId, workId: work.workId, versionId: work.releaseFamily.primaryVersionId,
      dimensionIds: [...new Set(theme.dimensions)], context: theme.context, preconditions: theme.preconditions,
      playerInput: theme.playerInput, stateTransition: { before: theme.before, action: theme.action, after: theme.after },
      feedback: theme.feedback, consequences: theme.consequences, factualDescription: theme.factualDescription,
      factClaimRefs: [factClaimId], interpretation: theme.interpretation, interpretationClaimRefs: [interpretationClaimId],
      confidence: theme.confidence, disposition: theme.disposition, status: "verified",
      reviewNotes: [`Reviewed by ${profile.reviewer}; source-specific surfaces remain evidence-only.`]
    });
  }
  const missing = dimensions.filter((id) => !covered.has(id) && !(id in notApplicable));
  if (missing.length) throw new Error(`${filename}: observations do not cover ${missing.join(", ")}`);

  const slug = work.workId.slice("work.".length);
  const observationRefsByDimension = Object.fromEntries(dimensions.map((id) => [id, profile.observationThemes.filter((theme) => theme.dimensions.includes(id)).map((theme) => `observation.${slug}.${theme.key}`)]));
  for (const id of dimensions) work.dimensionCoverage[id] = id in notApplicable ? "not-applicable" : "covered";
  dossiers.push({
    schemaVersion: "1.0.0", dossierId: `dossier.${slug}`, workId: work.workId, scopeVersion: "1.0.0", status: "verified",
    dimensions: dimensions.map((dimensionId) => ({
      dimensionId,
      coverage: dimensionId in notApplicable ? "not-applicable" : "covered",
      summary: profile.dimensionSummaries[dimensionId],
      observationRefs: dimensionId in notApplicable ? [] : observationRefsByDimension[dimensionId],
      gaps: dimensionId in notApplicable ? [notApplicable[dimensionId]] : []
    })),
    contributionHypotheses: profile.contributionHypotheses ?? [], uniqueOrNonportable: profile.uniqueOrNonportable ?? [], openQuestions: profile.openQuestions ?? [],
    review: { author: profile.author, reviewer: profile.reviewer, reviewedAt: "2026-07-17" }
  });
}

// P3's five-observation-per-title corpus remains immutable. P4 may add narrowly
// scoped evidence that closes a distillation blocker without rewriting that
// calibrated baseline. The supplement stores full claim/observation records so
// a clean rebuild remains deterministic and reviewable.
let supplemental = { claims: [], observations: [] };
try {
  supplemental = JSON.parse(await readFile(supplementalPath, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
if (!Array.isArray(supplemental.claims) || !Array.isArray(supplemental.observations)) {
  throw new Error("P4 supplemental evidence must contain claims and observations arrays.");
}
const baseClaimIds = new Set(claims.map((claim) => claim.claimId));
const baseObservationIds = new Set(observations.map((observation) => observation.observationId));
for (const claim of supplemental.claims) {
  if (baseClaimIds.has(claim.claimId)) throw new Error(`P4 supplement duplicates claim ${claim.claimId}.`);
  if (!claim.review?.author || !claim.review?.reviewer || claim.review.author === claim.review.reviewer) {
    throw new Error(`${claim.claimId}: supplemental claim author and reviewer must be distinct.`);
  }
  baseClaimIds.add(claim.claimId);
  claims.push(claim);
}
for (const observation of supplemental.observations) {
  if (baseObservationIds.has(observation.observationId)) throw new Error(`P4 supplement duplicates observation ${observation.observationId}.`);
  if (!observation.factClaimRefs?.every((ref) => baseClaimIds.has(ref)) || !observation.interpretationClaimRefs?.every((ref) => baseClaimIds.has(ref))) {
    throw new Error(`${observation.observationId}: supplemental claim references do not close.`);
  }
  baseObservationIds.add(observation.observationId);
  observations.push(observation);
}

await mkdir(path.join(packRoot, "claims"), { recursive: true });
await mkdir(path.join(packRoot, "observations"), { recursive: true });
await writeFile(path.join(packRoot, "claims", "claim-registry.json"), `${JSON.stringify(claims, null, 2)}\n`);
await writeFile(path.join(packRoot, "observations", "observation-registry.json"), `${JSON.stringify(observations, null, 2)}\n`);
await writeFile(path.join(packRoot, "works", "title-dossier-registry.json"), `${JSON.stringify(dossiers, null, 2)}\n`);
await writeFile(path.join(packRoot, "works", "work-registry.json"), `${JSON.stringify(works, null, 2)}\n`);
console.log(`Compiled ${dossiers.length} dossiers, ${observations.length} observations, and ${claims.length} claims.`);
