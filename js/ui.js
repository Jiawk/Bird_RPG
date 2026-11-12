/* ============================================================
   UI：HUD / 命令卡 / 弹窗 / 难度选择 / 背包
   ============================================================ */
'use strict';

const $ = id => document.getElementById(id);
let hudAcc = 0;
let TIP = null;
let MODAL_KEY = null;          // 当前打开的弹窗标识（用于同键关闭）
let SEL = { race: 'human', cls: 'warrior' };

/* 自动战斗开关 */
const AUTO = { atk: false, skill: false };

/* 装备图标（魔兽图标图集，18 格） */
const EQUIP_IDX  = { helm:7, chest:8, legs:9, boots:10, neck:11, ring:12, trinket:13 };
const WEAPON_IDX = { sword:0, axe:1, bow:2, crossbow:3, dagger:4, staff:5, orb:6 };
const RELIC_IDX  = { relic_sword:14, relic_staff:15, relic_bow:16, relic_dagger:17 };
const RING_IDX = {
  ring:20, ring_exp:21, ring_revive:22, ring_summon:23,
  ring_cleave:24, ring_drop:25, ring_gather:26
};
const MAT_IDX = { iron:27, mithril:28, scale:29, shard:30, stone:31, protect:32, skillT:33, breakT:34 };
const EQUIP_COUNT = 35;
const POTION_IDX  = { hp:18, mp:19 };

function iconIdxOf(slot, wtype, relicKey) {
  if (relicKey && RELIC_IDX[relicKey] !== undefined) return RELIC_IDX[relicKey];
  if (RING_IDX[slot] !== undefined) return RING_IDX[slot];
  if (slot === 'weapon') return WEAPON_IDX[wtype] !== undefined ? WEAPON_IDX[wtype] : 0;
  return EQUIP_IDX[slot];
}

function iconTag(slot, size, wtype, relicKey) {
  const i = iconIdxOf(slot, wtype, relicKey);
  if (i === undefined) return '';
  const sz = size || 32;
  return `<span class="ic-sprite" data-i="${i}" style="width:${sz}px;height:${sz}px;background-size:${sz*EQUIP_COUNT}px ${sz}px;background-position:${-i*sz}px 0"></span>`;
}

function uiInit() {
  document.documentElement.style.setProperty('--icon-sheet', `url(${ASSETS.equip || ASSETS.icons})`);
  document.documentElement.style.setProperty('--skill-sheet', `url(${ASSETS.skills})`);
  if (ASSETS.units) document.documentElement.style.setProperty('--units-sheet', `url(${ASSETS.units})`);
  if (ASSETS.classicons) document.documentElement.style.setProperty('--class-sheet', `url(${ASSETS.classicons})`);
  if (ASSETS.avatars) document.documentElement.style.setProperty('--avatar-sheet', `url(${ASSETS.avatars})`);
  bindSkillTips();
  // 任务追踪：事件委托（内容重建后依然可点）
  const qt = $('questTracker');
  if (qt) {
    qt.addEventListener('click', e => {
      const head = e.target.closest('.qt-head');
      if (head) { G.qtCollapsed = !G.qtCollapsed; QT_SIG = ''; return; }
      const claim = e.target.closest('[data-qt-claim]');
      if (claim) { claimQuest(claim.dataset.qtClaim); QT_SIG = ''; return; }
      if (e.target.closest('[data-qt-claim-all]')) { claimAllQuests(); return; }
      if (e.target.closest('[data-qt-accept-all]')) { acceptAllQuests(); QT_SIG = ''; return; }
    });
  }
  bindSfxUI();
  bindTooltipDismiss();

  // 功能按钮图标（固定映射）
  const UICON = { autoAtk:0, autoSkill:1, potion:2, bag:3, char:4, skill:5, map:6 };
  document.querySelectorAll('.cc-btn .sk-ic.util').forEach(ic => {
    const act = ic.parentElement.dataset.act;
    const i = UICON[act];
    if (i === undefined) return;
    ic.style.backgroundImage = `url(${ASSETS.uicons})`;
    ic.style.backgroundSize = '280px 40px';
    ic.style.backgroundPosition = `${-i * 40}px 0`;
    ic.style.backgroundRepeat = 'no-repeat';
  });

  document.querySelectorAll('.cc-btn, .codex-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.skill) castSkillKey(btn.dataset.skill);
      else if (btn.dataset.act) handleCommand(btn.dataset.act);
    });
  });
  $('modalClose').addEventListener('click', closeModal);
  $('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

  $('btnNew').addEventListener('click', () => { SEL = { race: 'human', cls: 'warrior' }; showScreen('create'); });
  $('btnContinue').addEventListener('click', () => { if (loadGame()) startGame(); else toast('没有存档'); });
  $('btnImport').addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json';
    inp.onchange = e => { if (e.target.files[0]) importSave(e.target.files[0]); };
    inp.click();
  });
  $('btnBackTitle').addEventListener('click', () => showScreen('title'));
  $('btnStart').addEventListener('click', confirmCreate);

  buildCreateScreen();
  $('btnContinue').disabled = !hasSave();
}

function showScreen(name) {
  $('screen-title').classList.toggle('hidden', name !== 'title');
  $('screen-create').classList.toggle('hidden', name !== 'create');
  $('hud').classList.toggle('hidden', name !== 'game');
  G.screen = name;
  if (name === 'title') $('btnContinue').disabled = !hasSave();
}

/* ---------------- 建角 ---------------- */
function buildCreateScreen() {
  const rl = $('raceList'); rl.innerHTML = '';
  for (const k in DATA.RACES) {
    const r = DATA.RACES[k];
    const el = document.createElement('div');
    el.className = 'card' + (k === SEL.race ? ' sel' : '');
    const rai = DATA.RACE_AVATAR[k] !== undefined ? DATA.RACE_AVATAR[k] : 0;
    el.innerHTML = `<div class="race-portrait" style="--ai:${rai}">
        <span class="av-img"></span>
      </div>
      <h3 style="color:${r.color}">${r.name}</h3>
      <p>${r.desc}</p>
      <div><span class="tag">力 ${fmtMod(r.mod.str)}</span><span class="tag">敏 ${fmtMod(r.mod.agi)}</span>
      <span class="tag">智 ${fmtMod(r.mod.int)}</span><span class="tag">体 ${fmtMod(r.mod.vit)}</span></div>
      <p style="margin-top:6px;color:#8f8570">${r.talent}</p>`;
    el.onclick = () => { SEL.race = k; buildCreateScreen(); };
    rl.appendChild(el);
  }
  const cl = $('classList'); cl.innerHTML = '';
  for (const k in DATA.CLASSES) {
    const c = DATA.CLASSES[k];
    const el = document.createElement('div');
    el.className = 'card' + (k === SEL.cls ? ' sel' : '');
    const km = c.keymap;
    const ci = Object.keys(DATA.CLASSES).indexOf(k);
    el.innerHTML = `
      <div class="cls-portrait" style="--ai:${DATA.CLASS_AVATAR[k] !== undefined ? DATA.CLASS_AVATAR[k] : 0}">
        <span class="av-img big"></span>
        <span class="cls-badge" style="background-position:${-ci * 64}px 0"></span>
        <span class="cls-name-plate">${c.name}</span>
      </div>
      <h3 style="color:${c.color}">${c.name}</h3>
      <p>${c.desc}</p>
      <div><span class="tag">主属性 ${statName(c.primary)}</span><span class="tag">${c.weapon}</span></div>
      <p style="margin-top:6px;color:#8f8570">Q ${DATA.SKILLS[km.q].name} · W ${DATA.SKILLS[km.w].name}</p>
      <p style="color:#8f8570">E ${DATA.SKILLS[km.e].name} · R ${DATA.SKILLS[km.r].name} · D ${DATA.SKILLS[km.d].name}</p>`;
    el.onclick = () => { SEL.cls = k; buildCreateScreen(); };
    cl.appendChild(el);
  }
}

const statName = k => ({ str:'力量', agi:'敏捷', int:'智力', vit:'体质' }[k] || k);
const fmtMod = v => (v > 0 ? '+' : '') + v;

function confirmCreate() {
  const np = createPlayer(SEL.race, SEL.cls);
  giveStarterGear(np);
  G.diff = 'normal';

  if (G.creatingNew) {
    // 新建角色：追加到角色表
    const idx = addChar(np);
    if (idx < 0) { toast(`角色已满（最多 ${MAX_CHARS} 个）`); return; }
    G.creatingNew = false;
    logMsg(`新角色：${DATA.RACES[SEL.race].name} · ${DATA.CLASSES[SEL.cls].name}`, 'level');
  } else {
    // 首次创建：初始化角色表
    G.chars = [np];
    G.active = 0;
    G.player = np;
    logMsg(`${DATA.RACES[SEL.race].name} · ${DATA.CLASSES[SEL.cls].name} 踏上征程`, 'level');
  }

  saveGame();
  startGame();
  toast(`获得新手装备一套 · 战力 ${combatPower(G.player)}`);
  openTownMap();
}

/* ---------------- HUD ---------------- */
function updateHUD(dt) {
  hudAcc += dt;
  if (hudAcc < 0.08) return;
  hudAcc = 0;
  const p = G.player, w = G.world;
  if (!p || !w) return;

  const hpPct = clamp(p.hp / p.stats.hpMax, 0, 1) * 100;
  const mpPct = clamp(p.mp / p.stats.mpMax, 0, 1) * 100;
  const need = DATA.expForLevel(p.level);
  const xpPct = p.level >= DATA.MAX_LEVEL ? 100 : clamp(p.exp / need, 0, 1) * 100;

  $('hpFill').style.width = hpPct + '%';
  $('mpFill').style.width = mpPct + '%';
  $('xpFill').style.width = xpPct + '%';
  $('hpText').textContent = `${Math.ceil(p.hp)} / ${p.stats.hpMax}`;
  $('mpText').textContent = `${Math.ceil(p.mp)} / ${p.stats.mpMax}`;
  $('xpText').textContent = p.level >= DATA.MAX_LEVEL ? '满级' : `${Math.floor(xpPct)}%`;

  // 当前位置 / 难度
  const _t = w.isTown;
  const pr = $('placeRoom'), pd = $('placeDiff');
  if (pr) pr.textContent = _t ? '暴风城 · 安全区' : DATA.ROOMS[w.roomId].name;
  if (pd) {
    const D = DATA.DIFFICULTY[G.diff] || DATA.DIFFICULTY.normal;
    pd.textContent = _t ? '无战斗' : (D.name + '难度');
    pd.style.color = _t ? '#9a907a' : D.color;
  }

  // 效率面板（每 0.5 秒刷新）
  if (G._pfT === undefined) G._pfT = 0;
  G._pfT += dt;
  if (G._pfT > 0.5 && typeof perfRates === 'function') {
    G._pfT = 0;
    const R = perfRates();
    const set = (id, v) => { const e = $(id); if (e) e.textContent = fmt(v); };
    set('pfKill', R.k || 0);
    set('pfExp', R.e || 0);
    set('pfGold', R.g || 0);
    set('pfItem', R.i || 0);
  }
  $('pLevel').textContent = p.level;
  $('pName').textContent = `${DATA.RACES[p.race].name} · ${DATA.CLASSES[p.cls].name}`;
  $('pStats').innerHTML =
    `攻击 <b>${Math.round(p.stats.power)}</b>　攻速 <b>${p.stats.as.toFixed(2)}</b>　` +
    `暴击 <b>${(p.stats.crit*100).toFixed(0)}%</b>　护甲 <b>${Math.round(p.stats.armor)}</b>`;
  $('goldVal').textContent = fmt(p.gold);
  $('cpVal').textContent = fmt(combatPower(p));

  const gt = gearTier(p);
  $('gearVal').textContent = gt.tierName;
  $('gearVal').style.color = gt.filled === 8 ? DATA.QUALITY[Math.max(0,gt.minIdx)].color : '#b8ad93';

  $('diffVal').textContent = DATA.DIFFICULTY[G.diff].name;
  $('diffVal').style.color = DATA.DIFFICULTY[G.diff].color;

  const isTown = w.isTown;
  $('roomName').textContent = isTown ? '暴风城 · 安全区' : DATA.ROOMS[w.roomId].name;
  $('roomSub').textContent = isTown ? '点击 NPC 或按 M 选择关卡'
    : `${DATA.DIFFICULTY[G.diff].name}难度 · ${DATA.ROOMS[w.roomId].desc}`;

  const boss = w.monsters.find(m => m.isBoss && m.alive);
  if (boss) {
    $('bossBar').classList.remove('hidden');
    $('bossName').textContent = `${boss.name}　·　${boss.title}`;
    $('bossFill').style.width = clamp(boss.hp / boss.hpMax, 0, 1) * 100 + '%';
  } else $('bossBar').classList.add('hidden');

  // 命令卡技能（QWERD）
  const keyMap = { q:'q', w:'w', e:'e', r:'r', d:'d' };
  document.querySelectorAll('.cc-btn.skill').forEach(btn => {
    const k = btn.dataset.skill;
    const key = (k === 'd') ? p.dash : p.keymap[k];
    const sp = DATA.SKILLS[key];
    const nm = btn.querySelector('.nm');
    const cdEl = btn.querySelector('.cd');
    nm.textContent = sp ? sp.name : '—';
    const ic = btn.querySelector('.sk-ic');
    if (ic && sp) {
      const ii = DATA.SKILL_ICON[key] ?? 0;
      // 全部内联，杜绝任何样式覆盖
      ic.style.position = 'absolute';
      ic.style.left = '50%';
      ic.style.top = '50%';
      ic.style.transform = 'translate(-50%,-50%)';
      ic.style.width = '38px';
      ic.style.height = '38px';
      ic.style.display = 'block';
      ic.style.backgroundImage = `url(${ASSETS.skills})`;
      ic.style.backgroundSize = `${SKILL_ICON_COUNT * 38}px 38px`;
      ic.style.backgroundPosition = `${-ii * 38}px 0`;
      ic.style.backgroundRepeat = 'no-repeat';
      ic.style.imageRendering = 'pixelated';
    }
    const cd = p.cd && p.cd[key] ? p.cd[key] : 0;
    if (cd > 0) { cdEl.textContent = cd.toFixed(1); cdEl.classList.add('on'); }
    else cdEl.classList.remove('on');
  });

  // 自动战斗开关状态
  document.querySelectorAll('.cc-btn.toggle').forEach(btn => {
    const on = btn.dataset.act === 'autoAtk' ? AUTO.atk : AUTO.skill;
    btn.classList.toggle('on', !!on);
  });

  updateQuestTracker();

  // 消息
  $('msglog').innerHTML = G.msgLog.slice(-6).reverse()
    .map(m => `<div class="m ${m.type}">${m.text}</div>`).join('');

  // NPC 提示
  const npc = nearestNPC();
  if (npc) {
    $('interactHint').classList.remove('hidden');
    $('interactHint').innerHTML = `按 <b>鼠标右键</b> 与 ${npc.name} 交互`;
  } else $('interactHint').classList.add('hidden');
}

/* ---------------- 任务进度 ---------------- */
function onMonsterKilled(m) {
  const p = G.player;
  if (!p) return;

  // ---- 技能熟练度 ----
  gainSkillProf(p, DATA.SKILL_TIER.killProf * (m.isBoss ? 8 : (m.isElite ? 3 : 1)));

  // ---- 材料掉落 ----
  const rnd = Math.random();
  if (m.isBoss) {
    p.materials.stone = (p.materials.stone || 0) + 2 + Math.floor(Math.random() * 3);
    if (Math.random() < 0.6) p.materials.skillT = (p.materials.skillT || 0) + 1;
    if (Math.random() < 0.25) p.materials.breakT = (p.materials.breakT || 0) + 1;
    if (Math.random() < 0.35) p.materials.protect = (p.materials.protect || 0) + 1;
  } else if (m.isElite) {
    if (rnd < 0.45) p.materials.stone = (p.materials.stone || 0) + 1;
    if (rnd > 0.93) p.materials.skillT = (p.materials.skillT || 0) + 1;
  } else if (rnd < 0.12) {
    p.materials.stone = (p.materials.stone || 0) + 1;
  }

  // ---- 收藏图鉴：累计 BOSS 击杀 + 记录当天击杀 ----
  if (m.isBoss && m.kind) {
    if (!p.codex) p.codex = {};
    p.codex[m.kind] = (p.codex[m.kind] || 0) + 1;
    if (!p.codexKillDay) p.codexKillDay = {};
    p.codexKillDay[m.kind] = todayStr();
  }

  // ---- BOSS 掉特戒（难度越高爆率越高，仍是最低档）----
  if (m.isBoss) {
    const mul = G.diff === 'hell' ? 3 : G.diff === 'hard' ? 2 : 1;
    if (Math.random() < 0.005 * mul) {   // 基础 0.5%（困难×2，地狱×3）
      const keys = Object.keys(DATA.SPECIAL_RINGS);
      const k = keys[Math.floor(Math.random() * keys.length)];
      const ring = makeRing(DATA.SPECIAL_RINGS[k], k);
      equipSpecialRing(p, ring);
      bigAnnounce(`💍 ${ring.name}`, ring.color || '#b45cff');
      toast(`💍 BOSS 掉落【${ring.name}】`);
      logMsg(`💍 掉落 ${ring.name}`, 'loot');
    }
  }

  // ---- BOSS 首杀戒指 ----
  if (m.isBoss && m.kind && DATA.BOSS_RINGS[m.kind] && !(p.firstKills || {})[m.kind]) {
    const ring = grantFirstKillRing(p, m.kind);
    if (ring) {
      bigAnnounce(`🏆 首杀 · ${ring.name}`, ring.color || '#ffd24a');
      toast(`🏆 首杀成就：获得【${ring.name}】`);
      logMsg(`🏆 首杀 ${m.name} → ${ring.name}（${ring.effectDesc}）`, 'level');
      saveGame();
    }
  }

  // ---- 爬塔推进 ----
  if (G.tower && G.tower.active) {
    const w = G.world;
    const left = w.monsters.filter(x => x.alive).length;
    if (left === 0) setTimeout(clearTowerFloor, 400);
  }

  // ---- 悬赏任务 ----
  (p.quests || []).forEach(q => {
    if (q.room !== G.world.roomId || q.have >= q.need) return;
    q.have++;
    if (q.have === q.need) {
      toast(`任务「${q.name}」目标达成！回城领取`);
      logMsg(`✔ 「${q.name}」目标完成，回城领取奖励`, 'level');
    }
  });
}

