/* ============================================================
   数据表 V2：QWER+D 技能 / 重平衡数值 / 难度分级
   ============================================================ */
'use strict';

const DATA = {};

/* ---------------- 种族 ---------------- */
DATA.RACES = {
  human: { key:'human', name:'人族', desc:'均衡之民，适应力强', color:'#d8c27a',
    mod:{str:2,agi:2,int:2,vit:2}, extra:{all:2}, talent:'适应力：全属性额外 +2，经验获取 +10%', expBonus:0.10 },
  elf: { key:'elf', name:'精灵', desc:'月下之影，法术与精准', color:'#9fe6b8',
    mod:{str:-2,agi:5,int:5,vit:-2}, extra:{crit:0.05,mpRegen:0.20}, talent:'夜视：暴击率 +5%，法力回复 +20%' },
  orc: { key:'orc', name:'兽族', desc:'战歌之子，越强越强', color:'#b06a3c',
    mod:{str:6,agi:1,int:-3,vit:4}, extra:{berserk:0.25}, talent:'狂暴：生命低于 30% 时攻击力 +25%' },
  dwarf: { key:'dwarf', name:'矮人', desc:'山岩之躯，坚不可摧', color:'#b08a55',
    mod:{str:4,agi:-2,int:1,vit:6}, extra:{dr:0.08,goldBonus:0.15}, talent:'抗性：受到伤害 -8%，获得金币 +15%' }
};

/* ---------------- 职业（每职业 5 主动 + 2 被动 = 7） ---------------- */
DATA.CLASSES = {
  warrior: { key:'warrior', name:'战士', primary:'str', weapon:'剑', color:'#c0392b',
    desc:'近战坦克，抗打耐操',
    base:{hp:200, mp:40, atk:14, spell:0, as:1.00, armor:8},
    growth:{hp:24, mp:3, atk:2.4, spell:0, armor:1.6},
    skills:['whirlwind','shieldwall','battleShout','execute','charge','critMastery','toughness'],
    keymap:{ q:'whirlwind', w:'shieldwall', e:'battleShout', r:'execute', d:'charge' } },

  mage: { key:'mage', name:'法师', primary:'int', weapon:'法杖', color:'#5b8dd6',
    desc:'远程爆发，脆皮高伤',
    base:{hp:120, mp:140, atk:6, spell:16, as:0.90, armor:3},
    growth:{hp:13, mp:16, atk:1.0, spell:2.8, armor:0.7},
    skills:['fireball','frostNova','blizzard','arcaneTorrent','blink','arcaneMastery','manaSurge'],
    keymap:{ q:'fireball', w:'frostNova', e:'blizzard', r:'arcaneTorrent', d:'blink' } },

  archer: { key:'archer', name:'弓箭手', primary:'agi', weapon:'弓', color:'#4f9d63',
    desc:'远程持续，机动灵活',
    base:{hp:150, mp:70, atk:12, spell:0, as:1.15, armor:5},
    growth:{hp:17, mp:6, atk:2.0, spell:0, armor:1.1},
    skills:['multishot','pierceArrow','freezeTrap','rapidFire','backjump','eagleEye','swiftness'],
    keymap:{ q:'multishot', w:'pierceArrow', e:'freezeTrap', r:'rapidFire', d:'backjump' } },

  assassin: { key:'assassin', name:'刺客', primary:'agi', weapon:'匕首', color:'#8e44ad',
    desc:'近战爆发，暴击收割',
    base:{hp:135, mp:60, atk:16, spell:0, as:1.30, armor:4},
    growth:{hp:15, mp:5, atk:2.6, spell:0, armor:0.9},
    skills:['backstab','poisonBlade','fanOfKnives','vanish','shadowstep','lethality','shadowDance'],
    keymap:{ q:'backstab', w:'poisonBlade', e:'fanOfKnives', r:'vanish', d:'shadowstep' } }
};

