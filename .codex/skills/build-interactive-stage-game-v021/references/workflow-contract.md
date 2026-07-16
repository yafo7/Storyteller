# Workflow Contract

## Artifact ownership

| Phase | Owner | Required artifact | May revise |
| --- | --- | --- | --- |
| Brief | Orchestrator | `generated/00-brief/production-charter.json` | User goals and production defaults |
| Story | Story analysis | `generated/10-story/story-model.json` | Source interpretation only |
| Design | Gameplay design | `generated/20-design/gameplay-design.json` | Mechanics and world-state rules |
| Performance | Drama direction | `generated/30-performance/performance-plan.json` | Onboarding, beats, dialogue intent, pacing |
| World | Stage design | `generated/40-world/stage-plan.json` | Maps, topology, blocking, staging |
| Art | Art direction | `generated/50-art/art-bible.json`, `asset-manifest.json` | Visual specification and assets |
| Build | Compiler | `generated/60-build/production.json` | Runtime representation only |
| Evaluation | Evaluator | `reports/acceptance-report.json` | Findings, evidence, and routing |

An owner may reject an upstream artifact with a diagnostic. It must not silently edit that artifact. Rebuilding an upstream phase invalidates every downstream artifact.

## Stable identifiers

Assign stable IDs during story analysis. Downstream phases reference those IDs instead of copying prose as identity. Use prefixes such as `character.`, `fact.`, `reveal.`, `motif.`, `mechanic.`, `beat.`, `map.`, `zone.`, `asset.`, and `gate.`.

## Phase status

Every required JSON artifact must contain:

```json
{
  "schemaVersion": "1.0.0",
  "status": "draft | approved | blocked",
  "sourceHash": "sha256-or-upstream-hash",
  "decisions": [],
  "unresolved": []
}
```

Only `approved` artifacts can feed compilation. A nonempty `unresolved` list is allowed only when every item is non-blocking and records its impact.

## Failure routing

- Canon, character knowledge, or reveal leak -> story analysis.
- Weak role introduction, exposition dump, flat pacing, or unclear beat intent -> drama direction.
- Text-only interactions, weak causality, repetitive verbs, or no world transformation -> gameplay design.
- Dead ends, unreadable topology, blocked routes, poor staging, or state mismatch -> stage design.
- Missing, inconsistent, unlicensed, or illegible visuals -> art direction.
- Schema, runtime, save, cue, focus, or performance bugs -> compiler.
- Incomplete evidence or an invalid waiver -> evaluator.
