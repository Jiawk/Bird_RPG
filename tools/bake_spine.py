#!/usr/bin/env python3
"""
Spine 2.1 序列帧烘焙器（仅支持 region 附件 + bones/slots 时间轴）
用于把 游戏素材/UI技能特效1000个【SPINE格式】 里的特效导出成 PNG 序列。

用法:
  python tools/bake_spine.py <特效目录> [--fps 30] [--scale 1.0] [--out 输出目录]

例:
  python tools/bake_spine.py "游戏素材/UI技能特效1000个【SPINE格式】/中/attack_daoguang1"
"""
import json, os, sys, math, glob, argparse
from PIL import Image

# ---------------- atlas 解析 ----------------
def parse_atlas(path):
    lines = [l.rstrip('\n') for l in open(path, encoding='utf-8')]
    png = None
    regions = {}
    cur = None
    for ln in lines:
        if not ln.strip():
            cur = None
            continue
        if png is None and ln.strip().lower().endswith('.png'):
            png = ln.strip(); continue
        if ln.startswith(' ') or ln.startswith('\t'):
            if cur is None: continue
            k, _, v = ln.strip().partition(':')
            cur[k.strip()] = v.strip()
            continue
        # 新区域名
        cur = {}
        regions[ln.strip()] = cur
    out = {}
    for name, kv in regions.items():
        try:
            xy = [int(x) for x in kv['xy'].split(',')]
            size = [int(x) for x in kv['size'].split(',')]
            orig = [int(x) for x in kv.get('orig', kv['size']).split(',')]
            off = [int(x) for x in kv.get('offset', '0,0').split(',')]
            rot = kv.get('rotate', 'false').strip() == 'true'
        except Exception:
            continue
        out[name] = {'xy': xy, 'size': size, 'orig': orig, 'offset': off, 'rotate': rot}
    return png, out

def extract_region(sheet, r):
    """从图集取出区域，返回 (RGBA 未旋转图, 相对 orig 中心的偏移)"""
    x, y = r['xy']; w, h = r['size']
    if r['rotate']:
        # 图集中顺时针旋转 90 度存放：读取后逆时针转回
        box = sheet.crop((x, y, x + h, y + w))
        img = box.rotate(90, expand=True)
    else:
        img = sheet.crop((x, y, x + w, y + h))
    return img.convert('RGBA'), r['offset'], r['orig']

# ---------------- 骨骼数学 ----------------
def mat_mul(a, b):
    return (a[0]*b[0] + a[2]*b[1], a[1]*b[0] + a[3]*b[1],
            a[0]*b[2] + a[2]*b[3], a[1]*b[2] + a[3]*b[3],
            a[0]*b[4] + a[2]*b[5] + a[4], a[1]*b[4] + a[3]*b[5] + a[5])

def local_mat(x, y, rot_deg, sx, sy):
    r = math.radians(rot_deg)
    c, s = math.cos(r), math.sin(r)
    return (c*sx, s*sx, -s*sy, c*sy, x, y)

def apply(m, px, py):
    return (m[0]*px + m[2]*py + m[4], m[1]*px + m[3]*py + m[5])

# ---------------- 时间轴插值 ----------------
def sample(tl, t, fields):
    """tl: 关键帧数组；返回各 field 的插值结果"""
    if not tl: return None
    if t <= tl[0].get('time', 0):
        return {f: tl[0].get(f, 0) for f in fields}
    for i in range(len(tl) - 1):
        a, b = tl[i], tl[i+1]
        ta, tb = a.get('time', 0), b.get('time', 0)
        if ta <= t <= tb:
            if tb - ta <= 1e-9 or a.get('curve') == 'stepped':
                k = 0.0
            else:
                k = (t - ta) / (tb - ta)
                k = k*k*(3 - 2*k)      # smoothstep 近似 bezier
            return {f: a.get(f, 0) + (b.get(f, 0) - a.get(f, 0)) * k for f in fields}
    last = tl[-1]
    return {f: last.get(f, 0) for f in fields}

def sample_attach(tl, t):
    if not tl: return None
    name = tl[0].get('name')
    for kf in tl:
        if kf.get('time', 0) <= t:
            name = kf.get('name')
        else:
            break
    return name

