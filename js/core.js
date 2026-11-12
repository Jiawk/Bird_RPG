/* ============================================================
   核心：全局状态 / 随机 / 属性计算 / 装备生成 / 存档
   ============================================================ */
'use strict';

const TOWN = 99;   // 城镇房间 id

const G = {
  screen: 'title',
  diff: 'normal',      // 本次进图的难度
  autoPickup: true,    // 全屏自动拾取
  autoSell: false,     // 自动出售低战力装备
  debug: { noCd:false, invincible:false, infMp:false, fastSpawn:false, fastAtk:false },   // 调试开关
  player: null,
  world: null,
  time: 0,
  paused: false,
  msgLog: [],
  lastTs: 0
};

/* ---------------- 工具 ---------------- */
const rnd = (a, b) => a + Math.random() * (b - a);
const rndInt = (a, b) => Math.floor(rnd(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist2 = (a, b) => { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; };
const dist = (a, b) => Math.sqrt(dist2(a, b));
const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : Math.round(n).toString();

function weightedPick(entries) { // [{key, weight}]
  let total = 0;
  for (const e of entries) total += e.weight;
  let r = Math.random() * total;
  for (const e of entries) { r -= e.weight; if (r <= 0) return e.key; }
  return entries[entries.length - 1].key;
}

/* ---------------- 玩家创建 ---------------- */
function createPlayer(raceKey, clsKey) {
  const race = DATA.RACES[raceKey], cls = DATA.CLASSES[clsKey];
  const p = {
    race: raceKey, cls: clsKey,
    level: 1, exp: 0, gold: 0,
    attrs: { str: 10, agi: 10, int: 10, vit: 10 },
    bonus: { str: 0, agi: 0, int: 0, vit: 0 },   // 属性书永久加成
    equip: {}, bag: [],
    skills: {}, active: [], passive: [],
    cd: {}, buffs: [], dots: [],
    hp: 0, mp: 0,
    x: 0, y: 0, r: 18, dir: 0,
    room: TOWN, unlocked: [0],
    materials: { iron:0, mithril:0, scale:0, shard:0, stone:0, protect:0, skillT:0, breakT:0 },
    skillProf: {}, firstKills: {}, codex: {}, ringDropAt: {},
    quests: [], questDone: 0,
    kills: 0, bossKills: 0,
    stats: {}
  };
  for (const k in race.mod) p.attrs[k] += race.mod[k];
  if (race.extra && race.extra.all) for (const k in p.attrs) p.attrs[k] += race.extra.all;
  // 初始技能：QWER 四个战斗技能 + D 位移，全部 1 级
  const km = cls.keymap;
  p.keymap = { q: km.q, w: km.w, e: km.e, r: km.r, d: km.d };
  p.active = [km.q, km.w, km.e, km.r];
  p.dash = km.d;
  [km.q, km.w, km.e, km.r, km.d].forEach(k => { p.skills[k] = 1; });
  // 第一个被动开局赠送，第二个要吃书
  const passives = cls.skills.filter(s => DATA.SKILLS[s].type === 'passive');
  p.skills[passives[0]] = 1;
  p.passive = [passives[0], null, null];
  recalcStats(p);
  p.hp = p.stats.hpMax; p.mp = p.stats.mpMax;
  return p;
}

/* ---------------- 属性计算 ---------------- */
function recalcStats(p) {
  const cls = DATA.CLASSES[p.cls], race = DATA.RACES[p.race];
  const bonus = race.extra || {};

  // 装备加成汇总
  const eq = { str:0, agi:0, int:0, vit:0, atk:0, spell:0, as:0, crit:0,
               critDmg:0, armor:0, hp:0, dodge:0, lifesteal:0, hit:0, mp:0, all:0 };
  for (const s in p.equip) {
    const it = p.equip[s]; if (!it) continue;
    const st = itemStats(it);
    for (const k in st) eq[k] = (eq[k] || 0) + st[k];
  }

  const baseAll = eq.all || 0;
  const A = {
    str: p.attrs.str + p.bonus.str + baseAll + eq.str,
    agi: p.attrs.agi + p.bonus.agi + baseAll + eq.agi,
    int: p.attrs.int + p.bonus.int + baseAll + eq.int,
    vit: p.attrs.vit + p.bonus.vit + baseAll + eq.vit
  };

  // 本命武器：武器种类与职业匹配 → 攻击加成 + 特效
  let weaponBonus = 0, weaponFx = 'slash', relicPct = 0;
  const wpn = p.equip.weapon;
  if (wpn && wpn.wtype && DATA.WEAPON_KINDS[wpn.wtype]) {
    const K = DATA.WEAPON_KINDS[wpn.wtype];
    weaponFx = K.fx;
    if (K.cls.includes(p.cls)) weaponBonus = K.bonus;
    if (wpn.relicPct) relicPct = wpn.relicPct;
  }

  // 特戒效果（强化会放大）
  const RFX = { expBonus:0, goldBonus:0, lifesteal:0, cleave:0, critDmg:0, dropBonus:0, revive:0, summon:0, gather:0 };
  for (const sk of DATA.RING_SLOTS.map(x => x.slot).concat(['ring','trinket'])) {
    const it = p.equip[sk];
    if (it && it.effect) {
      const m = enhMul(it);
      for (const k in it.effect) RFX[k] = (RFX[k] || 0) + it.effect[k] * m;
    }
  }

  // 套装：主属性加成
  const SB = setBonus(p);
  if (SB.pct) A[SB.primary] = Math.round(A[SB.primary] * (1 + SB.pct));
  if (SB.flat) A[SB.primary] += SB.flat;

  // 被动技能
  const pas = { hpPct:0, atkPct:0, spellPct:0, crit:0, critDmg:0, asPct:0, killMana:0, killAs:0 };
  for (const k of p.passive) {
    if (!k) continue;
    const sp = DATA.SKILLS[k].passive; if (!sp) continue;
    const lv = p.skills[k] || 1, mul = 1 + (lv - 1) * 0.2;
    for (const f in sp) pas[f] = (pas[f] || 0) + sp[f] * mul;
  }

  // Buff 加成
  const bf = { dr:0, atkPct:0, asPct:0, invis:0 };
  for (const b of p.buffs) {
    if (b.dr) bf.dr = Math.max(bf.dr, b.dr);
    if (b.atkPct) bf.atkPct += b.atkPct;
    if (b.asPct) bf.asPct += b.asPct;
  }

  const isMagic = p.cls === 'mage';
  const power =
    (isMagic
      ? cls.base.spell + (p.level - 1) * cls.growth.spell + A.int * 2.5 + eq.spell
      : cls.base.atk + (p.level - 1) * cls.growth.atk +
        (cls.primary === 'str' ? A.str : A.agi) * 2 + eq.atk)
    * (1 + (isMagic ? pas.spellPct : 0))
    * (1 + pas.atkPct + bf.atkPct)
    * (1 + weaponBonus);

  // 兽族狂暴
  let berserk = 0;
  if (bonus.berserk) {
    const hpMaxTmp = (cls.base.hp + (p.level - 1) * cls.growth.hp + A.vit * 6 + p.level * 10) * (1 + pas.hpPct);
    if (p.hp / hpMaxTmp < 0.3) berserk = bonus.berserk;
  }

  const armor = cls.base.armor + (p.level - 1) * cls.growth.armor + eq.armor;
  const dr = armor / (armor + 1000 + p.level * 50) + (bonus.dr || 0);

  const baseHp = cls.base.hp + (p.level - 1) * cls.growth.hp + A.vit * 6 + p.level * 10;
  const baseMp = cls.base.mp + (p.level - 1) * cls.growth.mp + A.int * 4 + p.level * 8;

  p.stats = {
    A,
    hpMax: Math.floor(baseHp * (1 + pas.hpPct) + eq.hp),
    mpMax: Math.floor(baseMp + eq.mp),
    power: power * (1 + berserk),
    isMagic,
    skillMul: 1 + SB.skillDmg,
    weaponBonus, weaponFx, wtype: wpn ? wpn.wtype : null,
    setBonus: SB,
    as: cls.base.as * (1 + A.agi / 500) * (1 + pas.asPct + bf.asPct),
    crit: clamp(0.05 + A.agi / 2000 + eq.crit + pas.crit + (bonus.crit || 0), 0, 0.6),
    critDmg: 1.5 + eq.critDmg + pas.critDmg + RFX.critDmg,
    dodge: clamp(A.agi / 3000 + eq.dodge, 0, 0.3),
    armor,
    dr: clamp(dr + bf.dr, 0, 0.85),
    lifesteal: (eq.lifesteal || 0) + RFX.lifesteal,
    relicPct,
    mpRegen: (0.02 * (1 + (bonus.mpRegen || 0))),
    goldBonus: (bonus.goldBonus || 0) + RFX.goldBonus,
    expBonus: (race.expBonus || 0) + RFX.expBonus,
    cleave: RFX.cleave,
    dropBonus: RFX.dropBonus,
    revive: RFX.revive,
    summonRing: RFX.summon,
    gatherRing: RFX.gather,
    killMana: pas.killMana || 0,
    killAs: pas.killAs || 0,
    invis: bf.invis
  };
  p.hp = Math.min(p.hp, p.stats.hpMax);
  p.mp = Math.min(p.mp, p.stats.mpMax);
}

/* ---------------- 经验 / 升级 ---------------- */
function gainExp(p, amount) {
  amount = Math.floor(amount * (1 + (p.stats.expBonus || 0)));
  if (typeof perfAdd === 'function' && amount > 0) perfAdd('e', amount);
  if (p.level >= DATA.MAX_LEVEL) return 0;
  p.exp += amount;
  let ups = 0;
  while (p.level < DATA.MAX_LEVEL && p.exp >= DATA.expForLevel(p.level)) {
    p.exp -= DATA.expForLevel(p.level);
    p.level++; ups++;
    const cls = DATA.CLASSES[p.cls];
    p.attrs.str += 1; p.attrs.agi += 1; p.attrs.int += 1; p.attrs.vit += 1;
    p.attrs[cls.primary] += 2;
  }
  if (ups) {
    recalcStats(p);
    p.hp = p.stats.hpMax; p.mp = p.stats.mpMax;
    logMsg(`⚔ 升级！当前等级 ${p.level}`, 'level');
    toast(`升级到 ${p.level} 级`);
    if (typeof Sfx !== 'undefined') { Sfx.play('lvlup'); if (p.level % 5 === 0) Sfx.speak('Power grows.'); }
  }
  return ups;
}

/* ---------------- 装备生成 ---------------- */
function rollQuality(weightTable) {
  const entries = Object.entries(weightTable).map(([key, weight]) => ({ key, weight }));
  return weightedPick(entries);
}

function affixValue(affix, ilvl, qMult) {
  const base = rnd(affix.v[0], affix.v[1]);
  const v = base * (1 + ilvl * affix.scale * 0.06) * qMult;
  return affix.pct ? Math.round(v * 100) / 10000 : Math.max(1, Math.round(v));
}

function makeItem(slot, ilvl, forcedQuality, preferMagic) {
  const qKey = forcedQuality || rollQuality(
    Object.fromEntries(DATA.QUALITY.map(q => [q.key, q.weight]))
  );
  const q = DATA.QUALITY.find(x => x.key === qKey);
  let wtype = null, names;
  if (slot === 'weapon') {
    const cls = G.player ? G.player.cls : 'warrior';
    const own = Object.keys(DATA.WEAPON_KINDS).filter(k => DATA.WEAPON_KINDS[k].cls.includes(cls));
    const all = Object.keys(DATA.WEAPON_KINDS);
    wtype = (Math.random() < 0.88 && own.length) ? pick(own) : pick(all);
    names = DATA.WEAPON_KINDS[wtype].names;
  } else {
    names = DATA.ITEM_NAMES[slot] || DATA.ITEM_NAMES.ring;
  }
  const baseName = pick(names);
  const PREFIX = { common:'', uncommon:'精铁', rare:'秘银', epic:'符文', legendary:'龙鳞', mythic:'虚空' };
  const name = PREFIX[qKey] + baseName;

  const stats = {};
  // 主属性
  const mainStat = DATA.AFFIXES.find(a => ['atk','spell','armor','hp'].includes(a.key));
  let mainKey;
  if (slot === 'weapon') {
    // 85% 概率偏向玩家自己的伤害类型，避免掉一堆用不上的武器
    const magic = (preferMagic === undefined) ? (Math.random() < 0.5) : preferMagic;
    mainKey = (Math.random() < 0.85) ? (magic ? 'spell' : 'atk') : (magic ? 'atk' : 'spell');
  } else {
    mainKey = pick(['armor','hp','atk','spell']);
  }
  const mainAffix = DATA.AFFIXES.find(a => a.key === mainKey);
  stats[mainKey] = Math.max(1, Math.round(
    rnd(mainAffix.v[0], mainAffix.v[1]) * (1 + ilvl * 0.09) * q.mult
  ));

  // 随机词条
  const pool = DATA.AFFIXES.filter(a => a.key !== mainKey);
  for (let i = 0; i < q.affixes; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    const a = pool.splice(idx, 1)[0];
    if (!a) break;
    stats[a.key] = (stats[a.key] || 0) + affixValue(a, ilvl, q.mult);
  }

  return {
    id: 'i' + Math.random().toString(36).slice(2, 9),
    slot, qKey, qName: q.name, color: q.color,
    name, ilvl, reqLv: Math.max(1, ilvl + q.lvl), stats, enh: 0,
    ...(wtype ? { wtype } : {})
  };
}

/* ---------------- 装备 / 背包 ---------------- */
const BAG_PAGE_SIZE = 24;
const BAG_PAGES = 6;              // 6 页 = 144 格
const BAG_MAX = BAG_PAGE_SIZE * BAG_PAGES;

function equipItem(p, item) {
  normalizeSlot(item);
  if (item.reqLv > p.level) { toast('等级不足，无法装备'); return false; }
  // 特戒槽只能放对应的特戒
  if (item.slot && item.slot.indexOf('ring_') === 0) {
    if (!item.ringKey || ringSlotOf(item.ringKey) !== item.slot) {
      toast('这枚戒指不能放进该特戒槽'); return false;
    }
  }
  // 特戒不能塞进普通槽
  if (item.ringKey && (!item.slot || item.slot.indexOf('ring_') !== 0)) {
    item.slot = ringSlotOf(item.ringKey);   // 自动归位
  }
  const old = p.equip[item.slot] || null;
  p.equip[item.slot] = item;
  removeFromBag(p, item);
  if (old) addToBag(p, old);
  recalcStats(p);
  return true;
}

function unequipItem(p, slot) {
  const it = p.equip[slot]; if (!it) return;
  if (p.bag.length >= BAG_MAX) { toast('背包已满'); return; }
  delete p.equip[slot];
  addToBag(p, it);
  recalcStats(p);
}

function addToBag(p, item) {
  // 药水堆叠
  if (item.type === 'potion') {
    const ex = p.bag.find(x => x.type === 'potion' && x.key === item.key);
    if (ex) { ex.count = (ex.count || 1) + (item.count || 1); return true; }
    item.count = item.count || 1;
  }
  // 属性书堆叠（同属性合成一本）
  if (item.type === 'book') {
    const ex = p.bag.find(x => x.type === 'book' && x.stat === item.stat);
    if (ex) { ex.count = (ex.count || 1) + (item.count || 1); return true; }
    item.count = item.count || 1;
  }
  if (p.bag.length >= BAG_MAX) { toast('背包已满，已自动折现'); p.gold += 20; return false; }
  p.bag.push(item); return true;
}

/* 消耗一瓶药 */
function consumePotion(p, key, n) {
  const i = p.bag.findIndex(x => x.type === 'potion' && x.key === key);
  if (i < 0) return 0;
  const it = p.bag[i];
  const take = Math.min(n || 1, it.count || 1);
  it.count -= take;
  if (it.count <= 0) p.bag.splice(i, 1);
  return take;
}

function removeFromBag(p, item) {
  const i = p.bag.findIndex(x => x.id === item.id);
  if (i >= 0) p.bag.splice(i, 1);
}

function sellItem(p, item) {
  normalizeSlot(item);
  if (item.ringKey) { toast('特戒无法分解或出售'); return; }
  const q = DATA.QUALITY.find(x => x.key === item.qKey);
  const idx = DATA.QUALITY.indexOf(q);
  const price = Math.round((20 + item.ilvl * 8) * Math.pow(2.2, idx));
  p.gold += price;
  removeFromBag(p, item);
  toast(`出售 ${item.name} +${price} 金`);
}

/* 安全取槽位名（旧存档可能残留已删除的槽位） */
function slotName(sk) {
  const d = DATA.SLOTS[sk];
  return d ? d.name : '未知部位';
}

/* 惰性修正：单个物品的非法槽位就地纠正 */
function normalizeSlot(it) {
  if (!it || it.type === 'potion') return it;
  if (it.ringKey) {
    const s = ringSlotOf(it.ringKey);
    if (s && it.slot !== s) it.slot = s;
    return it;
  }
  // 普通装备不允许占用特戒槽
  if (!DATA.SLOTS[it.slot] || String(it.slot).indexOf('ring_') === 0) it.slot = 'ring';
  return it;
}

/* 迁移：把槽位已不存在的装备归位 */
function migrateItemSlots(p) {
  // 圣物补齐 qKey（旧存档里可能只有 quality）
  const fixQ = x => { if (x && x.relicKey && !x.qKey) x.qKey = 'relic'; };
  if (p.equip) for (const k in p.equip) fixQ(p.equip[k]);
  if (p.bag) p.bag.forEach(fixQ);
  const valid = sk => !!DATA.SLOTS[sk];
  const isRingSlot = sk => DATA.RING_SLOTS.some(r => r.slot === sk);
  const fix = it => {
    if (!it) return it;
    // 特戒 → 归到自己的专属槽
    if (it.ringKey && ringSlotOf(it.ringKey)) { it.slot = ringSlotOf(it.ringKey); return it; }
    // 普通装备却占着特戒槽 → 退回普通戒指槽
    if (isRingSlot(it.slot)) { it.slot = 'ring'; return it; }
    if (!valid(it.slot)) it.slot = 'ring';
    return it;
  };
  for (const sk of Object.keys(p.equip)) {
    const it = p.equip[sk];
    if (!it) continue;
    if (!valid(sk)) {
      delete p.equip[sk];
      fix(it);
      if (valid(it.slot) && !p.equip[it.slot]) p.equip[it.slot] = it;
      else addToBag(p, it);
    } else fix(it);
  }
  (p.bag || []).forEach(it => { if (it.type !== 'potion') { fix(it); normalizeSlot(it); } });
  p.bag = (p.bag || []).filter(it => it.type === 'potion' || valid(it.slot));
}

/* 使用一本属性书 */
function useBook(p, stat, n) {
  const i = p.bag.findIndex(x => x.type === 'book' && x.stat === stat);
  if (i < 0) return 0;
  const it = p.bag[i];
  const take = Math.min(n || 1, it.count || 1);
  p.bonus[stat] = (p.bonus[stat] || 0) + take;
  it.count -= take;
  if (it.count <= 0) p.bag.splice(i, 1);
  recalcStats(p);
  return take;
}

/* ---------------- 新手初始装备 ---------------- */
function giveStarterGear(p) {
  const magic = p.cls === 'mage';
  for (const sk in DATA.SLOTS) {
    if (DATA.RING_SLOTS.some(r => r.slot === sk)) continue;
    if (p.equip[sk]) continue;
    p.equip[sk] = makeItem(sk, 3, 'uncommon', magic);
  }
  recalcStats(p);
  p.hp = p.stats.hpMax;
  p.mp = p.stats.mpMax;
  return p;
}

/* ---------------- 装备强化 ---------------- */
function enhMul(it) { return DATA.ENHANCE.statMul(it.enh || 0); }

/* 强化后的词条（不修改原数据） */
function itemStats(it) {
  const m = enhMul(it);
  if (m === 1) return it.stats;
  const out = {};
  for (const k in it.stats) out[k] = it.stats[k] * m;
  return out;
}

/* 强化一次，返回 {ok, msg} */
function enhanceItem(p, it, useProtect) {
  const lv = it.enh || 0;
  if (lv >= DATA.ENHANCE.max) return { ok:false, msg:'已达到 +15 上限' };
  const gold = DATA.ENHANCE.goldCost(lv);
  const stone = DATA.ENHANCE.stoneCost(lv);
  if (p.gold < gold) return { ok:false, msg:`金币不足（需 ${fmt(gold)}）` };
  if ((p.materials.stone || 0) < stone) return { ok:false, msg:`强化石不足（需 ${stone}）` };
  if (useProtect && (p.materials.protect || 0) < 1) return { ok:false, msg:'没有强化保护券' };

  p.gold -= gold;
  p.materials.stone -= stone;
  if (useProtect) p.materials.protect -= 1;

  const rate = DATA.ENHANCE.rate(lv);
  if (Math.random() < rate) {
    it.enh = lv + 1;
    return { ok:true, msg:`强化成功 → +${it.enh}`, up:true };
  }
  // 失败：+11 起掉一级，保护券可免
  if (!useProtect && lv >= 11) {
    it.enh = Math.max(0, lv - DATA.ENHANCE.failDrop(lv));
    return { ok:true, msg:`强化失败，降至 +${it.enh}`, down:true };
  }
  return { ok:true, msg:'强化失败，等级不变', down:true };
}

/* ---------------- 技能强化 ---------------- */
function skillProfOf(p, key) {
  if (!p.skillProf) p.skillProf = {};
  if (!p.skillProf[key]) p.skillProf[key] = { tier:1, prof:0 };
  return p.skillProf[key];
}

/* 杀怪加熟练度（该职业全部主动技能） */
function gainSkillProf(p, amount) {
  const cls = DATA.CLASSES[p.cls];
  const keys = [cls.keymap.q, cls.keymap.w, cls.keymap.e, cls.keymap.r, cls.keymap.d];
  for (const k of keys) {
    const sp = skillProfOf(p, k);
    if (sp.tier >= DATA.SKILL_TIER.maxTier && sp.prof >= DATA.SKILL_TIER.needProf) continue;
    sp.prof = Math.min(DATA.SKILL_TIER.needProf, sp.prof + amount);
  }
}

/* 用券加熟练度 */
function useSkillTicket(p) {
  const cls = DATA.CLASSES[p.cls];
  const keys = [cls.keymap.q, cls.keymap.w, cls.keymap.e, cls.keymap.r, cls.keymap.d];
  const target = keys.map(k => skillProfOf(p, k))
    .find(x => x.tier < DATA.SKILL_TIER.maxTier && x.prof < DATA.SKILL_TIER.needProf);
  if (!target) return false;
  target.prof = Math.min(DATA.SKILL_TIER.needProf, target.prof + DATA.SKILL_TIER.ticketProf);
  return true;
}

/* 突破：满级熟练 + 突破券 */
function breakthrough(p, key) {
  const sp = skillProfOf(p, key);
  if (sp.tier >= DATA.SKILL_TIER.maxTier) return 'max';
  if (sp.prof < DATA.SKILL_TIER.needProf) return 'prof';
  if ((p.materials.breakT || 0) < 1) return 'ticket';
  p.materials.breakT -= 1;
  sp.tier += 1;
  sp.prof = 0;
  return 'ok';
}

/* 特戒颜色（按效果区分） */
const RING_COLORS = {
  expBonus:  {color:'#b45cff', name:'经验'},
  goldBonus: {color:'#ffd24a', name:'金币'},
  lifesteal: {color:'#ff4a4a', name:'吸血'},
  cleave:    {color:'#4ad4ff', name:'切割'},
  critDmg:   {color:'#ff9a2e', name:'暴伤'},
  dropBonus: {color:'#3fd45a', name:'掉落'}
};
/* 特戒效果的中文描述表（杜绝英文 key 泄漏到界面） */
const EFFECT_INFO = {
  expBonus:  {name:'经验', pct:true,  desc: v => `经验获取 +${(v*100).toFixed(1)}%`},
  goldBonus: {name:'金币', pct:true,  desc: v => `金币获取 +${(v*100).toFixed(1)}%`},
  lifesteal: {name:'吸血', pct:true,  desc: v => `吸血 +${(v*100).toFixed(1)}%`},
  cleave:    {name:'切割', pct:true,  desc: v => `攻击时 ${(v*100).toFixed(1)}% 概率削掉目标 5% 最大生命`},
  critDmg:   {name:'暴伤', pct:true,  desc: v => `暴击伤害 +${(v*100).toFixed(1)}%`},
  dropBonus: {name:'掉落', pct:true,  desc: v => `掉落品质 +${(v*100).toFixed(1)}%`},
  revive:    {name:'复活', pct:false, desc: () => '死亡后原地复活，恢复 50% 生命（120 秒冷却）'},
  summon:    {name:'召唤', pct:false, desc: () => '召唤灵兽协助战斗，自动攻击附近怪物'},
  gather:    {name:'聚合', pct:false, desc: () => '按 X 键把全图怪物吸到身边（30 秒冷却）'}
};

/* 把一条效果翻成中文 */
function effectText(k, v) {
  const info = EFFECT_INFO[k];
  if (!info) return '未知效果';
  return info.desc(v === undefined ? 1 : v);
}
/* 只要效果名 */
function effectName(k) {
  const info = EFFECT_INFO[k];
  return info ? info.name : '未知';
}
/* 该效果是否受强化影响（数值型才受） */
function effectScales(k) {
  const info = EFFECT_INFO[k];
  return !!(info && info.pct);
}

function ringColor(it) {
  if (!it || !it.effect) return '#ff9a2e';
  const k = Object.keys(it.effect)[0];
  return (RING_COLORS[k] || {}).color || '#ff9a2e';
}

/* 通用：按定义造一枚特戒 */
function ringSlotOf(ringKey) {
  const d = DATA.RING_SLOTS.find(x => x.ring === ringKey);
  return d ? d.slot : null;
}

function makeRing(def, idSuffix) {
  const k = Object.keys(def.effect)[0];
  const ringKey = idSuffix;
  return {
    id: 'ring_' + (idSuffix || k) + '_' + Date.now() + Math.floor(Math.random() * 1000),
    type: 'ring', qKey: 'legendary', qName: '传说',
    color: (RING_COLORS[k] || {}).color || def.color || '#ff9a2e',
    name: def.name, ilvl: 20, reqLv: 1, enh: 0,
    ringKey, slot: ringSlotOf(ringKey) || 'ring_exp',
    setKey: null, stats: {}, effect: def.effect, effectDesc: def.desc || '', bound: true
  };
}

/* 放进第一个空的特戒槽，满了就进背包 */
function equipSpecialRing(p, ring) {
  const slot = ringSlotOf(ring.ringKey);
  if (slot) {
    ring.slot = slot;
    p.equip[slot] = ring;          // 同槽已被占则替换（旧的回背包）
    recalcStats(p);
    return ring;
  }
  addToBag(p, ring);
  recalcStats(p);
  return ring;
}

/* 把 6 枚特戒各发一枚到背包（已拥有则不重复发） */
function grantAllRings(p) {
  let n = 0;
  Object.keys(DATA.SPECIAL_RINGS).forEach(k => {
    const def = DATA.SPECIAL_RINGS[k];
    const slot = ringSlotOf(k);
    // 已装备 / 背包里已有同款 → 跳过
    if (p.equip[slot]) return;
    if ((p.bag || []).some(it => it.ringKey === k)) return;
    const ring = makeRing(def, k);
    addToBag(p, ring);
    n++;
  });
  return n;
}

/* 复活消耗 */
function consumeRevive(p) {
  const RFX = p.stats && p.stats.revive ? p.stats.revive : 0;
  if (!RFX) return false;
  const now = Date.now();
  if (p.reviveCd && now < p.reviveCd) return false;
  p.reviveCd = now + 120000;
  return true;
}

/* ---------------- BOSS 首杀戒指 ---------------- */
function grantFirstKillRing(p, bossKey) {
  const def = DATA.BOSS_RINGS[bossKey];
  if (!def) return null;
  if (!p.firstKills) p.firstKills = {};
  if (p.firstKills[bossKey]) return null;
  p.firstKills[bossKey] = true;
  const ringDef = DATA.SPECIAL_RINGS[def.ring];
  const ring = makeRing(ringDef, def.ring);
  equipSpecialRing(p, ring);
  return ring;
}

/* ---------------- 职业套装 ---------------- */
function setBonus(p) {
  const sets = DATA.SETS[p.cls];
  if (!sets) return { count: 0, pct: 0, flat: 0, skillDmg: 0, all: {} };
  const counts = {};
  for (const sl of DATA.SET_SLOTS) {
    const it = p.equip[sl];
    if (it && it.setKey) counts[it.setKey] = (counts[it.setKey] || 0) + 1;
  }
  let best = null, bestN = 0;
  for (const k in counts) {
    if (counts[k] > bestN) { bestN = counts[k]; best = sets.find(x => x.key === k); }
  }
  if (!best) return { count: 0, pct: 0, flat: 0, skillDmg: 0, all: counts };
  return {
    count: bestN, key: best.key, name: best.name, color: best.color,
    primary: best.primary, total: 6, all: counts,
    pct: bestN >= 4 ? best.b4.pct : 0,
    flat: bestN >= 6 ? best.b6.flat : 0,
    skillDmg: bestN >= 6 ? best.b6.skillDmg : 0
  };
}

/* 某套装的件数 */
function setCount(p, key) {
  let n = 0;
  for (const sl of DATA.SET_SLOTS) {
    const it = p.equip[sl];
    if (it && it.setKey === key) n++;
  }
  return n;
}

/* ---------------- 战力值 ---------------- */
const PCT_AFFIX = ['as','crit','critDmg','dodge','lifesteal','hit'];

/* 单件装备的战力贡献 */
function itemPower(it) {
  if (!it) return 0;
  const qi = DATA.QUALITY.findIndex(q => q.key === it.qKey);
  const m = enhMul(it);
  let v = ((qi + 1) * 30 + it.ilvl * 6) * m + (it.enh || 0) * 22;
  for (const k in it.stats) {
    const s = it.stats[k] * m;
    v += PCT_AFFIX.includes(k) ? s * 600 : s * 1.6;
  }
  return v;
}

/* 装备总战力 */
function gearPower(p) {
  let v = 0;
  for (const sl in DATA.SLOTS) v += itemPower(p.equip[sl]);
  return v;
}

/* 角色总战力：装备 + 技能 + 等级 + 属性书 */
function combatPower(p) {
  let sp = 0;
  for (const k in p.skills) sp += (p.skills[k] || 0) * 26;
  const book = (p.bonus.str + p.bonus.agi + p.bonus.int + p.bonus.vit) * 12;
  return Math.round(gearPower(p) + sp + p.level * 18 + book);
}

/* 换装后的战力变化（正数=更强） */
function equipDeltaPower(p, item) {
  if (!item || item.type === 'potion') return 0;
  const before = gearPower(p);
  const cur = p.equip[item.slot];
  p.equip[item.slot] = item;
  const after = gearPower(p);
  if (cur) p.equip[item.slot] = cur; else delete p.equip[item.slot];
  return Math.round(after - before);
}

/* 该装备是否不如身上的（可以卖） */
function isWorseThanEquipped(p, it) {
  if (!it || it.type === 'potion') return false;
  normalizeSlot(it);
  if (it.ringKey) return false;            // 特戒永远保留
  if (it.qKey === 'mythic') return false;  // 红色（神话）装备永远保留
  // 本命武器（武器种类适配本职业）永远保留
  if (it.slot === 'weapon' && it.wtype && DATA.WEAPON_KINDS[it.wtype]
      && DATA.WEAPON_KINDS[it.wtype].cls.includes(p.cls)) return false;
  const cur = p.equip[it.slot];
  if (!cur) return false;                 // 空槽位别卖
  return equipDeltaPower(p, it) <= 0;
}

/* 一键出售劣质装备，返回卖出件数与金币 */
function sellAllWorse(p) {
  let n = 0, gold = 0;
  for (let i = p.bag.length - 1; i >= 0; i--) {
    const it = p.bag[i];
    if (!isWorseThanEquipped(p, it)) continue;
    const q = DATA.QUALITY.find(x => x.key === it.qKey);
    const price = Math.round((20 + it.ilvl * 8) * Math.pow(2.2, DATA.QUALITY.indexOf(q)));
    p.gold += price; gold += price; n++;
    p.bag.splice(i, 1);
  }
  return { n, gold };
}

/* ---------------- 收藏图鉴 ---------------- */
function codexKills(p, bossKey) { return (p.codex && p.codex[bossKey]) || 0; }
function codexLevel(kills) {
  let lv = 0;
  for (const L of DATA.CODEX_LEVELS) if (kills >= L.kills) lv = L.lv;
  return lv;
}
function codexBonus(p, roomId) {
  const bossKey = DATA.ROOMS[roomId] && DATA.ROOMS[roomId].boss;
  if (!bossKey) return { dmg:0, drop:0, exp:0, lv:0 };
  const lv = codexLevel(codexKills(p, bossKey));
  if (!lv) return { dmg:0, drop:0, exp:0, lv:0 };
  const L = DATA.CODEX_LEVELS[lv - 1];
  return { dmg:L.dmg, drop:L.drop, exp:L.exp, lv };
}
/* 当前地图图鉴加成（战斗里用） */
function currentCodex(p) {
  if (!G.world || G.world.isTown) return { dmg:0, drop:0, exp:0, lv:0 };
  return codexBonus(p, G.world.roomId);
}

/* ---------------- 推荐战力 ---------------- */
function requiredCP(room, diff) {
  const base = DATA.ROOM_CP[room] || 3000;
  const mul = DATA.DIFF_CP_MUL[diff] || 1;
  return Math.round(base * mul);
}

/* 战力评估 */
function cpVerdict(have, need) {
  const r = need > 0 ? have / need : 2;
  if (r >= 1.00) return { key:'ok',   color:'#5fdc4a', text:'战力充足', ratio:r };
  if (r >= 0.80) return { key:'near', color:'#ffb347', text:'勉强能打', ratio:r };
  if (r >= 0.55) return { key:'low',  color:'#ff8a5a', text:'战力偏低', ratio:r };
  return           { key:'bad',  color:'#ff5a4a', text:'战力严重不足', ratio:r };
}

/* ---------------- 装备达成度 ---------------- */
/* 返回 { filled, minIdx, avgIdx, score, tierName } */
function gearTier(p) {
  const slots = DATA.LOOT_SLOTS;
  let filled = 0, minIdx = 99, sum = 0, score = 0;
  for (const sl of slots) {
    const it = p.equip[sl];
    if (it) {
      const qi = DATA.QUALITY.findIndex(q => q.key === it.qKey);
      filled++;
      minIdx = Math.min(minIdx, qi);
      sum += qi;
      score += (qi + 1) * 12 + it.ilvl * 2;
    }
  }
  if (filled === 0) return { filled: 0, minIdx: -1, avgIdx: -1, score: 0, tierName: '无装备' };
  const avgIdx = sum / filled;
  const tierName = filled === slots.length && minIdx >= 0
    ? DATA.QUALITY[minIdx].name
    : '未集齐';
  return { filled, minIdx, avgIdx, score, tierName };
}

/* 难度是否"装备够格"：返回 'ok' | 'low' | 'high' */
function diffReadiness(p, diffKey) {
  const gt = gearTier(p);
  if (gt.filled < DATA.LOOT_SLOTS.length) return 'low';
  const g = gt.minIdx;
  if (diffKey === 'normal') return g >= 1 ? 'ok' : 'low';
  if (diffKey === 'hard')   return g >= 2 ? 'ok' : 'low';
  if (diffKey === 'hell')   return g >= 3 ? 'ok' : 'low';
  return 'ok';
}

/* ---------------- 技能 ---------------- */
function learnSkill(p, key) {
  const sp = DATA.SKILLS[key];
  if (!sp || sp.cls !== p.cls) return false;
  if (!p.skills[key]) { p.skills[key] = 1; return 'new'; }
  if (p.skills[key] >= 5) return 'max';
  p.skills[key]++; recalcStats(p); return 'up';
}

function skillLevel(p, key) { return p.skills[key] || 0; }

/* ---------------- 存档 ---------------- */
const THEME = (typeof window !== 'undefined' && window.__THEME) || 'classic';
const SAVE_KEY = 'wow_like_save_v1_' + THEME;
const LEGACY_KEY = 'wow_like_save_v1';

/* 老存档迁移：经典版首次运行把旧 key 的内容搬过来 */
function migrateLegacySave() {
  try {
    if (THEME !== 'classic') return;
    if (localStorage.getItem(SAVE_KEY)) return;
    const old = localStorage.getItem(LEGACY_KEY);
    if (old) localStorage.setItem(SAVE_KEY, old);
  } catch (_) {}
}
migrateLegacySave();

const MAX_CHARS = 4;          // 一个存档最多 4 个角色

/* 把当前角色写回角色表 */
function syncActiveChar() {
  if (!Array.isArray(G.chars)) G.chars = [];
  if (G.player) G.chars[G.active] = G.player;
}

function saveGame() {
  if (!G.player) return;
  try {
    syncActiveChar();
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      v: 2, diff: G.diff, active: G.active, chars: G.chars, savedAt: Date.now()
    }));
    return true;
  } catch (e) { console.error(e); return false; }
}

