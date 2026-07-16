# Spatial Design Rules

## Map graph first

Represent maps as zones connected by portals. A portal declares direction, conditions, enabled states, transition feedback, and destination spawn. Use doors, curtains, mirrors, stairs, fog boundaries, sound thresholds, and world-layer seams as diegetic portals where appropriate.

## Stateful deltas

A state variant may change:

- background or foreground asset
- light, weather, fog, sound, or layer opacity
- collision and navigation polygons
- enabled portals and interaction targets
- prop visibility and state
- actor presence, schedule, route, and reaction
- danger and safe zones

Keep irreversible discoveries separate from reversible presentation state.

## Staging

Every beat needs a focal composition, actor anchors, entrance and exit paths, target visibility, camera intent, and a safe player position. Avoid blocking all routes with actors. Preserve readable silhouettes and leave UI-safe space for text.

## Validation

Check start-to-objective reachability for every valid state combination, return reachability for reversible mechanics, portal pairing, spawn safety, collision gaps, line of sight, and focus ambiguity.
