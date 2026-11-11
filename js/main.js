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
function startGame() {
  const p = G.player;
  prevBossKills = p.bossKills;
  showScreen('game');
  enterRoom(p.room === undefined ? TOWN : p.room);
  updateHUD(1);
  autoSaveAcc = 0;
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
      case 'j': handleCommand('quest'); break;   // 任务面板
      case 'h': handleCommand('town'); break;   // H = 回城
      case 'e': interactNPC(); break;
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
    if (e.button === 0) { Input.mouse.down = true; Input.mouse.right = false; G.moveTarget = null; }
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
  // 全局禁用右键菜单（Mac 双指点按也不会弹出来）
  document.addEventListener('contextmenu', e => e.preventDefault());
  CV.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('resize', resizeCanvas);

  if ('ontouchstart' in window) {
    Input.isTouch = true;
    $('touch').classList.remove('hidden');
    setupSticks();
    $('tBtnAtk').addEventListener('touchstart', e => { e.preventDefault(); Input.mouse.down = true; });
    $('tBtnAtk').addEventListener('touchend', e => { e.preventDefault(); Input.mouse.down = false; });
    ['q','w','e','r'].forEach((k, i) => {
      $('tBtn' + (i + 1)).addEventListener('touchstart', e => { e.preventDefault(); castSkillKey(k); });
    });
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
  mk($('stickAim'), Input.aimStick);
}

/* ---------------- 玩家 ---------------- */
function updatePlayer(dt) {
  const p = G.player, w = G.world;
  if (!p || !w) return;

  for (const k in p.cd) if (p.cd[k] > 0) p.cd[k] = Math.max(0, p.cd[k] - dt);
  if (p.attackCd > 0) p.attackCd -= dt;
  if (p.attackAnim > 0) p.attackAnim -= dt;
  if (p.castAnim > 0) p.castAnim -= dt;

  for (let i = p.buffs.length - 1; i >= 0; i--) {
    const b = p.buffs[i];
    b.t -= dt;
    if (b.t <= 0) { p.buffs.splice(i, 1); recalcStats(p); }
  }
  if (p.stats.invis > 0) p.stats.invis = Math.max(0, p.stats.invis - dt);

  p.mp = Math.min(p.stats.mpMax, p.mp + p.stats.mpMax * p.stats.mpRegen * dt);

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

  // Q → W → E → R 依次找可用的
  for (const k of ['q', 'w', 'e', 'r']) {
    const key = p.keymap[k];
    const sp = DATA.SKILLS[key];
    if (!sp || (p.cd[key] || 0) > 0) continue;
    if (p.mp < (sp.cost || 0)) continue;
    // 距离门槛：近战/AOE 要贴脸，投射物可以远
    const need = (sp.kind === 'proj') ? 620 : (sp.kind === 'buff' ? 0 : 300);
    if (need > 0 && d > need) continue;
    castSkillKey(k);
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
    updateTimers(dt);
    updateCamera();
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
        if (sk === 'ring2') continue;
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
