---
name: build-interactive-stage-game-v01
description: Preserve the 0.1 workflow that compiles a screenplay, transcript, subtitle file, prose scene, or story outline into a playable, data-driven interactive stage game. Use when Codex must reproduce or maintain the original 0.1 canon-first stage compiler, deterministic beat/cue package, placeholder visual kit, route simulation, and bundled Canvas runtime without the 0.2 specialist workflow.
---

# Build an Interactive Stage Game — 0.1

Treat the source as evidence, the production JSON as compiled content, and the game runtime as a reusable interpreter. Keep core progression deterministic and playable without a model or network connection.

## Execute the workflow

1. Establish the input contract.
   - Read [source-contract.md](references/source-contract.md).
   - Run `node <skill-root>/scripts/inspect-source.mjs <source-path>` before interpreting an unfamiliar source.
   - Preserve line-addressable source references and mark uncertain attribution explicitly.
2. Choose and record an adaptation contract.
   - Read [adaptation-modes.md](references/adaptation-modes.md).
   - Default to `faithful-stage` when the user has not authorized structural invention.
   - Separate canon, character belief, and player knowledge. Never silently turn uncertainty into fact.
3. Build the story model before staging scenes.
   - Read [story-ir-schema.md](references/story-ir-schema.md) and [dramaturgy-rules.md](references/dramaturgy-rules.md).
   - Extract facts, sources, characters, beliefs, reveals, evidence, chronology, and causal dependencies.
   - Lock immutable facts and reveal gates before writing dialogue.
4. Audit or create the runtime boundary.
   - Reuse an existing compatible runtime when present.
   - When no host project exists, copy the contents of `assets/runtime-template/web-starter/` into the new project.
   - Keep both canonical IR and the flat Canvas runtime package in `data/production.json`.
   - Start the copied starter with `node server.mjs <port>`; omit `<port>` to use 5175.
   - Keep movement, collision, state transitions, saves, cue completion, and fallbacks deterministic.
   - Use `assets/placeholder-stage-kit/manifest.json` for temporary visuals.
5. Author the playable production.
   - Read [cue-dsl.md](references/cue-dsl.md) and [ui-interaction-spec.md](references/ui-interaction-spec.md).
   - Give every blocking cue a timeout or fallback and every required fact a reachable acquisition route.
6. Validate before running the game.
   - Run `node <skill-root>/scripts/validate-production.mjs <production.json> --strict`.
   - Run `node <skill-root>/scripts/simulate-playthrough.mjs <production.json> --strict`.
7. Run and inspect the game.
   - Exercise title, loading, performance, exploration, interaction, transition, ending, pause, save/resume, and recovery states.
   - Inspect representative screenshots and apply [acceptance-rubric.md](references/acceptance-rubric.md).
8. Package only after acceptance with `scripts/pack-content.mjs`.

## Stop rather than fabricate

Stop when a canon-critical claim is unresolved, an adaptation exceeds the selected mode, a required mechanic cannot be expressed, a required asset has unknown rights, validation fails, or core progression depends on live AI.

Do not claim completion while a stop condition remains.
