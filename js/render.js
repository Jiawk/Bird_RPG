/* ============================================================
   渲染：2.5D 俯视（魔兽争霸3 视角：Y 轴压缩 + 单位站立 + 纵深排序）
   ============================================================ */
'use strict';

const CV = document.getElementById('view');
const CTX = CV.getContext('2d');
const PRT = document.getElementById('portrait');
const PRX = PRT.getContext('2d');

let VW = 0, VH = 0, DPR = 1;
const CAM = { x: 0, y: 0 };

/* 2.5D：地面 Y 轴压缩比（越小越"躺平"，越大越俯视） */
const YS = 0.70;
/* 单位"站立"高度系数 */
const HS = 1.05;

function resizeCanvas() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  VW = window.innerWidth; VH = window.innerHeight;
  CV.width = VW * DPR; CV.height = VH * DPR;
  CV.style.width = VW + 'px'; CV.style.height = VH + 'px';
  CTX.setTransform(DPR, 0, 0, DPR, 0, 0);
}

function updateCamera() {
  const w = G.world, p = G.player;
  if (!w || !p) return;
  const wH = w.H * YS;
  let tx = p.x - VW / 2;
  let ty = p.y - (VH / YS) / 2;
  tx = (w.W <= VW) ? (w.W - VW) / 2 : clamp(tx, 0, w.W - VW);
  ty = (wH <= VH) ? (w.H - VH / YS) / 2 : clamp(ty, 0, w.H - VH / YS);
  CAM.x += (tx - CAM.x) * 0.18;
  CAM.y += (ty - CAM.y) * 0.18;
}

/* RMXP 行走图：行 0=下 1=左 2=右 3=上，列 0~3 为走路帧 */
function dirRow(a) {
  const c = Math.cos(a), sn = Math.sin(a);
  if (Math.abs(c) > Math.abs(sn)) return c > 0 ? 2 : 1;
  return sn > 0 ? 0 : 3;
}
function walkFrame(t, moving, speed) {
  return moving ? (Math.floor(t * (speed || 7)) % 4) : 0;
}

/* 世界 → 屏幕 */
const px = x => x - CAM.x;
const py = y => (y - CAM.y) * YS;

/* ---------------- 主渲染 ---------------- */
function render() {
  const w = G.world, p = G.player;
  CTX.clearRect(0, 0, VW, VH);
  if (!w || !p) return;

  drawGround(w);
  drawProps(w);
  drawWalls(w);

  // 纵深排序：y 小的先画
  const list = [];
  for (const d of w.drops) list.push({ y: d.y, f: () => drawDrop(d) });
  for (const t of w.traps) list.push({ y: t.y, f: () => drawTrap(t) });
  for (const n of w.npcs) list.push({ y: n.y, f: () => drawNPC(n) });
  for (const m of w.monsters) if (m.alive) list.push({ y: m.y, f: () => drawMonster(m) });
  list.push({ y: p.y, f: () => drawPlayer(p) });
  list.sort((a, b) => a.y - b.y);
  for (const it of list) it.f();

  // 召唤灵兽「幼龙」：units 槽位 8 + 龙焰灵光 + 血条
  if (G.pet && imgReady('units')) {
    const pet = G.pet;
    const gx = px(pet.x), gy = py(pet.y);
    const bob = Math.sin(pet.phase * 4) * 3;
    const scale = 1.15;
    const sw = 32 * scale, sh = 48 * scale;
    const facing = pet.dir >= 0 ? 1 : -1;
    const rushing = !!pet.target;

    // 地面龙焰光
    const g0 = CTX.createRadialGradient(gx, gy, 2, gx, gy, rushing ? 44 : 36);
    g0.addColorStop(0, rushing ? 'rgba(255,150,60,.45)' : 'rgba(120,235,180,.32)');
    g0.addColorStop(1, 'rgba(0,0,0,0)');
    CTX.fillStyle = g0;
    CTX.beginPath(); CTX.arc(gx, gy, rushing ? 44 : 36, 0, 6.283); CTX.fill();

    // 旋转符文圈
    CTX.save();
    CTX.globalAlpha = 0.5;
    CTX.strokeStyle = 'rgba(140,255,190,.85)';
    CTX.lineWidth = 1.6;
    CTX.translate(gx, gy); CTX.rotate(pet.phase * 1.1);
    CTX.beginPath(); CTX.ellipse(0, 0, 22, 22 * YS, 0, 0, 6.283); CTX.stroke();
    CTX.restore();

    // 龙身
    const frame = Math.floor(pet.phase * (rushing ? 9 : 5)) % 4;
    const row = pet.target ? (pet.dir >= 0 ? 2 : 1) : 0;
    CTX.save();
    CTX.translate(gx, gy - sh + 12 + bob);
    if (facing < 0) CTX.scale(-1, 1);
    CTX.imageSmoothingEnabled = false;
    CTX.drawImage(IMG.units, 8 * 128 + frame * 32, row * 48, 32, 48,
                  -sw / 2, 0, sw, sh);
    CTX.restore();

    // 名字 + 血条
    const bw = 46;
    const hpPct = clamp(pet.hp / Math.max(1, pet.hpMax), 0, 1);
    CTX.fillStyle = 'rgba(0,0,0,.65)';
    CTX.fillRect(gx - bw / 2, gy - sh + 2 + bob, bw, 5);
    CTX.fillStyle = hpPct > 0.5 ? '#5fdc4a' : hpPct > 0.25 ? '#ffd24a' : '#ff5a40';
    CTX.fillRect(gx - bw / 2 + 1, gy - sh + 3 + bob, (bw - 2) * hpPct, 3);

    CTX.font = '700 10px "KaiTi",serif';
    CTX.textAlign = 'center';
    CTX.lineWidth = 3; CTX.strokeStyle = 'rgba(0,0,0,.9)';
    CTX.strokeText('幼龙', gx, gy - sh - 4 + bob);
    CTX.fillStyle = '#8cf0b0';
    CTX.fillText('幼龙', gx, gy - sh - 4 + bob);
  }

  // 出战宠物：units 图集精灵 + 名字 + 血条 + 类型标记
  if (G.bpet && G.bpet.def && imgReady('units')) {
    const bp = G.bpet, def = bp.def;
    const gx = px(bp.x), gy = py(bp.y);
    const bob = Math.sin(bp.phase * 4) * 2.5;
    const scale = 2.1;                       // 32×48 原图放大
    const sw = 32 * scale, sh = 48 * scale;
    const frame = Math.floor(bp.phase * (bp.target ? 9 : 5)) % 4;
    const row = bp.target ? (bp.dir >= 0 ? 2 : 1) : 0;

    // 脚下类型光圈
    const gc = def.color || '#9fe8ff';
    const g0 = CTX.createRadialGradient(gx, gy, 2, gx, gy, 30);
    g0.addColorStop(0, gc + '55');
    g0.addColorStop(1, 'rgba(0,0,0,0)');
    CTX.fillStyle = g0;
    CTX.beginPath(); CTX.arc(gx, gy, 30, 0, 6.283); CTX.fill();
    CTX.strokeStyle = gc + 'cc'; CTX.lineWidth = 1.6;
    CTX.beginPath(); CTX.ellipse(gx, gy, 18, 18 * YS, 0, 0, 6.283); CTX.stroke();

    if (def.beast || def.render === 'spiritwolf') {
      // 灵兽：矢量剪影（与月影灵狼同一套画法）
      const kind = def.beast || 'wolf';
      const bsz = (BEAST_PRESET[kind] && BEAST_PRESET[kind].size) || 66;
      drawBeast(kind, gx, gy + 4 + bob * 0.4, bp.phase, !!bp.target, bp.dir >= 0 ? 1 : -1,
                bsz, bsz);
    } else {
      CTX.save();
      CTX.translate(gx, gy - sh + 14 + bob);
      if (bp.dir < 0) CTX.scale(-1, 1);
      CTX.imageSmoothingEnabled = false;
      CTX.drawImage(IMG.units, def.sprite * 128 + frame * 32, row * 48, 32, 48,
                    -sw / 2, 0, sw, sh);
      CTX.restore();
    }

    // 名字 + 血条
    const bw = 48;
    const pct = clamp(bp.hp / Math.max(1, bp.hpMax), 0, 1);
    CTX.fillStyle = 'rgba(0,0,0,.65)';
    CTX.fillRect(gx - bw / 2, gy - sh + 4 + bob, bw, 5);
    CTX.fillStyle = pct > 0.5 ? '#3fd45a' : pct > 0.25 ? '#ffd24a' : '#ff5a40';
    CTX.fillRect(gx - bw / 2 + 1, gy - sh + 5 + bob, (bw - 2) * pct, 3);
    CTX.font = '700 10px "KaiTi",serif';
    CTX.textAlign = 'center';
    CTX.lineWidth = 3; CTX.strokeStyle = 'rgba(0,0,0,.9)';
    CTX.strokeText(def.name, gx, gy - sh - 2 + bob);
    CTX.fillStyle = gc;
    CTX.fillText(def.name, gx, gy - sh - 2 + bob);
  }

  // 技能特效
  drawVfx(w);

  // 飞行物画在最上层
  for (const pr of w.projectiles) drawProjectile(pr);

  // 粒子
  for (const pt of w.particles) {
    CTX.globalAlpha = Math.max(0, pt.t / 0.6);
    CTX.fillStyle = pt.color;
    CTX.beginPath(); CTX.arc(px(pt.x), py(pt.y) - 14, pt.r, 0, 6.283); CTX.fill();
  }
  CTX.globalAlpha = 1;

  // 飘字
  for (const f of w.floats) {
    CTX.globalAlpha = clamp(f.t / 0.9, 0, 1);
    CTX.font = `700 ${f.size}px "KaiTi",serif`;
    CTX.textAlign = 'center';
    CTX.lineWidth = 3.5; CTX.strokeStyle = 'rgba(0,0,0,.9)';
    CTX.strokeText(f.text, px(f.x), py(f.y) - 26);
    CTX.fillStyle = f.color;
    CTX.fillText(f.text, px(f.x), py(f.y) - 26);
  }
  CTX.globalAlpha = 1;

  drawVignette();
  drawPortrait(p);
}

/* ---------------- 地面 ---------------- */
/* 地砖索引（行,列） */
const T_FLOOR = [[1,6],[1,7],[2,6],[2,7],[0,7],[0,8]];
const T_WALL  = [0,2];
const T_BONE  = [6,4];
const T_TORCH = [9,0];
const TILE_PX = 48;

function drawTileSprite(col, row, dx, dy, size) {
  if (!imgReady('tiles')) return false;
  CTX.drawImage(IMG.tiles, col * 16, row * 16, 16, 16, dx, dy, size, size);
  return true;
}

/* 稳定伪随机（同一格子每次一样） */
function tileHash(x, y, salt) {
  let h = (x * 374761393 + y * 668265263 + salt * 2246822519) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return Math.abs(h);
}

