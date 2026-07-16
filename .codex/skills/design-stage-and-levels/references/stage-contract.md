# Stage Plan Contract

Create `generated/40-world/stage-plan.json` with:

```json
{
  "$schema": "script-game-stage-plan/v1",
  "schemaVersion": "1.0.0",
  "status": "draft",
  "sourceHash": "",
  "maps": [],
  "zones": [],
  "portals": [],
  "anchors": [],
  "stateVariants": [],
  "interactionPlacements": [],
  "actorBlocking": [],
  "cameraLighting": [],
  "navigationChecks": [],
  "assetRequirements": [],
  "decisions": [],
  "unresolved": []
}
```

A state variant declares its base map, activating conditions, reversible flag, visual deltas, collision deltas, portal deltas, actor deltas, interaction deltas, and reversal state.

An asset requirement declares a stable `assetId`, kind, map or actor owner, state, layer, aspect ratio, transparency, focal safe area, and narrative purpose.
