# The Last Lamp — minimal interactive-stage production

This directory is a data-only `interactive-stage-production/v1` package compiled in `faithful-stage` mode. `production.json` is authoritative, `source.txt` is the normalized line-addressable source, and `reports/` contains provenance and acceptance evidence.

The player is a witness. Core events and reveal order are fixed; at the final beat the witness selects which of the two outcomes explicitly left open by the source is performed.

## Validate

From any directory with Node.js available:

```powershell
node 'C:\Users\yafo777\.codex\skills\build-interactive-stage-game\scripts\validate-production.mjs' 'D:\workshop\developer_learn\3js_project\storyteller\tests\forward-output\production.json' --strict
```

## Simulate every route

```powershell
node 'C:\Users\yafo777\.codex\skills\build-interactive-stage-game\scripts\simulate-playthrough.mjs' 'D:\workshop\developer_learn\3js_project\storyteller\tests\forward-output\production.json' --strict
```

## Package

```powershell
node 'C:\Users\yafo777\.codex\skills\build-interactive-stage-game\scripts\pack-content.mjs' 'D:\workshop\developer_learn\3js_project\storyteller\tests\forward-output' --out 'D:\workshop\developer_learn\3js_project\storyteller\tests\forward-output\the-last-lamp.stagepack.json'
```

A compatible host interpreter is expected to supply title, loading, pause, save/resume, error, and viewport rendering states. Those host behaviors are not part of this minimal data fixture.