function drawGround(w) {
  const room = w.isTown ? null : (getRoom(w.roomId) || DATA.ROOMS[w.roomId]) || null;
  // 每日副本 id 是 101+，查不到时给一个兜底配色，避免整帧报错黑屏
  const bg = w.isTown ? '#161d16' : (room ? room.bg : '#1a1f26');
  const tint = w.isTown ? '#2b3a24' : (room ? room.accent : '#3f5568');

  CTX.fillStyle = bg;
  CTX.fillRect(0, 0, VW, VH);

  // 主题背景图（水墨版）优先
  const _ri = w.isTown ? 0 : Math.max(0, DATA.ROOMS.findIndex(r => r.id === w.roomId));
  const bgImg = IMG.bgs ? IMG.bgs[(_ri + 1) % IMG.bgs.length] : null;
  if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
    CTX.drawImage(bgImg, px(0), py(0), w.W, w.H * YS);
    CTX.save();
    CTX.beginPath(); CTX.rect(px(0), py(0), w.W, w.H * YS); CTX.clip();
    CTX.globalCompositeOperation = 'multiply';
    CTX.globalAlpha = 0.35;
    CTX.fillStyle = tint;
    CTX.fillRect(px(0), py(0), w.W, w.H * YS);
    CTX.globalAlpha = 1;
    CTX.globalCompositeOperation = 'source-over';
    CTX.fillStyle = 'rgba(0,0,0,0.18)';
    CTX.fillRect(px(0), py(0), w.W, w.H * YS);
    CTX.restore();
    // 边界外压黑
    CTX.fillStyle = 'rgba(0,0,0,.72)';
    const l0 = px(0), t0 = py(0), r0 = px(w.W), b0 = py(w.H);
    if (l0 > 0) CTX.fillRect(0, 0, l0, VH);
    if (r0 < VW) CTX.fillRect(r0, 0, VW - r0, VH);
    if (t0 > 0) CTX.fillRect(0, 0, VW, t0);
    if (b0 < VH) CTX.fillRect(0, b0, VW, VH - b0);
    return;
  }

  // 每张地图独立地面材质（128x128 平铺）
  if (imgReady('grounds')) {
    const gi = w.isTown ? 1 : w.roomId;           // 主城用岩石材质
    if (!G._groundPat || G._groundPatIdx !== gi) {
      const off = document.createElement('canvas');
      off.width = off.height = 128;
      off.getContext('2d').drawImage(IMG.grounds, gi * 128, 0, 128, 128, 0, 0, 128, 128);
      G._groundPat = CTX.createPattern(off, 'repeat');
      G._groundPatIdx = gi;
    }
    CTX.save();
    CTX.translate(px(0), py(0));
    CTX.scale(1, YS);
    CTX.fillStyle = G._groundPat;
    CTX.fillRect(0, 0, w.W, w.H);
    CTX.restore();

    // 氛围染色
    CTX.save();
    CTX.beginPath(); CTX.rect(px(0), py(0), w.W, w.H * YS); CTX.clip();
    CTX.globalCompositeOperation = 'multiply';
    CTX.globalAlpha = 0.30; CTX.fillStyle = tint;
    CTX.fillRect(px(0), py(0), w.W, w.H * YS);
    CTX.globalAlpha = 1; CTX.globalCompositeOperation = 'source-over';
    CTX.fillStyle = 'rgba(0,0,0,0.16)';
    CTX.fillRect(px(0), py(0), w.W, w.H * YS);
    CTX.restore();

    // 边界压黑
    CTX.fillStyle = 'rgba(0,0,0,.72)';
    const gl = px(0), gt = py(0), gr = px(w.W), gb = py(w.H);
    if (gl > 0) CTX.fillRect(0, 0, gl, VH);
    if (gr < VW) CTX.fillRect(gr, 0, VW - gr, VH);
    if (gt > 0) CTX.fillRect(0, 0, VW, gt);
    if (gb < VH) CTX.fillRect(0, gb, VW, VH - gb);
    return;
  }

  const T = TILE_PX;
  const hasTiles = imgReady('tiles');
  const salt = (w.isTown ? 99 : w.roomId) + 1;

  const c0 = Math.floor(CAM.x / T) - 1, c1 = Math.ceil((CAM.x + VW) / T) + 1;
  const r0 = Math.floor(CAM.y / (T * 1)) - 1, r1 = Math.ceil((CAM.y + VH / YS) / T) + 1;

  if (hasTiles) {
    for (let ry = r0; ry <= r1; ry++) {
      for (let cx = c0; cx <= c1; cx++) {
        const wx = cx * T, wy = ry * T;
        if (wx < -T || wy < -T || wx > w.W || wy > w.H) continue;
        const h = tileHash(cx, ry, salt);
        const t = T_FLOOR[h % T_FLOOR.length];
        drawTileSprite(t[1], t[0], px(wx), py(wy), T);
      }
    }
  } else {
    // 兜底：网格
    CTX.strokeStyle = tint; CTX.globalAlpha = 0.3; CTX.lineWidth = 1;
    for (let x = c0 * T; x <= c1 * T; x += T) {
      CTX.beginPath(); CTX.moveTo(px(x), 0); CTX.lineTo(px(x), VH); CTX.stroke();
    }
    for (let y = r0 * T; y <= r1 * T; y += T) {
      CTX.beginPath(); CTX.moveTo(0, py(y)); CTX.lineTo(VW, py(y)); CTX.stroke();
    }
    CTX.globalAlpha = 1;
  }

  // 房间色调（multiply 让地砖带各房间氛围）
  CTX.save();
  CTX.beginPath();
  CTX.rect(px(0), py(0), w.W, w.H * YS);
  CTX.clip();
  CTX.globalCompositeOperation = 'multiply';
  CTX.globalAlpha = 0.42;
  CTX.fillStyle = tint;
  CTX.fillRect(px(0), py(0), w.W, w.H * YS);
  CTX.globalAlpha = 1;
  CTX.globalCompositeOperation = 'source-over';
  CTX.fillStyle = 'rgba(0,0,0,0.12)';
  CTX.fillRect(px(0), py(0), w.W, w.H * YS);
  CTX.restore();

  // 边界外压黑
  CTX.fillStyle = 'rgba(0,0,0,.72)';
  const l = px(0), t = py(0), r = px(w.W), b = py(w.H);
  if (l > 0) CTX.fillRect(0, 0, l, VH);
  if (r < VW) CTX.fillRect(r, 0, VW - r, VH);
  if (t > 0) CTX.fillRect(0, 0, VW, t);
  if (b < VH) CTX.fillRect(0, b, VW, VH - b);
}

/* 场景装饰 */
function drawProps(w) {
  if (!w.props) return;
  for (const pr of w.props) {
    const x = px(pr.x), y = py(pr.y);
    if (x < -80 || x > VW + 80 || y < -80 || y > VH + 80) continue;

    if (pr.type === 'rock') {
      CTX.fillStyle = 'rgba(0,0,0,.4)';
      CTX.beginPath(); CTX.ellipse(x, y + 2, pr.r * 1.05, pr.r * YS * 0.7, 0, 0, 6.283); CTX.fill();
      CTX.fillStyle = '#37332a';
      CTX.beginPath(); CTX.ellipse(x, y - pr.r * 0.3, pr.r, pr.r * 0.72, pr.rot, 0, 6.283); CTX.fill();
      CTX.fillStyle = '#47423a';
      CTX.beginPath(); CTX.ellipse(x - pr.r * 0.2, y - pr.r * 0.55, pr.r * 0.6, pr.r * 0.4, pr.rot, 0, 6.283); CTX.fill();
    } else if (pr.type === 'bone') {
      if (!drawTileSprite(4, 6, x - 18, y - 24, 36)) {
        CTX.strokeStyle = '#6b6558'; CTX.lineWidth = 2.5;
        CTX.beginPath(); CTX.moveTo(x - pr.r, y); CTX.lineTo(x + pr.r, y); CTX.stroke();
      }
    } else if (pr.type === 'torch') {
      const flick = 0.72 + Math.sin(G.time * 9 + pr.seed) * 0.28;
      const gg = CTX.createRadialGradient(x, y - 30, 1, x, y - 30, 90 * flick);
      gg.addColorStop(0, 'rgba(255,180,80,.55)');
      gg.addColorStop(1, 'rgba(255,140,40,0)');
      CTX.fillStyle = gg;
      CTX.beginPath(); CTX.arc(x, y - 30, 90 * flick, 0, 6.283); CTX.fill();
      if (!drawTileSprite(T_TORCH[1], T_TORCH[0], x - 16, y - 40, 32)) {
        CTX.fillStyle = '#4a3a20'; CTX.fillRect(x - 3, y - 26, 6, 26);
        CTX.fillStyle = '#ffb347';
        CTX.beginPath(); CTX.arc(x, y - 30, 4.5 * flick, 0, 6.283); CTX.fill();
      }
      CTX.fillStyle = 'rgba(0,0,0,.4)';
      CTX.beginPath(); CTX.ellipse(x, y + 2, 7, 3, 0, 0, 6.283); CTX.fill();
    }
  }
}

function drawWalls(w) {
  CTX.strokeStyle = '#6b5a3a';
  CTX.lineWidth = 4;
  CTX.strokeRect(px(0), py(0), w.W, w.H * YS);
  CTX.strokeStyle = 'rgba(212,175,55,.28)';
  CTX.lineWidth = 1;
  CTX.strokeRect(px(0) + 4, py(0) + 4, w.W - 8, w.H * YS - 8);
}

/* 地面选中光环 */
function selRing(x, y, rx, ry, color, alpha) {
  CTX.save();
  CTX.globalAlpha = (alpha === undefined ? 0.85 : alpha);
  CTX.strokeStyle = color;
  CTX.lineWidth = 2.2;
  CTX.beginPath(); CTX.ellipse(x, y, rx, ry * YS, 0, 0, 6.283); CTX.stroke();
  CTX.globalAlpha *= 0.35;
  CTX.lineWidth = 1.2;
  CTX.beginPath(); CTX.ellipse(x, y, rx * 1.18, ry * YS * 1.18, 0, 0, 6.283); CTX.stroke();
  CTX.restore();
}

/* ---------------- 玩家 ---------------- */

/* ============================================================
   灵兽绘制：灵狼同款矢量剪影，按参数生成不同兽形
   kind: wolf / deer / fox / qilin / phoenix / turtle / panther / voidling
   ============================================================ */
const BEAST_PRESET = {
  wolf:     { neck:10, headR:8,  ear:'point', horn:null,   tail:'bush', legs:4, bodyL:21, bodyH:9.5, legLen:26, color:'#9fe8ff', deep:'rgba(16,52,80,.97)', size:66 },
  deer:     { neck:22, headR:6.0,ear:'long',  horn:'antler',tail:'short',legs:4, bodyL:18, bodyH:8.0, legLen:38, color:'#a8f0c8', deep:'rgba(18,60,48,.97)', size:76 },
  fox:      { neck:11, headR:7,  ear:'big',   horn:null,   tail:'big',  legs:4, bodyL:20, bodyH:9,   legLen:24, color:'#ffb86a', deep:'rgba(74,34,12,.97)', size:66 },
  qilin:    { neck:17, headR:7.5,ear:'point', horn:'uni',   tail:'flame',legs:4, bodyL:21, bodyH:10,  legLen:28, color:'#c9a8ff', deep:'rgba(48,26,74,.97)', size:72 },
  panther:  { neck:9,  headR:7.5,ear:'round', horn:null,   tail:'long', legs:4, bodyL:23, bodyH:9,   legLen:22, color:'#6ff0d8', deep:'rgba(12,58,54,.97)', size:64 },
  turtle:   { neck:7,  headR:6.0,ear:'none',  horn:null,   tail:'short',legs:4, bodyL:22, bodyH:13,  legLen:9,  color:'#c8b48a', deep:'rgba(48,40,26,.97)', shell:true, size:62 },
  phoenix:  { bird:true, neck:19, headR:6, ear:'crest', horn:null, tail:'plume', legs:2, bodyL:14, bodyH:8.5, legLen:18, color:'#ffb04a', deep:'rgba(84,32,10,.97)', wings:true, size:84 },
  voidling: { neck:8,  headR:9,  ear:'point', horn:'twin',  tail:'wisp', legs:0, bodyL:14, bodyH:14,  legLen:0,  color:'#c08cff', deep:'rgba(38,18,64,.97)', float:true, size:70 }
};

