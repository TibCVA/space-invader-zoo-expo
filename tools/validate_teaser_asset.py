#!/usr/bin/env python3
"""Valide les fichiers et la trace du teaser destiné aux cousins."""

import hashlib
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
TRACE = ROOT / "docs" / "reference" / "teaser" / "IMAGEGEN-TEASER-TRACE.json"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    trace = json.loads(TRACE.read_text(encoding="utf-8"))
    errors: list[str] = []
    for row in trace["fichiers"]:
        path = ROOT / row["fichier"]
        if not path.is_file():
            errors.append(f"absent: {row['fichier']}")
            continue
        if path.stat().st_size != row["octets"]:
            errors.append(f"taille: {row['fichier']}")
        if sha256(path) != row["sha256"]:
            errors.append(f"sha256: {row['fichier']}")
        with Image.open(path) as image:
            if image.size != tuple(trace["dimensions"]):
                errors.append(f"dimensions: {row['fichier']} {image.size}")
            if image.mode != "RGB":
                errors.append(f"mode: {row['fichier']} {image.mode}")
            ratio = image.width / image.height
            if abs(ratio - 16 / 9) > 0.005:
                errors.append(f"ratio: {row['fichier']} {ratio:.4f}")
    for reference in trace["references"]:
        if not (ROOT / reference).is_file():
            errors.append(f"référence absente: {reference}")
    print(
        json.dumps(
            {
                "generationId": trace["generationId"],
                "dimensions": trace["dimensions"],
                "textesExiges": len(trace["texteExige"]),
                "fichiers": len(trace["fichiers"]),
                "errors": errors,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
