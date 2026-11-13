/* ============================================================
   主程序：输入 / 自动战斗 / 主循环
   ============================================================ */
'use strict';

const Input = {
  keys: {}, mouse: { x: 0, y: 0, down: false, right: false },
  moveStick: { x: 0, y: 0, active: false },
  aimStick: { x: 0, y: 0, active: false },
  isTouch: false
};

let prevBossKills = 0;
let autoSaveAcc = 0;
let autoSkillCd = 0;

/* ---------------- 启动 ---------------- */
/* 效率统计：10 个 6 秒桶滑动窗口 */
function perfInit() {
  G.perf = { buckets: [], acc: { k:0, e:0, g:0, i:0 }, t: 0 };
}
function perfAdd(kind, n) {
  if (!G.perf) perfInit();
  if (G.perf.acc[kind] === undefined) G.perf.acc[kind] = 0;
  G.perf.acc[kind] += (n || 1);
}
function perfTick(dt) {
  if (!G.perf) perfInit();
  G.perf.t += dt;
  if (G.perf.t >= 6) {
    G.perf.t = 0;
    G.perf.buckets.push(Object.assign({ k:0,e:0,g:0,i:0 }, G.perf.acc));
    G.perf.acc = { k:0, e:0, g:0, i:0 };
    if (G.perf.buckets.length > 10) G.perf.buckets.shift();
  }
}
function perfRates() {
  const p = G.perf || { buckets: [], acc: { k:0,e:0,g:0,i:0 }, t:0 };
  const sum = { k:0, e:0, g:0, i:0 };
  p.buckets.forEach(b => { for (const k in sum) sum[k] += (b[k] || 0); });
  for (const k in sum) sum[k] += (p.acc[k] || 0);
  // 窗口实际时长（分钟）
  const mins = Math.max((p.buckets.length * 6 + p.t) / 60, 1 / 60);
  const out = {};
  for (const k in sum) out[k] = Math.round(sum[k] / mins);
  return out;
}

function startGame() {
  const p = G.player;
  prevBossKills = p.bossKills;
  showScreen('game');
  enterRoom(p.room === undefined ? TOWN : p.room);
  updateHUD(1);
  autoSaveAcc = 0;
  try { if (typeof noticeLoad === 'function') noticeLoad(); } catch (e) {}
  // 一次性福利邮件
  try {
    if (typeof mailEnsureWelfare === 'function') {
      const m = mailEnsureWelfare(p);
      if (m) setTimeout(() => toast('📮 收到版本福利邮件，去邮箱领取 1000 BOSS凭证'), 600);
      if (typeof mailRefreshDot === 'function') mailRefreshDot();
    }
  } catch (e) { console.warn('welfare', e); }
}

