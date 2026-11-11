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

  // 召唤灵兽
  if (G.pet) {
    const pxp = px(G.pet.x), pyp = py(G.pet.y) - 16 + Math.sin(G.pet.phase * 3) * 4;
    const g = CTX.createRadialGradient(pxp, pyp, 1, pxp, pyp, 22);
    g.addColorStop(0, 'rgba(74,212,255,.9)');
    g.addColorStop(1, 'rgba(74,212,255,0)');
    CTX.fillStyle = g;
    CTX.beginPath(); CTX.arc(pxp, pyp, 22, 0, 6.283); CTX.fill();
    CTX.fillStyle = '#e8fbff';
    CTX.beginPath(); CTX.arc(pxp, pyp, 7, 0, 6.283); CTX.fill();
    CTX.strokeStyle = '#4ad4ff'; CTX.lineWidth = 2;
    CTX.beginPath(); CTX.arc(pxp, pyp, 11, 0, 6.283); CTX.stroke();
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
  const room = w.isTown ? null : DATA.ROOMS[w.roomId];
  const bg = w.isTown ? '#161d16' : room.bg;
  const tint = w.isTown ? '#2b3a24' : room.accent;

  CTX.fillStyle = bg;
  CTX.fillRect(0, 0, VW, VH);

  // 主题背景图（水墨版）优先
  const bgImg = IMG.bgs ? IMG.bgs[(w.isTown ? 0 : (w.roomId + 1)) % IMG.bgs.length] : null;
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
function drawPlayer(p) {
  const gx = px(p.x), gy = py(p.y);
  const cls = DATA.CLASSES[p.cls], race = DATA.RACES[p.race];
  const clsIdx = ['warrior','mage','archer','assassin'].indexOf(p.cls);

  selRing(gx, gy, 24, 11, '#7fd45a');

  CTX.fillStyle = 'rgba(0,0,0,.5)';
  CTX.beginPath(); CTX.ellipse(gx, gy, 15, 15 * YS * 0.55, 0, 0, 6.283); CTX.fill();

  const moved = Math.hypot(p.x - (p._lx ?? p.x), p.y - (p._ly ?? p.y)) > 0.4;
  const S = 1.45, sw = U_FRAME_W * S, sh = U_FRAME_H * S;

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

  const MON_IDX = { centaur:8, kobold:9, grunt:10, skeleton:11, doomguard:12, abyssal:13 };
  if (!drawn && imgReady('units')) {
    const S = m.isBoss ? 2.9 : (m.isElite ? 1.6 : 1.35);
    const sw = U_FRAME_W * S, sh = U_FRAME_H * S;
    const BOSS_IDX = { bossWolf:8, bossKobold:9, bossGrom:10, bossKel:11, bossMannoroth:12, bossArchimonde:13 };
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

function drawProjectile(pr) {
  const x = px(pr.x), y = py(pr.y) - 18;
  const ang = Math.atan2(pr.vy, pr.vx);

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
function drawVfx(w) {
  if (!w.vfx || !w.vfx.length) return;
  for (let i = w.vfx.length - 1; i >= 0; i--) {
    const e = w.vfx[i];
    e.t += 1 / 60;
    if (e.t >= e.life) { w.vfx.splice(i, 1); continue; }
    const k = e.t / e.life, a = 1 - k;
    const gx = px(e.x), gy = py(e.y), x = gx, y = gy - 16;
    const R = e.r * (0.25 + k * 1.15);

    CTX.save();

    // ---- 特效帧（贴图） ----
    if (imgReady('fx')) {
      const sc = e.kind === 'hit' ? (0.45 + k * 0.55) : (0.45 + k * 1.15);
      const sz = FX_SIZE * sc;
      CTX.globalAlpha = e.kind === 'hit' ? a : a * 0.95;
      CTX.translate(gx, gy - 20);
      if (e.fx !== 0) CTX.rotate(k * 0.9);
      CTX.imageSmoothingEnabled = false;
      CTX.drawImage(IMG.fx, e.fx * FX_SIZE, 0, FX_SIZE, FX_SIZE, -sz / 2, -sz / 2, sz, sz);
      CTX.setTransform(DPR, 0, 0, DPR, 0, 0);
      CTX.globalAlpha = 1;
    }

    // 地面冲击环
    CTX.globalAlpha = a * 0.9;
    CTX.strokeStyle = e.color;
    CTX.lineWidth = 3 + 4 * a;
    CTX.beginPath(); CTX.ellipse(gx, gy, R, R * YS, 0, 0, 6.283); CTX.stroke();
    // 内圈
    CTX.globalAlpha = a * 0.4;
    CTX.lineWidth = 1.5;
    CTX.beginPath(); CTX.ellipse(gx, gy, R * 0.6, R * 0.6 * YS, 0, 0, 6.283); CTX.stroke();
    // 光晕
    const gr = CTX.createRadialGradient(x, y, 2, x, y, R * 0.95);
    gr.addColorStop(0, e.color);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    CTX.globalAlpha = a * 0.38;
    CTX.fillStyle = gr;
    CTX.beginPath(); CTX.arc(x, y, R * 0.95, 0, 6.283); CTX.fill();
    // 放射线
    CTX.globalAlpha = a * 0.75;
    CTX.strokeStyle = e.color;
    CTX.lineWidth = 2;
    for (let sp = 0; sp < 8; sp++) {
      const ang = sp * Math.PI / 4 + k * 1.1;
      CTX.beginPath();
      CTX.moveTo(x + Math.cos(ang) * R * 0.35, y + Math.sin(ang) * R * 0.35 * YS);
      CTX.lineTo(x + Math.cos(ang) * R * 1.0, y + Math.sin(ang) * R * 1.0 * YS);
      CTX.stroke();
    }
    // 中心闪光
    CTX.globalAlpha = a * a;
    CTX.fillStyle = '#fff';
    CTX.beginPath(); CTX.arc(x, y, 10 * (1 - k) + 3, 0, 6.283); CTX.fill();
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

  const NPC_IDX = { teleport:4, merchant:5, exchange:6, blacksmith:7, quest:0, tower:2 };
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

  CTX.font = '700 12px "KaiTi",serif';
  CTX.textAlign = 'center';
  CTX.lineWidth = 3.5; CTX.strokeStyle = 'rgba(0,0,0,.92)';
  CTX.strokeText(n.name, gx, y - n.r - 9);
  CTX.fillStyle = '#ffe6a8';
  CTX.fillText(n.name, gx, y - n.r - 9);
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
  const cls = DATA.CLASSES[p.cls], race = DATA.RACES[p.race];
  const col = cls.color;

  // 背景
  const g = PRX.createRadialGradient(W * 0.42, H * 0.30, 4, W / 2, H * 0.62, W * 0.95);
  g.addColorStop(0, shade(col, 34));
  g.addColorStop(0.55, shade(col, -46));
  g.addColorStop(1, '#07080a');
  PRX.fillStyle = g;
  PRX.fillRect(0, 0, W, H);

  const ri = DATA.RACE_AVATAR[p.race], ci = DATA.CLASS_AVATAR[p.cls];

  if (imgReady('avatars') && ri !== undefined) {
    // 种族头像铺满
    PRX.imageSmoothingEnabled = true;
    PRX.drawImage(IMG.avatars, ri * 64, 0, 64, 64, 0, 0, W, H);

    // 右下角职业头像小徽章
    if (ci !== undefined) {
      const bs = 34, bx = W - bs - 2, by = H - bs - 2;
      PRX.save();
      PRX.beginPath(); PRX.arc(bx + bs / 2, by + bs / 2, bs / 2, 0, 6.283); PRX.clip();
      PRX.drawImage(IMG.avatars, ci * 64, 0, 64, 64, bx, by, bs, bs);
      PRX.restore();
      PRX.strokeStyle = '#ffd24a'; PRX.lineWidth = 2;
      PRX.beginPath(); PRX.arc(bx + bs / 2, by + bs / 2, bs / 2, 0, 6.283); PRX.stroke();
    }
  } else if (imgReady('units') && ['warrior','mage','archer','assassin'].indexOf(p.cls) >= 0) {
    const k = ['warrior','mage','archer','assassin'].indexOf(p.cls);
    const scale = Math.max(W / 32, H / 34) * 1.02;
    PRX.imageSmoothingEnabled = false;
    PRX.drawImage(IMG.units, k * 128, 0, 32, 34, (W - 32 * scale) / 2, (H - 34 * scale) * 0.62, 32 * scale, 34 * scale);
  }

  // 底部压暗 + 名字
  const vg = PRX.createLinearGradient(0, H * 0.5, 0, H);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,.78)');
  PRX.fillStyle = vg;
  PRX.fillRect(0, H * 0.5, W, H * 0.5);

  PRX.font = '700 11px "KaiTi",serif';
  PRX.textAlign = 'center';
  PRX.lineWidth = 3; PRX.strokeStyle = 'rgba(0,0,0,.9)';
  PRX.strokeText(race.name, W / 2, H - 5);
  PRX.fillStyle = '#ffe6a8';
  PRX.fillText(race.name, W / 2, H - 5);

  PRX.strokeStyle = col; PRX.lineWidth = 2;
  PRX.strokeRect(1, 1, W - 2, H - 2);
}