function drawBeast(kind, gx, gy, t, rushing, facing, sw, sh, ctx) {
  const C = ctx || CTX;
  const P = BEAST_PRESET[kind] || BEAST_PRESET.wolf;
  const S = (sh || 66) / 58;
  const gait = Math.sin(t * (rushing ? 15 : 8));
  const RIM = P.color;
  const FILL = P.deep;
  C.save();
  C.translate(gx, gy);
  C.scale(facing * S, S);

  const legX = [-P.bodyL * 0.62, -P.bodyL * 0.3, P.bodyL * 0.42, P.bodyL * 0.72];
  const backY = -P.legLen - P.bodyH * 0.4;

  // ---- 尾巴 ----
  C.lineCap = 'round';
  C.strokeStyle = RIM; C.globalAlpha = .9;
  if (P.tail === 'bush') {
    C.lineWidth = 2.4;
    C.beginPath(); C.moveTo(-P.bodyL, backY + 2);
    C.quadraticCurveTo(-P.bodyL - 12, backY - 2 + gait * 2, -P.bodyL - 18, backY - 12 + gait * 4);
    C.stroke();
  } else if (P.tail === 'big') {
    C.lineWidth = 4;
    C.beginPath(); C.moveTo(-P.bodyL, backY + 2);
    C.quadraticCurveTo(-P.bodyL - 14, backY - 6 + gait * 2, -P.bodyL - 12, backY - 20 + gait * 3);
    C.stroke();
  } else if (P.tail === 'long') {
    C.lineWidth = 2.2;
    C.beginPath(); C.moveTo(-P.bodyL, backY + 2);
    C.quadraticCurveTo(-P.bodyL - 14, backY + 6, -P.bodyL - 20, backY - 6 + gait * 5);
    C.stroke();
  } else if (P.tail === 'flame') {
    C.lineWidth = 3;
    C.beginPath(); C.moveTo(-P.bodyL, backY + 2);
    C.quadraticCurveTo(-P.bodyL - 12, backY - 4, -P.bodyL - 16, backY - 16 + gait * 3);
    C.stroke();
    C.globalAlpha = .5;
    C.beginPath(); C.moveTo(-P.bodyL - 4, backY + 2);
    C.quadraticCurveTo(-P.bodyL - 16, backY - 8, -P.bodyL - 10, backY - 22 + gait * 3);
    C.stroke();
  } else if (P.tail === 'plume') {
    for (let i = 0; i < 3; i++) {
      C.lineWidth = 2.6 - i * 0.5;
      C.globalAlpha = .85 - i * 0.15;
      C.beginPath(); C.moveTo(-P.bodyL, backY + 2);
      C.quadraticCurveTo(-P.bodyL - 14 - i * 4, backY + 4, -P.bodyL - 20 - i * 5, backY - 14 + gait * 4 + i * 5);
      C.stroke();
    }
  } else if (P.tail === 'wisp') {
    C.lineWidth = 2;
    C.globalAlpha = .7;
    C.beginPath(); C.moveTo(-P.bodyL, backY + 2);
    C.quadraticCurveTo(-P.bodyL - 10, backY + 8 + gait * 3, -P.bodyL - 6, backY + 18 + gait * 4);
    C.stroke();
  } else {
    C.lineWidth = 2; C.beginPath(); C.moveTo(-P.bodyL, backY + 2); C.lineTo(-P.bodyL - 8, backY + 6); C.stroke();
  }

  // ---- 四肢 ----
  C.globalAlpha = 1;
  if (P.legs) {
    const pairs = P.legs === 2 ? [legX[0], legX[3]] : legX;
    pairs.forEach((x, i) => {
      const swing = (i % 2 === 0 ? 1 : -1) * gait * 4;
      C.strokeStyle = FILL; C.lineWidth = 5.4; C.globalAlpha = 1;
      C.beginPath(); C.moveTo(x, backY + 4); C.lineTo(x + swing, 0); C.stroke();
      C.strokeStyle = RIM; C.lineWidth = 1.1; C.globalAlpha = .5;
      C.beginPath(); C.moveTo(x, backY + 4); C.lineTo(x + swing, 0); C.stroke();
    });
  }

  // ---- 躯干 ----
  C.globalAlpha = 1;
  C.shadowColor = RIM; C.shadowBlur = 10;
  C.fillStyle = FILL;
  C.beginPath(); C.ellipse(0, backY, P.bodyL, P.bodyH, -0.03, 0, 6.283); C.fill();
  C.shadowBlur = 0;
  C.strokeStyle = RIM; C.lineWidth = 1.7;
  C.beginPath(); C.ellipse(0, backY, P.bodyL, P.bodyH, -0.03, 0, 6.283); C.stroke();

  // 龟甲
  if (P.shell) {
    C.globalAlpha = .55;
    C.strokeStyle = RIM; C.lineWidth = 1.4;
    for (let i = -1; i <= 1; i++) {
      C.beginPath(); C.ellipse(0, backY - 2, P.bodyL * 0.72, P.bodyH * 0.78, -0.03, i * 0.8, i * 0.8 + 1.6); C.stroke();
    }
    C.globalAlpha = 1;
  }

  // 背脊尖刺（狼/豹/麒麟）
  if (!P.bird && !P.shell) {
    C.fillStyle = FILL; C.globalAlpha = 1;
    const n = P.horn === 'uni' ? 4 : 3;
    for (let i = 0; i < n; i++) {
      const x = -P.bodyL * 0.5 + i * (P.bodyL * 0.5);
      C.beginPath(); C.moveTo(x, backY - P.bodyH + 1);
      C.lineTo(x + 3, backY - P.bodyH - 7); C.lineTo(x + 6, backY - P.bodyH + 1);
      C.closePath(); C.fill();
    }
  }

  // ---- 颈 + 头 ----
  const neckTopY = backY - P.neck;
  C.fillStyle = FILL;
  C.beginPath();
  C.moveTo(P.bodyL * 0.55, backY - P.bodyH * 0.2);
  C.lineTo(P.bodyL * 0.55 + 6, neckTopY);
  C.lineTo(P.bodyL * 0.55 + 14, neckTopY - 4);
  C.lineTo(P.bodyL * 0.72, backY + 1);
  C.closePath(); C.fill();

  const hx = P.bodyL * 0.55 + 16, hy = neckTopY - 5;
  C.beginPath(); C.ellipse(hx, hy, P.headR, P.headR * 0.82, -0.15, 0, 6.283); C.fill();
  C.strokeStyle = RIM; C.lineWidth = 1.5;
  C.beginPath(); C.ellipse(hx, hy, P.headR, P.headR * 0.82, -0.15, 0, 6.283); C.stroke();

  // 吻部
  C.fillStyle = FILL;
  C.beginPath(); C.moveTo(hx + P.headR * 0.7, hy - 2);
  C.lineTo(hx + P.headR * 1.9, hy + 1); C.lineTo(hx + P.headR * 0.7, hy + 4);
  C.closePath(); C.fill();

  // 耳
  C.fillStyle = FILL;
  if (P.ear === 'point') {
    C.beginPath(); C.moveTo(hx - 5, hy - P.headR * 0.7); C.lineTo(hx - 2, hy - P.headR - 9); C.lineTo(hx + 3, hy - P.headR * 0.6); C.closePath(); C.fill();
    C.beginPath(); C.moveTo(hx + 3, hy - P.headR * 0.7); C.lineTo(hx + 7, hy - P.headR - 8); C.lineTo(hx + 10, hy - P.headR * 0.4); C.closePath(); C.fill();
  } else if (P.ear === 'long') {
    C.beginPath(); C.ellipse(hx - 4, hy - P.headR - 7, 2.4, 8, 0.3, 0, 6.283); C.fill();
    C.beginPath(); C.ellipse(hx + 5, hy - P.headR - 7, 2.4, 8, -0.2, 0, 6.283); C.fill();
  } else if (P.ear === 'big') {
    C.beginPath(); C.moveTo(hx - 4, hy - P.headR); C.lineTo(hx - 2, hy - P.headR - 13); C.lineTo(hx + 5, hy - P.headR * 0.7); C.closePath(); C.fill();
    C.beginPath(); C.moveTo(hx + 5, hy - P.headR); C.lineTo(hx + 9, hy - P.headR - 12); C.lineTo(hx + 12, hy - P.headR * 0.5); C.closePath(); C.fill();
  } else if (P.ear === 'round') {
    C.beginPath(); C.arc(hx - 5, hy - P.headR * 0.9, 3.2, 0, 6.283); C.fill();
    C.beginPath(); C.arc(hx + 6, hy - P.headR * 0.9, 3.2, 0, 6.283); C.fill();
  } else if (P.ear === 'crest') {
    C.strokeStyle = RIM; C.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      C.beginPath(); C.moveTo(hx - 2 + i * 3, hy - P.headR);
      C.quadraticCurveTo(hx - 6 + i * 4, hy - P.headR - 10, hx + i * 2, hy - P.headR - 16);
      C.stroke();
    }
  }

  // 角
  if (P.horn === 'antler') {
    C.strokeStyle = RIM; C.lineWidth = 2; C.globalAlpha = .95;
    for (const sgn of [-1, 1]) {
      const bx = hx - 1 + sgn * 3;
      C.beginPath(); C.moveTo(bx, hy - P.headR - 6); C.lineTo(bx + sgn * 4, hy - P.headR - 18); C.stroke();
      C.beginPath(); C.moveTo(bx + sgn * 2, hy - P.headR - 12); C.lineTo(bx + sgn * 9, hy - P.headR - 16); C.stroke();
    }
    C.globalAlpha = 1;
  } else if (P.horn === 'uni') {
    C.fillStyle = RIM; C.globalAlpha = .95;
    C.beginPath(); C.moveTo(hx + 1, hy - P.headR - 2); C.lineTo(hx + 10, hy - P.headR - 16);
    C.lineTo(hx + 5, hy - P.headR); C.closePath(); C.fill();
    C.globalAlpha = 1;
  } else if (P.horn === 'twin') {
    C.fillStyle = RIM; C.globalAlpha = .9;
    C.beginPath(); C.moveTo(hx - 3, hy - P.headR); C.lineTo(hx - 8, hy - P.headR - 13); C.lineTo(hx + 1, hy - P.headR - 2); C.closePath(); C.fill();
    C.beginPath(); C.moveTo(hx + 4, hy - P.headR); C.lineTo(hx + 9, hy - P.headR - 12); C.lineTo(hx + 9, hy - P.headR - 1); C.closePath(); C.fill();
    C.globalAlpha = 1;
  }

  // 翅膀（凤凰/虚空）
  if (P.wings) {
    const flap = Math.sin(t * (rushing ? 16 : 7)) * 8;
    C.globalAlpha = .85; C.strokeStyle = RIM; C.lineWidth = 2;
    for (const sgn of [-1, 1]) {
      C.beginPath();
      C.moveTo(-2, backY - P.bodyH * 0.5);
      C.quadraticCurveTo(-10, backY - 26 - flap, -24, backY - 16 - flap * 0.6);
      C.stroke();
      C.beginPath();
      C.moveTo(-2, backY - P.bodyH * 0.3);
      C.quadraticCurveTo(-8, backY - 16 - flap * 0.7, -20, backY - 6 - flap * 0.3);
      C.stroke();
    }
    C.globalAlpha = 1;
  }

  // 眼
  C.fillStyle = '#eafeff';
  C.shadowColor = RIM; C.shadowBlur = 9;
  C.beginPath(); C.ellipse(hx + P.headR * 0.42, hy - 1.5, 2.4, 1.7, 0, 0, 6.283); C.fill();
  C.shadowBlur = 0;

  // 胸腹灵光
  C.globalAlpha = .38; C.fillStyle = RIM;
  C.beginPath(); C.ellipse(-2, backY + 2, P.bodyL * 0.55, P.bodyH * 0.6, 0, 0, 6.283); C.fill();

  C.globalAlpha = 1;
  C.restore();
}

/* 兼容旧调用：灵狼 */
function drawSpiritWolf(gx, gy, t, rushing, facing, sw, sh, ctx) {
  drawBeast('wolf', gx, gy, t, rushing, facing, sw, sh, ctx);
}