/* ---------------- 输入 ---------------- */
function initInput() {
  window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    Input.keys[k] = true;
    if (G.screen !== 'game') return;

    // 技能 QWER + D 冲刺
    if (['q', 'w', 'e', 'r', 'd'].includes(k)) { castSkillKey(k); e.preventDefault(); return; }

    switch (k) {
      case 'a': handleCommand('autoAtk'); e.preventDefault(); break;
      case 's': handleCommand('autoSkill'); e.preventDefault(); break;
      case 'f': handleCommand('potion'); e.preventDefault(); break;
      case 'b': case 'i': handleCommand('bag'); e.preventDefault(); break;
      case 'c': handleCommand('char'); break;
      case 'k': handleCommand('skill'); break;
      case 'm': handleCommand('map'); break;
      case 't': handleCommand('tower'); break;   // 爬塔
      case 'j':
      case 'l': handleCommand('quest'); break;   // 任务面板（J / L 都可以）
      case 'x': useGatherRing(); break;          // 聚合之戒
      case 'n':                                  // 连按三次 N 才呼出调试面板
        G._nCount = (G._nCount || 0) + 1;
        clearTimeout(G._nTimer);
        G._nTimer = setTimeout(() => { G._nCount = 0; }, 700);
        if (G._nCount >= 3) { G._nCount = 0; clearTimeout(G._nTimer); handleCommand('debug'); }
        break;
      case 'h': handleCommand('town'); break;   // H = 回城
      case 'escape':
        if (!$('modal').classList.contains('hidden')) closeModal();
        else handleCommand('settings');
        break;
      case 'f5': e.preventDefault(); handleCommand('save'); break;   // 存档
      case ' ':
      case 'arrowup': case 'arrowdown': case 'arrowleft': case 'arrowright':
        e.preventDefault(); break;
    }
  });
  window.addEventListener('keyup', e => { Input.keys[e.key.toLowerCase()] = false; });

  CV.addEventListener('mousemove', e => { Input.mouse.x = e.clientX; Input.mouse.y = e.clientY; });
  CV.addEventListener('mousedown', e => {
    if (e.button === 0) {
      // 左键优先判断是否点在 NPC 上 → 交互（不再误触发攻击）
      const wx0 = e.clientX + CAM.x;
      const wy0 = e.clientY / YS + CAM.y;
      const npcL = npcAt(wx0, wy0);
      if (npcL) { G.moveTarget = null; interactNPC(npcL); return; }
      Input.mouse.down = true; Input.mouse.right = false; G.moveTarget = null;
    }
    if (e.button === 2) {
      Input.mouse.right = true;
      // 右键：点 NPC 就交互，否则走过去
      const wx = e.clientX + CAM.x;
      const wy = e.clientY / YS + CAM.y;
      const npc = npcAt(wx, wy);
      if (npc) { G.moveTarget = null; interactNPC(npc); return; }
      G.moveTarget = { x: wx, y: wy };
    }
  });
  window.addEventListener('mouseup', e => {
    if (e.button === 0) Input.mouse.down = false;
    if (e.button === 2) Input.mouse.right = false;   // 松开不停，继续走
  });
  // 触屏：轻点 NPC 交互
  let _tapX = 0, _tapY = 0, _tapT = 0;
  CV.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    _tapX = e.touches[0].clientX; _tapY = e.touches[0].clientY; _tapT = Date.now();
  }, { passive: true });
  CV.addEventListener('touchend', e => {
    if (Date.now() - _tapT > 350) return;      // 长按 / 拖动摇杆不算
    const npcT = npcAt(_tapX + CAM.x, _tapY / YS + CAM.y);
    if (npcT) { G.moveTarget = null; interactNPC(npcT); }
  }, { passive: true });

  // 全局禁用右键菜单（Mac 双指点按也不会弹出来）
  document.addEventListener('contextmenu', e => e.preventDefault());
  CV.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('resize', resizeCanvas);

  if ('ontouchstart' in window) {
    Input.isTouch = true;
    $('touch').classList.remove('hidden');
    setupSticks();
  }
}

function setupSticks() {
  const mk = (el, obj) => {
    let cx = 0, cy = 0, id = null;
    el.addEventListener('touchstart', e => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      id = e.changedTouches[0].identifier; obj.active = true;
    }, { passive: false });
    el.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier !== id) continue;
        let dx = t.clientX - cx, dy = t.clientY - cy;
        const len = Math.hypot(dx, dy) || 1, max = 44;
        if (len > max) { dx = dx / len * max; dy = dy / len * max; }
        obj.x = dx / max; obj.y = dy / max;
        el.querySelector('i').style.transform = `translate(${dx}px,${dy}px)`;
      }
    }, { passive: false });
    const end = e => {
      e.preventDefault();
      obj.active = false; obj.x = 0; obj.y = 0; id = null;
      el.querySelector('i').style.transform = 'translate(0,0)';
    };
    el.addEventListener('touchend', end, { passive: false });
    el.addEventListener('touchcancel', end, { passive: false });
  };
  mk($('stickMove'), Input.moveStick);
}