/* 切换角色 */
function switchChar(idx) {
  if (!Array.isArray(G.chars) || !G.chars[idx]) return false;
  if (idx === G.active) return false;
  syncActiveChar();
  G.active = idx;
  G.player = G.chars[idx];
  migrateItemSlots(G.player);
  recalcStats(G.player);
  return true;
}

/* 新增角色（返回新索引，满 4 个返回 -1） */
function addChar(player) {
  if (!Array.isArray(G.chars)) G.chars = [];
  if (G.chars.length >= MAX_CHARS) return -1;
  syncActiveChar();
  G.chars.push(player);
  G.active = G.chars.length - 1;
  G.player = player;
  return G.active;
}

/* 删除角色（至少保留 1 个） */
function deleteChar(idx) {
  if (!Array.isArray(G.chars) || G.chars.length <= 1) return false;
  if (!G.chars[idx]) return false;
  syncActiveChar();
  G.chars.splice(idx, 1);
  if (idx < G.active) G.active--;
  else if (idx === G.active) G.active = Math.max(0, G.active - 1);
  G.active = Math.min(G.active, G.chars.length - 1);
  G.player = G.chars[G.active];
  recalcStats(G.player);
  return true;
}

function loadGameData(raw) {
  try {
    const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!d) return null;
    // v1：单角色 → 包成角色表
    if (d.player) return { v:2, diff: d.diff, active:0, chars:[d.player] };
    // v2：多角色
    if (Array.isArray(d.chars) && d.chars.length) {
      return { v:2, diff: d.diff, active: Math.min(d.active || 0, d.chars.length - 1), chars: d.chars };
    }
    return null;
  } catch (e) { return null; }
}

