#!/usr/bin/env python3
"""绿幕抠图：sprites/raw/*-green.png → sprites/*.png（透明底雪碧图）

用法: .venv/bin/python tools/chroma_key.py [名字...]   # 不带参数=全部
判定: 绿色显著高于红蓝 → 全透明；边缘半绿 → 按比例降 alpha 并去绿(despill)。
"""
import sys
from pathlib import Path

from PIL import Image

RAW = Path(__file__).resolve().parents[1] / "backend/static/assets/sprites/raw"
OUT = RAW.parent


def key_one(src: Path, dst: Path) -> None:
    img = Image.open(src).convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if g > 90 and g > r * 1.35 and g > b * 1.35:
                px[x, y] = (0, 0, 0, 0)                       # 纯绿背景
            elif g > 70 and g > r * 1.12 and g > b * 1.12:
                spill = max(r, b)                              # 边缘半绿：去绿+半透明
                ratio = (g - spill) / max(g, 1)
                px[x, y] = (r, spill, b, max(0, int(a * (1 - ratio * 1.6))))
            elif g > max(r, b):
                px[x, y] = (r, max(r, b), b, a)                # 轻微溢色：只压绿
    img.save(dst)
    print(f"{src.name} → {dst.relative_to(OUT.parent.parent)}")


def main() -> None:
    names = sys.argv[1:]
    for src in sorted(RAW.glob("*-green.png")):
        stem = src.stem.replace("-green", "")
        if names and stem not in names:
            continue
        key_one(src, OUT / f"{stem}.png")


if __name__ == "__main__":
    main()
