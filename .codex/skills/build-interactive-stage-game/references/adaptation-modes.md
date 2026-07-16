# Adaptation Modes

## Select exactly one primary mode

### `faithful-stage`

Preserve character identity, relationships, event outcomes, chronology dependencies, and core reveals. Permit compression, spatial consolidation, stage symbolism, and line trimming only when they do not change meaning. Use this by default.

### `interactive-retelling`

Permit a new framing role or venue through which the original events are recalled, investigated, or reenacted. Preserve the source truth and label framing inventions. Do not let the framing device disclose gated truths early.

### `free-remix`

Permit role merging, changed chronology, new motives, alternate outcomes, and substantial invention. Require explicit authorization. Preserve a change ledger so the result is not presented as faithful.

## Define player agency separately

Choose one agency contract:

- `witness`: inspect and choose inquiry order; do not alter fixed events.
- `actor-role`: perform a named character's actions within that character's knowledge and constraints.
- `ensemble`: switch among bounded roles without omniscient knowledge leakage.
- `branch-author`: permit meaningful alternate outcomes only when the selected adaptation mode allows them.

State what the player may change:

- Investigation order
- Relationship tone
- Evidence route
- Local dialogue variation
- Ending interpretation or emotional color
- Canon outcomes, only if explicitly authorized

## Maintain an adaptation ledger

For every nontrivial change, record:

```json
{
  "id": "decision.combine-locations",
  "kind": "compression",
  "sourceRefs": ["span.12", "span.18"],
  "original": "Two visits occur on separate days.",
  "adapted": "Both visits occur during one staged night.",
  "reason": "Fit a 20-minute production.",
  "mode": "faithful-stage",
  "affectsImmutableFact": false,
  "authorizedBy": "mode-policy"
}
```

Allowed `kind` values include `compression`, `merge`, `reorder`, `framing`, `mechanic-translation`, `dialogue`, `visual-symbol`, and `outcome-change`.

## Apply invariants

- Never change an immutable fact silently.
- Never let a player-facing summary reveal more than the current reveal gate permits.
- Never give a character knowledge because the audience possesses it.
- Never use new dialogue to settle an ambiguity the source leaves unresolved unless the mode authorizes invention.
- Never use a mechanical shortcut that reverses causality.

If a desired change exceeds the active mode, stop and request an explicit mode change or a narrower exception.
