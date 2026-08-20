#!/usr/bin/env python3
"""Finalise les 99 sources ImageGen de la vague 3 en WebP contractuels."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter, ImageOps


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def resize_premultiplied(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    return image.convert("RGBa").resize(size, Image.Resampling.LANCZOS).convert("RGBA")


def periodic_axis(image: Image.Image, band: int, horizontal: bool) -> Image.Image:
    """Raccorde une paire de bords par moyenne symétrique et fondu progressif."""
    width, height = image.size
    if horizontal:
        first = image.crop((0, 0, band, height))
        last = image.crop((width - band, 0, width, height)).transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        average = Image.blend(first, last, 0.5).filter(ImageFilter.GaussianBlur(1.5))
        mask = Image.new("L", (band, height))
        px = mask.load()
        for x in range(band):
            # Conserver un bloc WebP complet strictement symetrique au bord :
            # le codec ne peut ainsi recreer une couture par prediction locale.
            raw = x / max(1, band - 1)
            t = max(0.0, (raw - 0.5) / 0.5)
            smooth = t * t * (3 - 2 * t)
            value = round(255 * smooth)
            for y in range(height):
                px[x, y] = value
        first_new = Image.composite(first, average, mask)
        last_new = Image.composite(last, average, mask).transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        image.paste(first_new, (0, 0))
        image.paste(last_new, (width - band, 0))
    else:
        first = image.crop((0, 0, width, band))
        last = image.crop((0, height - band, width, height)).transpose(Image.Transpose.FLIP_TOP_BOTTOM)
        average = Image.blend(first, last, 0.5).filter(ImageFilter.GaussianBlur(1.5))
        mask = Image.new("L", (width, band))
        px = mask.load()
        for y in range(band):
            raw = y / max(1, band - 1)
            t = max(0.0, (raw - 0.5) / 0.5)
            smooth = t * t * (3 - 2 * t)
            value = round(255 * smooth)
            for x in range(width):
                px[x, y] = value
        first_new = Image.composite(first, average, mask)
        last_new = Image.composite(last, average, mask).transpose(Image.Transpose.FLIP_TOP_BOTTOM)
        image.paste(first_new, (0, 0))
        image.paste(last_new, (0, height - band))
    return image


def make_tile(image: Image.Image, width: int, height: int) -> Image.Image:
    tile = ImageOps.fit(
        image.convert("RGB"),
        (width, height),
        method=Image.Resampling.LANCZOS,
        centering=(0.5, 0.5),
    )
    tile = periodic_axis(tile, 64, True)
    tile = periodic_axis(tile, 64, False)
    return tile


def place_alpha(image: Image.Image, width: int, height: int, family: str, key: str) -> Image.Image:
    if image.mode != "RGBA":
        raise ValueError(f"{key}: source sans vrai canal alpha ({image.mode})")
    alpha = image.getchannel("A")
    alpha_min, alpha_max = alpha.getextrema()
    if alpha_min != 0 or alpha_max < 250:
        raise ValueError(f"{key}: plage alpha invalide {(alpha_min, alpha_max)}")
    bbox = alpha.point(lambda value: 255 if value > 12 else 0).getbbox()
    if bbox is None:
        raise ValueError(f"{key}: silhouette alpha vide")
    subject = image.crop(bbox)

    if family in {"decor", "map-icon"}:
        max_w, max_h = width - 4, height - 2
        bottom = height
    else:
        max_w, max_h = round(width * 0.94), round(height * 0.94)
        bottom = round(height * 0.97)
    scale = min(max_w / subject.width, max_h / subject.height)
    size = (max(1, round(subject.width * scale)), max(1, round(subject.height * scale)))
    subject = resize_premultiplied(subject, size)
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    x = round((width - subject.width) / 2)
    y = max(0, min(height - subject.height, bottom - subject.height))
    canvas.alpha_composite(subject, (x, y))
    return canvas


def seam_rmse(image: Image.Image) -> float:
    rgb = image.convert("RGB")
    left = rgb.crop((0, 0, 1, rgb.height))
    right = rgb.crop((rgb.width - 1, 0, rgb.width, rgb.height))
    top = rgb.crop((0, 0, rgb.width, 1))
    bottom = rgb.crop((0, rgb.height - 1, rgb.width, rgb.height))
    sq = 0.0
    count = 0
    for diff in (ImageChops.difference(left, right), ImageChops.difference(top, bottom)):
        histogram = diff.histogram()
        for value in range(256):
            for channel in range(3):
                frequency = histogram[channel * 256 + value]
                sq += frequency * value * value
                count += frequency
    return math.sqrt(sq / max(1, count))


def generation_ids(attempts: list[dict]) -> list[str]:
    return list(dict.fromkeys(attempt["generationId"] for attempt in attempts))


def target_for(root: Path, spec: dict) -> Path:
    if spec["file"].startswith("docs/"):
        return root / spec["file"]
    return root / "apps" / "client" / "public" / "img" / spec["file"]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--specs", required=True, type=Path)
    parser.add_argument("--results", required=True, type=Path)
    parser.add_argument("--root", default=Path.cwd(), type=Path)
    args = parser.parse_args()

    root = args.root.resolve()
    specs = json.loads(args.specs.read_text(encoding="utf-8"))
    result_list = json.loads(args.results.read_text(encoding="utf-8"))
    results = {row["key"]: row for row in result_list}
    if len(specs) != 99 or len(result_list) != 99 or len(results) != 99:
        raise SystemExit(
            f"inventaire incomplet: specs={len(specs)}, résultats={len(result_list)}, uniques={len(results)}"
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
            if spec["family"] == "terrain":
                final = make_tile(original, spec["width"], spec["height"])
            elif spec["alpha"]:
                final = place_alpha(original, spec["width"], spec["height"], spec["family"], key)
            else:
                final = ImageOps.fit(
                    original.convert("RGB"),
                    (spec["width"], spec["height"]),
                    method=Image.Resampling.LANCZOS,
                    centering=(0.5, 0.5),
                )

        target = target_for(root, spec)
        target.parent.mkdir(parents=True, exist_ok=True)
        final.save(target, "WEBP", quality=82, method=6, exact=True)
        with Image.open(target) as check:
            if check.size != (spec["width"], spec["height"]):
                raise ValueError(f"{key}: dimensions finales invalides {check.size}")
            if spec["alpha"] and check.mode != "RGBA":
                raise ValueError(f"{key}: WebP sans alpha ({check.mode})")
            decoded_rmse = seam_rmse(check) if spec["repeatable"] else None

        trace.append(
            {
                "clef": key,
                "id": spec["id"],
                "fichier": spec["file"],
                "categorie": spec["category"],
                "famille": spec["family"],
                "largeur": spec["width"],
                "hauteur": spec["height"],
                "alpha": spec["alpha"],
                "repetable": spec["repeatable"],
                **(
                    {"referenceSource": spec["sourceReference"]}
                    if spec.get("sourceReference")
                    else {}
                ),
                "invite": spec["prompt"],
                "generationId": result["originalGenerationId"],
                "generationIdFinal": result["finalGenerationId"],
                "generationIdsExtractionAlpha": generation_ids(result["alphaAttempts"]),
                "generationIdsRegeneration": generation_ids(result["regenerationAttempts"]),
                **({"raccordRmse": round(decoded_rmse, 4)} if decoded_rmse is not None else {}),
                "octets": target.stat().st_size,
                "sha256": sha256(target),
                "outil": "ImageGen built-in",
            }
        )

    trace_path = root / "docs" / "reference" / "IMAGEGEN-WAVE3-TRACE.json"
    trace_path.write_text(
        json.dumps(
            {
                "version": "3.0.0-imagegen-2026-08-20",
                "note": (
                    "ImageGen intégré n'expose pas de graine numérique. Les invites canoniques, "
                    "identifiants de génération, extractions alpha, octets et SHA-256 sont conservés "
                    "sans prétendre à une reproduction bit-à-bit."
                ),
                "entrees": trace,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    public = [row for row in trace if not row["fichier"].startswith("docs/")]
    print(
        json.dumps(
            {
                "finalized": len(trace),
                "public": len(public),
                "references": len(trace) - len(public),
                "publicBytesWave3": sum(row["octets"] for row in public),
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
