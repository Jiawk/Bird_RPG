/* ============================================================
   世界：房间 / 怪物 / 掉落 / NPC / 投射物
   ============================================================ */
'use strict';

const RESPAWN_NORMAL = 15;    // 秒（本次减半）
const RESPAWN_BOSS = 300;     // 秒

let ENTITY_ID = 1;
const nextId = () => ENTITY_ID++;

/* ---------------- 进入房间 ---------------- */
function enterRoom(roomId) {
  if (G.player) G.player.dead = false;

  // 进战斗图自动开启「自动攻击 + 自动技能」
  if (roomId !== TOWN && typeof AUTO !== 'undefined') {
    const wasOff = !AUTO.atk || !AUTO.skill;
    AUTO.atk = true;
    AUTO.skill = true;
    if (wasOff && typeof toast === 'function') toast('已自动开启 自动攻击(A) + 自动技能(S)');
  }
  // 爬塔层也自动开
  if (G.tower && G.tower.active && typeof AUTO !== 'undefined') {
    AUTO.atk = true; AUTO.skill = true;
  }
  const p = G.player;
  p.room = roomId;
  const isTown = roomId === TOWN;
  const W = isTown ? 1240 : 1440;
  const H = isTown ? 880 : 1020;

  G.world = {
    roomId, isTown, W, H,
    monsters: [], projectiles: [], drops: [], traps: [], npcs: [],
    bossAlive: false, bossRespawnAt: 0,
    spawnTimer: 0,
    floats: [],   // 飘字
    particles: [],
    props: []
  };

  const w = G.world;   // 局部别名

  // 场景装饰（按房间种子生成，每次进入一致）
  w.props = [];
  let seed = (roomId + 1) * 9973 + 17;
  const srnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const nProp = isTown ? 16 : 26;
  for (let i = 0; i < nProp; i++) {
    const roll = srnd();
    const type = roll < 0.18 ? 'torch' : (roll < 0.80 ? 'rock' : 'bone');
    w.props.push({
      type,
      x: 90 + srnd() * (W - 180),
      y: 90 + srnd() * (H - 180),
      r: 5 + srnd() * 11,
      rot: srnd() * 6.28,
      seed: srnd() * 10
    });
  }

  if (isTown) {
    buildTown();
    p.x = W / 2; p.y = H * 0.80;
  } else {
    const room = DATA.ROOMS[roomId];
    // 玩家从下往上打
    p.x = W / 2; p.y = H * 0.85;
    spawnWave(room);
    spawnBoss(room);
  }
  p.dir = -Math.PI / 2;
}

/* ---------------- 城镇 ---------------- */
function buildTown() {
  const w = G.world;
  const W = w.W, H = w.H;
  const P = (fx, fy) => ({ x: W * fx, y: H * fy });
  w.npcs = [
    { id: nextId(), kind: 'teleport', name: '传送员 · 岳跃冲', ...P(0.30, 0.30), r: 24, color: '#7fb3d5' },
    { id: nextId(), kind: 'merchant', name: '商人 · 赵帅帅',     ...P(0.50, 0.22), r: 24, color: '#e0c060' },
    { id: nextId(), kind: 'exchange', name: '抽奖专员 · 李准',   ...P(0.70, 0.30), r: 24, color: '#b07de0' },
    { id: nextId(), kind: 'blacksmith',name:'铁匠 · 范在英',   ...P(0.38, 0.58), r: 24, color: '#d06a3a' },
    { id: nextId(), kind: 'save',     name: '存档石碑',        ...P(0.62, 0.58), r: 24, color: '#9fe6b8' },
    { id: nextId(), kind: 'quest',    name: '任务官 · 黄仁勋',    ...P(0.50, 0.42), r: 24, color: '#ff9a6b' },
    { id: nextId(), kind: 'craft',    name: '锻造台',          ...P(0.72, 0.60), r: 24, color: '#c9a24a' },
    { id: nextId(), kind: 'tower',    name: '试炼之塔 · 入口',  ...P(0.30, 0.62), r: 26, color: '#b45cff' },
    { id: nextId(), kind: 'warehouse',name: '仓库 · 大木箱',      ...P(0.62, 0.32), r: 26, color: '#c8973f' }
  ];
}

