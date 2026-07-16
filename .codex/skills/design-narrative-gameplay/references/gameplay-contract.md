# Gameplay Design Contract

Create `generated/20-design/gameplay-design.json` with:

```json
{
  "$schema": "script-game-gameplay-design/v1",
  "schemaVersion": "1.0.0",
  "status": "draft",
  "sourceHash": "",
  "experienceGoals": [],
  "candidateMechanics": [],
  "coreLoop": {},
  "mechanics": [],
  "verbGrammar": [],
  "worldState": {"dimensions": [], "invariants": []},
  "inventoryRules": [],
  "interactionTransactions": [],
  "onboardingRequirements": [],
  "runtimeRequirements": [],
  "decisions": [],
  "unresolved": []
}
```

A mechanic declares `id`, `storyBasis`, `playerFantasy`, `verbs`, `stateDimensions`, `teachingSequence`, `escalations`, and `failureRecovery`.

An interaction transaction declares:

```json
{
  "id": "interaction.example",
  "mechanicId": "mechanic.example",
  "preconditions": [],
  "affordance": "",
  "performance": [],
  "effects": [],
  "feedback": [],
  "consequenceChannels": [],
  "reversible": true,
  "reversalEffects": [],
  "recovery": "",
  "storyRefs": []
}
```

Set `status` to `approved` only when the core mechanic passes all hard scores, all required interactions have at least two consequence channels, and state invariants exclude deadlocks.
