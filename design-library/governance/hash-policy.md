# canonical-tree-sha256/v1

Release manifests use UTF-8 file bytes and lowercase SHA-256. Paths use `/`, are relative to the declared release root, and sort by Unicode code-point order. Each leaf records path, byte count, kind, and hash. The tree hash is SHA-256 of newline-joined records in the form `sha256  bytes  path` with a final newline.

The manifest that contains the tree hash is excluded from its own tree calculation, avoiding self-reference. Pack manifests likewise exclude themselves and store their own `treeHash`; the parent Library release separately hashes the complete Pack manifest. When a future Library version is compiled, only that version's target manifest is excluded, so retained older release manifests deliberately remain in the new history tree.

Pack content counts describe records physically committed by the Pack tree. Adapters and benchmark suites live at Library scope and therefore remain zero in the Pack manifest even when the Library release supplies compatible adapters and tests. Hashes prove reproducibility of the retained project records; they do not imply possession or hashing of copyrighted game binaries.
