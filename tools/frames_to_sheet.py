#!/usr/bin/env python3
"""视频抽帧 → 雪碧图组装（i2v 管线专用）

用法: python tools/frames_to_sheet.py <frames_dir> <out_sheet.png>

帧来自锁定机位的绿幕视频（同一画布、人物天然同位同尺寸），因此：
  1. 逐帧抠绿（复用 chroma_key.key_image）
  2. 取全部帧 alpha 的并集 bbox —— 同一矩形裁所有帧
  3. 同一缩放系数缩到 5×3 标准格（307×341）
  4. 同一位置粘贴（底部居中）
全程没有任何逐帧自适应 → 不可能出现缩放跳变/漂移/邻帧渗入。
"""
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from chroma_key import key_image

COLS, ROWS = 5, 3
CW, CH = 1536 // COLS, 1024 // ROWS


def main() -> None:
    frames_dir, out_path = Path(sys.argv[1]), Path(sys.argv[2])
    files = sorted(frames_dir.glob("*.png"))[: COLS * ROWS]
    assert len(files) == COLS * ROWS, f"需要 {COLS*ROWS} 帧，实际 {len(files)}"

    keyed = [key_image(Image.open(f)) for f in files]

    # 并集 bbox（对所有帧用同一裁剪框）
    u = None
    for img in keyed:
        b = img.split()[3].getbbox()
        if b:
            u = b if u is None else (min(u[0], b[0]), min(u[1], b[1]), max(u[2], b[2]), max(u[3], b[3]))
    pad = 6
    u = (max(0, u[0] - pad), max(0, u[1] - pad),
         min(keyed[0].width, u[2] + pad), min(keyed[0].height, u[3] + pad))
    w, h = u[2] - u[0], u[3] - u[1]
    s = min((CW - 4) / w, (CH - 4) / h)          # 统一缩放系数
    nw, nh = int(w * s), int(h * s)
    ox, oy = (CW - nw) // 2, CH - 4 - nh          # 统一粘贴位置：底部居中

    sheet = Image.new("RGBA", (CW * COLS, CH * ROWS), (0, 0, 0, 0))
    for i, img in enumerate(keyed):
        cell = img.crop(u).resize((nw, nh), Image.LANCZOS)
        r, c = divmod(i, COLS)
        sheet.paste(cell, (c * CW + ox, r * CH + oy), cell)
    sheet.save(out_path)
    print(f"{frames_dir.name} → {out_path.name}  (裁剪框 {w}x{h}, 缩放 {s:.3f})")


if __name__ == "__main__":
    main()
