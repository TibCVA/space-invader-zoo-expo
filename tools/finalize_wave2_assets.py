#!/usr/bin/env python3
"""Finalise les sources ImageGen de la vague 2 en WebP contractuels."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

from PIL import Image, ImageOps


TRANSPARENT_PREFIXES = ("bati_", "carte_", "ressource_", "prop_")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def occupancy(key: str) -> float:
    dwelling = re.search(r"_demeure_([1-7])$", key)
    if dwelling:
        return 0.58 + int(dwelling.group(1)) * 0.055
    guild = re.search(r"bati_guilde_([1-5])$", key)
    if guild:
        return 0.50 + int(guild.group(1)) * 0.075
    if "capitole" in key:
        return 0.97
    if key in {
        "bati_palissade",
        "bati_rempart",
        "bati_tours",
        "bati_granit_porte_farges",
        "bati_ermitage_mur_racines",
    }:
        return 0.94
    if key.startswith("bati_"):
        return 0.82
    return 0.90


def resize_premultiplied(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Rééchantillonne les bords alpha sans halo de couleur."""
    premultiplied = image.convert("RGBa")
    resized = premultiplied.resize(size, Image.Resampling.LANCZOS)
    return resized.convert("RGBA")


def place_transparent(image: Image.Image, width: int, height: int, key: str) -> Image.Image:
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    if alpha.getextrema()[0] >= 255:
        raise ValueError(f"{key}: canal alpha opaque")
    bbox = alpha.point(lambda value: 255 if value > 2 else 0).getbbox()
    if bbox is None:
        raise ValueError(f"{key}: alpha vide")
    subject = rgba.crop(bbox)

    if key.startswith("bati_"):
        max_w = width * occupancy(key)
        max_h = height * (0.88 if "capitole" not in key else 0.96)
        bottom = round(height * 0.97)
    elif key.startswith(("carte_", "ressource_")):
        max_w = width * 0.90
        max_h = height * 0.84
        bottom = round(height * 0.96)
    else:
        max_w = width * 0.92
        max_h = height * 0.92
        bottom = round(height * 0.98)

    scale = min(max_w / subject.width, max_h / subject.height)
    new_size = (
        max(1, round(subject.width * scale)),
        max(1, round(subject.height * scale)),
    )
    subject = resize_premultiplied(subject, new_size)
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    x = round((width - subject.width) / 2)
    y = min(height - subject.height, bottom - subject.height)
    canvas.alpha_composite(subject, (x, max(0, y)))
    return canvas


def finalize_opaque(image: Image.Image, width: int, height: int) -> Image.Image:
    return ImageOps.fit(
        image.convert("RGB"),
        (width, height),
        method=Image.Resampling.LANCZOS,
        centering=(0.5, 0.5),
    )


def target_for(root: Path, spec: dict) -> Path:
    file = spec["file"]
    if file.startswith("docs/"):
        return root / file
    return root / "apps" / "client" / "public" / "img" / file


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--specs", required=True, type=Path)
    parser.add_argument("--results", required=True, type=Path)
    parser.add_argument("--root", default=Path.cwd(), type=Path)
    args = parser.parse_args()

    root = args.root.resolve()
    specs = json.loads(args.specs.read_text(encoding="utf-8"))
    results = {
        row["key"]: row for row in json.loads(args.results.read_text(encoding="utf-8"))
    }
    if len(specs) != 152 or len(results) != 152:
        raise SystemExit(f"inventaire incomplet: specs={len(specs)}, résultats={len(results)}")

    trace = []
    for spec in specs:
        key = spec["key"]
        result = results.get(key)
        if result is None:
            raise ValueError(f"résultat absent: {key}")
        source = Path(result["source"])
        if not source.is_file():
            raise FileNotFoundError(source)
        with Image.open(source) as original:
            if key.startswith(TRANSPARENT_PREFIXES):
                final = place_transparent(original, spec["width"], spec["height"], key)
            else:
                final = finalize_opaque(original, spec["width"], spec["height"])

        target = target_for(root, spec)
        target.parent.mkdir(parents=True, exist_ok=True)
        final.save(target, "WEBP", quality=82, method=6, exact=True)
        with Image.open(target) as check:
            if check.size != (spec["width"], spec["height"]):
                raise ValueError(f"{key}: dimensions finales invalides {check.size}")
            if key.startswith(TRANSPARENT_PREFIXES) and check.mode != "RGBA":
                raise ValueError(f"{key}: WebP final sans alpha ({check.mode})")

        trace.append(
            {
                "clef": key,
                "fichier": spec["file"],
                "categorie": spec["category"],
                "largeur": spec["width"],
                "hauteur": spec["height"],
                "invite": spec["prompt"],
                "generationId": result.get("originalGenerationId", result.get("generationId")),
                **(
                    {"generationIdExtractionAlpha": result["alphaGenerationId"]}
                    if result.get("alphaGenerationId")
                    else {}
                ),
                "octets": target.stat().st_size,
                "sha256": sha256(target),
                "outil": "ImageGen built-in",
            }
        )

    trace_path = root / "docs" / "reference" / "IMAGEGEN-WAVE2-TRACE.json"
    trace_path.parent.mkdir(parents=True, exist_ok=True)
    trace_path.write_text(
        json.dumps(
            {
                "version": "2.0.0-imagegen-2026-08-19",
                "note": (
                    "ImageGen intégré n'expose pas de graine numérique. Les identifiants de "
                    "génération et, le cas échéant, d'extraction alpha sont conservés sans "
                    "prétendre à une régénération bit-à-bit."
                ),
                "entrees": trace,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "finalized": len(trace),
                "public": sum(1 for row in trace if not row["fichier"].startswith("docs/")),
                "references": sum(1 for row in trace if row["fichier"].startswith("docs/")),
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
