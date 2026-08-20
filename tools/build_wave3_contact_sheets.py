#!/usr/bin/env python3
"""Construit les planches de contrôle visuel de la vague ImageGen 3."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "apps" / "client" / "public" / "img"
OUT = ROOT / "docs" / "reference" / "wave3"
FONT = ImageFont.load_default()


def path_for(entry: dict) -> Path:
    return ROOT / entry["fichier"] if entry["fichier"].startswith("docs/") else PUBLIC / entry["fichier"]


def backdrop(width: int, height: int) -> Image.Image:
    image = Image.new("RGB", (width, height), "#E8DCC0")
    draw = ImageDraw.Draw(image)
    draw.rectangle((width // 3, 0, 2 * width // 3, height), fill="#2B3A4A")
    draw.rectangle((2 * width // 3, 0, width, height), fill="#6E1F2A")
    return image


def alpha_contact(entries: list[dict], name: str, columns: int, cell: int) -> None:
    label_h = 24
    rows = (len(entries) + columns - 1) // columns
    sheet = Image.new("RGB", (columns * cell, rows * (cell + label_h)), "#241C14")
    draw = ImageDraw.Draw(sheet)
    for index, entry in enumerate(entries):
        col, row = index % columns, index // columns
        x, y = col * cell, row * (cell + label_h)
        panel = backdrop(cell, cell)
        with Image.open(path_for(entry)) as source:
            asset = ImageOps.contain(source.convert("RGBA"), (cell - 8, cell - 8), Image.Resampling.LANCZOS)
        panel.paste(asset, ((cell - asset.width) // 2, (cell - asset.height) // 2), asset)
        sheet.paste(panel, (x, y))
        draw.rectangle((x, y + cell, x + cell, y + cell + label_h), fill="#241C14")
        draw.text((x + 4, y + cell + 6), entry["clef"], font=FONT, fill="#E8DCC0")
    OUT.mkdir(parents=True, exist_ok=True)
    sheet.save(OUT / name, "WEBP", quality=88, method=6)


def terrain_contact(entries: list[dict]) -> None:
    cell = 320
    label_h = 24
    sheet = Image.new("RGB", (cell * 4, (cell + label_h) * 3), "#241C14")
    draw = ImageDraw.Draw(sheet)
    for index, entry in enumerate(entries):
        x, y = (index % 4) * cell, (index // 4) * (cell + label_h)
        with Image.open(path_for(entry)) as source:
            tile = source.convert("RGB").resize((cell // 2, cell // 2), Image.Resampling.LANCZOS)
        repeat = Image.new("RGB", (cell, cell))
        for ty in (0, cell // 2):
            for tx in (0, cell // 2):
                repeat.paste(tile, (tx, ty))
        sheet.paste(repeat, (x, y))
        draw.rectangle((x, y + cell, x + cell, y + cell + label_h), fill="#241C14")
        draw.text((x + 4, y + cell + 6), f"{entry['clef']} · RMSE {entry['raccordRmse']}", font=FONT, fill="#E8DCC0")
    OUT.mkdir(parents=True, exist_ok=True)
    sheet.save(OUT / "terrains-contact.webp", "WEBP", quality=88, method=6)


def opaque_contact(entries: list[dict], name: str, columns: int, width: int, height: int) -> None:
    label_h = 24
    rows = (len(entries) + columns - 1) // columns
    sheet = Image.new("RGB", (columns * width, rows * (height + label_h)), "#241C14")
    draw = ImageDraw.Draw(sheet)
    for index, entry in enumerate(entries):
        x, y = (index % columns) * width, (index // columns) * (height + label_h)
        with Image.open(path_for(entry)) as source:
            image = ImageOps.fit(source.convert("RGB"), (width, height), Image.Resampling.LANCZOS)
        sheet.paste(image, (x, y))
        draw.rectangle((x, y + height, x + width, y + height + label_h), fill="#241C14")
        draw.text((x + 4, y + height + 6), entry["clef"], font=FONT, fill="#E8DCC0")
    OUT.mkdir(parents=True, exist_ok=True)
    sheet.save(OUT / name, "WEBP", quality=88, method=6)


def main() -> None:
    trace = json.loads(
        (ROOT / "docs" / "reference" / "IMAGEGEN-WAVE3-TRACE.json").read_text(encoding="utf-8")
    )["entrees"]
    terrain = [row for row in trace if row["famille"] == "terrain"]
    decor = [row for row in trace if row["famille"] == "decor"]
    icons = [row for row in trace if row["famille"] == "map-icon"]
    battle = [row for row in trace if row["famille"] == "battle"]
    references = [row for row in trace if row["famille"] == "creature-reference"]
    terrain_contact(terrain)
    alpha_contact(decor, "decor-contact.webp", 8, 180)
    alpha_contact(icons, "lieux-contact.webp", 7, 220)
    opaque_contact(battle, "combats-contact.webp", 2, 512, 320)
    alpha_contact(references, "creatures-reference-contact.webp", 4, 320)
    print(json.dumps({
        "terrain": len(terrain), "decor": len(decor), "icons": len(icons),
        "battle": len(battle), "references": len(references),
    }))


if __name__ == "__main__":
    main()