/* ---------------- 玩家 ---------------- */
function updatePlayer(dt) {
  const p = G.player, w = G.world;
  if (!p || !w) return;

  for (const k in p.cd) if (p.cd[k] > 0) p.cd[k] = Math.max(0, p.cd[k] - dt);
  if (p.attackCd > 0) p.attackCd -= dt;
  if (p.attackAnim > 0) p.attackAnim -= dt;
  if (p.castAnim > 0) p.castAnim -= dt;
  if (p.swingT > 0) p.swingT -= dt;

  for (let i = p.buffs.length - 1; i >= 0; i--) {
    const b = p.buffs[i];
    b.t -= dt;
    if (b.t <= 0) { p.buffs.splice(i, 1); recalcStats(p); }
  }
  if (p.stats.invis > 0) p.stats.invis = Math.max(0, p.stats.invis - dt);

  if (G.debug && G.debug.infMp) p.mp = p.stats.mpMax;
  else p.mp = Math.min(p.stats.mpMax, p.mp + p.stats.mpMax * p.stats.mpRegen * dt);

  // 移动：方向键 / 触屏摇杆 / 按住右键跟随鼠标
  let mx = 0, my = 0;
  if (Input.keys['arrowleft'] || Input.keys['arrowright'] || Input.keys['arrowup'] || Input.keys['arrowdown']) G.moveTarget = null;
  if (Input.keys['arrowleft']) mx -= 1;
  if (Input.keys['arrowright']) mx += 1;
  if (Input.keys['arrowup']) my -= 1;
  if (Input.keys['arrowdown']) my += 1;
  if (Input.moveStick.active) { mx += Input.moveStick.x; my += Input.moveStick.y; }

  let len = Math.hypot(mx, my);
  if (len > 0.1) {
    mx /= len; my /= len;
    p.x += mx * 235 * dt;
    p.y += my * 235 * dt;
  } else if (G.moveTarget) {
    const dx = G.moveTarget.x - p.x, dy = G.moveTarget.y - p.y;
    const dd = Math.hypot(dx, dy);
    if (dd > 10) {
      p.x += (dx / dd) * 235 * dt;
      p.y += (dy / dd) * 235 * dt;
      len = 1;
    } else {
      G.moveTarget = null;   // 到达
    }
  }
  p.x = clamp(p.x, p.r, w.W - p.r);
  p.y = clamp(p.y, p.r, w.H - p.r);

  // 朝向
  if (Input.isTouch && Input.aimStick.active && Math.hypot(Input.aimStick.x, Input.aimStick.y) > 0.2) {
    p.dir = Math.atan2(Input.aimStick.y, Input.aimStick.x);
  } else if (!Input.isTouch) {
    p.dir = Math.atan2((Input.mouse.y / YS) + CAM.y - p.y, Input.mouse.x + CAM.x - p.x);
  } else if (len > 0.1) {
    p.dir = Math.atan2(my, mx);
  }

  // 手动攻击
  if (Input.mouse.down || Input.keys['j']) playerAttack();

  // 自动战斗
  autoBattleTick(dt);
}

/* ---------------- 聚合之戒 ---------------- */
function useGatherRing() {
  const p = G.player, w = G.world;
  if (!p || !p.stats) return;
  if (!p.stats.gatherRing) { toast('需要装备「聚合之戒」'); return; }
  const now = Date.now();
  if (p.gatherCd && now < p.gatherCd) { toast(`聚合冷却中 ${Math.ceil((p.gatherCd - now) / 1000)}s`); return; }
  if (!w || w.isTown) { toast('城镇里没有怪物'); return; }
  p.gatherCd = now + 30000;
  let n = 0;
  w.monsters.forEach(m => {
    if (!m.alive || m.isBoss) return;
    const a = Math.random() * 6.283, d = 48 + Math.random() * 46;
    m.x = p.x + Math.cos(a) * d;
    m.y = p.y + Math.sin(a) * d;
    n++;
  });
  spawnVfx(p.x, p.y, '#ffd24a', 220, 'aoe', 0.9);
  toast(`聚合之戒：吸来 ${n} 只怪物`);
}

