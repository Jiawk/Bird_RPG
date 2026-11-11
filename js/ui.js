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

/* 装备图标（精灵图，CSS background-position 切换） */
function iconTag(slot, size) {
  const i = SLOT_ICON_IDX[slot];
  if (i === undefined) return '';
  const sz = size ? `style="width:${size}px;height:${size}px;background-size:${size*8}px ${size}px;background-position:${-i*size}px 0"` : '';
  return `<span class="ic-sprite" data-i="${i}" ${sz}></span>`;
}

function uiInit() {
  document.documentElement.style.setProperty('--icon-sheet', `url(${ASSETS.icons})`);
  document.documentElement.style.setProperty('--skill-sheet', `url(${ASSETS.skills})`);
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
  document.querySelectorAll('.cc-btn').forEach(btn => {
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
    el.innerHTML = `<h3 style="color:${r.color}">${r.name}</h3>
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
    el.innerHTML = `<h3 style="color:${c.color}">${c.name}</h3>
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
  G.player = createPlayer(SEL.race, SEL.cls);
  G.diff = 'normal';
  startGame();
  logMsg(`${DATA.RACES[SEL.race].name} · ${DATA.CLASSES[SEL.cls].name} 踏上征程`, 'level');
  openTownMap();   // 开局直接让玩家选第一个图 + 难度
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
  $('mmLabel').textContent = isTown ? '城镇' : DATA.ROOMS[w.roomId].name;

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
      ic.style.backgroundSize = '912px 38px';
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
    $('interactHint').innerHTML = `按 <b>E</b> 与 ${npc.name} 交互`;
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

  // ---- BOSS 首杀戒指 ----
  if (m.isBoss && m.kind && DATA.BOSS_RINGS[m.kind] && !(p.firstKills || {})[m.kind]) {
    const ring = grantFirstKillRing(p, m.kind);
    if (ring) {
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
  html += `<button data-qt-claim-all ${doneN ? '' : 'disabled'}>一键交任务${doneN ? ' ' + doneN : ''}</button>`;
  html += `<button data-qt-accept-all ${avail.length ? '' : 'disabled'}>一键接任务${avail.length ? ' ' + avail.length : ''}</button>`;
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
}
function closeModal() {
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
function drawCharPortrait() {
  const cv = document.getElementById('charPortrait');
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

/* 技能图标 tag */
function skillIconTag(key, size) {
  const i = DATA.SKILL_ICON[key];
  if (i === undefined) return '';
  const sz = size || 24;
  return `<span class="sk-ic-tag" style="width:${sz}px;height:${sz}px;
    background-image:url(${ASSETS.skills});background-size:${sz*24}px ${sz}px;
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
    case 'quest': toggleModal('quest', '任务官 · 罗兰', questHtml); break;
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
function bagHtml() {
  const p = G.player;
  const page = clamp(p.bagPage || 0, 0, BAG_PAGES - 1);
  const start = page * BAG_PAGE_SIZE, end = start + BAG_PAGE_SIZE;
  const idx = DATA.QUALITY.findIndex(q => q.key === (p.equip.weapon?.qKey || ''));

  let html = `<div class="bag-toolbar">
    <button class="sm-btn danger" data-act="sellWorse">一键出售低战力</button>
    <label class="auto-toggle">
      <input type="checkbox" data-toggle-autosell ${G.autoSell ? 'checked' : ''}>
      <span>自动出售低战力</span>
    </label>
    <span class="bag-count">${p.bag.length} / ${BAG_MAX}</span>
  </div>`;

  html += '<div class="bag-pager">';
  for (let i = 0; i < BAG_PAGES; i++) {
    html += `<button class="pg-btn ${i === page ? 'on' : ''}" data-bag-page="${i}">${i + 1}</button>`;
  }
  html += '<span class="pg-tip">背包 ' + BAG_PAGES + ' 页 · 每页 ' + BAG_PAGE_SIZE + ' 格</span></div>';

  html += '<div class="bag-grid">';
  for (let i = start; i < end; i++) {
    const it = p.bag[i];
    if (!it) { html += '<div class="bag-cell empty">—</div>'; continue; }
    if (it.type === 'potion') {
      html += `<div class="bag-cell potion" data-potion="${it.key}">
        <div class="ic" style="color:${it.color}">⚗</div>
        <div class="nm" style="color:${it.color}">${it.name}</div>
        <span class="stack">×${it.count || 1}</span></div>`;
    } else {
      const dCP = equipDeltaPower(p, it);
      const locked = it.reqLv > p.level;
      html += `<div class="bag-cell${locked ? ' locked' : ''}" data-item="${it.id}">
        ${iconTag(it.slot, 30)}
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

  const slotHtml = (sk, size) => {
    const it = p.equip[sk];
    const qi = it ? DATA.QUALITY.findIndex(q => q.key === it.qKey) : -1;
    return `<div class="eq-v ${it ? 'q-border-' + it.qKey : 'none'}" data-slot="${sk}" ${it ? `data-item="${it.id}"` : ''}>
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
    ${slotHtml('ring2', 40)}
    ${slotHtml('ring3', 40)}
  </div>`;
  mid += '</div>';

  // ---- 属性列 ----
  const row = (n, v, c2) => `<div class="s-row"><span>${n}</span><b class="${c2 || ''}">${v}</b></div>`;
  let stats = '<div class="cp-col char-right">';
  stats += '<div class="s-group"><div class="s-title">核心属性</div>';
  stats += row(st.isMagic ? '内功攻击' : '外功攻击', Math.round(st.power), 'hot');
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
    html += `<div class="room-btn ${unlocked?'':'locked'}" data-pick-room="${i}">
      <div class="rb-name">${r.name}</div>
      <div class="rb-sub">等级 ${r.lv}+　${unlocked?'已解锁':'未解锁'}</div></div>`;
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
  DATA.DIFF_ORDER.forEach(k => {
    const d = DATA.DIFFICULTY[k];
    const ready = diffReadiness(p, k);
    html += `<div class="diff-card" data-pick-diff="${k}" data-room="${roomId}">
      <div class="dc-name" style="color:${d.color}">${d.name}</div>
      <div class="dc-info">怪物生命 ×${d.hpMul}<br>攻击 ×${d.atkMul}<br>掉落 ×${d.dropMul}</div>
      <div class="dc-req ${ready==='ok'?'ok':'low'}">${ready==='ok'?'✔ 装备够格':'⚠ 建议'+d.req}</div>
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
  switch (n.kind) {
    case 'teleport': openTownMap(); break;
    case 'merchant': toggleModal('merchant', '商人 · 地精', merchantHtml); break;
    case 'exchange': toggleModal('exchange', '兑换员 · 凯恩', exchangeHtml); break;
    case 'blacksmith': toggleModal('smith', '铁匠 · 格罗姆', smithHtml); break;
    case 'save': saveGame() ? toast('进度已保存') : toast('保存失败'); break;
    case 'quest': toggleModal('quest', '任务官 · 罗兰', questHtml); break;
    case 'craft': toggleModal('craft', '锻造台', craftHtml); break;
  }
}

function merchantHtml() {
  const p = G.player;
  let html = '<div class="npc-list">';
  for (const po of DATA.POTIONS) {
    html += `<div class="npc-row"><div><div class="nr-name" style="color:${po.color}">${po.name}</div>
      <div class="nr-info">${po.hp?'回复 '+po.hp+' 生命':'回复 '+po.mp+' 法力'}　${po.price} 金</div></div>
      <button data-buy-potion="${po.key}" ${p.gold>=po.price?'':'disabled'}>购买</button></div>`;
  }
  return html + `</div><div style="margin-top:10px;font-size:11px;color:#8f8570">金币：${fmt(p.gold)}</div>`;
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
    const q = DATA.QUALITY.find(x => x.key === it.qKey);
    const price = Math.round((20 + it.ilvl * 8) * Math.pow(2.2, DATA.QUALITY.indexOf(q)));
    html += `<div class="npc-row"><div><div class="nr-name" style="color:${it.color}">${it.name}</div>
      <div class="nr-info">物品等级 ${it.ilvl}　售价 ${price} 金</div></div>
      <button data-sell="${it.id}">出售</button></div>`;
  });
  return html + '</div>';
}

function settingsHtml() {
  return `<div class="npc-list">
    <div class="npc-row"><div><div class="nr-name">存档</div><div class="nr-info">手动保存</div></div>
      <button data-act-save>保存</button></div>
    <div class="npc-row"><div><div class="nr-name">导出存档</div><div class="nr-info">下载 json 备份</div></div>
      <button data-act-export>导出</button></div>
    <div class="npc-row"><div><div class="nr-name" style="color:#ff6b5a">重新开局</div>
      <div class="nr-info">删除角色，不可恢复</div></div>
      <button data-act-reset style="border-color:#6b2b2b;color:#ff8a7a">重开</button></div>
  </div>`;
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
    html += `<div class="eq-slot ${mine ? 'q-border-rare' : ''}" style="cursor:default;opacity:${mine || anyInSlot ? 1 : .45}">
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
  let html = matBar(p);
  html += '<div class="col-title" style="margin:6px 0 8px">身上装备 · 点击选择</div>';
  html += '<div class="forge-grid">';
  for (const sk in DATA.SLOTS) {
    const it = p.equip[sk];
    const lv = it ? (it.enh || 0) : 0;
    html += `<div class="forge-slot${it ? '' : ' empty'}" ${it ? `data-enh-pick="${it.id}"` : ''}>
      <span class="fs-slot">${DATA.SLOTS[sk].name}</span>
      ${iconTag(sk, 42)}
      ${it ? `<span class="fs-enh">+${lv}</span>` : ''}
      <span class="fs-nm" style="${it ? 'color:' + it.color : 'color:#5a5348'}">${it ? it.name.slice(0, 6) : '未装备'}</span>
    </div>`;
  }
  html += '</div>';

  const bagItems = p.bag.filter(it => it.type !== 'potion');
  html += `<div class="col-title" style="margin:14px 0 8px">背包装备（${bagItems.length}）</div>`;
  if (!bagItems.length) {
    html += '<div style="color:#6b6558;font-size:12px;padding:6px">背包里没有装备</div>';
  } else {
    html += '<div class="forge-grid">';
    bagItems.slice(0, 16).forEach(it => {
      html += `<div class="forge-slot" data-enh-pick="${it.id}">
        ${iconTag(it.slot, 42)}
        <span class="fs-enh">+${it.enh || 0}</span>
        <span class="fs-nm" style="color:${it.color}">${it.name.slice(0, 6)}</span>
      </div>`;
    });
    html += '</div>';
  }
  html += '<div style="font-size:11px;color:#8f8570;margin-top:12px">+1~+5 必成 · +6~+10 成功率 72% · +11 起 45% 且失败掉一级（保护券可免）· 每 +1 属性 +6%</div>';
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
    ${iconTag(it.slot, 56)}
    <div>
      <div class="enh-name" style="color:${it.color}">+${lv} ${it.name}</div>
      <div class="enh-sub">${DATA.QUALITY.find(q => q.key === it.qKey).name} · ${DATA.SLOTS[it.slot].name} · 物品等级 ${it.ilvl}
        ${onBody ? '<span style="color:#5fdc4a">· 已穿戴</span>' : '<span style="color:#8f8570">· 在背包</span>'}</div>
    </div>
  </div>`;

  // 属性变化
  html += '<div class="enh-attrs">';
  if (it.effect) {
    for (const k in it.effect) {
      const v0 = it.effect[k] * curMul, v1 = it.effect[k] * nextMul;
      const nm = (typeof RING_COLORS !== 'undefined' && RING_COLORS[k]) ? RING_COLORS[k].name : k;
      html += `<div class="enh-attr"><span>${nm}效果</span>
        <b>${(v0 * 100).toFixed(1)}%</b><i>→</i><b class="up">${maxed ? '—' : (v1 * 100).toFixed(1) + '%'}</b></div>`;
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
    html += '<div class="enh-btns">';
    html += `<button class="big-btn primary" data-enh-do="${it.id}" data-protect="0">强化</button>`;
    if (lv >= 11) {
      html += `<button class="big-btn" data-enh-do="${it.id}" data-protect="1"
        ${(p.materials.protect||0) > 0 ? '' : 'disabled'}>用保护券强化（${p.materials.protect||0}）</button>`;
    }
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
  openModal('quest', '任务官 · 罗兰', questHtml());
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
  openModal('quest', '任务官 · 罗兰', questHtml());
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
  openModal('quest', '任务官 · 罗兰', questHtml());
}

function dropQuest(id) {
  const p = G.player;
  const i = (p.quests || []).findIndex(q => q.id === id);
  if (i < 0) return;
  const q = p.quests.splice(i, 1)[0];
  toast(`已放弃「${q.name}」`);
  openModal('quest', '任务官 · 罗兰', questHtml());
}

/* ---------------- 锻造台 ---------------- */
function craftHtml() {
  const p = G.player;
  let mat = '<div style="display:flex;gap:14px;margin-bottom:12px;font-size:12px">';
  for (const k in DATA.MATERIALS) {
    const m = DATA.MATERIALS[k];
    mat += `<span style="color:${m.color}">${m.icon} ${m.name} ×${p.materials[k]||0}</span>`;
  }
  mat += '</div>';

  let html = mat + '<div class="npc-list">';
  DATA.CRAFT.forEach((c, i) => {
    const needTxt = Object.keys(c.need).map(k =>
      `${DATA.MATERIALS[k].name}×${c.need[k]}`).join(' + ');
    const okMat = Object.keys(c.need).every(k => (p.materials[k]||0) >= c.need[k]);
    const okGold = p.gold >= c.gold;
    const q = DATA.QUALITY.find(x => x.key === c.quality);
    html += `<div class="npc-row"><div>
      <div class="nr-name" style="color:${q.color}">${c.name}</div>
      <div class="nr-info">${needTxt} + ${c.gold} 金</div>
      </div><button data-craft="${i}" ${okMat&&okGold?'':'disabled'}>${okMat&&okGold?'锻造':'材料不足'}</button></div>`;
  });
  return html + `</div><div style="margin-top:10px;font-size:11px;color:#8f8570">材料来源：任务奖励 · 怪物掉落</div>`;
}

function doCraft(i) {
  const p = G.player, c = DATA.CRAFT[i];
  if (!c) return;
  if (!Object.keys(c.need).every(k => (p.materials[k]||0) >= c.need[k])) { toast('材料不足'); return; }
  if (p.gold < c.gold) { toast('金币不足'); return; }
  Object.keys(c.need).forEach(k => { p.materials[k] -= c.need[k]; });
  p.gold -= c.gold;
  const slot = pick(Object.keys(DATA.SLOTS));
  const lvl = Math.max(6, Math.min(28, p.level + 4));
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
    openModal('merchant', '商人 · 地精', merchantHtml());
  });

  body.querySelectorAll('[data-buy-skill]').forEach(b => b.onclick = () => {
    const k = b.dataset.buySkill, p = G.player;
    const lv = p.skills[k] || 0, price = 220 + lv * 380;
    if (p.gold < price || lv >= 5) return;
    p.gold -= price;
    const r = learnSkill(p, k);
    toast(r === 'new' ? `学会 ${DATA.SKILLS[k].name}` : `${DATA.SKILLS[k].name} 升级`);
    openModal('exchange', '兑换员 · 凯恩', exchangeHtml());
  });

  body.querySelectorAll('[data-sell]').forEach(b => b.onclick = () => {
    const it = G.player.bag.find(x => x.id === b.dataset.sell);
    if (it) { sellItem(G.player, it); openModal('smith', '铁匠 · 格罗姆', smithHtml()); }
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
    el.onclick = () => {
      if (el.dataset.slot) { unequipItem(G.player, el.dataset.slot); openModal('bag','背包 · 装备', bagHtml()); return; }
      if (it.reqLv > G.player.level) { toast(`等级不足：需要 Lv.${it.reqLv}（当前 ${G.player.level}）`); return; }
      equipItem(G.player, it); openModal('bag','背包 · 装备', bagHtml());
    };
    el.oncontextmenu = e => {
      e.preventDefault();
      if (!el.dataset.slot) { sellItem(G.player, it); openModal('bag','背包 · 装备', bagHtml()); }
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

  body.querySelectorAll('[data-act-town]').forEach(b => b.onclick = () => { closeModal(); goTown(); });
  body.querySelectorAll('[data-act-enhance]').forEach(b => b.onclick = () => openModal('enhance', '铁匠 · 装备强化', enhanceHtml()));
  body.querySelectorAll('[data-tower-start]').forEach(b => b.onclick = () => enterTower(+b.dataset.towerStart));
  body.querySelectorAll('[data-set-info]').forEach(b => b.onclick = () => {
    openModal('setinfo', '套装图鉴', setDetailHtml(b.dataset.setInfo));
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
  if (it.type === 'potion') {
    TIP.innerHTML = `<h4 style="color:${it.color}">${it.name}</h4>
      <div class="tt-desc">${it.hp ? '回复 ' + it.hp + ' 生命' : '回复 ' + it.mp + ' 法力'}</div>`;
  } else {
    const q = DATA.QUALITY.find(x => x.key === it.qKey);
    const enhTxt = it.enh ? `<span style="color:#5fdc4a">+${it.enh}</span> ` : '';
    const parts = [`<h4 style="color:${it.color}">${enhTxt}${it.name}</h4>`,
      `<div class="tt-sub">${q.name} · ${DATA.SLOTS[it.slot].name} · 物品等级 ${it.ilvl}</div>`];
    if (it.effect) {
      const m = enhMul(it);
      const lines = Object.keys(it.effect).map(k => {
        const v = (it.effect[k] * m * 100).toFixed(1);
        const nm = (typeof RING_COLORS !== 'undefined' && RING_COLORS[k]) ? RING_COLORS[k].name : k;
        return `${nm} ${v}%`;
      });
      parts.push(`<div style="color:${it.color};font-size:12px;margin-top:3px;font-weight:700">【特戒】${lines.join('　')}</div>`);
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

    // 与已装备逐条对比
    const cur = G.player.equip[it.slot];
    if (cur) {
      const keys = new Set([...Object.keys(it.stats), ...Object.keys(cur.stats)]);
      const diffs = [];
      keys.forEach(k => {
        const d = (it.stats[k] || 0) - (cur.stats[k] || 0);
        if (Math.abs(d) < 1e-9) return;
        const pct = PCT_KEYS.includes(k);
        diffs.push(`<div class="${d>0?'tt-up':'tt-down'}">${d>0?'▲':'▼'} ${pct?(Math.abs(d)*100).toFixed(1)+'%':Math.abs(d)} ${AFFIX_NAMES[k]||k}</div>`);
      });
      if (diffs.length) parts.push('<div style="margin-top:5px;border-top:1px dotted rgba(184,173,147,.25);padding-top:4px">' + diffs.join('') + '</div>');
    }
    const dCP = equipDeltaPower(G.player, it);
    if (dCP !== 0) {
      parts.push(`<div class="tt-cp ${dCP>0?'tt-up':'tt-down'}">战力 ${dCP>0?'+':''}${dCP} ${dCP>0?'▲ 更强':'▼ 更弱'}</div>`);
    } else if (cur) {
      parts.push(`<div class="tt-cp">战力持平</div>`);
    }
    parts.push(`<div class="tt-desc">左键装备 / 右键出售</div>`);
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
