---
name: build-interactive-stage-game-v03
description: Orchestrate a complete script-to-game production with a canon-first story model, locked design-library patterns, specialist gameplay/performance/stage/art/build phases, resumable checkpoints, route simulation, browser QA, and independent originality gates. Use when autonomously building or regenerating a playable narrative game with the 0.3 workflow; do not overwrite 0.1, 0.2, or 0.21 products.
---

# Build Interactive Stage Game 0.3

Act as the total director for an autonomous, evidence-backed script-to-game production. The user supplies the story and high-level product constraints. Own the detailed gameplay, performance, staging, art, implementation, and QA decisions while preserving canon and reporting design lineage.

## Read first

Read `references/workflow-and-handoffs.md` for phase ownership and invalidation. Read `references/checkpoint-and-resume-protocol.md` before starting or resuming a production. Read `references/acceptance-and-failure-routing.md` before claiming a candidate or repairing a failed gate.

## Program boundary

P1-P6 build and validate this workflow as a Skill Beta. They do not generate the 0.3 game. P7 autonomously generates and freezes one playable candidate. P8 independently validates that frozen candidate, including whole-game blind originality, cold-user, reproducibility, and rollback gates. Never report Stable before `99-release` is committed.

Preserve every 0.1, 0.2, and 0.21 Skill, product tree, route, port mapping, and save namespace. A 0.3 production always uses a new directory, URL path, and save namespace.

## Governing architecture

Keep three inputs orthogonal and lock each independently:

- Story semantics: facts, beliefs, knowledge boundaries, reveal order, dramatic spine, and ending constraints.
- Product Profile: perspective, controls, art language, interface, target device, runtime, and production limits.
- Inspiration Pack: versioned abstract design knowledge that may be selected, rejected, or disabled.

A visual Profile never proves gameplay flavor. A Pack never changes canon. Story evidence never cites pattern data.

## P7 autonomous production

### Start or resume

When P7 is authorized, initialize `production-run-state.json` in a new empty product root with `scripts/production-run-state.mjs init`. Record a stable run ID and director/producer ID, then lock the source and every available Profile, runtime, Schema, Library, Pack, Adapter, and Skill input. Record the requested port and a unique entry path.

After any interruption, run `resume` before reading generated files or making decisions. The immutable checkpoint chain, not conversational memory or file timestamps, determines the next phase. If `resume` reports hash drift, restart at its invalidation boundary. Never manually edit the state or a checkpoint.

### 00 - Brief

Locate the full source script and create `production-charter.json`. Record player experience, target duration, platform, requested local port and entry path, content budget, visual requirements, accessibility, save behavior, acceptance criteria, and explicit assumptions. Resolve only contradictions that materially change scope; otherwise proceed autonomously without asking the user to design individual mechanics, scenes, puzzles, shots, or assets. Commit `00-brief`.

### 05 - Dependency lock draft

Create `dependency-lock-draft.json` with intended exact Schema, Library, enabled and blocked Packs, Adapter, Product Profile, runtime, director, selector, and specialist Skill versions. Reject floating versions and unavailable components. Do not claim production input hashes are final before Story exists. Commit `05-lock-draft`.

### 10 - Story before patterns

Invoke `analyze-story-for-game` and produce canon-first `story-model.json` before loading any pattern index. Verify facts, beliefs, knowledge boundaries, reveal order, dramatic spine, motifs, locations, adaptation limits, and player-role candidates. Commit `10-story`.

### 12 - Final lock and preflight

Finalize `library-lock.json` after hashing the source script, approved Story, Charter, component trees, closed Pack sets, index, Schema, Profile, Adapter, runtime, and Skills. Reject drift. Run:

```text
node .codex/skills/build-interactive-stage-game-v03/scripts/preflight.mjs <library-lock.json> <story-input.json> --evidence-out=<product-root>/reports/director-preflight.json
```

A failed preflight blocks retrieval. Commit `12-lock-final` with the lock and passing preflight evidence.

### 15 - Pattern selection

Invoke `select-game-design-patterns`. Load only the locked retrieval index, apply provenance/runtime/canon/originality vetoes, score candidates, allow abstention, and emit `pattern-recommendations.json`. Accept one core plus at most three supports. Preserve every rejection and the design lineage. Commit `15-patterns`.