/* ---------------- 生成怪物 ---------------- */
function makeMonster(kindKey, x, y, isBoss, level, diff, isElite) {
  const tpl = (isBoss ? DATA.BOSSES : DATA.MONSTERS)[kindKey];
  const d = DATA.DIFFICULTY[diff] || DATA.DIFFICULTY.normal;
  let hpMul = d.hpMul, atkMul = d.atkMul, expMul = d.expMul || 1;
  // 爬塔倍率
  if (G.tower && G.tower.active) {
    hpMul *= DATA.TOWER.hpMul(G.tower.floor);
    atkMul *= DATA.TOWER.atkMul(G.tower.floor);
    if (DATA.TOWER.levelOf) level = DATA.TOWER.levelOf(G.tower.floor, G.player ? G.player.level : 1);
    expMul *= 1 + G.tower.floor * 0.15;
  }
  // 精英
  if (isElite) { hpMul *= 2.6; atkMul *= 1.6; expMul *= 3; }
  const hp = Math.round(tpl.hp * hpMul);
  const atk = Math.round(tpl.atk * atkMul);
  return {
    id: nextId(), kind: kindKey, name: (isElite ? '精英·' : '') + tpl.name,
    isBoss: !!isBoss, isElite: !!isElite, title: tpl.title || '',
    x, y, r: tpl.r * (isElite ? 1.25 : 1), color: tpl.color,
    hp, hpMax: hp, atk,
    spd: tpl.spd * 60,          // px/s
    exp: Math.round(tpl.exp * expMul),
    gold: isElite ? [tpl.gold[0]*3, tpl.gold[1]*3] : tpl.gold,
    level,
    alive: true,
    attackCd: 0, attackSpeed: isBoss ? 1.4 : 1.1,
    stun: 0, root: 0, slow: 0, frozen: 0,
    burn: null, poison: null,
    aggro: false,
    hitFlash: 0,
    respawnAt: 0,
    phase: Math.random() * Math.PI * 2,
    // 游荡
    homeX: x, homeY: y,
    wanderX: x, wanderY: y,
    wanderCd: 0.6 + Math.random() * 2.2,
    wandering: false,
    faceAng: Math.random() * Math.PI * 2
  };
}

function spawnWave(room) {
  if (G.tower && G.tower.active) return;   // 爬塔层不补怪
  const w = G.world;
  const normal = w.monsters.filter(m => !m.isBoss && !m.isElite && m.alive).length;
  const elite  = w.monsters.filter(m => m.isElite && m.alive).length;
  const needN = (room.count || 50) - normal;
  const needE = (room.elite || 20) - elite;
  for (let i = 0; i < needN; i++) {
    const pos = randomSpawnPos(w, true);
    w.monsters.push(makeMonster(room.mons, pos.x, pos.y, false, room.lv, G.diff, false));
  }
  for (let i = 0; i < needE; i++) {
    const pos = randomSpawnPos(w, true);
    w.monsters.push(makeMonster(room.mons, pos.x, pos.y, false, room.lv, G.diff, true));
  }
}

function spawnBoss(room) {
  const w = G.world;
  const alive = w.monsters.filter(m => m.isBoss && m.alive).length;
  const want = room.bosses || 2;
  for (let i = alive; i < want; i++) {
    const pos = randomSpawnPos(w, false);
    const b = makeMonster(room.boss, pos.x, pos.y, true, room.lv + 3, G.diff);
    if (i > 0) {                       // 第二只做小 BOSS
      b.hp = Math.round(b.hp * 0.6); b.hpMax = b.hp;
      b.atk = Math.round(b.atk * 0.8);
      b.name = '幼·' + b.name;
      b.isMinorBoss = true;
    }
    w.monsters.push(b);
    w.bossAlive = true;
  }
}

function randomSpawnPos(w, awayFromPlayer) {
  const p = G.player;
  let x, y, tries = 0;
  do {
    x = rnd(80, w.W - 80);
    y = rnd(80, w.H - 200);
    tries++;
  } while (awayFromPlayer && p && dist({ x, y }, p) < 260 && tries < 40);
  return { x, y };
}

/* ---------------- 每帧更新 ---------------- */
function updateWorld(dt) {
  const w = G.world, p = G.player;
  if (!w) return;

  updateMonsters(dt);
  updateProjectiles(dt);
  updateDrops(dt);
  updateTraps(dt);
  updateFloats(dt);
  updateParticles(dt);

  // 小怪补刷
  if (!w.isTown) {
    const room = DATA.ROOMS[w.roomId];
    w.spawnTimer -= dt;
    if (w.spawnTimer <= 0) {
      w.spawnTimer = (G.debug && G.debug.fastSpawn) ? 1 : RESPAWN_NORMAL;   // 调试：1 秒刷怪
      const alive = w.monsters.filter(m => !m.isBoss && m.alive).length;
      if (alive < room.count) spawnWave(room);
    }
    // BOSS 补刷
    if (!w.monsters.some(m => m.isBoss && m.alive)) {
      if (w.bossRespawnAt === 0) w.bossRespawnAt = G.time + RESPAWN_BOSS;
      else if (G.time >= w.bossRespawnAt) { spawnBoss(room); w.bossRespawnAt = 0; }
    } else w.bossRespawnAt = 0;
  }

  // 怪物尸体清理
  w.monsters = w.monsters.filter(m => m.alive || m.isBoss);
}

