# Art Production Contract

Create `generated/50-art/art-bible.json` with:

```json
{
  "$schema": "script-game-art-bible/v1",
  "schemaVersion": "1.0.0",
  "status": "draft",
  "sourceHash": "",
  "style": {},
  "palette": {},
  "characterRules": {},
  "environmentRules": {},
  "compositionRules": {},
  "lightingRules": {},
  "uiRules": {},
  "motionRules": {},
  "accessibilityRules": {},
  "prohibitedDrift": [],
  "decisions": [],
  "unresolved": []
}
```

Create `generated/50-art/asset-manifest.json`. Each asset declares `id`, `kind`, `ownerId`, `state`, `path`, `dimensions`, `alpha`, `generationMethod`, `referenceAssetIds`, `promptOrBrief`, `source`, `author`, `license`, `attribution`, `status`, and `qaEvidence`.

Character assets must point to an approved identity sheet. Map-state variants must point to the same base composition and declare their changed layers.
