# Cue DSL

## Contents

- Execution model
- Cue form
- Cue vocabulary
- Conditions and effects
- Player actions and edges
- Blocking and fallback rules
- Runtime invariants

## Execution model

Enter one beat at a time. Apply its cues in array order unless a `parallel` cue groups children. Commit cue effects only when the cue completes or its fallback specifies equivalent end effects. Then present available actions and evaluate outgoing edges.

Treat cue commands as high-level intent. The runtime adapter resolves coordinates, animation clips, audio nodes, and camera implementation.

## Cue form

```json
{
  "id": "cue.host-crosses-room",
  "type": "actor.move",
  "actorId": "actor.host",
  "targetAnchor": "anchor.fireplace",
  "blocking": true,
  "timeoutMs": 4000,
  "fallback": {"strategy":"snap"},
  "effects": {"setFlags":["flag.host-at-fireplace"]}
}
```

Every cue requires `id` and `type`. Use only the fields meaningful to that type. Put story state changes in `effects`, not in renderer callbacks.

## Cue vocabulary

Actor cues:

- `actor.enter`, `actor.exit`, `actor.move`, `actor.face`
- `actor.sit`, `actor.stand`, `actor.gesture`

Dialogue cues:

- `dialogue.say`, `dialogue.interrupt`, `dialogue.silence`

Prop cues:

- `prop.show`, `prop.hide`, `prop.use`, `prop.set`

Presentation cues:

- `light.set`, `light.fade`, `light.flicker`
- `audio.play`, `audio.stop`, `audio.duck`
- `camera.focus`, `camera.pan`, `camera.zoom`, `camera.shake`

Flow cues:

- `wait.duration`, `wait.event`, `parallel`
- `interaction.open`, `fact.reveal`, `scene.transition`

Use `dialogue.say` with `actorId` and `text`. Use actor cues with `actorId`; movement and entry cues also require `targetAnchor`. Use prop cues with `propId`. Use `fact.reveal` with `factId`. Use `wait.duration` with `durationMs`. Use `parallel` with `cues[]` and a completion policy of `all` or `any`.

## Conditions and effects

Apply a cue only when its optional `when` condition is true. Use the condition fields defined in `story-ir-schema.md`.

Use effects for durable state only:

```json
{
  "setFlags": ["flag.key-taken"],
  "unsetFlags": ["flag.key-on-hook"],
  "revealFacts": ["fact.key-fits-cellar"],
  "setProps": [{"propId":"prop.key","state":"carried"}]
}
```

Make effects idempotent. Replaying a completed cue after save recovery must not duplicate inventory, journal entries, or audio.

## Player actions and edges

Put bounded player choices in `beat.actions[]`:

```json
{
  "id": "action.inspect-key",
  "label": "Inspect the brass key",
  "verb": "Inspect",
  "when": {"flagsNone":["flag.key-inspected"]},
  "effects": {
    "setFlags": ["flag.key-inspected"],
    "revealFacts": ["fact.key-fits-cellar"]
  }
}
```

After an action, evaluate every matching edge during simulation. At runtime, take the highest-priority matching `auto` edge; if no auto edge matches, present matching `choice` edges. Never use array order as hidden story logic when priorities differ.

Use actions for talk topics, inspect/use/take/give interactions, and explicit continue prompts. Do not model unrestricted natural-language input as required progression.

## Blocking and fallback rules

Set `blocking: true` only when later cues require completion. A blocking external operation requires positive `timeoutMs` and a fallback:

- `complete`: mark complete and apply declared end effects.
- `snap`: move or set the target instantly.
- `skip`: omit presentation but apply required effects.
- `substitute`: use a declared text, sound, or animation substitute.
- `abort-beat`: enter a recoverable error route; never use for an expected asset miss.

`wait.duration` is already bounded by `durationMs`. Never wait indefinitely for pathfinding, animation events, audio completion, a model response, or focus input.

## Runtime invariants

- Pause cue time when the game pauses.
- Cancel or settle pending cues during scene transition.
- Restore cue completion and durable effects consistently after save/resume.
- Skip-seen applies end effects and preserves reveal order.
- Runtime AI may paraphrase optional lines only within supplied knowledge; it may not emit effects.
- Log scene, beat, cue, timeout, fallback, and resulting state for every recovery.
