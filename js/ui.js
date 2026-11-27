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
const MAT_IDX = { iron:27, mithril:28, scale:29, shard:30, stone:31, protect:32, skillT:33, breakT:34, bossToken:35,
  talentStone:37, sourceCrystal:38, petRein:44 };
const TALENT_IDX = { soulPoison:39, recovery:40, execute:41, revive:42 };
const EQUIP_COUNT = 45;
const BOOK_IDX = 36;
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

function showScreen(name) {
  $('screen-title').classList.toggle('hidden', name !== 'title');
  $('screen-create').classList.toggle('hidden', name !== 'create');
  $('hud').classList.toggle('hidden', name !== 'game');
  G.screen = name;
  if (name === 'title') $('btnContinue').disabled = !hasSave();
}

/* ---------------- 建角 ---------------- */
function buildCreateScreen() {
  if (G.creatingNew && Array.isArray(G.chars)) {
    const taken = G.chars.filter(Boolean).map(x => x.cls);
    if (taken.includes(SEL.cls)) {
      const free = Object.keys(DATA.CLASSES).find(k => !taken.includes(k));
      if (free) SEL.cls = free;
    }
  }
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
  // 新建角色时，已存在的职业不可再建
  const taken = (G.creatingNew && Array.isArray(G.chars)) ? G.chars.filter(Boolean).map(x => x.cls) : [];
  for (const k in DATA.CLASSES) {
    const c = DATA.CLASSES[k];
    const isTaken = taken.includes(k);
    const el = document.createElement('div');
    el.className = 'card' + (k === SEL.cls ? ' sel' : '') + (isTaken ? ' taken' : '');
    const km = c.keymap;
    const ci = Object.keys(DATA.CLASSES).indexOf(k);
    el.innerHTML = `
      <div class="cls-portrait" style="--ai:${DATA.CLASS_AVATAR[k] !== undefined ? DATA.CLASS_AVATAR[k] : 0}${DATA.AVATAR_HD && DATA.AVATAR_HD[k] !== undefined ? ';--hi:' + DATA.AVATAR_HD[k] : ''}">
        <span class="av-img big${DATA.AVATAR_HD && DATA.AVATAR_HD[k] !== undefined ? ' hd' : ''}"></span>
        <span class="cls-badge" style="background-position:${-ci * 64}px 0"></span>
        <span class="cls-name-plate">${c.name}</span>
      </div>
      <h3 style="color:${c.color}">${c.name}</h3>
      <p>${c.desc}</p>
      <div><span class="tag">主属性 ${statName(c.primary)}</span><span class="tag">${c.weapon}</span></div>
      <p style="margin-top:6px;color:#8f8570">Q ${DATA.SKILLS[km.q].name} · W ${DATA.SKILLS[km.w].name}</p>
      <p style="color:#8f8570">E ${DATA.SKILLS[km.e].name} · R ${DATA.SKILLS[km.r].name} · D ${DATA.SKILLS[km.d].name}</p>`;
    if (isTaken) {
      el.innerHTML = `<div class="taken-mask">已创建</div>` + el.innerHTML;
      el.onclick = () => toast(`${c.name} 已存在，无法重复创建`);
    } else {
      el.onclick = () => { SEL.cls = k; buildCreateScreen(); };
    }
    cl.appendChild(el);
  }
}


function uiInit() {
  document.documentElement.style.setProperty('--icon-sheet', `url(${ASSETS.equip || ASSETS.icons})`);
  document.documentElement.style.setProperty('--skill-sheet', `url(${ASSETS.skills})`);
  if (ASSETS.units) {
    document.documentElement.style.setProperty('--units-sheet', `url(${ASSETS.units})`);
    // 图标取帧依赖图集帧数（每槽 4 帧）
    try {
      const im = new Image();
      im.onload = () => {
        const n = Math.round(im.width / 32);
        if (n > 0) document.documentElement.style.setProperty('--uframes', String(n));
      };
      im.src = ASSETS.units;
    } catch (e) {}
  }
  if (ASSETS.classicons) document.documentElement.style.setProperty('--class-sheet', `url(${ASSETS.classicons})`);
  if (ASSETS.heirlooms) document.documentElement.style.setProperty('--hlt-sheet', `url(${ASSETS.heirlooms})`);
  if (ASSETS.lorePortraits) document.documentElement.style.setProperty('--lore-sheet', `url(${ASSETS.lorePortraits})`);
  if (ASSETS.lichStatue) document.documentElement.style.setProperty('--statue-sheet', `url(${ASSETS.lichStatue})`);
  if (ASSETS.pets) document.documentElement.style.setProperty('--pet-sheet', `url(${ASSETS.pets})`);
  if (ASSETS.mounts) document.documentElement.style.setProperty('--mount-sheet', `url(${ASSETS.mounts})`);
  if (ASSETS.avatars) document.documentElement.style.setProperty('--avatar-sheet', `url(${ASSETS.avatars})`);
  if (ASSETS.avatarsHd) document.documentElement.style.setProperty('--avatar-hd-sheet', `url(${ASSETS.avatarsHd})`);
  bindSkillTips();
  // 任务追踪：事件委托（内容重建后依然可点）
  const qt = $('questTracker');
  if (qt) {
    qt.addEventListener('click', e => {
      if (e.target.closest('[data-qt-open]')) {
        e.stopPropagation();
        handleCommand('quest');
        return;
      }
      const head = e.target.closest('.qt-head');
      if (head) { G.qtCollapsed = !G.qtCollapsed; QT_SIG = ''; return; }
      const claim = e.target.closest('[data-qt-claim]');
      if (claim) { claimQuest(claim.dataset.qtClaim); QT_SIG = ''; return; }
      if (e.target.closest('[data-qt-claim-all]')) { claimAllQuests(); return; }
      if (e.target.closest('[data-qt-accept-all]')) { acceptAllQuests(); QT_SIG = ''; return; }
    });
  }
    /* ---- 拖动：按住标题栏任意位置移动 ---- */
    const QT_POS_KEY = 'orc_qt_pos';
    const applyPos = (x, y) => {
      const r = qt.getBoundingClientRect();
      const maxX = window.innerWidth - r.width - 4;
      const maxY = window.innerHeight - r.height - 4;
      x = Math.max(4, Math.min(maxX, x));
      y = Math.max(4, Math.min(maxY, y));
      qt.style.left = x + 'px';
      qt.style.top = y + 'px';
      qt.style.right = 'auto';
      qt.style.transform = 'none';
      return { x, y };
    };
    // 恢复上次位置
    try {
      const saved = JSON.parse(localStorage.getItem(QT_POS_KEY) || 'null');
      if (saved && typeof saved.x === 'number') applyPos(saved.x, saved.y);
    } catch (e) {}

    let drag = null;
    qt.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      if (e.target.closest('[data-qt-open]')) return;      // 按钮不触发拖动
      if (!e.target.closest('.qt-head')) return;
      const r = qt.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false,
               sx: e.clientX, sy: e.clientY };
      qt.classList.add('dragging');
      try { qt.setPointerCapture(e.pointerId); } catch (err) {}
    });

    qt.addEventListener('pointermove', e => {
      if (!drag) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
      drag.moved = true;
      applyPos(e.clientX - drag.dx, e.clientY - drag.dy);
    });

    const endDrag = () => {
      if (!drag) return;
      const moved = drag.moved;
      drag = null;
      qt.classList.remove('dragging');
      if (moved) {
        const r = qt.getBoundingClientRect();
        try {
          localStorage.setItem(QT_POS_KEY, JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top) }));
        } catch (err) {}
        qt._suppressClick = true;      // 拖动结束后吞掉这一次 click
        setTimeout(() => { qt._suppressClick = false; }, 60);
      }
    };
    qt.addEventListener('pointerup', endDrag);
    qt.addEventListener('pointercancel', endDrag);

    qt.addEventListener('click', e => {
      if (qt._suppressClick) { e.stopPropagation(); e.preventDefault(); }
    }, true);

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

  // 点左上角头像 = 按 C 打开角色面板
  const pf = document.querySelector('.portrait-frame');
  if (pf) {
    pf.style.cursor = 'pointer';
    pf.onclick = () => { if (G.screen === 'game') handleCommand('char'); };
  }
  const dock = $('hudDock');
  const trigger = dock.querySelector('.dock-trigger');
  function expandDock(open) {
    dock.classList.toggle('expanded', open);
    trigger.setAttribute('aria-expanded', String(open));
  }
  trigger.onclick = () => expandDock(!dock.classList.contains('expanded'));
  dock.querySelector('.dock-actions').addEventListener('click', e => {
    if (e.target.closest('button')) expandDock(false);
  });
  document.addEventListener('pointerdown', e => {
    if (dock.classList.contains('expanded') && !dock.contains(e.target)) expandDock(false);
  });
  trigger.addEventListener('keydown', e => { if (e.key === 'Escape') expandDock(false); });
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
  const lo = $('btnLogout');
  if (lo) lo.addEventListener('click', async () => {
    if (location.protocol === 'file:') { toast('单机版无需退出账号'); return; }
    if (!confirm('退出当前账号？\n本机存档会保留，下次登录可直接继续。')) return;
    // 先把当前进度推到云端
    try { if (typeof window.__cloudPush === 'function') window.__cloudPush(true); } catch (e) {}
    try {
      await new Promise(r => {
        const x = new XMLHttpRequest();
        x.open('POST', '/api/logout', true);
        x.onloadend = () => r();
        x.onerror = () => r();
        x.send();
      });
    } catch (e) {}
    // 跳回登录页
    location.href = '/login';
  });

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
    // 首次创建：初始化角色表，并要求完成一次基础新手引导。
    G.chars = [np];
    G.active = 0;
    G.player = np;
    G.guide = { version:0, mandatory:true, step:0 };
    logMsg(`${DATA.RACES[SEL.race].name} · ${DATA.CLASSES[SEL.cls].name} 踏上征程`, 'level');
  }

  saveGame();
  G._noticeFirst = true;          // 必须在 startGame 之前设置：否则 startNewbieGuide 已经排好定时器
  startGame();
  toast(`获得新手装备一套 · 战力 ${combatPower(G.player)}`);
  // 新角色进游戏先看公告（关闭后再开始新手引导）
  setTimeout(() => {
    if (G.screen === 'game' && typeof openModal === 'function') {
      openModal('notice', '公告牌', noticeHtml());
    }
  }, 700);
}

/* ---------------- 账号级新手引导 ---------------- */
const NEWBIE_GUIDE_VERSION = 1;
const NEWBIE_GUIDE_STEPS = [
  { title:'欢迎来到艾泽拉斯', text:'这是你的英雄界面。接下来用一分钟认识主城和成长路线。', target:null },
  { title:'先学会战斗', text:'右下角是命令卡。按 A 开启自动攻击，按 S 开启自动技能；Q/W/E/R/D 可手动施放技能。', selector:'#commandCard', action:'autoAtk', actionText:'开启自动攻击' },
  { title:'打开地图', text:'点击“传送/回城”，选择已解锁副本和难度。', selector:'.cc-btn[data-act="map"]', action:'map', actionText:'打开传送' },
  { title:'找到传送员', text:'主城左上方的传送员可带你进入普通副本、每日副本。', npc:'teleport', action:'npc', actionText:'打开传送员' },
  { title:'整理装备', text:'掉落的装备进入背包。点击背包可穿戴、强化、出售或放入仓库。', selector:'.cc-btn[data-act="bag"]', action:'bag', actionText:'打开背包' },
  { title:'强化与打造', text:'铁匠和锻造台位于主城中部。强化石提升装备，打造材料用于制作装备。', npc:'craft', action:'npc', actionText:'前往锻造台' },
  { title:'领取悬赏', text:'任务官提供击杀委托。完成任务可获得经验、金币和分层打造材料。', npc:'quest', action:'npc', actionText:'打开任务官' },
  { title:'挑战试炼之塔', text:'试炼之塔每天有限次数，层数越高，奖励越好。', npc:'tower', action:'npc', actionText:'查看试炼之塔' },
  { title:'收集图鉴与特戒', text:'右上角的装备图鉴和收藏图鉴记录进度，首杀奖励需要手动领取。', selector:'.codex-btn[data-act="codexCollect"]', action:'codexCollect', actionText:'打开收藏图鉴' },
  { title:'BOSS 凭证抽奖', text:'抽奖专员使用 BOSS 击杀凭证。圣物稀有，建议把日常和副本作为主要成长来源。', npc:'exchange', action:'npc', actionText:'打开抽奖' },
  { title:'坐骑、光环与出战宠物', text:'驯兽师这里有坐骑（加速）、光环（团队增益）和出战宠物（跟着你打怪）。宠物要用 BOSS 掉的宠物缰绳招募。', npc:'beastmaster', action:'npc', actionText:'打开驯兽师' },
  { title:'你已准备好', text:'优先完成副本、任务和每日活动。装备、技能和挑战会逐步解锁。随时可在主城的新手指引 NPC 查看帮助。', npc:'tutorial', action:'npc', actionText:'查看新手指引' }
];

function guideState() {
  if (!G.guide || typeof G.guide !== 'object') G.guide = { version:0, mandatory:false, step:0 };
  G.guide.step = Math.max(0, Math.min(NEWBIE_GUIDE_STEPS.length - 1, Number(G.guide.step) || 0));
  return G.guide;
}
function guideDone() {
  const state = guideState();
  if (state.version >= NEWBIE_GUIDE_VERSION) return true;
  // 老账号若已完成旧版12条教程，不再被新版首次弹窗打扰。
  if (!state.mandatory && G.player && typeof tutAllDone === 'function' && tutAllDone(G.player)) {
    state.version = NEWBIE_GUIDE_VERSION; state.step = 0;
    saveGame();
    if (typeof window.__cloudPush === 'function') window.__cloudPush(true);
    return true;
  }
  return false;
}
function guideTarget(step) {
  if (step.selector) return document.querySelector(step.selector);
  if (step.npc && G.world && G.world.npcs) return G.world.npcs.find(n => n.kind === step.npc) || null;
  return null;
}
function guideTargetRect(step) {
  const target = guideTarget(step);
  if (!target) return null;
  if (step.selector) return target.getBoundingClientRect();
  const canvas = document.getElementById('view');
  const cr = canvas.getBoundingClientRect();
  const x = cr.left + px(target.x), y = cr.top + py(target.y);
  const r = Math.max(28, target.r || 24);
  return { left:x-r, top:y-r*1.8, width:r*2, height:r*2 };
}
function guideAction(step) {
  if (step.action === 'npc') { const npc = guideTarget(step); if (npc) interactNPC(npc); }
  else if (step.action) handleCommand(step.action);
}
function renderNewbieGuide() {
  const state = guideState();
  let root = document.getElementById('newbieGuide');
  if (!root) { root = document.createElement('div'); root.id = 'newbieGuide'; document.body.appendChild(root); }
  const step = NEWBIE_GUIDE_STEPS[state.step];
  const rect = guideTargetRect(step);
  const progress = Math.round((state.step + 1) / NEWBIE_GUIDE_STEPS.length * 100);
  root.innerHTML = `<div class="ng-dim"></div>${rect ? '<div class="ng-focus"></div><div class="ng-arrow">▼</div>' : ''}
    <section class="ng-card">
      <div class="ng-top"><span>新手引导 ${state.step + 1}/${NEWBIE_GUIDE_STEPS.length}</span>${state.mandatory ? '<b>新角色必修</b>' : '<button data-ng-skip="1">跳过引导</button>'}</div>
      <div class="ng-progress"><i style="width:${progress}%"></i></div>
      <h2>${step.title}</h2><p>${step.text}</p>
      <div class="ng-actions">${state.step ? '<button data-ng-prev="1">上一步</button>' : ''}${step.action ? `<button class="ng-target" data-ng-action="1">${step.actionText}</button>` : ''}<button class="ng-next" data-ng-next="1">${state.step === NEWBIE_GUIDE_STEPS.length - 1 ? '完成引导' : '下一步'}</button></div>
    </section>`;
  if (rect) {
    const focus = root.querySelector('.ng-focus'), arrow = root.querySelector('.ng-arrow');
    focus.style.left = `${rect.left - 7}px`; focus.style.top = `${rect.top - 7}px`;
    focus.style.width = `${rect.width + 14}px`; focus.style.height = `${rect.height + 14}px`;
    arrow.style.left = `${rect.left + rect.width / 2 - 12}px`; arrow.style.top = `${Math.max(8, rect.top - 40)}px`;
  }
  root.querySelector('[data-ng-prev]')?.addEventListener('click', () => { state.step--; renderNewbieGuide(); });
  root.querySelector('[data-ng-next]')?.addEventListener('click', () => { if (state.step >= NEWBIE_GUIDE_STEPS.length - 1) finishNewbieGuide(false); else { state.step++; renderNewbieGuide(); } });
  root.querySelector('[data-ng-skip]')?.addEventListener('click', () => finishNewbieGuide(true));
  root.querySelector('[data-ng-action]')?.addEventListener('click', () => guideAction(step));
}
function finishNewbieGuide(skipped) {
  const state = guideState(); state.version = NEWBIE_GUIDE_VERSION; state.step = 0; state.mandatory = false;
  const root = document.getElementById('newbieGuide'); if (root) root.remove();
  saveGame();
  // 立即同步云存档，防止玩家紧接着刷新时被旧云存档覆盖引导完成状态。
  if (typeof window.__cloudPush === 'function') window.__cloudPush(true);
  toast(skipped ? '已跳过新手引导，可在主城“新手指引”重新查看帮助' : '新手引导完成，祝你冒险顺利！');
}
function startNewbieGuide() {
  if (guideDone()) return;
  if (G._noticeFirst) return;      // 等公告关闭后再引导（见 notice 关闭回调）
  setTimeout(() => { if (G.screen === 'game' && !guideDone()) renderNewbieGuide(); }, 650);
}

/* 公告关闭后接着开始新手引导 */
function resumeGuideAfterNotice() {
  if (!G._noticeFirst) return;
  G._noticeFirst = false;
  setTimeout(() => {
    if (G.screen === 'game' && !guideDone()) renderNewbieGuide();
  }, 350);
}
function replayNewbieGuide(key) {
  const state = guideState();
  if (state.mandatory && !guideDone()) { renderNewbieGuide(); return; }
  const index = DATA.TUTORIAL.findIndex(x => x.key === key);
  if (index < 0) return;
  state.step = Math.min(index, NEWBIE_GUIDE_STEPS.length - 1);
  state.replay = true;
  closeModal();
  setTimeout(renderNewbieGuide, 80);
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
  if (typeof updateAuraHud === 'function') updateAuraHud();
  if (typeof updateMountHud === 'function') updateMountHud();
  if (typeof updatePetHud === 'function') updatePetHud();
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
  if (pr) pr.textContent = _t ? (w.roomId === HOLY_TOWN ? '圣光大陆 · 安全区' : '暴风城 · 安全区') : (getRoom(w.roomId) || DATA.ROOMS[w.roomId]).name;
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
  $('goldVal').textContent = fmt(typeof ensureGold === 'function' ? ensureGold(p) : (Number(p.gold) || 0));
  $('cpVal').textContent = fmt(combatPower(p));

  const gt = gearTier(p);
  const _gv = $('gearVal');
  if (_gv) { _gv.textContent = gt.tierName;
    _gv.style.color = gt.filled === 8 ? DATA.QUALITY[Math.max(0,gt.minIdx)].color : '#b8ad93'; }

  const _dv = $('diffVal');
  if (_dv) { _dv.textContent = DATA.DIFFICULTY[G.diff].name;
    _dv.style.color = DATA.DIFFICULTY[G.diff].color; }

  const isTown = w.isTown;
  if (typeof updateSigninDot === 'function') updateSigninDot();
  const _tb = document.querySelector('.codex-btn.talent-btn');
  if (_tb && G.player) _tb.classList.toggle('awake', !!(talentEnsure(G.player) || {}).key);
  $('roomName').textContent = isTown ? (w.roomId === HOLY_TOWN ? '圣光大陆 · 安全区' : '暴风城 · 安全区') : (getRoom(w.roomId) || DATA.ROOMS[w.roomId]).name;
  $('roomSub').textContent = isTown ? '点击 NPC 或按 M 选择关卡'
    : (G._dailyBackLeft > 0
        ? `⏳ ${G._dailyBackLeft} 秒后自动返回城镇…`
        : `${DATA.DIFFICULTY[G.diff].name}难度 · ${(getRoom(w.roomId) || DATA.ROOMS[w.roomId]).desc}`);

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

  // ---- BOSS 击杀凭证 ----
  if (m.isBoss) {
    p.materials.bossToken = (p.materials.bossToken || 0) + 1;
    floatText(m.x, m.y - 26, 'BOSS击杀凭证 +1', '#ff9a3c', 13);
  }

  // ---- 材料掉落（打造材料只能由悬赏任务获得，这里只掉强化类材料）----
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
    if (Math.random() < (DATA.RING_DROP_PCT / 100) * mul) {   // 基础概率可配置（困难×2，地狱×3）
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
  if (m.isBoss && m.kind && DATA.BOSS_RINGS[m.kind]) {
    if (markFirstKill(p, m.kind)) {
      const rn = DATA.SPECIAL_RINGS[DATA.BOSS_RINGS[m.kind].ring].name;
      bigAnnounce(`🏆 首杀 · ${rn} 可领取`, '#ffd24a');
      toast(`🏆 首杀成就达成！去「装备图鉴」领取【${rn}】`);
      logMsg(`🏆 首杀 ${m.name} → 可在装备图鉴领取 ${rn}`, 'level');
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
  const qOpen = q => {
    const r = DATA.ROOMS[q.room];
    if (r && r.zone === 'holy') return p.level >= (r.reqLv || 1);
    return p.unlocked.includes(q.room);
  };
  const avail = DATA.QUEST_POOL.filter(q => !qs.some(x => x.id === q.id) && qOpen(q));
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
    <span class="qt-open" data-qt-open="1" title="打开完整任务面板（L）">📋</span>
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
    const rw = q.mats || DATA.QUEST_MATS;
    for (const k in rw) mats[k] = (mats[k] || 0) + rw[k];
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
/* 阵亡红屏 + 大字（1.7 秒后淡出） */
function showDeathFlash() {
  const el = document.getElementById('deathFlash');
  if (!el) return;
  el.classList.remove('hidden');
  // 重启动画
  const sp = el.querySelector('span');
  if (sp) { sp.style.animation = 'none'; void sp.offsetWidth; sp.style.animation = ''; }
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), 1700);
}

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

/* 多行奖励列表（抽奖十连等）：每行一个，稀有项加大加粗 */
function toastRows(title, rows, ms) {
  const t = $('toast');
  if (!t) return;
  t.innerHTML = `<div class="tl-title">${title}</div>` +
    rows.map(r => `<div class="tl-row ${r.big ? 'big' : ''}" style="color:${r.color}">${r.text}</div>`).join('');
  t.classList.add('toast-list');
  t.classList.remove('hidden');
  t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.add('hidden');
    t.classList.remove('toast-list');
  }, ms || 4200);
}

