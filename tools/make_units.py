#!/usr/bin/env python3
"""
把任意 RPG Maker XP 行走图（32x48 × 4方向 × 4帧）拼进游戏的 units.png

units.png 结构：14 个角色 + 每角色 4 方向行 × 4 帧
  偏移 = 角色索引 * 128 + 帧 * 32,  行 = 方向 * 48
尺寸 1792 × 192

用法：
  python3 tools/make_units.py --map assets/units_map.json --out assets/wow/units.png

units_map.json 形如：
  { "0": "游戏素材/人物行走图素材(XP)(2937个)/Characters/202-女战士.png",
    "4": "...",
    "_default": "assets/wow/units.png" }   // 未列出的槽位沿用 _default
"""
import json, os, sys, argparse
from PIL import Image

CELL_W, CELL_H = 32, 48
COLS, ROWS = 4, 4          # 4 帧 × 4 方向（RMXP 标准）
SLOTS = 14

def load_sheet(path):
    im = Image.open(path).convert('RGBA')
    # 统一缩放到 128×192（4×4 格）
    nw, nh = CELL_W * COLS, CELL_H * ROWS
    if im.size != (nw, nh):
        im = im.resize((nw, nh), Image.LANCZOS)
    return im

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--map', default='assets/units_map.json')
    ap.add_argument('--out', default='assets/wow/units.png')
    a = ap.parse_args()

    cfg = {}
    if os.path.exists(a.map):
        cfg = json.load(open(a.map, encoding='utf-8'))
    default = cfg.get('_default')

    base = None
    if default and os.path.exists(default):
        base = Image.open(default).convert('RGBA')
    if base is None:
        base = Image.new('RGBA', (CELL_W * COLS * SLOTS, CELL_H * ROWS), (0, 0, 0, 0))

    changed = []
    for k in range(SLOTS):
        src = cfg.get(str(k))
        if not src or not os.path.exists(src):
            continue
        sheet = load_sheet(src)
        base.paste(sheet, (k * CELL_W * COLS, 0))
        changed.append((k, os.path.basename(src)))

    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    base.save(a.out, optimize=True)
    print(f'已生成 {a.out}  {base.size}  {os.path.getsize(a.out)//1024} KB')
    for k, n in changed:
        print(f'  槽位 {k:2d} ← {n}')

if __name__ == '__main__':
    main()