/* ---------------- 技能 ----------------
   Q/W/E/R = 4 个战斗技能，D = 位移技能
------------------------------------------------ */
DATA.SKILLS = {
  /* --- 战士 --- */
  whirlwind:    {name:'旋风斩', cls:'warrior', type:'active', kind:'aoe', cd:8,  cost:0,  dmg:1.3, hits:3, radius:3.4, desc:'对周围敌人造成 3 段 130% 攻击力伤害'},
  shieldwall:   {name:'盾墙',   cls:'warrior', type:'active', kind:'buff', cd:30, cost:0, buff:{dr:0.45, dur:6}, desc:'6 秒内受到伤害降低 45%'},
  battleShout:  {name:'战斗怒吼',cls:'warrior', type:'active', kind:'buff', cd:30, cost:0, buff:{atkPct:0.30, dur:10}, desc:'10 秒内攻击力 +30%'},
  execute:      {name:'斩杀',   cls:'warrior', type:'active', kind:'melee', cd:12, cost:0, dmg:3.2, arc:1.6, range:3.0, execute:0.4, desc:'320% 攻击力；目标血量低于 40% 时伤害翻倍'},
  charge:       {name:'冲锋',   cls:'warrior', type:'active', kind:'dash', cd:10, cost:0, dmg:1.2, range:9, stun:0.8, desc:'冲向目标，眩晕 0.8 秒'},
  critMastery:  {name:'致命一击',cls:'warrior', type:'passive', kind:'passive', desc:'暴击率 +15%，暴击伤害 +50%', passive:{crit:0.15, critDmg:0.5}},
  toughness:    {name:'坚韧',   cls:'warrior', type:'passive', kind:'passive', desc:'生命上限 +15%', passive:{hpPct:0.15}},

  /* --- 法师 --- */
  fireball:     {name:'火球术', cls:'mage', type:'active', kind:'proj', cd:1.6, cost:10, dmg:1.8, speed:18, burn:{dps:0.30, dur:3}, desc:'180% 法强伤害并灼烧 3 秒'},
  frostNova:    {name:'冰霜新星',cls:'mage', type:'active', kind:'aoe', cd:12, cost:20, dmg:0.9, radius:4.0, freeze:1.6, desc:'冻结周围敌人 1.6 秒'},
  blizzard:     {name:'暴风雪', cls:'mage', type:'active', kind:'aoe', cd:16, cost:35, dmg:1.0, hits:4, radius:5.0, desc:'区域持续伤害 4 段'},
  arcaneTorrent:{name:'奥术洪流',cls:'mage', type:'active', kind:'aoe', cd:22, cost:45, dmg:2.6, radius:4.4, desc:'对周围敌人造成 260% 法强伤害'},
  blink:        {name:'闪现',   cls:'mage', type:'active', kind:'blink', cd:9, cost:8, dist:9, desc:'向鼠标方向瞬移 9 米'},
  arcaneMastery:{name:'奥术精通',cls:'mage', type:'passive', kind:'passive', desc:'法术强度 +18%', passive:{spellPct:0.18}},
  manaSurge:    {name:'法力涌动',cls:'mage', type:'passive', kind:'passive', desc:'击杀敌人恢复 8% 法力', passive:{killMana:0.08}},

  /* --- 弓箭手 --- */
  multishot:    {name:'多重射击',cls:'archer', type:'active', kind:'proj', cd:5,  cost:8,  dmg:0.9, count:3,  spread:0.30, speed:20, desc:'同时射出 3 箭，每箭 90%'},
  pierceArrow:  {name:'穿透箭', cls:'archer', type:'active', kind:'proj', cd:7,  cost:10, dmg:2.2, speed:26, pierce:true, desc:'直线穿透，220% 攻击力'},
  freezeTrap:   {name:'冰冻陷阱',cls:'archer', type:'active', kind:'trap', cd:14, cost:12, dmg:1.2, root:2.5, radius:2.6, desc:'放置陷阱，触发定身 2.5 秒'},
  rapidFire:    {name:'急速射击',cls:'archer', type:'active', kind:'buff', cd:24, cost:0, buff:{asPct:0.60, dur:8}, desc:'8 秒内攻速 +60%'},
  backjump:     {name:'后跳',   cls:'archer', type:'active', kind:'blink', cd:8, cost:0, dist:7, desc:'向后跳 7 米'},
  eagleEye:     {name:'鹰眼',   cls:'archer', type:'passive', kind:'passive', desc:'暴击率 +12%', passive:{crit:0.12}},
  swiftness:    {name:'疾风',   cls:'archer', type:'passive', kind:'passive', desc:'攻击速度 +12%', passive:{asPct:0.12}},

  /* --- 刺客 --- */
  backstab:     {name:'背刺',   cls:'assassin', type:'active', kind:'melee', cd:4,  cost:0, dmg:2.4, arc:1.6, range:2.8, desc:'对前方敌人造成 240% 伤害'},
  poisonBlade:  {name:'毒刃',   cls:'assassin', type:'active', kind:'melee', cd:6,  cost:6, dmg:1.0, arc:1.8, range:2.8, poison:{dps:0.35, dur:6}, desc:'附加中毒，每秒 35% 攻击力，持续 6 秒'},
  fanOfKnives:  {name:'刀扇',   cls:'assassin', type:'active', kind:'aoe', cd:9,  cost:10, dmg:1.4, radius:3.8, desc:'对周围所有敌人造成 140% 伤害'},
  vanish:       {name:'消失',   cls:'assassin', type:'active', kind:'buff', cd:26, cost:12, buff:{invis:2.5, nextCrit:true, asPct:0.4, dur:2.5}, desc:'隐身 2.5 秒，攻速 +40%，下次攻击必暴击'},
  shadowstep:   {name:'影袭',   cls:'assassin', type:'active', kind:'dash', cd:8, cost:0, dmg:1.6, range:10, desc:'瞬移到目标背后并造成 160% 伤害'},
  lethality:    {name:'致命偷袭',cls:'assassin', type:'passive', kind:'passive', desc:'暴击伤害 +60%', passive:{critDmg:0.6}},
  shadowDance:  {name:'影舞',   cls:'assassin', type:'passive', kind:'passive', desc:'击杀后 3 秒内攻速 +35%', passive:{killAs:0.35}}
};

