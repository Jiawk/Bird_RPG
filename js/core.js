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
    skillProf: {}, firstKills: {},
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
    * (1 + pas.atkPct + bf.atkPct);

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
    setBonus: SB,
    as: cls.base.as * (1 + A.agi / 500) * (1 + pas.asPct + bf.asPct),
    crit: clamp(0.05 + A.agi / 2000 + eq.crit + pas.crit + (bonus.crit || 0), 0, 0.6),
    critDmg: 1.5 + eq.critDmg + pas.critDmg,
    dodge: clamp(A.agi / 3000 + eq.dodge, 0, 0.3),
    armor,
    dr: clamp(dr + bf.dr, 0, 0.85),
    lifesteal: eq.lifesteal || 0,
    mpRegen: (0.02 * (1 + (bonus.mpRegen || 0))),
    goldBonus: bonus.goldBonus || 0,
    expBonus: race.expBonus || 0,
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
  const names = DATA.ITEM_NAMES[slot];
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
    name, ilvl, reqLv: Math.max(1, ilvl + q.lvl), stats, enh: 0
  };
}

/* ---------------- 装备 / 背包 ---------------- */
const BAG_PAGE_SIZE = 24;
const BAG_PAGES = 6;              // 6 页 = 144 格
const BAG_MAX = BAG_PAGE_SIZE * BAG_PAGES;

function equipItem(p, item) {
  if (item.reqLv > p.level) { toast('等级不足，无法装备'); return false; }
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
  const q = DATA.QUALITY.find(x => x.key === item.qKey);
  const idx = DATA.QUALITY.indexOf(q);
  const price = Math.round((20 + item.ilvl * 8) * Math.pow(2.2, idx));
  p.gold += price;
  removeFromBag(p, item);
  toast(`出售 ${item.name} +${price} 金`);
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

/* ---------------- BOSS 首杀戒指 ---------------- */
function grantFirstKillRing(p, bossKey) {
  const def = DATA.BOSS_RINGS[bossKey];
  if (!def) return null;
  if (!p.firstKills) p.firstKills = {};
  if (p.firstKills[bossKey]) return null;
  p.firstKills[bossKey] = true;
  const ring = {
    id: 'ring_' + bossKey + '_' + Date.now(),
    type: 'ring', slot: 'ring2', qKey: 'legendary', qName: '传说',
    color: '#ff9a2e', name: def.name, ilvl: 20, reqLv: 1, enh: 0,
    setKey: null, stats: {}, effect: def.effect, effectDesc: def.desc,
    bound: true
  };
  if (!p.equip.ring2) p.equip.ring2 = ring;
  else addToBag(p, ring);
  recalcStats(p);
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

/* ---------------- 装备达成度 ---------------- */
/* 返回 { filled, minIdx, avgIdx, score, tierName } */
function gearTier(p) {
  const slots = Object.keys(DATA.SLOTS);
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
  if (gt.filled < Object.keys(DATA.SLOTS).length) return 'low';
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
const SAVE_KEY = 'wow_like_save_v1';

function saveGame() {
  if (!G.player) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      v: 1, diff: G.diff, player: G.player, savedAt: Date.now()
    }));
    return true;
  } catch (e) { console.error(e); return false; }
}

function loadGameData(raw) {
  try {
    const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!d || !d.player) return null;
    return d;
  } catch (e) { return null; }
}

function loadGame() {
  const raw = localStorage.getItem(SAVE_KEY);
  const d = loadGameData(raw);
  if (!d) return false;
  G.diff = d.diff || 'normal';
  G.player = d.player;
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
  if (!G.player.materials) G.player.materials = {};
  ['stone','protect','skillT','breakT'].forEach(k => { G.player.materials[k] = G.player.materials[k] || 0; });
  (G.player.bag || []).forEach(it => { if (it.type === 'potion' && !it.count) it.count = 1; });
  G.player.bossKills = G.player.bossKills || 0;
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