function drawPlayer(p) {
  const gx = px(p.x), gy = py(p.y);
  const cls = DATA.CLASSES[p.cls], race = DATA.RACES[p.race];
  const clsIdx = ['warrior','mage','archer','assassin'].indexOf(p.cls);

  const meta = !!p.stats.metamorph;
  if (meta) {
    // 恶魔变身：脚下黑红魔纹 + 黑光
    const g0 = CTX.createRadialGradient(gx, gy - 20, 6, gx, gy - 20, 78);
    g0.addColorStop(0, 'rgba(255,50,30,.42)');
    g0.addColorStop(0.55, 'rgba(120,0,0,.30)');
    g0.addColorStop(1, 'rgba(0,0,0,0)');
    CTX.fillStyle = g0;
    CTX.beginPath(); CTX.arc(gx, gy - 20, 78, 0, 6.283); CTX.fill();
    // 旋转的黑色魔纹
    CTX.save();
    CTX.globalAlpha = 0.55;
    CTX.strokeStyle = '#2a0000'; CTX.lineWidth = 3;
    CTX.translate(gx, gy); CTX.rotate(G.time * 1.6);
    CTX.beginPath(); CTX.ellipse(0, 0, 34, 34 * YS, 0, 0, 6.283); CTX.stroke();
    CTX.beginPath(); CTX.ellipse(0, 0, 26, 26 * YS, 0, 0, 6.283); CTX.stroke();
    CTX.restore();
  } else {
    selRing(gx, gy, 24, 11, '#7fd45a');
  }

  CTX.fillStyle = 'rgba(0,0,0,.5)';
  CTX.beginPath(); CTX.ellipse(gx, gy, 15, 15 * YS * 0.55, 0, 0, 6.283); CTX.fill();

  // 恶魔变身：背后黑色魔翼 + 头顶犄角
  if (meta) {
    const bob = Math.sin(G.time * 2.2) * 3;
    CTX.save();
    CTX.globalAlpha = 0.9;
    CTX.fillStyle = '#180000';
    const drawWing = (dir) => {
      CTX.beginPath();
      CTX.moveTo(gx + dir * 6, gy - 46);
      CTX.quadraticCurveTo(gx + dir * 66, gy - 100 + bob, gx + dir * 84, gy - 44);
      CTX.quadraticCurveTo(gx + dir * 62, gy - 60 + bob, gx + dir * 40, gy - 34);
      CTX.quadraticCurveTo(gx + dir * 26, gy - 50 - bob, gx + dir * 10, gy - 28);
      CTX.closePath(); CTX.fill();
    };
    drawWing(-1); drawWing(1);
    // 骨刺
    CTX.strokeStyle = '#2a0000'; CTX.lineWidth = 2.5;
    for (let i = 0; i < 3; i++) {
      CTX.beginPath();
      CTX.moveTo(gx - 8 - i * 20, gy - 44 - i * 14 + bob);
      CTX.lineTo(gx - 30 - i * 22, gy - 78 - i * 12 + bob);
      CTX.stroke();
      CTX.beginPath();
      CTX.moveTo(gx + 8 + i * 20, gy - 44 - i * 14 + bob);
      CTX.lineTo(gx + 30 + i * 22, gy - 78 - i * 12 + bob);
      CTX.stroke();
    }
    CTX.restore();
  }

  const moved = Math.hypot(p.x - (p._lx ?? p.x), p.y - (p._ly ?? p.y)) > 0.4;
  const S = meta ? 1.85 : 1.45;
  const sw = U_FRAME_W * S, sh = U_FRAME_H * S;

  if (imgReady('units')) {
    const row = dirRow(p.dir);
    // 走路 8fps；攻击时切到第 2 帧并前冲
    const attacking = p.attackAnim > 0;
    const frame = attacking ? 2 : walkFrame(G.time, moved, 9);
    const lunge = attacking ? (p.attackAnim / 0.18) * 7 : 0;
    const ox = Math.cos(p.dir) * lunge, oy = Math.sin(p.dir) * lunge * 0.6;
    const bobY = moved && !attacking ? Math.abs(Math.sin(G.time * 9)) * -2 : 0;
    const sx0 = clsIdx * 128 + frame * U_FRAME_W, sy0 = row * U_FRAME_H;
    CTX.save();
    CTX.globalAlpha = p.stats.invis > 0 ? 0.45 : 1;
    CTX.drawImage(IMG.units, sx0, sy0, U_FRAME_W, U_FRAME_H,
                  gx - sw / 2 + ox, gy - sh + 8 + oy + bobY, sw, sh);
    if (meta) {
      // 红色染色：用 source-atop 只染角色像素
      CTX.globalCompositeOperation = 'source-atop';
      CTX.globalAlpha = 0.55;
      CTX.fillStyle = '#c8140a';
      CTX.fillRect(gx - sw / 2 + ox, gy - sh + 8 + oy + bobY, sw, sh);
      CTX.globalAlpha = 0.28;
      CTX.fillStyle = '#000';
      CTX.fillRect(gx - sw / 2 + ox, gy - sh + 8 + oy + bobY, sw, sh);
      CTX.globalCompositeOperation = 'source-over';
    }
    if (meta) {
      // 头顶黑色犄角
      const topY = gy - sh + 14 + oy + bobY;
      CTX.fillStyle = '#120000';
      CTX.beginPath();
      CTX.moveTo(gx - 12, topY + 6); CTX.lineTo(gx - 22, topY - 18); CTX.lineTo(gx - 4, topY + 2);
      CTX.closePath(); CTX.fill();
      CTX.beginPath();
      CTX.moveTo(gx + 12, topY + 6); CTX.lineTo(gx + 22, topY - 18); CTX.lineTo(gx + 4, topY + 2);
      CTX.closePath(); CTX.fill();
    }
    CTX.restore();
  } else {
    CTX.fillStyle = cls.color;
    CTX.beginPath(); CTX.arc(gx, gy - 18, 18, 0, 6.283); CTX.fill();
    CTX.strokeStyle = race.color; CTX.lineWidth = 2.5; CTX.stroke();
  }
  p._lx = p.x; p._ly = p.y;

  // 攻击特效
  if (p.attackAnim > 0) {
    const k = p.attackAnim / 0.18;
    CTX.save();
    CTX.globalAlpha = k * 0.9;
    CTX.strokeStyle = '#ffd24a';
    CTX.lineWidth = 4;
    CTX.beginPath();
    CTX.arc(gx, gy - 28, 32, p.dir - 0.9, p.dir + 0.9);
    CTX.stroke();
    CTX.globalAlpha = k * 0.5;
    CTX.lineWidth = 8;
    CTX.beginPath();
    CTX.arc(gx, gy - 28, 32, p.dir - 0.55, p.dir + 0.55);
    CTX.stroke();
    CTX.restore();
  }

  CTX.font = '700 11px "KaiTi",serif';
  CTX.textAlign = 'center';
  CTX.lineWidth = 3; CTX.strokeStyle = 'rgba(0,0,0,.9)';
  CTX.strokeText(cls.name, gx, gy - 62);
  CTX.fillStyle = '#b9ffb0';
  CTX.fillText(cls.name, gx, gy - 62);

  drawBar(gx, gy - 56, 50, 5, p.hp / p.stats.hpMax, '#3fd45a', '#0d2a0d');
}

/* ---------------- 怪物 ---------------- */
function drawMonster(m) {
  const gx = px(m.x), gy = py(m.y);
  if (gx < -140 || gx > VW + 140 || gy < -140 || gy > VH + 140) return;
  const r = m.r;
  const h = r * HS;
  const x = gx, y = gy - h;

  if (m.isBoss) selRing(gx, gy, r * 1.35, r * 0.62, '#ff4a34', 0.9);
  else if (m.isElite) selRing(gx, gy, r * 1.15, r * 0.5, '#ffd24a', 0.75);
  else selRing(gx, gy, r * 1.05, r * 0.46, '#8b3a3a', 0.4);

  if (m.isElite) {
    const eg = CTX.createRadialGradient(gx, gy, r * 0.5, gx, gy, r * 2.2);
    eg.addColorStop(0, 'rgba(255,210,74,.20)');
    eg.addColorStop(1, 'rgba(255,210,74,0)');
    CTX.fillStyle = eg;
    CTX.beginPath(); CTX.arc(gx, gy, r * 2.2, 0, 6.283); CTX.fill();
  }

  CTX.fillStyle = 'rgba(0,0,0,.45)';
  CTX.beginPath(); CTX.ellipse(gx, gy, r * 0.9, r * 0.9 * YS * 0.55, 0, 0, 6.283); CTX.fill();

  let drawn = false;

  const MON_IDX = { centaur:8, kobold:9, grunt:10, skeleton:11, doomguard:12, abyssal:13,
    lightspawn:14, vrykul:15, valkyr:16, titanforged:17, naaru:18, voidlord:19 };
  if (!drawn && imgReady('units')) {
    const S = m.isBoss ? 2.9 : (m.isElite ? 1.6 : 1.35);
    const sw = U_FRAME_W * S, sh = U_FRAME_H * S;
    const BOSS_IDX = { bossWolf:8, bossKobold:9, bossGrom:10, bossKel:11, bossMannoroth:12, bossArchimonde:13,
      bossLight:14, bossVrykul:15, bossValkyr:16, bossTitan:17, bossNaaru:18, bossVoid:19 };
    const idx = (MON_IDX[m.kind] !== undefined) ? MON_IDX[m.kind]
              : (BOSS_IDX[m.kind] !== undefined ? BOSS_IDX[m.kind] : 11);
    const moving = (m.aggro || m.wandering) && m.stun <= 0 && m.frozen <= 0;
    const faceAng = m.faceAng !== undefined ? m.faceAng
                    : Math.atan2(G.player.y - m.y, G.player.x - m.x);
    const row = dirRow(faceAng);
    m._fd = row;
    const frame = walkFrame(G.time + m.phase, moving, 6);
    CTX.save();
    CTX.drawImage(IMG.units, idx * 128 + frame * U_FRAME_W, row * U_FRAME_H,
                  U_FRAME_W, U_FRAME_H, gx - sw / 2, gy - sh + 6, sw, sh);
    CTX.restore();
    if (m.isBoss) {
      const aura = CTX.createRadialGradient(gx, gy, r * 0.8, gx, gy, r * 2.2);
      aura.addColorStop(0, 'rgba(255,70,50,.20)');
      aura.addColorStop(1, 'rgba(255,70,50,0)');
      CTX.fillStyle = aura;
      CTX.beginPath(); CTX.arc(gx, gy, r * 2.2, 0, 6.283); CTX.fill();
    }
    drawn = true;
  }
  if (!drawn) {
    const kind = m.isBoss ? 'boss' : (m.kind || 'centaur');
    drawMonsterBody(x, y, r, m, kind);
  }

  if (m.hitFlash > 0) {
    CTX.globalAlpha = m.hitFlash / 0.12 * 0.55;
    CTX.fillStyle = '#fff';
    CTX.beginPath(); CTX.arc(gx, gy - r * 0.6, r * 0.9, 0, 6.283); CTX.fill();
    CTX.globalAlpha = 1;
  }

  if (m.frozen > 0) {
    CTX.strokeStyle = 'rgba(127,212,255,.9)'; CTX.lineWidth = 3;
    CTX.beginPath(); CTX.arc(x, y, r + 3, 0, 6.283); CTX.stroke();
    CTX.fillStyle = 'rgba(127,212,255,.22)';
    CTX.beginPath(); CTX.arc(x, y, r + 3, 0, 6.283); CTX.fill();
  } else if (m.root > 0) {
    CTX.strokeStyle = '#9fe6b8'; CTX.lineWidth = 2; CTX.setLineDash([4, 4]);
    CTX.beginPath(); CTX.arc(x, y, r + 4, 0, 6.283); CTX.stroke();
    CTX.setLineDash([]);
  }

  const ea = Math.atan2(G.player.y - m.y, G.player.x - m.x);
  CTX.fillStyle = m.isBoss ? '#ffd24a' : '#141414';
  for (const s of [-0.44, 0.44]) {
    const ex = x + Math.cos(ea + s) * r * 0.40;
    const ey = y + Math.sin(ea + s) * r * 0.40;
    CTX.beginPath(); CTX.arc(ex, ey, m.isBoss ? 3.6 : 2.5, 0, 6.283); CTX.fill();
  }

  if (m.isBoss) {
    CTX.font = '700 14px "KaiTi",serif'; CTX.textAlign = 'center';
    CTX.lineWidth = 4; CTX.strokeStyle = 'rgba(0,0,0,.92)';
    CTX.strokeText(m.name, gx, gy - 96);
    CTX.fillStyle = '#ffb0a0';
    CTX.fillText(m.name, gx, gy - 96);
    drawBar(gx, gy - 90, 110, 7, m.hp / m.hpMax, '#ff4a34', '#2a0808');
  } else {
    drawBar(gx, gy - 62, 34, 4, m.hp / m.hpMax, '#d94a3a', '#2a0808');
  }

  let iy = gy + 6;
  if (m.burn) { CTX.fillStyle = '#ff8a3d'; CTX.fillRect(gx - 9, iy, 6, 6); iy += 8; }
  if (m.poison) { CTX.fillStyle = '#7fd45a'; CTX.fillRect(gx - 9, iy, 6, 6); }
}

