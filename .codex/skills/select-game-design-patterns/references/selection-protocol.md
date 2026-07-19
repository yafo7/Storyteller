# Selection protocol

Required query fields: causal story signals, experience goals, spatial constraints, runtime capabilities, four-part production budget, negative signals, enabled packs, and blocked packs. Production selection also requires an exact, hash-verified `library-lock.json`; reject a missing or drifting lock before retrieval.

Retrieve in two steps: read `design-library/indexes/retrieval-index.json`, shortlist, then load only those full pattern records. Title observations, sources, and fingerprints are evidence/review data and must not enter generation context.

Hard vetoes run first: canon conflict, runtime impossibility, budget impossibility, clone risk, or unrecoverable softlock. Surviving candidates use the frozen 25/20/15/10/10/10/5/5 scoring model. Require causal signal matches, not nouns.

Non-abstaining output has exactly one core and zero to three supports. A support must share the core experience axis, add a distinct function, and avoid conflicts. The output closes candidate → application → composition → handoff → assertion references and records rejected candidates.

Abstention has no applications, a null core, no supports, an explicit reason, and four no-Pack handoffs. A blocked Pack cannot leak through a core-promoted record. Emit `status: draft` for a selection and `status: rejected` for abstention; approval belongs to downstream review.

Use `--benchmark-unlocked` only inside the deterministic benchmark wrapper before a release lock exists. Never accept that flag in a production workflow or relabel its output as approved.
