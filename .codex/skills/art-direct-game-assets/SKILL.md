---
name: art-direct-game-assets
description: Art-direct, source, generate, register, and visually validate a coherent asset set for a 2D narrative game. Use when Codex must create an art bible, character identity sheets, portraits, sprites, backgrounds, map-state variants, props, UI art, and asset provenance; decide between AI generation and licensed external assets; use image generation iteratively; or repair missing and inconsistent game visuals.
---

# Art-Direct Game Assets

Treat visual production as a dependency graph. Establish identity and style anchors before generating scene assets.

## Direct the visual language

1. Read the production charter, story model, gameplay design, performance plan, stage plan, [asset-policy.md](references/asset-policy.md), and [art-contract.md](references/art-contract.md).
2. Create `generated/50-art/art-bible.json` defining style, palette, line and shape language, camera, composition, lighting, UI, motion, accessibility, and prohibited drift.
3. Build `asset-manifest.json` from `assets/asset-manifest.template.json` and every stage asset requirement.
4. Generate character identity sheets before portraits or sprites. Lock silhouette, face, hair, costume, proportions, palette, and distinctive props.
5. Use the `imagegen` skill for story-specific characters, backgrounds, state variants, hero props, and UI illustrations. Use prior approved images as references and edit iteratively instead of prompting every asset from scratch.
6. Search externally only for generic fonts, icons, textures, and sound when generation is wasteful. Accept only explicit, compatible licenses and record source, author, license, attribution, modifications, and retrieval date.
7. Produce base backgrounds and required state variants with composition alignment. Keep collision, navigation, hotspots, and light masks as separate game data or layers.
8. Inspect generated assets and representative in-game screenshots. Reject identity drift, wrong staging, missing state variants, illegible silhouettes, poor crops, inconsistent perspective, text baked into art, or ambiguous interactive targets.

## Enforce asset readiness

- Never use ordinary image-search results without a reusable license.
- Prefer AI-original assets for narrative-specific content and CC0 or compatible licensed assets for generic content.
- Do not imitate a living artist or reproduce an actor's likeness unless the production has the required authority.
- Give every asset a stable ID, owner, state, dimensions, transparency rule, provenance, and approval status.
- A placeholder may support early compilation, but cannot pass final acceptance when the charter forbids placeholders.

Set both manifests to `approved` only when every required asset is approved or covered by an explicit, permitted placeholder waiver.