function updateMonsters(dt) {
  const w = G.world, p = G.player;
  for (const m of w.monsters) {
    if (!m.alive) continue;
    m.hitFlash = Math.max(0, m.hitFlash - dt);
    if (m.stun > 0) { m.stun -= dt; continue; }
    if (m.frozen > 0) { m.frozen -= dt; continue; }

    // DOT
    if (m.burn) {
      m.burn.t -= dt;
      damageMonster(m, m.burn.dps * dt * p.stats.power, 'burn', true);
      if (m.burn.t <= 0) m.burn = null;
    }
    if (m.poison) {
      m.poison.t -= dt;
      damageMonster(m, m.poison.dps * dt * p.stats.power, 'poison', true);
      if (m.poison.t <= 0) m.poison = null;
    }
    if (!m.alive) continue;

    const d = dist(m, p);
    const aggroRange = m.isBoss ? 9999 : (m.isElite ? 360 : 280);
    if (!m.aggro && d < aggroRange) m.aggro = true;

    // 未被激怒：在出生点附近小幅来回走
    if (!m.aggro) {
      m.wandering = false;
      if (!m.isBoss) {
        m.wanderCd -= dt;
        if (m.wanderCd <= 0) {
          m.wanderCd = 1.6 + Math.random() * 2.6;
          const a = Math.random() * Math.PI * 2;
          const rr = 26 + Math.random() * 46;
          m.wanderX = m.homeX + Math.cos(a) * rr;
          m.wanderY = m.homeY + Math.sin(a) * rr;
        }
        const dx = m.wanderX - m.x, dy = m.wanderY - m.y;
        const dd = Math.hypot(dx, dy);
        if (dd > 5 && m.root <= 0) {
          const wspd = m.spd * 0.34;
          m.x += (dx / dd) * wspd * dt;
          m.y += (dy / dd) * wspd * dt;
          m.faceAng = Math.atan2(dy, dx);
          m.wandering = true;
        }
      }
    }

    if (m.aggro) {
      const spd = m.spd * (m.root > 0 ? 0 : 1);
      if (m.root > 0) m.root -= dt;
      if (d > m.r + p.r + 4) {
        const ang = Math.atan2(p.y - m.y, p.x - m.x);
        m.faceAng = ang;
        m.x += Math.cos(ang) * spd * dt;
        m.y += Math.sin(ang) * spd * dt;
      } else {
        m.attackCd -= dt;
        if (m.attackCd <= 0) {
          m.attackCd = 1 / m.attackSpeed;
          damagePlayer(m.atk, m);
        }
      }
    }
    m.x = clamp(m.x, m.r, w.W - m.r);
    m.y = clamp(m.y, m.r, w.H - m.r);
  }
}

function updateProjectiles(dt) {
  const w = G.world;
  for (const pr of w.projectiles) {
    if (pr.dead) continue;
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    pr.life -= dt;
    if (pr.life <= 0 || pr.x < 0 || pr.y < 0 || pr.x > w.W || pr.y > w.H) { pr.dead = true; continue; }
    for (const m of w.monsters) {
      if (!m.alive) continue;
      if (pr.hitSet.has(m.id)) continue;
      if (dist2(pr, m) < (m.r + 8) * (m.r + 8)) {
        onProjectileHit(pr, m);
        pr.hitSet.add(m.id);
        if (!pr.pierce) { pr.dead = true; break; }
      }
    }
  }
  w.projectiles = w.projectiles.filter(x => !x.dead);
}

function updateTraps(dt) {
  const w = G.world;
  for (const t of w.traps) {
    if (t.dead) continue;
    t.life -= dt;
    if (t.life <= 0) { t.dead = true; continue; }
    if (t.armed > 0) { t.armed -= dt; continue; }
    for (const m of w.monsters) {
      if (!m.alive) continue;
      if (dist2(t, m) < (t.r + m.r) * (t.r + m.r)) { triggerTrap(t, m); break; }
    }
  }
  w.traps = w.traps.filter(t => !t.dead);
}

function updateDrops(dt) {
  const w = G.world, p = G.player;
  for (const d of w.drops) {
    if (d.taken) continue;
    d.life -= dt;
    d.age = (d.age || 0) + dt;
    if (d.life <= 0) { d.taken = true; continue; }
    d.bob = (d.bob || 0) + dt * 3;
    // 全屏自动拾取：落地 0.7 秒后自动收走（留一点时间让你看见掉落物）
    if (G.autoPickup) {
      if (d.age > 0.7) { pickupDrop(d); continue; }
    } else if (dist(d, p) < 42) {
      pickupDrop(d);
    }
  }
  w.drops = w.drops.filter(d => !d.taken);
}

function updateFloats(dt) {
  const w = G.world;
  for (const f of w.floats) { f.t -= dt; f.y -= 40 * dt; }
  w.floats = w.floats.filter(f => f.t > 0);
}

function updateParticles(dt) {
  const w = G.world;
  for (const pt of w.particles) {
    pt.t -= dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt;
    pt.vx *= 0.94; pt.vy *= 0.94;
  }
  w.particles = w.particles.filter(pt => pt.t > 0);
}

/* ---------------- 飘字 / 粒子 ---------------- */
function floatText(x, y, text, color, size) {
  if (!G.world) return;
  G.world.floats.push({ x, y, text, color: color || '#fff', t: 0.9, size: size || 16 });
}

function burst(x, y, color, n, speed) {
  if (!G.world) return;
  n = n || 8;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = rnd(40, speed || 160);
    G.world.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: rnd(0.25, 0.6), color, r: rnd(2, 4) });
  }
}
