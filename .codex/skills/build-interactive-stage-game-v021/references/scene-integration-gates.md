# 0.21 Scene Integration Gates

Treat background art, game logic, actors, and interactables as registered layers in one coordinate system.

## Register the scene plate

Create `generated/40-world/scene-integration.json`. For every map, declare the source image size, runtime logical size, fit or crop transform, tile size, camera bounds, and interaction-safe sockets reserved in the background plate.

Register every visible wall, door, stair, large furniture footprint, occluder, portal, actor anchor, and critical interaction with:

- stable feature and asset IDs;
- logical-pixel `visualBounds`;
- corresponding `logicBounds` or interaction point;
- maximum permitted edge or anchor error;
- measured error and an overlay screenshot;
- state variants whose geometry changes.

Do not infer collision after the final image is accepted. Design the plate and the logic from the same semantic layout, then verify the compiled transform.

## Composite interactables separately

Create `generated/50-art/runtime-asset-bindings.json`.

For each critical interactable:

- generate isolated before, available, active, and after states as needed;
- use a generation job distinct from every environment plate job;
- preserve transparency and a stable ground or wall anchor;
- bind the asset to a documented scene socket and logical draw bounds;
- render it persistently in the world, not only after hover, targeting, or proximity;
- add a non-color-only focus treatment such as outline, silhouette pulse, motion, icon, or shape change;
- update its visible state whenever its interaction state changes.

The background may contain generic decoration, but it must not be the only source of a critical interactive object.

## Bind AI characters into production

For every primary, speaking, or moving character:

- create an individual AI-original identity or turnaround asset;
- derive portraits and production sprites directly from that approved source;
- record `aiSourceAssetIds`, generation job IDs, conversion method, atlas/frame binding, and in-engine screenshot;
- preserve silhouette, face or hair masses, costume blocks, palette, proportions, and distinctive props through pixel conversion;
- use at least a 24×32 frame for primary or speaking actors unless the charter records an evidence-backed readability exception.

An AI concept sheet followed by an unrelated procedural stick figure or generic template sprite is not AI-derived production art and fails the gate.

## Block approval

Reject when measured alignment exceeds tolerance, a visible blocking feature has no logic registration, a critical prop is baked into the background only, an interactable appears only in a preview card, scene and prop share one generation job, or a runtime character lacks direct AI visual lineage and in-engine identity evidence.