/* ---------------- 装备 ---------------- */
DATA.SLOTS = {
  weapon:{name:'武器', icon:'⚔'}, helm:{name:'头盔', icon:'⛑'},
  chest:{name:'胸甲', icon:'🛡'},  legs:{name:'护腿', icon:'👖'},
  boots:{name:'战靴', icon:'🥾'},  neck:{name:'项链', icon:'📿'},
  ring:{name:'戒指', icon:'💍'},   ring2:{name:'印记', icon:'◎'},
  ring3:{name:'副印记', icon:'◉'},
  trinket:{name:'饰品', icon:'🔮'}
};

/* 品质：白→绿→蓝→紫→橙→红（数值拉开，让"集齐某档"有质变） */
DATA.QUALITY = [
  {key:'common',   name:'普通', color:'#c8c8c8', affixes:0, mult:1.00, lvl:0,  weight:4200},
  {key:'uncommon', name:'优秀', color:'#3fd45a', affixes:1, mult:1.35, lvl:1,  weight:2800},
  {key:'rare',     name:'精良', color:'#4a9eff', affixes:2, mult:1.80, lvl:4,  weight:1600},
  {key:'epic',     name:'史诗', color:'#b45cff', affixes:3, mult:2.40, lvl:9,  weight:520},
  {key:'legendary',name:'传说', color:'#ff9a2e', affixes:4, mult:3.20, lvl:16, weight:120},
  {key:'mythic',   name:'神话', color:'#ff3b3b', affixes:5, mult:4.40, lvl:24, weight:16}
];

DATA.BOSS_WEIGHTS = {rare:3600, epic:3800, legendary:2100, mythic:500};

DATA.AFFIXES = [
  {key:'str',name:'力量',v:[2,6],scale:0.35}, {key:'agi',name:'敏捷',v:[2,6],scale:0.35},
  {key:'int',name:'智力',v:[2,6],scale:0.35}, {key:'vit',name:'体质',v:[2,6],scale:0.35},
  {key:'atk',name:'攻击力',v:[5,14],scale:0.85}, {key:'spell',name:'法术强度',v:[5,14],scale:0.85},
  {key:'as',name:'攻击速度',v:[3,9],scale:0.0015,pct:true},
  {key:'crit',name:'暴击率',v:[2,5],scale:0.0012,pct:true},
  {key:'critDmg',name:'暴击伤害',v:[8,20],scale:0.004,pct:true},
  {key:'armor',name:'护甲',v:[6,16],scale:0.85},
  {key:'hp',name:'生命值',v:[20,60],scale:2.4},
  {key:'dodge',name:'闪避率',v:[1,4],scale:0.001,pct:true},
  {key:'lifesteal',name:'吸血',v:[1,3],scale:0.0008,pct:true},
  {key:'hit',name:'命中',v:[2,5],scale:0.001,pct:true},
  {key:'mp',name:'法力值',v:[12,36],scale:1.6},
  {key:'all',name:'全属性',v:[1,4],scale:0.2}
];

