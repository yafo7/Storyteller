# Merge policy 1.0.0

Stable IDs are never reused. Corrective metadata changes are patch releases; new compatible observations, patterns, relationships, or adapters are minor releases; contract or behavioral incompatibilities are major releases. Deletion is represented by deprecation and a machine-readable migration.

One owner writes a `workId` at a time. Shared taxonomies, released patterns, indexes, and release manifests pass through a serialized merge queue. Before merge, run Draft 2020-12 schema validation, reference closure, duplicate-ID detection, dimension reconciliation, provenance rules, originality rules, index regeneration, benchmark tests, and legacy-baseline verification.

Generated coverage and hash manifests are derived from authoritative records. They are not hand-edited evidence. An author cannot be the sole release/originality reviewer of their own pattern. A failed gate routes to its owning evidence, distillation, selector, adapter, or orchestration layer.
