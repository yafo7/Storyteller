---
name: select-game-design-patterns
description: Select, reject, compose, and originalize released game-design patterns from a locked library. Use after canon-first story analysis when a production needs a story-fit core mechanic, up to three supporting patterns, runtime negotiation, abstention, typed department handoffs, and design lineage; never use raw title observations as generation prompts.
---

# Select Game Design Patterns

Turn an approved story model and production charter into a bounded, explainable pattern recommendation. Select principles because they serve this story; do not decorate a story with franchise references.

## Read first

Read `references/selection-protocol.md` for scoring, vetoes, and output closure. Read `references/originality-and-composition.md` before instantiating or combining patterns.

## Required inputs

Require all of the following before production retrieval:

- approved canon-first `story-model.json` with facts, character knowledge, reveal order, ending constraints, locations, interaction opportunities, and story-derived signals;
- `production-charter.json` with experience goals, target duration, content and art budget, and accessibility needs;
- exact `library-lock.json` naming Schema, Library, Pack, Adapter, Product Profile, runtime, and specialist Skill versions plus hashes;
- declared runtime capabilities and fallbacks;
- enabled and blocked inspiration packs.

If story analysis is missing, stop and route to the story phase. Never infer canon from pattern data. Permit an unlocked run only when an explicit benchmark command requests pre-release calibration; never treat that output as production-approved.

## Selection workflow

### 1. Enforce the lock and provenance policy

Verify the lock against the current file trees before reading the retrieval index. Reject `latest`, floating versions, missing or drifting hashes, unavailable releases, and overlap between enabled and blocked packs. A blocked pack must not re-enter through a promoted core pattern. Load only released, `autoSelectable: true` records compatible with the locked adapter.

### 2. Load the index first

Read `design-library/indexes/retrieval-index.json`. Extract story-signal, experience-goal, spatial, capability, cost, conflict, and originality facets. Shortlist a small candidate set, then read full records for only those IDs from the locked pattern file.

Never load title dossiers, raw observations, source records, or evidence-only fingerprints into production generation context. The evaluator may inspect provenance later.

### 3. Apply hard vetoes before scoring

Reject a candidate when it:

- changes a protected fact, character knowledge boundary, reveal order, or ending constraint;
- requires a runtime capability with no approved, principle-preserving fallback;
- exceeds a hard production budget;
- creates an unrecoverable route or save state;
- preserves recognizable source topology, object-role sequence, boss script, audiovisual signature, UI, dialogue, character, or lore;
- matches only a noun or keyword while lacking a causal story signal.

No weighted score may offset a veto.

### 4. Score surviving candidates

Use the locked 5-point model:

- story conflict/theme relevance: 25%;
- embodied dramatic integration: 20%;
- repeatable development depth: 15%;
- state causality: 10%;
- spatial memory/reinterpretation: 10%;
- runtime fit: 10%;
- budget fit: 5%;
- originality margin: 5%.

Record every considered candidate, score, evidence path, veto, verdict, and reason. Require multiple causal signals; do not select on lexical coincidence.

### 5. Decide whether to abstain

Return `abstained: true` with no applications when no candidate clears story, runtime, recovery, originality, and development thresholds. Also abstain when interaction would damage a fixed rhetorical form, required transformation would erase story fit, or the production cannot make consequences perceptible.

Abstention routes the production to the no-Pack story-derived gameplay path; it is a successful decision, not an error.

### 6. Compose one core and up to three supports

Choose exactly one core when not abstaining. Add zero to three support patterns only when they reinforce the same experience axis, cover a distinct department need, and introduce no declared conflict. Prefer removing support patterns to weakening the core.

The core must receive a full teach → practice → variation → combine/reverse → exam arc. At least one use must reinterpret an earlier place, object, fact, or relationship. The final use must recombine rules the player has already operated.

### 7. Originalize from story-derived bindings

Bind actors, locations, objects, facts, beats, and consequences from the story model. Keep only the abstract principle. Transform at least four axes in production: worldbuilding, characters, objects, topology, feedback, causality, timing, visual language, audio language, or controls. Record structural deltas for topology graph, object-role graph, action sequence, feedback signature, and narrative function.

Do not use source names or reconstruct a remembered source encounter. Declare the eventual P8 whole-game blind source-attribution requirement, but do not block a P1-P6 Library/Skill Beta on stale or missing pattern-level blind exercises.

### 8. Emit typed handoffs

Write `pattern-recommendations.json` against the formal schema with `status: draft`. Only the downstream originality/canon review may approve it. Include:

- query and provenance policy;
- all considered and selected candidates;
- one core plus zero to three supports, or legal abstention;
- five hook bindings and typed effect applications per selection;
- runtime assessment and approved fallbacks;
- originality plan and discarded surfaces;
- gameplay, performance, stage, and evaluation handoffs;
- design lineage and observable evidence expected in downstream files.

Do not write final gameplay, performance, or map plans; downstream owners accept, constrain, or reject the handoff.

## Deterministic tools

From the repository root, run:

```powershell
node .codex/skills/select-game-design-patterns/scripts/select-patterns.mjs <story-fixture.json> --lock=<library-lock.json> --output=<pattern-recommendations.json>
node .codex/skills/select-game-design-patterns/scripts/run-benchmarks.mjs
```

The benchmark wrapper is the only place allowed to pass `--benchmark-unlocked`; its outputs remain drafts. Use the selector for reproducible filtering and contract generation, then apply expert review to story signals, transformation quality, and abstention. Never bypass the lock or formal schema in production.

## Completion conditions

Finish only when G6 selection quality, G7 composition discipline, G8 canon safety, and G9 runtime fit have machine evidence; every rejection is explainable; no selected candidate has a static clone-risk veto; the recommendation can be reproduced from the exact lock; and its P8 whole-game blind-review obligation is explicit. Never mark that P8 gate passed during selection.
