#!/usr/bin/env python3
"""把三格竖条漫画裁成三张独立配图。

原先幻灯片是同一张长图靠 object-position 上下滚动，观感像"卷轴滑动"而非翻页；
裁成独立图后，左右翻页才是真正的换图。

用法: python tools/split_theater.py            # 处理 theater/s*.png
输出: theater/<id>-1.png / -2.png / -3.png
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "backend/static/assets/theater"


def row_is_gap(px, w: int, y: int) -> bool:
    """整行都接近纸底色 = 格与格之间的留白"""
    hits = 0
    for x in range(0, w, 8):
        r, g, b = px[x, y][:3]
        if r > 205 and g > 198 and b > 178:
            hits += 1
    return hits >= (w // 8) * 0.94


def find_panels(img: Image.Image, want: int = 3):
    w, h = img.size
    px = img.convert("RGB").load()
    gaps, run = [], None
    for y in range(h):
        if row_is_gap(px, w, y):
            run = (run[0], y) if run else (y, y)
        elif run:
            if run[1] - run[0] >= 6:
                gaps.append(run)
            run = None
    if run and run[1] - run[0] >= 6:
        gaps.append(run)
    # 只保留画面内部的分隔带（排除顶部/底部留白）
    inner = [g for g in gaps if g[0] > h * 0.12 and g[1] < h * 0.88]
    inner.sort(key=lambda g: g[1] - g[0], reverse=True)
    cuts = sorted(((g[0] + g[1]) // 2) for g in inner[: want - 1])
    if len(cuts) != want - 1:                       # 检测失败 → 等分兜底
        cuts = [h * i // want for i in range(1, want)]
    bounds = [0, *cuts, h]
    return [(0, bounds[i], w, bounds[i + 1]) for i in range(want)]


def main() -> None:
    for src in sorted(SRC.glob("s*.png")):
        if "-" in src.stem:                          # 跳过已裁出的分格
            continue
        img = Image.open(src)
        panels = find_panels(img)
        for i, box in enumerate(panels, 1):
            crop = img.crop(box)
            crop.save(SRC / f"{src.stem}-{i}.png")
        heights = [b[3] - b[1] for b in panels]
        print(f"{src.name} → 3 格，高度 {heights}")


if __name__ == "__main__":
    main()
