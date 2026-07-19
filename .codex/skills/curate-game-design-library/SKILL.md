---
name: curate-game-design-library
description: Maintain evidence-backed, versioned game-design libraries and inspiration packs. Use when defining corpus scope, collecting sources and title observations, distilling cross-title callable patterns, auditing originality, generating indexes, or publishing a validated library release; do not use for ordinary one-off game production.
---

# Curate Game Design Library

Build and maintain an auditable design-knowledge system. Keep the evidence corpus, callable pattern library, production selector, and generated game separate so research can evolve without silently changing a shipped production.

## Read first

Read `references/contracts-and-gates.md` before adding records or changing a release. Read `references/release-procedure.md` before publishing, migrating, or deprecating anything. Treat JSON as authoritative; generate indexes and reports from it.

## Non-negotiable boundaries

- Establish corpus scope from reproducible authority snapshots before collecting observations.
- Separate fact, interpretation, comparison, lineage, and analogy claims.
- Use paraphrase and structured causal observations; do not retain walkthrough prose, maps, dialogue, music, or copyrighted assets.
- Never promote a single-title observation into automatic production use.
- Require cross-title support, counterevidence, typed hooks, department contracts, tests, runtime requirements, and originality controls for every released pattern.
- Keep source fingerprints and title observations out of the production retrieval index.
- Enforce `design-library/governance/originality-validation-policy.json`: P1-P6 static abstraction checks are blocking, historical pattern-level blind evidence is diagnostic, and P8 owns blocking whole-game blind attribution.
- Derive coverage and hashes with tools. Never hand-edit a percentage or release hash to pass a gate.
- Preserve stable IDs. Deprecate and migrate; do not reuse or silently rewrite them.

## Workflow

### 1. Freeze scope and contracts

1. Record the authority snapshot, access date, content hash, and parsed candidate union.
2. Reconcile the authority union against the candidate registry in both directions.
3. Resolve every candidate to `included` or `excluded`; work-level `review` must be zero in a frozen scope.
4. Group ports, regions, remakes, remasters, expansions, and enhanced editions under the original work unless the scope policy explicitly says otherwise.
5. Strict-compile every JSON Schema with Draft 2020-12 and run positive plus negative fixtures.
6. Freeze the analysis dimensions, source-tier matrix, evidence policy, originality policy, coverage thresholds, and hash policy.

Stop when G0 or a contract check fails. Do not begin cross-title conclusions during scope work.

### 2. Calibrate observation grain

1. Select structurally different works across era, perspective, loop, and production assumptions.
2. Have a second analyst independently review theme grain, dimension edges, fact/interpretation separation, disposition, and source-surface isolation.
3. Treat one observation as one player-readable action → state → feedback → consequence chain.
4. Correct disputed evidence edges before using them as pattern provenance.
5. Compile one calibration-only provisional pattern through `detect`, `score`, `instantiate`, `emit`, and `validate`.

Do not count the provisional slice as a released pattern.

### 3. Cover the corpus

For every included work, produce one verified dossier containing every frozen dimension, atomic observations, claim-ledger references, original-version scope, author/reviewer separation, contribution hypotheses, nonportable details, and explicit gaps. Use a justified `not-applicable` state when a dimension truly does not apply; never attach a weak dimension merely to force coverage.

Run the validator after every batch. G1 requires complete work and core-dimension coverage; G2 requires closed evidence edges and A/B support for critical claims.

### 4. Distill cross-title patterns

1. Cluster observations by causal structure, not by nouns or franchise surface.
2. State the design problem, invariant principle, positive signals, contraindications, and abstention conditions.
3. Provide at least two supporting works and one counterexample for an auto-selectable pattern.
4. Encode effect primitives and all five hooks with typed paths, operators, parameters, mappings, and assertions.
5. Emit separate gameplay, performance, stage, and evaluation contracts.
6. Specify teaching, practice, variation, combination/reversal, and exam.
7. Record dependencies, synergies, conflicts, failure modes, recovery, accessibility, runtime capabilities, cost, and adapter compatibility.
8. Transform at least three expression axes and three structural axes; run an independent static originality review. Retain any pattern-level blind exercise as diagnostic evidence, never as P1-P6 release authorization.

Keep unsupported but valuable ideas as `reviewed` research-only records with `autoSelectable: false`.

### 5. Publish a Beta or Stable release

Generate observation disposition, coverage, originality, flavor, faceted, retrieval, and provenance reports. The production retrieval index may contain only released abstractions and selection metadata. Lock Schema, Library, Pack, Adapter, indexes, and file hashes. Exclude each manifest from its own tree hash and let its parent release hash the child manifest.

Publish Beta after the P1–P6 evidence exists. P7 must first prove autonomous generation of a complete playable candidate. Do not label the library Stable until P8 whole-game blind attribution, user cold experience, reproducibility, and rollback gates are complete.

## Validation commands

Run from the repository root:

```powershell
node .codex/skills/curate-game-design-library/scripts/validate-library.mjs
node .codex/skills/curate-game-design-library/scripts/compile-release.mjs
```

The first command must be clean before release generation. Regenerate, then validate once more because any changed payload invalidates hashes.

## Failure routing

- Wrong title or version fact → source, claim, or dossier.
- Missing dimension or weak causal edge → title analysis/calibration.
- Duplicate or contradictory pattern → taxonomy/distillation.
- Source-looking instance → originality abstraction and transformation rules.
- Runtime-infeasible pattern → adapter or pattern capability declaration.
- Wrong selection → selector benchmark, signal, score, veto, or counterexample.
- Broken file counts or hashes → release compiler; never patch the manifest by hand.

Finish by reporting the exact release status, unresolved gaps, gate evidence, and why the result is Beta or Stable.
