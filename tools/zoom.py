#!/usr/bin/env python3
"""Recadre et agrandit une capture, pour juger un detail a l'oeil."""
import sys
from PIL import Image
src, out, x, y, w, h, z = sys.argv[1], sys.argv[2], *map(float, sys.argv[3:8])
im = Image.open(src).convert('RGB')
box = (int(x), int(y), int(x + w), int(y + h))
im.crop(box).resize((int(w * z), int(h * z)), Image.LANCZOS).save(out)
print('ok', out, box)
