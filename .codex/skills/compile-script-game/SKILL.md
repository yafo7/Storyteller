---
name: compile-script-game
description: Compile approved story, gameplay, performance, stage, and art artifacts into a deterministic playable 2D narrative game. Use when Codex must negotiate runtime capabilities, map typed handoffs into a production IR, implement stateful interactions and map changes, integrate assets, preserve save and reveal semantics, extend a reusable runtime, serve the game locally, or diagnose compilation gaps without redesigning upstream content.
---

# Compile a Script Game

Treat upstream artifacts as approved specifications. Implement them faithfully or return a precise capability gap.

## Compile

1. Read all approved phase artifacts and [compile-contract.md](references/compile-contract.md).
2. Inventory the host runtime using `assets/runtime-capabilities.template.json` as the capability record.
3. Run `node scripts/check-runtime-capabilities.mjs <gameplay-design.json> <runtime-capabilities.json>`.
4. Resolve each requirement by existing primitive, adapter, reusable runtime extension, or a documented blocked gap. Do not silently weaken a mechanic.
5. Compile stable IDs into one authoritative production IR and any runtime-specific cache.
6. Implement interaction transactions atomically: check preconditions, perform presentation, commit durable effects, provide feedback, and apply reversal or recovery correctly.
7. Integrate maps, state variants, collision, portals, actors, assets, cues, UI, journal, controls, accessibility, saves, pause, and error recovery.
8. Verify static assets and data load successfully, start the requested local server, and create `generated/60-build/build-report.json`.

## Preserve runtime guarantees

- Keep story facts, prose, art paths, and stage data outside story-agnostic runtime code.
- Persist inventory, facts, flags, entity states, world layer, portals, actor schedules, player position, beat, and completed irreversible effects.
- Reapply state idempotently after save restore.
- Keep reversible world state separate from irreversible discoveries.
- Give blocking movement, animation, audio, and camera operations deterministic fallbacks.
- Do not put secrets or required live-model calls in client code.
- Reject absolute asset paths and unapproved manifest entries.

Compilation is complete only when every approved upstream requirement is represented or explicitly blocked. Do not self-waive a missing core mechanic.