### 20 - Gameplay

Invoke `design-narrative-gameplay` with Story and the typed pattern handoff. Define the story-derived core loop, verbs, effect transactions, inventory, map-layer rules, teaching and development arc, failure recovery, hints, and runtime capabilities. Do not import source-game objects or puzzle sequences. Commit `20-gameplay`.

### 30 - Performance

Invoke `direct-interactive-drama`. Introduce the unknown player role through action instead of an exposition wall. Define beat intent, actor tactics, knowledge-gated dialogue, interaction windows, pacing, replay and skip behavior, and state-responsive performance. Alternate purposeful agency with authored performance. Commit `30-performance`.

### 40 - World and stage

Invoke `design-stage-and-levels`. Convert approved gameplay and performance into topology, landmarks, portals, collision, state variants, prop placement, actor blocking, camera cues, navigation invariants, and recovery routes. Make meaningful interactions cause visible future consequences. Commit `40-world`.

### 50 - Art

Invoke `art-direct-game-assets`. Establish a coherent art bible, identity sheets, portraits, gameplay sprites, map states, props, UI, and provenance. Generate or source art under explicit rights rules. Inspect identity consistency, map readability, state contrast, and in-engine scale. Commit `50-art`.

### 60 - Build

Invoke `compile-script-game`. Negotiate runtime capabilities before compilation. Build typed handoffs into deterministic production IR, save model, state transactions, cues, and a playable package. If a selected pattern cannot be implemented faithfully, return to selection or Adapter; never silently reduce it to text. Commit `60-build`.

### 70 - Candidate self-check

Invoke `evaluate-script-game` as the production self-check. Run schema checks, required-route simulations, softlock and save/reload tests, real-browser QA, screenshots, performance timing, visual coherence, accessibility, canon diff, flavor metrics, and internal clone-risk screening. Repair failures through their owning phase. When every P7 gate passes, checkpoint `70-candidate`; this freezes the exact `game-package` hash and ends P7 as `candidate-awaiting-p8`, not Stable.

## P8 independent validation

Do not change the frozen package during P8. Any change to it invalidates `60-build` onward and creates a new candidate cycle.

1. `80-independent-validation`: a reviewer independent from generation verifies canon, onboarding, interaction causality, routes, saves, accessibility, visual coherence, browser behavior, and packaging against the frozen hash.
2. `85-blind-originality`: a blind reviewer receives no Nintendo/Zelda target, Pack identity, title observations, pattern lineage, or flavor score. Separately pass blind attribution and clone-risk reports against the frozen hash.
3. `90-cold-user`: at least one participant starts without role or control briefing; capture comprehension, pacing, navigation, and recovery evidence.
4. `95-repro-rollback`: reproduce from a fresh environment and rehearse rollback without damaging older products, routes, or saves.
5. `99-release`: write the final acceptance report and commit Stable only after all earlier P8 evidence passes.

The run-state helper enforces phase order, the frozen candidate hash, independence/blinding attestations, and downstream invalidation. P1-P6 pattern-level diagnostics are useful but cannot satisfy the P8 whole-game blind gate.

## Core directing rules

- Establish player identity, immediate goal, controls, and local stakes through a safe first action.
- Use one core mechanic family and zero to three supports. Develop the core across scenes instead of building a museum of one-off props.
- Make at least one capability, knowledge, or state change radically reinterpret an earlier space or relationship.
- Feed map change, NPC response, performance, UI, audio, and camera from the same authoritative state transaction.
- Preserve recovery routes, bounded retry time, save consistency, optional hint ladders, cue replay, and non-color state feedback.
- Measure Zelda-derived flavor behavior separately from clone risk. Flavor can never cancel a clone veto.
- Never copy Nintendo characters, lore, maps, rooms, puzzle steps, boss scripts, item shapes, UI, dialogue, music, symbols, or recognizable staging.

## Completion language

P1-P6: say `Skill Beta`; no game completion claim. P7: say `playable candidate awaiting P8`; do not say released or Stable. P8: say `Stable` only when the run state is at `99-release`, `verify` passes, and the acceptance report names the owning phase for every repaired failure.
