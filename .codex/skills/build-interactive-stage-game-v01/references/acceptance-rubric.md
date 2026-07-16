# Acceptance Rubric

Score every item as `pass`, `fail`, or `not-applicable`, and attach evidence for failures.

## Source and adaptation

- Every immutable fact has at least one valid source span.
- Every low-confidence claim that could change the plot remains unresolved or reviewed.
- The adaptation mode and player agency contract are explicit.
- Every material invention or compression appears in the adaptation ledger.
- No character states knowledge they cannot possess at that beat.
- No UI, optional dialogue, asset label, or objective leaks a gated reveal.

## Content model

- `validate-production.mjs --strict` passes.
- IDs and references are stable, unique in scope, and resolvable.
- Every required fact has a reachable acquisition route.
- Every scene uses valid stages, actors, anchors, props, flags, and facts.
- Human overrides survive regeneration.

## Playability

- `simulate-playthrough.mjs --strict` reaches at least one ending.
- Every reachable branch can reach an ending; no reachable route deadlocks or traps.
- Every declared ending and required beat is reachable, or is explicitly marked optional.
- Blocking movement, audio, camera, dialogue, and interaction cues have fallbacks.
- A full playthrough succeeds without network access or runtime AI.
- Save/resume restores beat, flags, known facts, prop states, and player/NPC placement.

## Interaction and UI

- Context focus chooses the object the player reasonably intends.
- Every interaction displays a concrete verb and feedback.
- The player can distinguish performance from exploration and can find the continue action.
- Dialogue, transcript, choices, journal, pause, errors, and ending screens fit target viewports.
- Keyboard-only play and promised accessibility settings work.

## Staging and presentation

- Actors do not overlap important props, leave the walkable area, or block all routes.
- Entrances, exits, gaze, lighting, sound, and prop state changes match cue intent.
- Required visual and audio clues remain perceptible with accessibility alternatives.
- Placeholder art is coherent, labeled in the asset report, and free of license ambiguity.
- Representative screenshots show no clipping, unreadable text, or unintended empty stage.

## Engineering and delivery

- Runtime code is story-agnostic; switching a supported production does not require core runtime edits.
- Client code contains no secret keys and renders source/model text safely.
- Errors name the scene, beat, cue, and fallback outcome.
- Package hashes are reproducible for unchanged input.
- Delivery includes source inspection, adaptation ledger, unresolved claims, validation summary, simulation summary, asset/license report, and run instructions supplied by the host project.

Do not mark the production complete while any non-waived `fail` remains. Record a waiver with owner, reason, scope, and user-visible impact.
