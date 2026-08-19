#!/usr/bin/env python3
"""Construit les planches de contrôle visuel de la vague ImageGen 2."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "apps" / "client" / "public" / "img"
OUT = ROOT / "docs" / "reference" / "wave2"
FONT = ImageFont.load_default()


def path_for(entry: dict) -> Path:
    file = entry["fichier"]
    return ROOT / file if file.startswith("docs/") else PUBLIC / file


def backdrop(width: int, height: int) -> Image.Image:
    image = Image.new("RGB", (width, height), "#241C14")
    draw = ImageDraw.Draw(image)
    bands = ("#E8DCC0", "#2B3A4A", "#6E1F2A")
    for index, color in enumerate(bands):
        x0 = round(index * width / 3)
        x1 = round((index + 1) * width / 3)
        draw.rectangle((x0, 0, x1, height), fill=color)
    return image


def contact(entries: list[dict], name: str, columns: int, cell: tuple[int, int]) -> None:
    rows = (len(entries) + columns - 1) // columns
    cw, ch = cell
    title_h = 22
    sheet = Image.new("RGB", (columns * cw, rows * (ch + title_h)), "#241C14")
    draw = ImageDraw.Draw(sheet)
    for index, entry in enumerate(entries):
        col, row = index % columns, index // columns
        x, y = col * cw, row * (ch + title_h)
        bg = backdrop(cw, ch)
        with Image.open(path_for(entry)) as source:
            image = ImageOps.contain(source.convert("RGBA"), (cw - 12, ch - 12), Image.Resampling.LANCZOS)
        bg.paste(image, ((cw - image.width) // 2, (ch - image.height) // 2), image)
        sheet.paste(bg, (x, y))
        label = entry["clef"].replace("reference_creature_", "")
        draw.rectangle((x, y + ch, x + cw, y + ch + title_h), fill="#241C14")
        draw.text((x + 4, y + ch + 5), label, font=FONT, fill="#E8DCC0")
    target = OUT / name
    target.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(target, "WEBP", quality=86, method=6)


def city_contact(entries: list[dict]) -> None:
    cell = (216, 384)
    sheet = Image.new("RGB", (cell[0] * 3, (cell[1] + 24) * 2), "#241C14")
    draw = ImageDraw.Draw(sheet)
    ordered = sorted(
        entries,
        key=lambda entry: (
            0 if "granit" in entry["clef"] else 1,
            {"aube": 0, "midi": 1, "crepuscule": 2}.get(
                next((x for x in ("aube", "midi", "crepuscule") if x in entry["clef"]), ""),
                9,
            ),
        ),
    )
    for index, entry in enumerate(ordered):
        col, row = index % 3, index // 3
        x, y = col * cell[0], row * (cell[1] + 24)
        with Image.open(path_for(entry)) as source:
            image = ImageOps.fit(source.convert("RGB"), cell, Image.Resampling.LANCZOS)
        sheet.paste(image, (x, y))
        draw.rectangle((x, y + cell[1], x + cell[0], y + cell[1] + 24), fill="#241C14")
        draw.text((x + 4, y + cell[1] + 6), entry["clef"], font=FONT, fill="#E8DCC0")
    OUT.mkdir(parents=True, exist_ok=True)
    sheet.save(OUT / "cites-portrait-contact.webp", "WEBP", quality=86, method=6)


def main() -> None:
    trace = json.loads(
        (ROOT / "docs" / "reference" / "IMAGEGEN-WAVE2-TRACE.json").read_text(encoding="utf-8")
    )["entrees"]
    buildings = [entry for entry in trace if entry["clef"].startswith("bati_")]
    active = [
        entry
        for entry in trace
        if entry["clef"].startswith(("carte_", "ressource_"))
    ]
    decor = [entry for entry in trace if entry["clef"].startswith("prop_")]
    cities = [entry for entry in trace if entry["clef"].startswith("cite_")]
    creatures = [entry for entry in trace if entry["clef"].startswith("reference_creature_")]

    contact(buildings, "batiments-contact.webp", 8, (170, 170))
    contact(active, "objets-actifs-contact.webp", 8, (132, 132))
    contact(decor, "decor-contact.webp", 8, (150, 188))
    city_contact(cities)
    contact(creatures, "creatures-reference-contact.webp", 7, (196, 196))
    print(
        json.dumps(
            {
                "buildings": len(buildings),
                "active": len(active),
                "decor": len(decor),
                "cities": len(cities),
                "creatures": len(creatures),
            }
        )
    )


if __name__ == "__main__":
    main()
