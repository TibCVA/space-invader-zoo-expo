#!/usr/bin/env python3
"""Validate generated WebP files against the public image manifest."""

from __future__ import annotations

import json
import hashlib
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
IMAGE_ROOT = ROOT / "apps" / "client" / "public" / "img"


def main() -> None:
    manifest = json.loads((IMAGE_ROOT / "manifeste.json").read_text(encoding="utf-8"))
    entries = manifest["entrees"]
    errors: list[str] = []
    total = 0

    keys = [entry["clef"] for entry in entries]
    if len(keys) != len(set(keys)):
        errors.append("duplicate manifest keys")

    for entry in entries:
        path = IMAGE_ROOT / entry["fichier"]
        if not path.is_file():
            errors.append(f"missing: {entry['fichier']}")
            continue
        size = path.stat().st_size
        total += size
        if size != entry.get("octets"):
            errors.append(f"byte count: {entry['fichier']} ({size} != {entry.get('octets')})")
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != entry.get("sha256"):
            errors.append(f"sha256: {entry['fichier']} ({digest} != {entry.get('sha256')})")
        with Image.open(path) as image:
            expected = (entry["largeur"], entry["hauteur"])
            if image.format != "WEBP":
                errors.append(f"format: {entry['fichier']} ({image.format})")
            if image.size != expected:
                errors.append(f"dimensions: {entry['fichier']} ({image.size} != {expected})")
            if image.mode not in {"RGB", "RGBA"}:
                errors.append(f"mode: {entry['fichier']} ({image.mode})")
            if entry["categorie"] == "prop":
                if image.mode != "RGBA":
                    errors.append(f"alpha mode: {entry['fichier']} ({image.mode})")
                elif image.getchannel("A").getextrema()[0] >= 255:
                    errors.append(f"opaque alpha: {entry['fichier']}")

    budget = manifest["budgetOctets"]
    if total > budget:
        errors.append(f"budget exceeded: {total} > {budget}")

    report = {
        "entries": len(entries),
        "uniqueKeys": len(set(keys)),
        "repeatable": sum(bool(entry.get("repetable")) for entry in entries),
        "bytes": total,
        "budget": budget,
        "errors": errors,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