DATA.ITEM_NAMES = {
  weapon:['长剑','战斧','法杖','猎弓','匕首','巨锤','符文剑'],
  helm:['头盔','兜帽','王冠','面甲'], chest:['胸甲','法袍','皮甲','链甲'],
  legs:['护腿','战裙','腿甲'], boots:['战靴','软履','铁靴'],
  neck:['项链','护符','吊坠'], ring:['戒指','指环','印记'],
  trinket:['饰品','图腾','宝珠','徽记']
};

/* ---------------- 怪物（数值已按房间定死，不再叠加等级系数） ---------------- */
DATA.MONSTERS = {
  centaur:   {name:'半人马斥候', color:'#a9825a', hp:60, atk:6,  spd:2.7, r:17, exp:14,  gold:[8,18]},
  kobold:    {name:'狗头人矿工', color:'#b5651d', hp:140, atk:11, spd:2.3, r:17, exp:32,  gold:[16,34]},
  grunt:     {name:'兽人步兵',   color:'#6b8e23', hp:260, atk:18, spd:2.4, r:19, exp:62,  gold:[28,58]},
  skeleton:  {name:'骷髅战士',   color:'#dcd6c8', hp:430, atk:27, spd:2.5, r:18, exp:110, gold:[44,88]},
  doomguard: {name:'恶魔卫士',   color:'#7d2b8b', hp:650, atk:38, spd:2.5, r:21, exp:180, gold:[64,128]},
  abyssal:   {name:'深渊魔仆',   color:'#c0392b', hp:950, atk:52, spd:2.4, r:22, exp:280, gold:[90,180]}
};

/* BOSS：魔兽争霸3 冰封王座角色 */
DATA.BOSSES = {
  bossWolf:     {name:'半人马可汗',      title:'贫瘠之地的可汗',  color:'#c09a70', hp:1500, atk:12,  spd:2.6, r:30, exp:320,  gold:[200,400]},
  bossKobold:   {name:'狗头人地卜师',    title:'矿洞的守财奴',    color:'#c97b2e', hp:4200, atk:15,  spd:2.3, r:32, exp:800,  gold:[450,800]},
  bossGrom:     {name:'格罗姆·地狱咆哮', title:'战歌氏族的酋长',  color:'#7a9b2e', hp:11500, atk:34,  spd:2.5, r:34, exp:1800, gold:[900,1500]},
  bossKel:      {name:'克尔苏加德',      title:'亡灵天灾的巫妖',  color:'#7fb3d5', hp:25000, atk:54,  spd:2.3, r:34, exp:3400, gold:[1600,2600]},
  bossMannoroth:{name:'玛诺洛斯',        title:'燃烧军团的毁灭者',color:'#a83232', hp:52000, atk:98,  spd:2.4, r:38, exp:6000, gold:[2800,4400]},
  bossArchimonde:{name:'阿克蒙德',       title:'污染者',          color:'#5b2c6f', hp:95000, atk:145, spd:2.5, r:40, exp:10000,gold:[5000,8000]}
};

/* ---------------- 房间 ---------------- */
DATA.ROOMS = [
  {id:0, name:'贫瘠之地',    lv:1,  mons:'centaur',   boss:'bossWolf',      count:50, elite:20, bosses:2,  bg:'#26221a', accent:'#5a4a32', desc:'半人马在荒野游荡'},
  {id:1, name:'废弃矿洞',    lv:6,  mons:'kobold',    boss:'bossKobold',    count:50, elite:20, bosses:2, bg:'#241f18', accent:'#5a4a30', desc:'矿车早已锈死'},
  {id:2, name:'兽人营地',    lv:11, mons:'grunt',     boss:'bossGrom',      count:50, elite:20, bosses:2, bg:'#241a14', accent:'#6b4a2a', desc:'战鼓声从未停歇'},
  {id:3, name:'亡灵墓穴',    lv:16, mons:'skeleton',  boss:'bossKel',       count:50, elite:20, bosses:2, bg:'#1a1f26', accent:'#3f5568', desc:'死亡并非终点'},
  {id:4, name:'燃烧军团裂隙',lv:21, mons:'doomguard', boss:'bossMannoroth', count:50, elite:20, bosses:2, bg:'#26141a', accent:'#6b2438', desc:'虚空在低语'},
  {id:5, name:'深渊祭坛',    lv:26, mons:'abyssal',   boss:'bossArchimonde',count:50, elite:20, bosses:2, bg:'#1c1226', accent:'#4a2a6b', desc:'污染者的王座'}
];

