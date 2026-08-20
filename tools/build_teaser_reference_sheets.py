#!/usr/bin/env python3
"""Construit les deux planches d'identité utilisées par le teaser ImageGen."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "reference" / "teaser"
CELL = (512, 640)
LABEL = 54


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        Path("C:/Windows/Fonts/georgia.ttf"),
        Path("C:/Windows/Fonts/times.ttf"),
    ]
    for candidate in candidates:
        if candidate.is_file():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


def sheet(rows: list[tuple[str, Path]], columns: int, target: Path) -> None:
    lines = (len(rows) + columns - 1) // columns
    canvas = Image.new("RGB", (columns * CELL[0], lines * (CELL[1] + LABEL)), "#1b1d20")
    draw = ImageDraw.Draw(canvas)
    label_font = font(28)
    for index, (name, path) in enumerate(rows):
        x = (index % columns) * CELL[0]
        y = (index // columns) * (CELL[1] + LABEL)
        with Image.open(path) as source:
            portrait = ImageOps.fit(source.convert("RGB"), CELL, Image.Resampling.LANCZOS)
        canvas.paste(portrait, (x, y))
        box = draw.textbbox((0, 0), name, font=label_font)
        tx = x + (CELL[0] - (box[2] - box[0])) // 2
        draw.text((tx, y + CELL[1] + 9), name, font=label_font, fill="#f2dfb5")
    target.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(target, "PNG", optimize=True)


def main() -> None:
    portraits = ROOT / "apps" / "client" / "public" / "img" / "portraits"
    creatures = ROOT / "docs" / "reference" / "creatures" / "vague3"
    sheet(
        [
            ("THIBAUT", portraits / "thibaut.webp"),
            ("PAUL", portraits / "paul.webp"),
            ("CLOTILDE", portraits / "clotilde.webp"),
            ("LOIC", portraits / "loic.webp"),
            ("MATTHIEU", portraits / "matthieu.webp"),
        ],
        3,
        OUT / "heroes-reference.png",
    )
    sheet(
        [
            ("GRIFFON DE PAMOLE", creatures / "griffon_pamole.webp"),
            ("VOUIVRE DE LA DUROLLE", creatures / "vouivre_durolle.webp"),
            ("SANGLIER CUIRASSE", creatures / "sanglier_cuirasse.webp"),
            ("COLOSSE DE GRANITE", creatures / "colosse_granite.webp"),
        ],
        2,
        OUT / "creatures-reference.png",
    )
    print(OUT)


if __name__ == "__main__":
    main()
