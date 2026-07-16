---
name: design-narrative-gameplay
description: Design systemic 2D narrative-adventure gameplay from an approved story model. Use when Codex must derive experience goals, generate and score mechanic candidates, choose a story-derived core loop, define reusable verbs and effects, author world-state transactions, inventory and map-layer rules, ensure meaningful consequences, and specify runtime requirements without changing canon.
---

# Design Narrative Gameplay

Design from desired player experience toward mechanics. Do not translate every prop into an inspect prompt.

## Select the game dynamics

1. Read the production charter, approved story model, and [gameplay-design-rules.md](references/gameplay-design-rules.md).
2. Define three to five experience goals and the evidence that play produces each one.
3. Generate at least three core-mechanic candidates from source motifs, rules, repeated actions, spatial contradictions, or emotionally charged objects.
4. Score candidates for story relevance, causal clarity, spatial impact, expressive choice, reuse, feasibility, accessibility, novelty, and reveal safety.
5. Select one core mechanic and no more than three supporting mechanic families. Record why rejected candidates lost.
6. Define the core loop, verb grammar, world-state model, inventory rules, reversibility, failure recovery, and runtime requirements.
7. Specify every important interaction as a transaction with preconditions, visible affordance, performance, atomic effects, feedback, consequences, reversibility, and recovery.
8. Write `generated/20-design/gameplay-design.json` following [gameplay-contract.md](references/gameplay-contract.md).

## Require meaningful play

- Every required interaction must change at least two consequence channels.
- At least one selected mechanic must alter access, topology, danger, actor behavior, or world layer.
- Teach a verb through a low-risk but narratively meaningful first use, then vary it later.
- Reuse a small coherent grammar; do not invent unrelated minigames for every scene.
- Preserve player agency by making outcomes legible before or immediately after action.
- Provide recovery for reversible mechanics and prevent unwinnable state combinations.
- Do not use random variation where the story needs a guaranteed setup or reveal.

Do not author final dialogue, map coordinates, art prompts, or runtime code.
