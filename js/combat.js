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
  // 圣物套装 5 件套：最终伤害 +6%
  if (!isDot && p.stats.finalDmg > 0) dmg *= (1 + p.stats.finalDmg);

  // 圣物武器：命中额外削掉目标 5% 最大生命
  if (!isDot && p.stats.relicPct > 0 && m.hpMax > 0) {
    dmg += Math.max(1, Math.round(m.hpMax * p.stats.relicPct));
  }
  dmg = Math.max(1, Math.round(dmg));
  m.hp -= dmg;
  m.hitFlash = 0.12;

  if (!isDot && type !== 'skill' && crit && typeof Sfx !== 'undefined') Sfx.play('crit');
  // 暴击星爆特效
  if (!isDot && crit && typeof spawnSpriteFx === 'function') {
    spawnSpriteFx('criticalhiteffect', m.x, m.y, { scale: 0.72, oy: 24 });
  }

  if (!isDot) {
    floatText(m.x, m.y - m.r - 6,
      (crit ? '✦' : '') + dmg,
      crit ? '#ffd24a' : (type === 'skill' ? '#7fd4ff' : '#ffffff'),
      crit ? 22 : 16);
  }
  const _hls = (typeof hltDyn === 'function') ? hltDyn(p).lifesteal : 0;
  if (p.stats.lifesteal + _hls > 0 && !isDot) {
    const heal = Math.round(dmg * (p.stats.lifesteal + _hls));
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
  // 荆棘光环：近战敌人攻击我方时受到反伤（远程/法术不触发）
  const _th = p.stats.auraThorns || 0;
  if (_th > 0 && source && source.isBoss !== undefined && source.hp > 0) {
    const isMelee = Math.hypot(source.x - p.x, source.y - p.y) < 120;
    if (isMelee) {
      const back = Math.max(1, Math.round(amount * _th));
      source.hp -= back;
      floatText(source.x, source.y - 24, '-' + back, '#9fe6b8', 13);
      if (source.hp <= 0) monsterDie(source);
    }
  }
  const _hdr = ((typeof hltDyn === 'function') ? hltDyn(p).dr : 0);
  const dmg = Math.max(1, Math.round(amount * (1 - Math.min(0.85, p.stats.dr + _hdr))));
  p.hp -= dmg;
  if (typeof Sfx !== 'undefined') Sfx.play('hurt');
  floatText(p.x, p.y - 34, '-' + dmg, '#ff5a40', 17);
  burst(p.x, p.y, '#ff5a40', 4, 90);
  if (p.hp <= 0) playerDie();
}

