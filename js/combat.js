/* ============================================================
   战斗：伤害计算 / 普通攻击 / 技能释放 / 掉落
   ============================================================ */
'use strict';

const TIMERS = [];

function schedule(delay, fn) { TIMERS.push({ t: delay, fn }); }
function updateTimers(dt) {
  for (let i = TIMERS.length - 1; i >= 0; i--) {
    TIMERS[i].t -= dt;
    if (TIMERS[i].t <= 0) { const f = TIMERS[i].fn; TIMERS.splice(i, 1); f(); }
  }
}

/* ---------------- 伤害 ---------------- */
function damageMonster(m, amount, type, isDot) {
  if (!m.alive) return 0;
  const p = G.player;
  let dmg = amount;
  let crit = false;

  if (!isDot) {
    crit = p._forceCrit || Math.random() < p.stats.crit;
    p._forceCrit = false;
    if (crit) dmg *= p.stats.critDmg;
  }
  dmg = Math.max(1, Math.round(dmg));
  m.hp -= dmg;
  m.hitFlash = 0.12;

  if (!isDot) {
    floatText(m.x, m.y - m.r - 6,
      (crit ? '✦' : '') + dmg,
      crit ? '#ffd24a' : (type === 'skill' ? '#7fd4ff' : '#ffffff'),
      crit ? 22 : 16);
  }
  if (p.stats.lifesteal > 0 && !isDot) {
    const heal = Math.round(dmg * p.stats.lifesteal);
    if (heal > 0) { p.hp = Math.min(p.stats.hpMax, p.hp + heal); floatText(p.x, p.y - 30, '+' + heal, '#5fd45f', 14); }
  }
  if (m.hp <= 0) monsterDie(m);
  return dmg;
}

function damagePlayer(amount, source) {
  if (G.debug && G.debug.invincible) return;   // 调试：无敌
  const p = G.player;
  if (p.stats.invis > 0) return;
  if (Math.random() < p.stats.dodge) {
    floatText(p.x, p.y - 34, '闪避', '#9fe6b8', 15);
    return;
  }
  const dmg = Math.max(1, Math.round(amount * (1 - p.stats.dr)));
  p.hp -= dmg;
  floatText(p.x, p.y - 34, '-' + dmg, '#ff5a40', 17);
  burst(p.x, p.y, '#ff5a40', 4, 90);
  if (p.hp <= 0) playerDie();
}

function playerDie() {
  const p = G.player;
  if (p.dead) return;          // 防止一帧多次触发

  // 复活之戒
  if (consumeRevive(p)) {
    p.hp = Math.round(p.stats.hpMax * 0.5);
    p.mp = Math.round(p.stats.mpMax * 0.5);
    p.stats.invis = 3;
    floatText(p.x, p.y - 40, '复活！', '#f7e26b', 22);
    toast('✨ 复活之戒生效：原地复活（50% 生命）');
    logMsg('✨ 复活之戒触发', 'level');
    spawnVfx(p.x, p.y, '#f7e26b', 140, 'aoe', 0.8);
    return;
  }

  p.dead = true;
  if (G.tower && G.tower.active) { G.tower.active = false; G.tower.floor = 1; }
  p.hp = 0;
  logMsg('☠ 你倒下了……返回城镇', 'bad');
  toast('你被击败了，返回城镇');
  const lost = Math.floor(p.gold * 0.1);
  p.gold -= lost;
  if (lost > 0) logMsg(`损失金币 ${lost}`, 'bad');
  setTimeout(() => { p.dead = false; p.hp = p.stats.hpMax; p.mp = p.stats.mpMax; enterRoom(TOWN); }, 900);
}

/* ---------------- 普通攻击 ---------------- */
function playerAttack() {
  const p = G.player;
  if (!p || p.attackCd > 0) return;
  const atkSpeed = p.stats.as;
  p.attackCd = 1 / atkSpeed;
  p.attackAnim = 0.18;

  const w = G.world;
  const range = p.cls === 'warrior' || p.cls === 'assassin' ? 78 : 420;
  const ang = p.dir;

  // 找到朝向扇区内最近的怪
  let target = null, best = Infinity;
  for (const m of w.monsters) {
    if (!m.alive) continue;
    const d = dist(p, m);
    if (d > range + m.r) continue;
    const a = Math.atan2(m.y - p.y, m.x - p.x);
    let da = Math.abs(normalizeAngle(a - ang));
    if (da > 0.7 && d > 60) continue;
    if (d < best) { best = d; target = m; }
  }

  if (p.stats.isMagic || p.cls === 'archer') {
    // 远程：发射投射物
    w.projectiles.push({
      x: p.x + Math.cos(ang) * 22, y: p.y + Math.sin(ang) * 22,
      vx: Math.cos(ang) * 520, vy: Math.sin(ang) * 520,
      life: 0.9, dead: false, pierce: false, dmg: p.stats.power,
      color: p.stats.weaponFx === 'arrow' ? '#d8f0ff'
           : (p.stats.weaponFx === 'spell' ? '#9f7fff' : '#ffe08a'),
      shape: (p.cls === 'archer') ? 'arrow'
           : (p.stats.weaponFx === 'arrow' ? 'arrow'
           : (p.stats.weaponFx === 'spell' ? 'orb'
           : (p.stats.weaponFx === 'stab' ? 'blade' : 'bolt'))),
      hitSet: new Set(), isSkill: false
    });
    if (!target) { /* 空放 */ }
  } else if (target) {
    // 近战：直接判定
    damageMonster(target, p.stats.power, 'melee');
    burst(target.x, target.y, '#ffd24a', 5, 120);
  }
}

function normalizeAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/* ---------------- 技能释放 ---------------- */
function castSkill(idx) {
  const p = G.player;
  castSkillImpl(p.active[idx]);
}

/* 按 QWERD 键位释放 */
function castSkillKey(k) {
  const p = G.player;
  if (!p) return;
  const key = (k === 'd') ? p.dash : (p.keymap ? p.keymap[k] : null);
  if (key) castSkillImpl(key);
}

const FX_OF = { melee:1, dash:1, proj:0, aoe:0, trap:2, buff:2, hit:2 };

function spawnVfx(x, y, color, radius, kind, life, skill) {
  const w = G.world; if (!w) return;
  if (!w.vfx) w.vfx = [];
  w.vfx.push({
    x, y, color, r: radius || 90, kind: kind || 'aoe', skill: skill || null,
    fx: FX_OF[kind] !== undefined ? FX_OF[kind] : 0,
    t: 0, life: life || 0.55,
    seed: Math.random() * 6.283
  });
}

function castSkillImpl(key) {
  const p = G.player;
  if (!key) return;
  // 施法特效（冷却中不触发）
  const _sp = DATA.SKILLS[key];
  if (_sp && (p.cd[key] || 0) <= 0) {
    const _col = (DATA.SKILL_COLOR && DATA.SKILL_COLOR[key]) || _sp.color || '#ffd24a';
    const _rad = _sp.radius ? _sp.radius * 42
               : (_sp.kind === 'proj' ? 42 : _sp.kind === 'blink' ? 90 : 110);

    // 落点：多段地面 AOE（暴风雪）指向最近敌人，其余以自身为中心
    let _tx = p.x, _ty = p.y;
    if (_sp.kind === 'aoe' && (_sp.hits || 1) > 1) {
      const t0 = nearestMonster(560);
      if (t0) { _tx = t0.x; _ty = t0.y; }
    }
    p._castX = _tx; p._castY = _ty;

    spawnVfx(_tx, _ty, _col, _rad, _sp.kind,
             _sp.kind === 'aoe' ? 0.95 : 0.6, key);
  }
  const sp = DATA.SKILLS[key];
  if (!sp || sp.type !== 'active') return;
  const lv = p.skills[key] || 1;
  const mul = 1 + (lv - 1) * 0.2;
  const cd = p.cd[key] || 0;
  if (cd > 0) { toast(`${sp.name} 冷却中 ${cd.toFixed(1)}s`); return; }
  if (p.mp < (sp.cost || 0)) { toast('法力不足'); return; }
  p.mp -= sp.cost || 0;
  p.cd[key] = (G.debug && G.debug.noCd) ? 1 : sp.cd;   // 调试：CD 固定 1 秒
  p.castAnim = 0.2;

  const w = G.world;
  const ang = p.dir;

  switch (sp.kind) {
    case 'aoe': {
      const hits = sp.hits || 1;
      const ax = (p._castX !== undefined) ? p._castX : p.x;
      const ay = (p._castY !== undefined) ? p._castY : p.y;
      const acol = (DATA.SKILL_COLOR && DATA.SKILL_COLOR[key]) || '#ffb347';
      for (let h = 0; h < hits; h++) {
        schedule(h * 0.28, () => {
          burst(ax, ay, acol, 14, 220);
          for (const m of w.monsters) {
            if (!m.alive) continue;
            if (Math.hypot(m.x - ax, m.y - ay) <= sp.radius * 42 + m.r) {
              damageMonster(m, p.stats.power * (p.stats.skillMul || 1) * sp.dmg * mul, 'skill');
              if (sp.freeze) m.frozen = Math.max(m.frozen, sp.freeze);
              if (sp.root) m.root = Math.max(m.root, sp.root);
            }
          }
        });
      }
      break;
    }
    case 'melee': {
      for (const m of w.monsters) {
        if (!m.alive) continue;
        const d = dist(p, m);
        if (d > sp.range * 32 + m.r) continue;
        const a = Math.atan2(m.y - p.y, m.x - p.x);
        if (Math.abs(normalizeAngle(a - ang)) > sp.arc / 2) continue;
        damageMonster(m, p.stats.power * (p.stats.skillMul || 1) * sp.dmg * mul, 'skill');
        if (sp.poison) m.poison = { dps: sp.poison.dps * mul, t: sp.poison.dur };
      }
      burst(p.x + Math.cos(ang) * 40, p.y + Math.sin(ang) * 40, '#b45cff', 10, 180);
      break;
    }
    case 'proj': {
      const count = sp.count || 1;
      for (let i = 0; i < count; i++) {
        const off = count === 1 ? 0 : (i - (count - 1) / 2) * (sp.spread || 0);
        const a = ang + off;
        w.projectiles.push({
          x: p.x + Math.cos(a) * 22, y: p.y + Math.sin(a) * 22,
          vx: Math.cos(a) * (sp.speed * 32), vy: Math.sin(a) * (sp.speed * 32),
          life: 1.2, dead: false, pierce: !!sp.pierce,
          dmg: p.stats.power * (p.stats.skillMul || 1) * sp.dmg * mul,
          color: p.cls === 'mage' ? '#ff8a3d' : '#a8ffb0',
          burn: sp.burn ? { dps: sp.burn.dps * mul, dur: sp.burn.dur } : null,
          hitSet: new Set(), isSkill: true
        });
      }
      break;
    }
    case 'dash': {
      const target = nearestMonster(600);
      const a = target ? Math.atan2(target.y - p.y, target.x - p.x) : ang;
      const d = sp.range ? sp.range * 32 : 200;
      p.x += Math.cos(a) * d; p.y += Math.sin(a) * d;
      if (target) {
        damageMonster(target, p.stats.power * (p.stats.skillMul || 1) * sp.dmg * mul, 'skill');
        if (sp.stun) target.stun = Math.max(target.stun, sp.stun);
      }
      burst(p.x, p.y, '#ffd24a', 12, 200);
      break;
    }
    case 'blink': {
      const d = sp.dist * 32;
      const a = (p.cls === 'archer') ? ang + Math.PI : ang;
      p.x += Math.cos(a) * d; p.y += Math.sin(a) * d;
      p.x = clamp(p.x, p.r, w.W - p.r); p.y = clamp(p.y, p.r, w.H - p.r);
      burst(p.x, p.y, '#7fd4ff', 14, 200);
      break;
    }
    case 'buff': {
      p.buffs.push({ ...sp.buff, t: sp.buff.dur });
      if (sp.buff.invis) p.stats.invis = sp.buff.dur;
      if (sp.buff.nextCrit) p._forceCrit = true;
      recalcStats(p);
      burst(p.x, p.y, '#9fe6b8', 12, 160);
      break;
    }
    case 'trap': {
      w.traps.push({ x: p.x, y: p.y, r: sp.radius * 32, life: 30, armed: 0.4,
                     dmg: p.stats.power * (p.stats.skillMul || 1) * sp.dmg * mul, root: sp.root, dead: false });
      break;
    }
  }
  logMsg(`✦ 释放 ${sp.name}`, 'skill');
}