function drawMonsterBody(x, y, r, m, kind) {
  const base = m.color;
  const g = CTX.createRadialGradient(x - r * 0.3, y - r * 0.35, 2, x, y, r);
  g.addColorStop(0, shade(base, 55));
  g.addColorStop(1, base);

  const body = () => {
    CTX.fillStyle = g;
    CTX.beginPath(); CTX.arc(x, y, r, 0, 6.283); CTX.fill();
    CTX.lineWidth = 2.4;
    CTX.strokeStyle = shade(base, -60);
    CTX.stroke();
  };

  if (m.isBoss) {
    const aura = CTX.createRadialGradient(x, y, r * 0.8, x, y, r * 1.7);
    aura.addColorStop(0, 'rgba(255,70,50,.22)');
    aura.addColorStop(1, 'rgba(255,70,50,0)');
    CTX.fillStyle = aura;
    CTX.beginPath(); CTX.arc(x, y, r * 1.7, 0, 6.283); CTX.fill();

    body();
    CTX.fillStyle = shade(base, 70);
    for (const s of [-1, 1]) {
      CTX.beginPath();
      CTX.moveTo(x + s * r * 0.55, y - r * 0.62);
      CTX.lineTo(x + s * r * 0.95, y - r * 1.28);
      CTX.lineTo(x + s * r * 0.95, y - r * 0.42);
      CTX.closePath(); CTX.fill();
    }
    CTX.fillStyle = '#ffd24a';
    CTX.beginPath();
    CTX.moveTo(x - r * 0.5, y - r * 0.55);
    CTX.lineTo(x - r * 0.32, y - r * 0.95);
    CTX.lineTo(x - r * 0.12, y - r * 0.62);
    CTX.lineTo(x, y - r * 1.05);
    CTX.lineTo(x + r * 0.12, y - r * 0.62);
    CTX.lineTo(x + r * 0.32, y - r * 0.95);
    CTX.lineTo(x + r * 0.5, y - r * 0.55);
    CTX.closePath(); CTX.fill();
    return;
  }

  body();

  if (kind === 'centaur') {
    CTX.fillStyle = shade(base, -30);
    CTX.beginPath(); CTX.ellipse(x + r * 0.5, y + r * 0.35, r * 0.85, r * 0.42, 0, 0, 6.283); CTX.fill();
    CTX.strokeStyle = '#8a7a5a'; CTX.lineWidth = 2.5; CTX.lineCap = 'round';
    CTX.beginPath(); CTX.moveTo(x - r * 0.5, y - r * 0.1); CTX.lineTo(x + r * 1.5, y + r * 0.6); CTX.stroke();
  } else if (kind === 'kobold') {
    CTX.fillStyle = '#4a3a20';
    CTX.fillRect(x - 2, y - r * 1.5, 4, r * 0.7);
    const fl = 0.7 + Math.sin(G.time * 10) * 0.3;
    CTX.fillStyle = 'rgba(255,200,90,' + fl + ')';
    CTX.beginPath(); CTX.arc(x, y - r * 1.55, 5, 0, 6.283); CTX.fill();
  } else if (kind === 'grunt') {
    CTX.fillStyle = '#5a4a2a';
    for (const s of [-1, 1]) {
      CTX.beginPath(); CTX.arc(x + s * r * 0.85, y - r * 0.2, r * 0.36, 0, 6.283); CTX.fill();
    }
    CTX.strokeStyle = '#9a9a9a'; CTX.lineWidth = 3; CTX.lineCap = 'round';
    CTX.beginPath(); CTX.moveTo(x + r * 1.1, y - r * 0.3); CTX.lineTo(x + r * 1.5, y + r * 0.5); CTX.stroke();
  } else if (kind === 'skeleton') {
    CTX.strokeStyle = '#7a7466'; CTX.lineWidth = 1.6;
    for (let i = -1; i <= 1; i++) {
      CTX.beginPath();
      CTX.moveTo(x - r * 0.55, y + i * r * 0.3);
      CTX.lineTo(x + r * 0.55, y + i * r * 0.3);
      CTX.stroke();
    }
  } else if (kind === 'doomguard') {
    CTX.fillStyle = shade(base, -45);
    for (const s of [-1, 1]) {
      CTX.beginPath();
      CTX.moveTo(x + s * r * 0.4, y - r * 0.6);
      CTX.lineTo(x + s * r * 1.5, y - r * 0.15);
      CTX.lineTo(x + s * r * 0.5, y + r * 0.3);
      CTX.closePath(); CTX.fill();
    }
    CTX.fillStyle = '#ff6b5a';
    for (const s of [-1, 1]) {
      CTX.beginPath();
      CTX.moveTo(x + s * r * 0.45, y - r * 0.7);
      CTX.lineTo(x + s * r * 0.62, y - r * 1.15);
      CTX.lineTo(x + s * r * 0.78, y - r * 0.62);
      CTX.closePath(); CTX.fill();
    }
  } else if (kind === 'abyssal') {
    CTX.fillStyle = shade(base, -50);
    for (let i = 0; i < 7; i++) {
      const ang = -Math.PI / 2 + (i - 3) * 0.42;
      CTX.beginPath();
      CTX.moveTo(x + Math.cos(ang) * r * 0.85, y + Math.sin(ang) * r * 0.85);
      CTX.lineTo(x + Math.cos(ang) * r * 1.42, y + Math.sin(ang) * r * 1.42);
      CTX.lineTo(x + Math.cos(ang + 0.2) * r * 0.85, y + Math.sin(ang + 0.2) * r * 0.85);
      CTX.closePath(); CTX.fill();
    }
  }
}

/* ---------------- 掉落 / 陷阱 / 投射物 ---------------- */
function drawDrop(d) {
  const x = px(d.x), gy = py(d.y);
  const bob = Math.sin((d.bob || 0) * 1.2) * 3;
  const y = gy - 22 + bob;
  if (x < -80 || x > VW + 80 || y < -60 || y > VH + 60) return;

  const fade = Math.min(1, (d.age || 0) * 4);   // 淡入
  CTX.save();
  CTX.globalAlpha = fade;

  // 地面光晕
  const pulse = 0.7 + Math.sin(G.time * 4 + (d.bob || 0)) * 0.3;
  const glow = CTX.createRadialGradient(x, gy, 2, x, gy, 26);
  glow.addColorStop(0, d.color + 'cc');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  CTX.fillStyle = glow;
  CTX.beginPath(); CTX.ellipse(x, gy, 26, 26 * YS, 0, 0, 6.283); CTX.fill();

  // 光柱
  const beam = CTX.createLinearGradient(x, y - 40, x, gy);
  beam.addColorStop(0, 'rgba(0,0,0,0)');
  beam.addColorStop(1, d.color + '55');
  CTX.fillStyle = beam;
  CTX.fillRect(x - 8, y - 40, 16, 40 + 20);

  // ---- 图标 ----
  if (d.type === 'gold') {
    CTX.fillStyle = '#ffd24a';
    CTX.beginPath(); CTX.arc(x, y, 9, 0, 6.283); CTX.fill();
    CTX.strokeStyle = '#7a5a10'; CTX.lineWidth = 2; CTX.stroke();
    CTX.fillStyle = '#fff3b0';
    CTX.beginPath(); CTX.arc(x - 3, y - 3, 3, 0, 6.283); CTX.fill();
  } else if (d.type === 'item') {
    // 装备：菱形宝石 + 品质描边
    CTX.save();
    CTX.translate(x, y);
    CTX.rotate(Math.PI / 4);
    CTX.fillStyle = d.color;
    CTX.fillRect(-8, -8, 16, 16);
    CTX.strokeStyle = '#0a0805'; CTX.lineWidth = 2;
    CTX.strokeRect(-8, -8, 16, 16);
    CTX.fillStyle = 'rgba(255,255,255,.55)';
    CTX.fillRect(-6, -6, 6, 6);
    CTX.restore();
  } else if (d.type === 'skillbook' || d.type === 'attrbook') {
    CTX.fillStyle = d.color;
    CTX.fillRect(x - 9, y - 11, 18, 22);
    CTX.strokeStyle = '#0a0805'; CTX.lineWidth = 2; CTX.strokeRect(x - 9, y - 11, 18, 22);
    CTX.fillStyle = 'rgba(255,255,255,.85)';
    CTX.fillRect(x - 9, y - 11, 4, 22);
    CTX.fillStyle = '#fff'; CTX.font = '700 11px "KaiTi",serif'; CTX.textAlign = 'center';
    CTX.fillText('书', x + 2, y + 4);
  } else if (d.type === 'potion') {
    CTX.fillStyle = d.potion.color;
    CTX.beginPath(); CTX.arc(x, y + 3, 8, 0, 6.283); CTX.fill();
    CTX.strokeStyle = '#0a0805'; CTX.lineWidth = 2; CTX.stroke();
    CTX.fillStyle = '#cfc6b0'; CTX.fillRect(x - 4, y - 10, 8, 7);
  }

  // ---- 名牌 ----
  const label = d.type === 'gold' ? ('+' + d.gold + ' 金') :
                d.type === 'item' ? d.item.name :
                d.type === 'potion' ? d.potion.name :
                (d.label || '物品');
  const col = d.type === 'gold' ? '#ffd24a' : (d.color || '#e8e0cc');

  CTX.font = '600 11px "PingFang SC","Microsoft YaHei",sans-serif';
  const tw = CTX.measureText(label).width;
  const pw = tw + 14, ph = 17;
  const py0 = y - 30;
  CTX.fillStyle = 'rgba(8,6,3,.82)';
  CTX.beginPath();
  if (CTX.roundRect) { CTX.roundRect(x - pw/2, py0, pw, ph, 3); } else { CTX.rect(x - pw/2, py0, pw, ph); }
  CTX.fill();
  CTX.strokeStyle = col; CTX.lineWidth = 1; CTX.stroke();
  CTX.fillStyle = col;
  CTX.textAlign = 'center';
  CTX.fillText(label, x, py0 + 12);

  CTX.restore();
}

function drawTrap(t) {
  const x = px(t.x), y = py(t.y);
  CTX.strokeStyle = t.armed > 0 ? 'rgba(127,212,255,.35)' : 'rgba(127,212,255,.8)';
  CTX.lineWidth = 2; CTX.setLineDash([5, 5]);
  CTX.beginPath(); CTX.ellipse(x, y, t.r, t.r * YS, 0, 0, 6.283); CTX.stroke();
  CTX.setLineDash([]);
}


/* ---------------- SPINE 烘焙特效（精灵表） ---------------- */
function fxReady(key) {
  const im = IMG['fx_' + key];
  return im && im.complete && im.naturalWidth > 0 && FX_META[key];
}
/* 逐帧播放：loop=true 时循环，否则播完停在最后一帧 */
function drawFxSprite(key, cx, cy, opt) {
  if (!fxReady(key)) return false;
  const m = FX_META[key], im = IMG['fx_' + key];
  const o = opt || {};
  const scale = o.scale === undefined ? 1 : o.scale;
  const rot = o.rot || 0;
  const alpha = o.alpha === undefined ? 1 : o.alpha;
  const startT = o.t === undefined ? G.time : o.t;
  let idx;
  if (o.loop) {
    idx = Math.floor(startT * m.fps) % m.frames;
  } else {
    idx = Math.min(m.frames - 1, Math.floor(startT * m.fps));
  }
  const w = m.cw * scale, h = m.ch * scale;
  CTX.save();
  if (alpha !== 1) CTX.globalAlpha = alpha;
  CTX.translate(cx, cy);
  if (rot) CTX.rotate(rot);
  if (o.flipX) CTX.scale(-1, 1);
  CTX.drawImage(im, idx * m.cw, 0, m.cw, m.ch, -w / 2, -h / 2, w, h);
  CTX.restore();
  return true;
}

