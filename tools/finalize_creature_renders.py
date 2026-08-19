#!/usr/bin/env python3
"""Normalise les rendus ImageGen des créatures en WebP RGBA 1024 px."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def resize_premultiplied(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Rééchantillonne les bords alpha sans halo RVB."""
    return image.convert("RGBa").resize(size, Image.Resampling.LANCZOS).convert("RGBA")


def normalise(image: Image.Image, width: int, height: int, key: str) -> Image.Image:
    if image.mode != "RGBA":
        raise ValueError(f"{key}: source sans vrai canal alpha ({image.mode})")
    alpha = image.getchannel("A")
    alpha_min, alpha_max = alpha.getextrema()
    if alpha_min != 0 or alpha_max < 250:
        raise ValueError(f"{key}: plage alpha invalide {(alpha_min, alpha_max)}")

    # Le seuil ignore les poussières quasi invisibles laissées aux bords par ImageGen.
    bbox = alpha.point(lambda value: 255 if value > 12 else 0).getbbox()
    if bbox is None:
        raise ValueError(f"{key}: silhouette alpha vide")
    subject = image.crop(bbox)
    max_w, max_h = round(width * 0.93), round(height * 0.93)
    scale = min(max_w / subject.width, max_h / subject.height)
    target_size = (
        max(1, round(subject.width * scale)),
        max(1, round(subject.height * scale)),
    )
    subject = resize_premultiplied(subject, target_size)
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    x = round((width - subject.width) / 2)
    ground_y = round(height * 0.965)
    y = max(0, min(height - subject.height, ground_y - subject.height))
    canvas.alpha_composite(subject, (x, y))
    return canvas


def generation_ids(attempts: list[dict]) -> list[str]:
    return list(dict.fromkeys(attempt["generationId"] for attempt in attempts))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--specs", required=True, type=Path)
    parser.add_argument("--results", required=True, type=Path)
    parser.add_argument("--root", default=Path.cwd(), type=Path)
    args = parser.parse_args()

    root = args.root.resolve()
    specs = json.loads(args.specs.read_text(encoding="utf-8"))
    results_list = json.loads(args.results.read_text(encoding="utf-8"))
    results = {row["key"]: row for row in results_list}
    if len(specs) != 28 or len(results_list) != 28 or len(results) != 28:
        raise SystemExit(
            f"inventaire incomplet: specs={len(specs)}, résultats={len(results_list)}, "
            f"uniques={len(results)}"
        )

    trace = []
    for spec in specs:
        key = spec["key"]
        result = results.get(key)
        if result is None:
            raise ValueError(f"résultat absent: {key}")
        source = Path(result["finalPath"])
        if not source.is_file():
            raise FileNotFoundError(source)
        with Image.open(source) as original:
            final = normalise(original, spec["width"], spec["height"], key)

        target = root / spec["file"]
        target.parent.mkdir(parents=True, exist_ok=True)
        final.save(target, "WEBP", quality=82, method=6, exact=True)
        with Image.open(target) as check:
            if check.size != (spec["width"], spec["height"]) or check.mode != "RGBA":
                raise ValueError(f"{key}: WebP final invalide {check.mode} {check.size}")
            extrema = check.getchannel("A").getextrema()
            if extrema[0] != 0 or extrema[1] < 250:
                raise ValueError(f"{key}: alpha WebP invalide {extrema}")

        trace.append(
            {
                "clef": key,
                "id": spec["id"],
                "fichier": spec["file"],
                "referenceSource": spec["sourceReference"],
                "categorie": spec["category"],
                "largeur": spec["width"],
                "hauteur": spec["height"],
                "rang": spec["tier"],
                "amelioree": spec["upgraded"],
                "invite": spec["prompt"],
                "generationId": result["originalGenerationId"],
                "generationIdFinal": result["finalGenerationId"],
                "generationIdsExtractionAlpha": generation_ids(result["alphaAttempts"]),
                "generationIdsRegeneration": generation_ids(result["regenerationAttempts"]),
                "octets": target.stat().st_size,
                "sha256": sha256(target),
                "outil": "ImageGen built-in",
            }
        )

    trace_path = root / "docs" / "reference" / "IMAGEGEN-CREATURE-RENDERS-TRACE.json"
    trace_path.write_text(
        json.dumps(
            {
                "version": "1.0.0-imagegen-2026-08-19",
                "note": (
                    "ImageGen intégré n'expose pas de graine numérique. Les identifiants "
                    "de génération, régénération et extraction alpha sont conservés sans "
                    "prétendre à une reproduction bit-à-bit."
                ),
                "entrees": trace,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"finalized": len(trace), "bytes": sum(row["octets"] for row in trace)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
