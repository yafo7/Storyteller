# Acceptance and failure routing

## Program-level gates

P1-P6 produce a Skill Beta and executable workflow only. They must prove Skill structure, deterministic helpers, lock behavior, checkpoint recovery, typed invalidation, forward selection, and legacy protection. They neither create a 0.3 game nor claim that a player experience works.

P7 autonomously creates one complete playable game candidate. Its internal acceptance requires schema/reference closure, canon diff, onboarding identity and goal clarity, developed core mechanic, meaningful persistent consequences, before/after map and NPC response, required-route reachability, no softlocks, save/reload equivalence, bounded retry and hints, accessible non-color feedback, visual identity/readability, browser screenshots, deterministic build, design lineage, flavor review, and internal clone-risk screening. `70-candidate` freezes the package hash; the result is a candidate awaiting P8.

P8 is a hard independent release gate. Require, against the same frozen candidate hash:

- independent whole-game acceptance;
- blind originality review without franchise, Pack, title, pattern-lineage, or flavor-target disclosure;
- separate clone-risk review, because successful flavor attribution cannot waive recognizable copying;
- unbriefed cold-user observation;
- fresh-environment reproducibility;
- rollback rehearsal that preserves every older version and save namespace.

Only the committed `99-release` checkpoint is Stable. Pattern-level blind exercises or Library Beta reports from P1-P6 cannot substitute for the P8 whole-game test.

## Failure routing

- Wrong facts, role knowledge, or reveals: Story.
- Irrelevant, overloaded, incompatible, or clone-prone selected patterns: selection/originality.
- Weak core development, invisible consequences, or incoherent state rules: gameplay.
- Exposition-heavy onboarding, flat pacing, or state-blind dialogue: performance.
- Route failures, unclear navigation, collision errors, or missing recovery: world/stage.
- Inconsistent identity, unreadable state contrast, or rights/provenance gaps: art.
- Missing capabilities: Adapter/selection before Build.
- Save corruption, nondeterminism, browser defects, or packaging: Build.
- Incomplete, non-independent, non-blind, or candidate-mismatched evidence: the owning evaluation gate; do not redesign merely to make a report pass.

Any repair changes an authoritative artifact hash. Run `resume`, accept its earliest invalidation boundary, regenerate consumers, and freeze a new candidate before re-entering P8. Never edit a report or state pointer to preserve a pass.

## Completion report

The final report names the run ID, source and lock hashes, frozen candidate hash, completed checkpoint head, local entry path, tested routes, evidence hashes, unresolved non-blocking observations, and owning phase for every repaired failure. If the state is earlier than `99-release`, use the exact status `Skill Beta`, `generating`, or `candidate awaiting P8`; do not use release language.