function nearestMonster(maxDist) {
  const p = G.player; let best = null, bd = maxDist;
  for (const m of G.world.monsters) {
    if (!m.alive) continue;
    const d = dist(p, m);
    if (d < bd) { bd = d; best = m; }
  }
  return best;
}

function onProjectileHit(pr, m) {
  const p = G.player;
  let dmg = pr.dmg;
  if (p._forceCrit) { m.hp -= 1; }
  damageMonster(m, dmg, 'skill');
  if (pr.burn) m.burn = { dps: pr.burn.dps, t: pr.burn.dur };
  burst(m.x, m.y, pr.color, 6, 130);
}

function triggerTrap(t, m) {
  t.dead = true;
  for (const mm of G.world.monsters) {
    if (!mm.alive) continue;
    if (dist2(t, mm) < (t.r + mm.r) * (t.r + mm.r)) {
      damageMonster(mm, t.dmg, 'skill');
      mm.root = Math.max(mm.root, t.root);
    }
  }
  burst(t.x, t.y, '#7fd4ff', 16, 220);
}

/* ---------------- 怪物死亡 / 掉落 ---------------- */
function monsterDie(m) {
  if (!m.alive) return;
  m.alive = false;
  const p = G.player;
  burst(m.x, m.y, m.color, m.isBoss ? 30 : 10, m.isBoss ? 300 : 160);
  p.kills++;
  if (m.isBoss) {
    p.bossKills++;
    logMsg(`★ 击杀 BOSS：${m.name}`, 'boss');
    toast(`击杀 ${m.name}！`);
  }
  gainExp(p, m.exp);

  // 击杀回蓝 / 击杀加速
  if (p.stats.killMana) p.mp = Math.min(p.stats.mpMax, p.mp + p.stats.mpMax * p.stats.killMana);
  if (p.stats.killAs) { p.buffs.push({ asPct: p.stats.killAs, t: 3 }); recalcStats(p); }

  onMonsterKilled(m);
  dropLoot(m);
}

