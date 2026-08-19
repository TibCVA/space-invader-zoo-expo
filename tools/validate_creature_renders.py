#!/usr/bin/env python3
"""Valide les dimensions et l'alpha effectif des rendus de créatures."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
TRACE = ROOT / "docs" / "reference" / "IMAGEGEN-CREATURE-RENDERS-TRACE.json"


def main() -> None:
    entries = json.loads(TRACE.read_text(encoding="utf-8"))["entrees"]
    if len(entries) != 28 or len({row["clef"] for row in entries}) != 28:
        raise ValueError("trace de rendus incomplète ou dupliquée")
    bytes_total = 0
    for row in entries:
        target = ROOT / row["fichier"]
        with Image.open(target) as image:
            if image.format != "WEBP" or image.mode != "RGBA" or image.size != (1024, 1024):
                raise ValueError(f"{row['clef']}: {image.format} {image.mode} {image.size}")
            alpha_min, alpha_max = image.getchannel("A").getextrema()
            if alpha_min != 0 or alpha_max < 250:
                raise ValueError(f"{row['clef']}: alpha {(alpha_min, alpha_max)}")
        bytes_total += target.stat().st_size
    print(json.dumps({"renders": len(entries), "bytes": bytes_total, "errors": []}))


if __name__ == "__main__":
    main()
