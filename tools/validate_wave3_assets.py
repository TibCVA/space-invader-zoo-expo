#!/usr/bin/env python3
"""Valide formats, dimensions, alpha et raccords réels de la vague 3."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "apps" / "client" / "public" / "img"


def seam_rmse(image: Image.Image) -> float:
    rgb = image.convert("RGB")
    diffs = [
        ImageChops.difference(rgb.crop((0, 0, 1, rgb.height)), rgb.crop((rgb.width - 1, 0, rgb.width, rgb.height))),
        ImageChops.difference(rgb.crop((0, 0, rgb.width, 1)), rgb.crop((0, rgb.height - 1, rgb.width, rgb.height))),
    ]
    sq = count = 0
    for diff in diffs:
        histogram = diff.histogram()
        for value in range(256):
            for channel in range(3):
                frequency = histogram[channel * 256 + value]
                sq += frequency * value * value
                count += frequency
    return (sq / max(1, count)) ** 0.5


def main() -> None:
    trace = json.loads(
        (ROOT / "docs" / "reference" / "IMAGEGEN-WAVE3-TRACE.json").read_text(encoding="utf-8")
    )["entrees"]
    if len(trace) != 99 or len({row["clef"] for row in trace}) != 99:
        raise ValueError("trace vague 3 incomplète ou dupliquée")
    errors: list[str] = []
    seams: dict[str, float] = {}
    for row in trace:
        path = ROOT / row["fichier"] if row["fichier"].startswith("docs/") else PUBLIC / row["fichier"]
        with Image.open(path) as image:
            if image.format != "WEBP":
                errors.append(f"{row['clef']}: format {image.format}")
            if image.size != (row["largeur"], row["hauteur"]):
                errors.append(f"{row['clef']}: dimensions {image.size}")
            if row["alpha"]:
                if image.mode != "RGBA":
                    errors.append(f"{row['clef']}: mode {image.mode}")
                else:
                    extrema = image.getchannel("A").getextrema()
                    if extrema[0] != 0 or extrema[1] < 250:
                        errors.append(f"{row['clef']}: alpha {extrema}")
            if row["repetable"]:
                value = seam_rmse(image)
                seams[row["clef"]] = round(value, 4)
                if value > 4:
                    errors.append(f"{row['clef']}: raccord RMSE {value:.4f}")
    print(json.dumps({"assets": len(trace), "seams": seams, "errors": errors}, ensure_ascii=False, indent=2))
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
