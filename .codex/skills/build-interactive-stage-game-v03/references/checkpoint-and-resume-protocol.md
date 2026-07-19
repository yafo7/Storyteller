# Checkpoint and resume protocol

## Authority and storage

Every P7 production starts in a new, empty product directory. Never initialize a run inside an existing 0.1, 0.2, or 0.21 product tree. The director creates these control files before authoring the brief:

- `production-run-state.json`: the small, human-readable pointer to the committed head.
- `.production-checkpoints/*.json`: immutable, content-addressed full snapshots linked by previous-checkpoint hashes.

The validated checkpoint head is the authoritative production state. The pointer is an atomic convenience index. A checkpoint is written and flushed before the pointer advances. If a restart finds a missing, truncated, or stale pointer, `resume` follows the unique valid hash chain and repairs the pointer. It refuses divergent heads instead of guessing. Only one director process may write a run at a time.

Use the helper from the repository root:

```text
node .codex/skills/build-interactive-stage-game-v03/scripts/production-run-state.mjs init <new-product-root> --run-id=<stable-id> --director-id=<producer-id> --input=source=<script> --input=product-profile=<profile> --input=library=<released-library> --input=skill=<skill-root> --port=5175 --entry=/v03/<run-id>/
node .codex/skills/build-interactive-stage-game-v03/scripts/production-run-state.mjs checkpoint <product-root> <phase> --artifact=<id>=<path> --evidence=<gate-id>=<report>
node .codex/skills/build-interactive-stage-game-v03/scripts/production-run-state.mjs verify <product-root>
node .codex/skills/build-interactive-stage-game-v03/scripts/production-run-state.mjs resume <product-root>
node .codex/skills/build-interactive-stage-game-v03/scripts/production-run-state.mjs status <product-root>
```

Paths after the second `=` may contain Windows drive separators. Output artifacts and evidence must live inside the new product root; locked inputs may live outside it. All files and directory trees are SHA-256 hashed with normalized relative paths, and symbolic links are rejected.

## Internal phases and required handoffs

The project program phases P1-P8 and the production phases below are different namespaces. P1-P6 deliver only the Skill Beta. A production state may first be initialized when P7 is authorized.

| Production phase | Program owner | Required artifacts | Required passing evidence |
| --- | --- | --- | --- |
| `00-brief` | P7 | `production-charter` | - |
| `05-lock-draft` | P7 | `dependency-lock-draft` | - |
| `10-story` | P7 | `story-model` | - |
| `12-lock-final` | P7 | `library-lock` | `director-preflight` |
| `15-patterns` | P7 | `pattern-recommendations` | - |
| `20-gameplay` | P7 | `gameplay-design` | - |
| `30-performance` | P7 | `performance-plan` | - |
| `40-world` | P7 | `stage-plan` | - |
| `50-art` | P7 | `art-bible`, `asset-registry` | - |
| `60-build` | P7 | `production-ir`, `game-package` | - |
| `70-candidate` | P7 | `p7-acceptance-report` | `browser-run`, `required-routes`, `save-reload`, `no-softlock`, `canon-diff` |
| `80-independent-validation` | P8 | `p8-independent-report` | `independent-validation` |
| `85-blind-originality` | P8 | `blind-originality-report`, `clone-risk-report` | `blind-originality`, `clone-risk` |
| `90-cold-user` | P8 | `cold-user-report` | `cold-user` |
| `95-repro-rollback` | P8 | `reproducibility-report`, `rollback-report` | `reproducibility`, `rollback-rehearsal` |
| `99-release` | P8 | `stable-release-report` | - |

Checkpoint phases in order. Do not create a later placeholder to bypass an earlier failure. `70-candidate` freezes the hash of `game-package`, changes the run to `candidate-awaiting-p8`, and ends P7. Only `99-release`, after every P8 gate passes against that same candidate hash, changes the run to `stable`.

Evidence is JSON with `gateId` and `result: "pass"`. Every P8 report also carries the exact `candidateSha256` of the frozen `game-package`. The hard gates require these additional attestations:

- `independent-validation`: `independent: true` and a `reviewerId` different from the run's `directorId`.
- `blind-originality`: `independent: true`, `blinded: true`, and a distinct `reviewerId`; `withheldContext` must include `franchise-target`, `pack-identity`, `title-observations`, `pattern-lineage`, and `flavor-score`.
- `clone-risk`: `independent: true` and a distinct `reviewerId`; review recognizable sequence, topology, silhouette, UI, language, audio, and staging separately from flavor.
- `cold-user`: `coldStart: true` and `participantCount >= 1`.
- `reproducibility`: `freshEnvironment: true`.
- `rollback-rehearsal`: `rollbackSucceeded: true`.

Passing P1-P6 library or pattern diagnostics never substitutes for the whole-game P8 blind test. Likewise, a high flavor score never overrides clone risk.

## Invalidation boundaries

On `verify`, any changed or missing locked input or completed artifact is a hard error. On `resume`, the same drift appends a typed invalidation checkpoint and clears the owning phase and every consumer after it. It never edits an earlier authoritative artifact in place.

- Brief input or production charter: invalidate `00-brief` onward.
- Product Profile or runtime constraint: invalidate `05-lock-draft` onward.
- Source script or story model: invalidate `10-story` onward.
- Schema, Library, Pack, Adapter, director/specialist Skill, final lock, or preflight: invalidate `12-lock-final` onward.
- Pattern recommendations: invalidate `15-patterns` onward.
- Gameplay: invalidate `20-gameplay` onward.
- Performance: invalidate `30-performance` onward.
- World/stage: invalidate `40-world` onward.
- Art registry or art bible: invalidate `50-art` onward.
- Production IR or package: invalidate `60-build` onward and discard the frozen candidate.
- Candidate self-check evidence: invalidate `70-candidate` onward.
- A P8 report invalidates its own P8 phase and all later release gates.

The state stores both the previous and current digest in each invalidation record. Missing inputs block recovery until restored. Manual invalidation uses `invalidate <product-root> <phase> --reason=<text>` and follows the same downstream clearing rules.

## Restart procedure

After a crash, reboot, model handoff, or long pause:

1. Run `resume`, never infer completion from files visible in the directory.
2. Confirm the run ID, candidate status, unique checkpoint head, input hashes, completed phase list, and reported next phase.
3. Read the authoritative JSON for the last completed handoff; do not rely on conversational memory.
4. Repair only the reported next phase. If drift caused invalidation, regenerate from the owning phase.
5. Checkpoint only after the phase artifact validates. A failed phase is recorded in its report but is not checkpointed as complete.

Conversation summaries, Git status, timestamps, and generated file presence are not authority. The hash-linked state is authority.
