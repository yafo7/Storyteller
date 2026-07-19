# Release procedure

1. Run schema, scope, reference, coverage, pattern, relation, originality, adapter, and benchmark validation.
2. Confirm the current phase's independent reviews are present and every disputed evidence edge has been corrected or barred from provenance. At P1-P6 this means evidence, contract, quarantine, and static originality review; do not require or claim P8 whole-game blind evidence.
3. Generate coverage, observation disposition, flavor, originality, faceted, retrieval, and provenance indexes.
4. Generate the Pack manifest excluding itself from its canonical tree; store the resulting `treeHash` in the Pack manifest.
5. Generate the Library release including and hashing the Pack manifest while excluding only the current Library release file from its own canonical tree. Retain older releases in the tree.
6. Compile the release twice without changing inputs and require byte-identical Pack and Library manifests.
7. Run the independent recursive release validator, full library validation, and legacy-baseline checks.
8. Record semantic version, status, changelog, migrations, unresolved gaps, and gate evidence.

Patch releases correct evidence or non-behavioral metadata. Minor releases add compatible works, observations, patterns, relationships, adapters, or indexes. Major releases change schema or selection behavior. IDs are never reused.

Beta may ship the P1–P6 research/Skill system. P7 must prove autonomous production of one complete game. Stable requires P8 whole-game blind attribution, user cold experience, reproducibility, and rollback evidence. Never promote Beta by changing only the status string.
