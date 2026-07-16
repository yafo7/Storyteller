---
name: build-interactive-stage-game
description: Orchestrate the autonomous production of a complete, playable 2D narrative stage game from a screenplay, transcript, subtitle file, prose scene, or story outline. Use when Codex must coordinate canon analysis, gameplay design, interactive drama, stage and level design, art production, compilation, route simulation, browser QA, and packaging through specialist skills and typed handoff artifacts.
---

# Build an Interactive Stage Game — 0.2

This is the 0.2 production-director workflow. Preserve the original monolithic workflow under `$build-interactive-stage-game-v01`; never overwrite that archive when extending this workflow.

Act as the production director. Coordinate specialist skills through files; do not improvise every discipline inside one pass. Keep core progression deterministic and playable without a model or network connection.

## Establish the production

1. Read [product-constitution.md](references/product-constitution.md) and [workflow-contract.md](references/workflow-contract.md).
2. Inspect each narrative source with `scripts/inspect-source.mjs`.
3. Create `generated/00-brief/production-charter.json` from `assets/production-charter.template.json`.
4. Apply defaults without asking the user about per-game creative choices. Ask only when rights, a canon-critical ambiguity, content limits, or a material scope expansion cannot be resolved safely.
5. Keep user locks in `overrides/`; never overwrite them during regeneration.

## Run the studio workflow

Run these phases in order. A phase may revise its own output, but may not silently rewrite an upstream artifact.

1. Use `$analyze-story-for-game` to create `generated/10-story/story-model.json`.
2. Use `$design-narrative-gameplay` to create `generated/20-design/gameplay-design.json`.
3. Use `$direct-interactive-drama` to create `generated/30-performance/performance-plan.json`.
4. Use `$design-stage-and-levels` to create `generated/40-world/stage-plan.json`.
5. Use `$art-direct-game-assets` to create `generated/50-art/art-bible.json`, `asset-manifest.json`, and the required visual assets.
6. Use `$compile-script-game` to produce `generated/60-build/production.json` and the playable runtime.
7. Use `$evaluate-script-game` to create `reports/acceptance-report.json` and supporting evidence.
8. Route every failed gate back to its owning phase, rebuild downstream artifacts, and evaluate again.

## Enforce stage gates

Run `node <skill-root>/scripts/validate-workflow.mjs <project-root>` after every phase. Do not begin compilation until story, gameplay, performance, world, and art manifests pass structural validation.

Require these creative gates:

- The player role, immediate objective, initial belief, and knowledge limits are explicit.
- Every required scene states its dramatic intention, player question, action, turn, consequence, intensity, and exit gate.
- The production has one story-derived core mechanic and no required interaction that only reveals text without another perceptible consequence.
- At least one mechanic changes access, topology, actor behavior, danger, or world layer.
- Maps declare state variants, navigation changes, and recovery paths.
- Required characters, stages, props, UI, and state variants have approved assets or intentional placeholders.
- Automated simulation reaches every required ending without deadlocks.
- Representative browser screenshots pass visual, text, focus, and accessibility review.

## Preserve the existing runtime discipline

- Read [story-ir-schema.md](references/story-ir-schema.md), [cue-dsl.md](references/cue-dsl.md), and [ui-interaction-spec.md](references/ui-interaction-spec.md) when compiling content.
- Reuse `assets/runtime-template/web-starter/` when no compatible host runtime exists.
- Run `scripts/validate-production.mjs --strict` and `scripts/simulate-playthrough.mjs --strict` before browser QA.
- Keep durable effects idempotent and give every blocking cue a timeout or deterministic fallback.
- Record all source, adaptation, asset, license, validation, simulation, and evaluation evidence.

## Stop rather than fabricate

Stop only when a canon-critical claim remains unresolved, the adaptation exceeds authorized bounds, a required asset has incompatible rights, or the runtime cannot express a required mechanic without a material product change. Report the exact artifact and gate that is blocked.

Do not claim completion while any non-waived acceptance gate fails.