DATA.POTIONS = [
  {key:'hp1', name:'小型红药', price:50,  hp:120,  color:'#e74c3c'},
  {key:'hp2', name:'中型红药', price:150, hp:380,  color:'#c0392b'},
  {key:'mp1', name:'小型蓝药', price:60,  mp:90,   color:'#3498db'},
  {key:'mp2', name:'中型蓝药', price:180, mp:280,  color:'#2980b9'}
];

DATA.BOOKS = {
  str:{name:'《力量之书》', color:'#e67e22', stat:'str'},
  agi:{name:'《敏捷之书》', color:'#2ecc71', stat:'agi'},
  int:{name:'《智力之书》', color:'#9b59b6', stat:'int'}
};

/* ---------------- 难度（每次进图选择） ---------------- */
DATA.DIFFICULTY = {
  normal:{key:'normal', name:'简单', hpMul:1.00, atkMul:1.00, dropMul:1.00, expMul:1.00, color:'#7fd4a8', req:'绿装'},
  hard:  {key:'hard',   name:'困难', hpMul:2.20, atkMul:1.45, dropMul:1.35, expMul:1.60, color:'#ffb347', req:'蓝装'},
  hell:  {key:'hell',   name:'地狱', hpMul:4.60, atkMul:2.60, dropMul:1.80, expMul:2.40, color:'#ff5a40', req:'紫装'}
};
DATA.DIFF_ORDER = ['normal', 'hard', 'hell'];

/* ---------------- 材料（合成史诗装备用） ---------------- */
DATA.MATERIALS = {
  iron:   {name:'魔铁锭', color:'#9aa0a6', icon:'▰'},
  mithril:{name:'秘银矿', color:'#7fb3d5', icon:'▰'},
  scale:  {name:'龙鳞片', color:'#ff9a2e', icon:'▰'},
  shard:  {name:'虚空碎片', color:'#b45cff', icon:'▰'},
  stone:  {name:'强化石',     color:'#9aa0a6', icon:'◆'},
  protect:{name:'强化保护券', color:'#4a9eff', icon:'◇'},
  skillT: {name:'技能强化券', color:'#3fd45a', icon:'✦'},
  breakT: {name:'技能突破券', color:'#b45cff', icon:'✧'}
};

/* 合成配方：3 材料 + 金币 → 指定品质随机部位 */
DATA.CRAFT = [
  {need:{iron:8, mithril:4},            gold:1200, quality:'epic',      name:'史诗装备（随机部位）'},
  {need:{mithril:8, scale:4},           gold:3600, quality:'legendary', name:'传说装备（随机部位）'},
  {need:{scale:6, shard:6},             gold:9000, quality:'mythic',    name:'神话装备（随机部位）'}
];

/* ---------------- 悬赏任务 ---------------- */
DATA.QUEST_POOL = [
  {id:'q1', name:'清剿荒野', room:0, need:12, exp:260,  gold:220,  mat:'iron',    matN:2},
  {id:'q2', name:'矿洞除虫', room:1, need:15, exp:620,  gold:480,  mat:'iron',    matN:3},
  {id:'q3', name:'击退兽人', room:2, need:18, exp:1400, gold:900,  mat:'mithril', matN:2},
  {id:'q4', name:'净化亡灵', room:3, need:20, exp:2600, gold:1500, mat:'mithril', matN:3},
  {id:'q5', name:'封印恶魔', room:4, need:22, exp:4800, gold:2600, mat:'scale',   matN:2},
  {id:'q6', name:'深渊终战', room:5, need:25, exp:8000, gold:4200, mat:'shard',   matN:1}
];

/* ---------------- 职业专属套装（每图一套，共 6×4 = 24 套） ---------------- */
const SET_SLOTS = ['weapon','helm','chest','legs','boots','neck'];
DATA.SET_SLOTS = SET_SLOTS;

const SET_NAMES = {
  warrior:  ['荒野破军', '矿脉破军', '战歌破军', '亡灵破军', '燃烧破军', '深渊破军'],
  mage:     ['荒野霜语', '矿脉霜语', '战歌霜语', '亡灵霜语', '燃烧霜语', '深渊霜语'],
  archer:   ['荒野风行', '矿脉风行', '战歌风行', '亡灵风行', '燃烧风行', '深渊风行'],
  assassin: ['荒野影杀', '矿脉影杀', '战歌影杀', '亡灵影杀', '燃烧影杀', '深渊影杀']
};