/* ---------------- 召唤灵兽 ---------------- */
function updatePet(dt) {
  const p = G.player, w = G.world;
  if (!p || !p.stats || !p.stats.summonRing || !w || w.isTown) { G.pet = null; return; }

  if (!G.pet) {
    G.pet = {
      x: p.x - 40, y: p.y + 24, atkCd: 0, phase: 0, dir: 1,
      hpMax: Math.round(p.stats.hpMax * 0.45), hp: 0,
      atk: p.stats.power * 0.55, target: null
    };
    G.pet.hp = G.pet.hpMax;
  }
  const pet = G.pet;
  pet.phase += dt;
  pet.hpMax = Math.round(p.stats.hpMax * 0.45);     // 随主人成长
  pet.atk = p.stats.power * 0.55;
  if (pet.hp > pet.hpMax) pet.hp = pet.hpMax;

  // 找目标：优先附近怪物
  if (!pet.target || !pet.target.alive || Math.hypot(pet.target.x - pet.x, pet.target.y - pet.y) > 380) {
    pet.target = null;
    let best = null, bd = 300;
    for (const m of w.monsters) {
      if (!m.alive) continue;
      const d = Math.hypot(m.x - pet.x, m.y - pet.y);
      if (d < bd) { bd = d; best = m; }
    }
    pet.target = best;
  }

  const SPEED = 240;
  if (pet.target) {
    const t = pet.target;
    const dx = t.x - pet.x, dy = t.y - pet.y, d = Math.hypot(dx, dy) || 1;
    if (d > 52) {                                    // 追向目标
      pet.x += dx / d * SPEED * dt;
      pet.y += dy / d * SPEED * dt;
      pet.dir = dx >= 0 ? 1 : -1;
    }
    pet.atkCd -= dt;
    if (pet.atkCd <= 0 && d <= 70) {
      pet.atkCd = 1.0;
      damageMonster(t, pet.atk, 'pet');
      spawnVfx(t.x, t.y, '#7fe6ff', 46, 'hit', 0.3);
      spawnVfx(pet.x, pet.y, '#4ad4ff', 30, 'melee', 0.25);
    }
  } else {
    // 无目标：跟随主人
    const dx = p.x - pet.x, dy = p.y - pet.y, d = Math.hypot(dx, dy) || 1;
    if (d > 64) {
      pet.x += dx / d * SPEED * dt;
      pet.y += dy / d * SPEED * dt;
      pet.dir = dx >= 0 ? 1 : -1;
    }
    pet.atkCd = Math.min(pet.atkCd, 0.3);
  }

  // 超远距离直接拉回
  if (Math.hypot(p.x - pet.x, p.y - pet.y) > 600) { pet.x = p.x - 40; pet.y = p.y + 24; }

  // 灵兽不会真正死亡，血量归零后短暂消散再满血归来
  if (pet.hp <= 0) {
    pet.hp = pet.hpMax;
    pet.x = p.x - 40; pet.y = p.y + 24;
    pet.atkCd = 1.5;
  }
}

/* ---------------- 自动战斗 ---------------- */
function autoBattleTick(dt) {
  const p = G.player, w = G.world;
  if (!w || w.isTown) return;

  if (!AUTO.atk && !AUTO.skill) return;

  const target = nearestMonster(1400);
  if (!target) { G.moveTarget = null; return; }

  // 自动转向目标
  if (AUTO.atk) p.dir = Math.atan2(target.y - p.y, target.x - p.x);

  // 自动走向目标（走到攻击距离内就停）
  if (AUTO.atk) {
    const d0 = dist(p, target);
    const reach = (p.cls === 'warrior' || p.cls === 'assassin') ? 55 : 280;
    if (d0 > reach) {
      const ang = Math.atan2(target.y - p.y, target.x - p.x);
      G.moveTarget = {
        x: target.x - Math.cos(ang) * reach * 0.8,
        y: target.y - Math.sin(ang) * reach * 0.8
      };
    } else if (G.moveTarget) {
      G.moveTarget = null;
    }
  }

  // 自动攻击
  if (AUTO.atk) playerAttack();

  // 自动技能
  if (!AUTO.skill) return;
  autoSkillCd -= dt;
  if (autoSkillCd > 0) return;

  const d = dist(p, target);
  const hpPct = p.hp / p.stats.hpMax;

  // 血少先用 D 拉开距离
  if (hpPct < 0.30 && (p.cd[p.dash] || 0) <= 0) {
    castSkillKey('d');
    autoSkillCd = 0.35;
    return;
  }

  // Q → W → E → R 轮转（避免高优先级技能把 R 饿死）
  const ORDER = ['q', 'w', 'e', 'r'];
  if (G.autoSkillIdx === undefined) G.autoSkillIdx = 0;

  for (let n = 0; n < ORDER.length; n++) {
    const idx = (G.autoSkillIdx + n) % ORDER.length;
    const k = ORDER[idx];
    const key = p.keymap[k];
    const sp = DATA.SKILLS[key];
    if (!sp || (p.cd[key] || 0) > 0) continue;
    if (p.mp < (sp.cost || 0)) continue;

    // 距离门槛：按技能实际作用半径判断，够得着才放
    let reach;
    if (sp.kind === 'proj') reach = 620;
    else if (sp.kind === 'buff') reach = 480;
    else if (sp.kind === 'blink' || sp.kind === 'dash') reach = hpPct < 0.45 ? 9999 : -1;
    else reach = (sp.radius ? sp.radius * 42 + 90 : 300);
    if (reach < 0 || d > reach) continue;

    castSkillKey(k);
    G.autoSkillIdx = (idx + 1) % ORDER.length;   // 下次从下一个技能开始找
    autoSkillCd = 0.35;
    return;
  }
}

