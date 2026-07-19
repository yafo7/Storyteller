# Workflow and handoffs

## Authority layers

Use three kinds of authority without conflating them:

1. `production-run-state.json` and its immutable checkpoint chain own completion, resume position, candidate hash, and invalidation history.
2. Each phase JSON owns its subject matter. A downstream phase may reject it but cannot silently revise it.
3. `library-lock.json` owns exact production dependencies after Story; it does not own canon or Product Profile meaning.

The authoritative phase files are:

- `00-brief`: `production-charter.json`
- `05-lock-draft`: `dependency-lock-draft.json`
- `10-story`: `story-model.json`
- `12-lock-final`: `library-lock.json` plus `director-preflight.json`
- `15-patterns`: `pattern-recommendations.json`
- `20-gameplay`: `gameplay-design.json`
- `30-performance`: `performance-plan.json`
- `40-world`: `stage-plan.json`
- `50-art`: art bible, asset registry, provenance, and visual-validation contact sheet
- `60-build`: production IR, runtime, save model, and packaged game
- `70-candidate`: P7 acceptance, route, browser, save/reload, softlock, canon, visual, accessibility, flavor, and internal clone-risk reports
- `80-independent-validation`: independent whole-game acceptance report
- `85-blind-originality`: blinded attribution and separate clone-risk reports
- `90-cold-user`: unbriefed participant observation report
- `95-repro-rollback`: fresh-environment reproduction and rollback-rehearsal reports
- `99-release`: stable acceptance and release record

Read `checkpoint-and-resume-protocol.md` for required checkpoint IDs, evidence fields, and exact invalidation boundaries.

## Typed ownership

Story owns facts, beliefs, reveal gates, motifs, role candidates, adaptation limits, and ending invariants. Selection owns pattern lineage and rejections. Gameplay owns verbs, loop, transactions, state semantics, teaching, failure, and capability requirements. Performance owns beats, actor tactics, dialogue intent, interaction windows, and cue timing. World owns topology, placement, blocking, collisions, navigation, camera intent, and recovery routes. Art owns visual identity and asset provenance. Build owns capability implementation, deterministic compilation, save serialization, and packaging. Evaluation owns evidence and failure routing, not redesign.

Every handoff records its producer version, consumed artifact IDs and hashes, outputs, unresolved constraints, and rejected alternatives. Owners may constrain or reject upstream handoffs but must not patch them. Return a failure to the earliest owner that can correct it without changing unrelated authority.

## Lock and invalidation

Story analysis precedes final lock and retrieval. Run director preflight after `12-lock-final` and before `15-patterns`. Product Profile and Inspiration Pack remain independent locks.

- Brief change invalidates all production phases.
- Product Profile or runtime constraint drift invalidates dependency intent onward.
- Source, Story fact, role, or reveal change invalidates Story onward.
- Schema, Library, Pack, Adapter, Skill, or final-lock drift invalidates final lock and selection onward, not Story.
- Gameplay change invalidates every consumer from performance onward.
- Performance change invalidates world, build, and evaluation consumers.
- World change invalidates art integration, build, and evaluation.
- Art-only change invalidates visual build and evaluation, not Story or gameplay.
- Build/package change discards the frozen candidate and all P8 evidence.
- P8 evidence change invalidates its owning gate and all later gates.

The run-state helper computes the earliest changed boundary and clears all consumers. It stores old and new hashes in an invalidation event; it never treats a modified file as a completed replacement.

## Autonomy and legacy protection

The user supplies the story and high-level constraints, not detailed gameplay or scene design. Proceed using the locked Story, Profile, Library, and runtime. Ask only when a missing choice materially changes scope, rights, cost, safety, or an explicit acceptance criterion. Record non-material assumptions in the Charter.

Keep 0.1, 0.2, and 0.21 Skills, game trees, routes, ports, and saves intact. A 0.3 build gets a new directory, URL path, and save namespace. Initialization refuses a non-empty product root.