function loadGame() {
  const raw = localStorage.getItem(SAVE_KEY);
  const d = loadGameData(raw);
  if (!d) return false;
  G.diff = d.diff || 'normal';
  G.chars = d.chars || [];
  G.active = Math.min(d.active || 0, Math.max(0, G.chars.length - 1));
  G.player = G.chars[G.active];
  G.player.buffs = []; G.player.dots = []; G.player.cd = {};
  // 兼容：补齐缺失字段
  G.player.unlocked = G.player.unlocked || [0];
  if (!G.player.keymap) {
    const km = DATA.CLASSES[G.player.cls].keymap;
    G.player.keymap = { q: km.q, w: km.w, e: km.e, r: km.r, d: km.d };
    G.player.active = [km.q, km.w, km.e, km.r];
    G.player.dash = km.d;
  }
  G.player.kills = G.player.kills || 0;
  G.player.materials = G.player.materials || { iron:0, mithril:0, scale:0, shard:0 };
  // 旧存档迁移：单个 quest → 数组
  if (G.player.quest && !Array.isArray(G.player.quests)) {
    G.player.quests = [G.player.quest];
  }
  G.player.quests = G.player.quests || [];
  delete G.player.quest;
  G.player.questDone = G.player.questDone || 0;
  G.player.bagPage = G.player.bagPage || 0;
  G.player.skillProf = G.player.skillProf || {};
  G.player.firstKills = G.player.firstKills || {};
  G.player.codex = G.player.codex || {};
  G.player.ringDropAt = G.player.ringDropAt || {};
  // 迁移：旧 ring2~ring5 → 新专属槽
  ['ring2','ring3','ring4','ring5'].forEach(old => {
    const it = G.player.equip[old];
    if (it && it.ringKey) {
      delete G.player.equip[old];
      const slot = ringSlotOf(it.ringKey);
      if (slot && !G.player.equip[slot]) G.player.equip[slot] = it;
    } else if (it) delete G.player.equip[old];
  });
  if (!G.player.materials) G.player.materials = {};
  ['stone','protect','skillT','breakT'].forEach(k => { G.player.materials[k] = G.player.materials[k] || 0; });
  (G.player.bag || []).forEach(it => { if (it.type === 'potion' && !it.count) it.count = 1; });
  G.player.bossKills = G.player.bossKills || 0;
  migrateItemSlots(G.player);
  recalcStats(G.player);
  return true;
}

function hasSave() { return !!localStorage.getItem(SAVE_KEY); }
function clearSave() { localStorage.removeItem(SAVE_KEY); }

function exportSave() {
  saveGame();
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return;
  const blob = new Blob([raw], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `我的第一款游戏_存档_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importSave(file) {
  const reader = new FileReader();
  reader.onload = e => {
    const d = loadGameData(e.target.result);
    if (!d) { toast('存档文件无效'); return; }
    localStorage.setItem(SAVE_KEY, JSON.stringify(d));
    if (loadGame()) { toast('存档已导入'); startGame(); }
  };
  reader.readAsText(file);
}

/* ---------------- 消息 ---------------- */
function logMsg(text, type) {
  G.msgLog.push({ text, type: type || 'info', t: G.time });
  if (G.msgLog.length > 60) G.msgLog.shift();
}
