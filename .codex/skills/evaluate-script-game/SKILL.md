---
name: evaluate-script-game
description: Evaluate a generated 2D narrative game across canon, onboarding, pacing, interaction quality, world-state causality, route reachability, staging, visual coherence, accessibility, runtime reliability, and packaging. Use when Codex must run deterministic checks, simulate all required routes, inspect browser screenshots and play states, score creative gates, identify the owning phase for each failure, and prevent premature completion claims.
---

# Evaluate a Script Game

Test the player experience, not only whether the application launches. Keep evaluation independent from the implementation's excuses.

## Evaluate

1. Read the charter and every approved artifact, then read [evaluation-rubric.md](references/evaluation-rubric.md) and [acceptance-contract.md](references/acceptance-contract.md).
2. Run upstream structural validators, production validation, runtime checks, and full route simulation.
3. Run `node scripts/score-production.mjs <project-root>` for deterministic creative gates.
4. Play the opening without assuming source knowledge. Verify role, immediate objective, first verb, visible consequence, and motivating question.
5. Exercise every mechanic, reversible state, inventory dependency, portal, map transition, save and resume state, skip path, ending, pause state, and recovery path.
6. Capture representative screenshots for each map and major state variant. Inspect identity, staging, focal hierarchy, crop, contrast, UI overlap, CJK wrapping, focus, and visual change legibility.
7. Compare actual pacing to the authored curve. Flag rushed reveals, uninterrupted exposition, repetitive intensity, idle stretches, and interaction windows without meaningful questions.
8. Write `reports/acceptance-report.json`, attach evidence, and route every failure to its owning skill.

## Protect evaluation integrity

- Do not waive a gate merely because the current runtime lacks support.
- Distinguish structural pass, proxy pass, visual-review pass, and human-playtest evidence.
- A successful automated route proves reachability, not emotional quality.
- A screenshot pass proves layout and coherence, not animation feel.
- Record uncertainty honestly and require stronger evidence for final acceptance than for a prototype.

Set overall status to `pass` only when every required gate passes or has an explicit waiver with owner, reason, scope, and player-visible impact.