/* ---------------- 房间 ---------------- */
function goTown() {
  enterRoom(TOWN);
  saveGame();
  logMsg('回到城镇', 'info');
}

function checkBossUnlock() {
  const p = G.player;
  if (p.bossKills > prevBossKills) {
    prevBossKills = p.bossKills;
    const cur = G.world.roomId;
    if (cur !== TOWN && cur + 1 < DATA.ROOMS.length && !p.unlocked.includes(cur + 1)) {
      p.unlocked.push(cur + 1);
      toast(`已解锁：${DATA.ROOMS[cur + 1].name}`);
      logMsg(`解锁 ${DATA.ROOMS[cur + 1].name}`, 'level');
    }
    saveGame();
  }
}

/* ---------------- 主循环 ---------------- */
function loop(ts) {
  requestAnimationFrame(loop);
  if (!G.lastTs) G.lastTs = ts;
  let dt = (ts - G.lastTs) / 1000;
  G.lastTs = ts;
  dt = Math.min(dt, 0.05);

  if (G.screen === 'game') {
    G.time += dt;
    updatePlayer(dt);
    updateWorld(dt);
    updatePet(dt);
    updateTimers(dt);
    updateCamera();
    perfTick(dt);
    if (typeof mailIdleTick === 'function' && G.player) mailIdleTick(G.player, dt);
    updateHUD(dt);
    checkBossUnlock();

    autoSaveAcc += dt;
    if (autoSaveAcc > 5) { autoSaveAcc = 0; saveGame(); }   // 每 5 秒自动存档
  }
  render();
}

/* ---------------- 启动 ---------------- */
window.addEventListener('error', e => {
  try { toast('JS错误: ' + (e.message || e.error)); } catch (_) {}
  console.error(e.error || e.message);
});