/* ---------------- 右侧任务追踪 ---------------- */
let QT_SIG = '';
function updateQuestTracker() {
  const el = $('questTracker');
  if (!el) return;
  const p = G.player;
  if (!p || G.screen !== 'game') { el.classList.add('hidden'); return; }

  const qs = p.quests || [];
  const avail = DATA.QUEST_POOL.filter(q =>
    !qs.some(x => x.id === q.id) && p.unlocked.includes(q.room));
  if (!qs.length && !avail.length) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');

  const doneN = qs.filter(q => q.have >= q.need).length;
  // 内容签名，避免每帧重建（重建会打断点击）
  const sig = qs.map(q => q.id + ':' + q.have + '/' + q.need).join(',')
    + '|' + doneN + '|' + avail.length + '|' + (G.qtCollapsed ? 1 : 0);
  if (sig === QT_SIG) return;
  QT_SIG = sig;

  el.classList.toggle('collapsed', !!G.qtCollapsed);

  let html = `<div class="qt-head">任务
    <b>${qs.length}</b>
    ${doneN ? `<span style="color:#5fdc4a;font-size:11px">· ${doneN} 可交</span>` : ''}
    <span class="qt-arr">▾</span></div><div class="qt-body">`;

  if (!qs.length) {
    html += '<div class="qt-empty">没有进行中的任务</div>';
  } else {
    qs.forEach(q => {
      const done = q.have >= q.need;
      const pct = Math.min(100, q.have / q.need * 100);
      html += `<div class="qt-item${done ? ' done' : ''}">
        <span class="qt-nm">${q.name}</span>
        <span class="qt-prog">${q.have}/${q.need}</span>
        ${done ? `<button class="claim" data-qt-claim="${q.id}">领取</button>` : ''}
      </div>
      <div class="qt-bar"><i style="width:${pct}%;${done ? 'background:#5fdc4a' : ''}"></i></div>`;
    });
  }

  html += '<div class="qt-actions">';
  html += `<button data-qt-claim-all ${doneN ? '' : 'disabled'}>交任务${doneN ? ' ' + doneN : ''}</button>`;
  html += `<button data-qt-accept-all ${avail.length ? '' : 'disabled'}>接任务${avail.length ? ' ' + avail.length : ''}</button>`;
  html += '</div></div>';
  el.innerHTML = html;
}

/* 一键领取所有已完成任务 */
function claimAllQuests() {
  const p = G.player;
  const done = (p.quests || []).filter(q => q.have >= q.need);
  if (!done.length) { toast('没有可领取的任务'); return; }
  let exp = 0, gold = 0, n = 0;
  const mats = {};
  done.forEach(q => {
    exp += q.exp; gold += q.gold;
    mats[q.mat] = (mats[q.mat] || 0) + q.matN;
    n++;
  });
  gainExp(p, exp);
  p.gold += gold;
  for (const k in mats) p.materials[k] = (p.materials[k] || 0) + mats[k];
  p.quests = p.quests.filter(q => q.have < q.need);
  p.questDone += n;
  const matTxt = Object.keys(mats).map(k => `${DATA.MATERIALS[k].name}×${mats[k]}`).join(' ');
  toast(`✅ 交付 ${n} 个任务：+${exp} 经验 +${fmt(gold)} 金 ${matTxt}`);
  logMsg(`✔ 一键交付 ${n} 个委托`, 'level');
  QT_SIG = '';
  saveGame();
}

/* ---------------- Toast ---------------- */
let toastTimer = null;
/* 大字醒目广播（驻留 10 秒） */
function bigAnnounce(text, color) {
  const el = $('bigAnnounce');
  if (!el) return;
  el.textContent = text;
  el.style.color = color || '#ffd24a';
  el.classList.remove('hidden');
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), 10000);
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 1700);
}

/* ---------------- 弹窗（同键可关闭） ---------------- */
function openModal(key, title, html) {
  MODAL_KEY = key;
  $('modalTitle').textContent = title;
  $('modalBody').innerHTML = html;
  $('modal').classList.remove('hidden');
  bindModal();
  if (key === 'char') requestAnimationFrame(drawCharPortrait);
  if (key === 'enhance') requestAnimationFrame(() => {
    const cv = document.getElementById('enhPortrait');
    if (cv && cv.getContext) drawCharPortraitTo(cv);
  });
}
function closeModal() {
  if (typeof Sfx !== 'undefined') Sfx.play('close');
  $('modal').classList.add('hidden');
  MODAL_KEY = null;
  hideTooltip();
}
function isModalOpen(key) {
  return !$('modal').classList.contains('hidden') && MODAL_KEY === key;
}
/* 同键切换：开着就关，关着就开 */
function toggleModal(key, title, htmlFn) {
  if (isModalOpen(key)) { closeModal(); return; }
  openModal(key, title, htmlFn());
}

