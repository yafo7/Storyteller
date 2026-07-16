# Acceptance Report Contract

Create `reports/acceptance-report.json` with:

```json
{
  "$schema": "script-game-acceptance-report/v1",
  "schemaVersion": "1.0.0",
  "status": "fail",
  "buildHash": "",
  "gates": [],
  "routeCoverage": {},
  "visualEvidence": [],
  "pacingEvidence": [],
  "accessibilityEvidence": [],
  "failuresByOwner": {},
  "waivers": [],
  "unresolved": []
}
```

Each gate records `id`, `category`, `status`, `requirement`, `evidence`, `ownerSkill`, and `repairInstruction`. A waiver records owner, reason, scope, expiry or review condition, and player-visible impact.
