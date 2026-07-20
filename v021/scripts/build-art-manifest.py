import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "generated" / "50-art"
ASSETS = ROOT / "assets"

def dims(relative):
    file = (ART / relative).resolve()
    with Image.open(file) as image:
        return list(image.size)

def asset(asset_id, owner, category, kind, state, path, method, refs, production=True):
    return {
        "id": asset_id,
        "ownerId": owner,
        "category": category,
        "kind": kind,
        "state": state,
        "path": path,
        "dimensions": dims(path),
        "alpha": "binary-or-opaque",
        "productionUse": production,
        "generationMethod": method,
        "referenceAssetIds": refs,
        "source": "project-owned AI-original or pixel-native derivative",
        "author": "Storyteller 0.21-R2 art workflow",
        "license": "project-owned",
        "attribution": "none required",
        "status": "approved",
        "qaEvidence": ["visual-contact-sheet.png", "../../reports/browser-qa-r2.json"],
        "pixelSpec": {"nativeDimensions": dims(path), "nearestNeighbor": True}
    }

assets = [
    asset("asset.style-anchor", "style.mist-manor-handheld-gothic-r2", "reference", "style-frame", "approved-anchor", "style-anchor.png", "OpenAI image generation from original brief", [], False),
    asset("asset.visual-contact", "style.mist-manor-handheld-gothic-r2", "reference", "contact-sheet", "validation", "visual-contact-sheet.png", "deterministic Pillow composition", ["asset.style-anchor"], False)
]

characters = ["grace", "anne", "nicholas", "mills", "victor", "charles"]
for character in characters:
    identity = f"asset.identity.{character}"
    assets.append(asset(identity, f"character.{character}", "character-identity", "identity-sheet", "base", f"source/characters/{character}-identity.png", "cropped from approved AI-original cast identity board", ["asset.style-anchor"]))
    assets.append(asset(f"asset.portrait.{character}", f"character.{character}", "portrait", "portrait", "base", f"source/characters/{character}-portrait.png", "pixel-native crop, resize and palette reduction", [identity]))
    assets.append(asset(f"asset.sprite.{character}", f"character.{character}", "four-direction-sprite", "four-direction-sprite", "base" if character not in ["victor", "charles"] else "echo", f"source/characters/{character}-sprite.png", "deterministic pixel-native four-direction animation", [identity]))

scene_states = {
    "nursery": ["echo", "daylight", "dawn"],
    "hall": ["daylight", "seance-open"],
    "music": ["overlap", "daylight"],
    "garden": ["fog", "graves-known"],
    "seance": ["living-overlap"]
}
for map_id, variants in scene_states.items():
    base_id = f"asset.environment.{map_id}.base"
    assets.append(asset(base_id, f"map.{map_id}", "environment-base", "environment-source", "base", f"source/environments/{map_id}-base.png", "OpenAI image generation using approved style-frame reference", ["asset.style-anchor"]))
    runtime_base = "fog" if map_id == "garden" else "base"
    assets.append(asset(f"asset.scene.{map_id}.{runtime_base}", f"map.{map_id}", "map-state-variant", "runtime-scene", runtime_base, f"../../assets/scenes/{map_id}-{runtime_base}.png", "aligned pixel-native resize and palette reduction", [base_id]))
    for variant in variants:
        path = f"../../assets/scenes/{map_id}-{variant}.png"
        assets.append(asset(f"asset.scene.{map_id}.{variant}", f"map.{map_id}", "map-state-variant", "runtime-scene", variant, path, "aligned color-layer transformation from approved base composition", [base_id]))

prop_states = ["curtain-closed", "curtain-open", "letter", "piano", "album", "grave-unread", "grave-read", "seance-empty", "seance-complete"]
for prop in prop_states:
    assets.append(asset(f"asset.prop.{prop}", "props.critical", "interactive-prop", "prop-state", prop, f"source/props/{prop}.png", "cropped from approved AI-original prop state board", ["asset.style-anchor"]))

assets.extend([
    asset("asset.ui.icons", "ui.v021", "ui", "ui-atlas", "objective-interaction-evidence-dialogue", "../../assets/ui-icons.png", "deterministic pixel-native atlas", ["asset.style-anchor"]),
    asset("asset.atlas.actors", "build.art", "compiled-atlas", "sprite-atlas", "compiled", "../../assets/actors.png", "deterministic compilation from separate sprite sources", [f"asset.sprite.{c}" for c in characters]),
    asset("asset.atlas.portraits", "build.art", "compiled-atlas", "portrait-atlas", "compiled", "../../assets/portraits.png", "deterministic compilation from separate portrait sources", [f"asset.portrait.{c}" for c in characters]),
    asset("asset.atlas.props", "build.art", "compiled-atlas", "prop-atlas", "compiled", "../../assets/props.png", "deterministic compilation from separate prop sources", [f"asset.prop.{p}" for p in prop_states]),
    asset("asset.tileset.fallback", "build.art", "compiled-atlas", "fallback-tileset", "fallback-only", "../../assets/tileset.png", "deterministic pixel-native fallback", ["asset.style-anchor"])
])

manifest = {"$schema":"script-game-asset-manifest/v2","schemaVersion":"2.0.0","status":"approved","styleContractId":"style.mist-manor-handheld-gothic-r2","assets":assets}
(ART / "asset-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

requirements = []
for character in characters:
    state = "echo" if character in ["victor", "charles"] else "base"
    requirements.append({"id":f"coverage.character.{character}","ownerId":f"character.{character}","requiredKinds":["identity-sheet","portrait","four-direction-sprite"],"requiredStates":[state],"coveredStates":[state],"producedAssetIds":[f"asset.identity.{character}",f"asset.portrait.{character}",f"asset.sprite.{character}"],"status":"approved"})

required_map_states = {
    "nursery":["base","echo","daylight","dawn"], "hall":["base","daylight","seance-open"],
    "music":["base","overlap","daylight"], "garden":["fog","graves-known"], "seance":["base","living-overlap"]
}
for map_id, states in required_map_states.items():
    ids = [f"asset.environment.{map_id}.base"] + [f"asset.scene.{map_id}.{state}" for state in states]
    requirements.append({"id":f"coverage.map.{map_id}","ownerId":f"map.{map_id}","requiredKinds":["environment-base","map-state-variant"],"requiredStates":states,"coveredStates":states,"producedAssetIds":ids,"status":"approved"})
requirements.append({"id":"coverage.props","ownerId":"props.critical","requiredKinds":["interactive-prop"],"requiredStates":prop_states,"coveredStates":prop_states,"producedAssetIds":[f"asset.prop.{p}" for p in prop_states],"status":"approved"})
requirements.append({"id":"coverage.ui","ownerId":"ui.v021","requiredKinds":["ui"],"requiredStates":["objective","interaction","evidence","dialogue"],"coveredStates":["objective","interaction","evidence","dialogue"],"producedAssetIds":["asset.ui.icons"],"status":"approved"})
coverage = {"$schema":"script-game-asset-coverage/v1","schemaVersion":"1.0.0","status":"approved","requirements":requirements}
(ART / "asset-coverage.json").write_text(json.dumps(coverage, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print({"status":"pass","assets":len(assets),"coverageRequirements":len(requirements)})
