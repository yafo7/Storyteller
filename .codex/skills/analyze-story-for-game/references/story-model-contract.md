# Story Model Contract

Create `generated/10-story/story-model.json` with this semantic shape:

```json
{
  "$schema": "script-game-story-model/v1",
  "schemaVersion": "1.0.0",
  "status": "draft",
  "sourceHash": "",
  "dramaticPromise": "",
  "dramaticSpine": [],
  "playerRole": {
    "characterId": "character.example",
    "immediateNeed": "",
    "initialBeliefs": [],
    "knowledgeLimits": [],
    "availableVerbs": [],
    "selectionReason": ""
  },
  "facts": [],
  "characters": [],
  "relationships": [],
  "reveals": [],
  "motifs": [],
  "locations": [],
  "rules": [],
  "interactionOpportunities": [],
  "adaptationLimits": [],
  "decisions": [],
  "unresolved": []
}
```

## Required records

- A fact records `id`, `text`, `immutable`, `sourceRefs`, and `confidence`.
- A character records `id`, `name`, `objectives`, `obstacles`, `tactics`, `knowledge`, and `beliefs`.
- A reveal records `id`, `factIds`, `prerequisites`, `earliestBeatHint`, `witnesses`, and `dramaticFunction`.
- A motif records `id`, `label`, `occurrences`, `emotionalMeaning`, and candidate `affordances`; affordances are observations, not selected mechanics.
- A location records `id`, `label`, `sourceRefs`, `dramaticFunctions`, `knownConnections`, and `possibleStates`.
- An interaction opportunity records the source action or object, player question, possible state change, and affected canon IDs.

Source references must be line-addressable. Confidence does not grant permission to invent.