function drawProjectile(pr) {
  const x = px(pr.x), y = py(pr.y) - 18;
  const ang = Math.atan2(pr.vy, pr.vx);

  // ---- 变身挥砍：刀光精灵飞出去 ----
  if (pr.shape === 'slash' && fxReady('attack_daoguang2')) {
    drawFxSprite('attack_daoguang2', x, y, { scale: 0.8, loop: true, rot: ang + Math.PI / 2, alpha: 0.95 });
    return;
  }
  if (pr.shape === 'slash') {
    CTX.save(); CTX.translate(x, y); CTX.rotate(ang);
    CTX.strokeStyle = '#ff6a3c'; CTX.lineWidth = 4; CTX.lineCap = 'round';
    CTX.beginPath(); CTX.arc(0, 0, 18, -1.1, 1.1); CTX.stroke();
    CTX.restore(); return;
  }

  // ---- 火球：优先用 SPINE 烘焙精灵表 ----
  if (pr.shape === 'fireball' && fxReady('base_fly_fire')) {
    // 先铺一层光晕，再叠精灵表
    const g0 = CTX.createRadialGradient(x, y, 2, x, y, 26);
    g0.addColorStop(0, 'rgba(255,170,70,.45)');
    g0.addColorStop(1, 'rgba(255,60,0,0)');
    CTX.fillStyle = g0;
    CTX.beginPath(); CTX.arc(x, y, 26, 0, 6.283); CTX.fill();
    drawFxSprite('base_fly_fire', x, y, { scale: 0.52, loop: true, rot: ang });
    return;
  }

  // ---- 箭矢：优先用 SPINE 烘焙精灵表 ----
  if (pr.shape === 'arrow' && fxReady('base_fly_arrow')) {
    drawFxSprite('base_fly_arrow', x, y, { scale: 0.62, loop: true, rot: ang });
    return;
  }

  // ---- 火球：程序化绘制（精灵表未就绪时的兜底）----
  if (pr.shape === 'fireball') {
    const t = G.time * 18;
    // 外焰光晕
    const g0 = CTX.createRadialGradient(x, y, 2, x, y, 30);
    g0.addColorStop(0, 'rgba(255,190,90,.75)');
    g0.addColorStop(0.45, 'rgba(255,110,30,.45)');
    g0.addColorStop(1, 'rgba(255,60,0,0)');
    CTX.fillStyle = g0;
    CTX.beginPath(); CTX.arc(x, y, 30, 0, 6.283); CTX.fill();

    // 拖尾火星
    for (let i = 1; i <= 4; i++) {
      const tx = x - Math.cos(ang) * i * 9;
      const ty = y - Math.sin(ang) * i * 9 + Math.sin(t + i) * 2;
      CTX.globalAlpha = 0.55 - i * 0.11;
      CTX.fillStyle = i < 3 ? '#ffb347' : '#ff6a2a';
      CTX.beginPath(); CTX.arc(tx, ty, 6 - i, 0, 6.283); CTX.fill();
    }
    CTX.globalAlpha = 1;

    // 核心：橙红 + 白热，尺寸跳动
    const r = 9 + Math.sin(t) * 1.6;
    const g1 = CTX.createRadialGradient(x, y, 1, x, y, r);
    g1.addColorStop(0, '#fffbe8');
    g1.addColorStop(0.45, '#ffd24a');
    g1.addColorStop(1, 'rgba(255,90,20,.15)');
    CTX.fillStyle = g1;
    CTX.beginPath(); CTX.arc(x, y, r, 0, 6.283); CTX.fill();

    // 环绕的火焰小瓣
    CTX.save(); CTX.translate(x, y); CTX.rotate(ang + t * 0.6);
    for (let i = 0; i < 3; i++) {
      const a = i * 2.094;
      CTX.globalAlpha = 0.7;
      CTX.fillStyle = i % 2 ? '#ffb347' : '#ff6a2a';
      CTX.beginPath();
      CTX.ellipse(Math.cos(a) * 10, Math.sin(a) * 10, 5, 3, a, 0, 6.283);
      CTX.fill();
    }
    CTX.restore();
    CTX.globalAlpha = 1;
    return;
  }

  if (imgReady('proj')) {
    const idx = pr.shape === 'arrow' ? 0 : (pr.shape === 'blade' ? 2 : 1);
    const glowCol = idx === 0 ? 'rgba(255,240,200,.45)'
                  : idx === 2 ? 'rgba(180,110,255,.5)' : 'rgba(120,190,255,.55)';
    const g = CTX.createRadialGradient(x, y, 1, x, y, 22);
    g.addColorStop(0, glowCol); g.addColorStop(1, 'rgba(0,0,0,0)');
    CTX.fillStyle = g; CTX.beginPath(); CTX.arc(x, y, 22, 0, 6.283); CTX.fill();
    CTX.save(); CTX.translate(x, y); CTX.rotate(ang);
    CTX.imageSmoothingEnabled = false;
    const sz = idx === 0 ? 40 : 34;
    CTX.drawImage(IMG.proj, idx * 64, 0, 64, 64, -sz/2, -sz/2, sz, sz);
    CTX.restore(); return;
  }

  if (pr.shape === 'arrow') {
    // 箭矢：细长箭杆 + 箭头 + 拖尾
    CTX.save();
    CTX.translate(x, y);
    CTX.rotate(ang);
    const g = CTX.createLinearGradient(-30, 0, 12, 0);
    g.addColorStop(0, 'rgba(216,240,255,0)');
    g.addColorStop(1, pr.color);
    CTX.strokeStyle = g; CTX.lineWidth = 2.5; CTX.lineCap = 'round';
    CTX.beginPath(); CTX.moveTo(-28, 0); CTX.lineTo(8, 0); CTX.stroke();
    CTX.fillStyle = '#fff';
    CTX.beginPath(); CTX.moveTo(14, 0); CTX.lineTo(6, -4); CTX.lineTo(6, 4); CTX.closePath(); CTX.fill();
    CTX.strokeStyle = 'rgba(255,255,255,.65)'; CTX.lineWidth = 1.5;
    CTX.beginPath(); CTX.moveTo(-6, 0); CTX.lineTo(-12, -4); CTX.stroke();
    CTX.beginPath(); CTX.moveTo(-6, 0); CTX.lineTo(-12, 4); CTX.stroke();
    CTX.restore();
    return;
  }

  const glow = CTX.createRadialGradient(x, y, 0, x, y, 13);
  glow.addColorStop(0, pr.color);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  CTX.fillStyle = glow;
  CTX.beginPath(); CTX.arc(x, y, 13, 0, 6.283); CTX.fill();
  CTX.fillStyle = '#fff';
  CTX.beginPath(); CTX.arc(x, y, 3, 0, 6.283); CTX.fill();
}

/* ---------------- 技能特效 ---------------- */
/* 技能 → 特效类型 */
const SKILL_FX = {
  fireball:'inferno', frostNova:'frost', blizzard:'shards', arcaneTorrent:'arcane',
  blink:'flash', whirlwind:'cyclone', shieldwall:'aegis', battleShout:'warcry',
  bladestorm:'cyclone', charge:'charge', multishot:'volley', pierceArrow:'pierce',
  freezeTrap:'trap', rapidFire:'rapid', backjump:'flash', backstab:'backstab',
  poisonBlade:'poison', fanOfKnives:'fan', metamorphosis:'shadow', shadowstep:'shadow'
};

function fxKindOf(e) {
  if (e.skill && SKILL_FX[e.skill]) return SKILL_FX[e.skill];
  if (e.kind === 'hit') return 'hit';
  return ({ melee:'slash', dash:'slash', proj:'burst', aoe:'ring',
            trap:'ring', buff:'pillar' })[e.kind] || 'ring';
}