# ---------------- 主烘焙 ----------------
def pick_spine_files(dirpath):
    # 先找顶层，再递归找变体子目录（001/002/...）
    for pattern in ('*.json', '**/*.json'):
        js = glob.glob(os.path.join(dirpath, pattern), recursive=('**' in pattern))
        js = [p for p in js if 'skeleton.atlas' not in p]
        if js:
            base = os.path.basename(dirpath.rstrip('/'))
            for p in js:
                if os.path.basename(p).startswith(base): return p
            # 优先选含同名 atlas 的
            return sorted(js)[0]
    return None

def bake(dirpath, outdir, fps=30, scale=1.0, padding=4):
    json_path = pick_spine_files(dirpath)
    if not json_path:
        raise SystemExit('没有找到 skeleton json: ' + dirpath)
    atlas_paths = glob.glob(os.path.join(dirpath, '*.atlas')) or \
                  glob.glob(os.path.join(dirpath, '**', '*.atlas'), recursive=True)
    if not atlas_paths:
        raise SystemExit('没有找到 atlas: ' + dirpath)
    atlas_path = atlas_paths[0]

    data = json.load(open(json_path, encoding='utf-8'))
    # 优先用与 json 同目录的 atlas
    same_dir = os.path.dirname(json_path)
    cand = glob.glob(os.path.join(same_dir, '*.atlas'))
    if cand: atlas_path = cand[0]
    png_name, regions = parse_atlas(atlas_path)
    sheet = Image.open(os.path.join(os.path.dirname(atlas_path), png_name)).convert('RGBA')
    region_cache = {n: extract_region(sheet, r) for n, r in regions.items()}

    bones_def = data.get('bones', [])
    slots_def = data.get('slots', [])
    skin = (data.get('skins') or {}).get('default', {})
    anim = list((data.get('animations') or {}).values())[0]
    bone_tl = anim.get('bones', {})
    slot_tl = anim.get('slots', {})

    # 动画时长
    dur = 0.0
    for b in bone_tl.values():
        for tl in b.values():
            for kf in tl: dur = max(dur, kf.get('time', 0))
    for b in slot_tl.values():
        for tl in b.values():
            for kf in tl: dur = max(dur, kf.get('time', 0))
    dur = max(dur, 1.0 / fps)
    frames = max(1, int(round(dur * fps)) + 1)

    # 骨骼索引/父级
    bidx = {b['name']: i for i, b in enumerate(bones_def)}
    parent = [bidx.get(b.get('parent')) if b.get('parent') else -1 for b in bones_def]

    def bone_local(i, t):
        b = bones_def[i]; name = b['name']
        x = b.get('x', 0); y = b.get('y', 0)
        rot = b.get('rotation', 0); sx = b.get('scaleX', 1); sy = b.get('scaleY', 1)
        tl = bone_tl.get(name, {})
        if 'translate' in tl:
            v = sample(tl['translate'], t, ['x', 'y']); x += v['x']; y += v['y']
        if 'rotate' in tl:
            rot += sample(tl['rotate'], t, ['angle'])['angle']
        if 'scale' in tl:
            v = sample(tl['scale'], t, ['x', 'y']); sx *= v['x']; sy *= v['y']
        return local_mat(x, y, rot, sx, sy)

    def world_mats(t):
        world = [None] * len(bones_def)
        for i in range(len(bones_def)):
            m = bone_local(i, t)
            p = parent[i]
            world[i] = m if p < 0 else mat_mul(world[p], m)
        return world

    # 大画布
    CW = CH = 900
    cx = cy = CW // 2
    rendered = []
    for f in range(frames):
        t = f / fps
        world = world_mats(t)
        canvas = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
        for slot in slots_def:
            sname = slot['name']
            # 附件切换
            attach_name = slot.get('attachment')
            tl = slot_tl.get(sname, {})
            if 'attachment' in tl:
                attach_name = sample_attach(tl['attachment'], t)
            if not attach_name: continue
            att = skin.get(sname, {}).get(attach_name)
            if not att: continue
            key = att.get('path') or attach_name
            if key not in region_cache: continue
            img, off, orig = region_cache[key]
            # 目标尺寸
            w = att.get('width', orig[0]); h = att.get('height', orig[1])
            if w <= 0 or h <= 0: continue
            if (w, h) != img.size:
                img = img.resize((max(1, int(round(w))), max(1, int(round(h)))), Image.LANCZOS)
            # 附件局部变换
            ax = att.get('x', 0); ay = att.get('y', 0); arot = att.get('rotation', 0)
            ascx = att.get('scaleX', 1); ascy = att.get('scaleY', 1)
            bm = world[bidx[slot['bone']]]
            m = mat_mul(bm, local_mat(ax, ay, arot, ascx, ascy))
            # 四个角 → 世界坐标 → 屏幕（Y 翻转）
            hw, hh = img.width / 2.0, img.height / 2.0
            pts = [(-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh)]
            wp = [apply(m, px, py) for px, py in pts]
            sx = [cx + p[0] * scale for p in wp]
            sy = [cy - p[1] * scale for p in wp]
            # 目标 AABB
            minx, maxx = min(sx), max(sx); miny, maxy = min(sy), max(sy)
            tw, th = maxx - minx, maxy - miny
            if tw < 1 or th < 1: continue
            # 用仿射变换把矩形图贴到四边形（PIL 只支持平行四边形 → 用逆变换+双线性）
            # 这里用四角映射近似：取左上/右上/左下三点的仿射
            import numpy as np
            src = np.array([[0,0],[img.width,0],[0,img.height]], dtype=np.float32)
            dst = np.array([[sx[0],sy[0]],[sx[1],sy[1]],[sx[3],sy[3]]], dtype=np.float32)
            # 求仿射矩阵
            A = []
            B = []
            for (sxx, syy), (dxx, dyy) in zip(src, dst):
                A.append([sxx, syy, 1, 0, 0, 0]); B.append(dxx)
                A.append([0, 0, 0, sxx, syy, 1]); B.append(dyy)
            A = np.array(A, dtype=np.float64); B = np.array(B, dtype=np.float64)
            try:
                coef = np.linalg.solve(A, B)
            except Exception:
                continue
            # PIL 需要逆变换：目标像素 → 源像素
            inv = np.linalg.inv(np.array([[coef[0],coef[1],coef[2]],[coef[3],coef[4],coef[5]],[0,0,1]]))
            warped = img.transform((CW, CH), Image.AFFINE,
                                   (inv[0,0], inv[0,1], inv[0,2], inv[1,0], inv[1,1], inv[1,2]),
                                   resample=Image.BILINEAR)
            canvas.alpha_composite(warped)
        rendered.append(canvas)

    # 统一裁剪到内容框
    bbox = None
    for im in rendered:
        bb = im.getbbox()
        if not bb: continue
        bbox = bb if bbox is None else (min(bbox[0],bb[0]), min(bbox[1],bb[1]),
                                        max(bbox[2],bb[2]), max(bbox[3],bb[3]))
    if not bbox:
        raise SystemExit('渲染结果全透明: ' + dirpath)
    x0 = max(0, bbox[0]-padding); y0 = max(0, bbox[1]-padding)
    x1 = min(CW, bbox[2]+padding); y1 = min(CH, bbox[3]+padding)

    os.makedirs(outdir, exist_ok=True)
    for i, im in enumerate(rendered):
        im.crop((x0, y0, x1, y1)).save(os.path.join(outdir, f'{i:02d}.png'), optimize=True)
    return {'frames': frames, 'w': x1-x0, 'h': y1-y0, 'dur': dur, 'dir': outdir, 'fps': fps}

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('dir')
    ap.add_argument('--fps', type=int, default=30)
    ap.add_argument('--scale', type=float, default=1.0)
    ap.add_argument('--out', default=None)
    ap.add_argument('--max', type=int, default=0, help='限制输出最长边像素')
    ap.add_argument('--webp', type=int, default=0, help='>0 时存 WebP，值为质量')
    a = ap.parse_args()
    out = a.out or os.path.join('/tmp/spinebake', os.path.basename(a.dir.rstrip('/')))
    info = bake(a.dir, out, a.fps, a.scale)

    # 后处理：限制尺寸 + 存 WebP
    if a.max or a.webp:
        files = sorted(f for f in os.listdir(out) if f.endswith('.png'))
        for i, f in enumerate(files):
            fp = os.path.join(out, f)
            im = Image.open(fp).convert('RGBA')
            if a.max and max(im.size) > a.max:
                k = a.max / max(im.size)
                im = im.resize((max(1,int(im.width*k)), max(1,int(im.height*k))), Image.LANCZOS)
            if a.webp:
                im.save(fp[:-4] + '.webp', 'WEBP', quality=a.webp, method=6)
                os.remove(fp)
            else:
                im.save(fp, optimize=True)

    total = 0
    for f in os.listdir(out):
        total += os.path.getsize(os.path.join(out, f))
    print(json.dumps({**info, 'total_bytes': total, 'n_out': len(os.listdir(out))}, ensure_ascii=False))
