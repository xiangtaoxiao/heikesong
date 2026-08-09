#!/usr/bin/env python3
"""绿幕抠图 v2 —— 抠净 + 稳帧

单图模式:   python tools/chroma_key.py static <in.png> <out.png>
雪碧图模式: python tools/chroma_key.py sheet <in.png> <out.png> [cols rows]
            默认 5x3=15 帧。除抠绿外做三件事，专治"乱动":
            1) 翻转矫正——某帧与第0帧镜像相似度更高则翻回来
            2) 底部中心锚定——每帧按"下半身质心x + 最低不透明像素y"重新对齐
            3) 重建等距网格——输出像素级整齐的雪碧图
批量:       python tools/chroma_key.py batch   # sprites/raw/*-green.png 全部按 sheet 处理
"""
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "backend/static/assets/sprites/raw"
OUT = RAW.parent


def key_image(img: Image.Image) -> Image.Image:
    """抠绿（差值法）+ 去溢色 + 绿边缘清理

    差值法：纯绿幕 g - max(r,b) 通常 >100；橄榄绿/灰绿衣料只有 15~25。
    用绝对差值判定，衣服上的绿色系颜色不会被误杀（比例法会）。"""
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    greenish = [[False] * w for _ in range(h)]
    for y in range(h):
        row = greenish[y]
        for x in range(w):
            r, g, b, a = px[x, y]
            m = r if r > b else b
            d = g - m
            if d > 55 and g > 110:
                px[x, y] = (0, 0, 0, 0)                      # 背景纯绿
            elif d > 26:
                ratio = (d - 26) / 29                        # 边缘过渡带：羽化 + 去绿
                px[x, y] = (r, m + 12, b, max(0, int(a * (1 - ratio))))
                row[x] = True
    # 边缘清理：与透明区相邻的过渡像素直接干掉（去 1px 绿边）
    for y in range(h):
        for x in range(w):
            if not greenish[y][x]:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] == 0:
                    px[x, y] = (0, 0, 0, 0)
                    break
    return img


def _mask64(cell: Image.Image):
    a = cell.split()[3].resize((64, 64), Image.BILINEAR)
    d = a.load()
    return [[1 if d[x, y] > 40 else 0 for x in range(64)] for y in range(64)]


def _iou(m1, m2) -> float:
    inter = uni = 0
    for y in range(64):
        r1, r2 = m1[y], m2[y]
        for x in range(64):
            v1, v2 = r1[x], r2[x]
            if v1 and v2:
                inter += 1
            if v1 or v2:
                uni += 1
    return inter / uni if uni else 0.0


def _anchor(cell: Image.Image):
    """返回 (下半身质心x, 最低不透明y)；空帧返回 None"""
    a = cell.split()[3].load()
    w, h = cell.size
    bottom = -1
    for y in range(h - 1, -1, -1):
        if any(a[x, y] > 24 for x in range(0, w, 2)):
            bottom = y
            break
    if bottom < 0:
        return None
    y0 = max(0, int(bottom * 0.6))
    sx = n = 0
    for y in range(y0, bottom + 1, 2):
        for x in range(0, w, 2):
            if a[x, y] > 24:
                sx += x
                n += 1
    return (sx / n if n else w / 2, bottom)


def _clean_cell(cell: Image.Image) -> Image.Image:
    """连通域清理：删除 ①贴着左右格边、且远小于主体的碎片（邻格人物渗入）②噪点。
    保留不贴边的小部件（如庄子的蝴蝶）。"""
    from collections import deque
    a = cell.split()[3].load()
    w, h = cell.size
    label = [[0] * w for _ in range(h)]
    comps = []          # (size, touches_edge, id)
    cid = 0
    for sy in range(h):
        for sx in range(w):
            if a[sx, sy] > 16 and label[sy][sx] == 0:
                cid += 1
                q = deque([(sx, sy)])
                label[sy][sx] = cid
                size, touch = 0, False
                while q:
                    x, y = q.popleft()
                    size += 1
                    if x <= 1 or x >= w - 2 or y <= 1 or y >= h - 2:
                        touch = True
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < w and 0 <= ny < h and a[nx, ny] > 16 and label[ny][nx] == 0:
                            label[ny][nx] = cid
                            q.append((nx, ny))
                comps.append((size, touch, cid))
    if not comps:
        return cell
    biggest = max(c[0] for c in comps)
    kill = {c[2] for c in comps if c[0] < 60 or (c[1] and c[0] < biggest * 0.3)}
    px = cell.load()
    if kill:
        for y in range(h):
            for x in range(w):
                if label[y][x] in kill:
                    px[x, y] = (0, 0, 0, 0)
    # 轮廓羽化 1px：贴着透明区的边缘像素减淡，去掉深色毛边
    edge = []
    for y in range(h):
        for x in range(w):
            if px[x, y][3] > 0:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] == 0:
                        edge.append((x, y))
                        break
    for x, y in edge:
        r, g, b, a = px[x, y]
        px[x, y] = (r, g, b, int(a * 0.45))
    return cell