function playerDie() {
  const p = G.player;
  if (p.dead) return;          // 防止一帧多次触发
  if (typeof Sfx !== 'undefined') Sfx.play('playerDie');

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
  const fast = G.debug && G.debug.fastAtk;
  const HD = (typeof hltDyn === 'function') ? hltDyn(p) : { as:0, atkPct:0 };
  const atkSpeed = p.stats.as * (1 + HD.as + (p.stats.auraAs || 0)) * (fast ? 6 : 1);   // 传家宝叠攻速 + 光环
  p.attackCd = 1 / atkSpeed;
  if (typeof hltOnAttack === 'function') hltOnAttack(p);
  p.attackAnim = fast ? 0.06 : 0.18;
  if (typeof Sfx !== 'undefined') Sfx.play('attack');   // 普通攻击（挥砍）

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
    // 远程：发射投射物（橙弓「分裂箭」一次打 3 个不同目标）
    const shoot = (tgt, a2) => {
      const _ranged = (p.cls === 'mage' || p.cls === 'archer' || p.cls === 'priest') ? (p.stats.auraRangedAtk || 0) : 0;
      const dmg = p.stats.power * (1 + ((typeof hltDyn === 'function') ? hltDyn(p).atkPct : 0) + _ranged);
      w.projectiles.push({
        x: p.x + Math.cos(a2) * 22, y: p.y + Math.sin(a2) * 22,
        vx: Math.cos(a2) * 520, vy: Math.sin(a2) * 520,
        life: 0.9, dead: false, pierce: false, dmg,
        color: (p.cls === 'mage') ? '#ff7a2a'
             : (p.stats.weaponFx === 'arrow' ? '#d8f0ff'
             : (p.stats.weaponFx === 'spell' ? '#9f7fff' : '#ffe08a')),
        shape: (p.cls === 'archer') ? 'arrow'
             : (p.cls === 'mage') ? 'fireball'
             : (p.stats.weaponFx === 'arrow' ? 'arrow'
             : (p.stats.weaponFx === 'spell' ? 'orb'
             : (p.stats.weaponFx === 'stab' ? 'blade' : 'bolt'))),
        hitSet: new Set(), isSkill: false, target: tgt || null
      });
    };
    const nSplit = (p.stats.hltSplit || 0);
    if (nSplit > 1) {
      // 找出最近的 nSplit 个不同敌人
      const cand = w.monsters.filter(m => m.alive).map(m => ({ m, d: dist(p, m) }))
        .sort((x, y) => x.d - y.d).slice(0, nSplit);
      if (cand.length) {
        cand.forEach(c => shoot(c.m, Math.atan2(c.m.y - p.y, c.m.x - p.x)));
      } else shoot(null, ang);
    } else {
      shoot(target, ang);
    }
  } else if (target) {
    // 近战：直接判定
    const isMelee = (p.cls === 'warrior' || p.cls === 'assassin');
    if (isMelee) p.swingT = 0.26;   // 挥砍动作
    // 刀光：战士用橙金、刺客用青绿
    if (isMelee) {
      const fxKey = (p.cls === 'assassin') ? 'attack_daoguang1' : 'attack_daoguang2';
      spawnSpriteFx(fxKey, target.x, target.y, {
        scale: 0.85,
        rot: Math.atan2(target.y - p.y, target.x - p.x) + Math.PI / 2,
        oy: 22
      });
    }
    damageMonster(target, p.stats.power * (1 + ((typeof hltDyn === 'function') ? hltDyn(p).atkPct : 0)), 'melee');
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

/* 生成一个 SPINE 精灵表特效实例 */
function spawnSpriteFx(key, x, y, opt) {
  const w = G.world; if (!w) return;
  if (!w.vfx) w.vfx = [];
  const m = (typeof FX_META !== 'undefined') ? FX_META[key] : null;
  if (!m) return;
  const o = opt || {};
  w.vfx.push({
    kind: 'sprite', key, x, y,
    scale: o.scale === undefined ? 1 : o.scale,
    rot: o.rot || 0,
    oy: o.oy || 18,
    t: 0, life: m.frames / m.fps
  });
}

function castSkillImpl(key) {
  const p = G.player;
  if (!key) return;
  // 施法特效（冷却中不触发）
  const _sp = DATA.SKILLS[key];
  if (_sp && (p.cd[key] || 0) <= 0) {
    if (typeof Sfx !== 'undefined') Sfx.play(key === 'battleShout' ? 'beastRoar' : 'cast');
    const _col = (DATA.SKILL_COLOR && DATA.SKILL_COLOR[key]) || _sp.color || '#ffd24a';
    const _rMods = (typeof skillMods === 'function') ? skillMods(p, key) : { radiusMul:1 };
    const _rad = _sp.radius ? _sp.radius * 42 * _rMods.radiusMul
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
  const _mods = (typeof skillMods === 'function') ? skillMods(p, key)
              : { dmgMul:1, manaMul:1, radiusMul:1, cdMul:1, ctrlMul:1 };
  const _cost = Math.max(0, Math.round((sp.cost || 0) * _mods.manaMul));
  if (p.mp < _cost) { toast('法力不足'); return; }
  p.mp -= _cost;
  const _cdr = Math.min(0.6, p.stats.cdr || 0);           // 装备/词条的冷却缩减
  const _hltCdr = Math.min(0.5, p.stats.hltCdrExtra || 0);   // 传家宝：技能冷却 -50%
  p.cd[key] = (G.debug && G.debug.noCd) ? 1
      : sp.cd * _mods.cdMul * (1 - _cdr) * (1 - _hltCdr);     // 层数 + 冷却缩减 + 传家宝
  p.castAnim = 0.2;
  if (p.cls === 'warrior' || p.cls === 'assassin') p.swingT = 0.3;   // 技能也挥刀

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
            if (Math.hypot(m.x - ax, m.y - ay) <= sp.radius * 42 * _mods.radiusMul + m.r) {
              damageMonster(m, p.stats.power * (p.stats.skillMul || 1) * (1 + (p.stats.skillDmg || 0)) * (1 + ((typeof hltDyn === 'function') ? hltDyn(p).spellPct : 0)) * sp.dmg * mul * _mods.dmgMul, 'skill');
              if (sp.freeze) m.frozen = Math.max(m.frozen, sp.freeze * _mods.ctrlMul);
              if (sp.root) m.root = Math.max(m.root, sp.root * _mods.ctrlMul);
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
        damageMonster(m, p.stats.power * (p.stats.skillMul || 1) * (1 + (p.stats.skillDmg || 0)) * (1 + ((typeof hltDyn === 'function') ? hltDyn(p).spellPct : 0)) * sp.dmg * mul * _mods.dmgMul, 'skill');
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
    if (m.isBoss && typeof Sfx !== 'undefined') Sfx.play('bossDie');
    if (typeof perfAdd === 'function') perfAdd('k', 1);
  const p = G.player;
  burst(m.x, m.y, m.color, m.isBoss ? 30 : 10, m.isBoss ? 300 : 160);
  p.kills++;
  if (m.isBoss) {
    p.bossKills++;
    // 记录「哪个难度的 BOSS」→ 解锁更高难度
    p.bossKillsByDiff = p.bossKillsByDiff || {};
    const _d = G.diff || 'normal';
    const _was = p.bossKillsByDiff[_d] || 0;
    p.bossKillsByDiff[_d] = _was + 1;
    if (_was === 0) {
      if (_d === 'normal' && DATA.DIFF_UNLOCK.hell) {
        logMsg('🔓 已解锁「困难」难度', 'rare');
        toast('🔓 已解锁 困难难度！');
      } else if (_d === 'hard') {
        logMsg('🔓 已解锁「地狱」难度', 'rare');
        toast('🔓 已解锁 地狱难度！');
      }
    }
    logMsg(`★ 击杀 BOSS：${m.name}`, 'boss');
    toast(`击杀 ${m.name}！`);
    // 每日副本通关奖励
    const _rm = G.world ? getRoom(G.world.roomId) : null;
    if (m.isDailyBoss && _rm && _rm.daily) {
      grantDailyReward(_rm);
    }
  }
  gainExp(p, m.exp);

  // 击杀回蓝 / 击杀加速
  if (p.stats.killMana) p.mp = Math.min(p.stats.mpMax, p.mp + p.stats.mpMax * p.stats.killMana);
  if (p.stats.killAs) { p.buffs.push({ asPct: p.stats.killAs, t: 3 }); recalcStats(p); }

  onMonsterKilled(m);
  dropLoot(m);
}

/* ---------------- 每日副本：10 秒后自动回城 ---------------- */
const DAILY_BACK_SEC = 10;
function startDailyReturn() {
  cancelDailyReturn();
  G._dailyBackLeft = DAILY_BACK_SEC;
  logMsg(`⏳ ${DAILY_BACK_SEC} 秒后自动返回城镇`, 'level');
  G._dailyBackTimer = setInterval(() => {
    G._dailyBackLeft--;
    if (G._dailyBackLeft <= 0) {
      cancelDailyReturn();
      if (typeof enterRoom === 'function') {
        enterRoom(TOWN);
        toast('🏠 已自动返回城镇');
      }
      return;
    }
    if (G._dailyBackLeft === 5 || G._dailyBackLeft === 3 || G._dailyBackLeft === 2) {
      logMsg(`⏳ ${G._dailyBackLeft} 秒后自动返回城镇`, 'level');
    }
  }, 1000);
}
function cancelDailyReturn() {
  if (G._dailyBackTimer) { clearInterval(G._dailyBackTimer); G._dailyBackTimer = null; }
  G._dailyBackLeft = 0;
}

/* ---------------- 每日副本通关奖励 ---------------- */
function grantDailyReward(room) {
  const p = G.player, cfg = room && room.dailyCfg;
  if (!cfg) return;
  const day = todayStr();
  p.dailyDone = p.dailyDone || {};
  const k = cfg.key + '@' + day;
  if (p.dailyDone[k]) return;             // 今天同一副本只结算一次
  p.dailyDone[k] = 1;

  const got = [];
  const st = cfg.reward || {};
  for (const key in st) {
    p.materials[key] = (p.materials[key] || 0) + st[key];
    got.push(`${DATA.MATERIALS[key].name}×${st[key]}`);
  }
  if (cfg.rewardGold) {
    const g = Math.round(rnd(cfg.rewardGold[0], cfg.rewardGold[1]));
    p.gold += g;
    got.push(`金币×${fmt(g)}`);
  }
  if (cfg.rewardExp) {
    const e = Math.round(120 * Math.max(1, p.level) * (cfg.rewardExp || 1));
    gainExp(p, e);
    got.push(`经验×${fmt(e)}`);
  }
  if (typeof bigAnnounce === 'function') bigAnnounce(`✅ ${cfg.name} 通关`, cfg.color);
  toast('🎁 获得 ' + got.join(' · '));
  startDailyReturn();
  logMsg(`🎁 ${cfg.name} 通关奖励：${got.join(' · ')}`, 'loot');
  if (typeof Sfx !== 'undefined') Sfx.play('lvlup');
  saveGame();
}

function dropLoot(m) {
  const w = G.world, p = G.player;
  const d = DATA.DIFFICULTY[G.diff];
  const dropMul = d.dropMul;
  // 每个副本只出「对应等级段」的装备：第 N 个副本最高 (N×10) 级
  let ilvl = m.level;
  if (!w.isTown && (getRoom(w.roomId) || DATA.ROOMS[w.roomId])) {
    const room = getRoom(w.roomId) || DATA.ROOMS[w.roomId];
    if (room.daily) {
      // 每日副本：装备等级跟随玩家（+2 上限），不吃「第 N 图 ×10」规则
      ilvl = Math.max(1, Math.min(m.level, (G.player.level || 1) + 2));
    } else {
      const cap = (w.roomId + 1) * 10;
      const floorLv = room.lv || 1;
      ilvl = Math.max(floorLv, Math.min(ilvl, cap));
    }
  }

  const push = (obj) => {
    const a = Math.random() * Math.PI * 2, r = rnd(10, 46);
    w.drops.push({ x: m.x + Math.cos(a) * r, y: m.y + Math.sin(a) * r, life: 45, taken: false, ...obj });
  };

  // 金币
  if (Math.random() < (m.isBoss ? 1 : 0.8)) {
    let g = Math.round(rnd(m.gold[0], m.gold[1]) * dropMul * (1 + p.stats.goldBonus) * (DATA.GOLD_DROP_MUL || 1));
    push({ type: 'gold', gold: g, color: '#ffd24a', label: `${g} 金` });
  }
  // 装备
  const eqChance = (m.isBoss ? 1 : 0.35) * dropMul * (DATA.EQ_DROP_MUL != null ? DATA.EQ_DROP_MUL : 1);
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
  if (typeof perfAdd === 'function') perfAdd(d.type === 'gold' ? 'g' : 'i', d.gold || 1);
  const p = G.player;
  d.taken = true;
  if (d.type === 'gold') {
    p.gold += (Number(d.gold) || 0);
    floatText(d.x, d.y - 10, `+${d.gold} 金`, '#ffd24a', 15);
  } else if (d.type === 'item') {
    // 自动出售低战力武器
    if (G.autoSellWeapon && isLowPowerWeapon(p, d.item)) {
      const q = DATA.QUALITY.find(x => x.key === (d.item.qKey || d.item.quality)) || {key:'common'};
      const price = Math.round((20 + d.item.ilvl * 8) * Math.pow(2.2, DATA.QUALITY.indexOf(q)));
      p.gold += price;
      floatText(d.x, d.y - 10, `+${price} 金`, '#ffd24a', 12);
      return;
    }
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
    const bk = DATA.BOOKS[d.stat];
    const ok = addToBag(p, {
      id: 'bk' + Math.random().toString(36).slice(2, 8),
      type: 'book', stat: d.stat, name: bk.name, color: bk.color, count: 1
    });
    if (ok) {
      floatText(d.x, d.y - 10, bk.name, bk.color, 13);
      logMsg(`拾取 ${bk.name}（背包中点击使用）`, 'loot');
    }
  } else if (d.type === 'potion') {
    addToBag(p, { ...d.potion, type: 'potion', count: 1 });
    floatText(d.x, d.y - 10, d.potion.name, '#9fe6b8', 13);
  }
}