/* 角色面板立绘：把行走图放大画进 canvas */
function drawCharPortraitTo(cv) {
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const p = G.player;
  ctx.clearRect(0, 0, cv.width, cv.height);

  const g = ctx.createRadialGradient(cv.width/2, cv.height*0.6, 6, cv.width/2, cv.height*0.6, cv.width*0.85);
  g.addColorStop(0, 'rgba(212,175,55,.22)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cv.width, cv.height);

  if (!imgReady('units')) return;
  const ci = ['warrior','mage','archer','assassin'].indexOf(p.cls);
  if (ci < 0) return;
  const S = 3.1, sw = U_FRAME_W * S, sh = U_FRAME_H * S;
  const frame = Math.floor(G.time * 5) % 4;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(IMG.units, ci * 128 + frame * U_FRAME_W, 0, U_FRAME_W, U_FRAME_H,
                (cv.width - sw) / 2, cv.height - sh - 2, sw, sh);
}

function drawCharPortrait() {
  drawCharPortraitTo(document.getElementById('charPortrait'));
}

/* 技能图标 tag */
function skillIconTag(key, size) {
  const i = DATA.SKILL_ICON[key];
  if (i === undefined) return '';
  const sz = size || 24;
  return `<span class="sk-ic-tag" style="width:${sz}px;height:${sz}px;
    background-image:url(${ASSETS.skills});background-size:${sz*SKILL_ICON_COUNT}px ${sz}px;
    background-position:${-i*sz}px 0;background-repeat:no-repeat"></span>`;
}

/* 通用 tooltip 渲染 */
function showTipHtml(html, x, y) {
  hideTooltip();
  TIP = document.createElement('div');
  TIP.className = 'tooltip';
  TIP.innerHTML = html;
  document.body.appendChild(TIP);
  moveTooltip(x, y);
}

/* 技能悬浮：说明 + 预计伤害 */
function showSkillTip(k, x, y) {
  const p = G.player;
  if (!p) return;
  const key = (k === 'd') ? p.dash : (p.keymap ? p.keymap[k] : null);
  const sp = DATA.SKILLS[key];
  if (!sp) return;

  const lv = p.skills[key] || 1;
  const mul = 1 + (lv - 1) * 0.2;
  const isActive = sp.type !== 'passive';
  const cd = p.cd && p.cd[key] ? p.cd[key] : 0;

  let html = `<h4 style="color:${sp.color || '#ffd24a'}">${sp.name} <small style="color:#8f8570">Lv.${lv}</small></h4>`;
  html += `<div class="tt-sub">${isActive ? '主动技能' : '被动技能'}${sp.kind ? ' · ' + kindName(sp.kind) : ''}</div>`;
  if (isActive) {
    html += `<div style="font-size:11px;color:#7fd4ff">冷却 ${sp.cd || 0}s　${sp.cost ? '法力 ' + sp.cost : '无消耗'}</div>`;
    if (cd > 0) html += `<div style="font-size:11px;color:#ff8a7a">冷却中 ${cd.toFixed(1)}s</div>`;
    if (sp.dmg) {
      const dmg = Math.round(p.stats.power * (p.stats.skillMul || 1) * sp.dmg * mul);
      html += `<div style="margin-top:4px;border-top:1px dotted rgba(184,173,147,.25);padding-top:4px">`;
      html += `<div class="tt-up" style="font-size:13px;font-weight:700">预计伤害 ${fmt(dmg)}</div>`;
      html += `<div style="font-size:11px;color:#8f8570">伤害系数 ${(sp.dmg * 100).toFixed(0)}% × 技能等级 ${(mul * 100).toFixed(0)}%</div>`;
      if (sp.radius) html += `<div style="font-size:11px;color:#8f8570">作用范围 ${sp.radius}</div>`;
      html += `</div>`;
    }
  }
  html += `<div class="tt-desc">${sp.desc || ''}</div>`;
  showTipHtml(html, x, y);
}

function kindName(k) {
  return ({ aoe:'范围', melee:'近战', proj:'投射物', dash:'位移', blink:'闪现',
            buff:'增益', trap:'陷阱' })[k] || k;
}

function bindSkillTips() {
  document.querySelectorAll('.cc-btn.skill').forEach(btn => {
    btn.addEventListener('mouseenter', e => showSkillTip(btn.dataset.skill, e.clientX, e.clientY));
    btn.addEventListener('mousemove', e => moveTooltip(e.clientX, e.clientY));
    btn.addEventListener('mouseleave', hideTooltip);
  });
}

/* ---------------- 命令 ---------------- */
function handleCommand(act) {
  if (G.screen !== 'game') return;
  switch (act) {
    case 'autoAtk':
      AUTO.atk = !AUTO.atk;
      toast(AUTO.atk ? '自动攻击：开' : '自动攻击：关');
      break;
    case 'autoSkill':
      AUTO.skill = !AUTO.skill;
      toast(AUTO.skill ? '自动技能：开' : '自动技能：关');
      if (AUTO.skill && !AUTO.atk) { AUTO.atk = true; toast('自动技能已开启（同时开启自动攻击）'); }
      break;
    case 'potion': usePotion(); break;
    case 'bag': toggleModal('bag', '背包 · 装备', () => bagHtml()); break;
    case 'char': toggleModal('char', '角色', () => charHtml()); break;
    case 'skill': toggleModal('skill', '技能', () => skillHtml()); break;
    case 'map': toggleModal('map', '传送 / 回城', () => townMapHtml()); break;
    case 'town': goTown(); break;
    case 'quest': toggleModal('quest', '任务官 · 黄仁勋', questHtml); break;
    case 'craft': toggleModal('craft', '锻造台', craftHtml); break;
    case 'ringup': toggleModal('ringup', '特戒强化', ringUpHtml); break;
    case 'codexEquip': toggleModal('codexEquip', '装备图鉴', codexEquipHtml); break;
    case 'codexCollect': toggleModal('codexCollect', '收藏图鉴', codexCollectHtml); break;
    case 'debug': toggleModal('debug', '调试面板 · N', debugHtml); break;
    case 'tower': toggleModal('tower', '爬塔 · 试炼之塔', towerHtml); break;
    case 'tower': toggleModal('tower', '爬塔 · 试炼之塔', towerHtml); break;
    case 'enhance': toggleModal('enhance', '铁匠 · 装备强化', enhanceHtml); break;
    case 'sellWorse': {
      const r = sellAllWorse(G.player);
      toast(r.n ? `已出售 ${r.n} 件低战力装备，+${fmt(r.gold)} 金` : '没有需要出售的装备');
      if (r.n) { logMsg(`一键出售 ${r.n} 件，+${fmt(r.gold)} 金`, 'loot'); saveGame(); }
      if (isModalOpen('bag')) openModal('bag', '背包 · 装备', bagHtml());
      break;
    }
    case 'autoSell':
      G.autoSell = !G.autoSell;
      toast(G.autoSell ? '自动出售：开（低战力装备直接折现）' : '自动出售：关');
      break;
    case 'save': saveGame() ? toast('已存档') : toast('存档失败'); break;
    case 'export': exportSave(); break;
    case 'settings': toggleModal('settings', '设置', () => settingsHtml()); break;
  }
}

/* 喝药：优先红药（血少时），否则蓝药 */
function usePotion() {
  const p = G.player;
  const needHp = p.hp < p.stats.hpMax * 0.6;
  let idx = -1, best = null;
  p.bag.forEach((it, i) => {
    if (it.type !== 'potion') return;
    if (needHp && it.hp) { if (!best || it.hp > best.hp) { best = it; idx = i; } }
    else if (!needHp && it.mp) { if (!best || it.mp > best.mp) { best = it; idx = i; } }
  });
  if (!best && !needHp) {
    // 血少但没红药 → 找蓝药
    p.bag.forEach((it, i) => { if (it.type === 'potion' && it.mp) { best = it; idx = i; } });
  }
  if (!best) { toast('没有药水了'); return; }
  if (best.hp) p.hp = Math.min(p.stats.hpMax, p.hp + best.hp);
  if (best.mp) p.mp = Math.min(p.stats.mpMax, p.mp + best.mp);
  consumePotion(p, best.key, 1);
  toast(`喝下 ${best.name}（剩 ${(p.bag.find(x=>x.key===best.key)?.count)||0}）`);
  if (isModalOpen('bag')) openModal('bag', '背包 · 装备', bagHtml());
}

/* ---------------- 背包 ---------------- */
/* 材料格子（堆叠展示，来源仍是 p.materials） */
function matCellsHtml(count) {
  const p = G.player;
  let out = '';
  let n = 0;
  for (const k in MAT_IDX) {
    const cnt = (p.materials && p.materials[k]) || 0;
    if (!cnt) continue;
    n++;
    const M = DATA.MATERIALS[k];
    out += `<div class="bag-cell mat" data-mat="${k}">
      <span class="ic-sprite" style="width:34px;height:34px;background-size:${34*EQUIP_COUNT}px 34px;background-position:${-MAT_IDX[k]*34}px 0"></span>
      <div class="nm" style="color:${M.color}">${M.name}</div>
      <span class="stack">×${cnt}</span></div>`;
  }
  return { html: out, n };
}

function bagHtml() {
  const p = G.player;
  (p.bag || []).forEach(normalizeSlot);
  const page = clamp(p.bagPage || 0, 0, BAG_PAGES - 1);
  const start = page * BAG_PAGE_SIZE, end = start + BAG_PAGE_SIZE;
  const idx = DATA.QUALITY.findIndex(q => q.key === (p.equip.weapon?.qKey || ''));

  let html = `<div class="bag-toolbar">
    <button class="sm-btn danger" data-act="sellWorse">一键出售低战力</button>
    <label class="auto-toggle">
      <input type="checkbox" data-toggle-autosell ${G.autoSell ? 'checked' : ''}>
      <span>自动出售低战力</span>
    </label>
    <button class="sm-btn danger" data-act="sellWeapons">一键出售低战力武器</button>
    <label class="auto-toggle">
      <input type="checkbox" data-toggle-autosellweapon ${G.autoSellWeapon ? 'checked' : ''}>
      <span>自动出售低战力武器</span>
    </label>
    <span class="bag-count">${p.bag.length} / ${BAG_MAX}</span>
  </div>`;

  html += '<div class="bag-pager">';
  for (let i = 0; i < BAG_PAGES; i++) {
    html += `<button class="pg-btn ${i === page ? 'on' : ''}" data-bag-page="${i}">${i + 1}</button>`;
  }
  html += '<span class="pg-tip">背包 ' + BAG_PAGES + ' 页 · 每页 ' + BAG_PAGE_SIZE + ' 格</span></div>';

  // ---- 材料区（堆叠）----
  const mc = matCellsHtml();
  if (mc.n) {
    html += `<div class="mat-title">材料　<span style="font-size:10px;color:#8f8570">共 ${mc.n} 种 · 可堆叠</span></div>`;
    html += `<div class="mat-grid">${mc.html}</div>`;
  }

  html += '<div class="bag-grid">';
  for (let i = start; i < end; i++) {
    const it = p.bag[i];
    if (!it) { html += '<div class="bag-cell empty">—</div>'; continue; }
    if (it.type === 'potion') {
      const pi2 = POTION_IDX[it.key] !== undefined ? POTION_IDX[it.key] : 18;
      html += `<div class="bag-cell potion" data-potion="${it.key}">
        <span class="ic-sprite" style="width:34px;height:34px;background-size:${34*EQUIP_COUNT}px 34px;background-position:${-pi2*34}px 0"></span>
        <div class="nm" style="color:${it.color}">${it.name}</div>
        <span class="stack">×${it.count || 1}</span></div>`;
    } else if (it.ringKey) {
      const st = it.star || 0;
      html += `<div class="bag-cell relic-ring has" data-item="${it.id}">
        ${iconTag(it.ringSlot || 'ring_exp', 34)}
        <div class="nm" style="color:#ff8a8a">${it.ringKey ? DATA.SPECIAL_RINGS[it.ringKey].name : it.name}${st ? ' ' + '★'.repeat(st) : ''}</div></div>`;
    } else if (it.type === 'book') {
      html += `<div class="bag-cell book" data-book="${it.stat}">
        <div class="ic" style="color:${it.color};font-family:var(--serif)">书</div>
        <div class="nm" style="color:${it.color}">${it.name}</div>
        <span class="stack">×${it.count || 1}</span></div>`;
    } else {
      const dCP = equipDeltaPower(p, it);
      const locked = it.reqLv > p.level;
      const _isRing = it.slot && it.slot.indexOf('ring_') === 0;
      html += `<div class="bag-cell${locked ? ' locked' : ''}${_isRing ? ' relic-ring has' : ''}" data-item="${it.id}">
        ${iconTag(it.slot, 30, it.wtype, it.relicKey)}
        <div class="nm" style="color:${it.color}">${it.name}</div>
        ${!locked && dCP > 0 ? '<span class="up">▲</span>' : ''}
        <span class="cp-mini">${dCP > 0 ? '+' : ''}${dCP}</span>
        ${locked ? `<span class="lock-tag">需 Lv.${it.reqLv}</span>` : ''}</div>`;
    }
  }
  html += '</div>';
  html += `<div style="margin-top:10px;font-size:11px;color:#8f8570">
    左键装备 · 右键出售　|　战力 <b style="color:#ffd24a">${fmt(combatPower(p))}</b></div>`;
  return html;
}

function renderStatList(p) {
  const s = p.stats, A = s.A;
  const rows = [
    ['力量', A.str], ['敏捷', A.agi], ['智力', A.int], ['体质', A.vit],
    ['生命', s.hpMax], ['法力', s.mpMax],
    [s.isMagic ? '法强' : '攻击', Math.round(s.power)],
    ['攻速', s.as.toFixed(2) + '/s'],
    ['暴击', (s.crit*100).toFixed(1) + '%'],
    ['暴伤', (s.critDmg*100).toFixed(0) + '%'],
    ['护甲', Math.round(s.armor)],
    ['减伤', (s.dr*100).toFixed(1) + '%'],
    ['闪避', (s.dodge*100).toFixed(1) + '%'],
    ['吸血', (s.lifesteal*100).toFixed(1) + '%']
  ];
  return '<div class="stat-list">' + rows.map(r =>
    `<div class="st"><span>${r[0]}</span><b>${r[1]}</b></div>`).join('') + '</div>';
}

function charHtml() {
  const p = G.player;
  const race = DATA.RACES[p.race], cls = DATA.CLASSES[p.cls];
  const st = p.stats, A = st.A;
  const cp = combatPower(p), gp = Math.round(gearPower(p));
  const gt = gearTier(p);

  const isRing = sk => sk.indexOf('ring_') === 0;
  const slotHtml = (sk, size) => {
    const it = p.equip[sk];
    const qi = it ? DATA.QUALITY.findIndex(q => q.key === it.qKey) : -1;
    const ringCls = isRing(sk) ? (it ? ' relic-ring has' : ' relic-ring') : '';
    return `<div class="eq-v ${it ? 'q-border-' + it.qKey : 'none'}${ringCls}" data-slot="${sk}" ${it ? `data-item="${it.id}"` : ''}>
      ${isRing(sk) && it ? '<span class="relic-star">✦</span>' : ''}
      <span class="eq-lv">${it ? it.ilvl : '—'}</span>
      ${iconTag(sk, size || 34)}
      <span class="eq-nm" style="${it ? 'color:' + it.color : ''}">${it ? (it.enh ? '+' + it.enh + ' ' : '') + it.name.slice(0, 5) : DATA.SLOTS[sk].name}</span>
    </div>`;
  };

  // ---- 左：4 格 ----
  let left = '<div class="cp-side"><div class="side-title">装备</div>';
  ['weapon','helm','chest','legs'].forEach(sk => { left += slotHtml(sk); });
  left += '</div>';

  // ---- 右：4 格 ----
  let right = '<div class="cp-side"><div class="side-title">装备</div>';
  ['boots','neck','ring','trinket'].forEach(sk => { right += slotHtml(sk); });
  right += '</div>';

  // ---- 中：立绘 + 战力 + 特戒槽 ----
  let mid = '<div class="cp-center">';
  mid += `<div class="char-portrait"><canvas id="charPortrait" width="150" height="180"></canvas>
    <div class="char-name">${race.name} · ${cls.name}</div>
    <div class="char-lv">Lv.${p.level}</div></div>`;
  mid += `<div class="cp-block">
    <div class="cp-label">战斗力</div>
    <div class="cp-big">${fmt(cp)}</div>
    <div class="cp-sub">装备总评分 <b>${fmt(gp)}</b></div>
    <div class="cp-sub">装备达成 <b style="color:${gt.filled>=8?DATA.QUALITY[Math.max(0,gt.minIdx)].color:'#b8ad93'}">${gt.tierName}</b></div>
  </div>`;
  mid += `<div class="socket-row">
    <div class="socket-label">特戒</div>
    <div class="socket-grid">
      ${DATA.RING_SLOTS.map(r => slotHtml(r.slot, 32)).join('')}
    </div>
  </div>`;
  mid += '</div>';

  // ---- 属性列 ----
  const row = (n, v, c2) => `<div class="s-row"><span>${n}</span><b class="${c2 || ''}">${v}</b></div>`;
  let stats = '<div class="cp-col char-right">';
  stats += '<div class="s-group"><div class="s-title">核心属性</div>';
  stats += row(st.isMagic ? '内功攻击' : '外功攻击', Math.round(st.power), 'hot');
  const wp = p.equip.weapon;
  const wk = wp && wp.wtype ? DATA.WEAPON_KINDS[wp.wtype] : null;
  stats += row('本命武器',
    wk ? `${wk.label}${wk.cls.includes(p.cls) ? ' +' + Math.round(wk.bonus * 100) + '%' : '（不匹配）'}`
       : '未装备', wk && wk.cls.includes(p.cls) ? 'ok' : 'bad');
  stats += row('攻击速度', (st.as * 100).toFixed(0) + '%');
  stats += row('暴击率', (st.crit * 100).toFixed(1) + '%', 'hot');
  stats += row('暴击伤害', (st.critDmg * 100).toFixed(0) + '%');
  stats += row('吸血', (st.lifesteal * 100).toFixed(1) + '%');
  stats += '</div>';
  stats += '<div class="s-group"><div class="s-title">基础属性</div>';
  stats += row('气血上限', st.hpMax);
  stats += row('法力上限', st.mpMax);
  stats += row('护甲', Math.round(st.armor));
  stats += row('伤害减免', (st.dr * 100).toFixed(1) + '%');
  stats += row('闪避率', (st.dodge * 100).toFixed(1) + '%');
  stats += '</div>';
  stats += '<div class="s-group"><div class="s-title">主属性</div>';
  stats += row('力量', A.str); stats += row('敏捷', A.agi);
  stats += row('智力', A.int); stats += row('体质', A.vit);
  stats += '</div>';

  // 套装
  const sets = DATA.SETS[p.cls];
  const activeKey = (st.setBonus && st.setBonus.key) || null;
  stats += '<div class="s-group"><div class="s-title">职业套装（仅地狱掉落）</div>';
  sets.forEach(set => {
    const n = setCount(p, set.key);
    stats += `<div class="set-line${set.key === activeKey ? ' active' : ''}" data-set-info="${set.key}">
      <span class="set-dot" style="background:${n > 0 ? set.color : '#3a3020'}"></span>
      <span class="set-nm">${set.name}</span>
      <span class="set-cnt" style="color:${n >= 6 ? '#5fdc4a' : n > 0 ? '#ffd24a' : '#6b6558'}">${n}/6</span>
    </div>`;
  });
  stats += '</div>';

  stats += '<div class="s-group"><div class="s-title">额外</div>';
  stats += row('技能等级合计', Object.values(p.skills).reduce((x, y) => x + y, 0));
  stats += row('已完成委托', p.questDone + ' 次');
  stats += row('首杀成就', Object.keys(p.firstKills || {}).length + ' / 6');
  stats += '</div>';
  stats += '</div>';

  return `<div class="char-panel-v2">${left}${mid}${right}${stats}</div>`;
}

function skillHtml() {
  const p = G.player;
  const all = DATA.CLASSES[p.cls].skills;
  const km = p.keymap;
  const actives = all.filter(k => DATA.SKILLS[k].type === 'active');
  const passives = all.filter(k => DATA.SKILLS[k].type === 'passive');
  const keyOf = k => (k === p.dash ? 'D' : Object.keys(km).find(x => km[x] === k)?.toUpperCase() || '·');

  let html = `<div style="display:flex;gap:16px;font-size:12px;margin-bottom:10px;padding:6px 10px;
    background:rgba(60,48,28,.4);border:1px solid rgba(138,109,59,.5);border-radius:3px">
    <span style="color:#3fd45a">技能强化券 ×${p.materials.skillT||0}</span>
    <span style="color:#b45cff">技能突破券 ×${p.materials.breakT||0}</span>
    <span style="color:#8f8570">杀怪 +${DATA.SKILL_TIER.killProf}%／只　强化券 +${DATA.SKILL_TIER.ticketProf}%</span>
  </div><div class="skill-section"><h4>主动技能</h4>`;
  for (const k of actives) {
    const sp = DATA.SKILLS[k], lv = p.skills[k] || 0;
    const pf = skillProfOf(p, k);
    const pct = (pf.prof / DATA.SKILL_TIER.needProf * 100).toFixed(0);
    const full = pf.prof >= DATA.SKILL_TIER.needProf;
    const canBreak = full && pf.tier < DATA.SKILL_TIER.maxTier;
    const dmgUp = Math.round((DATA.SKILL_TIER.tierDmg * (pf.tier - 1)) * 100);
    const cdDown = Math.round((DATA.SKILL_TIER.tierCd * (pf.tier - 1)) * 100);
    html += `<div class="skill-row ${lv?'learned':''}">
      <div class="sk-ic">${keyOf(k)}</div>
      ${skillIconTag(k, 30)}
      <div class="sk-main"><div class="sk-name">${sp.name}
        <small>Lv.${lv}</small>
        <small style="color:#ffd24a">${pf.tier} 层</small>
        ${dmgUp||cdDown ? `<small style="color:#5fdc4a">+${dmgUp}%伤害 / -${cdDown}%CD</small>` : ''}</div>
      <div class="sk-desc">${sp.desc}　冷却 ${sp.cd}s${sp.cost?'　法力 '+sp.cost:''}</div>
      <div class="prof-bar"><i style="width:${pct}%;background:${full?'#ffd24a':'#5b3fa8'}"></i>
        <span>${pf.prof.toFixed(0)} / ${DATA.SKILL_TIER.needProf}</span></div>
      </div>
      ${canBreak
        ? `<button class="sk-btn ${(p.materials.breakT||0)>0?'':'lack'}" data-break-skill="${k}">
             突破 → ${pf.tier+1} 层<br><small>突破券 ${p.materials.breakT||0}/1</small></button>`
        : (pf.tier >= DATA.SKILL_TIER.maxTier
            ? `<button class="sk-btn" disabled>已满 5 层</button>`
            : `<button class="sk-btn" disabled>熟练度未满</button>`)}
    </div>`;
  }
  html += '</div><div class="skill-section"><h4>被动技能（最多 3 个）</h4>';
  for (const k of passives) {
    const sp = DATA.SKILLS[k], lv = p.skills[k] || 0;
    const eq = p.passive.indexOf(k);
    html += `<div class="skill-row ${lv?'learned':''}">
      <div class="sk-ic">${lv?lv:'?'}</div>
      <div class="sk-main"><div class="sk-name">${sp.name}${lv?`<small>Lv.${lv}</small>`:'<small style="color:#8f8570">未学习</small>'}
        ${eq>=0?'<small style="color:#3fd45a">已装备</small>':''}</div>
      <div class="sk-desc">${sp.desc}</div></div>
      ${lv?`<button class="sk-btn" data-equip-passive="${k}" ${eq>=0?'disabled':''}>${eq>=0?'已装备':'装备'}</button>`:''}
    </div>`;
  }
  return html + '</div><div style="font-size:11px;color:#8f8570">技能书由怪物掉落，或在兑换员处购买</div>';
}

/* ---------------- 关卡 / 难度选择 ---------------- */
function townMapHtml() {
  const p = G.player;
  let html = '<div class="npc-row" style="margin-bottom:10px"><div><div class="nr-name">回城</div>'
    + '<div class="nr-info">返回暴风城安全区（也可按 H）</div></div>'
    + '<button data-act-town style="border-color:#6b8a4a;color:#b9ffb0">回城</button></div>';
  html += '<div style="font-size:12px;color:#8f8570;margin:10px 0 8px">选择房间，再选难度进入</div><div class="room-pick">';
  DATA.ROOMS.forEach((r, i) => {
    const unlocked = p.unlocked.includes(i);
    const lvOk = p.level >= (r.reqLv || 1);
    const ok = unlocked && lvOk;
    const need = requiredCP(i, 'normal');
    const v = cpVerdict(combatPower(p), need);
    html += `<div class="room-btn ${ok?'':'locked'}" data-pick-room="${i}" data-reqlv="${r.reqLv||1}">
      <div class="rb-name">${r.name}</div>
      <div class="rb-sub">建议等级 ${r.reqLv}+　${ok ? '可进入' : (lvOk ? '未解锁' : '等级不足')}</div>
      <div class="rb-sub" style="color:${ok?v.color:'#ff6b5a'}">${lvOk ? '推荐 '+fmt(need)+'　你 '+fmt(combatPower(p)) : '需要 Lv.'+(r.reqLv||1)+'（当前 '+p.level+'）'}</div></div>`;
  });
  html += '</div><div style="font-size:11px;color:#8f8570">当前装备达成：<b style="color:#ffd98a">' +
    gearTier(p).tierName + '</b>　建议：简单=绿装 / 困难=蓝装 / 地狱=紫装</div>';
  return html;
}

function diffPickHtml(roomId) {
  const p = G.player;
  const r = DATA.ROOMS[roomId];
  let html = `<div style="font-family:var(--serif);font-size:16px;color:#ffd24a;margin-bottom:4px">${r.name}</div>
    <div style="font-size:11px;color:#8f8570;margin-bottom:12px">${r.desc}　推荐等级 ${r.lv}+</div>
    <div class="diff-pick">`;
  const myCP = combatPower(p);
  DATA.DIFF_ORDER.forEach(k => {
    const d = DATA.DIFFICULTY[k];
    const need = requiredCP(roomId, k);
    const v = cpVerdict(myCP, need);
    const pct = Math.min(100, myCP / need * 100);
    html += `<div class="diff-card" data-pick-diff="${k}" data-room="${roomId}"
        style="border-color:${v.color}55">
      <div class="dc-name" style="color:${d.color}">${d.name}</div>
      <div class="dc-info">怪物生命 ×${d.hpMul}<br>攻击 ×${d.atkMul}<br>掉落 ×${d.dropMul}</div>
      <div class="cp-line">推荐战力 <b style="color:${v.color}">${fmt(need)}</b></div>
      <div class="cp-line">你的战力 <b style="color:${v.color}">${fmt(myCP)}</b></div>
      <div class="cp-bar"><i style="width:${pct}%;background:${v.color}"></i></div>
      <div class="dc-req" style="color:${v.color};background:${v.color}22">${v.text}</div>
    </div>`;
  });
  html += `</div><div style="font-size:11px;color:#8f8570">当前装备达成：<b style="color:#ffd98a">${gearTier(p).tierName}</b></div>`;
  return html;
}

function openTownMap() {
  openModal('map', '选择关卡 · 难度', townMapHtml());
}

/* ---------------- NPC ---------------- */
function nearestNPC() {
  const w = G.world, p = G.player;
  if (!w || !w.npcs.length) return null;
  let best = null, bd = 95;
  for (const n of w.npcs) {
    const d = Math.hypot(n.x - p.x, (n.y - p.y) * 0.9);
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

/* 点击位置附近（40px 内）的 NPC */
function npcAt(wx, wy) {
  const w = G.world;
  if (!w) return null;
  for (const n of w.npcs) {
    if (Math.hypot(n.x - wx, (n.y - wy) * 0.9) < 46) return n;
  }
  return null;
}

function interactNPC(target) {
  const n = target || nearestNPC();
  if (!n) return;
  if (typeof Sfx !== 'undefined') Sfx.play('open');   // 翻书声
  switch (n.kind) {
    case 'teleport': openTownMap(); break;
    case 'merchant': toggleModal('merchant', '商人 · 赵帅帅', merchantHtml); break;
    case 'exchange': toggleModal('exchange', '兑换员 · 李准', exchangeHtml); break;
    case 'blacksmith': toggleModal('smith', '铁匠 · 范在英', smithHtml); break;
    case 'save': saveGame() ? toast('进度已保存') : toast('保存失败'); break;
    case 'quest': toggleModal('quest', '任务官 · 黄仁勋', questHtml); break;
    case 'craft': toggleModal('craft', '锻造台', craftHtml); break;
    case 'tower': toggleModal('tower', '爬塔 · 试炼之塔', towerHtml); break;
  }
}

function merchantHtml() {
  const p = G.player;
  const GOLD = fmt(p.gold);
  const sel = G._relicSel;
  const COLS = 4, ROWS = 6, TOTAL = COLS * ROWS;

  let cells = [];
  // 第一排：药水（4 格）
  DATA.POTIONS.forEach(po => {
    const ok = p.gold >= po.price;
    const pi = POTION_IDX[po.key] !== undefined ? POTION_IDX[po.key] : 18;
    cells.push(`<div class="m-cell potion" data-buy-potion="${po.key}" style="${ok?'':'opacity:.5'}">
      <span class="ic-sprite" style="width:34px;height:34px;background-size:${34*EQUIP_COUNT}px 34px;background-position:${-pi*34}px 0"></span>
      <div class="m-nm" style="color:${po.color}">${po.name}</div>
      <div class="m-sub">${po.hp ? '生命 +' + po.hp : '法力 +' + po.mp}</div>
      <div class="m-price">${fmt(po.price)} 金</div></div>`);
  });
  while (cells.length < COLS) cells.push('<div class="m-cell empty">—</div>');

  // 第 2 排起：圣物武器（每职业一把）
  const relics = DATA.RELIC_WEAPONS || [];
  relics.forEach(w => {
    const okLv = p.level >= w.reqLv;
    const okGold = p.gold >= w.price;
    const can = okLv && okGold;
    const own = (p.bag || []).some(x => x.relicKey === w.key) ||
                (p.equip.weapon && p.equip.weapon.relicKey === w.key);
    cells.push(`<div class="m-cell relic${sel === w.key ? ' sel' : ''}" data-relic="${w.key}">
      ${iconTag('weapon', 38, w.wtype, w.key)}
      <div class="m-nm relic-nm">${w.name.replace('圣物·','')}</div>
      <div class="m-sub">${DATA.CLASSES[w.cls].name}</div>
      <div class="m-price ${can ? 'ok' : 'no'}">${fmt(w.price)} 金</div></div>`);
  });
  while (cells.length < TOTAL) cells.push('<div class="m-cell empty">—</div>');

  let html = `<div class="m-head"><span>商人 · 赵帅帅</span><b>金币 ${GOLD}</b></div>`;
  html += `<div class="m-grid">${cells.join('')}</div>`;

  // 选中圣物 → 显示详情 + 兑换按钮
  if (sel) {
    const w = (DATA.RELIC_WEAPONS || []).find(x => x.key === sel);
    if (w) {
      const okLv = p.level >= w.reqLv, okGold = p.gold >= w.price;
      const lines = Object.keys(w.stats).map(k => {
        const v = w.stats[k];
        const pct = ['crit','critDmg','lifesteal','hit','dodge'].includes(k);
        return `<div class="rl-stat"><span>${AFFIX_NAMES[k] || k}</span><b>+${pct ? (v*100).toFixed(1)+'%' : Math.round(v)}</b></div>`;
      }).join('');
      html += `<div class="rl-box">
        <div class="rl-title" style="color:${w.color}">${w.name}</div>
        <div class="rl-meta">圣物 · ${DATA.CLASSES[w.cls].name}专用 · 需要 Lv.${w.reqLv}</div>
        <div class="rl-stats">${lines}
          <div class="rl-stat"><span>圣物特效</span><b class="rlc">命中削 5% 最大生命</b></div>
          <div class="rl-stat"><span>吸血</span><b class="rlc">+5.0%</b></div>
        </div>
        <div class="rl-tip">${w.desc}</div>
        <div class="rl-actions">
          <button data-relic-cancel>取消</button>
          <button data-buy-relic="${w.key}" ${okLv && okGold ? '' : 'disabled'}>
            ${okLv ? (okGold ? `确认兑换（${fmt(w.price)} 金）` : '金币不足') : '等级不足 Lv.' + w.reqLv}
          </button>
        </div>
      </div>`;
    }
  } else {
    html += `<div style="margin-top:8px;font-size:11px;color:#8f8570">
      点击圣物格子查看详情并兑换。圣物装备仅可用金币兑换，</div>
      <div style="font-size:11px;color:#8f8570;margin-top:2px">当前金币：<b style="color:#ffd24a">${GOLD}</b></div>`;
  }
  return html;
}


function exchangeHtml() {
  const p = G.player;
  const mySkills = DATA.CLASSES[p.cls].skills;
  let html = '<div class="npc-list">';
  for (const k of mySkills) {
    const sp = DATA.SKILLS[k], lv = p.skills[k] || 0;
    const price = 220 + lv * 380;
    const maxed = lv >= 5;
    html += `<div class="npc-row"><div><div class="nr-name">${sp.name}
      <span style="font-size:11px;color:#8f8570">${lv?'Lv.'+lv:'未学习'}</span></div>
      <div class="nr-info">${sp.type==='active'?'主动':'被动'}　${maxed?'已满级':price+' 金'}</div></div>
      <button data-buy-skill="${k}" ${maxed||p.gold<price?'disabled':''}>${maxed?'满级':'购买'}</button></div>`;
  }
  return html + `</div><div style="margin-top:10px;font-size:11px;color:#8f8570">金币：${fmt(p.gold)}</div>`;
}

function smithHtml() {
  const p = G.player;
  const enh = `<div class="npc-row" style="margin-bottom:10px"><div>
    <div class="nr-name">装备强化</div>
    <div class="nr-info">消耗金币 + 强化石提升装备，最高 +15</div></div>
    <button data-act-enhance style="border-color:#d4af37;color:#ffd24a">打开</button></div>`;
  const items = p.bag.filter(it => it.type !== 'potion');
  if (!items.length) return enh + '<div style="color:#8f8570">背包里没有可出售的装备</div>';
  let html = enh + '<div class="npc-list">';
  items.forEach(it => {
    const q = DATA.QUALITY.find(x => x.key === (it.qKey || it.quality))
              || { name:'普通', color:'#c8c8c8', key:'common' };
    const price = Math.round((20 + it.ilvl * 8) * Math.pow(2.2, DATA.QUALITY.indexOf(q)));
    html += `<div class="npc-row"><div><div class="nr-name" style="color:${it.color}">${it.name}</div>
      <div class="nr-info">物品等级 ${it.ilvl}　售价 ${price} 金</div></div>
      <button data-sell="${it.id}">出售</button></div>`;
  });
  return html + '</div>';
}

function settingsHtml() {
  const n = (G.chars || []).length;
  return `<div class="npc-list">
    <div class="npc-row"><div><div class="nr-name" style="color:#ffd24a">选择角色</div>
      <div class="nr-info">当前存档已有 ${n} / ${MAX_CHARS} 个角色</div></div>
      <button data-act-pick-char style="border-color:#d4af37;color:#ffd24a">打开</button></div>
    <div class="npc-row"><div><div class="nr-name">创建角色</div>
      <div class="nr-info">${n >= MAX_CHARS ? '角色已满，需先删除一个' : '再建一个新角色，进度互相独立'}</div></div>
      <button data-act-new-char ${n >= MAX_CHARS ? 'disabled' : ''}>新建</button></div>

    <div class="npc-row"><div><div class="nr-name">存档</div><div class="nr-info">手动保存</div></div>
      <button data-act-save>保存</button></div>
    <div class="npc-row"><div><div class="nr-name">导出存档</div><div class="nr-info">下载 json 备份</div></div>
      <button data-act-export>导出</button></div>
    <div class="npc-row"><div><div class="nr-name" style="color:#ff6b5a">重新开局</div>
      <div class="nr-info">删除角色，不可恢复</div></div>
      <button data-act-reset style="border-color:#6b2b2b;color:#ff8a7a">重开</button></div>
  </div>`;
}

/* ---------------- 装备详情页 ---------------- */
function itemDetailHtml(id, from) {
  const p = G.player;
  const it = findItem(id);
  if (!it) return '<div style="padding:20px;text-align:center;color:#8f8570">物品不存在</div>';

  const q = DATA.QUALITY.find(x => x.key === (it.qKey || it.quality)) || { name:'普通', color:'#c8c8c8' };
  const m = enhMul(it);
  const pctKeys = ['crit','critDmg','lifesteal','hit','dodge','as','all'];
  const W = DATA.WEAPON_KINDS[it.wtype];

  let stats = '';
  for (const k in (it.stats || {})) {
    const v = it.stats[k] * m;
    stats += `<div class="idt-stat"><span>${AFFIX_NAMES[k] || k}</span>
      <b>+${pctKeys.includes(k) ? (v*100).toFixed(1)+'%' : Math.round(v)}</b></div>`;
  }
  if (it.effect) {
    for (const k in it.effect) {
      stats += `<div class="idt-stat"><span>特戒效果</span><b class="eff">${effectText(k, it.effect[k] * m)}</b></div>`;
    }
  }
  if (it.relicPct) {
    stats += `<div class="idt-stat"><span>圣物特效</span><b class="eff">命中削 ${(it.relicPct*100).toFixed(0)}% 最大生命</b></div>`;
  }

  // 是否已穿戴（按实例 id 判断，背包和面板通用）
  const equippedSlot = Object.keys(p.equip).find(sk => p.equip[sk] && p.equip[sk].id === it.id);
  const equipped = !!equippedSlot;
  const locked = it.reqLv > p.level;

  const isRingItem = !!it.ringKey;
  const enhBtn = isRingItem
    ? `<button data-idt-ringup="1">升星</button>`
    : `<button data-idt-enh="${it.id}">强化</button>`;
  const btns =
    enhBtn +
    `<button class="primary" data-idt-equip="${it.id}" ${(equipped || locked) ? 'disabled' : ''}>` +
      (locked ? '需要 Lv.' + it.reqLv : '穿戴') + `</button>` +
    `<button class="danger" data-idt-unequip="${equippedSlot || it.slot}" ${equipped ? '' : 'disabled'}>卸下</button>` +
    (equipped ? '' : `<button class="danger" data-idt-sell="${it.id}">出售</button>`);

  return `<div class="idt-wrap" style="border-color:${q.color}44">
    <div class="idt-head">
      ${iconTag(it.slot, 56, it.wtype, it.relicKey)}
      <div class="idt-title">
        <div class="idt-name" style="color:${it.color}">${it.enh ? '+' + it.enh + ' ' : ''}${it.name}</div>
        <div class="idt-sub" style="color:${q.color}">${q.name} · ${slotName(it.slot)}${W ? ' · '+W.label : ''} · 物品等级 ${it.ilvl}</div>
        ${it.reqLv > 1 ? `<div class="idt-req" style="${locked?'color:#ff6b5a':''}">需要等级 ${it.reqLv}${locked?'（当前 '+p.level+'）':''}</div>` : ''}
      </div>
    </div>
    <div class="idt-stats">${stats || '<div style="color:#8f8570">（无属性）</div>'}</div>
    <div class="idt-actions">${btns}
      <button data-idt-close>关闭</button>
    </div>
    <div class="idt-hint">右键装备可直接穿戴 / 卸下</div>
  </div>`;
}

/* ---------------- 特戒强化 · 二级：选择特戒 ---------------- */
function ringUpHtml() {
  const p = G.player;
  const pool = ringMergeList(p);

  // 统计每种特戒的数量与最高星
  const stat = {};
  Object.keys(DATA.SPECIAL_RINGS).forEach(k => { stat[k] = { n: 0, maxStar: 0 }; });
  pool.forEach(x => {
    const k = x.ring.ringKey;
    if (!stat[k]) stat[k] = { n: 0, maxStar: 0 };
    stat[k].n++;
    stat[k].maxStar = Math.max(stat[k].maxStar, x.ring.star || 0);
  });

  let html = `<div style="font-size:11.5px;color:#8f8570;margin-bottom:10px">
    选择要强化的特戒。规则：<b style="color:#ff8a8a">2 枚同款同星</b> → 合成 <b>+1 星</b>，最高 5 星，每星效果 <b style="color:#ffd24a">+50%</b>。
  </div><div class="ring-pick">`;

  Object.keys(DATA.SPECIAL_RINGS).forEach(k => {
    const def = DATA.SPECIAL_RINGS[k];
    const st = stat[k] || { n: 0, maxStar: 0 };
    const have = st.n > 0;
    html += `<div class="ring-card ${have ? '' : 'empty'}" data-ring-pick="${k}">
      <span class="rc-ic">${iconTag('ring_' + (k === 'exp' ? 'exp' : k), 40)}</span>
      <div class="rc-body">
        <div class="rc-name" style="color:#ff8a8a">${def.name}</div>
        <div class="rc-sub">${st.maxStar ? '最高 ' + st.maxStar + '★' : '未拥有'}</div>
        <div class="rc-cnt">持有 <b>${st.n}</b> 枚</div>
      </div>
      <span class="rc-arrow">›</span>
    </div>`;
  });

  html += `</div><div class="idt-actions" style="margin-top:12px">
    <button data-act-craft>返回锻造台</button></div>`;
  return html;
}

/* ---------------- 特戒强化 · 三级：某个特戒的 1~5 星 ---------------- */
function ringStarHtml(ringKey) {
  const p = G.player;
  const def = DATA.SPECIAL_RINGS[ringKey];
  if (!def) return ringUpHtml();

  const pool = ringMergeList(p).filter(x => x.ring.ringKey === ringKey);
  const cnt = {};
  pool.forEach(x => { const st = x.ring.star || 0; cnt[st] = (cnt[st] || 0) + 1; });

  const baseEff = Object.keys(def.effect).map(k => effectText(k, def.effect[k])).join('；');

  let html = `<div class="ring-detail-head">
    <span>${iconTag('ring_exp', 46)}</span>
    <div>
      <div class="rdh-name" style="color:#ff8a8a">${def.name}</div>
      <div class="rdh-sub">基础效果：${baseEff}</div>
      <div class="rdh-sub">持有合计 <b style="color:#ffd24a">${pool.length}</b> 枚</div>
    </div>
  </div>`;

  html += '<div class="star-list">';
  for (let star = 1; star <= RING_MAX_STAR; star++) {
    const src = star - 1;                       // 用 src 星合成 star 星
    const need = 2;
    const have = cnt[src] || 0;
    const can = have >= need;
    const effMul = ringStarMul(star);
    const effTxt = Object.keys(def.effect).map(k => effectText(k, def.effect[k] * effMul)).join('；');

    html += `<div class="star-row ${can ? 'can' : ''}">
      <div class="sr-star">${'★'.repeat(star)}${'☆'.repeat(RING_MAX_STAR - star)}</div>
      <div class="sr-body">
        <div class="sr-need">需要 <b>${src}★ × ${need}</b>　持有 <b class="${can ? 'ok' : 'no'}">${have}</b></div>
        <div class="sr-eff">${effTxt}</div>
      </div>
      <button data-ring-merge="${ringKey}" data-ring-star="${src}" ${can ? '' : 'disabled'}>
        ${can ? '合成 ' + star + '★' : '材料不足'}
      </button>
    </div>`;
  }
  html += '</div>';

  html += `<div class="idt-actions" style="margin-top:12px">
    <button data-ring-back="1">返回特戒列表</button>
    <button data-act-craft>返回锻造台</button></div>`;
  return html;
}

/* ---------------- 圣物兑换 ---------------- */
function buyRelic(key) {
  const p = G.player;
  const w = (DATA.RELIC_WEAPONS || []).find(x => x.key === key);
  if (!w) return;
  if (p.level < w.reqLv) { toast(`等级不足：需要 Lv.${w.reqLv}`); return; }
  if (p.gold < w.price) { toast('金币不足'); return; }
  const own = (p.bag || []).some(x => x.relicKey === key) ||
              (p.equip.weapon && p.equip.weapon.relicKey === key);
  if (own) { toast('这件圣物你已经拥有了'); return; }

  p.gold -= w.price;
  const item = {
    id: 'rl' + Math.random().toString(36).slice(2, 8),
    slot: 'weapon', type: 'equip', quality: 'relic', qKey: 'relic',
    name: w.name, color: w.color, ilvl: w.reqLv, reqLv: w.reqLv,
    wtype: w.wtype, relicKey: w.key, relicPct: w.relicPct,
    stats: Object.assign({}, w.stats), enh: 0, locked: true
  };
  const ok = addToBag(p, item);
  if (!ok) { p.gold += w.price; toast('背包已满'); return; }
  if (typeof Sfx !== 'undefined') { Sfx.play('lvlup'); Sfx.speak('A relic of power.'); }
  toast(`兑换成功：${w.name}`);
  logMsg(`🎖 获得圣物 ${w.name}`, 'level');
  G._relicSel = null;
  saveGame();
  openModal('merchant', '商人 · 赵帅帅', merchantHtml());
}

/* ---------------- 调试面板 ---------------- */
function debugHtml() {
  const d = G.debug || (G.debug = {});
  const on = v => v ? 'style="border-color:#5fdc4a;color:#b9ffb0"' : '';
  const tag = v => v ? '已开启' : '已关闭';
  const w = G.world;
  const cnt = w ? w.monsters.filter(m => m.alive).length : 0;

  return `<div style="font-size:11.5px;color:#8f8570;margin-bottom:10px">
    调试开关只影响当前会话，刷新页面即恢复。当前地图存活怪物：<b style="color:#ffd24a">${cnt}</b>
  </div>
  <div class="npc-list">
    <div class="npc-row"><div>
      <div class="nr-name" style="color:#4ad4ff">快速刷怪（间隔 1 秒）</div>
      <div class="nr-info">开启后小怪每 1 秒补满一次（默认 15 秒）　当前：${tag(d.fastSpawn)}</div></div>
      <button data-dbg-toggle="fastSpawn" ${d.fastSpawn ? 'style="border-color:#5fdc4a;color:#b9ffb0"' : ''}>${d.fastSpawn ? '关闭' : '开启'}</button></div>

    <div class="npc-row"><div>
      <div class="nr-name" style="color:#ff3b3b">获取特戒 ×2（每种）</div>
      <div class="nr-info">6 种特戒各发 2 枚，用于测试特戒合成升星</div></div>
      <button data-dbg-rings="2" style="border-color:#ff3b3b;color:#ff8a8a">发放</button></div>

    <div class="npc-row"><div>
      <div class="nr-name" style="color:#ff3b3b">获取特戒 ×8（每种）</div>
      <div class="nr-info">每种 8 枚，够合成到 3 星</div></div>
      <button data-dbg-rings="8" style="border-color:#ff3b3b;color:#ff8a8a">发放</button></div>

    <div class="npc-row"><div>
      <div class="nr-name" style="color:#ffb347">攻速加强（平A ×6 速度）</div>
      <div class="nr-info">开启后普通攻击冷却缩短到 1/6，箭雨一样快　当前：${tag(d.fastAtk)}</div></div>
      <button data-dbg-toggle="fastAtk" ${d.fastAtk ? 'style="border-color:#5fdc4a;color:#b9ffb0"' : ''}>${d.fastAtk ? '关闭' : '开启'}</button></div>

    <div class="npc-row"><div>
      <div class="nr-name">技能 CD 固定 1 秒</div>
      <div class="nr-info">当前：${tag(d.noCd)}</div></div>
      <button data-dbg-toggle="noCd" ${d.noCd ? 'style="border-color:#5fdc4a;color:#b9ffb0"' : ''}>${d.noCd ? '关闭' : '开启'}</button></div>

    <div class="npc-row"><div>
      <div class="nr-name">无敌模式</div>
      <div class="nr-info">当前：${tag(d.invincible)}</div></div>
      <button data-dbg-toggle="invincible" ${d.invincible ? 'style="border-color:#5fdc4a;color:#b9ffb0"' : ''}>${d.invincible ? '关闭' : '开启'}</button></div>

    <div class="npc-row"><div>
      <div class="nr-name">无限蓝量</div>
      <div class="nr-info">当前：${tag(d.infMp)}</div></div>
      <button data-dbg-toggle="infMp" ${d.infMp ? 'style="border-color:#5fdc4a;color:#b9ffb0"' : ''}>${d.infMp ? '关闭' : '开启'}</button></div>
  </div>
  <div style="margin-top:10px;font-size:11px;color:#8f8570">
    提示：配合 <b>A</b> 自动攻击 + <b>S</b> 自动技能，开无敌和无 CD 就能一直刷特效。
  </div>`;
}

/* ---------------- 角色列表 ---------------- */
function charListHtml() {
  const chars = G.chars || [];
  let html = `<div style="font-size:11.5px;color:#8f8570;margin-bottom:10px">
    一个存档最多 ${MAX_CHARS} 个角色，进度互相独立。</div><div class="npc-list">`;
  for (let i = 0; i < MAX_CHARS; i++) {
    const it = chars[i];
    if (!it) {
      html += `<div class="npc-row" style="opacity:.45"><div>
        <div class="nr-name" style="color:#5a5348">空位 ${i + 1}</div>
        <div class="nr-info">尚未创建角色</div></div>
        <button disabled>空</button></div>`;
      continue;
    }
    const act = i === G.active;
    const cp = (() => { try { return combatPower(it); } catch (e) { return 0; } })();
    html += `<div class="npc-row" style="${act ? 'border-color:#5fdc4a' : ''}">
      <div style="flex:1">
        <div class="nr-name" style="color:${act ? '#5fdc4a' : DATA.CLASSES[it.cls].color}">
          ${DATA.RACES[it.race].name} · ${DATA.CLASSES[it.cls].name}
          ${act ? '<span style="font-size:10px">· 当前</span>' : ''}</div>
        <div class="nr-info">Lv.${it.level}　战力 ${fmt(cp)}　金币 ${fmt(it.gold)}</div>
      </div>
      <button data-switch-char="${i}" ${act ? 'disabled' : ''}>${act ? '游戏中' : '切换'}</button>
      ${chars.length > 1 && !act ? `<button data-del-char="${i}" style="border-color:#6b2b3b;color:#ff8a9a">删除</button>` : ''}
    </div>`;
  }
  return html + '</div>';
}

/* ---------------- 套装图鉴 ---------------- */
function setDetailHtml(key) {
  const p = G.player;
  const set = (DATA.SETS[p.cls] || []).find(x => x.key === key);
  if (!set) return '<div>套装不存在</div>';
  const n = setCount(p, set.key);

  let html = `<div class="set-head" style="border-left-color:${set.color}">
    <div class="enh-name" style="color:${set.color}">${set.name}</div>
    <div class="enh-sub">职业套装 · ${DATA.CLASSES[p.cls].name}专属 · 已集齐 ${n}/6</div>
    <div class="enh-sub" style="color:#ff9a6a">掉落来源：${DATA.ROOMS[set.room].name} · <b>仅地狱难度</b> · 7% 概率</div>
  </div>`;

  html += '<div class="col-title" style="margin:10px 0 8px">套装部件</div><div class="eq-grid" style="grid-template-columns:repeat(3,1fr)">';
  DATA.SET_SLOTS.forEach(sl => {
    const it = p.equip[sl];
    const mine = it && it.setKey === set.key;
    const anyInSlot = p.bag.find(x => x.type !== 'potion' && x.setKey === set.key && x.slot === sl);
    html += `<div class="eq-slot ${mine ? 'q-border-rare' : ''}" style="cursor:default;opacity:${mine || anyInSlot ? 1 : .45}"
      ${it ? `data-item="${it.id}" data-slot="${sk}"` : ''}>
      <span class="eq-lv">${DATA.SLOTS[sl].name}</span>
      ${iconTag(sl, 34)}
      <span class="eq-nm" style="${mine ? 'color:#5fdc4a' : anyInSlot ? 'color:#ffd24a' : ''}">
        ${mine ? '已穿戴' : anyInSlot ? '在背包' : '未获得'}</span>
    </div>`;
  });
  html += '</div>';

  html += '<div class="col-title" style="margin:14px 0 8px">套装效果</div>';
  html += `<div class="enh-line"><span>4 件</span><b class="${n>=4?'ok':''}">主属性（${statName(set.primary)}）+${Math.round(set.b4.pct*100)}%　${n>=4?'✅ 已生效':'未激活'}</b></div>`;
  html += `<div class="enh-line"><span>6 件</span><b class="${n>=6?'ok':''}">${statName(set.primary)} +${set.b6.flat} · 技能伤害 +${Math.round(set.b6.skillDmg*100)}%　${n>=6?'✅ 已生效':'未激活'}</b></div>`;
  html += `<div style="margin-top:12px;font-size:11px;color:#8f8570">
    高图套装更强：第 1 图 4件+10%，第 6 图 4件+35%。同一时间只有集齐件数最多的那套生效。</div>`;
  return html;
}

/* 进图确认 */
function doEnterRoom(room, diff) {
  G.diff = diff;
  closeModal();
  enterRoom(room);
  toast(`进入 ${DATA.ROOMS[room].name}（${DATA.DIFFICULTY[diff].name}）`);
}

/* 等级警告 */
function warnHtml(room, diff) {
  const p = G.player, r = DATA.ROOMS[room], d = DATA.DIFFICULTY[diff];
  const gap = r.lv - p.level;
  const danger = gap >= 10 ? '极度危险' : gap >= 5 ? '危险' : '稍有挑战';
  const dc = gap >= 10 ? '#ff3b3b' : gap >= 5 ? '#ff9a2e' : '#ffd24a';
  const boss = DATA.BOSSES[r.boss];
  const estHp = Math.round(boss.hp * d.hpMul);
  const myDps = Math.round(p.stats.power * p.stats.as);
  const secs = Math.round(estHp / Math.max(1, myDps));
  const survive = Math.round(p.stats.hpMax / Math.max(1, boss.atk * d.atkMul * 1.4));

  return `<div style="text-align:center;margin-bottom:14px">
    <div style="font-family:var(--serif);font-size:22px;color:${dc};letter-spacing:.1em">${danger}</div>
    <div style="font-size:13px;color:#b8ad93;margin-top:6px">你的等级 <b style="color:#fff">${p.level}</b>　本图推荐 <b style="color:#ff9a6a">${r.lv}+</b></div>
  </div>
  <div class="enh-line"><span>房间</span><b>${r.name}（${d.name}难度）</b></div>
  <div class="enh-line"><span>推荐战力</span><b style="color:${cpVerdict(p.level?combatPower(p):0, requiredCP(room, diff)).color}">${fmt(requiredCP(room, diff))}　（你 ${fmt(combatPower(p))}）</b></div>
  <div class="enh-line"><span>BOSS</span><b>${boss.name} · 生命 ${fmt(estHp)}</b></div>
  <div class="enh-line"><span>你的输出</span><b>约 ${fmt(myDps)} DPS</b></div>
  <div class="enh-line"><span>预计击杀耗时</span><b class="${secs>90?'bad':secs>45?'warn':'ok'}">${secs} 秒</b></div>
  <div class="enh-line"><span>可承受伤害</span><b class="${survive<secs?'bad':'ok'}">${survive} 秒</b></div>
  ${survive < secs ? '<div style="text-align:center;color:#ff6b5a;font-size:12px;margin-top:10px">⚠ 按当前装备，你可能打不过这个 BOSS</div>' : ''}
  <div class="enh-btns">
    <button class="big-btn primary" data-enter-confirm="1" data-room="${room}" data-diff="${diff}">仍然进入</button>
    <button class="big-btn" data-enter-cancel="1">返回</button>
  </div>`;
}

/* ---------------- 装备图鉴 ---------------- */
function codexEquipHtml() {
  const p = G.player;
  const sets = DATA.SETS[p.cls] || [];
  const owned = sets.filter(st => setCount(p, st.key) >= 6).length;

  let html = `<div class="col-title" style="margin-bottom:8px">职业套装 ${owned}/${sets.length} 套已集齐</div>`;
  html += '<div class="npc-list">';
  sets.forEach(st => {
    const n = setCount(p, st.key);
    html += `<div class="cx-row">
      <span class="set-dot" style="background:${n ? st.color : '#3a3020'}"></span>
      <span class="cx-nm">${st.name}</span>
      <span style="font-size:10px;color:#8f8570">${DATA.ROOMS[st.room].name}</span>
      <span class="cx-cnt" style="color:${n >= 6 ? '#5fdc4a' : n ? '#ffd24a' : '#6b6558'}">${n}/6</span>
    </div>`;
  });
  html += '</div>';

  html += `<div class="col-title" style="margin:14px 0 8px">特戒</div>`;
  html += '<div class="npc-list">';
  DATA.RING_SLOTS.forEach(rs => {
    const got = !!(p.firstKills && Object.keys(DATA.BOSS_RINGS).some(k => DATA.BOSS_RINGS[k].ring === rs.ring && p.firstKills[k]))
      || !!(p.equip[rs.slot]);
    const bossKey = Object.keys(DATA.BOSS_RINGS).find(k => DATA.BOSS_RINGS[k].ring === rs.ring);
    html += `<div class="cx-row">
      <span class="set-dot" style="background:${got ? rs.color : '#3a3020'}"></span>
      <span class="cx-nm" style="color:${got ? rs.color : '#6b6558'}">${rs.name}</span>
      <span style="font-size:10px;color:#8f8570">${bossKey ? DATA.BOSSES[bossKey].name : '—'}</span>
      <span class="cx-cnt" style="color:${got ? '#5fdc4a' : '#6b6558'}">${got ? '已获得' : '未获得'}</span>
    </div>`;
  });
  html += '</div>';
  html += `<div style="margin-top:10px;font-size:11px;color:#8f8570">套装仅「地狱」难度掉落（7%）；特戒由 BOSS 掉落或首杀获得</div>`;
  return html;
}

/* ---------------- 收藏图鉴 ---------------- */
function codexCollectHtml() {
  const p = G.player;
  const today = todayStr();
  let html = '<div style="font-size:11.5px;color:#8f8570;margin-bottom:10px">击杀 BOSS 累计次数可提升图鉴等级（共 10 级），等级越高该地图的伤害 / 爆率 / 经验加成越多。</div>';

  Object.keys(DATA.BOSS_RINGS).forEach((bk, i) => {
    const room = DATA.ROOMS.find(r => r.boss === bk);
    const kills = codexKills(p, bk);
    const lv = codexLevel(kills);
    const next = DATA.CODEX_LEVELS[lv] || null;
    const cur = lv ? DATA.CODEX_LEVELS[lv - 1] : { dmg:0, drop:0, exp:0 };
    const pct = next ? Math.min(100, kills / next.kills * 100) : 100;
    const claimed = p.codexDaily && p.codexDaily[bk] === today;
    const killedToday = p.codexKillDay && p.codexKillDay[bk] === today;
    const canClaim = killedToday && !claimed;

    html += `<div style="margin-bottom:10px;padding:8px 10px;border-radius:3px;
      background:rgba(60,48,28,.32);border-left:2px solid ${room ? room.accent : '#8a6d3b'}">
      <div style="display:flex;align-items:center;gap:8px">
        <span class="cx-lv">${DATA.BOSSES[bk].name}</span>
        <span style="font-size:11px;color:#8f8570;flex:1">${room ? room.name : ''}</span>
        <span style="font-family:var(--serif);color:#ffd24a">Lv.${lv} / 10</span>
      </div>
      <div class="cx-bar"><i style="width:${pct}%;background:${room ? room.accent : '#d4af37'}"></i></div>
      <div style="font-size:11px;color:#b8ad93;display:flex;justify-content:space-between">
        <span>击杀 ${kills}${next ? ` / ${next.kills}` : ''}</span>
        <span style="color:#5fdc4a">伤害 +${Math.round(cur.dmg*100)}% · 爆率 +${Math.round(cur.drop*100)}% · 经验 +${Math.round(cur.exp*100)}%</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:6px">
        <span style="font-size:10.5px;color:${killedToday ? '#5fdc4a' : '#8f8570'}">每日首杀奖励：强化石×3 + 技能强化券×1${killedToday ? '（今日已击杀）' : '（需今日击杀该 BOSS）'}</span>
        <button data-codex-claim="${bk}" ${canClaim ? '' : 'disabled'}
          style="margin-left:auto;padding:3px 12px;font-size:11px;border-radius:2px;cursor:pointer;
          font-family:var(--serif);background:linear-gradient(180deg,#3a3020,#181209);
          border:1px solid ${claimed ? '#3a3020' : 'var(--gold)'};color:${claimed ? '#5a5348' : '#ffd24a'}">
          ${claimed ? '今日已领' : killedToday ? '领取' : '未击杀'}</button>
      </div>
    </div>`;
  });
  return html;
}

/* ---------------- 爬塔 ---------------- */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
}
function towerInit() {
  if (!G.tower) G.tower = { active:false, floor:1, best:0, date:todayStr(), attempts:DATA.TOWER.dailyAttempts };
  if (G.tower.date !== todayStr()) {
    G.tower.date = todayStr();
    G.tower.attempts = DATA.TOWER.dailyAttempts;
  }
}
function towerHtml() {
  towerInit();
  const t = G.tower;
  let html = `<div style="display:flex;gap:16px;font-size:12px;margin-bottom:10px">
    <span style="color:#ffd24a">最高层：${t.best || 0} / ${DATA.TOWER.maxFloor}</span>
    <span style="color:#7fd4ff">今日剩余次数：${t.attempts} / ${DATA.TOWER.dailyAttempts}</span></div>`;
  html += '<div class="npc-list">';
  const start = Math.max(1, Math.min(DATA.TOWER.maxFloor, (t.best || 0) + 1));
  html += `<div class="npc-row"><div><div class="nr-name">进入第 ${start} 层</div>
    <div class="nr-info">怪物生命 ×${DATA.TOWER.hpMul(start).toFixed(1)}　攻击 ×${DATA.TOWER.atkMul(start).toFixed(1)}</div></div>
    <button data-tower-start="${start}" ${t.attempts > 0 ? '' : 'disabled'}>挑战</button></div>`;
  html += `<div class="npc-row"><div><div class="nr-name">从第 1 层重来</div>
    <div class="nr-info">重新挑战，消耗 1 次机会</div></div>
    <button data-tower-start="1" ${t.attempts > 0 ? '' : 'disabled'}>重来</button></div>`;
  html += '</div>';
  html += '<div style="font-size:11px;color:#8f8570;margin-top:10px">每层奖励：金币 · 强化石 · 强化保护券(每5层) · 技能强化券(每3层) · 技能突破券(每10层)</div>';
  return html;
}
function enterTower(floor, free) {
  towerInit();
  const t = G.tower;
  if (!free) {
    if (t.attempts <= 0) { toast('今日爬塔次数已用完'); return; }
    t.attempts--;
  }
  t.active = true;
  t.floor = floor || 1;
  G.diff = 'normal';
  closeModal();
  enterRoom((t.floor - 1) % DATA.ROOMS.length);
  toast(`爬塔 · 第 ${t.floor} 层`);
}
function clearTowerFloor() {
  const t = G.tower;
  if (!t || !t.active) return;
  const p = G.player;
  const r = DATA.TOWER.reward(t.floor);
  p.gold += r.gold;
  p.materials.stone = (p.materials.stone || 0) + r.stone;
  if (r.protect) p.materials.protect = (p.materials.protect || 0) + r.protect;
  if (r.skillT) p.materials.skillT = (p.materials.skillT || 0) + r.skillT;
  if (r.breakT) p.materials.breakT = (p.materials.breakT || 0) + r.breakT;
  t.best = Math.max(t.best || 0, t.floor);
  toast(`✅ 第 ${t.floor} 层通过：+${fmt(r.gold)} 金 · 强化石×${r.stone}`);
  saveGame();
  if (t.floor >= DATA.TOWER.maxFloor) {
    t.active = false;
    toast('🎉 通关全部 20 层！');
    logMsg('🎉 爬塔通关 20 层', 'level');
    const p2 = G.player;
    if (!p2.reviveRingGot) {
      p2.reviveRingGot = true;
      const ring = makeRing(DATA.SPECIAL_RINGS.revive, 'revive');
      equipSpecialRing(p2, ring);
      toast('🎁 获得【复活之戒】！');
      logMsg('🎁 通关奖励：复活之戒（死亡时原地复活）', 'level');
    }
    saveGame();
    return;
  }
  t.floor++;
  setTimeout(() => { if (t.active) enterTower(t.floor, true); }, 900);
}

/* ---------------- 装备强化（锻造台两步式） ---------------- */
function matBar(p) {
  return `<div style="display:flex;gap:16px;font-size:12px;margin-bottom:12px;padding:7px 12px;
    background:rgba(60,48,28,.45);border:1px solid rgba(138,109,59,.55);border-radius:3px">
    <span style="color:#ffd24a">金币 ${fmt(p.gold)}</span>
    <span style="color:#9aa0a6">强化石 ×${p.materials.stone||0}</span>
    <span style="color:#4a9eff">强化保护券 ×${p.materials.protect||0}</span>
  </div>`;
}

/* 第一步：锻造台 —— 选择要强化的装备（身上 + 背包） */
function enhanceHtml() {
  const p = G.player;
  const cls = DATA.CLASSES[p.cls], race = DATA.RACES[p.race];
  let html = matBar(p);

  // ---- 身上装备：左右各 4 格 + 中间人物（与 C 面板一致）----
  const eqSlot = (sk) => {
    const it = p.equip[sk];
    const lv = it ? (it.enh || 0) : 0;
    if (!it) {
      return `<div class="fh-slot empty">
        <span class="fh-nm">${DATA.SLOTS[sk].name}</span>
        <span class="fh-ph">—</span>
        <span class="fh-sub">未装备</span></div>`;
    }
    return `<div class="fh-slot" data-enh-pick="${it.id}" style="border-color:${it.color}">
      ${iconTag(sk, 40, it.wtype, it.relicKey)}
      <span class="fh-enh">+${lv}</span>
      <span class="fh-nm" style="color:${it.color}">${it.name.slice(0, 6)}</span>
      <span class="fh-sub">${DATA.SLOTS[sk].name}</span></div>`;
  };

  html += '<div class="fh-wrap">';
  html += '<div class="fh-col">' + ['weapon','helm','chest','legs'].map(eqSlot).join('') + '</div>';
  html += `<div class="fh-mid">
    <canvas id="enhPortrait" width="92" height="110"></canvas>
    <div class="fh-name">${race.name} · ${cls.name}</div>
    <div class="fh-lv">Lv.${p.level}</div>
  </div>`;
  html += '<div class="fh-col">' + ['boots','neck','ring','trinket'].map(eqSlot).join('') + '</div>';
  html += '</div>';

  // ---- 背包装备 ----
  const bagItems = p.bag.filter(it => it.type !== 'potion' && it.type !== 'book' && it.slot);
  html += `<div class="col-title" style="margin:14px 0 8px">背包装备（${bagItems.length}）</div>`;
  if (!bagItems.length) {
    html += '<div style="color:#6b6558;font-size:12px;padding:6px">背包里没有装备</div>';
  } else {
    html += '<div class="forge-grid">';
    bagItems.slice(0, 16).forEach(it => {
      html += `<div class="forge-slot" data-enh-pick="${it.id}">
        ${iconTag(it.slot, 42, it.wtype, it.relicKey)}
        <span class="fs-enh">+${it.enh || 0}</span>
        <span class="fs-nm" style="color:${it.color}">${it.name.slice(0, 6)}</span>
      </div>`;
    });
    html += '</div>';
  }
  html += '<div style="font-size:11px;color:#8f8570;margin-top:12px">点上面任意一格选择要强化的装备 · 特戒请用「特戒强化」升星</div>';
  return html;
}


/* 第二步：选中某件装备 → 强化详情 */
function enhanceItemHtml(id) {
  const p = G.player;
  const it = findItem(id);
  if (!it) return enhanceHtml();

  const lv = it.enh || 0;
  const maxed = lv >= DATA.ENHANCE.max;
  const gold = DATA.ENHANCE.goldCost(lv);
  const stone = DATA.ENHANCE.stoneCost(lv);
  const rate = Math.round(DATA.ENHANCE.rate(lv) * 100);
  const curMul = DATA.ENHANCE.statMul(lv);
  const nextMul = DATA.ENHANCE.statMul(Math.min(lv + 1, DATA.ENHANCE.max));
  const delta = Math.round((nextMul - curMul) * 100);
  const onBody = Object.values(p.equip).some(e => e && e.id === it.id);

  let html = matBar(p);
  html += `<div class="enh-head">
    ${iconTag(it.slot, 56, it.wtype, it.relicKey)}
    <div>
      <div class="enh-name" style="color:${it.color}">+${lv} ${it.name}</div>
      <div class="enh-sub">${(DATA.QUALITY.find(q => q.key === (it.qKey || it.quality)) || {name:'普通'}).name} · ${slotName(it.slot)} · 物品等级 ${it.ilvl}
        ${onBody ? '<span style="color:#5fdc4a">· 已穿戴</span>' : '<span style="color:#8f8570">· 在背包</span>'}</div>
    </div>
  </div>`;

  // 属性变化
  html += '<div class="enh-attrs">';
  if (it.effect) {
    for (const k in it.effect) {
      const nm = effectName(k);
      if (effectScales(k)) {
        const v0 = it.effect[k] * curMul, v1 = it.effect[k] * nextMul;
        html += `<div class="enh-attr"><span>${nm}</span>
          <b>${(v0 * 100).toFixed(1)}%</b><i>→</i><b class="up">${maxed ? '—' : (v1 * 100).toFixed(1) + '%'}</b></div>`;
      } else {
        html += `<div class="enh-attr"><span>${nm}</span>
          <b class="up" style="min-width:auto">${effectText(k)}</b></div>`;
      }
    }
  }
  for (const k in it.stats) {
    const v0 = it.stats[k] * curMul, v1 = it.stats[k] * nextMul;
    const pct = PCT_KEYS.includes(k);
    const f = x => pct ? (x * 100).toFixed(1) + '%' : Math.round(x);
    html += `<div class="enh-attr"><span>${AFFIX_NAMES[k] || k}</span>
      <b>${f(v0)}</b><i>→</i><b class="up">${maxed ? '—' : f(v1)}</b></div>`;
  }
  html += '</div>';

  if (maxed) {
    html += '<div class="enh-big" style="color:#ffd24a">已达最高强化等级 +15</div>';
  } else {
    html += `<div class="enh-lv">强化等级 <b>+${lv}</b> → <b style="color:#5fdc4a">+${lv + 1}</b></div>`;
    html += `<div class="enh-line"><span>成功率</span><b class="${rate >= 100 ? 'ok' : rate >= 70 ? 'warn' : 'bad'}">${rate}%</b></div>`;
    html += `<div class="enh-line"><span>属性提升</span><b>+${delta}%</b></div>`;
    html += `<div class="enh-line"><span>消耗金币</span><b class="${p.gold >= gold ? '' : 'bad'}">${fmt(gold)} / ${fmt(p.gold)}</b></div>`;
    html += `<div class="enh-line"><span>消耗强化石</span><b class="${(p.materials.stone||0) >= stone ? '' : 'bad'}">${stone} / ${p.materials.stone||0}</b></div>`;
    if (lv >= 11) {
      html += `<div class="enh-line"><span>失败惩罚</span><b class="bad">掉 1 级（用保护券可免）</b></div>`;
    }
    // 保护券
    const pNeed = DATA.ENHANCE.protectNeed(lv);
    const pHave = p.materials.protect || 0;
    const pRate = Math.round(DATA.ENHANCE.rateWithProtect(lv) * 100);
    html += `<div class="enh-line"><span>保护券</span><b class="${pHave >= pNeed ? 'ok' : ''}">需要 ${pNeed} 张 / 持有 ${pHave}</b></div>`;
    html += `<div class="enh-line"><span>用券后成功率</span><b class="ok">${pRate}%</b></div>`;

    html += '<div class="enh-btns">';
    html += `<button class="big-btn primary" data-enh-do="${it.id}" data-protect="0">强化</button>`;
    html += `<button class="big-btn" data-enh-do="${it.id}" data-protect="1"
      ${pHave >= pNeed ? '' : 'disabled'}>用保护券（${pNeed} 张）</button>`;
    html += '<button class="big-btn" data-enh-back="1">返回</button>';
    html += '</div>';
  }
  return html;
}

/* ---------------- 任务官 ---------------- *//* ---------------- 任务官 ---------------- */
function questHtml() {
  const p = G.player;
  const qs = p.quests || [];
  let html = '';

  // ---- 进行中 ----
  html += `<div class="col-title" style="margin-bottom:8px">进行中（${qs.length}）</div>`;
  if (!qs.length) {
    html += '<div style="color:#6b6558;font-size:12px;padding:8px">还没有接取任务</div>';
  } else {
    html += '<div class="npc-list">';
    qs.forEach(q => {
      const done = q.have >= q.need;
      const pct = Math.min(100, q.have / q.need * 100);
      html += `<div class="npc-row"><div style="flex:1">
        <div class="nr-name">${q.name}
          ${done ? '<span style="color:#5fdc4a;font-size:11px">· 可领取</span>' : ''}</div>
        <div class="nr-info">在【${DATA.ROOMS[q.room].name}】击杀 ${q.need} 只　进度 ${q.have}/${q.need}</div>
        <div class="q-bar"><i style="width:${pct}%;background:${done?'#5fdc4a':'#c9a24a'}"></i></div>
        <div class="nr-info" style="color:#ffd98a">${q.exp} 经验 · ${q.gold} 金 · ${DATA.MATERIALS[q.mat].name} ×${q.matN}</div>
        </div>
        ${done
          ? `<button data-quest-claim="${q.id}" style="border-color:#6b8a4a;color:#b9ffb0">领取</button>`
          : `<button data-quest-drop="${q.id}" style="border-color:#6b2b3b;color:#ff8a9a">放弃</button>`}
      </div>`;
    });
    html += '</div>';
  }

  // ---- 可接取 ----
  const activeIds = qs.map(q => q.id);
  const avail = DATA.QUEST_POOL.filter(q => !activeIds.includes(q.id));
  html += `<div class="col-title" style="margin:14px 0 8px">可接取（${avail.length}）· 可全部接取</div>`;
  html += `<div style="display:flex;gap:8px;margin-bottom:8px">
    <button class="sm-btn" data-quest-accept-all>一键全部接取</button></div>`;
  html += '<div class="npc-list">';
  if (!avail.length) {
    html += '<div style="color:#6b6558;font-size:12px;padding:8px">已接完所有悬赏</div>';
  }
  avail.forEach(q => {
    const unlocked = p.unlocked.includes(q.room);
    html += `<div class="npc-row"><div>
      <div class="nr-name" style="${unlocked ? '' : 'color:#5a5348'}">${q.name}</div>
      <div class="nr-info">${DATA.ROOMS[q.room].name} · 击杀 ${q.need} 只</div>
      <div class="nr-info" style="color:#ffd98a">${q.exp} 经验 · ${q.gold} 金 · ${DATA.MATERIALS[q.mat].name} ×${q.matN}</div>
      </div><button data-quest-accept="${q.id}" ${unlocked ? '' : 'disabled'}>${unlocked ? '接取' : '未解锁'}</button></div>`;
  });
  html += '</div>';
  html += `<div style="margin-top:10px;font-size:11px;color:#8f8570">已完成委托：${p.questDone} 次　·　同房间的多个任务击杀会同时计数</div>`;
  return html;
}

function acceptQuest(id) {
  const p = G.player;
  if (!Array.isArray(p.quests)) p.quests = [];
  const q = DATA.QUEST_POOL.find(x => x.id === id);
  if (!q) return;
  if (p.quests.some(x => x.id === id)) { toast('已接取该任务'); return; }
  if (!p.unlocked.includes(q.room)) { toast('该房间尚未解锁'); return; }
  p.quests.push({ ...q, have: 0 });
  toast(`接取任务：${q.name}`);
  QT_SIG = '';
  openModal('quest', '任务官 · 黄仁勋', questHtml());
}

function acceptAllQuests() {
  const p = G.player;
  if (!Array.isArray(p.quests)) p.quests = [];
  let n = 0;
  DATA.QUEST_POOL.forEach(q => {
    if (p.quests.some(x => x.id === q.id)) return;
    if (!p.unlocked.includes(q.room)) return;
    p.quests.push({ ...q, have: 0 });
    n++;
  });
  toast(n ? `一键接取 ${n} 个任务` : '没有可接取的任务');
  QT_SIG = '';
  openModal('quest', '任务官 · 黄仁勋', questHtml());
}

function claimQuest(id) {
  const p = G.player;
  const i = (p.quests || []).findIndex(q => q.id === (id || ''));
  if (i < 0) return;
  const q = p.quests[i];
  if (q.have < q.need) { toast('任务尚未完成'); return; }
  gainExp(p, q.exp);
  p.gold += q.gold;
  p.materials[q.mat] = (p.materials[q.mat] || 0) + q.matN;
  p.questDone++;
  p.quests.splice(i, 1);
  toast(`任务完成：+${q.exp} 经验 +${q.gold} 金 +${DATA.MATERIALS[q.mat].name}×${q.matN}`);
  logMsg(`✔ 完成委托「${q.name}」`, 'level');
  saveGame();
  openModal('quest', '任务官 · 黄仁勋', questHtml());
}

function dropQuest(id) {
  const p = G.player;
  const i = (p.quests || []).findIndex(q => q.id === id);
  if (i < 0) return;
  const q = p.quests.splice(i, 1)[0];
  toast(`已放弃「${q.name}」`);
  openModal('quest', '任务官 · 黄仁勋', questHtml());
}

/* ---------------- 锻造台 ---------------- */
function craftHtml() {
  const p = G.player;
  const CRAFT_MATS = ['iron', 'mithril', 'scale', 'shard'];

  // ---- 强化入口（和铁匠一样） ----
  let html = `<div class="npc-row" style="margin-bottom:12px;border-color:#8a6d3b">
    <div><div class="nr-name" style="color:#ffd24a">⚒ 装备强化</div>
    <div class="nr-info">消耗金币 + 强化石，把装备强化到最高 +15</div></div>
    <button data-act-enhance style="border-color:#d4af37;color:#ffd24a">打开</button></div>`;

  // ---- 特戒强化入口 ----
  html += `<div class="npc-row" style="margin-bottom:12px;border-color:#ff3b3b">
    <div><div class="nr-name" style="color:#ff6b6b">💍 特戒强化</div>
    <div class="nr-info">2 枚同款同星特戒 → 合成 +1 星（最高 5 星，每星 +50% 效果）</div></div>
    <button data-act-ringup style="border-color:#ff3b3b;color:#ff8a8a">打开</button></div>`;

  // ---- 合成说明 ----
  html += `<div class="col-title" style="margin:8px 0 8px">材料合成装备</div>`;
  html += `<div style="font-size:11px;color:#8f8570;margin-bottom:8px">按当前角色等级（Lv.${p.level}）打造</div>`;
  html += `<div style="font-size:11.5px;color:#8f8570;line-height:1.7;margin-bottom:10px;
    padding:8px 10px;background:rgba(60,48,28,.35);border-left:2px solid #8a6d3b;border-radius:2px">
    用材料<b style="color:#ffd98a">直接打造</b>一件指定品质的装备（部位随机）。<br>
    材料来自：<b style="color:#ffd98a">悬赏任务奖励</b> · <b style="color:#ffd98a">怪物 / BOSS 掉落</b>
  </div>`;

  // ---- 材料栏（只显示合成材料） ----
  html += '<div style="display:flex;gap:16px;margin-bottom:10px;font-size:12px;flex-wrap:wrap">';
  CRAFT_MATS.forEach(k => {
    const m = DATA.MATERIALS[k];
    const n = p.materials[k] || 0;
    html += `<span style="color:${n > 0 ? m.color : '#5a5348'}">${m.name} ×${n}</span>`;
  });
  html += `<span style="margin-left:auto;color:#ffd24a">金币 ${fmt(p.gold)}</span></div>`;

  // ---- 配方 ----
  html += '<div class="npc-list">';
  DATA.CRAFT.forEach((c, i) => {
    const q = DATA.QUALITY.find(x => x.key === c.quality);
    const okMat = Object.keys(c.need).every(k => (p.materials[k] || 0) >= c.need[k]);
    const okGold = p.gold >= c.gold;
    const can = okMat && okGold;

    let needTxt = Object.keys(c.need).map(k => {
      const have = p.materials[k] || 0, need = c.need[k];
      const ok = have >= need;
      return `<span style="color:${ok ? '#7fd4a8' : '#ff8a7a'}">${DATA.MATERIALS[k].name} ${have}/${need}</span>`;
    }).join(' + ');

    html += `<div class="npc-row" style="align-items:flex-start">
      <div style="flex:1">
        <div class="nr-name" style="color:${q.color}">${c.name}</div>
        <div class="nr-info" style="margin:3px 0">${needTxt}
          <span style="color:${okGold ? '#ffd24a' : '#ff8a7a'}">+ ${c.gold} 金</span></div>
        <div class="nr-info" style="color:#6b6558">产出：${q.name}品质随机部位（武器/头盔/胸甲/护腿/战靴/项链/戒指/饰品）</div>
      </div>
      <button data-craft="${i}" ${can ? '' : 'disabled'}>${can ? '锻造' : '材料不足'}</button>
    </div>`;
  });
  html += '</div>';
  return html;
}

function doCraft(i) {
  const p = G.player, c = DATA.CRAFT[i];
  if (!c) return;
  if (!Object.keys(c.need).every(k => (p.materials[k]||0) >= c.need[k])) { toast('材料不足'); return; }
  if (p.gold < c.gold) { toast('金币不足'); return; }
  Object.keys(c.need).forEach(k => { p.materials[k] -= c.need[k]; });
  p.gold -= c.gold;
  const slot = pick(DATA.LOOT_SLOTS);
  const lvl = Math.max(1, p.level);   // 按当前角色等级打造
  const it = makeItem(slot, lvl, c.quality, p.stats.isMagic);
  if (!addToBag(p, it)) { p.gold += 30; }
  toast(`锻造出 ${it.name}`);
  logMsg(`⚒ 锻造：${it.name}`, 'loot');
  saveGame();
  openModal('craft', '锻造台', craftHtml());
}

/* ---------------- 弹窗事件 ---------------- */
function bindModal() {
  const body = $('modalBody');

  body.querySelectorAll('[data-pick-room]').forEach(b => b.onclick = () => {
    const i = +b.dataset.pickRoom;
    if (!G.player.unlocked.includes(i)) { toast('尚未解锁'); return; }
    openModal('map', '选择难度 · ' + DATA.ROOMS[i].name, diffPickHtml(i));
  });

  body.querySelectorAll('[data-pick-diff]').forEach(b => b.onclick = () => {
    const diff = b.dataset.pickDiff, room = +b.dataset.room;
    if (!G.player.unlocked.includes(room)) { toast('尚未解锁'); return; }
    const r = DATA.ROOMS[room], p = G.player;
    // 等级不足 → 警告
    if (p.level < r.lv) {
      openModal('warn', '⚠ 等级警告', warnHtml(room, diff));
      return;
    }
    doEnterRoom(room, diff);
  });
  body.querySelectorAll('[data-enter-confirm]').forEach(b => b.onclick = () => {
    doEnterRoom(+b.dataset.room, b.dataset.diff);
  });
  body.querySelectorAll('[data-enter-cancel]').forEach(b => b.onclick = () => {
    openModal('map', '传送 / 回城', townMapHtml());
  });

  body.querySelectorAll('[data-buy-potion]').forEach(b => b.onclick = () => {
    const po = DATA.POTIONS.find(x => x.key === b.dataset.buyPotion);
    const p = G.player;
    if (p.gold < po.price) return;
    p.gold -= po.price;
    p.bag.push({ ...po, type:'potion' });
    toast(`购买 ${po.name}`);
    openModal('merchant', '商人 · 赵帅帅', merchantHtml());
  });

  body.querySelectorAll('[data-buy-skill]').forEach(b => b.onclick = () => {
    const k = b.dataset.buySkill, p = G.player;
    const lv = p.skills[k] || 0, price = 220 + lv * 380;
    if (p.gold < price || lv >= 5) return;
    p.gold -= price;
    const r = learnSkill(p, k);
    toast(r === 'new' ? `学会 ${DATA.SKILLS[k].name}` : `${DATA.SKILLS[k].name} 升级`);
    openModal('exchange', '兑换员 · 李准', exchangeHtml());
  });

  body.querySelectorAll('[data-sell]').forEach(b => b.onclick = () => {
    const it = G.player.bag.find(x => x.id === b.dataset.sell);
    if (it) { sellItem(G.player, it); openModal('smith', '铁匠 · 范在英', smithHtml()); }
  });

  body.querySelectorAll('[data-equip-passive]').forEach(b => b.onclick = () => {
    const k = b.dataset.equipPassive, p = G.player;
    const idx = p.passive.indexOf(null);
    if (idx < 0) { toast('被动栏已满'); return; }
    p.passive[idx] = k; recalcStats(p);
    openModal('skill', '技能', skillHtml());
  });

  body.querySelectorAll('[data-item]').forEach(el => {
    const it = findItem(el.dataset.item);
    if (!it) return;
    el.onmouseenter = e => showTooltip(it, e.clientX, e.clientY);
    el.onmousemove = e => moveTooltip(e.clientX, e.clientY);
    el.onmouseleave = hideTooltip;
    // 左键：打开详情页（装备 / 强化 / 出售）
    el.onclick = () => {
      hideTooltip();
      openModal('item', it.name, itemDetailHtml(it.id, el.dataset.slot ? 'char' : 'bag'));
    };
    // 右键：直接装备 / 卸下
    el.oncontextmenu = e => {
      e.preventDefault();
      hideTooltip();
      if (el.dataset.slot) { unequipItem(G.player, el.dataset.slot); }
      else {
        if (it.reqLv > G.player.level) { toast(`等级不足：需要 Lv.${it.reqLv}（当前 ${G.player.level}）`); return; }
        if (it.ringKey) wearRing(G.player, it);
        else equipItem(G.player, it);
      }
      Sfx.play('click');
      saveGame();
      openModal('bag', '背包 · 装备', bagHtml());
    };
  });

  body.querySelectorAll('[data-book]').forEach(el => el.onclick = () => {
    const p = G.player;
    const stat = el.dataset.book;
    const n = useBook(p, stat, 1);
    if (!n) return;
    const nm = { str:'力量', agi:'敏捷', int:'智力', vit:'体质' }[stat] || stat;
    toast(`${DATA.BOOKS[stat].name} 使用：${nm} +1（永久）`);
    logMsg(`永久属性：${nm} +1`, 'level');
    saveGame();
    openModal('bag', '背包 · 装备', bagHtml());
  });
  body.querySelectorAll('[data-book]').forEach(el => {
    const p = G.player;
    const bk = p.bag.find(x => x.type === 'book' && x.stat === el.dataset.book);
    if (!bk) return;
    el.onmouseenter = e => showTooltip(bk, e.clientX, e.clientY);
    el.onmousemove = e => moveTooltip(e.clientX, e.clientY);
    el.onmouseleave = hideTooltip;
  });
  body.querySelectorAll('[data-act-ringup]').forEach(el => el.onclick = () => {
    openModal('ringup', '特戒强化', ringUpHtml());
  });
  body.querySelectorAll('[data-act-craft]').forEach(el => el.onclick = () => {
    openModal('craft', '锻造台', craftHtml());
  });
  body.querySelectorAll('[data-ring-pick]').forEach(el => el.onclick = () => {
    const k = el.dataset.ringPick;
    Sfx.play('click');
    openModal('ringup', '特戒强化 · ' + DATA.SPECIAL_RINGS[k].name, ringStarHtml(k));
  });
  body.querySelectorAll('[data-ring-back]').forEach(el => el.onclick = () => {
    openModal('ringup', '特戒强化', ringUpHtml());
  });
  body.querySelectorAll('[data-ring-merge]').forEach(el => el.onclick = () => {
    const key = el.dataset.ringMerge, src = +el.dataset.ringStar;
    const r = mergeRings(G.player, key, src);
    if (!r.ok) { toast(r.msg); return; }
    Sfx.play('lvlup');
    toast(`合成成功：${r.ring.name}`);
    saveGame();
    openModal('ringup', '特戒强化 · ' + DATA.SPECIAL_RINGS[key].name, ringStarHtml(key));
  });
  body.querySelectorAll('[data-mat]').forEach(el => {
    el.onclick = () => {
      const k = el.dataset.mat;
      const M = DATA.MATERIALS[k];
      const cnt = (G.player.materials && G.player.materials[k]) || 0;
      toast(`${M.name}：${cnt} 个（材料自动堆叠，不占背包格）`);
    };
  });
  body.querySelectorAll('[data-potion]').forEach(el => el.onclick = () => {
    const p = G.player;
    const po = p.bag.find(x => x.type === 'potion' && x.key === el.dataset.potion);
    if (!po) return;
    if (po.hp) p.hp = Math.min(p.stats.hpMax, p.hp + po.hp);
    if (po.mp) p.mp = Math.min(p.stats.mpMax, p.mp + po.mp);
    consumePotion(p, po.key, 1);
    openModal('bag','背包 · 装备', bagHtml());
  });

  body.querySelectorAll('[data-idt-equip]').forEach(el => el.onclick = () => {
    const it = findItem(el.dataset.idtEquip); if (!it) return;
    if (it.reqLv > G.player.level) { toast('等级不足'); return; }
    if (it.ringKey) { wearRing(G.player, it); }
    else equipItem(G.player, it);
    saveGame(); closeModal();
  });
  body.querySelectorAll('[data-idt-unequip]').forEach(el => el.onclick = () => {
    unequipItem(G.player, el.dataset.idtUnequip); saveGame(); closeModal();
  });
  body.querySelectorAll('[data-idt-sell]').forEach(el => el.onclick = () => {
    const it = findItem(el.dataset.idtSell); if (!it) return;
    sellItem(G.player, it); saveGame(); closeModal();
  });
  body.querySelectorAll('[data-idt-ringup]').forEach(el => el.onclick = () => {
    openModal('ringup', '特戒强化', ringUpHtml());
  });
  body.querySelectorAll('[data-idt-enh]').forEach(el => el.onclick = () => {
    openModal('forge', '强化 · 铸造台', enhanceItemHtml(el.dataset.idtEnh));
  });
  body.querySelectorAll('[data-idt-close]').forEach(el => el.onclick = () => closeModal());
  body.querySelectorAll('[data-relic]').forEach(el => el.onclick = () => {
    G._relicSel = (G._relicSel === el.dataset.relic) ? null : el.dataset.relic;
    if (typeof Sfx !== 'undefined') Sfx.play('click');
    openModal('merchant', '商人 · 赵帅帅', merchantHtml());
  });
  body.querySelectorAll('[data-relic-cancel]').forEach(el => el.onclick = () => {
    G._relicSel = null;
    openModal('merchant', '商人 · 赵帅帅', merchantHtml());
  });
  body.querySelectorAll('[data-buy-relic]').forEach(el => el.onclick = () => {
    buyRelic(el.dataset.buyRelic);
  });
  body.querySelectorAll('[data-dbg-rings]').forEach(b => b.onclick = () => {
    const n = +b.dataset.dbgRings || 1;
    const p = G.player;
    let given = 0;
    Object.keys(DATA.SPECIAL_RINGS).forEach(k => {
      for (let i = 0; i < n; i++) {
        equipSpecialRing(p, makeRing(DATA.SPECIAL_RINGS[k], k));
        given++;
      }
    });
    recalcStats(p); saveGame();
    toast(`已发放 ${given} 枚特戒（${Object.keys(DATA.SPECIAL_RINGS).length} 种 × ${n}）`);
    logMsg(`🛠 调试：发放 ${given} 枚特戒`, 'loot');
    openModal('debug', '调试面板 · N', debugHtml());
  });
  body.querySelectorAll('[data-dbg-toggle]').forEach(b => b.onclick = () => {
    const k = b.dataset.dbgToggle;
    G.debug[k] = !G.debug[k];
    toast(`${k}: ${G.debug[k] ? '开' : '关'}`);
    openModal('debug', '调试面板 · N', debugHtml());
  });
  body.querySelectorAll('[data-act-pick-char]').forEach(b => b.onclick = () => {
    openModal('chars', '选择角色', charListHtml());
  });
  body.querySelectorAll('[data-act-new-char]').forEach(b => b.onclick = () => {
    G.creatingNew = true;
    closeModal();
    SEL = { race: 'human', cls: 'warrior' };
    buildCreateScreen();
    showScreen('create');
  });
  body.querySelectorAll('[data-switch-char]').forEach(b => b.onclick = () => {
    const i = +b.dataset.switchChar;
    if (!switchChar(i)) { toast('已经在该角色上'); return; }
    saveGame();
    closeModal();
    startGame();
    toast(`切换到 ${DATA.RACES[G.player.race].name} · ${DATA.CLASSES[G.player.cls].name}`);
  });
  body.querySelectorAll('[data-del-char]').forEach(b => b.onclick = () => {
    const i = +b.dataset.delChar;
    if ((G.chars || []).length <= 1) { toast('至少要保留一个角色'); return; }
    if (!confirm('确定删除该角色？不可恢复')) return;
    deleteChar(i);
    saveGame();
    openModal('chars', '选择角色', charListHtml());
  });
  body.querySelectorAll('[data-act-town]').forEach(b => b.onclick = () => { closeModal(); goTown(); });
  body.querySelectorAll('[data-act-enhance]').forEach(b => b.onclick = () => openModal('enhance', '铁匠 · 装备强化', enhanceHtml()));
  body.querySelectorAll('[data-tower-start]').forEach(b => b.onclick = () => enterTower(+b.dataset.towerStart));
  body.querySelectorAll('[data-set-info]').forEach(b => b.onclick = () => {
    openModal('setinfo', '套装图鉴', setDetailHtml(b.dataset.setInfo));
  });
  body.querySelectorAll('[data-codex-claim]').forEach(b => b.onclick = () => {
    const bk = b.dataset.codexClaim;
    const p = G.player;
    if (!p.codexDaily) p.codexDaily = {};
    const today = todayStr();
    if (p.codexDaily[bk] === today) { toast('今日已领取'); return; }
    if (!p.codexKillDay || p.codexKillDay[bk] !== today) { toast('需要今天先击杀一次该 BOSS'); return; }
    p.codexDaily[bk] = today;
    p.materials.stone = (p.materials.stone || 0) + 3;
    p.materials.skillT = (p.materials.skillT || 0) + 1;
    toast('领取成功：强化石×3 · 技能强化券×1');
    QT_SIG = '';
    openModal('codexCollect', '收藏图鉴', codexCollectHtml());
  });
  body.querySelectorAll('[data-enh-pick]').forEach(b => b.onclick = () => {
    openModal('enhance', '锻造台 · 强化', enhanceItemHtml(b.dataset.enhPick));
  });
  body.querySelectorAll('[data-enh-back]').forEach(b => b.onclick = () => {
    openModal('enhance', '锻造台 · 装备强化', enhanceHtml());
  });
  body.querySelectorAll('[data-enh-do]').forEach(b => b.onclick = () => {
    const it = findItem(b.dataset.enhDo);
    if (!it) return;
    const res = enhanceItem(G.player, it, b.dataset.protect === '1');
    toast(res.msg);
    recalcStats(G.player);
    saveGame();
    openModal('enhance', '锻造台 · 强化', enhanceItemHtml(it.id));
  });
  body.querySelectorAll('[data-break-skill]').forEach(b => b.onclick = () => {
    const k = b.dataset.breakSkill;
    const r = breakthrough(G.player, k);
    toast(r === 'ok' ? `✅ 突破成功！${DATA.SKILLS[k].name} 升到第 ${skillProfOf(G.player,k).tier} 层`
        : r === 'max' ? '已是最高层（5 层）'
        : r === 'prof' ? `熟练度未满（${skillProfOf(G.player,k).prof.toFixed(0)}/${DATA.SKILL_TIER.needProf}）`
        : `❌ 缺少技能突破券（现有 ${G.player.materials.breakT||0} 张）`);
    openModal('skill', '技能', skillHtml());
  });
  body.querySelectorAll('[data-bag-page]').forEach(b => b.onclick = () => {
    G.player.bagPage = +b.dataset.bagPage;
    openModal('bag', '背包 · 装备', bagHtml());
  });
  body.querySelectorAll('[data-act="sellWorse"]').forEach(b => b.onclick = () => handleCommand('sellWorse'));
  body.querySelectorAll('[data-act="sellWeapons"]').forEach(b => b.onclick = () => {
    const p = G.player;
    const cnt = p.bag.filter(x => isLowPowerWeapon(p, x)).length;
    if (!cnt) { toast('没有低战力武器（红装与特戒已排除）'); return; }
    if (!confirm(`确定出售 ${cnt} 件低战力武器？（不含红装/特戒）`)) return;
    const r = sellAllLowWeapons(p);
    toast(`已出售 ${r.n} 件低战力武器，获得 ${fmt(r.gold)} 金`);
    logMsg(`出售 ${r.n} 件低战力武器 → ${fmt(r.gold)} 金`, 'loot');
    saveGame();
    openModal('bag', '背包 · 装备', bagHtml());
  });
  body.querySelectorAll('[data-toggle-autosellweapon]').forEach(cb => cb.onchange = () => {
    G.autoSellWeapon = cb.checked;
    toast('自动出售低战力武器：' + (cb.checked ? '开' : '关'));
    saveGame();
  });
  body.querySelectorAll('[data-toggle-autosell]').forEach(cb => cb.onchange = () => {
    G.autoSell = cb.checked; toast(G.autoSell ? '自动出售：开' : '自动出售：关');
  });
  body.querySelectorAll('[data-quest-accept]').forEach(b => b.onclick = () => acceptQuest(b.dataset.questAccept));
  body.querySelectorAll('[data-quest-accept-all]').forEach(b => b.onclick = acceptAllQuests);
  body.querySelectorAll('[data-quest-drop]').forEach(b => b.onclick = () => dropQuest(b.dataset.questDrop));
  body.querySelectorAll('[data-quest-claim]').forEach(b => b.onclick = () => claimQuest(b.dataset.questClaim));
  body.querySelectorAll('[data-craft]').forEach(b => b.onclick = () => doCraft(+b.dataset.craft));
  body.querySelectorAll('[data-act-save]').forEach(b => b.onclick = () => { saveGame(); toast('已保存'); });
  body.querySelectorAll('[data-act-export]').forEach(b => b.onclick = exportSave);
  body.querySelectorAll('[data-act-reset]').forEach(b => b.onclick = () => {
    if (!confirm('确定删除当前角色重新开始吗？')) return;
    clearSave(); location.reload();
  });
}

function findItem(id) {
  const p = G.player;
  for (const s in p.equip) if (p.equip[s] && p.equip[s].id === id) return p.equip[s];
  return p.bag.find(x => x.id === id);
}

/* ---------------- Tooltip ---------------- */
const AFFIX_NAMES = { str:'力量', agi:'敏捷', int:'智力', vit:'体质', atk:'攻击力', spell:'法术强度',
  as:'攻击速度', crit:'暴击率', critDmg:'暴击伤害', armor:'护甲', hp:'生命值',
  dodge:'闪避率', lifesteal:'吸血', hit:'命中', mp:'法力值', all:'全属性' };
const PCT_KEYS = ['as','crit','critDmg','dodge','lifesteal','hit'];

function showTooltip(it, x, y) {
  hideTooltip();
  TIP = document.createElement('div');
  TIP.className = 'tooltip';
  if (it.type === 'book') {
    const nm = { str:'力量', agi:'敏捷', int:'智力', vit:'体质' }[it.stat] || it.stat;
    TIP.innerHTML = `<h4 style="color:${it.color}">${it.name}</h4>
      <div class="tt-sub">永久属性提升 · 持有 ${it.count || 1} 本</div>
      <div class="tt-stat">点击使用：${nm} +1（永久生效）</div>
      <div class="tt-desc">已累计使用后加成：力 +${G.player.bonus.str}　敏 +${G.player.bonus.agi}　智 +${G.player.bonus.int}　体 +${G.player.bonus.vit}</div>`;
  } else if (it.type === 'potion') {
    TIP.innerHTML = `<h4 style="color:${it.color}">${it.name}</h4>
      <div class="tt-desc">${it.hp ? '回复 ' + it.hp + ' 生命' : '回复 ' + it.mp + ' 法力'}</div>`;
  } else {
    const q = DATA.QUALITY.find(x => x.key === (it.qKey || it.quality))
              || { name:'普通', color:'#c8c8c8', key:'common' };
    const enhTxt = it.enh ? `<span style="color:#5fdc4a">+${it.enh}</span> ` : '';
    const parts = [`<h4 style="color:${it.color}">${enhTxt}${it.name}</h4>`,
      `<div class="tt-sub">${q.name} · ${slotName(it.slot)} · 物品等级 ${it.ilvl}</div>`];
    if (it.wtype && DATA.WEAPON_KINDS[it.wtype]) {
      const K = DATA.WEAPON_KINDS[it.wtype];
      const own = K.cls.includes(G.player.cls);
      parts.push(`<div style="font-size:11px;margin-top:2px;color:${own ? '#5fdc4a' : '#8f8570'}">
        ${K.label}类${own ? ` · 本命武器 攻击 +${Math.round(K.bonus * 100)}%` : ' · 非本命（无加成）'}</div>`);
    }
    if (it.effect) {
      const m = enhMul(it);
      const lines = Object.keys(it.effect).map(k => effectText(k, it.effect[k] * m));
      parts.push(`<div style="color:${it.color};font-size:11.5px;margin-top:3px;line-height:1.6">${lines.join('<br>')}</div>`);
      if (it.enh) parts.push(`<div style="font-size:10px;color:#8f8570">强化 +${it.enh} 已加成到效果数值</div>`);
    }
    if (it.setKey) {
      const set = (DATA.SETS[G.player.cls] || []).find(x => x.key === it.setKey);
      if (set) {
        const n = setCount(G.player, set.key);
        parts.push(`<div style="color:${set.color};font-size:11px;margin-top:2px">【${set.name}】职业套装（${n}/6）</div>`);
      }
    }
    for (const k in it.stats) {
      const v = it.stats[k];
      parts.push(`<div class="tt-stat">+${PCT_KEYS.includes(k) ? (v*100).toFixed(1)+'%' : v} ${AFFIX_NAMES[k]||k}</div>`);
    }
    if (it.reqLv > G.player.level) {
      parts.push(`<div class="tt-req" style="font-size:12px;font-weight:700">⛔ 等级不足：需要 Lv.${it.reqLv}（当前 Lv.${G.player.level}）</div>`);
    }

    // ---- 左右并排对比（左：当前装备 / 右：候选装备 / 中间差值）----
    const cur = G.player.equip[it.slot];
    if (cur) {
      const curM = enhMul(cur), newM = enhMul(it);
      const keys = [];
      const seen = new Set();
      for (const k in cur.stats) if (!seen.has(k)) { seen.add(k); keys.push(k); }
      for (const k in it.stats) if (!seen.has(k)) { seen.add(k); keys.push(k); }

      const fmtV = (k, v) => PCT_KEYS.includes(k) ? (v * 100).toFixed(1) + '%' : Math.round(v);

      let g = '<div class="cmp-grid">';
      g += '<div class="cmp-h">当前装备</div><div class="cmp-h"></div><div class="cmp-h">候选装备</div>';
      g += `<div class="cmp-nm" style="color:${cur.color || '#c8c8c8'}">${cur.enh ? '+' + cur.enh + ' ' : ''}${cur.name}</div>`;
      g += '<div></div>';
      g += `<div class="cmp-nm" style="color:${it.color}">${it.enh ? '+' + it.enh + ' ' : ''}${it.name}</div>`;

      keys.forEach(k => {
        const v0 = (cur.stats[k] || 0) * curM;
        const v1 = (it.stats[k] || 0) * newM;
        const d = v1 - v0;
        const pct = PCT_KEYS.includes(k);
        g += `<div class="cmp-v">${cur.stats[k] !== undefined ? fmtV(k, v0) : '—'}</div>`;
        if (Math.abs(d) < 1e-9) {
          g += '<div class="cmp-d">—</div>';
        } else {
          const txt = pct ? (Math.abs(d) * 100).toFixed(1) + '%' : Math.abs(Math.round(d));
          g += `<div class="cmp-d ${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'}${txt}</div>`;
        }
        g += `<div class="cmp-v">${it.stats[k] !== undefined ? fmtV(k, v1) : '—'}</div>`;
      });

      // 属性名单独一行放不下，改用后缀提示
      g = g.replace(/<div class="cmp-v">/g, '<div class="cmp-v"><i></i><span>');
      g = g.replace(/<\/div>\s*(?=<div class="cmp-d"|<div class="cmp-nm")/g, '</span></div>');
      // 简化：重新生成带属性名的版本
      g = '<div class="cmp-grid">';
      g += '<div class="cmp-h">当前装备</div><div class="cmp-h"></div><div class="cmp-h">候选装备</div>';
      g += `<div class="cmp-nm" style="color:${cur.color || '#c8c8c8'}">${cur.enh ? '+' + cur.enh + ' ' : ''}${cur.name}</div><div></div>`;
      g += `<div class="cmp-nm" style="color:${it.color}">${it.enh ? '+' + it.enh + ' ' : ''}${it.name}</div>`;
      keys.forEach(k => {
        const v0 = (cur.stats[k] || 0) * curM;
        const v1 = (it.stats[k] || 0) * newM;
        const d = v1 - v0;
        const pct = PCT_KEYS.includes(k);
        const nm = AFFIX_NAMES[k] || k;
        g += `<div class="cmp-v"><em>${nm}</em><b>${cur.stats[k] !== undefined ? fmtV(k, v0) : '—'}</b></div>`;
        if (Math.abs(d) < 1e-9) {
          g += '<div class="cmp-d">—</div>';
        } else {
          const txt = pct ? (Math.abs(d) * 100).toFixed(1) + '%' : Math.abs(Math.round(d));
          g += `<div class="cmp-d ${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'}${txt}</div>`;
        }
        g += `<div class="cmp-v"><em>${nm}</em><b>${it.stats[k] !== undefined ? fmtV(k, v1) : '—'}</b></div>`;
      });
      g += '</div>';

      if (cur.effect || it.effect) {
        const efTxt = (o, m) => Object.keys(o.effect || {}).map(k => effectText(k, o.effect[k] * m)).join('；') || '—';
        g += `<div class="cmp-eff"><span>${efTxt(cur, curM)}</span><span>${efTxt(it, newM)}</span></div>`;
      }
      parts.push(g);
    }

    const dCP = equipDeltaPower(G.player, it);
    if (dCP !== 0) {
      parts.push(`<div class="tt-cp ${dCP>0?'tt-up':'tt-down'}">战力 ${dCP>0?'+':''}${dCP} ${dCP>0?'▲ 更强':'▼ 更弱'}</div>`);
    } else if (cur) {
      parts.push(`<div class="tt-cp">战力持平</div>`);
    }
    parts.push(`<div class="tt-desc">点击查看详情（强化 / 穿戴 / 卸下）</div>`);
    TIP.innerHTML = parts.join('');
  }
  document.body.appendChild(TIP);
  moveTooltip(x, y);
}

function moveTooltip(x, y) {
  if (!TIP) return;
  const r = TIP.getBoundingClientRect();
  let tx = x + 16, ty = y + 16;
  if (tx + r.width > window.innerWidth - 8) tx = x - r.width - 12;
  if (ty + r.height > window.innerHeight - 8) ty = y - r.height - 12;
  TIP.style.left = Math.max(4, tx) + 'px';
  TIP.style.top = Math.max(4, ty) + 'px';
}

function hideTooltip() {
  if (TIP) { TIP.remove(); TIP = null; }
}

/* 点击 / 触摸空白处关闭装备详情（触屏没有 mouseleave，必须显式处理） */
/* 全局点击音 + 声音开关 */
function bindSfxUI() {
  if (window._sfxBound) return;
  window._sfxBound = true;

  // 任何按钮/格子/条目的点击都发一声
  document.addEventListener('pointerdown', e => {
    const t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('#soundToggle')) return;
    if (t.closest('button, .cc-btn, .bag-cell, .codex-btn, .eq-slot, .npc-row, .tab, .cc-tab')) {
      Sfx.play('click');
    }
  }, true);

  const btn = $('soundToggle');
  if (btn) {
    const sync = () => {
      const on = Sfx.on && (G.soundOn === true);
      btn.textContent = on ? '🔊' : '🔇';
      btn.classList.toggle('off', !on);
    };
    Sfx.setOn(G.soundOn === true);   // 默认关闭
    sync();
    btn.onclick = (e) => {
      e.stopPropagation();
      G.soundOn = !(G.soundOn === true);
      Sfx.setOn(G.soundOn);
      sync();
      if (G.soundOn) { Sfx.resume(); Sfx.play('open'); }
      saveGame();
    };
  }
}

function bindTooltipDismiss() {
  if (window._ttDismissBound) return;
  window._ttDismissBound = true;

  const TRIGGER = '.bag-cell, .eq-slot, [data-potion], [data-book], [data-item], .cc-btn, .codex-btn';

  const close = (ev) => {
    if (!TIP) return;
    const t = ev.target;
    if (!t || typeof t.closest !== 'function') { hideTooltip(); return; }
    if (t.closest('#tooltip')) return;          // 点在提示框本身
    if (t.closest(TRIGGER)) return;             // 点在能弹出提示的元素上
    hideTooltip();
  };

  document.addEventListener('pointerdown', close, true);
  document.addEventListener('touchstart', close, { capture: true, passive: true });
  // 滚动 / 窗口变化时也关掉，避免提示框留在原位
  window.addEventListener('scroll', hideTooltip, true);
  window.addEventListener('resize', hideTooltip);
}