def _segments(proj, thr_ratio=0.06, min_gap=6, min_run=24):
    """投影谷分割：找出 proj 中被真实空隙隔开的人物团块区间 [(start,end)...]。
    比"等分切格"稳——生成图常有边距、列距漂移，等分线会切到人。"""
    mx = max(proj) if proj else 0
    if mx <= 0:
        return []
    thr = mx * thr_ratio
    runs = []
    start = None
    for i, v in enumerate(proj):
        if v > thr:
            if start is None:
                start = i
        else:
            if start is not None:
                runs.append([start, i])
                start = None
    if start is not None:
        runs.append([start, len(proj)])
    # 合并被窄谷隔开的碎块（人物内部的小空隙）
    merged = []
    for r in runs:
        if merged and r[0] - merged[-1][1] < min_gap:
            merged[-1][1] = r[1]
        else:
            merged.append(r)
    return [(s, e) for s, e in merged if e - s >= min_run]


def _grid_cells(sheet: Image.Image):
    """分层谷分割：先按列投影切竖条（列间隙可靠），再在每条竖条内部按行投影切行
    （整图行投影会被相邻列填谷，条带内则是干净的）。返回行主序区域列表。"""
    from collections import Counter
    W, H = sheet.size
    a = sheet.split()[3].load()
    colp = [0] * W
    for y in range(0, H, 2):
        for x in range(0, W, 2):
            if a[x, y] > 24:
                colp[x] += 1
    col_runs = _segments(colp)
    if len(col_runs) >= 2:                                   # 过滤"蝴蝶"这类窄飘件被当成独立列
        widths = sorted(e - s for s, e in col_runs)
        med = widths[len(widths) // 2]
        col_runs = [(s, e) for s, e in col_runs if e - s >= med * 0.45]
    if not (3 <= len(col_runs) <= 8):
        cw, ch = W // 5, H // 3
        return [(c * cw, r * ch, (c + 1) * cw, (r + 1) * ch) for r in range(3) for c in range(5)], "5x3(等分兜底)"

    def split_tall(proj, runs, max_h):
        """人物上下相接时谷分割会把多行并成一个过高团块。
        位置先验劈分：块高 ≈ k 行 → 在每个期望分界 ±70px 窗口内找投影最低点下刀。"""
        out = []
        for s, e in runs:
            height = e - s
            if height <= max_h:
                out.append((s, e))
                continue
            k = max(2, round(height / 340))                  # 期望行数
            bounds = [s]
            for i in range(1, k):
                center = s + height * i // k
                lo, hi = max(s + 80, center - 70), min(e - 80, center + 70)
                if hi <= lo:
                    bounds.append(center)
                    continue
                bounds.append(min(range(lo, hi), key=lambda y: proj[y]))
            bounds.append(e)
            out.extend((bounds[i], bounds[i + 1]) for i in range(k))
        return [(s, e) for s, e in out if e - s >= 100]      # 碎渣不算行

    strip_rows = []                                          # 每条竖条内部的行分割
    for x0, x1 in col_runs:
        proj = [0] * H
        for y in range(0, H, 2):
            for x in range(x0, x1, 2):
                if a[x, y] > 24:
                    proj[y] += 1
        runs = _segments(proj, thr_ratio=0.05, min_gap=4, min_run=60)
        strip_rows.append(split_tall(proj, runs, max_h=int(H * 0.42)))
    counts = Counter(len(r) for r in strip_rows)
    n_rows = counts.most_common(1)[0][0]
    if not (1 <= n_rows <= 4):
        cw, ch = W // 5, H // 3
        return [(c * cw, r * ch, (c + 1) * cw, (r + 1) * ch) for r in range(3) for c in range(5)], "5x3(等分兜底)"
    template = next(r for r in strip_rows if len(r) == n_rows)

    pad = 4
    cells = []
    for r in range(n_rows):
        for ci, (x0, x1) in enumerate(col_runs):
            rr = strip_rows[ci] if len(strip_rows[ci]) == n_rows else template
            y0, y1 = rr[r]
            cells.append((max(0, x0 - pad), max(0, y0 - pad), min(W, x1 + pad), min(H, y1 + pad)))
    return cells, f"{len(col_runs)}x{n_rows}(分层谷分割)"


def process_sheet(src: Path, dst: Path, out_cols: int = 5, out_rows: int = 3) -> None:
    sheet = key_image(Image.open(src))
    boxes, layout = _grid_cells(sheet)
    cells = [_clean_cell(sheet.crop(b)) for b in boxes]

    # 翻转矫正（多数投票版）：先判断每帧相对第0帧的最佳朝向，再让少数服从多数。
    # 近对称人物 iou≈iou_f，判为 keep，不动 —— 防误翻。
    ref_mask = _mask64(cells[0])
    MARGIN = 0.05
    best = ["keep"]
    for i in range(1, len(cells)):
        m = _mask64(cells[i])
        mf = _mask64(cells[i].transpose(Image.FLIP_LEFT_RIGHT))
        best.append("flip" if _iou(mf, ref_mask) > _iou(m, ref_mask) + MARGIN else "keep")
    majority_flip = best.count("flip") > len(cells) / 2      # 多数帧与第0帧互为镜像 → 第0帧才是异类
    flipped = 0
    for i in range(len(cells)):
        need = (best[i] == "flip") if not majority_flip else (best[i] == "keep")
        if need:
            cells[i] = cells[i].transpose(Image.FLIP_LEFT_RIGHT)
            flipped += 1

    # 归一化输出：一律 5×3=15 帧标准网格；每帧的"底部中心锚点"钉在同一坐标 → 彻底稳帧
    OW, OH = 1536 // out_cols, 1024 // out_rows
    out = Image.new("RGBA", (OW * out_cols, OH * out_rows), (0, 0, 0, 0))
    n_out = out_cols * out_rows
    for i in range(n_out):
        cell = cells[i % len(cells)]
        s = min(1.0, (OW - 6) / cell.width, (OH - 6) / cell.height)
        if s < 1.0:
            cell = cell.resize((int(cell.width * s), int(cell.height * s)), Image.LANCZOS)
        an = _anchor(cell) or (cell.width / 2, cell.height - 8)
        dx, dy = int(OW / 2 - an[0]), int(OH - 8 - an[1])
        tmp = Image.new("RGBA", (OW, OH), (0, 0, 0, 0))
        tmp.paste(cell, (dx, dy), cell)
        r, c = divmod(i, out_cols)
        out.paste(tmp, (c * OW, r * OH), tmp)
    out.save(dst)
    print(f"{src.name} → {dst.name}  ({layout}，定向翻转 {flipped} 帧{'，基准帧为少数派' if majority_flip else ''})")


def main() -> None:
    mode = sys.argv[1] if len(sys.argv) > 1 else "batch"
    if mode == "static":
        key_image(Image.open(sys.argv[2])).save(sys.argv[3])
        print(f"{sys.argv[2]} → {sys.argv[3]}")
    elif mode == "sheet":
        cols = int(sys.argv[4]) if len(sys.argv) > 4 else 5
        rows = int(sys.argv[5]) if len(sys.argv) > 5 else 3
        process_sheet(Path(sys.argv[2]), Path(sys.argv[3]), cols, rows)
    else:  # batch：v2 命名 <id>-a/-b-green.png
        for src in sorted(RAW.glob("*-[ab]-green.png")):
            process_sheet(src, OUT / src.name.replace("-green", ""))


if __name__ == "__main__":
    main()
