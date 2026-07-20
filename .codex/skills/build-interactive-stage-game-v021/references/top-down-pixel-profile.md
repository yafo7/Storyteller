# Top-Down Pixel Product Profile

This profile overrides conflicting camera, staging, rendering, or asset defaults in the generic 0.2 references.

## Product identity

- Build an original top-down 2D pixel narrative adventure with the clarity of late-1990s and early-2000s handheld RPGs.
- Treat references to traditional monster-catching games as shorthand for scale, readability, grid logic, and interaction rhythm only.
- Do not reproduce recognizable characters, creatures, maps, tiles, palettes, logos, fonts, UI frames, terminology, music, or screen layouts from an existing franchise.

## Camera and logical resolution

- Use an orthographic top-down view with selective frontal faces on walls, furniture, doors, and characters.
- Default to a 320×180 logical viewport, a 16×16 logical tile, and integer scaling to the browser viewport.
- Keep the camera on integer logical pixels. Snap tiles and sprites to the logical pixel grid even when movement interpolates between tiles.
- Crop or letterbox at integer scale. Never stretch, smooth, or use fractional CSS transforms on pixel layers.

## Map contract extensions

Add `renderProfile` to the stage plan with `view`, `logicalResolution`, `tileSize`, `integerScale`, and `cameraSnap`.

Each map must add:

```json
{
  "tileGrid": { "tileSize": 16, "width": 40, "height": 30 },
  "tileLayers": ["ground", "terrain", "structure", "props", "overhead", "lighting"],
  "logicLayers": ["collision", "portals", "triggers", "interaction", "spawns", "npc-routes"]
}
```

- Store collisions, triggers, portals, spawns, and routes as data, never baked into background art.
- Mark overhead tiles with occlusion behavior so the player can walk behind roofs, trees, arches, and tall props without losing location context.
- Give every portal a destination map, spawn tile, arrival facing, condition, transition, and safe return path.
- Encode state variants as tile and logic-layer deltas. Avoid duplicating a whole map unless its topology truly changes beyond practical delta representation.
- Verify every walkable region, one-tile corridor, doorway, stair, and spawn against the player collision footprint.

## Player, NPC, and cutscene grammar

- Default player footprint: one tile wide, with feet anchoring collision and the upper body allowed to overlap overhead art.
- Provide four facings: down, left, right, up. Provide idle and walk states; use at least two walk frames per facing.
- Mirror left/right only when costume, carried props, and lighting remain correct. Otherwise author both directions.
- Interact with the facing tile or a declared short interaction cone. Highlight the target with a palette-safe outline, cursor, or tile marker.
- Define NPC schedules and cutscene blocking as tile routes with facing, wait, emote, dialogue, and fallback steps.
- Pause or constrain player control during blocking movement, then restore it deterministically. Every cutscene route needs a timeout or snap fallback.

## Pixel art bible requirements

Add `pixelRules` to the art bible with:

- native tile size and native sprite canvas;
- per-map and global palette budgets;
- outline, cluster, dithering, highlight, and shadow rules;
- transparency and alpha-edge rules;
- nearest-neighbor and integer-scale rules;
- environment perspective and frontal-face conventions;
- portrait-to-sprite identity rules;
- forbidden smoothing, gradients, vector-like curves, noisy single pixels, mixed resolutions, and inconsistent pixel density.

Recommended defaults:

- 16–32 colors per map state, plus reserved UI and effect colors;
- 16×16 environment tiles;
- 24×32 or 32×48 primary and speaking actor frames; permit 16×24 only for minor non-speaking actors with recorded native-scale evidence;
- 32×32 hero props or effects when required;
- 64×64 or 96×96 optional dialogue portraits, still pixel-authored and palette-related;
- 9-slice pixel UI panels and a readable CJK bitmap or pixel-compatible font with license evidence.

## Asset production order

1. Produce one style frame and palette test.
2. Produce one tile-density test containing ground, wall, door, prop, tree or occluder, and interaction marker.
3. Produce character identity sheets, then one four-direction sprite proof at native size.
4. Lock tileset conventions and build base maps.
5. Build collision, portal, trigger, and occlusion overlays.
6. Produce map-state delta tiles, NPC sprite sheets, props, portraits, UI, and effects.
7. Validate seams, transparency, palette, identity, native-size readability, and integer-scaled screenshots.

The four-direction proof must be a direct visual derivative of an individual AI-original identity or turnaround when the charter requires AI character production. Do not satisfy that requirement with an AI concept board plus an unrelated procedural sprite.

Produce critical interactive objects independently from scene plates. Reserve their placement sockets during environment composition, preserve alpha in their source states, composite them persistently in the runtime, and add outline or motion focus without relying on color alone.

AI generation may establish mood, palette, identities, portraits, or a style frame. Do not accept an AI-generated raster as a production tileset or sprite sheet until it has exact tile boundaries, seamless edges, correct frame counts, transparent backgrounds, stable identities, limited palette, and intentional pixel clusters. Rebuild failed assets with pixel-native tooling or code rather than hiding defects with filtering.

## Runtime profile

The compiled production must add `rendererProfile` containing:

```json
{
  "mode": "top-down-tilemap",
  "logicalResolution": [320, 180],
  "tileSize": 16,
  "movement": "four-direction",
  "sampling": "nearest-neighbor",
  "cameraSnap": "integer-pixel"
}
```

Require runtime support for tile layers, animated tiles, sprite sheets, facing interaction, collision, portals, triggers, overhead occlusion, NPC tile routes, state deltas, dialogue, inventory, save/resume, and deterministic cutscene fallbacks.

## Acceptance evidence

- Show each map at native 1× size and at a supported integer scale.
- Show collision, portals, triggers, spawns, and NPC routes as debug overlays.
- Test a complete route with keyboard only and another with pointer or touch equivalents.
- Check wrong-way interaction, blocked portals, map return paths, save/resume across a portal, and state-changing map reload.
- Reject blurred pixels, seam gaps, sprite-foot sliding, occlusion errors, unreadable doorways, ambiguous interactables, collision leaks, mixed pixel density, palette drift, and accidental franchise resemblance.