function toast(msg) {
  const t = $('toast');
  t.classList.remove('toast-list');
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
    case 'talent': openModal('talent', '天赋', talentHtml()); break;
    case 'signin': openModal('signin', '七天签到', signinHtml()); break;
    case 'holyportal': interactNPC({ kind:'holyportal' }); break;
    case 'holygate': interactNPC({ kind:'holygate' }); break;
    case 'holytownback': interactNPC({ kind:'holytownback' }); break;
    case 'quest': toggleModal('quest', '任务官 · 黄仁勋', questHtml); break;
    case 'craft': toggleModal('craft', '锻造台', craftHtml); break;
    case 'warehouse':
      if (!isModalOpen('warehouse') && typeof Sfx !== 'undefined') Sfx.play('warehouse');
      toggleModal('warehouse', '仓库 · 大木箱', warehouseHtml); break;
    case 'notice': openModal('notice', '公告牌', noticeHtml()); break;
    case 'heirloom': G._hltPage = G._hltPage || 0; openModal('heirloom', '传家宝 · 古籍', heirloomHtml()); break;
    case 'statue': openModal('statueMenu', '巫妖王雕像', statueMenuHtml()); break;
    case 'beast': toggleModal('beast', '驯兽师 · 铃', beastMenuHtml); break;
    case 'beastmaster': toggleModal('beast', '驯兽师 · 铃', beastMenuHtml); break;
    case 'tutorial': toggleModal('tutorial', '新手指引', tutorialHtml); break;
    case 'mail': toggleModal('mail', '邮箱', mailHtml); break;
    case 'ringup': toggleModal('ringup', '特戒强化', ringUpHtml); break;
    case 'codexEquip': toggleModal('codexEquip', '装备图鉴', codexEquipHtml); break;
    case 'codexCollect': toggleModal('codexCollect', '收藏图鉴', codexCollectHtml); break;
    case 'debug': toggleModal('debug', '调试面板 · N', debugHtml); break;
    case 'tower': toggleModal('tower', '爬塔 · 试炼之塔', towerHtml); break;
    case 'tower': toggleModal('tower', '爬塔 · 试炼之塔', towerHtml); break;
    case 'enhance': toggleModal('enhance', '铁匠 · 装备强化', enhanceHtml); break;
    case 'salvageMythic': {
      const list = mythicSalvageList(G.player);
      if (!list.length) { toast('背包里没有可分解的低战力红装'); break; }
      if (!confirm(`确定分解 ${list.length} 件低战力红装吗？\n每件返还 龙鳞片×1 + 虚空碎片×2`)) break;
      const r = salvageMythic(G.player);
      if (typeof Sfx !== 'undefined') Sfx.play('loot');
      toast(`分解红装 ${r.n} 件：龙鳞片 +${r.scale}、虚空碎片 +${r.shard}`);
      logMsg(`♻ 一键分解红装 ${r.n} 件`, 'loot');
      saveGame();
      handleCommand('bag');
      break;
    }
    case 'sellWorse': {
      const r = sellAllWorse(G.player);
      toast(r.n ? `已出售 ${r.n} 件低战力装备，+${fmt(r.gold)} 金` : '没有需要出售的装备');
      if (r.n) { logMsg(`一键出售 ${r.n} 件，+${fmt(r.gold)} 金`, 'loot'); saveGame(); }
      if (isModalOpen('bag')) openModal('bag', '背包 · 装备', bagHtml());
      break;
    }
    case 'autoSell':
      G.autoSell = !G.autoSell;
      if (G.player) { G.player.autoSell = G.autoSell; autoSellSavePrefs(G.player); }
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
/* 材料背包页：8×12 网格 */
function matPageHtml() {
  const p = G.player;
  const keys = Object.keys(MAT_IDX);
  let out = '', filled = 0;
  keys.forEach(k => {
    const cnt = (p.materials && p.materials[k]) || 0;
    const M = DATA.MATERIALS[k];
    out += `<div class="bag-cell mat${cnt ? '' : ' zero'}" data-mat="${k}" title="${M.desc || ''}">
      <span class="ic-sprite" style="width:26px;height:26px;background-size:${26 * EQUIP_COUNT}px 26px;background-position:${-MAT_IDX[k] * 26}px 0"></span>
      <div class="nm" style="color:${M.color}">${M.name}</div>
      <span class="stack">×${cnt}</span></div>`;
    filled++;
  });
  while (filled < MAT_CELLS) { out += '<div class="bag-cell empty">—</div>'; filled++; }
  return out;
}

/* 材料格子（堆叠展示，来源仍是 p.materials） */
function matCellsHtml(count) {
  const p = G.player;
  let out = '';
  let n = 0;
  for (const k in MAT_IDX) {
    const cnt = (p.materials && p.materials[k]) || 0;
    if (cnt) n++;
    const M = DATA.MATERIALS[k];
    out += `<div class="bag-cell mat${cnt ? '' : ' zero'}" data-mat="${k}">
      <span class="ic-sprite" style="width:34px;height:34px;background-size:${34*EQUIP_COUNT}px 34px;background-position:${-MAT_IDX[k]*34}px 0"></span>
      <div class="nm" style="color:${M.color}">${M.name}</div>
      <span class="stack">×${cnt}</span></div>`;
  }
  return { html: out, n };
}

function bagHtml() {
  const p = G.player;
  (p.bag || []).forEach(normalizeSlot);
  const page = clamp(p.bagPage || 0, 0, BAG_PAGES);   // 0/1 装备页，2 材料页
  const start = page * BAG_PAGE_SIZE, end = start + BAG_PAGE_SIZE;
  const idx = DATA.QUALITY.findIndex(q => q.key === (p.equip.weapon?.qKey || ''));

  let html = `<div class="bag-toolbar">
    <button class="sm-btn" data-act="sortBag">整理背包</button>
    <button class="sm-btn salvage" data-act="salvageMythic">♻ 一键分解红装${mythicSalvageList(G.player).length ? `（${mythicSalvageList(G.player).length}）` : ''}</button>
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
    html += `<button class="pg-btn ${i === page ? 'on' : ''}" data-bag-page="${i}">装备背包 ${i + 1}</button>`;
  }
  html += `<button class="pg-btn ${page === 2 ? 'on' : ''}" data-bag-page="2">材料背包 1</button>`;
  html += `<span class="pg-tip">每页 12 列 × 12 行 = ${BAG_PAGE_SIZE} 格</span></div>`;

  // ---- 材料背包页 ----
  if (page === 2) {
    const gold = (typeof ensureGold === 'function') ? ensureGold(p) : (Number(p.gold) || 0);
    html += `<div class="mat-gold-row">
      <div class="mg-card">
        <i class="mg-ic">金</i>
        <div class="mg-main"><div class="mg-name">金币</div>
          <div class="mg-sub">全部货币 · 打怪 / 任务 / 每日副本产出</div></div>
        <div class="mg-val">${fmt(gold)}</div>
      </div>
      <div class="mg-card">
        <i class="mg-ic tok">⬢</i>
        <div class="mg-main"><div class="mg-name">BOSS击杀凭证</div>
          <div class="mg-sub">抽奖转盘消耗品</div></div>
        <div class="mg-val">${fmt((p.materials && p.materials.bossToken) || 0)}</div>
      </div>
    </div>`;
    html += '<div class="bag-grid bag-grid-8 mat-page">';
    html += matPageHtml();
    html += '</div>';
    html += '<div style="font-size:11px;color:#8f8570;margin-top:10px">材料自动堆叠，不占装备背包格</div>';
    return html;
  }

  html += '<div class="bag-grid bag-grid-8">';
  for (let i = start; i < end; i++) {
    const it = p.bag[i];
    if (!it) { html += '<div class="bag-cell empty">—</div>'; continue; }
    if (it.type === 'potion') {
      const pi2 = POTION_IDX[it.key] !== undefined ? POTION_IDX[it.key] : 18;
      html += `<div class="bag-cell potion" data-potion="${it.key}">
        <span class="ic-sprite" style="width:26px;height:26px;background-size:${26*EQUIP_COUNT}px 26px;background-position:${-pi2*26}px 0"></span>
        <div class="nm" style="color:${it.color}">${it.name}</div>
        <span class="stack">×${it.count || 1}</span></div>`;
    } else if (it.ringKey) {
      const st = it.star || 0;
      const dCP = equipDeltaPower(p, it);
      const worn = !!(p.equip[it.ringSlot || ringSlotOf(it.ringKey)] || {}).id === it.id;
      html += `<div class="bag-cell relic-ring has" data-item="${it.id}">
        ${iconTag(it.ringSlot || 'ring_exp', 26)}
        <div class="nm" style="color:#ff8a8a">${DATA.SPECIAL_RINGS[it.ringKey].name}${st ? ' ' + '★'.repeat(st) : ''}</div>
        ${!worn && dCP > 0 ? '<span class="up">▲</span>' : ''}
        <span class="cp-mini">${worn ? '已穿戴' : (dCP > 0 ? '+' : '') + dCP}</span></div>`;
    } else if (it.type === 'book') {
      html += `<div class="bag-cell book" data-book="${it.stat}">
        <span class="ic-sprite" style="width:26px;height:26px;background-size:${26*EQUIP_COUNT}px 26px;background-position:${-BOOK_IDX*26}px 0"></span>
        <div class="nm" style="color:${it.color}">${it.name}</div>
        <span class="stack">×${it.count || 1}</span></div>`;
    } else {
      const dCP = equipDeltaPower(p, it);
      const locked = it.reqLv > p.level;
      const _isRing = it.slot && it.slot.indexOf('ring_') === 0;
      html += `<div class="bag-cell${locked ? ' locked' : ''}${_isRing ? ' relic-ring has' : ''}" data-item="${it.id}">
        ${iconTag(it.slot, 26, it.wtype, it.relicKey)}
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
    const ringCls = isRing(sk) ? (it ? ' relic-ring has' : ' relic-ring empty') : '';
    // 有装备 → 用「装备自己的图标」；空槽 → 只显示空框，不显示占位图标
    const ic = it
      ? iconTag(isRing(sk) ? sk : (it.slot || sk), size || 34, it.wtype, it.relicKey)
      : `<span class="eq-empty-ic" style="width:${size || 34}px;height:${size || 34}px">＋</span>`;
    return `<div class="eq-v ${it ? 'q-border-' + it.qKey : 'none'}${ringCls}" data-slot="${sk}" ${it ? `data-item="${it.id}"` : ''}>
      ${isRing(sk) && it ? '<span class="relic-star">✦</span>' : ''}
      <span class="eq-lv">${it ? it.ilvl : '—'}</span>
      ${ic}
      <span class="eq-nm" style="${it ? 'color:' + it.color : 'color:#6b6558'}">${it ? (it.enh ? '+' + it.enh + ' ' : '') + it.name.slice(0, 5) : DATA.SLOTS[sk].name}</span>
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
  const tab = G._charTab === 'hlt' ? 'hlt' : 'ring';
  const hAct = hltEnsure(p).active;
  const hIdx = hAct ? DATA.HEIRLOOMS.findIndex(x => x.key === hAct) : -1;
  const hW = hIdx >= 0 ? DATA.HEIRLOOMS[hIdx] : null;

  mid += `<div class="socket-tabs">
    <button class="st-b ${tab === 'ring' ? 'on' : ''}" data-char-tab="ring">特戒</button>
    <button class="st-b ${tab === 'hlt' ? 'on' : ''}" data-char-tab="hlt">传家宝</button>
  </div>`;

  if (tab === 'ring') {
    mid += `<div class="socket-row">
      <div class="socket-grid">
        ${DATA.RING_SLOTS.map(r => slotHtml(r.slot, 32)).join('')}
      </div>
    </div>`;
  } else {
    mid += `<div class="socket-row hlt-row">
      ${hW
        ? `<div class="hlt-slot filled" data-hlt-open="${hW.key}">
             <div class="hs-art" style="background-size:300% 300%;
               background-position:${(hIdx % 3) * 50}% ${Math.floor(hIdx / 3) * 50}%"></div>
             <div class="hs-name" style="color:${hW.color}">${hW.alias}</div>
           </div>`
        : `<div class="hlt-slot empty" data-hlt-open="">
             <div class="hs-plus">+</div>
             <div class="hs-name">未装备</div>
           </div>`}
    </div>`;
  }
  mid += '</div>';

  // ---- 属性列 ----
  // 数字一律显示为整数（避免 61.480000000000004 这种浮点尾巴）
  const num = v => (typeof v === 'number' && !Number.isInteger(v)) ? Math.round(v) : v;
  const row = (n, v, c2) => `<div class="s-row"><span>${n}</span><b class="${c2 || ''}">${num(v)}</b></div>`;
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
  stats += row('力量', Math.round(A.str)); stats += row('敏捷', Math.round(A.agi));
  stats += row('智力', Math.round(A.int)); stats += row('体质', Math.round(A.vit));
  stats += '</div>';

  // 装备图鉴加成（套装展示已移出本面板）
  const cxB = (typeof equipCodexBonus === 'function') ? equipCodexBonus(p) : { hpPct:0, armorPct:0, atkPct:0, all:0, done:0 };
  stats += '<div class="s-group"><div class="s-title">装备图鉴</div>';
  stats += row('已激活图鉴', cxB.done + ' 本');
  stats += row('生命', '+' + (cxB.hpPct * 100).toFixed(1) + '%');
  stats += row('护甲', '+' + (cxB.armorPct * 100).toFixed(1) + '%');
  stats += row('攻击', '+' + (cxB.atkPct * 100).toFixed(1) + '%');
  stats += row('三维', '+' + (cxB.allPct * 100).toFixed(1) + '%');
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
    const breakCost = breakCostOf(pf.tier);
    const lvFull = lv >= 5;
    const canBreak = full && lvFull && pf.tier < DATA.SKILL_TIER.maxTier;
    const breakable = pf.tier < DATA.SKILL_TIER.maxTier;
    const dmgUp = Math.round((DATA.SKILL_TIER.tierDmg * (pf.tier - 1)) * 100);
    const cdDown = Math.round((DATA.SKILL_TIER.tierCd * (pf.tier - 1)) * 100);
    html += `<div class="skill-row ${lv?'learned':''}">
      <div class="sk-ic">${keyOf(k)}</div>
      ${skillIconTag(k, 30)}
      <div class="sk-main"><div class="sk-name">${sp.name}
        <small>Lv.${lv}</small>
        <small style="color:#ffd24a">${pf.tier} 层</small>
        ${cdDown ? `<small style="color:#5fdc4a">-${cdDown}%CD / +${Math.round((pf.tier-1)*DATA.SKILL_TIER.tierCtrl*100)}%控制</small>` : ''}
        ${lv>1 ? `<small style="color:#4ad4ff">+${Math.round((lv-1)*DATA.SKILL_TIER.lvDmg*100)}%伤害 / -${Math.round((lv-1)*DATA.SKILL_TIER.lvMana*100)}%耗蓝 / +${Math.round((lv-1)*DATA.SKILL_TIER.lvRadius*100)}%范围</small>` : ''}</div>
      <div class="sk-desc">${sp.desc}　冷却 ${sp.cd}s${sp.cost?'　法力 '+sp.cost:''}</div>
      <div class="prof-bar"><i style="width:${pct}%;background:${full?'#ffd24a':'#5b3fa8'}"></i>
        <span>${pf.prof.toFixed(0)} / ${DATA.SKILL_TIER.needProf}</span></div>
      </div>
      ${canBreak
        ? `<button class="sk-btn ${(p.materials.breakT||0)>=breakCost?'':'lack'}" data-break-skill="${k}">
             突破 → ${pf.tier+1} 层<br><small>突破券 ${p.materials.breakT||0}/${breakCost}</small></button>`
        : (!breakable
            ? `<button class="sk-btn" disabled>已满 ${DATA.SKILL_TIER.maxTier} 层</button>`
            : (!full
                ? `<button class="sk-btn" disabled>熟练度未满</button>`
                : `<button class="sk-btn" disabled>需先把技能练到 Lv.5</button>`))}
      ${(function(){
        if (lv >= 5) return `<button class="sk-btn" disabled>已满级 Lv.5</button>`;
        const cost = skillLvCost(lv);
        const can = p.gold >= cost;
        return `<button class="sk-btn gold-up ${can ? '' : 'lack'}" data-gold-skill="${k}" ${can ? '' : 'disabled'}>
          金币升级 Lv.${lv}→${lv+1}<br><small>${fmt(cost)} 金</small></button>`;
      })()}
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
  return html + '</div><div style="font-size:11px;color:#8f8570">技能书由怪物掉落，或在抽奖专员处抽奖获得</div>';
}

/* ---------------- 关卡 / 难度选择 ---------------- */


/* ================= 七天签到 ================= */

/* 签到奖励图标：装备图集 / 宠物图集 / 坐骑图集 */
function signinIconHtml(d, sz) {
  const S = sz || 44;
  const eq = (i) => `<span class="ic-sprite" style="width:${S}px;height:${S}px;
    background-size:${S * EQUIP_COUNT}px ${S}px;background-position:${-i * S}px 0"></span>`;
  const sw = d.sprite || '';
  if (sw === 'coin')        return eq(43);
  if (sw === 'stone')       return eq(31);
  if (sw === 'bossToken')   return eq(35);
  if (sw === 'talentStone') return eq(37);
  if (sw === 'sourceCrystal') return eq(38);
  if (sw.startsWith('pet')) {
    const i = +(sw.slice(3) || 0);
    const x = (i % 4) * (100 / 3), y = Math.floor(i / 4) * 100;
    return `<span class="si-sheet" style="width:${S}px;height:${S}px;
      background-image:var(--pet-sheet);
      background-size:400% 200%;
      background-position:${x}% ${y}%"></span>`;
  }
  if (sw.startsWith('mount')) {
    const i = +(sw.slice(5) || 0);
    const x = (i % 3) * 50, y = Math.floor(i / 3) * 50;
    return `<span class="si-sheet" style="width:${S}px;height:${S}px;
      background-image:var(--mount-sheet);
      background-size:300% 300%;
      background-position:${x}% ${y}%"></span>`;
  }
  return `<span class="si-fallback">${d.icon || '?'}</span>`;
}

function signinHtml() {
  const p = G.player;
  const si = signinEnsure(p);
  const canToday = signinCanClaim(p);
  const days = DATA.SIGNIN.days;

  let html = `<div class="si-panel">
    <div class="si-deco tl"></div><div class="si-deco tr"></div>
    <div class="si-deco bl"></div><div class="si-deco br"></div>

    <div class="si-banner">
      <div class="si-banner-glow"></div>
      <div class="si-title">七 日 签 到</div>
      <div class="si-sub2">每天可签到一次，连续 7 天领完所有奖励</div>
      <div class="si-progress"><i style="width:${(si.idx / days.length * 100).toFixed(1)}%"></i></div>
      <div class="si-progress-txt">已领 <b>${si.idx}</b> / ${days.length} 天</div>
    </div>

    <div class="si-grid">`;

  days.forEach((d, i) => {
    const claimed = si.idx > i;
    const isToday = canToday && si.idx === i;
    const cls = claimed ? 'done' : (isToday ? 'today' : '');
    const btn = claimed ? '<div class="si-btn ok">✓ 已领取</div>'
      : (isToday ? `<div class="si-btn can" data-signin-claim="1">领 取</div>`
                 : '<div class="si-btn">未开启</div>');
    html += `<div class="si-card ${cls}">
      <div class="si-ribbon">第 ${d.day} 天</div>
      <div class="si-ic" style="color:${d.color}">${signinIconHtml(d, 42)}</div>
      <div class="si-nm" style="color:${d.color}">${d.name}</div>
      ${btn}
    </div>`;
  });

  html += `</div>`;
  if (si.idx >= days.length) {
    html += `<div class="si-done-tip">✦ 本期七天奖励已全部领取完毕 ✦</div>`;
  }
  html += `</div>`;
  return html;
}

function bindSigninControls(body) {
  body.querySelectorAll('[data-signin-claim]').forEach(b => b.onclick = () => {
    const r = signinClaim(G.player);
    if (!r.ok) { toast(r.msg); return; }
    if (typeof Sfx !== 'undefined') Sfx.play('lvlup');
    bigAnnounce(`第 ${r.day} 天 · 签到成功`, '#ffd24a');
    toast(`领取第 ${r.day} 天奖励：${r.name}${r.extra || ''}`);
    logMsg(`📅 签到第 ${r.day} 天：${r.name}`, 'level');
    saveGame();
    updateSigninDot();
    openModal('signin', '七天签到', signinHtml());
  });
}

/* 右上角红点：今天还没签到就显示 */
function updateSigninDot() {
  const dot = document.getElementById('signinDot');
  if (!dot || !G.player) return;
  const can = signinCanClaim(G.player);
  dot.classList.toggle('hidden', !can);
}

/* ================= 天赋页面 ================= */
function talentTab() { return G._talentTab === 'tree' ? 'tree' : 'desc'; }

function talentIconHtml(key, size) {
  const i = TALENT_IDX[key];
  const sz = size || 44;
  if (i === undefined) return '';
  return `<span class="ic-sprite" style="width:${sz}px;height:${sz}px;
    background-size:${sz * EQUIP_COUNT}px ${sz}px;
    background-position:${-i * sz}px 0"></span>`;
}

/* 天赋描述页 */
function talentDescHtml() {
  const p = G.player;
  const t = talentEnsure(p);
  const e = talentEffect(p);
  const gate = DATA.TALENT_GATES[0];
  let html = '';

  if (!t.key) {
    // 未觉醒
    const canAwake = p.level >= gate;
    html += `<div class="tal-hero empty">
      <div class="tal-orb">？</div>
      <div class="tal-hint">${canAwake
        ? '你已获得觉醒资格 —— 点击下方按钮，随机觉醒一种天赋'
        : `达到 Lv.${gate} 后可以觉醒天赋（当前 Lv.${p.level}）`}</div>
      ${canAwake ? '<button class="tal-awake" data-talent-awake="1">✦ 觉醒天赋</button>' : ''}
    </div>
    <div class="tal-list">`;
    DATA.TALENT_ORDER.forEach(k => {
      const d = DATA.TALENTS[k];
      html += `<div class="tal-card dim">
        <div class="tal-ic">${talentIconHtml(k, 40)}</div>
        <div class="tal-main">
          <div class="tal-name" style="color:${d.color}">${d.name}</div>
          <div class="tal-desc">${d.desc}</div>
          <div class="tal-val">初始：${talentEffectText(k, 1)}</div>
        </div></div>`;
    });
    html += '</div>';
    return html;
  }

  // 已觉醒
  const d = DATA.TALENTS[t.key];
  const tier = talentTier(p);
  const next = talentNext(p);
  html += `<div class="tal-hero">
    <div class="tal-orb" style="border-color:${tier.tier.color};box-shadow:0 0 26px ${tier.tier.color}66">
      ${talentIconHtml(t.key, 62)}</div>
    <div class="tal-title" style="color:${d.color}">${d.name}</div>
    <div class="tal-tier" style="color:${tier.tier.color}">${tier.maxed ? '超神圆满' : tier.tier.name}
      <span class="tal-lv">Lv.${t.lv}</span></div>
    <div class="tal-desc2">${d.desc}</div>
    <div class="tal-effect">当前效果：<b style="color:${d.color}">${talentEffectText(t.key, t.lv)}</b></div>
    <div class="tal-next">${next.maxed ? '已达上限' :
      `下一级：${talentEffectText(t.key, t.lv + 1)}（需 Lv.${next.needLv}）`}</div>
  </div>
  <div class="tal-list">`;
  DATA.TALENT_ORDER.forEach(k => {
    const dd = DATA.TALENTS[k];
    const on = k === t.key;
    html += `<div class="tal-card${on ? ' on' : ' locked'}">
      <div class="tal-ic">${talentIconHtml(k, 40)}</div>
      <div class="tal-main">
        <div class="tal-name" style="color:${dd.color}">${dd.name}${on ? ' <small>已觉醒</small>' : ' <small>未选择</small>'}</div>
        <div class="tal-desc">${dd.desc}</div>
        <div class="tal-val">${on ? '当前：' + talentEffectText(k, t.lv) : '初始：' + talentEffectText(k, 1)}</div>
      </div></div>`;
  });
  html += `</div><div class="tal-warn">天赋只能觉醒一次，且不可更改。</div>`;
  return html;
}

/* 天赋某一级的文字描述 */
function talentEffectText(key, lv) {
  const def = DATA.TALENTS[key];
  const n = Math.max(1, lv);
  const pct = v => (v * 100).toFixed(1).replace(/\.0$/, '') + '%';
  if (key === 'soulPoison')
    return `每秒 ${pct(def.base.poison + (n - 1) * def.per.poison)} 怪物总血量毒伤，持续 ${def.base.dur + (n - 1) * def.per.dur} 秒`;
  if (key === 'recovery')
    return `每秒回复 ${pct(def.base.regen + (n - 1) * def.per.regen)} 总血量`;
  if (key === 'execute')
    return `${pct(def.base.exec + (n - 1) * def.per.exec)} 概率一击必杀`;
  if (key === 'revive')
    return `${pct(def.base.revive + (n - 1) * def.per.revive)} 概率原地复活（CD 60s）`;
  return '';
}

/* 突破树（中轴 + 左右交替，参照 demo） */
function talentTreeHtml() {
  const p = G.player;
  const t = talentEnsure(p);
  const mats = p.materials || {};
  const next = talentNext(p);
  let html = `<div class="tree-head">
    <div class="tree-mat"><span class="ic-sprite" style="width:26px;height:26px;background-size:${26*EQUIP_COUNT}px 26px;background-position:${-MAT_IDX.talentStone*26}px 0"></span>
      天赋突破石 <b>${mats.talentStone || 0}</b></div>
    <div class="tree-mat"><span class="ic-sprite" style="width:26px;height:26px;background-size:${26*EQUIP_COUNT}px 26px;background-position:${-MAT_IDX.sourceCrystal*26}px 0"></span>
      源晶 <b>${mats.sourceCrystal || 0}</b></div>
    <div class="tree-mat">金币 <b>${fmt(p.gold || 0)}</b></div>
  </div>
  <div class="tree-sub">材料只有 <b style="color:#ff9a6b">BOSS</b> 掉落，掉率很低。每 10 级解锁一个突破节点。</div>
  <div class="tb-tree"><div class="tb-axis"></div>`;

  for (let i = 0; i < DATA.TALENT_GATES.length; i++) {
    const lv = i + 1;
    const needLv = DATA.TALENT_GATES[i];
    const tierObj = DATA.TALENT_TIERS[Math.min(lv, 9) - 1];
    const reached = t.key && t.lv >= lv;
    const isNext = !!(t.key && !next.none && !next.maxed && next.toLv === lv);
    const lvOk = p.level >= needLv;
    const cost = lv === 1 ? null : DATA.talentCost(lv);
    const side = (i % 2 === 0) ? 'left' : 'right';
    const state = reached ? 'done' : (isNext ? (lvOk ? 'next' : 'next locklv') : 'lock');

    const card = `<div class="tb-card">
      <div class="tb-title" style="color:${tierObj.color}">
        <span class="tb-dot" style="background:${reached ? tierObj.color : 'transparent'};border-color:${tierObj.color}"></span>
        ${lv === 10 ? '超神圆满' : tierObj.name}
        <small>Lv.${lv}</small>
      </div>
      <div class="tb-req">需要角色 Lv.${needLv} ${lvOk ? '<b class="ok">✓</b>' : '<span class="no">（未达到）</span>'}</div>
      ${cost
        ? `<div class="tb-cost">突破石 ${cost.stone}　源晶 ${cost.crystal}<br>金币 ${fmt(cost.gold)}</div>`
        : `<div class="tb-cost">觉醒节点（随机获得一种天赋）</div>`}
      ${isNext ? `<button class="tb-btn ${next.ok ? '' : 'off'}" data-talent-break="1">
        ${next.ok ? '突 破' : (lvOk ? '材料不足' : '等级不足')}</button>` : ''}
    </div>`;

    html += `<div class="tb-row ${side} ${state}">
      ${side === 'left'
        ? `<div class="tb-cell">${card}</div><div class="tb-arrow"><i></i></div><div></div>`
        : `<div></div><div class="tb-arrow"><i></i></div><div class="tb-cell">${card}</div>`}
    </div>`;
  }
  html += `</div>`;
  if (!t.key) html += `<div class="tal-warn">先觉醒天赋，才能开始突破。</div>`;
  return html;
}

function talentHtml() {
  const tab = talentTab();
  const p = G.player;
  const t = talentEnsure(p);
  let html = `<div class="tal-tabs">
    <button class="tal-tab ${tab === 'desc' ? 'on' : ''}" data-talent-tab="desc">✦ 天赋</button>
    <button class="tal-tab ${tab === 'tree' ? 'on' : ''}" data-talent-tab="tree">🌳 天赋突破</button>
  </div>`;
  html += tab === 'tree' ? talentTreeHtml() : talentDescHtml();
  return html;
}

/* 天赋控件绑定（每次重建后必须重新调用） */
function bindTalentControls(body) {
  body.querySelectorAll('[data-talent-tab]').forEach(b => b.onclick = () => {
    G._talentTab = b.dataset.talentTab;
    openModal('talent', '天赋', talentHtml());
  });
  body.querySelectorAll('[data-talent-awake]').forEach(b => b.onclick = () => startTalentAwaken(b));
  body.querySelectorAll('[data-talent-break]').forEach(b => b.onclick = () => {
    if (talentBreak(G.player)) {
      const tier = talentTier(G.player);
      toast(`✦ 突破成功：${tier.maxed ? '超神圆满' : tier.tier.name} Lv.${tier.lv}`);
      saveGame();
      openModal('talent', '天赋', talentHtml());
    } else {
      openModal('talent', '天赋', talentHtml());
    }
  });
}

/* 觉醒：3 / 2 / 1 倒计时 → 金光 */
function startTalentAwaken(btn) {
  const p = G.player;
  if (p.level < DATA.TALENT_GATES[0]) { toast('需要 Lv.' + DATA.TALENT_GATES[0]); return; }
  if (talentEnsure(p).key) { toast('已经觉醒过了'); return; }
  const box = btn.parentElement;
  let n = 3;
  btn.disabled = true; btn.textContent = n;
  const tick = setInterval(() => {
    n--;
    if (n > 0) { btn.textContent = n; if (typeof Sfx !== 'undefined') Sfx.play('confirm'); return; }
    clearInterval(tick);
    const key = talentAwaken(p);
    if (!key) { toast('觉醒失败'); return; }
    const d = DATA.TALENTS[key];
    saveGame();
    if (typeof Sfx !== 'undefined') Sfx.play('lvlup');
    bigAnnounce('✦ 觉 醒 · ' + d.name, d.color);
    // 金光扫过
    G._talentGlow = 1.6;
    openModal('talent', '天赋', talentHtml());
    toast(`✦ 觉醒成功：${d.name}`);
  }, 800);
}

/* 30 级解锁提示（每角色一次） */
function talentUnlockPrompt() {
  setTimeout(() => {
    if (G.screen !== 'game') return;
    bigAnnounce('✦ 已可觉醒天赋', '#ffd24a');
    toast('✦ 达到 30 级：打开右上角「天赋」可觉醒一种天赋（只能一次）');
    if (typeof Sfx !== 'undefined') Sfx.play('confirm');
  }, 600);
}

function townMapHtml(zone) {
  const p = G.player;
  const z = zone || 'main';
  let html = '<div class="npc-row" style="margin-bottom:10px"><div><div class="nr-name">回城</div>'
    + '<div class="nr-info">返回暴风城安全区（也可按 H）</div></div>'
    + '<button data-act-town style="border-color:#6b8a4a;color:#b9ffb0">回城</button></div>';
  html += '<div style="font-size:12px;color:#8f8570;margin:10px 0 8px">选择房间，再选难度进入</div><div class="room-pick">';
  DATA.ROOMS.forEach((r, i) => {
    if (r.daily) return;                  // 每日副本从传送员进入
    const rz = r.zone || 'main';
    if (z === 'holy' ? rz !== 'holy' : rz === 'holy') return;
    const unlocked = (rz === 'holy') ? (p.level >= (r.reqLv || 1)) : p.unlocked.includes(i);
    const lvOk = p.level >= (r.reqLv || 1);
    const ok = unlocked && lvOk;
    const need = requiredCP(i, 'normal');
    const v = cpVerdict(combatPower(p), need);
    html += `<div class="room-btn ${ok?'':'locked'}" data-pick-room="${i}" data-reqlv="${r.reqLv||1}">
      <div class="rb-name">${r.name}</div>
      <div class="rb-sub">建议等级 ${r.reqLv}+　${ok ? '可进入' : (lvOk ? '未解锁' : '等级不足')}</div>
      <div class="rb-sub" style="color:${ok?v.color:'#ff6b5a'}">${lvOk ? '推荐 '+fmt(need)+'　你 '+fmt(combatPower(p)) : '需要 Lv.'+(r.reqLv||1)+'（当前 '+p.level+'）'}</div></div>`;
  });
  html += '</div>';

  // 每日副本也能从 M 面板直接进入（仅主城分区）
  if (z === 'holy') { html += '</div>'; return html + '</div>'; }
  html += '<div style="font-size:12px;color:#ffd98a;margin:14px 0 8px">📅 每日副本（每个每天 2 次，怪物等级跟随你）</div><div class="room-pick">';
  DATA.DAILY_ROOMS.forEach(r => {
    const left = dailyLeft(p, r.key);
    const done = !!(p.dailyDone && p.dailyDone[r.key + '@' + todayStr()]);
    const ok = left > 0;
    html += `<div class="room-btn ${ok ? '' : 'locked'}" ${ok ? `data-daily-enter="${r.id}"` : ''}>
      <div class="rb-name" style="color:${r.color}">${r.icon} ${r.name}</div>
      <div class="rb-sub">${ok ? '剩余 ' + left + '/2 次' : (done ? '今日已通关' : '次数已用完')}</div>
      <div class="rb-sub" style="color:${ok ? '#5fdc4a' : '#ff6b5a'}">${r.desc}</div></div>`;
  });
  html += '</div><div style="font-size:11px;color:#8f8570">当前装备达成：<b style="color:#ffd98a">' +
    gearTier(p).tierName + '</b>　建议：简单=绿装 / 困难=蓝装 / 地狱=紫装</div>';
  return html;
}

function diffPickHtml(roomId) {
  const p = G.player;
  const r = getRoom(roomId) || DATA.ROOMS[roomId];
  let html = `<div style="font-family:var(--serif);font-size:16px;color:#ffd24a;margin-bottom:4px">${r.name}</div>
    <div style="font-size:11px;color:#8f8570;margin-bottom:12px">${r.desc}　推荐等级 ${r.lv}+</div>
    <div class="diff-pick">`;
  const myCP = combatPower(p);
  DATA.DIFF_ORDER.forEach(k => {
    const d = DATA.DIFFICULTY[k];
    const need = requiredCP(roomId, k);
    const v = cpVerdict(myCP, need);
    const pct = Math.min(100, myCP / need * 100);
    const open = diffUnlocked(p, k);
    const lockTxt = diffLockText(p, k);
    if (!open) {
      html += `<div class="diff-card locked" data-pick-diff="${k}" data-room="${roomId}"
          style="border-color:#3a3226">
        <div class="dc-name" style="color:#6b6558">${d.name} 🔒</div>
        <div class="dc-info">怪物生命 ×${d.hpMul}<br>攻击 ×${d.atkMul}<br>掉落 ×${d.dropMul}</div>
        <div class="cp-line">推荐战力 <b style="color:#6b6558">${fmt(need)}</b></div>
        <div class="dc-req" style="color:#ff9a5a;background:#ff9a5a22">${lockTxt}</div>
      </div>`;
      return;
    }
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

/* ---------------- 左上角提示框：点击显示 5 秒，点别处也收起 ---------------- */
let _hudTipTimer = null;
function hudTipOpen(box) {
  ['hudMount', 'hudAura', 'hudPet'].forEach(id => {
    const el = document.getElementById(id);
    if (el && el !== box) el.classList.remove('show');
  });
  const on = box.classList.toggle('show');
  if (_hudTipTimer) { clearTimeout(_hudTipTimer); _hudTipTimer = null; }
  if (on) {
    _hudTipTimer = setTimeout(() => {
      box.classList.remove('show');
      _hudTipTimer = null;
    }, 5000);
  }
}
document.addEventListener('pointerdown', e => {
  if (e.target.closest && e.target.closest('#hudMount, #hudAura, #hudPet')) return;
  ['hudMount', 'hudAura', 'hudPet'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('show');
  });
  if (_hudTipTimer) { clearTimeout(_hudTipTimer); _hudTipTimer = null; }
});

/* ---------------- 坐骑状态 HUD ---------------- */
function updateMountHud() {
  const box = document.getElementById('hudMount');
  const ic = document.getElementById('mountIc');
  const tip = document.getElementById('mountTip');
  if (!box || !ic || !tip) return;
  const ms = mountEnsure(G.player);
  const m = ms.active ? mountByKey(ms.active) : null;
  if (!m) {
    // 未骑乘：虚线空槽
    box.classList.remove('on', 'show');
    ic.style.backgroundPosition = '0 0';
    ic.style.backgroundImage = 'none';
    ic.textContent = '＋';
    ic.style.borderStyle = 'dashed';
    ic.style.borderColor = '#4a3d28';
    ic.style.boxShadow = 'none';
    tip.innerHTML = `<b>坐骑：未骑乘</b><br>` +
      `<span style="color:#8f8570">去主城左下角找「驯兽师 · 铃」购买坐骑</span><br>` +
      `<span style="color:#6b6558">坐骑只提升移动速度</span>`;
    return;
  }
  box.classList.add('on');
  ic.textContent = '';
  ic.style.backgroundImage = '';
  ic.style.borderStyle = 'solid';
  ic.style.borderColor = '#ffd24a';
  ic.style.boxShadow = '0 0 12px rgba(255,210,74,.5)';
  ic.style.backgroundPosition = `${(m.idx % 3) * 50}% ${Math.floor(m.idx / 3) * 50}%`;
  const tier = DATA.MOUNT_TIERS[m.tier];
  tip.innerHTML = `<b>坐骑：${m.name}</b><br>` +
    `<span style="color:${tier.color}">${tier.name}</span><br>` +
    `<span class="mv">移速 +${Math.round(m.spd * 100)}%</span><br>` +
    `<span style="color:#a89e88">${m.desc}</span>`;
  box.onclick = () => hudTipOpen(box);
}

/* ---------------- 光环 HUD ---------------- */
function updateAuraHud() {
  const box = document.getElementById('hudAura');
  const ic = document.getElementById('auraIc');
  const tip = document.getElementById('auraTip');
  if (!box || !ic || !tip) return;
  const ap = activePet(G.player);
  if (!ap) { box.classList.add('hidden'); box.classList.remove('show'); return; }
  const { def, lv, value } = ap;
  box.classList.remove('hidden');
  ic.style.backgroundPosition = `${(def.icon % 4) * 33.333}% ${Math.floor(def.icon / 4) * 100}%`;
  ic.style.borderColor = def.color;
  ic.style.boxShadow = `0 0 12px ${def.color}88`;
  const valTxt =
    def.unit === '蓝/秒' ? `+${value} 蓝/秒`
    : def.unit === '护甲' ? `+${value} 护甲`
    : (def.unit === '吸血' || def.unit === '反弹') ? `+${Math.round(value * 100)}%`
    : def.unit === '攻击' ? `+${Math.round(value * 100)}% 远程攻击`
    : `+${Math.round(value * 100)}% 移速` + (def.extra ? ` / +${Math.round(def.extra[lv-1] * 100)}% ${def.effect === 'unholy' ? '回血' : '攻速'}` : '');
  tip.innerHTML = `<b>${def.aura} L${lv}</b><br>` +
    `<span style="color:#8f8570">${def.owner} · ${def.name}</span><br>` +
    `<span class="at-v">${valTxt}</span><br>` +
    `<span style="color:#a89e88">${def.desc}</span><br>` +
    `<span style="color:#6b6558">范围 90 码 · 同名光环不叠加</span>`;
  box.onclick = () => hudTipOpen(box);
}

/* ---------------- 出战宠物 HUD ---------------- */
function updatePetHud() {
  const box = document.getElementById('hudPet');
  const ic = document.getElementById('petIc');
  const tip = document.getElementById('petTip');
  if (!box || !ic || !tip) return;
  const p = G.player;
  const def = (p && typeof activeBattlePet === 'function') ? activeBattlePet(p) : null;
  if (!def) { box.classList.add('hidden'); box.classList.remove('show'); return; }
  box.classList.remove('hidden');
  ic.style.setProperty('--f', String(def.sprite * 4));
  ic.style.borderColor = def.color;
  ic.style.boxShadow = `0 0 10px ${def.color}88`;
  const st = battlePetStats(p, def) || { hpMax: 0, atk: 0 };
  const type = DATA.PET_TYPES[def.type];
  tip.innerHTML = `<b>宠物：${def.name}</b><br>` +
    `<span style="color:${type.color}">${type.name}</span><br>` +
    `<span class="bp-v">生命 ${st.hpMax.toLocaleString()}　攻击 ${st.atk.toLocaleString()}</span><br>` +
    `<span style="color:#a89e88">${def.desc}</span><br>` +
    `<span style="color:#6b6558">只出战这一只 · 点「驯兽师 · 铃」更换</span>`;
  box.onclick = () => {
    if (typeof Sfx !== 'undefined') Sfx.play('petOrder', 0.6);
    hudTipOpen(box);
  };
}

/* ---------------- 驯兽师：坐骑 / 光环 / 宠物 ---------------- */
function beastMenuHtml() {
  const p = G.player;
  const ms = mountEnsure(p), pt = petEnsure(p), bp = battlePetEnsure(p);
  const mAct = ms.active ? mountByKey(ms.active) : null;
  const pAct = activePet(p);
  const bAct = activeBattlePet(p);
  return `<div class="bm-wrap">
    <div class="bm-head">
      <div class="bm-face">🐾</div>
      <div>
        <div class="bm-title">驯兽师 · 铃</div>
        <div class="bm-sub">坐骑：<b>${mAct ? mAct.name : '未乘骑'}</b>　光环：<b>${pAct ? pAct.def.aura : '未开启'}</b>　宠物：<b>${bAct ? bAct.name : '未出战'}</b></div>
      </div>
    </div>
    <button class="bm-big" data-beast="mount">
      <b>🐎 坐骑</b><span>提升移动速度 · 普通 500K / 稀有 1M / 史诗 2M</span>
    </button>
    <button class="bm-big" data-beast="aura">
      <b>✨ 光环</b><span>提供团队增益 · 兑换码获取（已拥有 ${pt.owned.length}/7）</span>
    </button>
    <button class="bm-big" data-beast="pet">
      <b>🐾 出战宠物</b><span>会跟着你打怪 · 缰绳招募（已拥有 ${bp.owned.length}/${DATA.BATTLE_PETS.length}）</span>
    </button>
  </div>`;
}

function battlePetHtml() {
  const p = G.player, st = battlePetEnsure(p);
  const rein = p.materials.petRein || 0;
  let html = `<div class="mm-head">🐾 出战宠物 <span>同时只能出战一只 · 会跟随你战斗</span></div>
  <div class="pc-codes" style="background:rgba(60,48,28,.5);border:1px solid rgba(200,162,106,.5)">
    <span style="font-size:12px;color:#c8a26a">宠物缰绳 × <b>${rein}</b></span>
    <span style="font-size:11px;color:#8f8570;margin-left:auto">BOSS 掉落（与源晶同爆率）</span>
  </div>
  <div class="bp-grid">`;
  DATA.BATTLE_PETS.forEach(def => {
    const owned = st.owned.includes(def.key);
    const active = st.active === def.key;
    const type = DATA.PET_TYPES[def.type];
    const stt = battlePetStats(p, def) || { hpMax: 0, atk: 0 };
    const cost = def.cost;
    const canBuy = cost && rein >= cost.rein && (p.gold || 0) >= cost.gold;
    const rare = def.cost && def.cost.gold >= 50000000;
    html += `<div class="bp-card${active ? ' act' : ''}${owned ? '' : ' lock'}${rare ? ' rare' : ''}"
        style="border-color:${def.color}66">
      <div class="bp-icon" style="--f:${def.sprite * 4}"></div>
      <div class="bp-name" style="color:${def.color}">${def.name}</div>
      <div class="bp-tag" style="color:${type.color}">${type.name}${def.lottery ? ' · 抽奖限定' : ''}${rare ? ' · 最稀有' : ''}</div>
      <div class="bp-stat">生命 <b>${stt.hpMax.toLocaleString()}</b></div>
      <div class="bp-stat">攻击 <b>${stt.atk.toLocaleString()}</b>　攻速 <b>${def.as.toFixed(1)}</b></div>
      <div class="bp-desc">${def.skill ? `<span style="color:${def.skill.color}">${def.skill.name}</span> · ` : ''}${def.desc}</div>
      <div class="bp-foot">`;
    if (!owned) {
      if (!cost) {
        html += `<button class="mm-btn dis" disabled>抽奖获得</button>`;
      } else {
        html += `<button class="mm-btn buy${canBuy ? '' : ' dis'}" ${canBuy ? `data-bpet-recruit="${def.key}"` : 'disabled'}>
          缰绳×${cost.rein} · ${fmt(cost.gold)} 金</button>`;
      }
    } else if (active) {
      html += `<button class="mm-btn on" data-bpet-use="${def.key}">收回</button>`;
    } else {
      html += `<button class="mm-btn" data-bpet-use="${def.key}">出战</button>`;
    }
    html += `</div></div>`;
  });
  html += `</div>
  <div style="margin-top:10px;font-size:11px;color:#8f8570;text-align:center">
    宠物的生命/攻击随你的属性成长；血量归零会暂时退场，8 秒后自动回来。</div>`;
  return html;
}

function mountHtml() {
  const p = G.player, ms = mountEnsure(p);
  let html = `<div class="mm-head">🐎 坐骑 <span>只提升移动速度，不影响战斗</span></div>
  <div class="pc-codes">
    <input id="mountCodeInput" class="pc-input" type="text" inputmode="text"
      autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false"
      placeholder="输入或粘贴坐骑兑换码，如 MNT-HRS-1FAAA" maxlength="24">
    <button class="pc-btn paste" data-mount-paste="1">粘贴</button>
    <button class="pc-btn" data-mount-redeem="1">兑换</button>
  </div>
  <div class="mm-grid">`;
  DATA.MOUNTS.forEach(m => {
    const tier = DATA.MOUNT_TIERS[m.tier];
    const owned = ms.owned.includes(m.key);
    const active = ms.active === m.key;
    const afford = p.gold >= tier.price;
    html += `<div class="mm-card ${active ? 'act' : ''}" style="border-color:${tier.color}66">
      <div class="mm-icon" style="background-position:${(m.idx % 3) * 50}% ${Math.floor(m.idx / 3) * 50}%"></div>
      <div class="mm-name" style="color:${tier.color}">${m.name}<i>${tier.name}</i></div>
      <div class="mm-spd">移速 <b>+${Math.round(m.spd * 100)}%</b></div>
      <div class="mm-desc">${m.desc}</div>
      ${owned
        ? (active
            ? `<button class="mm-btn on" data-mount-off="1">下马</button>`
            : `<button class="mm-btn" data-mount-use="${m.key}">乘骑</button>`)
        : `<button class="mm-btn buy ${afford ? '' : 'dis'}" ${afford ? `data-mount-buy="${m.key}"` : 'disabled'}>
             ${fmt(tier.price)} 金${afford ? '' : '（不足）'}</button>`}
    </div>`;
  });
  html += '</div>';
  return html;
}

function petHtml() {
  const p = G.player, st = petEnsure(p);
  let html = `<div class="mm-head">✨ 光环 <span>同名光环不叠加 · 范围 90 码</span></div>`;
  html += `<div class="pc-codes">
    <input id="petCodeInput" class="pc-input" type="text" inputmode="text"
      autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false"
      placeholder="输入或粘贴兑换码，如 PET-BRI-1BAAA" maxlength="24">
    <button class="pc-btn paste" data-pet-paste="1">粘贴</button>
    <button class="pc-btn" data-pet-redeem="1">兑换</button>
  </div>`;
  html += '<div class="pc-grid">';
  DATA.PETS.forEach(pt => {
    const owned = st.owned.includes(pt.key);
    const active = st.active === pt.key;
    const lv = st.lv[pt.key] || 1;
    const val = pt.values[lv - 1];
    const upCost = DATA.PET_UP_COST[lv] || 0;
    const canUp = owned && lv < 3 && p.gold >= upCost;
    html += `<div class="pc-card ${active ? 'act' : ''} ${owned ? '' : 'lock'}" style="border-color:${pt.color}55">
      <div class="pc-icon" style="background-position:${(pt.icon % 4) * 33.333}% ${Math.floor(pt.icon / 4) * 100}%"></div>
      <div class="pc-name" style="color:${pt.color}">${pt.aura}</div>
      <div class="pc-owner">${pt.owner} · ${pt.name}</div>
      <div class="pc-eff">${pt.desc}</div>
      <div class="pc-val" style="color:${pt.color}">
        L${lv}　${pt.unit === '蓝/秒' ? '+' + val + ' 蓝/秒'
          : pt.unit === '护甲' ? '+' + val + ' 护甲'
          : pt.unit === '吸血' || pt.unit === '反弹' ? '+' + Math.round(val * 100) + '%'
          : pt.unit === '攻击' ? '+' + Math.round(val * 100) + '% 远程攻击'
          : '+' + Math.round(val * 100) + '% 移速' + (pt.extra ? ' / +' + Math.round(pt.extra[lv - 1] * 100) + '% ' + (pt.effect === 'unholy' ? '回血' : '攻速') : '')}
      </div>
      ${owned
        ? `<div class="pc-btns">
             ${active
               ? `<button class="mm-btn on" data-pet-off="1">收回</button>`
               : `<button class="mm-btn" data-pet-use="${pt.key}">出战</button>`}
             ${lv < 3
               ? `<button class="mm-btn buy ${canUp ? '' : 'dis'}" ${canUp ? `data-pet-up="${pt.key}"` : 'disabled'}>升 L${lv + 1}（${fmt(upCost)}）</button>`
               : `<button class="mm-btn on" disabled>已满级</button>`}
           </div>`
        : `<div class="pc-lock">未拥有 · 用兑换码获取</div>`}
    </div>`;
  });
  html += '</div>';
  return html;
}

/* ---------------- 传送员主菜单 ---------------- */
function teleportHtml() {
  const p = G.player;
  const leftAll = DATA.DAILY_ROOMS.reduce((n, r) => n + dailyLeft(p, r.key), 0);
  return `<div class="tp-wrap">
    <button class="tp-big" data-tel="rooms">
      <b>🗺 选择关卡</b><span>前往各大副本，可选普通 / 困难 / 地狱难度</span>
    </button>
    <button class="tp-big" data-tel="daily">
      <b>📅 每日副本</b><span>装备强化 / 技能强化 / 装备合成 / 金币　今日剩余 ${leftAll} 次</span>
    </button>
  </div>`;
}

/* ---------------- 传送员 · 每日副本 ---------------- */
function dailyDungeonHtml() {
  const p = G.player;
  let html = `<div class="dd-head">
    <div class="dd-title">📅 每日副本</div>
    <div class="dd-sub">每个副本每天可进入 <b>${DATA.DAILY_LIMIT}</b> 次　明天 0 点重置</div>
  </div><div class="dd-grid">`;

  DATA.DAILY_ROOMS.forEach(r => {
    const left = dailyLeft(p, r.key);
    const done = !!(p.dailyDone && p.dailyDone[r.key + '@' + todayStr()]);
    const ok = left > 0;
    const mats = Object.keys(r.reward || {}).map(k =>
      `${DATA.MATERIALS[k].name}×${r.reward[k]}`).join('　');
    html += `<div class="dd-card ${ok ? '' : 'out'}">
      <div class="dd-ic" style="color:${r.color}">${r.icon}</div>
      <div class="dd-main">
        <div class="dd-name" style="color:${r.color}">${r.name}</div>
        <div class="dd-desc">${r.desc}</div>
        <div class="dd-reward">🎁 ${mats}${r.rewardGold ? '　金币×' + fmt(r.rewardGold[0]) + '~' + fmt(r.rewardGold[1]) : ''}</div>
      </div>
      <div class="dd-side">
        <div class="dd-left ${ok ? '' : 'zero'}">${done ? '今日已通关' : '剩余 ' + left + '/' + DATA.DAILY_LIMIT}</div>
        <button class="dd-btn ${ok ? '' : 'dis'}" ${ok ? `data-daily-enter="${r.id}"` : 'disabled'}>进入</button>
      </div>
    </div>`;
  });
  html += '</div>';
  return html;
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
    // 雕像是「向上生长」的拱形石碑，点击范围要覆盖整块碑体
    if (n.kind === 'statue') {
      const dx = Math.abs(n.x - wx), dy = wy - n.y;   // dy<0 表示在石碑上方
      if (dx < 62 && dy > -80 && dy < 26) return n;
      continue;
    }
    if (Math.hypot(n.x - wx, (n.y - wy) * 0.9) < 46) return n;
  }
  return null;
}

function interactNPC(target) {
  const n = target || nearestNPC();
  if (!n) return;
  if (typeof Sfx !== 'undefined') Sfx.play(n.kind === 'warehouse' ? 'warehouse' : 'openBig');
  switch (n.kind) {
    case 'teleport': openModal('tel', '传送员 · 岳跃冲', teleportHtml()); break;
    case 'holyportal': openModal('holy', '圣光大陆 · 传送位面',
      '<div class="holy-txt">一道悬浮的光门，门后是另一个位面。</div>'
      + '<div class="holy-sub">圣光大陆：60 ~ 120 级副本，每 10 级一档，共 6 个副本 × 3 难度。</div>'
      + '<button class="holy-go" data-holy-go="1">穿过光门 →</button>'); break;
    case 'holygate': openModal('map', '圣光大陆 · 选择副本', townMapHtml('holy')); break;
    case 'holytownback': closeModal(); enterRoom(TOWN); logMsg('返回暴风城', 'info'); break;
    case 'merchant': toggleModal('merchant', '商人 · 赵帅帅', merchantHtml); break;
    case 'exchange': toggleModal('exchange', '抽奖专员 · 李准', exchangeHtml); break;
    case 'blacksmith': toggleModal('smith', '铁匠 · 范在英', smithHtml); break;
    case 'save': saveGame() ? toast('进度已保存') : toast('保存失败'); break;
    case 'quest': toggleModal('quest', '任务官 · 黄仁勋', questHtml); break;
    case 'craft': toggleModal('craft', '锻造台', craftHtml); break;
    case 'warehouse': toggleModal('warehouse', '仓库 · 大木箱', warehouseHtml); break;
    case 'mail': toggleModal('mail', '邮箱', mailHtml); break;
    case 'notice': openModal('notice', '公告牌', noticeHtml()); break;
    case 'heirloom': G._hltPage = G._hltPage || 0; openModal('heirloom', '传家宝 · 古籍', heirloomHtml()); break;
    case 'statue': openModal('statueMenu', '巫妖王雕像', statueMenuHtml()); break;
    case 'beastmaster': toggleModal('beast', '驯兽师 · 铃', beastMenuHtml); break;
    case 'beast': toggleModal('beast', '驯兽师 · 铃', beastMenuHtml); break;
    case 'tutorial': toggleModal('tutorial', '新手指引', tutorialHtml); break;
    case 'tower': toggleModal('tower', '爬塔 · 试炼之塔', towerHtml); break;
  }
}

function relicSideHtml(key) {
  const p = G.player;
  if (key && key.indexOf('set_') === 0) return relicPieceSideHtml(key);
  if (!key) {
    return `<div class="m-side-hint">
      <div class="msh-ic">🛒</div>
      <div>鼠标移到左侧圣物上可查看属性<br>点一下在右侧出现兑换按钮</div>
      <div class="msh-gold">当前金币 <b>${fmt(p.gold)}</b></div>
    </div>`;
  }
  const w = (DATA.RELIC_WEAPONS || []).find(x => x.key === key);
  if (!w) return relicSideHtml(null);
  const okLv = p.level >= w.reqLv, okGold = p.gold >= w.price;
  const okCrystal = (p.materials.sourceCrystal || 0) >= 1;
  const own = (p.bag || []).some(x => x.relicKey === key) ||
              (p.equip.weapon && p.equip.weapon.relicKey === key);
  const pct = ['crit','critDmg','lifesteal','hit','dodge','as','skillDmg','cdr','dr'];
  const lines = Object.keys(w.stats).map(k => {
    const v = w.stats[k];
    return `<div class="rl-stat"><span>${AFFIX_NAMES[k] || k}</span>`
      + `<b>+${pct.includes(k) ? (v * 100).toFixed(1) + '%' : Math.round(v)}</b></div>`;
  }).join('');

  return `<div class="rl-box side">
    <div class="rl-title" style="color:${w.color}">${w.name}</div>
    <div class="rl-meta">圣物 · ${DATA.CLASSES[w.cls].name}专用 · 需要 Lv.${w.reqLv}</div>
    <div class="rl-stats">${lines}
      <div class="rl-stat"><span>圣物特效</span><b class="rlc">命中削 5% 最大生命</b></div>
      <div class="rl-stat"><span>吸血</span><b class="rlc">+5.0%</b></div>
    </div>
    <div class="rl-tip">${w.desc}</div>
    <div class="rl-actions">
      <button data-relic-cancel>取消</button>
      <button data-buy-relic="${w.key}" ${(okLv && okGold && okCrystal && !own) ? '' : 'disabled'}>
        ${own ? '已拥有' : (!okLv ? '等级不足 Lv.' + w.reqLv
          : (!okGold ? '金币不足'
          : (!okCrystal ? '源晶不足' : '兑换 ' + fmt(w.price) + ' 金 + 源晶×1')))}
      </button>
    </div>
    <div class="msh-gold">当前金币 <b>${fmt(p.gold)}</b>　源晶 <b style="color:${okCrystal ? '#5fdc4a' : '#ff6b5a'}">${p.materials.sourceCrystal || 0}</b></div>
  </div>`;
}

function merchantHtml() {
  const p = G.player;
  const sel = G._relicSel;
  const SRC = DATA.RELIC_SETS || {};
  const CLS_ORDER = ['warrior', 'mage', 'archer', 'assassin'];
  const PIECES = ['helm','chest','legs','boots','neck','ring','trinket'];

  let cells = [];
  // 第 1 行：药水
  DATA.POTIONS.forEach(po => {
    const ok = p.gold >= po.price;
    const pi = POTION_IDX[po.key] !== undefined ? POTION_IDX[po.key] : 18;
    cells.push(`<div class="m-cell potion" data-buy-potion="${po.key}" style="${ok ? '' : 'opacity:.5'}">
      <span class="ic-sprite" style="width:32px;height:32px;background-size:${32 * EQUIP_COUNT}px 32px;background-position:${-pi * 32}px 0"></span>
      <div class="m-nm" style="color:${po.color}">${po.name}</div>
      <div class="m-price">${fmt(po.price)} 金</div></div>`);
  });

  // 第 2 行：4 把圣物武器（按职业列）
  CLS_ORDER.forEach(cl => { cells.push(relicWeaponCell(cl, sel)); });

  // 第 3~9 行：7 件圣物套装，竖着按职业排列
  PIECES.forEach((sl, idx) => {
    CLS_ORDER.forEach(cl => { cells.push(relicPieceCell(cl, sl, sel)); });
  });

  return `<div class="m-head"><span>商人 · 赵帅帅</span><b>金币 ${fmt(p.gold)}</b></div>
    <div class="m-legend">
      ${CLS_ORDER.map(cl => `<span style="color:${DATA.CLASSES[cl].color}">${DATA.CLASSES[cl].name} · ${SRC[cl].full}</span>`).join('')}
    </div>
    <div class="m-layout">
      <div class="m-grid m-grid-4x9">${cells.join('')}</div>
      <div class="m-side" id="mSide">${relicSideHtml(sel)}</div>
    </div>`;
}

/* 圣物武器格 */
function relicWeaponCell(cl, sel) {
  const p = G.player;
  const w = (DATA.RELIC_WEAPONS || []).find(x => x.cls === cl);
  if (!w) return '<div class="m-cell empty">—</div>';
  const okGold = p.gold >= w.price, okLv = p.level >= w.reqLv;
  const own = (p.bag || []).some(x => x.relicKey === w.key) ||
              (p.equip.weapon && p.equip.weapon.relicKey === w.key);
  return `<div class="m-cell relic${sel === w.key ? ' sel' : ''}" data-relic="${w.key}">
    ${iconTag('weapon', 34, w.wtype, w.key)}
    <div class="m-nm relic-nm">${w.name.replace('圣物·', '')}</div>
    <div class="m-price ${okLv && okGold && (p.materials.sourceCrystal || 0) >= 1 ? 'ok' : 'no'}">${fmt(w.price)}</div>
    <div class="m-crystal">源晶×1</div></div>`;
}

/* 圣物套装件格 */
function relicPieceCell(cl, sl, sel) {
  const p = G.player;
  const S = (DATA.RELIC_SETS || {})[cl];
  if (!S || !S.pieces[sl]) return '<div class="m-cell empty">—</div>';
  const piece = S.pieces[sl];
  const key = 'set_' + cl + '_' + sl;
  const item = relicPieceItem(cl, sl);
  const name = item.name;
  const okGold = p.gold >= S.price, okLv = p.level >= S.reqLv;
  const own = (p.bag || []).some(x => x.relicPieceKey === key) ||
              ['helm','chest','legs','boots','neck','ring','trinket'].some(s2 => p.equip[s2] && p.equip[s2].relicPieceKey === key);
  return `<div class="m-cell relic${sel === key ? ' sel' : ''}" data-relic="${key}">
    ${iconTag(sl, 30)}
    <div class="m-nm relic-nm">${piece.slotName}</div>
    <div class="m-price ${okLv && okGold && (p.materials.sourceCrystal || 0) >= 1 ? 'ok' : 'no'}">${fmt(S.price)}</div>
    <div class="m-crystal">源晶×1</div></div>`;
}

/* 构造一件圣物套装装备（不入背包） */
function relicPieceItem(cl, sl) {
  const S = DATA.RELIC_SETS[cl];
  const piece = S.pieces[sl];
  return {
    id: 'rp_' + cl + '_' + sl,
    slot: sl, type: 'equip', quality: 'relic', qKey: 'relic',
    name: '圣物·' + DATA.CLASSES[cl].name + '·' + S.name + '·' + piece.slotName,
    color: S.color, ilvl: S.reqLv, reqLv: S.reqLv,
    relicSet: cl, relicPieceKey: 'set_' + cl + '_' + sl,
    setKey: null,
    stats: Object.assign({}, piece.stats), enh: 0, locked: true
  };
}


/* ---------------- 兑换员 / 铁匠 / 设置 ---------------- */
function exchangeHtml() {
  const p = G.player;
  const L = DATA.LOTTERY;
  const tok = p.materials.bossToken || 0;
  const can1 = tok >= L.cost1, can10 = tok >= L.cost10;
  const n = L.prizes.length;
  const seg = 360 / n;

  // 圆盘扇区（等分）
  const stops = L.prizes.map((z, i) =>
    `${i % 2 ? 'rgba(120,92,26,.55)' : 'rgba(70,54,18,.75)'} ${i * seg}deg ${(i + 1) * seg}deg`
  ).join(',');

  // 扇区短文字：外层随盘旋转，内层用相反角度补偿 → 永远正向
  const icons = L.prizes.map((z, i) => {
    const ang = i * seg + seg / 2;
    return `<div class="wh-ico" style="transform:rotate(${ang}deg) translateY(-100px)">
      <span class="wh-txt" data-ang="${ang}" style="color:${z.color};transform:rotate(${-ang}deg)">${z.short || z.name}</span></div>`;
  }).join('');

  // 静态图例：始终水平可读
  const legend = L.prizes.map((z, i) => `
    <div class="lg-item">
      <i class="lg-dot" style="background:${i % 2 ? 'rgba(120,92,26,.85)' : 'rgba(70,54,18,.95)'}"></i>
      <span class="lg-ico" style="color:${z.color}">${z.icon || '●'}</span>
      <span class="lg-name" style="color:${z.color}">${z.name}</span>
    </div>`).join('');

  return `<div class="lot-box">
    <div class="lot-head">
      <span>🎰 抽奖转盘</span>
      <span class="lot-tok">BOSS击杀凭证 <b>${fmt(tok)}</b></span>
    </div>

    <div class="wh-wrap">
      <div class="wh-pointer"></div>
      <div class="wh-ring">
        <div class="wh-wheel" id="lotWheel" style="background:conic-gradient(from -90deg, ${stops})">
          ${icons}
        </div>
        <div class="wh-hub">抽<br>奖</div>
      </div>
    </div>

    <div class="wh-legend">${legend}</div>
    <div class="lot-rare">
      <span class="lr-star">★</span>
      <span class="lr-txt">有概率抽到<b>源晶</b>和稀有坐骑<b>幽灵狼</b>、<b>多彩巨龙</b>！</span>
    </div>

    <div class="lot-actions">
      <button class="lot-btn one" data-lot-draw="1" ${can1 ? '' : 'disabled'}>
        单抽<br><small>${L.cost1} 凭证</small></button>
      <button class="lot-btn ten" data-lot-draw="10" ${can10 ? '' : 'disabled'}>
        十连抽<br><small>${L.cost10} 凭证</small></button>
    </div>
    <div class="lot-result" id="lotResult">
      <div class="lr-hint">凭证来自击杀 BOSS，每个 BOSS 掉 1 个</div>
    </div>
  </div>`;
}

/* 抽奖：扣除凭证 → 按概率抽取 → 奖品直接发放 */
function doLottery(times) {
  const p = G.player;
  const L = DATA.LOTTERY;
  const cost = times === 10 ? L.cost10 : L.cost1;
  if ((p.materials.bossToken || 0) < cost) {
    toast(`BOSS击杀凭证不足（需 ${cost}，现有 ${p.materials.bossToken || 0}）`);
    return null;
  }
  p.materials.bossToken -= cost;

  const total = L.prizes.reduce((a, z) => a + z.prob, 0);
  const roll = () => {
    let r = Math.random() * total;
    for (const z of L.prizes) { r -= z.prob; if (r <= 0) return z; }
    return L.prizes[L.prizes.length - 1];
  };

  const got = [];
  let luckyStone = 0, luckyCrystal = 0;
  for (let i = 0; i < times; i++) {
    const z = roll();
    // v219：每次抽奖 0.1% 概率额外获得 1 个突破石 或 1 个源晶
    if (Math.random() < 0.001) {
      if (Math.random() < 0.5) { luckyStone++; p.materials.talentStone = (p.materials.talentStone || 0) + 1; }
      else { luckyCrystal++; p.materials.sourceCrystal = (p.materials.sourceCrystal || 0) + 1; }
      got.push({ id: 'lucky_' + i, name: luckyStone ? '天赋突破石' : '源晶',
                 color: luckyStone ? '#ffd24a' : '#ff7ae0', ok: true, big: true });
    }
    if (z.kind === 'mat') {
      p.materials[z.key] = (p.materials[z.key] || 0) + z.amount;
      got.push({ id: z.id, name: z.name, color: z.color, ok: true });
    } else if (z.kind === 'mount') {
      const ms = mountEnsure(p);
      const dupC = z.dupCrystal || 1;
      if (ms.owned.includes(z.key)) {
        p.materials.sourceCrystal = (p.materials.sourceCrystal || 0) + dupC;
        got.push({ id: z.id, name: z.name + `（重复）→ 源晶×${dupC}`, color: z.color, ok: true, big: true });
        logMsg(`🎁 抽中重复坐骑 ${z.name}，兑换为源晶 ×${dupC}`, 'level');
      } else {
        ms.owned.push(z.key);
        ms.active = z.key;
        got.push({ id: z.id, name: z.name, color: z.color, ok: true, big: true });
        logMsg(`🎁 抽中坐骑：${z.name}`, 'level');
        bigAnnounce('✦ 抽中稀有坐骑 · ' + z.name.replace('坐骑 · ', ''), z.color);
      }
    } else if (z.kind === 'pet') {
      const st = battlePetEnsure(p);
      const isNew = !st.owned.includes(z.key);
      if (isNew) {
        st.owned.push(z.key);
        st.active = z.key;                 // 抽到直接出战
        G.bpet = null;
        got.push({ id: z.id, name: z.name, color: z.color, ok: true, big: true });
        logMsg(`🎁 抽中宠物：${z.key === 'voidling' ? '虚空幼崽' : z.name}`, 'level');
        bigAnnounce('✦ 抽中稀有宠物 · 虚空幼崽', z.color || '#c08cff');
        if (typeof Sfx !== 'undefined') Sfx.play('petSummon');
      } else {
        p.materials.petRein = (p.materials.petRein || 0) + 2;
        got.push({ id: z.id, name: z.name + '（重复）→ 宠物缰绳×2', color: z.color, ok: true, big: true });
        logMsg('🎁 抽中重复宠物，兑换为宠物缰绳 ×2', 'level');
      }
      if (typeof updatePetHud === 'function') updatePetHud();
    } else if (z.kind === 'relic') {
      // 本职业 7 件套随机一件，直接进背包
      const cls = p.cls || 'warrior';
      const S = DATA.RELIC_SETS[cls] || DATA.RELIC_SETS.warrior;
      const slots = Object.keys(S.pieces);
      const sl = slots[Math.floor(Math.random() * slots.length)];
      const it = relicPieceItem(S.cls, sl);
      it.id = 'rp' + Math.random().toString(36).slice(2, 8);
      if (addToBag(p, it)) {
        got.push({ id: z.id, name: it.name, color: S.color, ok: true });
        logMsg(`🎁 抽中圣物：${it.name}`, 'level');
      } else {
        p.materials.bossToken += L.cost1;
        got.push({ id: z.id, name: '背包已满，已退还凭证', color: '#ff5a40', ok: false });
      }
    }
  }
  recalcStats(p);
  saveGame();
  if (luckyStone || luckyCrystal) {
    const nm = luckyStone ? '天赋突破石' : '源晶';
    const cnt = luckyStone || luckyCrystal;
    bigAnnounce('✦ 抽中了 ' + nm + ' ×' + cnt, luckyStone ? '#ffd24a' : '#ff7ae0');
    logMsg(`✦ 抽奖额外获得 ${nm} ×${cnt}`, 'level');
  }
  return got;
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

/* ---------------- 角色面板 · 传家宝选择/详情 ---------------- */
function hltPickHtml() {
  const p = G.player;
  const h = hltEnsure(p);
  const cells = DATA.HEIRLOOMS.map((w, i) => {
    const owned = h.owned.includes(w.key);
    const active = h.active === w.key;
    const days = h.sign[w.key] || 0;
    return `<div class="hp-cell ${owned ? 'own' : 'lock'} ${active ? 'act' : ''}"
        ${owned ? `data-hlt-equip="${w.key}"` : ''}>
      <div class="hp-art" style="background-size:300% 300%;
        background-position:${(i % 3) * 50}% ${Math.floor(i / 3) * 50}%"></div>
      <div class="hp-nm" style="color:${w.color}">${w.alias}</div>
      <div class="hp-st">${active ? '✔ 使用中' : (owned ? '已拥有' : `未拥有 ${days}/7`)}</div>
    </div>`;
  }).join('');
  return `<div class="hp-wrap">
    <div class="hp-tip">点击已拥有的传家宝即可装备（同时只能装备 1 件）</div>
    <div class="hp-grid">${cells}</div>
    <div class="hp-foot"><button data-hlt-cancel-pick="1">关闭</button></div>
  </div>`;
}

function hltDetailHtml(key) {
  const p = G.player;
  const h = hltEnsure(p);
  const i = DATA.HEIRLOOMS.findIndex(x => x.key === key);
  const w = DATA.HEIRLOOMS[i];
  if (!w) return '<div style="padding:20px">未知传家宝</div>';
  const owned = h.owned.includes(key);
  const active = h.active === key;
  const pctKeys = ['crit','critDmg','as','hit','cdr','skillDmg','dr','lifesteal'];
  const stats = Object.keys(w.stats).map(k => {
    const nm = (typeof AFFIX_NAMES !== 'undefined' && AFFIX_NAMES[k]) ? AFFIX_NAMES[k] : k;
    const v = w.stats[k];
    return `<span class="hb-stat"><i>${nm}</i><b>${pctKeys.includes(k) ? '+' + (v*100).toFixed(0) + '%' : '+' + Math.round(v)}</b></span>`;
  }).join('');
  return `<div class="hd-box">
    <div class="hd-head">
      <div class="hd-art" style="background-size:300% 300%;
        background-position:${(i % 3) * 50}% ${Math.floor(i / 3) * 50}%"></div>
      <div>
        <div class="hd-alias">「${w.alias}」</div>
        <div class="hd-name" style="color:${w.color}">${w.name}</div>
        <div class="hd-cls">${(w.cls||[]).map(c => DATA.CLASSES[c] ? DATA.CLASSES[c].name : c).join(' / ') || '通用'}</div>
      </div>
    </div>
    <div class="hb-stats">${stats}</div>
    <div class="hb-fx">✦ ${w.fx}</div>
    <div class="hd-btns">
      ${active
        ? `<button class="hb-b danger" data-hlt-unequip="1">卸下</button>`
        : `<button class="hb-b" data-hlt-pick="1">替换</button>`}
      <button class="hb-b" data-hlt-cancel-pick="1">关闭</button>
    </div>
  </div>`;
}

/* ---------------- 巫妖王雕像：菜单 ---------------- */
function statueMenuHtml() {
  const p = G.player;
  const lv = p ? p.level : 1;
  const okLv = lv >= 50;
  return `<div class="sm-wrap">
    <div class="sm-head">
      <div class="sm-art"></div>
      <div class="sm-info">
        <div class="sm-title">巫妖王 · 阿尔萨斯</div>
        <div class="sm-sub">霜之哀伤的主人 · 冰封王座</div>
      </div>
    </div>
    <button class="sm-opt" data-statue="silvermoon">
      <b>银月城之战</b><span>回忆 · 阿尔萨斯杀死希尔瓦娜斯、把她变成女妖</span>
    </button>
    <button class="sm-opt" data-statue="lordaeron">
      <b>洛丹伦伏击</b><span>回忆 · 希尔瓦娜斯用毒箭偷袭阿尔萨斯</span>
    </button>
    <button class="sm-opt danger ${okLv ? '' : 'lock'}" data-statue="fight">
      <b>挑战巫妖王 · 阿尔萨斯</b><span>${okLv ? '单人挑战 · 击败可获得大量经验与金币' : '需要等级 50 级（当前 ' + lv + '）'}</span>
    </button>
  </div>`;
}

/* ---------------- 剧情对话（屏幕下部 1/3）---------------- */
function loreStart(key) {
  G._lore = { key, i: 0 };
  const sc = DATA.LORE_SCENES[key];
  if (!sc) return;
  renderLore();
}

function renderLore() {
  const box = document.getElementById('loreBox');
  if (!box) return;
  const st = G._lore;
  if (!st) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  const sc = DATA.LORE_SCENES[st.key];
  if (!sc) { box.classList.add('hidden'); return; }
  const line = sc.lines[st.i] || sc.lines[sc.lines.length - 1];
  const last = st.i >= sc.lines.length - 1;

  const who = line.who === 'l' ? '阿尔萨斯' : (line.who === 's' ? '希尔瓦娜斯' : '');
  const isL = line.who === 'l', isS = line.who === 's';

  box.classList.remove('hidden');
  box.innerHTML = `
    <div class="lore-dim"></div>
    <div class="lore-panel">
      <div class="lore-side ${isL ? 'act' : ''}">
        <div class="lp-face" style="background-position:0 0"></div>
        <div class="lp-name">阿尔萨斯</div>
      </div>
      <div class="lore-main">
        <div class="lore-title">${sc.title}<span class="lore-sub">${sc.sub}</span></div>
        <div class="lore-text ${isL ? 'l' : (isS ? 's' : 'n')}">
          ${who ? `<b>${who}：</b>` : ''}${line.text}
        </div>
        <div class="lore-foot">
          <span class="lore-idx">${st.i + 1} / ${sc.lines.length}</span>
          <button class="lore-next" data-lore-next="1">${last ? '关闭对话' : '点击继续 ▸'}</button>
        </div>
      </div>
      <div class="lore-side ${isS ? 'act' : ''}">
        <div class="lp-face" style="background-position:100% 0"></div>
        <div class="lp-name">希尔瓦娜斯</div>
      </div>
    </div>`;

  // 每次都重新绑定，避免依赖 bindModal
  box.onclick = () => loreNext();
  const btn = box.querySelector('[data-lore-next]');
  if (btn) btn.onclick = (e) => { e.stopPropagation(); loreNext(); };
}

function loreNext() {
  const st = G._lore;
  if (!st) return;
  const sc = DATA.LORE_SCENES[st.key];
  if (st.i >= sc.lines.length - 1) { G._lore = null; renderLore(); return; }
  st.i++;
  if (typeof Sfx !== 'undefined') 
  renderLore();
}

/* ---------------- 传家宝（古籍）---------------- */
function hltPagesHtml() {
  const p = G.player;
  const h = hltEnsure(p);
  const idx = clamp(G._hltPage || 0, 0, DATA.HEIRLOOMS.length - 1);
  const w = DATA.HEIRLOOMS[idx];
  const owned = h.owned.includes(w.key);
  const active = h.active === w.key;
  const days = h.sign[w.key] || 0;
  const signedToday = h.lastDay[w.key] === todayKey();
  const signKey = hltSigningKey(p);
  const lockedBy = (signKey && signKey !== w.key) ? hltByKey(signKey) : null;
  const need = w.days || 7;
  const pct = Math.min(100, days / need * 100);
  const clsName = (w.cls || []).map(c => DATA.CLASSES[c] ? DATA.CLASSES[c].name : c).join(' / ');

  const statLine = (k, v) => {
    const pctKeys = ['crit','critDmg','as','hit','cdr','skillDmg','dr','lifesteal'];
    const nm = (typeof AFFIX_NAMES !== 'undefined' && AFFIX_NAMES[k]) ? AFFIX_NAMES[k] : k;
    return `<span class="hb-stat"><i>${nm}</i><b>${pctKeys.includes(k) ? '+' + (v*100).toFixed(0) + '%' : '+' + Math.round(v)}</b></span>`;
  };
  const statHtml = Object.keys(w.stats).map(k => statLine(k, w.stats[k])).join('');

  return `<div class="hb-book">
    <div class="hb-page left">
      <div class="hb-art ${G._hltZoom || ''}" style="background-size:300% 300%;
        background-position:${(idx % 3) * 50}% ${Math.floor(idx / 3) * 50}%">
        ${idx === 0 ? '<span class="hb-noart">暂无插图</span>' : ''}
      </div>
      <div class="hb-alias">「${w.alias}」</div>
      <div class="hb-name" style="color:${w.color}">${w.name}</div>
      <div class="hb-cls">适用职业：${clsName || '通用'}</div>
      <div class="hb-hr"></div>
      <div class="hb-sec-t">前世今生</div>
      <div class="hb-lore">${w.lore}</div>
      <div class="hb-sec-t">牛逼之处</div>
      <div class="hb-fame">${w.fame}</div>
    </div>

    <div class="hb-page right">
      <div class="hb-sec-t">传家宝属性（常驻，不占装备位）</div>
      <div class="hb-stats">${statHtml}</div>
      <div class="hb-fx">✦ ${w.fx}</div>
      ${w.stack ? `<div class="hb-stk">当前叠加 <b>${(p.hltStk || 0)}</b> 层　
        ${(() => { const d = hltDyn(p); const parts = [];
          if (d.as) parts.push('攻速 +' + Math.round(d.as*100) + '%');
          if (d.atkPct) parts.push('攻击 +' + Math.round(d.atkPct*100) + '%');
          if (d.spellPct) parts.push('法强 +' + Math.round(d.spellPct*100) + '%');
          if (d.lifesteal) parts.push('吸血 +' + Math.round(d.lifesteal*100) + '%');
          if (d.dr) parts.push('减伤 +' + Math.round(d.dr*100) + '%');
          return parts.join(' · ') || '（未叠层）'; })()}</div>` : ''}

      <div class="hb-hr"></div>
      <div class="hb-sec-t">签到进度　${days} / ${need} 天</div>
      <div class="hb-bar"><i style="width:${pct}%"></i></div>
      <div class="hb-note">${owned ? '✅ 已获得此传家宝'
        : lockedBy ? `⛔ 你正在签到【${lockedBy.alias}】，同一时间只能签到一件`
        : (signedToday ? '今天已签到，明天再来' : '每天可签到 1 次，累计 7 天获得')}</div>

      <div class="hb-btns">
        ${owned
          ? `<button class="hb-b ${active ? 'on' : ''}" data-hlt-select="${w.key}" ${active ? 'disabled' : ''}>${active ? '✔ 使用中' : '选择此传家宝'}</button>
             <button class="hb-b danger" data-hlt-drop="1" ${active ? '' : 'disabled'}>放弃此传家宝</button>`
          : `<button class="hb-b" data-hlt-sign="${w.key}" ${(signedToday || lockedBy) ? 'disabled' : ''}>${signedToday ? '今日已签到' : (lockedBy ? '已被其它传家宝锁定' : '签到（' + days + '/' + need + '）')}</button>
             <button class="hb-b danger" data-hlt-cancel="${w.key}" ${days ? '' : 'disabled'}>取消签到进度</button>`}
      </div>
      <div class="hb-foot">获取方式：签到累计 ${need} 天</div>
    </div>

    <div class="hb-flip left" data-hlt-page="${idx-1}" ${idx <= 0 ? 'style="display:none"' : ''}>‹</div>
    <div class="hb-flip right" data-hlt-page="${idx+1}" ${idx >= DATA.HEIRLOOMS.length-1 ? 'style="display:none"' : ''}>›</div>
    <div class="hb-idx">${idx+1} / ${DATA.HEIRLOOMS.length}</div>
  </div>`;
}

function heirloomHtml() {
  hltEnsure(G.player);
  return `<div class="hb-wrap" id="hbWrap">${hltPagesHtml()}</div>`;
}

/* 翻页（带翻书动画 + 音效） */
/* 传家宝面板的所有按钮绑定（翻页后会重建 DOM，必须能重复调用） */
function bindHeirloomControls(body) {
  if (!body || !body.querySelectorAll) return;
  body.querySelectorAll('[data-hlt-page]').forEach(b => b.onclick = () => {
    hltGoPage((+b.dataset.hltPage) - (G._hltPage || 0));
  });
  body.querySelectorAll('[data-hlt-sign]').forEach(b => b.onclick = () => {
    const r = hltSign(G.player, b.dataset.hltSign);
    if (!r.ok) { toast(r.msg); return; }
    if (r.got) {
      if (typeof Sfx !== 'undefined') Sfx.play('shopSuccess');
      bigAnnounce('📜 获得传家宝：' + (hltByKey(b.dataset.hltSign) || {}).name, '#ffd24a');
      toast('🎉 签到满 7 天，获得传家宝！');
    } else {
      if (typeof Sfx !== 'undefined') Sfx.play('loot');
      toast(`签到成功：${r.days} / ${r.need} 天`);
    }
    saveGame();
    openModal('heirloom', '传家宝 · 古籍', heirloomHtml());
  });
  body.querySelectorAll('[data-hlt-cancel]').forEach(b => b.onclick = () => {
    if (!confirm('确定取消签到进度吗？已累计的天数会清零。')) return;
    hltCancelSign(G.player, b.dataset.hltCancel);
    toast('已取消，进度清零');
    saveGame();
    openModal('heirloom', '传家宝 · 古籍', heirloomHtml());
  });
  body.querySelectorAll('[data-hlt-select]').forEach(b => b.onclick = () => {
    const r = hltSelect(G.player, b.dataset.hltSelect);
    if (!r.ok) { toast(r.msg); return; }
    if (typeof Sfx !== 'undefined') Sfx.play('lvlup');
    toast('已装备传家宝');
    saveGame();
    openModal('heirloom', '传家宝 · 古籍', heirloomHtml());
  });
  body.querySelectorAll('[data-hlt-drop]').forEach(b => b.onclick = () => {
    hltDrop(G.player);
    toast('已放回书架（属性加成暂时失效）');
    saveGame();
    openModal('heirloom', '传家宝 · 古籍', heirloomHtml());
  });

}

function hltGoPage(dir) {
  const next = clamp((G._hltPage || 0) + dir, 0, DATA.HEIRLOOMS.length - 1);
  if (next === (G._hltPage || 0)) return;
  G._hltPage = next;
  const wrap = document.getElementById('hbWrap');
  if (typeof Sfx !== 'undefined') Sfx.play('page');
  if (wrap) {
    wrap.classList.remove('flip-fwd', 'flip-back');
    void wrap.offsetWidth;
    wrap.classList.add(dir > 0 ? 'flip-fwd' : 'flip-back');
  }
  // 插图「走进 / 远去」：前进=从远处拉近，后退=推向远处
  G._hltZoom = dir > 0 ? 'zoom-in' : 'zoom-out';
  setTimeout(() => {
    const el = document.getElementById('hbWrap');
    if (!el) { openModal('heirloom', '传家宝 · 古籍', heirloomHtml()); return; }
    el.classList.remove('flip-fwd', 'flip-back');   // 先撤掉动画类，避免重建后重播（抖两下）
    el.innerHTML = hltPagesHtml();
    bindHeirloomControls(el);                        // 重建后必须重绑
  }, 300);
}

/* ---------------- 新手指引 ---------------- */
function tutorialHtml() {
  const p = G.player;
  const t = tutEnsure(p);
  const done = tutDoneCount(p);
  const sel = G._tutSel;

  if (sel) {
    const item = DATA.TUTORIAL.find(x => x.key === sel);
    if (item) {
      const got = !!t.done[item.key];
      const rw = item.reward === 'starter' ? '一套 1 级初始装备 + 小型红药 ×10'
               : item.reward === 'stone' ? '强化石 ×2 + 技能强化券 ×2'
               : '1,000 金币';
      return `<div class="tut-detail">
        <div class="tut-dtitle">${item.title}</div>
        <div class="tut-dbody">${item.body}</div>
        <div class="tut-reward">🎁 完成奖励：<b>${rw}</b></div>
        <div class="tut-dfoot">
          <button class="tut-back" data-tut-back="1">← 返回</button>
          <button data-tut-locate="${item.key}">开启定位演示</button>
          <button class="tut-claim" data-tut-claim="${item.key}" ${got ? 'disabled' : ''}>
            ${got ? '已领取' : '完成并领取'}</button>
        </div>
      </div>`;
    }
  }

  const rows = DATA.TUTORIAL.map((x, i) => `
    <div class="tut-row${t.done[x.key] ? ' done' : ''}" data-tut-open="${x.key}">
      <span class="tut-no">${t.done[x.key] ? '✓' : (i + 1)}</span>
      <span class="tut-name">${x.title}</span>
      <span class="tut-state">${t.done[x.key] ? '已完成' : '未完成'}</span>
    </div>`).join('');

  return `<div class="tut-box">
    <div class="tut-head">
      <span class="tut-ic">🎓</span>
      <div>
        <div class="tut-title">新手指引</div>
        <div class="tut-sub">已完成 <b>${done}</b> / ${DATA.TUTORIAL.length}　点击条目查看详细操作，再开启定位演示</div>
      </div>
    </div>
    <div class="tut-list">${rows}</div>
    ${tutAllDone(p) ? '<div class="tut-all">🎉 全部指引已完成，祝你冒险顺利！</div>' : ''}
  </div>`;
}

/* ---------------- 公告牌 ---------------- */
function noticeHtml() {
  const txt = (G.announceText || '').trim();
  const head = `<div class="nb-head">
    <span class="nb-ic">📜</span>
    <span class="nb-title">公 告 牌</span>
  </div>`;
  const defaultBody = `<div class="nb-sec">
      <div class="nb-h">🎁 在线奖励</div>
      <div class="nb-l">· <b>每小时第 1 分钟</b>（如 19:01、20:01）在线，送 <b>10 抽</b>（100 张 BOSS 击杀凭证）</div>
      <div class="nb-l">· 每晚 <b>20:00</b> 在线，送 <b>100 抽</b></div>
      <div class="nb-l">· 奖励通过<b>邮箱</b>发放，记得领取</div>
    </div>`;
  if (!txt) {
    return `<div class="nb-box">${head}
      <div class="nb-body">${defaultBody}</div>
      <div class="nb-foot">
        <span class="nb-tip">整点在线，福利不断</span>
        <button data-notice-close="1">关闭</button>
      </div></div>`;
  }
  return `<div class="nb-box">${head}
    <div class="nb-body">${txt.replace(/\n/g, '<br>')}
      ${defaultBody}
    </div>
    <div class="nb-foot">
      <span class="nb-tip">每小时第 1 分钟在线送 10 抽 · 每晚 20 点送 100 抽</span>
      <button data-notice-close="1">关闭</button>
    </div></div>`;
}

/* 拉取公告文本（缓存到 G.announceText） */
function noticeLoad() {
  try {
    const x = new XMLHttpRequest();
    x.open('GET', '/api/announce', true);
    x.onreadystatechange = () => {
      if (x.readyState !== 4 || x.status !== 200) return;
      try {
        const d = JSON.parse(x.responseText);
        if (d && d.ok) G.announceText = d.text || '';
      } catch (e) {}
    };
    x.send();
  } catch (e) {}
}

/* ---------------- 材料详情 ---------------- */
function matDetailHtml(key) {
  const p = G.player;
  const M = DATA.MATERIALS[key];
  if (!M) return '<div style="padding:20px">未知材料</div>';
  const cnt = (p.materials && p.materials[key]) || 0;
  const idx = MAT_IDX[key];
  return `<div class="md-box">
    <div class="md-head">
      <span class="ic-sprite" style="width:48px;height:48px;background-size:${48*EQUIP_COUNT}px 48px;background-position:${-idx*48}px 0"></span>
      <div>
        <div class="md-name" style="color:${M.color}">${M.name}</div>
        <div class="md-cnt">持有 <b>${fmt(cnt)}</b> 个 · 自动堆叠</div>
      </div>
    </div>
    <div class="md-sec"><span class="md-tag">作用</span><div>${M.desc || '—'}</div></div>
    <div class="md-sec"><span class="md-tag use">使用</span><div>${M.use || '—'}</div></div>
    <div class="md-actions"><button data-mat-close="1">关闭</button></div>
  </div>`;
}

/* ---------------- 邮箱 ---------------- */
function mailHtml() {
  const p = G.player;
  mailEnsure(p);
  const unclaimed = mailUnreadCount(p);
  const readN = p.mails.filter(m => m.read).length;

  let html = `<div class="mail-head">
    <span>共 <b>${p.mails.length}</b> / ${DATA.MAIL.cap} 封</span>
    <span>待领取 <b style="color:#ffd24a">${unclaimed}</b></span>
    <span style="color:#8f8570">已读 ${readN}</span>
  </div>
  <div class="mail-actions">
    <button data-mail-claim-all ${unclaimed ? '' : 'disabled'}>一键收取附件</button>
    <button data-mail-del-read ${readN ? '' : 'disabled'}>一键删除已读</button>
  </div>`;

  if (!p.mails.length) {
    html += '<div class="mail-empty">📭 暂无邮件</div>';
    return html;
  }

  html += '<div class="mail-list">';
  p.mails.slice(0, 200).forEach(m => {
    const items = (m.items || []).map(it => {
      if (it.type === 'gold') return `<span class="mi gold">金币 ×${fmt(it.amount)}</span>`;
      if (it.type === 'mat') {
        const M = DATA.MATERIALS[it.key] || { name: it.key, color: '#ccc' };
        return `<span class="mi" style="color:${M.color}">${M.name} ×${it.amount}</span>`;
      }
      if (it.type === 'pet') {
        const D = (DATA.BATTLE_PETS || []).find(x => x.key === it.key) || { name: it.key, color: '#c08cff' };
        const own = (G.player && battlePetEnsure(G.player).owned.includes(it.key));
        return `<span class="mi" style="color:${D.color}">🐾 宠物 · ${D.name}${own ? '（已有）' : ''}</span>`;
      }
      return '';
    }).join('');
    html += `<div class="mail-item${m.read ? '' : ' unread'}${m.claimed ? ' claimed' : ''}">
      <div class="mi-top">
        <span class="mi-title">${m.title}</span>
        <span class="mi-state">${m.claimed ? '已领取' : (m.items && m.items.length ? '未领取' : '无附件')}</span>
      </div>
      <div class="mi-body">${m.body || ''}</div>
      ${items ? `<div class="mi-items">${items}</div>` : ''}
      <div class="mi-foot">
        <button data-mail-claim="${m.id}" ${m.claimed || !m.items || !m.items.length ? 'disabled' : ''}>领取</button>
        <button class="del" data-mail-del="${m.id}">删除</button>
      </div>
    </div>`;
  });
  html += '</div>';
  if (p.mails.length > 200) {
    html += `<div style="text-align:center;font-size:11px;color:#8f8570;margin-top:8px">仅显示最近 200 封，更早的请先删除</div>`;
  }
  return html;
}

/* 刷新右上角红点 */
function mailRefreshDot() {
  const el = document.getElementById('mailDot');
  if (!el) return;
  const n = mailUnreadCount(G.player || {});
  if (n > 0) { el.textContent = n > 99 ? '99+' : n; el.classList.remove('hidden'); }
  else el.classList.add('hidden');
}

/* ---------------- 仓库 ---------------- */
function warehouseHtml() {
  const p = G.player;
  whEnsure(p);
  const page = clamp(p.whPage || 0, 0, WH_PAGES - 1);
  const start = page * WH_PAGE_SIZE, end = start + WH_PAGE_SIZE;

  let html = '<div class="warehouse-head">'
    + `<span>仓库容量 <b>${p.warehouse.length} / ${WH_MAX}</b></span>`
    + `<span>背包 ${p.bag.length} / ${BAG_MAX}</span></div>`;

  html += '<div class="bag-pager">';
  for (let i = 0; i < WH_PAGES; i++) {
    html += `<button class="pg-btn ${i === page ? 'on' : ''}" data-wh-page="${i}">${i + 1}</button>`;
  }
  html += `<span class="pg-tip">共 ${WH_PAGES} 页 · 每页 ${WH_PAGE_SIZE} 格</span></div>`;

  html += '<div class="bag-grid wh-grid">';
  for (let i = start; i < end; i++) {
    const it = p.warehouse[i];
    if (!it) { html += '<div class="bag-cell empty">—</div>'; continue; }
    if (it.ringKey) {
      const st = it.star || 0;
      html += `<div class="bag-cell relic-ring has" data-wh-item="${it.id}">
        ${iconTag(it.ringSlot || 'ring_exp', 30)}
        <div class="nm" style="color:#ff8a8a">${DATA.SPECIAL_RINGS[it.ringKey].name}${st ? ' ' + '★'.repeat(st) : ''}</div></div>`;
    } else if (it.type === 'potion') {
      const pi = POTION_IDX[it.key] !== undefined ? POTION_IDX[it.key] : 18;
      html += `<div class="bag-cell potion" data-wh-item="${it.id}">
        <span class="ic-sprite" style="width:34px;height:34px;background-size:${34 * EQUIP_COUNT}px 34px;background-position:${-pi * 34}px 0"></span>
        <div class="nm" style="color:${it.color}">${it.name}</div>
        <span class="stack">×${it.count || 1}</span></div>`;
    } else if (it.type === 'book') {
      html += `<div class="bag-cell book" data-wh-item="${it.id}">
        <div class="ic" style="color:${it.color};font-family:var(--serif)">书</div>
        <div class="nm" style="color:${it.color}">${it.name}</div>
        <span class="stack">×${it.count || 1}</span></div>`;
    } else {
      html += `<div class="bag-cell" data-wh-item="${it.id}">
        ${iconTag(it.slot, 30, it.wtype, it.relicKey)}
        <div class="nm" style="color:${it.color}">${it.name}</div>
        <span class="cp-mini">${Math.round(itemPower(it))}</span></div>`;
    }
  }
  html += '</div>';
  html += '<div style="font-size:11px;color:#8f8570;margin-top:10px">左键点物品 → 详情页里选「移到背包」</div>';
  return html;
}

/* 圣物套装件的右侧详情 */
function relicPieceSideHtml(key) {
  const p = G.player;
  const parts = key.split('_');          // set_cl_slot
  const cl = parts[1], sl = parts[2];
  const S = (DATA.RELIC_SETS || {})[cl];
  if (!S) return relicSideHtml(null);
  const it = relicPieceItem(cl, sl);
  const piece = S.pieces[sl];
  const okLv = p.level >= S.reqLv, okGold = p.gold >= S.price;
  const own = (p.bag || []).some(x => x.relicPieceKey === key) ||
              ['helm','chest','legs','boots','neck','ring','trinket'].some(s2 => p.equip[s2] && p.equip[s2].relicPieceKey === key);
  const pct = ['crit','critDmg','lifesteal','hit','dodge','as','skillDmg','cdr','dr'];
  const lines = Object.keys(piece.stats).map(k => {
    const v = piece.stats[k];
    return `<div class="rl-stat"><span>${AFFIX_NAMES[k] || k}</span><b>+${pct.includes(k) ? (v*100).toFixed(1)+'%' : Math.round(v)}</b></div>`;
  }).join('');

  return `<div class="rl-box side">
    <div class="rl-title" style="color:${S.color}">${it.name}</div>
    <div class="rl-meta">圣物套装 · ${DATA.CLASSES[cl].name} · ${S.full} · 需要 Lv.${S.reqLv}</div>
    <div class="rl-stats">${lines}</div>
    <div class="rl-sets">
      <div class="${'rl-set on'}">3 件：四维 +6%</div>
      <div class="${'rl-set on'}">5 件：最终伤害 +6%</div>
      <div class="${'rl-set on'}">7 件：经验/爆率/吸血 各 +6%</div>
    </div>
    <div class="rl-actions">
      <button data-relic-cancel>取消</button>
      <button data-buy-relic-piece="${cl}|${sl}" ${(okLv && okGold && (p.materials.sourceCrystal || 0) >= 1 && !own) ? '' : 'disabled'}>
        ${own ? '已拥有' : (okLv ? (okGold ? '兑换 ' + fmt(S.price) + ' 金' : '金币不足') : '等级不足 Lv.' + S.reqLv)}
      </button>
    </div>
    <div class="msh-gold">当前金币 <b>${fmt(p.gold)}</b></div>
  </div>`;
}

/* 购买圣物套装件 */
function buyRelicPiece(cl, sl) {
  const p = G.player;
  const S = DATA.RELIC_SETS[cl];
  if (!S || !S.pieces[sl]) return;
  if (p.level < S.reqLv) { toast(`等级不足：需要 Lv.${S.reqLv}`); return; }
  if (p.gold < S.price) { toast('金币不足'); return; }
  if ((p.materials.sourceCrystal || 0) < 1) { toast('源晶不足（圣物需要 1 个源晶）'); return; }
  const it = relicPieceItem(cl, sl);
  if ((p.bag || []).some(x => x.relicPieceKey === it.relicPieceKey) ||
      ['helm','chest','legs','boots','neck','ring','trinket'].some(s2 => p.equip[s2] && p.equip[s2].relicPieceKey === it.relicPieceKey)) {
    toast('这件圣物你已经拥有了'); return;
  }
  p.gold -= S.price;
  p.materials.sourceCrystal -= 1;
  it.id = 'rp' + Math.random().toString(36).slice(2, 8);
  if (!addToBag(p, it)) { p.gold += S.price; p.materials.sourceCrystal += 1; toast('背包已满'); return; }
  if (typeof Sfx !== 'undefined') Sfx.play('shopSuccess');
  toast(`兑换成功：${it.name}`);
  logMsg(`🎖 获得圣物 ${it.name}`, 'level');
  G._relicSel = null;
  saveGame();
  openModal('merchant', '商人 · 赵帅帅', merchantHtml());
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

  const inWarehouse = (p.warehouse || []).some(x => x.id === it.id);
  const isRingItem = !!it.ringKey;
  const enhBtn = isRingItem
    ? `<button data-idt-ringup="1">升星</button>`
    : `<button data-idt-enh="${it.id}">强化</button>`;
  const btns =
    enhBtn +
    `<button class="primary" data-idt-equip="${it.id}" ${(equipped || locked) ? 'disabled' : ''}>` +
      (locked ? '需要 Lv.' + it.reqLv : '穿戴') + `</button>` +
    `<button class="danger" data-idt-unequip="${equippedSlot || it.slot}" ${equipped ? '' : 'disabled'}>卸下</button>` +
    ((equipped || it.relicKey || it.relicPieceKey) ? '' : `<button class="danger" data-idt-sell="${it.id}">出售</button>`) +
    (inWarehouse
      ? `<button data-idt-tobag="${it.id}">移到背包</button>`
      : `<button data-idt-towh="${it.id}">放入仓库</button>`);

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
  if ((p.materials.sourceCrystal || 0) < 1) { toast('源晶不足（圣物需要 1 个源晶）'); return; }
  const own = (p.bag || []).some(x => x.relicKey === key) ||
              (p.equip.weapon && p.equip.weapon.relicKey === key);
  if (own) { toast('这件圣物你已经拥有了'); return; }

  p.gold -= w.price;
  p.materials.sourceCrystal -= 1;
  const item = {
    id: 'rl' + Math.random().toString(36).slice(2, 8),
    slot: 'weapon', type: 'equip', quality: 'relic', qKey: 'relic',
    name: w.name, color: w.color, ilvl: w.reqLv, reqLv: w.reqLv,
    wtype: w.wtype, relicKey: w.key, relicPct: w.relicPct,
    stats: Object.assign({}, w.stats), enh: 0, locked: true
  };
  const ok = addToBag(p, item);
  if (!ok) { p.gold += w.price; p.materials.sourceCrystal += 1; toast('背包已满'); return; }
  if (typeof Sfx !== 'undefined') Sfx.play('shopSuccess');
  toast(`兑换成功：${w.name}`);
  logMsg(`🎖 获得圣物 ${w.name}`, 'level');
  G._relicSel = null;
  saveGame();
  openModal('merchant', '商人 · 赵帅帅', merchantHtml());
}

/* ---------------- 调试面板 ---------------- */
/* ---------------- 调试入口（两个大按钮）---------------- */
function debugHtml() {
  const view = G._dbgView || 'menu';
  if (view === 'cfg') return cfgPanelHtml();
  if (view === 'toggles') {
    return `<div class="dbg-return"><button data-dbg-back="1">← 返回入口</button></div>`
      + debugTogglesHtml().replace(/^<div style="font-size:11.5px/, '<div style="font-size:11.5px');
  }
  return `<div class="dbg-menu single">
    <div class="dbg-card" data-dbg-go="toggles">
      <div class="dc-ic">🛠</div>
      <div class="dc-name">调试开关</div>
      <div class="dc-sub">刷怪 / 攻速 / 免CD / 无敌 / 无限蓝<br>发放材料 / 发放特戒</div>
    </div>
  </div>
  <div style="font-size:11px;color:#8f8570;margin-top:12px;text-align:center">
    调试开关只影响当前会话，刷新页面即恢复
  </div>`;
}

/* ---------------- 数值修改面板 ---------------- */
function cfgPanelHtml() {
  if (typeof CFG_DEFS === 'undefined') return '<div style="padding:20px">配置模块未加载</div>';
  const groups = {};
  CFG_DEFS.forEach(d => { (groups[d.g] = groups[d.g] || []).push(d); });

  let html = `<div class="dbg-return"><button data-dbg-back="1">← 返回入口</button></div>
    <div class="cfg-tip">改完点「保存数值」立即生效并写入存档；
      点「导出定制版 HTML」会下载一个已烘焙这些数值的新文件，可直接发给朋友。</div>`;

  Object.keys(groups).forEach(g => {
    html += `<div class="cfg-group"><div class="cfg-gtitle">${g}</div>`;
    groups[g].forEach(d => {
      const v = d.get();
      html += `<div class="cfg-row">
        <span class="cfg-label">${d.label}</span>
        <input class="cfg-input" type="number" data-cfg="${d.id}"
          value="${v}" min="${d.min}" max="${d.max}" step="${d.step}">
        <span class="cfg-hint">${d.fmt(v)}</span>
      </div>`;
    });
    html += '</div>';
  });

  html += `<div class="cfg-actions">
    <button class="cfg-btn primary" data-cfg-save="1">保存数值</button>
    <button class="cfg-btn" data-cfg-reset="1">恢复默认</button>
    <button class="cfg-btn gold" data-cfg-export="1">导出定制版 HTML</button>
  </div>`;
  return html;
}

function debugTogglesHtml() {
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
      <div class="nr-name" style="color:#ffd24a">发放强化材料</div>
      <div class="nr-info">强化石 ×100 + 强化保护券 ×100</div></div>
      <button data-dbg-mats="1" style="border-color:#d4af37;color:#ffd24a">领取</button></div>

    <div class="npc-row" style="display:block">
      <div class="nr-name" style="color:#b45cff;margin-bottom:6px">发放整套装备（4 职业 × 紫/红）</div>
      <div class="dbg-gear-grid">
        ${[['warrior','剑圣'],['mage','法师'],['archer','祭司'],['assassin','猎手']].map(([cl,nm]) => `
          <button class="dbg-gear purple" data-dbg-gear="${cl}|epic">${nm}·紫</button>
          <button class="dbg-gear red" data-dbg-gear="${cl}|mythic">${nm}·红</button>`).join('')}
      </div>
    </div>

    <div class="npc-row" style="display:block">
      <div class="nr-name" style="color:#ffd24a;margin-bottom:6px">发放传家宝（9 件）</div>
      <div class="dbg-hlt-grid">
        ${DATA.HEIRLOOMS.map(w => {
          const own = (G.player.heirloom && (G.player.heirloom.owned || []).includes(w.key));
          return `<button class="dbg-hlt ${own ? 'own' : ''}" data-dbg-hlt="${w.key}"
            style="color:${w.color};border-color:${own ? '#3a6b32' : w.color}">
            ${w.alias}${own ? ' ✓' : ''}</button>`;
        }).join('')}
      </div>
    </div>

    <div class="npc-row"><div>
      <div class="nr-name" style="color:#ff9a3c">发放 BOSS击杀凭证 ×1000</div>
      <div class="nr-info">用于抽奖转盘（10 抽/次，100 十连）</div></div>
      <button data-dbg-token="1" style="border-color:#ff9a3c;color:#ffc78a">领取</button></div>

    <div class="npc-row"><div>
      <div class="nr-name" style="color:#ffd24a">发放金币 550k</div>
      <div class="nr-info">直接加 550,000 金币</div></div>
      <button data-dbg-gold="1" style="border-color:#d4af37;color:#ffd24a">领取</button></div>

    <div class="npc-row"><div>
      <div class="nr-name" style="color:#3fd45a">发放技能强化材料 ×100</div>
      <div class="nr-info">技能强化券 ×100 + 技能突破券 ×100</div></div>
      <button data-dbg-skillmat="1" style="border-color:#3fd45a;color:#b9ffb0">领取</button></div>

    <div class="npc-row" style="display:block">
      <div class="nr-name" style="color:#c08cff;margin-bottom:6px">发放宠物（发到邮箱，去邮箱领取）</div>
      <div class="dbg-gear-grid">
        ${DATA.BATTLE_PETS.map(pt => `
          <button class="dbg-gear" data-dbg-pet="${pt.key}"
            style="color:${pt.color};border-color:${pt.color}88">${pt.name}</button>`).join('')}
      </div>
    </div>

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
        <button data-new-char style="border-color:#8a6d3f;color:#ffd98a">创建角色</button></div>`;
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

/* 进图确认 */
function doEnterRoom(room, diff) {
  G.diff = diff;
  closeModal();
  enterRoom(room);
  toast(`进入 ${DATA.ROOMS[room].name}（${DATA.DIFFICULTY[diff].name}）`);
}

/* 等级警告 */
function warnHtml(room, diff) {
  const p = G.player, r = getRoom(room) || DATA.ROOMS[room], d = DATA.DIFFICULTY[diff];
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
  const rooms = DATA.ROOMS.filter(r => !r.daily && r.id <= 12);
  const total = rooms.reduce((n, r) => n + (codexBonusState(p, r).lv || 0), 0);
  const done = rooms.reduce((n, r) => n + (codexBonusState(p, r).lv ? 1 : 0), 0);
  const allLv = rooms.reduce((n, r) => n + codexBonusState(p, r).counts.filter(x => x > 0).length, 0);
  const allNeed = rooms.length * DATA.CODEX_SLOTS.length;

  const sel = (G._codexRoom !== undefined && G._codexRoom !== null) ? +G._codexRoom : (rooms[0] && rooms[0].id);
  let html = `<div class="cx-top">
    <div class="cx-title">按地图收集 · 集齐即可升级</div>
    <div class="cx-sum">已激活 <b>${done}</b>/${rooms.length} 本　部位收集 <b>${allLv}</b>/${allNeed}</div>
  </div>
  <div class="cx-wrap">
    <div class="cx-rooms">`;
  rooms.forEach(r => {
    const st = codexState(p, r);
    const on = r.id === sel;
    html += `<button class="cx-room${on ? ' on' : ''}" data-codex-room="${r.id}">
      <span class="cxr-lv">${r.lv}-${r.lv + 9}级</span>
      <span class="cxr-nm" style="color:${on ? '#ffe9a8' : '#b8ad93'}">${r.name}</span>
      <span class="cxr-lv2">${st.lv ? 'Lv.' + st.lv : st.got + '/6'}</span>
    </button>`;
  });
  html += `</div><div class="cx-detail">`;

  const room = getRoom(sel) || rooms[0];
  if (!room) return '<div>暂无可收集的图鉴</div>';
  const st = codexState(p, room);
  const cxB = (typeof equipCodexBonus === 'function') ? equipCodexBonus(p) : { hpPct:0, armorPct:0, atkPct:0, all:0 };
  const cost = st.maxed ? 0 : DATA.codexGold(room, st.lv);
  const needTotal = st.maxed ? 0 : st.next.sets * DATA.CODEX_SLOTS.length;
  const slotOk = st.maxed ? false : st.counts.every(n => n >= st.next.sets);
  const canUp = !st.maxed && st.got >= 6 && st.total >= needTotal && slotOk && (p.gold || 0) >= cost;

  html += `<div class="cxd-head">
    <div>
      <div class="cxd-name">${room.name} · ${room.lv}-${room.lv + 9} 级装备</div>
      <div class="cxd-sub">打怪获得即记录，分解/丢弃不影响　已集齐 <b>${st.got}</b>/6 部位　累计 <b>${st.total}</b> 件</div>
    </div>
    <div class="cxd-lv">Lv.<b>${st.lv}</b><span>/${DATA.CODEX_STEPS.length}</span></div>
  </div>
  <div class="cxd-slots">`;
  DATA.CODEX_SLOTS.forEach((sl, i) => {
    const n = st.counts[i];
    html += `<div class="cxd-slot${n ? ' got' : ''}">
      ${iconTag(sl, 40)}
      <div class="cxds-nm">${DATA.SLOTS[sl].name}</div>
      <div class="cxds-cnt" style="color:${n ? '#5fdc4a' : '#6b6558'}">${n ? '×' + n : '未获得'}</div>
    </div>`;
  });
  html += `</div>`;

  html += `<div class="cxd-steps">`;
  DATA.CODEX_STEPS.forEach((sp, i) => {
    const on = st.lv > i;
    const b = sp.bonus;
    html += `<div class="cxd-step${on ? ' on' : ''}">
      <div class="cxs-t">${sp.sets} 套</div>
      <div class="cxs-b">生命 +${(b.hpPct * 100).toFixed(1)}%　护甲 +${(b.armorPct * 100).toFixed(0)}%<br>攻击 +${(b.atkPct * 100).toFixed(0)}%　三维 +${(b.allPct * 100).toFixed(1)}%</div>
      <div class="cxs-s">${on ? '已激活' : '需 ' + sp.sets * 6 + ' 件'}</div>
    </div>`;
  });
  html += `</div>`;

  html += `<div class="cxd-foot">
    <div class="cxd-cost">${st.maxed ? '该图鉴已满级' : `升级消耗 <b>${cost.toLocaleString()}</b> 金币　当前 <b>${(p.gold || 0).toLocaleString()}</b>`}</div>
    <button class="cxd-up${canUp ? '' : ' off'}" data-codex-up="${room.id}" ${canUp ? '' : 'disabled'}>
      ${st.maxed ? '已满级' : (st.lv === 0 ? '激 活' : '升 级')}
    </button>
  </div>
  <div class="cxd-tip">全套图鉴当前加成：生命 +${(cxB.hpPct * 100).toFixed(1)}%　护甲 +${(cxB.armorPct * 100).toFixed(1)}%　攻击 +${(cxB.atkPct * 100).toFixed(1)}%　三维 +${(cxB.allPct * 100).toFixed(1)}%</div>
  </div></div>`;
  return html;
}

/* 图鉴的轻量状态（给列表用） */
function codexBonusState(p, room) {
  const st = codexState(p, room);
  return { lv: st.lv, counts: st.counts, got: st.got, total: st.total };
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
  const pNeed0 = DATA.ENHANCE.protectNeed(lv);
  const pHave0 = p.materials.protect || 0;
  const canProtect = pHave0 >= pNeed0;
  const useP = !!G._enhProtect && canProtect;
  const baseRate = Math.round(DATA.ENHANCE.rate(lv) * 100);
  const rate = useP ? Math.round(DATA.ENHANCE.rateWithProtect(lv) * 100) : baseRate;
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
    const rateCls = rate >= 100 ? 'ok' : rate >= 70 ? 'warn' : 'bad';
    html += `<div class="enh-rate-row">
      <span>成功率</span>
      <b class="${rateCls}">${rate}%</b>
      ${useP ? `<i class="rate-from">原 ${baseRate}%</i>` : ''}
    </div>`;
    html += `<div class="enh-line"><span>属性提升</span><b>+${delta}%</b></div>`;
    html += `<div class="enh-line"><span>消耗金币</span><b class="${p.gold >= gold ? '' : 'bad'}">${fmt(gold)} / ${fmt(p.gold)}</b></div>`;
    html += `<div class="enh-line"><span>消耗强化石</span><b class="${(p.materials.stone||0) >= stone ? '' : 'bad'}">${stone} / ${p.materials.stone||0}</b></div>`;

    // 保护券勾选框
    html += `<label class="enh-protect ${canProtect ? '' : 'off'}">
      <input type="checkbox" data-enh-protect="1" ${useP ? 'checked' : ''} ${canProtect ? '' : 'disabled'}>
      <span class="ep-box"></span>
      <span class="ep-txt">使用强化保护券</span>
      <span class="ep-need ${canProtect ? 'ok' : 'bad'}">需 ${pNeed0} 张 · 持有 ${pHave0}</span>
    </label>`;
    if (!canProtect && pHave0 < pNeed0) {
      html += `<div class="enh-warn">保护券不足，再攒 ${pNeed0 - pHave0} 张即可启用（成功率翻倍 + 免掉级）</div>`;
    }

    html += '<div class="enh-btns">';
    html += `<button class="big-btn primary" data-enh-do="${it.id}" data-protect="${useP ? 1 : 0}">强 化</button>`;
    html += '<button class="big-btn" data-enh-back="1">返回</button>';
    html += '</div>';
  }
  return html;
}

/* ---------------- 任务官 ---------------- *//* ---------------- 任务官 ---------------- */
function questMatText(q) {
  const rw = q.mats || DATA.QUEST_MATS;
  return Object.keys(rw).filter(k => rw[k] > 0).map(k => `${DATA.MATERIALS[k].name}${rw[k]}`).join(' ');
}

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
        <div class="nr-info" style="color:#ffd98a">${q.exp} 经验 · ${q.gold} 金 · 打造材料（${questMatText(q)}）</div>
        </div>
        <div class="q-btns">
          <button class="q-nav" data-quest-nav="${q.room}" title="打开【${DATA.ROOMS[q.room].name}】地图">🧭 导航</button>
          ${done
            ? `<button data-quest-claim="${q.id}" style="border-color:#6b8a4a;color:#b9ffb0">领取</button>`
            : `<button data-quest-drop="${q.id}" style="border-color:#6b2b3b;color:#ff8a9a">放弃</button>`}
        </div>
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
      <div class="nr-info" style="color:#ffd98a">${q.exp} 经验 · ${q.gold} 金 · 打造材料（${questMatText(q)}）</div>
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
    const _r = DATA.ROOMS[q.room];
    const _ok = (_r && _r.zone === 'holy') ? (p.level >= (_r.reqLv || 1)) : p.unlocked.includes(q.room);
    if (!_ok) return;
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
  const rw = q.mats || DATA.QUEST_MATS;
  for (const k in rw) p.materials[k] = (p.materials[k] || 0) + rw[k];
  p.questDone++;
  p.quests.splice(i, 1);
  toast(`任务完成：+${q.exp} 经验 +${q.gold} 金 + 打造材料（铁${rw.iron} 秘银${rw.mithril} 龙鳞${rw.scale} 碎片${rw.shard}）`);
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
  // 打造出的装备一定能穿：需求等级不超过当前等级
  it.reqLv = Math.max(1, Math.min(it.reqLv || 1, p.level));
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
    const _r = DATA.ROOMS[i];
    const _holy = _r && _r.zone === 'holy';
    if (_holy ? (G.player.level < (_r.reqLv || 1)) : !G.player.unlocked.includes(i)) {
      toast(_holy ? `需要 Lv.${_r.reqLv}` : '尚未解锁'); return;
    }
    openModal('map', '选择难度 · ' + DATA.ROOMS[i].name, diffPickHtml(i));
  });

  body.querySelectorAll('[data-pick-diff]').forEach(b => b.onclick = () => {
    const diff = b.dataset.pickDiff, room = +b.dataset.room;
    const _rr = DATA.ROOMS[room];
    const _holy2 = _rr && _rr.zone === 'holy';
    if (_holy2 ? (G.player.level < (_rr.reqLv || 1)) : !G.player.unlocked.includes(room)) {
      toast(_holy2 ? `需要 Lv.${_rr.reqLv}` : '尚未解锁'); return;
    }
    const p = G.player;
    if (!diffUnlocked(p, diff)) { toast('🔒 ' + diffLockText(p, diff)); return; }
    const r = DATA.ROOMS[room];
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
    const lv = p.skills[k] || 0;
    if (lv < 1) {                       // 尚未学习 → 先学会
      const cost = skillLvCost(1);
      if (p.gold < cost) { toast('金币不足'); return; }
      p.gold -= cost;
      learnSkill(p, k);
      toast(`学会 ${DATA.SKILLS[k].name}`);
    } else {
      const r = upgradeSkillGold(p, k);
      if (!r.ok) { toast(r.msg); return; }
      toast(`${DATA.SKILLS[k].name} 升级到 Lv.${r.lv}`);
    }
    saveGame();
    openModal('exchange', '抽奖专员 · 李准', exchangeHtml());
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
      saveGame();
      openModal('bag', '背包 · 装备', bagHtml());
    };
  });

  body.querySelectorAll('[data-book]').forEach(el => el.onclick = () => {
    const p = G.player;
    const stat = el.dataset.book;
    // 一键全部使用（背包里同属性的书会合并成一本，count 即总本数）
    const bk = p.bag.find(x => x.type === 'book' && x.stat === stat);
    const total = bk ? (bk.count || 1) : 0;
    if (!total) return;
    const n = useBook(p, stat, total);
    if (!n) return;
    const nm = { str:'力量', agi:'敏捷', int:'智力', vit:'体质' }[stat] || stat;
    toast(`${DATA.BOOKS[stat].name} ×${n} 全部使用：${nm} +${n}（永久）`);
    logMsg(`永久属性：${nm} +${n}（${DATA.BOOKS[stat].name} ×${n}）`, 'level');
    if (typeof Sfx !== 'undefined') Sfx.play('lvlup');
    floatText(p.x, p.y - 40, `${nm} +${n}`, DATA.BOOKS[stat].color, 20);
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
  body.querySelectorAll('[data-enh-protect]').forEach(cb => cb.onchange = () => {
    G._enhProtect = cb.checked;
    const id = (body.querySelector('[data-enh-do]') || {}).dataset?.enhDo;
    if (id) openModal('forge', '强化 · 铸造台', enhanceItemHtml(id));
  });
  body.querySelectorAll('[data-ring-pick]').forEach(el => el.onclick = () => {
    const k = el.dataset.ringPick;
    
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
      openModal('mat', M.name, matDetailHtml(k));
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
  body.querySelectorAll('[data-idt-towh]').forEach(el => el.onclick = () => {
    const it = findItem(el.dataset.idtTowh); if (!it) return;
    const r = toWarehouse(G.player, it);
    if (!r.ok) { toast(r.msg); return; }
    toast('已放入仓库：' + it.name);
    saveGame(); closeModal();
  });
  body.querySelectorAll('[data-idt-tobag]').forEach(el => el.onclick = () => {
    const it = findItem(el.dataset.idtToBag); if (!it) return;
    const r = toBag(G.player, it);
    if (!r.ok) { toast(r.msg); return; }
    toast('已移到背包：' + it.name);
    saveGame(); closeModal();
  });
  body.querySelectorAll('[data-claim-ring]').forEach(el => el.onclick = () => {
    const r = claimFirstKillRing(G.player, el.dataset.claimRing);
    if (!r.ok) { toast(r.msg); return; }
    if (typeof Sfx !== 'undefined') Sfx.play('success');
    toast(`领取成功：${r.ring.name}（已放入背包）`);
    logMsg(`🎖 领取首杀奖励 ${r.ring.name}`, 'level');
    bigAnnounce(`💍 ${r.ring.name}`, r.ring.color || '#ff3b3b');
    saveGame();
    openModal('codexEquip', '装备图鉴', codexEquipHtml());
  });
  body.querySelectorAll('[data-wh-item]').forEach(el => {
    const p = G.player;
    whEnsure(p);
    const it = p.warehouse.find(x => x.id === el.dataset.whItem);
    if (!it) return;
    el.onmouseenter = e => showTooltip(it, e.clientX, e.clientY);
    el.onmousemove = e => moveTooltip(e.clientX, e.clientY);
    el.onmouseleave = hideTooltip;
    el.onclick = () => {
      hideTooltip();
      openModal('item', it.name, itemDetailHtml(it.id, 'wh'));
    };
  });
  body.querySelectorAll('[data-wh-page]').forEach(el => el.onclick = () => {
    G.player.whPage = +el.dataset.whPage;
    openModal('warehouse', '仓库 · 大木箱', warehouseHtml());
  });
  body.querySelectorAll('[data-idt-close]').forEach(el => el.onclick = () => closeModal());
  const sideEl = document.getElementById('mSide');
  if (sideEl) {
    sideEl.addEventListener('click', ev => {
      const buy = ev.target.closest('[data-buy-relic]');
      if (buy) { buyRelic(buy.dataset.buyRelic); return; }
      const buyP = ev.target.closest('[data-buy-relic-piece]');
      if (buyP) {
        const [c0, s0] = buyP.dataset.buyRelicPiece.split('|');
        buyRelicPiece(c0, s0);
        return;
      }
      if (ev.target.closest('[data-relic-cancel]')) {
        G._relicSel = null;
        openModal('merchant', '商人 · 赵帅帅', merchantHtml());
      }
    });
  }
  body.querySelectorAll('[data-relic]').forEach(el => el.onclick = () => {
    G._relicSel = (G._relicSel === el.dataset.relic) ? null : el.dataset.relic;
    openModal('merchant', '商人 · 赵帅帅', merchantHtml());
  });
  body.querySelectorAll('[data-relic-cancel]').forEach(el => el.onclick = () => {
    G._relicSel = null;
    openModal('merchant', '商人 · 赵帅帅', merchantHtml());
  });
  body.querySelectorAll('[data-buy-relic]').forEach(el => el.onclick = () => {
    buyRelic(el.dataset.buyRelic);
  });
  body.querySelectorAll('[data-lot-draw]').forEach(b => b.onclick = () => {
    const n = +b.dataset.lotDraw;
    const got = doLottery(n);
    if (!got) return;

    // 圆盘旋转：让中奖扇区停在正上方指针处
    const L = DATA.LOTTERY, seg = 360 / L.prizes.length;
    const idx = Math.max(0, L.prizes.findIndex(z => z.id === got[0].id));
    const target = 360 * 6 - (idx * seg + seg / 2);
    const DUR = 2200, EASE = 'cubic-bezier(.16,.84,.28,1)';
    const wheel = body.querySelector('#lotWheel');
    if (wheel) {
      wheel.style.transition = `transform ${DUR}ms ${EASE}`;
      wheel.style.transform = `rotate(${target}deg)`;
      // 文字反向等速旋转 → 屏幕上始终保持正向
      wheel.querySelectorAll('.wh-txt').forEach(el => {
        const a = parseFloat(el.dataset.ang) || 0;
        el.style.transition = 'none';
        if (el.animate) {
          el.animate(
            [{ transform: `rotate(${-a}deg)` },
             { transform: `rotate(${-a - target}deg)` }],
            { duration: DUR, easing: EASE, fill: 'forwards' }
          );
        } else {
          el.style.transform = `rotate(${-a - target}deg)`;
        }
      });
    }

    const box = body.querySelector('#lotResult');
    const render = () => {
      if (box) {
        const isBig = nm => nm.indexOf('圣物') >= 0 || nm.indexOf('×100') >= 0;
        const rows = got.map(g =>
          `<div class="lr-row ${isBig(g.name) ? 'big' : ''}" style="color:${g.color}">${g.ok ? '🎁' : '⚠'} ${g.name}</div>`
        ).join('');
        box.innerHTML = `<div class="lr-title">本次获得（${got.length} 项）</div>${rows}`;
        box.classList.add('got');
      }
      const best = got.find(g => g.name.indexOf('圣物') >= 0);
      if (best) bigAnnounce('🎉 抽中圣物：' + best.name, '#ffd24a');
      if (typeof Sfx !== 'undefined') Sfx.play('success');   // 转盘出货
      if (got.length > 1) {
        // 十连：竖排逐行展示
        toastRows(`本次获得 ${got.length} 项`, got.map(g => ({
          text: (g.ok ? '🎁 ' : '⚠ ') + g.name,
          color: g.color,
          big: g.name.indexOf('圣物') >= 0 || g.name.indexOf('×100') >= 0
        })), 4600);
      } else {
        const g = got[0];
        toast(`${g.ok ? '🎁' : '⚠'} ${g.name}`);
      }
      const tokEl = body.querySelector('.lot-tok b');
      if (tokEl) tokEl.textContent = fmt(G.player.materials.bossToken || 0);
      const tok = G.player.materials.bossToken || 0;
      body.querySelectorAll('[data-lot-draw]').forEach(x => {
        x.disabled = tok < (+x.dataset.lotDraw === 10 ? L.cost10 : L.cost1);
      });
      saveGame();
    };

    if (box) box.innerHTML = '<div class="lr-hint">转盘旋转中…</div>';
    setTimeout(render, 2300);
  });
  /* ---------------- 传家宝 ---------------- */
  /* ---- 角色面板：特戒 / 传家宝 切换 ---- */
  body.querySelectorAll('[data-char-tab]').forEach(b => b.onclick = () => {
    G._charTab = b.dataset.charTab;
    openModal('char', '角色', charHtml());
  });
  body.querySelectorAll('[data-hlt-open]').forEach(b => b.onclick = () => {
    const k = b.dataset.hltOpen;
    if (k) openModal('hltDetail', '传家宝 · 详情', hltDetailHtml(k));
    else openModal('hltPick', '选择传家宝', hltPickHtml());
  });
  body.querySelectorAll('[data-hlt-pick]').forEach(b => b.onclick = () => {
    openModal('hltPick', '选择传家宝', hltPickHtml());
  });
  body.querySelectorAll('[data-hlt-equip]').forEach(b => b.onclick = () => {
    const r = hltSelect(G.player, b.dataset.hltEquip);
    if (!r.ok) { toast(r.msg); return; }
    if (typeof Sfx !== 'undefined') Sfx.play('lvlup');
    toast('已装备传家宝');
    saveGame();
    openModal('char', '角色', charHtml());
  });
  body.querySelectorAll('[data-hlt-unequip]').forEach(b => b.onclick = () => {
    hltDrop(G.player);
    toast('已卸下传家宝');
    saveGame();
    openModal('char', '角色', charHtml());
  });
  body.querySelectorAll('[data-hlt-cancel-pick]').forEach(b => b.onclick = () => {
    openModal('char', '角色', charHtml());
  });

  bindHeirloomControls(body);

  body.querySelectorAll('[data-quest-nav]').forEach(b => b.onclick = () => {
    const rid = +b.dataset.questNav;
    const p = G.player, r = DATA.ROOMS[rid];
    if (!r) return;
    if (!p.unlocked.includes(rid)) { toast(`【${r.name}】尚未解锁，先通关前面的副本`); return; }
    if (p.level < (r.lv || 1)) { toast(`等级不足：进入【${r.name}】需要 Lv.${r.lv}`); return; }
    openModal('map', `导航 · ${r.name}`, diffPickHtml(rid));
  });
  body.querySelectorAll('[data-tut-open]').forEach(b => b.onclick = () => {
    G._tutSel = b.dataset.tutOpen;
    openModal('tutorial', '新手指引', tutorialHtml());
  });
  body.querySelectorAll('[data-tut-locate]').forEach(b => b.onclick = () => {
    replayNewbieGuide(b.dataset.tutLocate);
  });
  body.querySelectorAll('[data-tut-back]').forEach(b => b.onclick = () => {
    G._tutSel = null;
    openModal('tutorial', '新手指引', tutorialHtml());
  });
  body.querySelectorAll('[data-tut-claim]').forEach(b => b.onclick = () => {
    const r = tutComplete(G.player, b.dataset.tutClaim);
    if (!r.ok) { toast(r.msg); return; }
    if (typeof Sfx !== 'undefined') Sfx.play('lvlup');
    toast(`✅ ${r.title} 完成：${r.msg}`);
    logMsg(`🎓 新手指引「${r.title}」已完成`, 'level');
    saveGame();
    G._tutSel = null;
    openModal('tutorial', '新手指引', tutorialHtml());
  });
  body.querySelectorAll('[data-notice-close]').forEach(b => b.onclick = () => {
    closeModal();
    if (typeof resumeGuideAfterNotice === 'function') resumeGuideAfterNotice();
  });
  body.querySelectorAll('[data-mat-close]').forEach(b => b.onclick = () => closeModal());
  body.querySelectorAll('[data-mail-claim-all]').forEach(b => b.onclick = () => {
    const r = mailClaimAll(G.player);
    if (typeof Sfx !== 'undefined') Sfx.play('loot');
    toast(r.mails ? `收取 ${r.mails} 封邮件，共 ${r.items} 项附件` : '没有可领取的附件');
    saveGame(); mailRefreshDot();
    openModal('mail', '邮箱', mailHtml());
  });
  body.querySelectorAll('[data-mail-del-read]').forEach(b => b.onclick = () => {
    const n = mailDeleteRead(G.player);
    toast(`已删除 ${n} 封已读邮件`);
    saveGame(); mailRefreshDot();
    openModal('mail', '邮箱', mailHtml());
  });
  body.querySelectorAll('[data-mail-claim]').forEach(b => b.onclick = () => {
    const id = +b.dataset.mailClaim;
    const m = (G.player.mails || []).find(x => x.id === id);
    if (!m) return;
    mailClaimOne(G.player, m);
    toast('已领取：' + m.title);
    saveGame(); mailRefreshDot();
    openModal('mail', '邮箱', mailHtml());
  });
  body.querySelectorAll('[data-mail-del]').forEach(b => b.onclick = () => {
    mailDelete(G.player, +b.dataset.mailDel);
    saveGame(); mailRefreshDot();
    openModal('mail', '邮箱', mailHtml());
  });
function mountSound(key) {
  const sound = key === 'spectralwolf' ? 'wolfHowl'
    : (key === 'spectralhorse' || key === 'pvpram') ? 'horseNeigh' : 'mount';
  if (typeof Sfx !== 'undefined') Sfx.play(sound);
}

  /* ---- 驯兽师 ---- */
  body.querySelectorAll('[data-beast]').forEach(b => b.onclick = () => {
    const k = b.dataset.beast;
    if (k === 'mount') openModal('mount', '坐骑 · 驯兽师', mountHtml());
    else if (k === 'aura') openModal('pet', '光环 · 驯兽师', petHtml());
    else openModal('bpet', '宠物 · 驯兽师', battlePetHtml());
  });
  body.querySelectorAll('[data-bpet-recruit]').forEach(b => b.onclick = () => {
    const r = battlePetRecruit(G.player, b.dataset.bpetRecruit);
    if (!r.ok) { toast(r.msg); return; }
    const def = battlePetByKey(r.key);
    if (typeof Sfx !== 'undefined') Sfx.play('petSummon');
    if (typeof bigAnnounce === 'function') bigAnnounce('🐾 招募成功 · ' + def.name, def.color);
    toast(`招募成功：${def.name}`);
    saveGame(); updatePetHud();
    openModal('bpet', '宠物 · 驯兽师', battlePetHtml());
  });
  body.querySelectorAll('[data-bpet-use]').forEach(b => b.onclick = () => {
    const k = b.dataset.bpetUse;
    const r = battlePetToggle(G.player, k);
    if (!r.ok) { toast(r.msg); return; }
    const def = battlePetByKey(k);
    if (typeof Sfx !== 'undefined') Sfx.play(r.active ? (def.summonSound || 'petSummon') : 'petOrder');
    toast(r.active ? `🐾 ${def.name} 已出战` : `${def.name} 已收回`);
    saveGame(); updatePetHud();
    openModal('bpet', '宠物 · 驯兽师', battlePetHtml());
  });
  body.querySelectorAll('[data-mount-paste]').forEach(b => b.onclick = async () => {
    const inp = document.getElementById('mountCodeInput');
    if (!inp) return;
    try {
      let txt = '';
      if (navigator.clipboard && navigator.clipboard.readText) txt = await navigator.clipboard.readText();
      if (!txt) { inp.focus(); toast('请长按输入框手动粘贴'); return; }
      inp.value = String(txt).trim().toUpperCase();
      toast('已粘贴兑换码');
    } catch (e) {
      inp.focus();
      toast('浏览器不允许读取剪贴板，请长按输入框粘贴');
    }
  });
  body.querySelectorAll('[data-mount-redeem]').forEach(b => b.onclick = () => {
    const inp = document.getElementById('mountCodeInput');
    const r = redeemMountCode(G.player, inp ? inp.value : '');
    if (!r.ok) { toast(r.msg); return; }
    recalcStats(G.player); saveGame();
    if (r.isNew && typeof Sfx !== 'undefined') Sfx.play('shopSuccess');
    toast(r.isNew ? `🐎 获得坐骑【${r.name}】，已自动骑乘` : `【${r.name}】已拥有，兑换码已使用`);
    if (r.isNew && typeof bigAnnounce === 'function') bigAnnounce('🐎 获得坐骑 · ' + r.name, '#ffd24a');
    openModal('mount', '坐骑 · 驯兽师', mountHtml());
  });
  body.querySelectorAll('[data-mount-buy]').forEach(b => b.onclick = () => {
    const k = b.dataset.mountBuy, m = mountByKey(k);
    const tier = DATA.MOUNT_TIERS[m.tier];
    const p = G.player, ms = mountEnsure(p);
    if (ms.owned.includes(k)) { toast('已经拥有这个坐骑'); return; }
    if (p.gold < tier.price) { toast('金币不足'); return; }
    p.gold -= tier.price;
    ms.owned.push(k); ms.active = k;
    recalcStats(p); saveGame();
    if (typeof Sfx !== 'undefined') Sfx.play('shopSuccess');
    toast(`🐎 获得坐骑【${m.name}】，已自动乘骑`);
    openModal('mount', '坐骑 · 驯兽师', mountHtml());
  });
  body.querySelectorAll('[data-mount-use]').forEach(b => b.onclick = () => {
    mountEnsure(G.player).active = b.dataset.mountUse;
    recalcStats(G.player); saveGame();
    mountSound(b.dataset.mountUse);
    openModal('mount', '坐骑 · 驯兽师', mountHtml());
  });
  body.querySelectorAll('[data-mount-off]').forEach(b => b.onclick = () => {
    mountEnsure(G.player).active = null;
    recalcStats(G.player); saveGame();
    toast('已下马');
    openModal('mount', '坐骑 · 驯兽师', mountHtml());
  });
  body.querySelectorAll('[data-pet-use]').forEach(b => b.onclick = () => {
    const st = petEnsure(G.player);
    st.active = b.dataset.petUse;
    recalcStats(G.player); saveGame();
    if (typeof Sfx !== 'undefined') Sfx.play(st.active === 'endurance' ? 'cowMoo' : 'confirm');
    const d = petByKey(st.active);
    toast(`🐾 ${d.name} 出战：${d.aura} 生效`);
    openModal('pet', '宠物 · 驯兽师', petHtml());
    updateAuraHud();
  });
  body.querySelectorAll('[data-pet-off]').forEach(b => b.onclick = () => {
    petEnsure(G.player).active = null;
    recalcStats(G.player); saveGame();
    toast('宠物已收回');
    openModal('pet', '宠物 · 驯兽师', petHtml());
    updateAuraHud();
  });
  body.querySelectorAll('[data-pet-up]').forEach(b => b.onclick = () => {
    const k = b.dataset.petUp, st = petEnsure(G.player), p = G.player;
    const lv = st.lv[k] || 1;
    const cost = DATA.PET_UP_COST[lv] || 0;
    if (lv >= 3) return;
    if (p.gold < cost) { toast('金币不足'); return; }
    p.gold -= cost; st.lv[k] = lv + 1;
    recalcStats(p); saveGame();
    if (typeof Sfx !== 'undefined') Sfx.play('lvlup');
    toast(`光环提升至 L${lv + 1}`);
    openModal('pet', '宠物 · 驯兽师', petHtml());
    updateAuraHud();
  });
  body.querySelectorAll('[data-pet-paste]').forEach(b => b.onclick = async () => {
    const inp = document.getElementById('petCodeInput');
    if (!inp) return;
    try {
      let txt = '';
      if (navigator.clipboard && navigator.clipboard.readText) {
        txt = await navigator.clipboard.readText();
      }
      if (!txt) {
        inp.focus();
        document.execCommand && document.execCommand('paste');
        toast('请长按输入框手动粘贴');
        return;
      }
      inp.value = String(txt).trim().toUpperCase();
      toast('已粘贴兑换码');
    } catch (e) {
      inp.focus();
      toast('浏览器不允许读取剪贴板，请长按输入框粘贴');
    }
  });
  body.querySelectorAll('[data-pet-redeem]').forEach(b => b.onclick = () => {
    const inp = document.getElementById('petCodeInput');
    const r = redeemPetCode(G.player, inp ? inp.value : '');
    if (!r.ok) { toast(r.msg); return; }
    recalcStats(G.player); saveGame();
    if (r.isNew && typeof Sfx !== 'undefined') Sfx.play('shopSuccess');
    toast(r.isNew ? `🎉 获得宠物【${r.name}】` : `【${r.name}】已拥有，兑换码已使用`);
    if (r.isNew && typeof bigAnnounce === 'function') bigAnnounce('🐾 获得宠物 · ' + r.name, r.def ? r.def.color : '#5fdc4a');
    openModal('pet', '宠物 · 驯兽师', petHtml());
  });
  body.querySelectorAll('[data-tel]').forEach(b => b.onclick = () => {
    if (b.dataset.tel === 'rooms') openTownMap();
    else openModal('daily', '每日副本 · 岳跃冲', dailyDungeonHtml());
  });
  body.querySelectorAll('[data-daily-enter]').forEach(b => b.onclick = () => {
    const id = +b.dataset.dailyEnter;
    const room = DATA.ROOMS.find(r => r.id === id);
    if (!room) return;
    if (dailyLeft(G.player, room.dailyKey) <= 0) { toast('今天的次数已用完，明天再来'); return; }
    dailyConsume(G.player, room.dailyKey);
    G.diff = 'normal';
    closeModal();
    enterRoom(id);
    toast(`进入 ${room.name}（今日剩余 ${dailyLeft(G.player, room.dailyKey)} 次）`);
    saveGame();
  });
  body.querySelectorAll('[data-statue]').forEach(b => b.onclick = () => {
    const k = b.dataset.statue;
    closeModal();
    if (k === 'silvermoon' || k === 'lordaeron') { loreStart(k); return; }
    if (k === 'fight') {
      const p = G.player;
      if (p.level < 50) { toast('需要等级 50 级才能挑战巫妖王'); return; }
      if (p.dead) return;
      p.hp = p.stats.hpMax; p.mp = p.stats.mpMax;
      enterRoom(6);
      bigAnnounce('❄ 巫妖王 · 阿尔萨斯 降临', '#8fd8ff');
      logMsg('⚠ 你踏入了冰封王座，巫妖王正在等你', 'rare');
    }
  });
  body.querySelectorAll('[data-dbg-hlt]').forEach(b => b.onclick = () => {
    const p = G.player;
    const h = hltEnsure(p);
    const k = b.dataset.dbgHlt;
    const w = hltByKey(k);
    if (!w) return;
    if (h.owned.includes(k)) { toast(`已拥有【${w.alias}】`); return; }
    h.owned.push(k);
    recalcStats(p);
    saveGame();
    toast(`已发放传家宝【${w.alias}】`);
    logMsg(`🛠 调试：发放传家宝 ${w.alias}`, 'loot');
    openModal('debug', '调试面板 · N', debugHtml());
  });
  body.querySelectorAll('[data-dbg-pet]').forEach(b => b.onclick = () => {
    const key = b.dataset.dbgPet;
    const def = (DATA.BATTLE_PETS || []).find(x => x.key === key);
    if (!def) return;
    const p = G.player;
    const own = battlePetEnsure(p).owned.includes(key);
    mailPush(p, {
      title: '调试发放 · 宠物「' + def.name + '」',
      from: '调试面板',
      body: own
        ? '你已经有这只宠物了，领取后会换成宠物缰绳 ×2。'
        : '这是调试面板发放的宠物，领取后可在「驯兽师 · 铃 → 出战宠物」里让它出战。',
      items: [{ type:'pet', key, amount:1 }]
    });
    saveGame();
    if (typeof mailRefreshDot === 'function') mailRefreshDot();
    toast(`已发送到邮箱：宠物「${def.name}」，去邮箱领取`);
    logMsg(`🛠 调试：宠物「${def.name}」已发送到邮箱`, 'loot');
    openModal('debug', '调试面板 · N', debugHtml());
  });
  body.querySelectorAll('[data-dbg-token]').forEach(b => b.onclick = () => {
    const p = G.player;
    p.materials.bossToken = (p.materials.bossToken || 0) + 1000;
    saveGame();
    toast('已发放 BOSS击杀凭证 ×1000');
    logMsg('🛠 调试：发放 BOSS击杀凭证 ×1000', 'loot');
    openModal('debug', '调试面板 · N', debugHtml());
  });
  body.querySelectorAll('[data-dbg-gear]').forEach(b => b.onclick = () => {
    const [cl, q] = b.dataset.dbgGear.split('|');
    const p = G.player;
    const lv = Math.max(1, p.level);
    let n = 0;
    ['weapon','helm','chest','legs','boots','neck','ring','trinket'].forEach(sl => {
      const it = makeItem(sl, lv, q, DATA.CLASSES[cl].primary === 'int');
      it.reqLv = 1;
      p.equip[sl] = it;
      n++;
    });
    recalcStats(p);
    saveGame();
    toast(`已装备 ${DATA.CLASSES[cl].name} 整套 ${q === 'mythic' ? '红色' : '紫色'}装备（Lv.${lv}）`);
    logMsg(`🛠 调试：发放 ${DATA.CLASSES[cl].name} ${q} 套装`, 'loot');
    openModal('debug', '调试面板 · N', debugHtml());
  });
  body.querySelectorAll('[data-dbg-gold]').forEach(b => b.onclick = () => {
    G.player.gold = (G.player.gold || 0) + 550000;
    saveGame();
    toast('已发放 550,000 金币');
    logMsg('🛠 调试：发放 550,000 金币', 'loot');
    openModal('debug', '调试面板 · N', debugHtml());
  });
  body.querySelectorAll('[data-dbg-skillmat]').forEach(b => b.onclick = () => {
    const p = G.player;
    p.materials.skillT = (p.materials.skillT || 0) + 100;
    p.materials.breakT = (p.materials.breakT || 0) + 100;
    saveGame();
    toast('已发放：技能强化券 ×100 · 技能突破券 ×100');
    logMsg('🛠 调试：发放技能材料 ×100', 'loot');
    openModal('debug', '调试面板 · N', debugHtml());
  });
  body.querySelectorAll('[data-dbg-mats]').forEach(b => b.onclick = () => {
    const p = G.player;
    p.materials.stone = (p.materials.stone || 0) + 100;
    p.materials.protect = (p.materials.protect || 0) + 100;
    saveGame();
    toast('已发放：强化石 ×100 · 强化保护券 ×100');
    logMsg('🛠 调试：发放强化材料 ×100', 'loot');
    openModal('debug', '调试面板 · N', debugHtml());
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
  body.querySelectorAll('[data-dbg-go]').forEach(el => el.onclick = () => {
    G._dbgView = el.dataset.dbgGo;
    openModal('debug', '调试面板 · N', debugHtml());
  });
  body.querySelectorAll('[data-dbg-back]').forEach(el => el.onclick = () => {
    G._dbgView = 'menu';
    openModal('debug', '调试面板 · N', debugHtml());
  });
  // 数值输入实时显示提示
  body.querySelectorAll('[data-cfg]').forEach(inp => {
    const d = CFG_DEFS.find(x => x.id === inp.dataset.cfg);
    if (!d) return;
    inp.oninput = () => {
      const hint = inp.parentElement.querySelector('.cfg-hint');
      const v = parseFloat(inp.value);
      if (hint && !isNaN(v)) hint.textContent = d.fmt(v);
    };
  });
  body.querySelectorAll('[data-cfg-save]').forEach(b => b.onclick = () => {
    const inputs = body.querySelectorAll('[data-cfg]');
    let n = 0;
    inputs.forEach(inp => {
      const d = CFG_DEFS.find(x => x.id === inp.dataset.cfg);
      if (!d) return;
      let v = parseFloat(inp.value);
      if (isNaN(v)) return;
      v = Math.max(d.min, Math.min(d.max, v));
      d.set(v); n++;
    });
    cfgSave();
    saveGame();
    toast(`已保存 ${n} 项数值（立即生效）`);
    openModal('debug', '调试面板 · N', debugHtml());
  });
  body.querySelectorAll('[data-cfg-reset]').forEach(b => b.onclick = () => {
    localStorage.removeItem('orc_cfg');
    const tag = document.getElementById('orc-cfg');
    if (tag) tag.textContent = '{}';
    toast('已清除自定义数值，刷新页面恢复默认');
    G._dbgView = 'menu';
    openModal('debug', '调试面板 · N', debugHtml());
  });
  body.querySelectorAll('[data-cfg-export]').forEach(b => b.onclick = () => {
    try {
      cfgExportHtml();
      toast('已生成「兽人永不为奴-定制版.html」，可直接发给朋友');
    } catch (e) {
      toast('导出失败：' + e.message);
    }
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
  body.querySelectorAll('[data-new-char]').forEach(b => b.onclick = () => {
    G.creatingNew = true;
    SEL = { race: 'human', cls: 'warrior' };
    closeModal();
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
  if (typeof bindSigninControls === 'function') bindSigninControls(body);
  if (typeof bindTalentControls === 'function') bindTalentControls(body);
  body.querySelectorAll('[data-holy-go]').forEach(b => b.onclick = () => {
    closeModal(); enterRoom(HOLY_TOWN); logMsg('穿过光门，来到圣光大陆', 'level');
  });
  body.querySelectorAll('[data-act-enhance]').forEach(b => b.onclick = () => openModal('enhance', '铁匠 · 装备强化', enhanceHtml()));
  body.querySelectorAll('[data-tower-start]').forEach(b => b.onclick = () => enterTower(+b.dataset.towerStart));
  body.querySelectorAll('[data-codex-room]').forEach(b => b.onclick = () => {
    G._codexRoom = +b.dataset.codexRoom;
    openModal('codexEquip', '装备图鉴', codexEquipHtml());
  });
  body.querySelectorAll('[data-codex-up]').forEach(b => b.onclick = () => {
    const r = codexUpgrade(G.player, +b.dataset.codexUp);
    if (!r.ok) { toast(r.msg); return; }
    const room = getRoom(+b.dataset.codexUp);
    if (typeof Sfx !== 'undefined') Sfx.play('lvlup');
    bigAnnounce('图鉴升级 · ' + (room ? room.name : '') + ' Lv.' + r.lv, '#ffd24a');
    toast(`图鉴升级成功：Lv.${r.lv}（消耗 ${r.cost.toLocaleString()} 金）`);
    saveGame();
    openModal('codexEquip', '装备图鉴', codexEquipHtml());
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
  body.querySelectorAll('[data-gold-skill]').forEach(b => b.onclick = () => {
    const key = b.dataset.goldSkill;
    const r = upgradeSkillGold(G.player, key);
    if (!r.ok) { toast(r.msg); return; }
    if (typeof Sfx !== 'undefined') Sfx.play('lvlup');
    toast(`${DATA.SKILLS[key].name} 升级到 Lv.${r.lv}（花费 ${fmt(r.cost)} 金）`);
    logMsg(`💰 金币升级 ${DATA.SKILLS[key].name} → Lv.${r.lv}`, 'level');
    saveGame();
    openModal('skill', '技能', skillHtml());
  });
  body.querySelectorAll('[data-break-skill]').forEach(b => b.onclick = () => {
    const k = b.dataset.breakSkill;
    const r = breakthrough(G.player, k);
    const _pf = skillProfOf(G.player, k);
    const _cost = breakCostOf(_pf.tier - (r === 'ok' ? 1 : 0));
    toast(r === 'ok'
        ? `✅ 突破成功！${DATA.SKILLS[k].name} 升到第 ${_pf.tier} 层（技能等级已重置为 Lv.1）`
        : r === 'max' ? `已是最高层（${DATA.SKILL_TIER.maxTier} 层）`
        : r === 'prof' ? `熟练度未满（${_pf.prof.toFixed(0)}/${DATA.SKILL_TIER.needProf}）`
        : r === 'lv' ? '需先把该技能练到 Lv.5 才能突破'
        : `❌ 突破券不足（需 ${breakCostOf(_pf.tier)} 张，现有 ${G.player.materials.breakT||0} 张）`);
    if (r === 'ok' && typeof Sfx !== 'undefined') Sfx.play('lvlup');
    openModal('skill', '技能', skillHtml());
  });
  body.querySelectorAll('[data-bag-page]').forEach(b => b.onclick = () => {
    G.player.bagPage = +b.dataset.bagPage;
    openModal('bag', '背包 · 装备', bagHtml());
  });
  body.querySelectorAll('[data-act="sellWorse"]').forEach(b => b.onclick = () => handleCommand('sellWorse'));
  body.querySelectorAll('[data-act="salvageMythic"]').forEach(b => b.onclick = () => handleCommand('salvageMythic'));
  body.querySelectorAll('[data-act="sortBag"]').forEach(b => b.onclick = () => {
    const n = sortBag(G.player);
    
    toast(`已整理 ${n} 件物品（按类型 + 战力降序）`);
    saveGame();
    openModal('bag', '背包 · 装备', bagHtml());
  });
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
    G.player.autoSellWeapon = cb.checked;
    autoSellSavePrefs(G.player);
    toast('自动出售低战力武器：' + (cb.checked ? '开（已记住）' : '关（已记住）'));
    saveGame();
  });
  body.querySelectorAll('[data-toggle-autosell]').forEach(cb => cb.onchange = () => {
    G.autoSell = cb.checked;
    G.player.autoSell = cb.checked;
    autoSellSavePrefs(G.player);
    toast('自动出售低战力装备：' + (G.autoSell ? '开（已记住）' : '关（已记住）'));
    saveGame();
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
  const inBag = p.bag.find(x => x.id === id);
  if (inBag) return inBag;
  return (p.warehouse || []).find(x => x.id === id);   // 仓库里的也能查
}

/* ---------------- Tooltip ---------------- */
const AFFIX_NAMES = { str:'力量', agi:'敏捷', int:'智力', vit:'体质', atk:'攻击力', spell:'法术强度',
  as:'攻击速度', crit:'暴击率', critDmg:'暴击伤害', armor:'护甲', hp:'生命值',
  dodge:'闪避率', lifesteal:'吸血', hit:'命中', mp:'法力值', all:'全属性', skillDmg:'技能增伤', cdr:'冷却缩减', dr:'受伤减免' };
const PCT_KEYS = ['as','crit','critDmg','dodge','lifesteal','hit','skillDmg','cdr','dr'];

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
    const _m = enhMul(it);
    for (const k in it.stats) {
      const v = it.stats[k] * _m;
      parts.push(`<div class="tt-stat">+${PCT_KEYS.includes(k) ? (v*100).toFixed(1)+'%' : Math.round(v)} ${AFFIX_NAMES[k]||k}</div>`);
    }
    if (it.reqLv > G.player.level) {
      parts.push(`<div class="tt-req" style="font-size:12px;font-weight:700">⛔ 等级不足：需要 Lv.${it.reqLv}（当前 Lv.${G.player.level}）</div>`);
    }

    // ---- 并排展示两件装备的完整属性（不对比，各自显示装备战力值）----
    const cur = G.player.equip[it.slot];
    if (cur) {
      const curM = enhMul(cur), newM = enhMul(it);
      const fmtV = (k, v) => PCT_KEYS.includes(k) ? (v * 100).toFixed(1) + '%' : Math.round(v);

      const colHtml = (item, m, title, isCur) => {
        const rows = [];
        for (const k in item.stats) {
          rows.push(`<div class="eq2-row"><em>${AFFIX_NAMES[k] || k}</em><b>${fmtV(k, item.stats[k] * m)}</b></div>`);
        }
        if (!rows.length) rows.push('<div class="eq2-row"><em>—</em><b></b></div>');
        // 特效数值
        if (item.effect) {
          for (const k in item.effect) {
            rows.push(`<div class="eq2-row eff"><em>${effectText(k, item.effect[k] * m)}</em><b></b></div>`);
          }
        }
        return `<div class="eq2-col${isCur ? ' cur' : ''}">
          <div class="eq2-h">${title}</div>
          <div class="eq2-nm" style="color:${item.color || '#c8c8c8'}">${item.enh ? '+' + item.enh + ' ' : ''}${item.name}</div>
          <div class="eq2-cp">战力 <b>${fmt(Math.round(itemPower(item)))}</b></div>
          ${rows.join('')}
        </div>`;
      };

      parts.push(`<div class="eq2-wrap">
        ${colHtml(cur, curM, '当前装备', true)}
        ${colHtml(it, newM, '候选装备', false)}
      </div>`);
    }
    parts.push(`<div class="tt-desc">点击查看详情（强化 / 穿戴 / 卸下）</div>`);
    TIP.innerHTML = parts.join('');
    // 双栏并排需要更宽，否则属性名会被挤掉
    if (G.player && G.player.equip[it.slot]) {
      TIP.style.maxWidth = 'min(460px, 92vw)';
    }
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



  const btn = $('soundToggle');
  if (btn) {
    const sync = () => {
      const on = Sfx.on && (G.soundOn === true);
      btn.textContent = on ? '🔊' : '🔇';
      btn.classList.toggle('off', !on);
    };
    if (G.soundOn === undefined) G.soundOn = true;   // 默认开启
    Sfx.setOn(G.soundOn === true);
    sync();
    btn.onclick = (e) => {
      e.stopPropagation();
      G.soundOn = !(G.soundOn === true);
      Sfx.setOn(G.soundOn);
      sync();
      if (G.soundOn) Sfx.resume();
      saveGame();
    };
    // 音效自检按钮（排查设备兼容）
    const tbtn = document.getElementById('soundTest');
    if (tbtn) {
      tbtn.onclick = (e) => {
        e.stopPropagation();
        Sfx.setOn(true); G.soundOn = true; sync(); Sfx.unlock();
        const count = Sfx.testAll();
        toast(`🎵 正在依次测试 ${count} 个新音效，请留意是否都有声音`);
      };
    }
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
