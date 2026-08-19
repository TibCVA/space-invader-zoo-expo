#!/usr/bin/env python3
"""Construit les planches de contrôle des 28 rendus individuels."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "reference" / "creatures"
FONT = ImageFont.load_default()


def backdrop(width: int, height: int) -> Image.Image:
    image = Image.new("RGB", (width, height), "#241C14")
    draw = ImageDraw.Draw(image)
    for index, color in enumerate(("#E8DCC0", "#2B3A4A", "#6E1F2A")):
        draw.rectangle(
            (round(index * width / 3), 0, round((index + 1) * width / 3), height),
            fill=color,
        )
    return image


def render_contact(entries: list[dict], target: Path, columns: int, cell: int) -> None:
    label_h = 24
    rows = (len(entries) + columns - 1) // columns
    sheet = Image.new("RGB", (columns * cell, rows * (cell + label_h)), "#241C14")
    draw = ImageDraw.Draw(sheet)
    for index, entry in enumerate(entries):
        col, row = index % columns, index // columns
        x, y = col * cell, row * (cell + label_h)
        panel = backdrop(cell, cell)
        with Image.open(ROOT / entry["fichier"]) as source:
            creature = ImageOps.contain(
                source.convert("RGBA"), (cell - 10, cell - 10), Image.Resampling.LANCZOS
            )
        panel.paste(creature, ((cell - creature.width) // 2, (cell - creature.height) // 2), creature)
        sheet.paste(panel, (x, y))
        draw.rectangle((x, y + cell, x + cell, y + cell + label_h), fill="#241C14")
        draw.text((x + 5, y + cell + 6), entry["id"], font=FONT, fill="#E8DCC0")
    target.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(target, "WEBP", quality=88, method=6)


def main() -> None:
    trace = json.loads(
        (ROOT / "docs" / "reference" / "IMAGEGEN-CREATURE-RENDERS-TRACE.json").read_text(
            encoding="utf-8"
        )
    )["entrees"]
    ordered = sorted(trace, key=lambda row: (0 if row["id"].startswith("granit") else 1, row["rang"], row["amelioree"]))
    legendary = [row for row in ordered if row["rang"] >= 6]
    render_contact(ordered, OUT / "renders-contact.webp", 7, 220)
    render_contact(legendary, OUT / "legendary-contact.webp", 4, 360)
    print(json.dumps({"all": len(ordered), "legendary": len(legendary)}))


if __name__ == "__main__":
    main()
