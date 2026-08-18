#!/usr/bin/env python3
"""Prepare an ImageGen texture as a contract-compliant seamless WebP tile.

The model is asked for a periodic texture, but this final pass makes the outer
pixels converge smoothly so GPU repeat sampling cannot expose a hard seam.
Only a narrow border is blended; the generated centre remains untouched.
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

from PIL import Image, ImageOps


def _smoothstep(value: float) -> float:
    return value * value * (3.0 - 2.0 * value)


def _blend_opposite_edges(image: Image.Image, band: int) -> Image.Image:
    result = image.copy()
    width, height = result.size

    for distance in range(band):
        # Weight is one at the repeat boundary and zero at the inner edge.
        t = distance / max(1, band - 1)
        weight = _smoothstep(1.0 - t)
        left = result.crop((distance, 0, distance + 1, height))
        right_x = width - 1 - distance
        right = result.crop((right_x, 0, right_x + 1, height))
        average = Image.blend(left, right, 0.5)
        result.paste(Image.blend(left, average, weight), (distance, 0))
        result.paste(Image.blend(right, average, weight), (right_x, 0))

    for distance in range(band):
        t = distance / max(1, band - 1)
        weight = _smoothstep(1.0 - t)
        top = result.crop((0, distance, width, distance + 1))
        bottom_y = height - 1 - distance
        bottom = result.crop((0, bottom_y, width, bottom_y + 1))
        average = Image.blend(top, bottom, 0.5)
        result.paste(Image.blend(top, average, weight), (0, distance))
        result.paste(Image.blend(bottom, average, weight), (0, bottom_y))

    # Exact outer equality before lossy encoding, including the four corners.
    left = result.crop((0, 0, 1, height))
    right = result.crop((width - 1, 0, width, height))
    average_x = Image.blend(left, right, 0.5)
    result.paste(average_x, (0, 0))
    result.paste(average_x, (width - 1, 0))

    top = result.crop((0, 0, width, 1))
    bottom = result.crop((0, height - 1, width, height))
    average_y = Image.blend(top, bottom, 0.5)
    result.paste(average_y, (0, 0))
    result.paste(average_y, (0, height - 1))
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--size", type=int, default=512)
    parser.add_argument("--band", type=int, default=56)
    parser.add_argument("--quality", type=int, default=82)
    args = parser.parse_args()

    with Image.open(args.input) as source:
        rgb = source.convert("RGB")
        fitted = ImageOps.fit(
            rgb,
            (args.size, args.size),
            method=Image.Resampling.LANCZOS,
            centering=(0.5, 0.5),
        )
    seamless = _blend_opposite_edges(fitted, min(args.band, args.size // 4))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    seamless.save(
        args.output,
        "WEBP",
        quality=args.quality,
        method=6,
        exact=True,
    )


if __name__ == "__main__":
    main()
