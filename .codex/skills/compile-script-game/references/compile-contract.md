# Compile Contract

## Inputs

Require approved charter, story model, gameplay design, performance plan, stage plan, art bible, and asset manifest. Record their hashes in the build report.

## Outputs

- `generated/60-build/production.json`: authoritative runtime-neutral production.
- `generated/60-build/build-report.json`: input hashes, capability mapping, generated caches, warnings, blocked gaps, and verification evidence.
- Playable host project files in the charter's target directory.

## Runtime primitives

The runtime should support semantic verbs and effects rather than story-specific functions. Minimum effect families are facts and flags, inventory, entity state, collision, portals, zone visibility, actor state and schedule, light and audio, world layers, beat transition, and map transition.

An interaction commits durable effects only after its blocking presentation completes or its fallback reaches the equivalent end state. Save recovery must not duplicate inventory, journal, or irreversible effects.

## Capability gaps

Report `requirementId`, source mechanic, missing primitive, player-visible impact, smallest reusable extension, fallback quality, and whether the fallback preserves the story function. Route design changes upstream; keep reusable engine extensions in the compiler phase.
