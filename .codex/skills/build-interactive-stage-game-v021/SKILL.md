---
name: build-interactive-stage-game-v021
description: Orchestrate autonomous production of a complete, playable top-down 2D pixel-art narrative game from a screenplay, transcript, subtitle file, stage play, prose scene, or story outline. Use when Codex must run the 0.21 script-to-game workflow with classic handheld-era RPG readability, tile maps, four-direction sprites, grid-aware collision, stateful world changes, original pixel assets, deterministic compilation, route simulation, browser QA, and typed specialist handoffs.
---

# Build a Top-Down Pixel Narrative Game — 0.21

Act as the production director. Preserve `$build-interactive-stage-game` as 0.2 and `$build-interactive-stage-game-v01` as 0.1. Treat the top-down pixel format as a locked product profile, not a late art reskin.

## Establish the pixel production

1. Read [product-constitution.md](references/product-constitution.md), [workflow-contract.md](references/workflow-contract.md), and [top-down-pixel-profile.md](references/top-down-pixel-profile.md).
2. Inspect every narrative source with `scripts/inspect-source.mjs`.
3. Create `generated/00-brief/production-charter.json` from `assets/production-charter.template.json`.
4. Keep `visualProfile`, `cameraProfile`, `gridProfile`, and `originalityPolicy` locked unless the user explicitly requests another product class.
5. Choose story mechanics, maps, pacing, and assets autonomously. Ask only about blocking rights, canon, safety, or scope issues.

## Run the specialist workflow

Run the phases in order and preserve artifact ownership.

1. Use `$analyze-story-for-game` to create `generated/10-story/story-model.json`.
2. Use `$design-narrative-gameplay` to create `generated/20-design/gameplay-design.json`. Prefer verbs that become spatial tile actions, map changes, NPC schedules, inventory transactions, or layer changes.
3. Use `$direct-interactive-drama` to create `generated/30-performance/performance-plan.json`. Alternate free movement with short, player-paced tile cutscenes.
4. Use `$design-stage-and-levels` to create `generated/40-world/stage-plan.json`. Add the tile-map extensions required by the pixel profile: grid, layer stack, collision, portals, triggers, spawns, actor routes, occlusion, and state deltas.
5. Use `$art-direct-game-assets` to create the art bible, manifest, tilesets, four-direction sprites, props, portraits when needed, UI, and map variants. Follow the originality boundary in the pixel profile.
6. Use `$compile-script-game` to create `generated/60-build/production.json` and a deterministic tile-map runtime. Do not ship the side-view 0.2 renderer under pixel styling.
7. Use `$evaluate-script-game` to simulate required routes, inspect collision overlays and representative browser states, and create `reports/acceptance-report.json`.
8. Route every failed gate back to its owning phase, rebuild downstream artifacts, and re-evaluate.

## Enforce 0.21 spatial and visual gates

- Use an orthographic top-down tile map with readable frontal building and prop faces; do not use side-view stage blocking.
- Default to a 16 px logical tile and integer browser scaling. Permit 8, 24, or 32 px tiles only when the charter records why.
- Declare ground, structure, overhead, prop, collision, portal, trigger, and lighting/world-state layers separately.
- Give the player and moving NPCs four facing directions, readable silhouettes, and at least idle plus walk animation states.
- Make interaction target the facing tile or a clearly highlighted adjacent tile. Never rely on tiny free-position hotspots.
- Keep critical props, doors, NPCs, and exits readable at native 1× resolution and under the limited palette.
- Express world transformation through tile, collision, portal, NPC-route, lighting, or map-layer deltas in addition to text.
- Use nearest-neighbor rendering, integer camera positions, pixel snapping, and `image-rendering: pixelated`; reject blur and subpixel shimmer.
- Use AI images as style or identity anchors unless they pass exact sprite, tile, transparency, seam, palette, and pixel-grid checks.
- Create original characters, maps, tiles, UI, and naming. Borrow only broad handheld-era visual grammar; never reproduce franchise characters, creatures, maps, tiles, badges, logos, fonts, or interface layouts.

## Validate the build

Run after every downstream phase:

```bash
node <skill-root>/scripts/validate-workflow.mjs <project-root>
node <skill-root>/scripts/validate-pixel-profile.mjs <project-root>
```

Before completion, also require:

- `node <skill-root>/scripts/validate-pixel-profile.mjs <project-root> --strict` with zero failures;
- capability negotiation for tile maps, four-direction movement, collision, triggers, save state, dialogue, inventory, and world-state deltas;
- a collision-overlay screenshot for every map and state that changes topology;
- native-resolution and integer-scaled screenshots with no smoothing;
- route simulation that visits every required map and reaches every required ending;
- keyboard and pointer/touch equivalents, visible focus, captions, and a non-audio clue path;
- approved provenance for every tileset, sprite, portrait, prop, effect, font, and UI asset.

Do not claim completion while a non-waived canon, topology, pixel-integrity, originality, reachability, or packaging gate fails.
