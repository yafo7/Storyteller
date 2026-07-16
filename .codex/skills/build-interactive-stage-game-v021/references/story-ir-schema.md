# Production and Story IR Schema

## Contents

- Package convention
- Required root fields
- Source and adaptation records
- Story layer
- World layer
- Performance layer
- UI and assets
- Identifier and reference rules

## Package convention

Use one authoritative `production.json`. Keep referenced media beside it with relative paths. A runtime may compile the JSON further, but generated caches are never the source of truth.

Start from `assets/runtime-template/production.json`. Validate with `scripts/validate-production.mjs` after every structural edit.

## Required root fields

```json
{
  "$schema": "interactive-stage-production/v1",
  "schemaVersion": "1.0.0",
  "id": "production.example",
  "title": "Example",
  "language": "en",
  "adaptation": {},
  "sources": [],
  "flags": [],
  "story": {},
  "world": {},
  "performance": {},
  "ui": {},
  "assets": []
}
```

Use lowercase IDs containing letters, digits, dots, underscores, or hyphens. Keep IDs stable across regeneration. Use display labels for localized prose, never IDs.

## Source and adaptation records

Each source contains `id`, `path`, and `kind`; include `sha256` after normalization. Allowed kinds are `screenplay`, `fountain`, `subtitle`, `transcript`, `stage-play`, `prose`, and `outline`.

`adaptation` requires `mode`, `playerAgency`, and `targetMinutes`. Use the enums in `adaptation-modes.md`.

## Story layer

`story.facts[]`:

```json
{
  "id": "fact.door-locked",
  "text": "The west door was locked from inside.",
  "immutable": true,
  "required": true,
  "earliestReveal": "beat.inspect-door",
  "sourceRefs": [
    {"sourceId":"source.main","startLine":42,"endLine":45,"confidence":0.98}
  ]
}
```

An immutable fact requires a source reference. A required fact must be known at every successful ending. `earliestReveal` names the first beat allowed to reveal it.

`story.characters[]` requires `id`, `name`, `knowledge[]`, and `beliefs[]`. A belief has `factId` and a stance of `accepts`, `denies`, `uncertain`, or `unaware`. Character knowledge is not player knowledge.

`story.evidence[]` requires `id`, `label`, `supports[]`, and optional `sourceRefs[]`. Evidence supports or challenges interpretation; acquiring evidence does not automatically confirm every supported fact.

`story.adaptationLedger[]` follows `adaptation-modes.md`. Keep it empty only when no material adaptation occurred.

## World layer

`world.stages[]` requires `id`, `label`, and `anchors[]`. Every anchor has an ID and a semantic `kind`, such as `entrance`, `exit`, `focus`, `seat`, `prop`, or `interaction`. Coordinates belong to the host adapter, not story logic.

`world.actors[]` requires `id`, `characterId`, `stageId`, and `anchorId`. The character owns knowledge; the actor owns placement and performance.

`world.props[]` requires `id`, `prototype`, `stageId`, `anchorId`, `initialState`, and nonempty `states[]`. Prefer prototypes from the placeholder stage kit or the host runtime. Add a mechanic-gap report before adding a new prototype.

## Performance layer

`performance` requires `entryBeat`, `scenes[]`, `beats[]`, and `endings[]`.

A scene requires `id`, `label`, `stageId`, `entryBeat`, and `required`. A beat requires `id`, `sceneId`, `stageId`, `mode`, `cues[]`, `actions[]`, and `next[]`. Allowed modes are `performance`, `exploration`, `conversation`, and `transition`.

Terminal beats set `terminal: true`, set `endingId`, and omit outgoing edges. Nonterminal beats require at least one action or outgoing edge.

Define initial state with `flags[]` records shaped as `{"id":"flag.example","initial":false}`. Cues and actions change state through effects:

```json
{
  "setFlags": ["flag.door-open"],
  "unsetFlags": [],
  "revealFacts": ["fact.door-locked"],
  "setProps": [{"propId":"prop.door","state":"open"}]
}
```

Actions require `id`, `label`, `verb`, optional `when`, and optional `effects`. Edges require `to`, optional `label`, `kind` (`auto` or `choice`), optional `priority`, and optional `when`.

Conditions may contain `flagsAll`, `flagsAny`, `flagsNone`, `factsAll`, `factsAny`, `factsNone`, and `propStates`. Omitted conditions are true.

## UI and assets

`ui.controls[]` maps a semantic `action` to `bindings[]` and a localized `label`. Provide at least `interact` and `pause`. Put accessibility defaults in `ui.accessibility`.

`assets[]` may record `id`, relative `path`, `kind`, `license`, and `source`. Reject absolute paths, parent traversal, secrets, and unlicensed required media.

## Identifier and reference rules

- Keep IDs unique within their collection; keep cue and action IDs globally unique.
- Resolve every fact, character, actor, prop, stage, anchor, flag, scene, beat, ending, and source reference.
- Scope anchor IDs to a stage; validate actor and prop anchors against their declared stage.
- Keep source lines one-based, inclusive, and ordered.
- Keep all prose as data and render it safely; never embed executable markup from a source or model.
- Increment `schemaVersion` only when the runtime contract changes, not when story content changes.
