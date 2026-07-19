# Title research profile contract 1.0.0

Each analyst writes one JSON file per assigned title under `works/profiles/<slug>.json`. The profile is a compact authoring source compiled into formal Claim, Observation, and Title Dossier records.

Required top-level fields:

- `workId`, `author`, `reviewer`;
- `dimensionSummaries`: exactly the 20 frozen dimension IDs, each with a concise work-specific summary;
- optional `notApplicableDimensions`: dimension IDs with a concrete reason when no material causal mechanic exists for that dimension;
- `observationThemes`: exactly five atomic causal observations;
- `contributionHypotheses`, `uniqueOrNonportable`, `openQuestions`.

Each observation theme must contain `key`, `dimensions`, `context`, `preconditions`, `playerInput`, `before`, `action`, `after`, `feedback`, `consequences`, `factualDescription`, `interpretation`, `confidence`, and `disposition`. Across the five themes, every frozen dimension not declared in `notApplicableDimensions` must occur at least once. A theme should explain one observable action → state → feedback → consequence chain, not summarize the whole game. Assign a dimension only when it materially participates in that chain; do not append `hardware-multiplayer` or another weak edge merely to fill the matrix.

Use original-version behavior unless a variant is explicitly named. Treat the primary game and official product record as tier-A behavioral evidence. Do not infer creator intent from observed behavior. Paraphrase; do not include dialogue, walkthrough prose, proprietary map layouts, or source-specific puzzle sequences. Keep candidate principles abstract enough to compare, while `uniqueOrNonportable` explicitly isolates recognizable surface structures.

Calibration anchors from P2:

- observation grain is one player-understandable causal rule or cadence, usually spanning 3–5 dimensions;
- a summary states what the title does and why that dimension matters, without claiming cross-title universality;
- `portable-candidate` is a hypothesis, not a released pattern;
- `single-title` and `counterexample` are valuable outcomes; `deferred` requires a concrete open question;
- five themes must collectively cover agency/loop, world/space, puzzle/exploration, social/performance, and implementation/recovery; a justified dossier-level N/A is safer than a weak causal edge.
