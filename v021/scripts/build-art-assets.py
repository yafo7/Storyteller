from pathlib import Path
from PIL import Image, ImageEnhance, ImageOps, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "generated" / "50-art"
SRC = ART / "source"
ASSETS = ROOT / "assets"
SCENES = ASSETS / "scenes"
CHARS = SRC / "characters"
PROPS = SRC / "props"
SCENES.mkdir(parents=True, exist_ok=True)
CHARS.mkdir(parents=True, exist_ok=True)
PROPS.mkdir(parents=True, exist_ok=True)

RESAMPLE = Image.Resampling.NEAREST
character_ids = ["grace", "anne", "nicholas", "mills", "victor", "charles"]
board = Image.open(CHARS / "cast-identity-board.png").convert("RGB")
panel_w = board.width // 6
portrait_tiles = []
for index, character_id in enumerate(character_ids):
    left = index * panel_w
    right = board.width if index == 5 else (index + 1) * panel_w
    panel = board.crop((left, 0, right, board.height))
    panel.save(CHARS / f"{character_id}-identity.png")
    bottom = panel.crop((0, int(panel.height * 0.60), panel.width, panel.height))
    side = min(bottom.width, bottom.height)
    x = (bottom.width - side) // 2
    y = bottom.height - side
    portrait = bottom.crop((x, y, x + side, y + side)).resize((64, 64), RESAMPLE)
    portrait = portrait.quantize(colors=32, method=Image.Quantize.MEDIANCUT).convert("RGB")
    portrait.save(CHARS / f"{character_id}-portrait.png")
    portrait_tiles.append(portrait)

portrait_atlas = Image.new("RGB", (64 * len(portrait_tiles), 64), "#111922")
for index, portrait in enumerate(portrait_tiles):
    portrait_atlas.paste(portrait, (index * 64, 0))
portrait_atlas.save(ASSETS / "portraits.png")

actors = Image.open(ASSETS / "actors.png").convert("RGBA")
for index, character_id in enumerate(character_ids):
    actors.crop((0, index * 24, actors.width, (index + 1) * 24)).save(CHARS / f"{character_id}-sprite.png")

scene_specs = {
    "nursery": (320, 192),
    "hall": (448, 288),
    "music": (320, 224),
    "garden": (384, 288),
    "seance": (320, 224),
}

def pixel_scene(name):
    image = Image.open(SRC / "environments" / f"{name}-base.png").convert("RGB")
    image = ImageOps.fit(image, scene_specs[name], method=RESAMPLE, centering=(0.5, 0.5))
    return image.quantize(colors=48, method=Image.Quantize.MEDIANCUT).convert("RGB")

def tint(image, color, amount, brightness=1.0, contrast=1.0):
    result = ImageEnhance.Brightness(image).enhance(brightness)
    result = ImageEnhance.Contrast(result).enhance(contrast)
    overlay = Image.new("RGB", result.size, color)
    return Image.blend(result, overlay, amount).quantize(colors=48, method=Image.Quantize.MEDIANCUT).convert("RGB")

bases = {name: pixel_scene(name) for name in scene_specs}
for name, image in bases.items():
    image.save(SCENES / f"{name}-base.png")

tint(bases["nursery"], "#66516f", .24, .93, 1.08).save(SCENES / "nursery-echo.png")
tint(bases["nursery"], "#e2b55f", .20, 1.16, 1.05).save(SCENES / "nursery-daylight.png")
tint(bases["nursery"], "#f2d58b", .28, 1.28, 1.03).save(SCENES / "nursery-dawn.png")
tint(bases["hall"], "#d9ae61", .20, 1.15, 1.04).save(SCENES / "hall-daylight.png")
tint(bases["hall"], "#aa7b62", .19, 1.11, 1.10).save(SCENES / "hall-seance-open.png")
tint(bases["music"], "#6b4b76", .25, .94, 1.10).save(SCENES / "music-overlap.png")
tint(bases["music"], "#d6aa58", .18, 1.12, 1.05).save(SCENES / "music-daylight.png")
tint(bases["garden"], "#607879", .13, .95, .94).save(SCENES / "garden-fog.png")
tint(bases["garden"], "#a58a5c", .15, 1.15, 1.12).save(SCENES / "garden-graves-known.png")
tint(bases["seance"], "#6c4c73", .22, .96, 1.09).save(SCENES / "seance-base.png")
tint(bases["seance"], "#bd855d", .23, 1.14, 1.13).save(SCENES / "seance-living-overlap.png")

prop_names = ["curtain-closed", "curtain-open", "letter", "piano", "album", "grave-unread", "grave-read", "seance-empty", "seance-complete"]
prop_board = Image.open(PROPS / "interaction-prop-board.png").convert("RGB")
cell_w, cell_h = prop_board.width // 3, prop_board.height // 3
prop_tiles = []
for index, name in enumerate(prop_names):
    col, row = index % 3, index // 3
    cell = prop_board.crop((col * cell_w, row * cell_h, (col + 1) * cell_w, (row + 1) * cell_h))
    pad = max(3, min(cell.width, cell.height) // 80)
    cell = cell.crop((pad, pad, cell.width - pad, cell.height - pad))
    cell.save(PROPS / f"{name}.png")
    tile = ImageOps.fit(cell, (32, 32), method=RESAMPLE).quantize(colors=32, method=Image.Quantize.MEDIANCUT).convert("RGB")
    prop_tiles.append(tile)

prop_atlas = Image.new("RGB", (32 * len(prop_tiles), 32), "#111922")
for index, prop in enumerate(prop_tiles):
    prop_atlas.paste(prop, (index * 32, 0))
prop_atlas.save(ASSETS / "props.png")

contact = Image.new("RGB", (1280, 900), "#090c10")
draw = ImageDraw.Draw(contact)
anchor = Image.open(ART / "style-anchor.png").convert("RGB")
contact.paste(ImageOps.fit(anchor, (480, 320), method=RESAMPLE), (20, 45))
draw.text((20, 18), "APPROVED STYLE ANCHOR", fill="#e4b55a")
identity_thumb = ImageOps.fit(board, (740, 370), method=RESAMPLE)
contact.paste(identity_thumb, (520, 45)); draw.text((520, 18), "CHARACTER IDENTITY SOURCES", fill="#e4b55a")
positions = [(20, 420), (270, 420), (520, 420), (770, 420), (1020, 420)]
for (name, image), (x, y) in zip(bases.items(), positions):
    contact.paste(ImageOps.fit(image, (230, 160), method=RESAMPLE), (x, y)); draw.text((x, y - 18), name.upper(), fill="#d9cda9")
contact.paste(ImageOps.fit(prop_board, (380, 280), method=RESAMPLE), (20, 610)); draw.text((20, 590), "INTERACTIVE PROP STATES", fill="#e4b55a")
contact.paste(portrait_atlas.resize((768, 128), RESAMPLE), (450, 640)); draw.text((450, 610), "INDIVIDUAL PORTRAITS -> RUNTIME ATLAS", fill="#e4b55a")
contact.save(ART / "visual-contact-sheet.png")

print({"status":"pass","characters":6,"sceneBases":5,"sceneVariants":11,"propStates":9,"contactSheet":"generated/50-art/visual-contact-sheet.png"})