function dropLoot(m) {
  const w = G.world, p = G.player;
  const d = DATA.DIFFICULTY[G.diff];
  const dropMul = d.dropMul;
  const ilvl = m.level;

  const push = (obj) => {
    const a = Math.random() * Math.PI * 2, r = rnd(10, 46);
    w.drops.push({ x: m.x + Math.cos(a) * r, y: m.y + Math.sin(a) * r, life: 45, taken: false, ...obj });
  };

  // 金币
  if (Math.random() < (m.isBoss ? 1 : 0.8)) {
    let g = Math.round(rnd(m.gold[0], m.gold[1]) * dropMul * (1 + p.stats.goldBonus));
    push({ type: 'gold', gold: g, color: '#ffd24a', label: `${g} 金` });
  }
  // 装备
  const eqChance = (m.isBoss ? 1 : 0.35) * dropMul;
  if (Math.random() < eqChance) {
    const slot = pick(DATA.LOOT_SLOTS);
    const q = m.isBoss
      ? rollQuality(DATA.BOSS_WEIGHTS)
      : rollQuality(Object.fromEntries(DATA.QUALITY.map(x => [x.key, x.weight])));
    push({ type: 'item', item: makeItem(slot, ilvl, q, p.stats.isMagic), color: DATA.QUALITY.find(x => x.key === q).color });
  }
  // 技能书
  const bookChance = (m.isBoss ? 0.30 : 0.02) * dropMul;
  if (Math.random() < bookChance) {
    const mySkills = DATA.CLASSES[p.cls].skills;
    const pool = mySkills.filter(k => (p.skills[k] || 0) < 5);
    if (pool.length) {
      const k = pick(pool);
      push({ type: 'skillbook', skill: k, color: '#b45cff', label: DATA.SKILLS[k].name });
    }
  }
  // 属性书
  const attrChance = (m.isBoss ? 0.15 : 0.01) * dropMul;
  if (Math.random() < attrChance) {
    const k = pick(['str', 'agi', 'int']);
    push({ type: 'attrbook', stat: k, color: DATA.BOOKS[k].color, label: DATA.BOOKS[k].name });
  }
  // 药水
  if (Math.random() < (m.isBoss ? 1 : 0.15)) {
    push({ type: 'potion', potion: pick(DATA.POTIONS), color: '#5fd45f' });
  }
}

function pickupDrop(d) {
  const p = G.player;
  d.taken = true;
  if (d.type === 'gold') {
    p.gold += d.gold;
    floatText(d.x, d.y - 10, `+${d.gold} 金`, '#ffd24a', 15);
  } else if (d.type === 'item') {
    // 自动出售：比身上差的直接折现
    if (G.autoSell && isWorseThanEquipped(p, d.item)) {
      const q = DATA.QUALITY.find(x => x.key === d.item.qKey);
      const price = Math.round((20 + d.item.ilvl * 8) * Math.pow(2.2, DATA.QUALITY.indexOf(q)));
      p.gold += price;
      floatText(d.x, d.y - 10, `+${price} 金`, '#ffd24a', 12);
      return;
    }
    const dCP = equipDeltaPower(p, d.item);
    if (addToBag(p, d.item)) {
      logMsg(`拾取 [${d.item.qName}] ${d.item.name}${dCP>0?' ▲战力+'+dCP:''}`, 'loot');
      floatText(d.x, d.y - 10, d.item.name, d.item.color, 14);
    }
  } else if (d.type === 'skillbook') {
    const r = learnSkill(p, d.skill);
    if (r === 'new') { toast(`学会新技能：${DATA.SKILLS[d.skill].name}`); logMsg(`学会技能 ${DATA.SKILLS[d.skill].name}`, 'skill'); }
    else if (r === 'up') { toast(`${DATA.SKILLS[d.skill].name} 升级！`); }
    else toast('技能已满级');
  } else if (d.type === 'attrbook') {
    p.bonus[d.stat] = (p.bonus[d.stat] || 0) + 1;
    recalcStats(p);
    toast(`${DATA.BOOKS[d.stat].name} 使用：${d.stat.toUpperCase()} +1`);
    logMsg(`永久属性提升：${d.stat.toUpperCase()} +1`, 'level');
  } else if (d.type === 'potion') {
    addToBag(p, { ...d.potion, type: 'potion', count: 1 });
    floatText(d.x, d.y - 10, d.potion.name, '#9fe6b8', 13);
  }
}