DATA.SETS = {};
for (const cls in SET_NAMES) {
  DATA.SETS[cls] = SET_NAMES[cls].map((name, room) => ({
    key: cls + '_' + room,
    cls, room, name,
    color: DATA.ROOMS[room].accent,
    primary: DATA.CLASSES[cls].primary,
    slots: SET_SLOTS,
    total: 6,
    b4: { pct: 0.10 + room * 0.05 },                       // 4 件：主属性 +10%~+35%
    b6: { flat: 15 + room * 10, skillDmg: 0.08 + room * 0.05 } // 6 件：主属性 +15~+65，技能 +8%~+33%
  }));
}

/* 技能 → 图标索引（skills.png 24 格）
   0火 1水 2石 3叶 4星 5幽 6电 7爆
   8星芒 9紫焰 10咒 11骷髅 12钩 13箭
   14红宝 15蓝宝 16金宝 17绿宝 18银宝 19紫宝 20白宝 21黑宝
   22剑 23斧 */
DATA.SKILL_ICON = {
  whirlwind:22, shieldwall:18, battleShout:4, execute:11, charge:13,
  critMastery:8, toughness:2,
  fireball:0, frostNova:1, blizzard:20, arcaneTorrent:19, blink:13,
  arcaneMastery:9, manaSurge:15,
  multishot:13, pierceArrow:12, freezeTrap:1, rapidFire:6, backjump:13,
  eagleEye:20, swiftness:6,
  backstab:22, poisonBlade:3, fanOfKnives:23, vanish:5, shadowstep:21,
  lethality:11, shadowDance:5
};

/* ---------------- 强化 ---------------- */
DATA.ENHANCE = {
  max: 15,
  goldCost: lv => 120 * (lv + 1) * (lv + 1),
  stoneCost: lv => 1 + Math.floor(lv / 2),
  rate: lv => lv < 5 ? 1.0 : (lv < 10 ? 0.72 : 0.45),
  failDrop: lv => lv >= 11 ? 1 : 0,
  statMul: lv => 1 + lv * 0.06          // +15 → +90%
};

/* ---------------- 技能强化 ---------------- */
DATA.SKILL_TIER = {
  maxTier: 5,
  needProf: 100,
  tierDmg: 0.08,       // 每层 +8% 伤害
  tierCd: 0.05,        // 每层 -5% 冷却
  killProf: 1.5,       // 每杀一只怪 +1.5%
  ticketProf: 15       // 技能强化券 +15%
};

/* ---------------- 爬塔 ---------------- */
DATA.TOWER = {
  maxFloor: 20,
  dailyAttempts: 2,
  hpMul: f => 1 + (f - 1) * 0.62,
  atkMul: f => 1 + (f - 1) * 0.30,
  reward: f => ({
    gold: 1200 * f,
    stone: 2 + Math.floor(f / 2),
    protect: f % 5 === 0 ? 1 : 0,
    skillT: f % 3 === 0 ? 1 : 0,
    breakT: f % 10 === 0 ? 1 : 0
  })
};

/* ---------------- 材料 / 券 ---------------- */
DATA.MATS2 = {
  stone:   {name:'强化石',     color:'#9aa0a6'},
  protect: {name:'强化保护券', color:'#4a9eff'},
  skillT:  {name:'技能强化券', color:'#3fd45a'},
  breakT:  {name:'技能突破券', color:'#b45cff'}
};

/* ---------------- BOSS 首杀戒指 ---------------- */
DATA.BOSS_RINGS = {
  bossWolf:      {name:'可汗之戒', effect:{expBonus:0.15},  desc:'经验获取 +15%'},
  bossKobold:    {name:'矿脉之戒', effect:{goldBonus:0.30}, desc:'金币获取 +30%'},
  bossGrom:      {name:'战歌之戒', effect:{lifesteal:0.05}, desc:'吸血 +5%'},
  bossKel:       {name:'亡灵之戒', effect:{cleave:0.05},    desc:'5% 概率斩掉目标 5% 最大生命'},
  bossMannoroth: {name:'燃烧之戒', effect:{critDmg:0.35},   desc:'暴击伤害 +35%'},
  bossArchimonde:{name:'深渊之戒', effect:{dropBonus:0.35}, desc:'掉落品质 +35%'}
};

DATA.MAX_LEVEL = 30;
DATA.expForLevel = (lv) => Math.floor(100 * Math.pow(lv, 1.5));
