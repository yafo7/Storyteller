# Performance Plan Contract

Create `generated/30-performance/performance-plan.json` with:

```json
{
  "$schema": "script-game-performance-plan/v1",
  "schemaVersion": "1.0.0",
  "status": "draft",
  "sourceHash": "",
  "playerKnowledgeAtStart": {},
  "onboarding": {"steps": [], "completionEvidence": []},
  "intensityCurve": [],
  "scenes": [],
  "beats": [],
  "dialogueIntents": [],
  "accessibilityNotes": [],
  "decisions": [],
  "unresolved": []
}
```

Every beat declares `id`, `sceneId`, `mode`, `intention`, `playerQuestion`, `objective`, `obstacle`, `actorTactics`, `requiredActions`, `reveals`, `turn`, `consequence`, `intensity`, `breath`, `exitGate`, and `estimatedSeconds`.

An exit gate describes player-visible completion evidence. A fixed timeout can end presentation, but cannot substitute for a required action or fact.