function drawSkillSignature(e, gx, gy, k, a, type) {
  const R = e.r * (0.35 + k * 0.75);
  const orb = (color, radius, alpha) => {
    const g = CTX.createRadialGradient(gx, gy - 18, 2, gx, gy - 18, radius);
    g.addColorStop(0, '#fff'); g.addColorStop(0.28, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    CTX.globalAlpha = alpha; CTX.fillStyle = g; CTX.beginPath(); CTX.arc(gx, gy - 18, radius, 0, 6.283); CTX.fill();
  };
  if (type === 'inferno') {
    orb('#ff5a28', R, a * 0.95);
    for (let j = 0; j < 18; j++) { const ang = e.seed + j * 0.349; const d = R * (0.2 + (j % 4) * 0.19) * k;
      CTX.globalAlpha = a * .9; CTX.fillStyle = j % 3 ? '#ff8a24' : '#fff2a8'; CTX.beginPath(); CTX.arc(gx + Math.cos(ang) * d, gy - 18 + Math.sin(ang) * d * YS - k * 54, 5 * a + 1, 0, 6.283); CTX.fill(); }
    return true;
  }
  if (type === 'frost' || type === 'trap') {
    const n = type === 'frost' ? 14 : 8;
    CTX.globalAlpha = a; CTX.strokeStyle = '#baf4ff'; CTX.lineWidth = 3;
    for (let j = 0; j < n; j++) { const ang = e.seed + j * 6.283 / n; const d = R * (0.35 + (j % 3) * .18);
      const x = gx + Math.cos(ang) * d, y = gy + Math.sin(ang) * d * YS;
      CTX.beginPath(); CTX.moveTo(x, y); CTX.lineTo(x + Math.cos(ang) * 15, y - 38 * a); CTX.lineTo(x + Math.cos(ang + 1.5) * 8, y); CTX.stroke(); }
    orb('#56cfff', R * .62, a * .45); return true;
  }
  if (type === 'arcane') {
    CTX.globalAlpha = a * .85; CTX.strokeStyle = '#c581ff';
    [1, .68, .38].forEach((m, i) => { CTX.lineWidth = 4 - i; CTX.beginPath(); CTX.ellipse(gx, gy, R * m, R * m * YS, k * (i % 2 ? -3 : 3), 0, 6.283); CTX.stroke(); });
    for (let j = 0; j < 10; j++) { const ang = e.seed + j * .628 + k * 4; CTX.globalAlpha = a; CTX.fillStyle = '#f0d8ff'; CTX.fillRect(gx + Math.cos(ang) * R * .72 - 2, gy + Math.sin(ang) * R * .72 * YS - 2, 5, 5); }
    orb('#8d5bff', R * .45, a * .65); return true;
  }
  if (type === 'cyclone') {
    CTX.globalAlpha = a * .88; CTX.strokeStyle = '#dffaff';
    for (let j = 0; j < 5; j++) { CTX.lineWidth = 2 + j; CTX.beginPath(); CTX.ellipse(gx, gy - 12 - j * 10, R * (1 - j * .12), R * (.32 - j * .025), e.seed + k * 9 + j, 0.3, 5.7); CTX.stroke(); }
    return true;
  }
  if (type === 'aegis') {
    const rr = R * .7; CTX.globalAlpha = a * .75; CTX.fillStyle = '#5ecbff'; CTX.strokeStyle = '#e9fbff'; CTX.lineWidth = 4;
    CTX.beginPath(); for (let j = 0; j < 6; j++) { const ang = -1.57 + j * 1.047; const x = gx + Math.cos(ang) * rr, y = gy - 32 + Math.sin(ang) * rr; j ? CTX.lineTo(x, y) : CTX.moveTo(x, y); } CTX.closePath(); CTX.fill(); CTX.stroke();
    return true;
  }
  if (type === 'warcry') {
    CTX.globalAlpha = a; CTX.strokeStyle = '#ff9a45';
    for (let j = 0; j < 4; j++) { const rr = R * (0.25 + k * (1.1 - j * .14)); CTX.lineWidth = 6 - j; CTX.beginPath(); CTX.ellipse(gx, gy, rr, rr * YS, 0, 0, 6.283); CTX.stroke(); }
    return true;
  }
  if (type === 'volley' || type === 'rapid') {
    const n = type === 'volley' ? 5 : 8; CTX.globalAlpha = a; CTX.strokeStyle = '#f6e89c'; CTX.lineWidth = 3;
    for (let j = 0; j < n; j++) { const ang = e.seed - .48 + j * .96 / Math.max(1, n - 1); const d = R * (0.25 + k); const x = gx + Math.cos(ang) * d, y = gy - 18 + Math.sin(ang) * d * YS; CTX.beginPath(); CTX.moveTo(gx, gy - 18); CTX.lineTo(x, y); CTX.stroke(); }
    return true;
  }
  if (type === 'poison' || type === 'vanish' || type === 'shadow') {
    const color = type === 'poison' ? '#7cff5a' : '#9b58e8';
    for (let j = 0; j < 15; j++) { const ang = e.seed + j * .419; const d = R * k * (0.3 + (j % 4) * .18); CTX.globalAlpha = a * .68; CTX.fillStyle = color; CTX.beginPath(); CTX.arc(gx + Math.cos(ang) * d, gy - 18 + Math.sin(ang) * d * YS - (type === 'shadow' ? k * 40 : 0), 3 + (j % 3) * 2, 0, 6.283); CTX.fill(); }
    return true;
  }
  return false;
}

function drawVfx(w) {
  if (!w.vfx || !w.vfx.length) return;
  for (let i = w.vfx.length - 1; i >= 0; i--) {
    const e = w.vfx[i];
    e.t += 1 / 60;
    if (e.t >= e.life) { w.vfx.splice(i, 1); continue; }
    const k = e.t / e.life, a = 1 - k;
    const gx = px(e.x), gy = py(e.y);
    const type = fxKindOf(e);
    CTX.save();

    // 跟随玩家的特效（护盾/光环/变身）
    if (e.follow && G.player) { e.x = G.player.x; e.y = G.player.y; }

    // SPINE 烘焙特效：一旦命中直接绘制并跳过后续手绘
    if (e.kind === 'sprite' && e.key) {
      CTX.restore();
      drawFxSprite(e.key, gx, gy - (e.oy || 0), {
        scale: e.scale || 1, rot: e.rot || 0, t: e.t, alpha: 1
      });
      continue;
    }

    if (drawSkillSignature(e, gx, gy, k, a, type)) { CTX.restore(); continue; }

    if (type === 'hit') {
      const R = 18 + k * 26;
      const g = CTX.createRadialGradient(gx, gy - 18, 1, gx, gy - 18, R);
      g.addColorStop(0, e.color); g.addColorStop(1, 'rgba(0,0,0,0)');
      CTX.globalAlpha = a * 0.9; CTX.fillStyle = g;
      CTX.beginPath(); CTX.arc(gx, gy - 18, R, 0, 6.283); CTX.fill();
      CTX.globalAlpha = a; CTX.strokeStyle = '#fff'; CTX.lineWidth = 2;
      CTX.beginPath(); CTX.arc(gx, gy - 18, R * 0.6, 0, 6.283); CTX.stroke();
      CTX.restore(); continue;
    }

    // ---- 通用地面光环 ----
    if (type !== 'flash' && type !== 'pillar') {
      const R = e.r * (0.3 + k * 1.0);
      CTX.globalAlpha = a * 0.85; CTX.strokeStyle = e.color; CTX.lineWidth = 3 + 4 * a;
      CTX.beginPath(); CTX.ellipse(gx, gy, R, R * YS, 0, 0, 6.283); CTX.stroke();
      CTX.globalAlpha = a * 0.35; CTX.lineWidth = 1.5;
      CTX.beginPath(); CTX.ellipse(gx, gy, R * 0.62, R * 0.62 * YS, 0, 0, 6.283); CTX.stroke();
    }

    if (type === 'shards') {
      // 暴风雪：从天而降的冰锥
      const n = 22;
      for (let j = 0; j < n; j++) {
        const ang = e.seed + j * 2.399;
        const rr = e.r * (0.25 + (j % 5) / 5 * 0.75);
        const sx = gx + Math.cos(ang) * rr;
        const sy = gy + Math.sin(ang) * rr * YS;
        const fall = ((k * 1.6 + j / n) % 1);
        const h = 120 * (1 - fall);
        CTX.globalAlpha = a * (0.5 + fall * 0.5);
        CTX.strokeStyle = e.color; CTX.lineWidth = 3;
        CTX.beginPath();
        CTX.moveTo(sx, sy - h); CTX.lineTo(sx, sy - h + 22); CTX.stroke();
        CTX.fillStyle = '#ffffff';
        CTX.beginPath(); CTX.arc(sx, sy - h + 22, 2.5, 0, 6.283); CTX.fill();
      }
    } else if (type === 'pillar') {
      // 光柱升起
      const h = e.r * (0.6 + k * 2.2);
      const wd = e.r * 0.42 * (1 - k * 0.35);
      const g = CTX.createLinearGradient(gx, gy - h, gx, gy);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.45, e.color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      CTX.globalAlpha = a * 0.75; CTX.fillStyle = g;
      CTX.fillRect(gx - wd / 2, gy - h, wd, h);
      CTX.globalAlpha = a; CTX.strokeStyle = '#fff'; CTX.lineWidth = 2;
      CTX.beginPath(); CTX.ellipse(gx, gy, wd * 0.7, wd * 0.7 * YS, 0, 0, 6.283); CTX.stroke();
      for (let j = 0; j < 10; j++) {
        const ang = j * 0.628 + k * 2;
        CTX.globalAlpha = a * 0.8;
        CTX.fillStyle = e.color;
        CTX.beginPath();
        CTX.arc(gx + Math.cos(ang) * wd * 0.8, gy - h * (0.2 + (j % 4) * 0.2), 3, 0, 6.283);
        CTX.fill();
      }
    } else if (type === 'slash') {
      // 挥砍弧
      const dir = (e.seed || 0);
      const sweep = Math.PI * 1.5;
      CTX.globalAlpha = a * 0.95; CTX.strokeStyle = e.color; CTX.lineWidth = 7;
      CTX.beginPath();
      CTX.arc(gx, gy - 22, e.r * (0.5 + k * 0.7), dir - sweep / 2, dir - sweep / 2 + sweep * Math.min(1, k * 2));
      CTX.stroke();
      CTX.globalAlpha = a * 0.5; CTX.strokeStyle = '#fff'; CTX.lineWidth = 2;
      CTX.beginPath();
      CTX.arc(gx, gy - 22, e.r * (0.5 + k * 0.7), dir - sweep / 2, dir - sweep / 2 + sweep * Math.min(1, k * 2));
      CTX.stroke();
    } else if (type === 'burst') {
      // 爆裂粒子
      for (let j = 0; j < 16; j++) {
        const ang = e.seed + j * 0.392;
        const d = e.r * k * (0.6 + (j % 3) * 0.25);
        CTX.globalAlpha = a * 0.9; CTX.fillStyle = j % 3 === 0 ? '#fff' : e.color;
        CTX.beginPath();
        CTX.arc(gx + Math.cos(ang) * d, gy + Math.sin(ang) * d * YS - 18, 4 * a + 1, 0, 6.283);
        CTX.fill();
      }
    } else if (type === 'flash') {
      const R = e.r * (0.4 + k * 1.4);
      const g = CTX.createRadialGradient(gx, gy - 20, 2, gx, gy - 20, R);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.35, e.color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      CTX.globalAlpha = a; CTX.fillStyle = g;
      CTX.beginPath(); CTX.arc(gx, gy - 20, R, 0, 6.283); CTX.fill();
      for (let j = 0; j < 8; j++) {
        const ang = e.seed + j * 0.785;
        CTX.globalAlpha = a * 0.9; CTX.strokeStyle = '#fff'; CTX.lineWidth = 2;
        CTX.beginPath();
        CTX.moveTo(gx + Math.cos(ang) * R * 0.3, gy - 20 + Math.sin(ang) * R * 0.3);
        CTX.lineTo(gx + Math.cos(ang) * R, gy - 20 + Math.sin(ang) * R);
        CTX.stroke();
      }
    } else {
      // ring：默认（含贴图星爆 + 放射线）
      if (imgReady('fx')) {
        const sc = 0.45 + k * 1.05;
        const sz = FX_SIZE * sc;
        CTX.globalAlpha = a * 0.9;
        CTX.save(); CTX.translate(gx, gy - 20); CTX.rotate(k * 0.9);
        CTX.imageSmoothingEnabled = false;
        CTX.drawImage(IMG.fx, e.fx * FX_SIZE, 0, FX_SIZE, FX_SIZE, -sz / 2, -sz / 2, sz, sz);
        CTX.restore();
      }
      CTX.globalAlpha = a * 0.75; CTX.strokeStyle = e.color; CTX.lineWidth = 2;
      for (let sp2 = 0; sp2 < 8; sp2++) {
        const ang = sp2 * 0.785 + k * 1.1;
        CTX.beginPath();
        CTX.moveTo(gx + Math.cos(ang) * e.r * 0.35, gy + Math.sin(ang) * e.r * 0.35 * YS);
        CTX.lineTo(gx + Math.cos(ang) * e.r * (0.35 + k), gy + Math.sin(ang) * e.r * (0.35 + k) * YS);
        CTX.stroke();
      }
      CTX.globalAlpha = a * a; CTX.fillStyle = '#fff';
      CTX.beginPath(); CTX.arc(gx, gy - 20, 10 * (1 - k) + 3, 0, 6.283); CTX.fill();
    }

    CTX.restore();
  }
}

/* ---------------- NPC ---------------- */
function drawNPC(n) {
  const gx = px(n.x), gy = py(n.y);
  const y = gy - n.r * HS - 6;

  selRing(gx, gy, 26, 12, '#ffd24a', 0.55);
  CTX.fillStyle = 'rgba(0,0,0,.45)';
  CTX.beginPath(); CTX.ellipse(gx, gy, 20, 20 * YS * 0.55, 0, 0, 6.283); CTX.fill();

  const lg = CTX.createLinearGradient(gx, y - 80, gx, gy);
  lg.addColorStop(0, 'rgba(0,0,0,0)');
  lg.addColorStop(1, n.color + '55');
  CTX.fillStyle = lg;
  CTX.fillRect(gx - 18, y - 80, 36, 80);

  const NPC_IDX = { teleport:4, merchant:5, exchange:6, blacksmith:7, quest:0, tower:2,
    holyportal:20, holygate:21, holytownback:4 };
  let npcDrawn = false;
  if (imgReady('units') && NPC_IDX[n.kind] !== undefined) {
    const S = 1.4, sw = U_FRAME_W*S, sh = U_FRAME_H*S;
    const idx = NPC_IDX[n.kind];
    const frame = Math.floor((G.time + n.x * 0.01) * 3) % 4;
    CTX.drawImage(IMG.units, idx*128 + frame*U_FRAME_W, 0, U_FRAME_W, U_FRAME_H,
                  gx - sw/2, gy - sh + 8, sw, sh);
    npcDrawn = true;
  }
  if (!npcDrawn) {
    if (n.kind === 'save' && imgReady('stele')) {
      const sz = 68;
      const glow = CTX.createRadialGradient(gx, gy - 20, 4, gx, gy - 20, 52);
      glow.addColorStop(0, 'rgba(127,212,255,.28)');
      glow.addColorStop(1, 'rgba(127,212,255,0)');
      CTX.fillStyle = glow;
      CTX.beginPath(); CTX.arc(gx, gy - 20, 52, 0, 6.283); CTX.fill();
      CTX.drawImage(IMG.stele, gx - sz / 2, gy - sz + 10, sz, sz);
      npcDrawn = true;
    } else if (n.kind === 'statue') {
      // 巫妖王拱形石碑：拱顶浮雕 + 基座 + 冷光
      const IW = 92, IH = 138;
      const bx = gx - IW / 2, by = gy - IH - 26;

      // 外发光
      const glow = CTX.createRadialGradient(gx, by + IH * 0.55, 6, gx, by + IH * 0.55, 92);
      glow.addColorStop(0, 'rgba(120,200,255,.20)');
      glow.addColorStop(1, 'rgba(120,200,255,0)');
      CTX.fillStyle = glow;
      CTX.beginPath(); CTX.arc(gx, by + IH * 0.55, 92, 0, 6.283); CTX.fill();

      // 拱形石碑背板（比贴图略大一圈，形成石边）
      const archPath = (x, y, w, h, pad) => {
        const r = w / 2;
        CTX.beginPath();
        CTX.moveTo(x - pad, y + h + pad);
        CTX.lineTo(x - pad, y + r);
        CTX.arc(x + r, y + r, r + pad, Math.PI, 0);
        CTX.lineTo(x + w + pad, y + h + pad);
        CTX.closePath();
      };
      CTX.fillStyle = '#2b3138';
      archPath(bx, by, IW, IH, 5); CTX.fill();
      CTX.strokeStyle = '#4e5763'; CTX.lineWidth = 2;
      archPath(bx, by, IW, IH, 5); CTX.stroke();

      // 浮雕贴图（自带拱形 alpha）
      if (imgReady('lichStatue')) {
        CTX.save();
        CTX.globalAlpha = 0.98;
        CTX.drawImage(IMG.lichStatue, bx, by, IW, IH);
        CTX.restore();
      }

      // 拱心石
      CTX.fillStyle = '#5a6472';
      CTX.beginPath();
      CTX.moveTo(gx - 6, by - 3); CTX.lineTo(gx + 6, by - 3); CTX.lineTo(gx + 4, by + 8); CTX.lineTo(gx - 4, by + 8);
      CTX.closePath(); CTX.fill();

      // 基座
      const py = by + IH + 5;
      CTX.fillStyle = '#3a4149';
      CTX.fillRect(bx - 8, py, IW + 16, 12);
      CTX.fillStyle = '#4d5561';
      CTX.fillRect(bx - 12, py + 12, IW + 24, 7);
      CTX.fillStyle = '#22272d';
      CTX.fillRect(bx - 12, py + 19, IW + 24, 3);
      CTX.fillStyle = '#5e6875';
      CTX.fillRect(bx - 8, py, IW + 16, 2);

      npcDrawn = true;
    } else if (n.kind === 'beastmaster') {
      // 驯兽师：绿色兽栏 + 爪印
      const cy = gy - 2;
      const glow = CTX.createRadialGradient(gx, cy - 30, 4, gx, cy - 30, 62);
      glow.addColorStop(0, 'rgba(143,212,138,.30)');
      glow.addColorStop(1, 'rgba(143,212,138,0)');
      CTX.fillStyle = glow;
      CTX.beginPath(); CTX.arc(gx, cy - 30, 62, 0, 6.283); CTX.fill();
      // 木栏
      CTX.fillStyle = '#4a3a24';
      CTX.fillRect(gx - 26, cy - 52, 52, 6);
      CTX.fillStyle = '#5e4a2e';
      for (let i = -2; i <= 2; i++) CTX.fillRect(gx + i * 11 - 2, cy - 52, 4, 52);
      // 爪印
      CTX.fillStyle = '#8fd48a';
      CTX.beginPath(); CTX.ellipse(gx, cy - 26, 8, 6, 0, 0, 6.283); CTX.fill();
      for (let i = -2; i <= 2; i++) {
        CTX.beginPath();
        CTX.ellipse(gx + i * 7, cy - 36 - Math.abs(i) * -1.2, 3, 4.2, 0, 0, 6.283);
        CTX.fill();
      }
      // 底座
      CTX.fillStyle = '#3a3020';
      CTX.fillRect(gx - 30, cy, 60, 7);
      npcDrawn = true;
    } else if (n.kind === 'heirloom') {
      // 传家宝：漂浮的金色古书
      const cy = gy - 4 + Math.sin(G.time * 2) * 4;
      const glow = CTX.createRadialGradient(gx, cy - 22, 3, gx, cy - 22, 50);
      glow.addColorStop(0, 'rgba(255,210,74,.4)');
      glow.addColorStop(1, 'rgba(255,210,74,0)');
      CTX.fillStyle = glow;
      CTX.beginPath(); CTX.arc(gx, cy - 22, 50, 0, 6.283); CTX.fill();
      // 书体
      CTX.fillStyle = '#6b3a1e';
      CTX.fillRect(gx - 24, cy - 46, 48, 40);
      CTX.fillStyle = '#8a4a26';
      CTX.fillRect(gx - 24, cy - 46, 48, 5);
      CTX.fillStyle = '#e8dcc0';
      CTX.fillRect(gx - 19, cy - 41, 38, 30);
      // 书页线
      CTX.fillStyle = '#c8b89a';
      for (let i = 0; i < 5; i++) CTX.fillRect(gx - 15, cy - 36 + i * 5, 30, 1);
      // 书脊
      CTX.fillStyle = '#c8973f';
      CTX.fillRect(gx - 3, cy - 46, 6, 40);
      // 书签
      CTX.fillStyle = '#ffd24a';
      CTX.fillRect(gx + 12, cy - 12, 6, 16);
      npcDrawn = true;
    } else if (n.kind === 'tutorial') {
      // 新手指引：绿色光晕 + 书卷
      const cy = gy - 4;
      const glow = CTX.createRadialGradient(gx, cy - 20, 3, gx, cy - 20, 44);
      glow.addColorStop(0, 'rgba(95,212,95,.35)');
      glow.addColorStop(1, 'rgba(95,212,95,0)');
      CTX.fillStyle = glow;
      CTX.beginPath(); CTX.arc(gx, cy - 20, 44, 0, 6.283); CTX.fill();
      // 底座
      CTX.fillStyle = '#3a5a30';
      CTX.beginPath(); CTX.ellipse(gx, cy, 20, 7, 0, 0, 6.283); CTX.fill();
      // 书卷
      CTX.fillStyle = '#d8e8c8';
      CTX.fillRect(gx - 14, cy - 34, 28, 32);
      CTX.strokeStyle = '#7aa86a'; CTX.lineWidth = 2;
      CTX.strokeRect(gx - 14, cy - 34, 28, 32);
      CTX.fillStyle = '#a8c898';
      for (let i = 0; i < 4; i++) CTX.fillRect(gx - 10, cy - 29 + i * 7, 20, 1.5);
      // 感叹号
      CTX.fillStyle = '#2e6b28';
      CTX.fillRect(gx - 3, cy - 30, 6, 12);
      CTX.beginPath(); CTX.arc(gx, cy - 15, 3.5, 0, 6.283); CTX.fill();
      npcDrawn = true;
    } else if (n.kind === 'notice') {
      // 公告牌：木柱 + 木板 + 纸张
      const cy = gy - 4;
      const glow = CTX.createRadialGradient(gx, cy - 30, 3, gx, cy - 30, 46);
      glow.addColorStop(0, 'rgba(255,210,74,.28)');
      glow.addColorStop(1, 'rgba(255,210,74,0)');
      CTX.fillStyle = glow;
      CTX.beginPath(); CTX.arc(gx, cy - 30, 46, 0, 6.283); CTX.fill();

      // 立柱
      CTX.fillStyle = '#5a3d1e';
      CTX.fillRect(gx - 5, cy - 22, 10, 26);
      // 板面
      CTX.fillStyle = '#7a5528';
      CTX.fillRect(gx - 30, cy - 58, 60, 40);
      CTX.fillStyle = '#8a6330';
      CTX.fillRect(gx - 30, cy - 58, 60, 5);
      CTX.strokeStyle = '#c8973f';
      CTX.lineWidth = 2;
      CTX.strokeRect(gx - 30, cy - 58, 60, 40);
      // 纸张
      CTX.fillStyle = '#e8dcc0';
      CTX.fillRect(gx - 23, cy - 51, 18, 24);
      CTX.fillRect(gx - 2, cy - 51, 18, 12);
      CTX.fillStyle = '#b8a888';
      for (let i = 0; i < 4; i++) CTX.fillRect(gx - 21, cy - 47 + i * 4, 14, 1);
      CTX.fillStyle = '#d24a3a';
      CTX.fillRect(gx - 6, cy - 36, 18, 1);
      CTX.fillRect(gx - 6, cy - 32, 14, 1);
      // 顶部小旗
      CTX.fillStyle = '#ffd24a';
      CTX.beginPath();
      CTX.moveTo(gx, cy - 58); CTX.lineTo(gx + 14, cy - 64); CTX.lineTo(gx, cy - 68);
      CTX.closePath(); CTX.fill();
      npcDrawn = true;
    } else if (n.kind === 'warehouse') {
      // 仓库：大木箱
      const cy = gy - 4;
      const glow = CTX.createRadialGradient(gx, cy - 16, 3, gx, cy - 16, 48);
      glow.addColorStop(0, 'rgba(200,151,63,.35)');
      glow.addColorStop(1, 'rgba(200,151,63,0)');
      CTX.fillStyle = glow;
      CTX.beginPath(); CTX.arc(gx, cy - 16, 48, 0, 6.283); CTX.fill();
      // 箱体
      CTX.fillStyle = '#6b4a24';
      CTX.fillRect(gx - 30, cy - 34, 60, 36);
      CTX.fillStyle = '#7d5a30';
      CTX.fillRect(gx - 30, cy - 34, 60, 6);
      // 箱盖
      CTX.fillStyle = '#8a6636';
      CTX.fillRect(gx - 32, cy - 42, 64, 12);
      CTX.fillStyle = '#a07b44';
      CTX.fillRect(gx - 32, cy - 42, 64, 4);
      // 铁包边
      CTX.fillStyle = '#c8973f';
      CTX.fillRect(gx - 30, cy - 22, 60, 3);
      CTX.fillRect(gx - 12, cy - 42, 5, 44);
      CTX.fillRect(gx + 8, cy - 42, 5, 44);
      // 锁扣
      CTX.fillStyle = '#ffd98a';
      CTX.fillRect(gx - 6, cy - 24, 12, 12);
      CTX.fillStyle = '#8a6d3f';
      CTX.fillRect(gx - 2, cy - 20, 4, 6);
      npcDrawn = true;
    } else if (n.kind === 'craft') {
      // 锻造台：铁砧 + 火光
      const fy = gy - 6;
      const glow = CTX.createRadialGradient(gx, fy, 2, gx, fy, 46);
      glow.addColorStop(0, 'rgba(255,150,60,.55)');
      glow.addColorStop(1, 'rgba(255,120,40,0)');
      CTX.fillStyle = glow;
      CTX.beginPath(); CTX.arc(gx, fy, 46, 0, 6.283); CTX.fill();
      CTX.fillStyle = '#4a4a52';
      CTX.fillRect(gx - 26, fy - 4, 52, 14);
      CTX.fillRect(gx - 12, fy + 8, 24, 14);
      CTX.fillStyle = '#6a6a74';
      CTX.fillRect(gx - 26, fy - 10, 52, 7);
      CTX.strokeStyle = '#22222a'; CTX.lineWidth = 2;
      CTX.strokeRect(gx - 26, fy - 4, 52, 14);
      CTX.restore = CTX.restore;
    } else {
      CTX.beginPath(); CTX.arc(gx, y, n.r, 0, 6.283);
      CTX.fillStyle = n.color; CTX.fill();
      CTX.lineWidth = 2.5; CTX.strokeStyle = '#f0e6c8'; CTX.stroke();
    }
  }

  // 雕像不显示名字（本身是地标，文字会盖住浮雕）
  if (n.kind !== 'statue') {
    CTX.font = '700 12px "KaiTi",serif';
    CTX.textAlign = 'center';
    CTX.lineWidth = 3.5; CTX.strokeStyle = 'rgba(0,0,0,.92)';
    CTX.strokeText(n.name, gx, y - n.r - 9);
    CTX.fillStyle = '#ffe6a8';
    CTX.fillText(n.name, gx, y - n.r - 9);
  }
}

/* ---------------- 通用 ---------------- */
function drawBar(cx, cy, w, h, pct, color, bg) {
  pct = clamp(pct, 0, 1);
  CTX.fillStyle = bg;
  CTX.fillRect(cx - w / 2, cy, w, h);
  CTX.fillStyle = color;
  CTX.fillRect(cx - w / 2, cy, w * pct, h);
  CTX.strokeStyle = 'rgba(0,0,0,.9)';
  CTX.lineWidth = 1;
  CTX.strokeRect(cx - w / 2 + .5, cy + .5, w - 1, h - 1);
}

function shade(hex, amt) {
  const n = parseInt(hex.replace('#', ''), 16);
  let r = (n >> 16) + amt, g = ((n >> 8) & 255) + amt, b = (n & 255) + amt;
  return `rgb(${clamp(r,0,255)|0},${clamp(g,0,255)|0},${clamp(b,0,255)|0})`;
}

function drawVignette() {
  const g = CTX.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.38, VW / 2, VH / 2, Math.max(VW, VH) * 0.78);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,.68)');
  CTX.fillStyle = g;
  CTX.fillRect(0, 0, VW, VH);
}

