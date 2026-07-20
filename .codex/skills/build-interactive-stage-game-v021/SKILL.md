---
name: build-interactive-stage-game-v021
description: Orchestrate autonomous production of a complete, playable top-down 2D pixel-art narrative game from a screenplay, transcript, subtitle file, stage play, prose scene, or story outline. Use when Codex must run or regenerate the 0.21 script-to-game workflow with enacted source-event continuity, scene-to-logic coordinate registration, independently generated and composited interactables, AI-derived production characters, a locked visual style, classic handheld-era RPG readability, deterministic compilation, route simulation, and browser QA.
---

# Build a Top-Down Pixel Narrative Game — 0.21

Act as the production director. Preserve `$build-interactive-stage-game` as 0.2 and `$build-interactive-stage-game-v01` as 0.1. Treat the top-down pixel format as a locked product profile, not a late art reskin.

## Establish the pixel production

1. Read [product-constitution.md](references/product-constitution.md), [workflow-contract.md](references/workflow-contract.md), [top-down-pixel-profile.md](references/top-down-pixel-profile.md), [narrative-enactment-gates.md](references/narrative-enactment-gates.md), [scene-integration-gates.md](references/scene-integration-gates.md), and [art-production-gates.md](references/art-production-gates.md).
2. Inspect every narrative source with `scripts/inspect-source.mjs`.
3. Create `generated/00-brief/production-charter.json` from `assets/production-charter.template.json`.
4. Keep `visualProfile`, `cameraProfile`, `gridProfile`, and `originalityPolicy` locked unless the user explicitly requests another product class.
5. Choose story mechanics, maps, pacing, and assets autonomously. Ask only about blocking rights, canon, safety, or scope issues.

## Run the specialist workflow

Run the phases in order and preserve artifact ownership.

1. Use `$analyze-story-for-game` to create `generated/10-story/story-model.json`.
2. Use `$design-narrative-gameplay` to create `generated/20-design/gameplay-design.json`. Prefer verbs that become spatial tile actions, map changes, NPC schedules, inventory transactions, or layer changes.
3. Use `$direct-interactive-drama` to create `generated/30-performance/performance-plan.json` and `generated/30-performance/source-event-ledger.json`. Preserve the causal order of included source events and enact setup, signal, response, physical action, social orientation, consequence, and transition as applicable. Never replace a witnessed arrival, discovery, confrontation, or transformation with NPC summary or riddle dialogue.
4. Use `$design-stage-and-levels` to create `generated/40-world/stage-plan.json` and `generated/40-world/scene-integration.json`. Add the tile-map extensions required by the pixel profile, then register visible doors, furniture, occluders, interactables, portals, actor anchors, and collision against one logical coordinate space with measured alignment evidence.
5. Use `$art-direct-game-assets` to freeze a style contract, enumerate complete asset coverage, and create `generated/50-art/runtime-asset-bindings.json`. Separately generate identity sheets, production turnarounds, portraits, four-direction sprites, clean background plates, interactive-prop states, UI, and compiled atlases. Speaking and moving characters must retain direct visual lineage from AI-generated character sources into the runtime sprite; an AI mood board followed by an unrelated procedural actor fails. Critical interactables must come from generation jobs separate from environment plates and remain visibly composited in the world before targeting.
6. Use `$compile-script-game` to create `generated/60-build/production.json` and a deterministic tile-map runtime. Do not ship the side-view 0.2 renderer under pixel styling.
7. Use `$evaluate-script-game` to simulate required routes, inspect collision overlays and representative browser states, and create `reports/acceptance-report.json`.
8. Route every failed gate back to its owning phase, rebuild downstream artifacts, and re-evaluate.

## Enforce 0.21 spatial and visual gates

- Use an orthographic top-down tile map with readable frontal building and prop faces; do not use side-view stage blocking.
- Default to a 16 px logical tile and integer browser scaling. Permit 8, 24, or 32 px tiles only when the charter records why.
- Declare ground, structure, overhead, prop, collision, portal, trigger, and lighting/world-state layers separately.
- Give the player and moving NPCs four facing directions, readable silhouettes, and at least idle plus walk animation states.
- Make interaction target the facing tile or a clearly highlighted adjacent tile. Never rely on tiny free-position hotspots.
- Render critical interactables as persistent world objects with transparent separation, a registered placement, and a palette-safe outline, silhouette pulse, icon, or motion cue. Do not reveal the asset only in a hover or proximity preview.
- Keep critical props, doors, NPCs, and exits readable at native 1× resolution and under the limited palette.
- Express world transformation through tile, collision, portal, NPC-route, lighting, or map-layer deltas in addition to text.
- Use nearest-neighbor rendering, integer camera positions, pixel snapping, and `image-rendering: pixelated`; reject blur and subpixel shimmer.
- Use AI images as style or identity anchors unless they pass exact sprite, tile, transparency, seam, palette, and pixel-grid checks.
- Treat a style frame as an upstream dependency, never as completion evidence. Generate each required character, scene, and interactive prop as a separately addressable source asset before atlas compilation.
- For every primary or speaking actor, require an AI-original identity or turnaround source, an approved pixel conversion that remains a direct visual derivative, a minimum 24×32 production frame unless the charter records a readability exception, and an in-engine identity comparison.
- Generate background plates without baking critical interactables into the only available image. Reserve documented interaction sockets and composite separately generated prop states at runtime.
- Register scene art and game logic in the same logical-pixel coordinate system. Block compilation when a visible wall, door, large furniture footprint, portal, or interaction anchor lacks a measured matching logic feature.
- Never approve geometric or procedural placeholder art as final production art. Procedural pixel-native output is permitted only when it meets the locked detail-density, identity, state-contrast, and in-engine comparison gates.
- Require `style-contract.json`, `asset-coverage.json`, and `visual-validation.json`; block Build when any required owner, state variant, reference chain, or in-engine comparison is missing.
- Create original characters, maps, tiles, UI, and naming. Borrow only broad handheld-era visual grammar; never reproduce franchise characters, creatures, maps, tiles, badges, logos, fonts, or interface layouts.

## Validate the build

Run after every downstream phase:

```bash
node <skill-root>/scripts/validate-workflow.mjs <project-root>
node <skill-root>/scripts/validate-pixel-profile.mjs <project-root>
node <skill-root>/scripts/validate-art-production.mjs <project-root>
node <skill-root>/scripts/validate-narrative-integration.mjs <project-root> --strict
```

Before completion, also require:

- `node <skill-root>/scripts/validate-pixel-profile.mjs <project-root> --strict` with zero failures;
- `node <skill-root>/scripts/validate-art-production.mjs <project-root> --strict` with zero failures;
- `node <skill-root>/scripts/validate-narrative-integration.mjs <project-root> --strict` with zero failures;
- capability negotiation for tile maps, four-direction movement, collision, triggers, save state, dialogue, inventory, and world-state deltas;
- a collision-overlay screenshot for every map and state that changes topology;
- native-resolution and integer-scaled screenshots with no smoothing;
- route simulation that visits every required map and reaches every required ending;
- keyboard and pointer/touch equivalents, visible focus, captions, and a non-audio clue path;
- approved provenance for every tileset, sprite, portrait, prop, effect, font, and UI asset.

Do not claim completion while a non-waived canon, topology, pixel-integrity, originality, reachability, or packaging gate fails.
