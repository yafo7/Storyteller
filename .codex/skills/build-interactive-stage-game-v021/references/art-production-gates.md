# 0.21 Art Production Gates

Treat art as a production dependency graph, not as a mood-board task. A style frame starts production; it never completes production.

## Freeze one visual language

Create `generated/50-art/style-contract.json` before producing final assets. Lock:

- perspective and camera grammar;
- native tile, sprite, portrait, and hero-prop dimensions;
- global and per-state palette budgets;
- pixel cluster, outline, highlight, shadow, dithering, transparency, and density rules;
- character proportions and identity invariants;
- environment material, furnishing-density, landmark, lighting, and state-contrast rules;
- UI framing and interaction-marker language;
- prohibited drift and explicit placeholder policy.

The contract references at least one approved style-frame asset. Later assets cite the contract and their direct approved reference assets.

## Enumerate coverage before generation

Create `generated/50-art/asset-coverage.json` from Story, World, Performance, and Gameplay. Include one requirement for every:

- named playable or speaking character;
- required portrait and four-direction moving actor;
- map base scene and story-required map-state variant;
- critical interactive prop and every readable before/available/after state;
- UI state, effect, and icon needed for non-color feedback.

Each requirement declares an owner ID, required kinds and states, produced asset IDs, and `status`. Build is blocked while any required entry is not `approved`.

## Produce separately, compile last

Generate in this dependency order:

1. style frame and palette test;
2. character identity sheets;
3. environment keyframes and base scenes;
4. aligned scene-state variants;
5. portraits and four-direction sprite sources;
6. interactive props with before, available, active, and after states as required;
7. UI and effects;
8. compiled atlases.

Store each source asset at a stable individual path. An atlas is a build artifact and cannot be the only source for a character, scene, or critical prop.

AI-generated raster art may be used directly for a base scene or portrait only after crop, perspective, identity, palette, pixel-density, and in-engine readability checks. Keep collision, portals, triggers, routes, and light masks as data even when a scene image is used as the ground layer.

## Enforce manifest lineage

Every non-reference asset in `asset-manifest.json` declares:

- `ownerId`, `state`, `path`, `dimensions`, and `productionUse: true`;
- `generationMethod`, provenance, rights, and approval status;
- nonempty `referenceAssetIds` resolving to approved assets;
- nonempty `qaEvidence` resolving to contact sheets or in-engine screenshots.

Reject final assets whose method or state contains `placeholder`, whose source file is missing, or whose only evidence is a schema validator. Do not waive a story-required character, map, map state, interactive prop, or UI state.

## Validate visually in engine

Create `generated/50-art/visual-validation.json` and contact sheets that compare:

```text
approved style or identity anchor -> separate production sources -> compiled runtime asset -> in-engine screenshot
```

For every map and primary character, record explicit results for perspective, palette, identity or material language, detail density, interaction readability, state contrast, pixel integrity, and native-scale readability. All must pass.

Reject and regenerate when production art is materially flatter, emptier, more generic, or less identifiable than its approved anchor. A technically valid but visibly placeholder-like screenshot fails Art and returns to asset production.