/* ---------------- 头像 ---------------- */
function drawPortrait(p) {
  const W = PRT.width, H = PRT.height;
  PRX.clearRect(0, 0, W, H);
  const cls = DATA.CLASSES[p.cls];
  const col = cls.color;

  // 背景
  const g = PRX.createRadialGradient(W * 0.42, H * 0.30, 4, W / 2, H * 0.62, W * 0.95);
  g.addColorStop(0, shade(col, 34));
  g.addColorStop(0.55, shade(col, -46));
  g.addColorStop(1, '#07080a');
  PRX.fillStyle = g;
  PRX.fillRect(0, 0, W, H);

  // 头像只展示「职业」：高清图集优先，其余用 CLASS_AVATAR
  const hi = (DATA.AVATAR_HD && DATA.AVATAR_HD[p.cls] !== undefined) ? DATA.AVATAR_HD[p.cls] : null;
  if (hi !== null && imgReady('avatarsHd')) {
    PRX.imageSmoothingEnabled = true;
    PRX.drawImage(IMG.avatarsHd, hi * 128, 0, 128, 128, 0, 0, W, H);
  } else if (imgReady('avatars') && DATA.CLASS_AVATAR[p.cls] !== undefined) {
    PRX.imageSmoothingEnabled = true;
    PRX.drawImage(IMG.avatars, DATA.CLASS_AVATAR[p.cls] * 64, 0, 64, 64, 0, 0, W, H);
  } else if (imgReady('units') && ['warrior','mage','archer','assassin'].indexOf(p.cls) >= 0) {
    const k = ['warrior','mage','archer','assassin'].indexOf(p.cls);
    const scale = Math.max(W / 32, H / 34) * 1.02;
    PRX.imageSmoothingEnabled = false;
    PRX.drawImage(IMG.units, k * 128, 0, 32, 48,
      (W - 32 * scale) / 2, (H - 48 * scale) / 2, 32 * scale, 48 * scale);
  } else {
    PRX.fillStyle = col;
    PRX.beginPath(); PRX.arc(W / 2, H / 2, W * 0.34, 0, 6.283); PRX.fill();
  }
}