window.addEventListener('DOMContentLoaded', () => {
  // 先应用用户自定义数值，再初始化 UI
  try { if (typeof cfgApplyAll === 'function') cfgApplyAll(); } catch (e) { console.warn('cfg', e); }
  loadAssets();
  resizeCanvas();
  initInput();
  uiInit();
  showScreen('title');

  if (location.hash === '#create') showScreen('create');

  if (location.hash.startsWith('#dev')) {
    const dropTest = /d$/.test(location.hash);
    const charTest = /c$/.test(location.hash);
    const bagTest = /b$/.test(location.hash);
    const fxTest = /e$/.test(location.hash);
    const tipTest = /t$/.test(location.hash);
    const forgeTest = /[fg]$/.test(location.hash);
    const skillTest = /k$/.test(location.hash);
    const questTest = /q$/.test(location.hash);
    const setTest = /s$/.test(location.hash);
    const craftTest = /n$/.test(location.hash);
    const mapTest = /m$/.test(location.hash);
    const ringGift = /#rings/.test(location.hash);
    const shopTest = /#devshop/.test(location.hash);
    const n = parseInt(location.hash.slice(4), 10);
    G.diff = 'normal';
    G.player = createPlayer('human', 'archer');
    G.player.unlocked = [0,1,2,3,4,5];
    G.player.level = 8;
    recalcStats(G.player);
    if (!G.player.equip.weapon) giveStarterGear(G.player);
    G.player.hp = G.player.stats.hpMax;
    G.player.mp = G.player.stats.mpMax;
    startGame();
    if (!isNaN(n)) enterRoom(n);
    if (shopTest) {
      G.player.gold = 600000; G.player.level = 20;
      openModal('merchant', '商人 · 赵帅帅', merchantHtml());
    }
    if (dropTest) {
      G.autoPickup = false;
      G.world.monsters.filter(m => !m.isBoss).slice(0, 5)
        .forEach(m => damageMonster(m, 999999, 'melee'));
    }
    if (fxTest) {
      AUTO.atk = true; AUTO.skill = true;
      setInterval(() => {
        const p = G.player; if (!p) return;
        p.cd[p.keymap.q] = 0; p.mp = p.stats.mpMax;
        castSkillKey('q');
      }, 300);
    }
    if (tipTest) setTimeout(() => showSkillTip('q', 1080, 380), 900);
    if (charTest) handleCommand('char');
    if (forgeTest) {
      // 给几件装备 + 材料，方便看锻造台
      for (const sk in DATA.SLOTS) {
        if (DATA.RING_SLOTS.some(r => r.slot === sk)) continue;
        G.player.equip[sk] = makeItem(sk, 10, 'rare', false);
      }
      G.player.equip.weapon.enh = 7;
      G.player.materials.stone = 40; G.player.materials.protect = 3;
      G.player.gold = 50000;
      recalcStats(G.player);
      const it = makeItem('chest', 12, 'epic', false); it.enh = 11; addToBag(G.player, it);
      if (location.hash.endsWith('g')) openModal('enhance','锻造台 · 强化', enhanceItemHtml(G.player.equip.weapon.id));
      else handleCommand('enhance');
    }
    if (ringGift) {
      const n = grantAllRings(G.player);
      // 顺带穿上召唤之戒，方便查看灵兽
      const sr = (G.player.bag || []).find(x => x.ringKey === 'summon');
      if (sr) { wearRing(G.player, sr); recalcStats(G.player); }
      setTimeout(() => toast(`🎁 已发放 ${n} 枚特戒（召唤之戒已装备）`), 300);
    }
    if (mapTest) {
      G.player.unlocked = [0,1,2,3,4,5];
      G.player.gold = 50000;
      if (typeof openModal === 'function') openModal('map', '选择难度 · 兽人营地', diffPickHtml(2));
    }
    if (craftTest) {
      G.player.materials.iron = 10; G.player.materials.mithril = 6;
      G.player.materials.scale = 3; G.player.materials.shard = 1;
      G.player.materials.stone = 25; G.player.materials.protect = 2;
      G.player.gold = 20000;
      handleCommand('craft');
    }
    if (setTest) {
      const cl = G.player.cls;
      const key = cl + '_2';
      // 给两件该套装件看看效果
      ['weapon','helm'].forEach(sl => {
        const it = makeItem(sl, 20, 'epic', false);
        it.setKey = key; it.setName = DATA.SETS[cl][2].name;
        it.name = DATA.SETS[cl][2].name + '·' + DATA.SLOTS[sl].name;
        G.player.equip[sl] = it;
      });
      recalcStats(G.player);
      openModal('setinfo', '套装图鉴', setDetailHtml(key));
    }
    if (questTest) {
      G.player.unlocked = [0,1,2,3,4,5];
      G.player.quests = [
        { ...DATA.QUEST_POOL[0], have: 7 },
        { ...DATA.QUEST_POOL[1], have: 15 },
        { ...DATA.QUEST_POOL[2], have: 3 }
      ];
      G.player.questDone = 4;
      handleCommand('quest');
    }
    if (skillTest) {
      G.player.materials.breakT = 0; G.player.materials.skillT = 4;
      const cls = DATA.CLASSES[G.player.cls];
      [cls.keymap.q, cls.keymap.w].forEach(k => { skillProfOf(G.player, k).prof = 100; });
      handleCommand('skill');
    }
    if (bagTest) {
      // 塞点测试物品：药水堆叠 + 各种品质装备
      const po = DATA.POTIONS[0];
      addToBag(G.player, { ...po, type:'potion', count: 1 });
      addToBag(G.player, { ...po, type:'potion', count: 1 });
      addToBag(G.player, { ...DATA.POTIONS[1], type:'potion', count: 1 });
      ['common','uncommon','rare','epic','legendary'].forEach((q,i) => {
        const it = makeItem(Object.keys(DATA.SLOTS)[i], 8 + i*2, q, false);
        addToBag(G.player, it);
      });
      handleCommand('bag');
    }
    logMsg('调试模式', 'level');
  }
  requestAnimationFrame(loop);
});
