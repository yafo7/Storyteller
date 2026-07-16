---
name: design-stage-and-levels
description: Design stateful 2D maps and theatrical staging for a narrative game. Use when Codex must turn approved gameplay and performance plans into map topology, zones, portals, collision and navigation, world-state variants, interaction placement, actor entrances and blocking, camera and lighting intent, recovery routes, and spatial validation without changing canon or mechanics.
---

# Design Stages and Levels

Make space carry story and mechanics. A map is a stateful graph, not a painted background with hotspots.

## Lay out the playable world

1. Read the production charter, story model, gameplay design, performance plan, and [spatial-design-rules.md](references/spatial-design-rules.md).
2. Build a map graph from dramatic locations and required traversal, consolidating locations only within the adaptation contract.
3. Define zones, anchors, portals, occluders, collision, navigation, camera bounds, interaction ranges, and actor routes semantically before assigning coordinates.
4. Create explicit state variants for mechanics that change light, access, topology, danger, actors, or world layer. Store deltas rather than duplicating unchanged maps.
5. Block each beat with entrances, exits, gaze, distance, prop handling, focus, and recovery placement.
6. Ensure every required target is reachable in every valid prerequisite state and every reversible transformation has a return route.
7. Budget visual focus so actors, objectives, prompts, and critical props do not compete.
8. Write `generated/40-world/stage-plan.json` following [stage-contract.md](references/stage-contract.md).

## Preserve ownership

- Implement approved interaction effects spatially; do not weaken them into text.
- Return infeasible mechanics to gameplay design with evidence.
- Return impossible pacing or blocking to drama direction.
- Define art requirements by semantic asset IDs and states; do not choose final visual style.
- Keep coordinates and render implementation out of story and gameplay artifacts.

Set `status` to `approved` only after topology, state variants, traversal, staging, and recovery routes are internally consistent.
