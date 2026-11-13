/* ============================================================
   数据表 V2：QWER+D 技能 / 重平衡数值 / 难度分级
   ============================================================ */
'use strict';

const DATA = {};

/* ---------------- 种族 ---------------- */
DATA.RACES = {
  human: {
    key:'human', name:'人类', color:'#3c6db0',
    desc:'联盟的中坚力量，攻守均衡，适应力强',
    mod:{str:2, agi:1, int:1, vit:2},
    talent:'外交：金币获取 +15%', extra:{goldBonus:0.15}
  },
  orc: {
    key:'orc', name:'兽人', color:'#8b2f22',
    desc:'崇尚荣耀的战士民族，越战越勇',
    mod:{str:3, agi:1, int:-1, vit:2},
    talent:'狂暴：生命低于 30% 时攻击 +30%', extra:{berserk:0.30}
  },
  undead: {
    key:'undead', name:'亡灵', color:'#5a7a5a',
    desc:'被遗忘者的复仇军团，肉身早已腐朽',
    mod:{str:1, agi:1, int:2, vit:0},
    talent:'亡者之躯：受到伤害减免 8%', extra:{dr:0.08}
  },
  elf: {
    key:'elf', name:'暗夜精灵', color:'#6b4fa0',
    desc:'月光下的古老守护者，敏捷而致命',
    mod:{str:0, agi:3, int:1, vit:0},
    talent:'影遁：闪避 +8%，经验 +10%', extra:{dodge:0.08}, expBonus:0.10
  }
};

/* ---------------- 职业（每职业 5 主动 + 2 被动 = 7） ---------------- */
DATA.CLASSES = {
  warrior: { key:'warrior', name:'剑圣', primary:'str', weapon:'剑', color:'#c0392b',
    desc:'挥刀成风、以力破巧的近战英雄',
    base:{hp:200, mp:40, atk:14, spell:0, as:1.00, armor:8},
    growth:{hp:24, mp:3, atk:2.4, spell:0, armor:1.6},
    skills:['whirlwind','shieldwall','battleShout','execute','charge','critMastery','toughness'],
    keymap:{ q:'whirlwind', w:'shieldwall', e:'battleShout', r:'execute', d:'charge' } },

  mage: { key:'mage', name:'大法师', primary:'int', weapon:'法杖', color:'#5b8dd6',
    desc:'掌控奥术与冰霜的施法者',
    base:{hp:120, mp:140, atk:6, spell:16, as:0.90, armor:3},
    growth:{hp:13, mp:16, atk:1.0, spell:2.8, armor:0.7},
    skills:['fireball','frostNova','blizzard','arcaneTorrent','blink','arcaneMastery','manaSurge'],
    keymap:{ q:'fireball', w:'frostNova', e:'blizzard', r:'arcaneTorrent', d:'blink' } },

  archer: { key:'archer', name:'月之女祭司', primary:'agi', weapon:'弓', color:'#4f9d63',
    desc:'月神庇佑的远程猎手',
    base:{hp:150, mp:70, atk:12, spell:0, as:1.15, armor:5},
    growth:{hp:17, mp:6, atk:2.0, spell:0, armor:1.1},
    skills:['multishot','pierceArrow','freezeTrap','rapidFire','backjump','eagleEye','swiftness'],
    keymap:{ q:'multishot', w:'pierceArrow', e:'freezeTrap', r:'rapidFire', d:'backjump' } },

  assassin: { key:'assassin', name:'恶魔猎手', primary:'agi', weapon:'匕首', color:'#8e44ad',
    desc:'追逐恶魔之力、以命换命的刺客',
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
  ring:{name:'戒指', icon:'💍'},
  trinket:{name:'饰品', icon:'🔮'},
  ring_exp:{name:'经验之戒', icon:'◎'},
  ring_revive:{name:'复活之戒', icon:'✦'},
  ring_summon:{name:'召唤之戒', icon:'❖'},
  ring_cleave:{name:'切割之戒', icon:'◆'},
  ring_drop:{name:'爆率之戒', icon:'◇'},
  ring_gather:{name:'聚合之戒', icon:'❂'}
};

/* 品质：白→绿→蓝→紫→橙→红（数值拉开，让"集齐某档"有质变） */
DATA.QUALITY = [
  {key:'common',   name:'普通', color:'#c8c8c8', affixes:0, mult:1.00, lvl:0,  weight:4200},
  {key:'uncommon', name:'优秀', color:'#3fd45a', affixes:1, mult:1.35, lvl:1,  weight:2800},
  {key:'rare',     name:'精良', color:'#4a9eff', affixes:2, mult:1.80, lvl:4,  weight:1600},
  {key:'epic',     name:'史诗', color:'#b45cff', affixes:3, mult:2.40, lvl:9,  weight:520},
  {key:'legendary',name:'传说', color:'#ff9a2e', affixes:4, mult:3.20, lvl:16, weight:120},
  {key:'mythic',   name:'神话', color:'#ff3b3b', affixes:5, mult:4.40, lvl:24, weight:185},
  {key:'relic',    name:'圣物', color:'#ffe9a8', affixes:6, mult:5.60, lvl:34, weight:0}
];

DATA.BOSS_WEIGHTS = {rare:3600, epic:3800, legendary:2100, mythic:200};   // 神话 2%

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

/* ---------------- 武器种类（与本命职业匹配有加成） ---------------- */
/* 圣物武器：200k 金币兑换，20 级可用，属性优于同级别神话装备 */
DATA.RELIC_WEAPONS = [
  { key:'relic_sword', cls:'warrior', wtype:'sword',
    name:'圣物·灰烬使者', color:'#ffe9a8', price:500000, reqLv:20,
    stats:{ atk:760, str:120, critDmg:0.60, crit:0.10, skillDmg:0.05, hit:0.12 },
    relicPct:0.05,
    desc:'命中即削掉目标 5% 最大生命；技能增伤 5%' },
  { key:'relic_staff', cls:'mage', wtype:'staff',
    name:'圣物·艾露尼斯', color:'#ffe9a8', price:500000, reqLv:20,
    stats:{ spell:760, int:120, critDmg:0.60, crit:0.10, skillDmg:0.05, hit:0.12 },
    relicPct:0.05,
    desc:'命中即削掉目标 5% 最大生命；技能增伤 5%' },
  { key:'relic_bow', cls:'archer', wtype:'bow',
    name:'圣物·索利达尔', color:'#ffe9a8', price:500000, reqLv:20,
    stats:{ atk:760, agi:120, critDmg:0.60, crit:0.10, skillDmg:0.05, hit:0.12 },
    relicPct:0.05,
    desc:'命中即削掉目标 5% 最大生命；技能增伤 5%' },
  { key:'relic_dagger', cls:'assassin', wtype:'dagger',
    name:'圣物·埃辛诺斯', color:'#ffe9a8', price:500000, reqLv:20,
    stats:{ atk:760, agi:120, critDmg:0.60, crit:0.15, skillDmg:0.05, hit:0.12 },
    relicPct:0.05,
    desc:'命中即削掉目标 5% 最大生命；技能增伤 5%' }
];


/* 圣物套装：4 职业 × 7 件，金币兑换，单件强于神话（红装）
   套装效果：3件 四维+6% ｜ 5件 最终伤害+6% ｜ 7件 经验/爆率/吸血 各+6% */
DATA.RELIC_SETS = {
  /* 剑圣：护甲 & 血量显著高于其他职业，附物理攻击与物爆 */
  warrior: {
    cls:'warrior', name:'破军', full:'破军·天罡', color:'#ffe9a8', price:500000, reqLv:20,
    pieces: {
      helm:    { slotName:'战盔', stats:{ armor:760, hp:2400, str:300, atk:420, crit:0.05 } },
      chest:   { slotName:'胸甲', stats:{ armor:1100, hp:3600, str:380, atk:560, crit:0.06 } },
      legs:    { slotName:'腿铠', stats:{ armor:920, hp:2900, str:340, atk:500, crit:0.05 } },
      boots:   { slotName:'战靴', stats:{ armor:700, hp:2200, str:280, atk:440, as:0.03 } },
      neck:    { slotName:'项饰', stats:{ armor:320, hp:1600, str:260, atk:520, crit:0.09, critDmg:0.45 } },
      ring:    { slotName:'指环', stats:{ armor:300, hp:1500, str:250, atk:480, crit:0.07, hit:0.06 } },
      trinket: { slotName:'印记', stats:{ armor:280, hp:1400, str:260, atk:500, lifesteal:0.03, critDmg:0.35 } }
    }
  },
  /* 法师：法术暴击 / 冷却缩减 / 蓝量 / 技能增伤 */
  mage: {
    cls:'mage', name:'星穹', full:'星穹·霜语', color:'#ffe9a8', price:500000, reqLv:20,
    pieces: {
      helm:    { slotName:'兜帽', stats:{ armor:420, int:300, hp:1600, mp:700, crit:0.06, skillDmg:0.02 } },
      chest:   { slotName:'法袍', stats:{ armor:600, int:380, hp:2200, mp:1000, crit:0.07, skillDmg:0.03 } },
      legs:    { slotName:'护腿', stats:{ armor:500, int:340, hp:1900, mp:850, cdr:0.03, skillDmg:0.02 } },
      boots:   { slotName:'布靴', stats:{ armor:380, int:280, hp:1500, mp:650, cdr:0.03, skillDmg:0.02 } },
      neck:    { slotName:'颈饰', stats:{ int:320, spell:620, mp:1200, crit:0.10, critDmg:0.40, skillDmg:0.03 } },
      ring:    { slotName:'指环', stats:{ int:300, spell:560, mp:1100, crit:0.09, cdr:0.04, skillDmg:0.03 } },
      trinket: { slotName:'秘宝', stats:{ int:310, spell:580, mp:1150, crit:0.08, critDmg:0.40, skillDmg:0.04 } }
    }
  },
  /* 月之女祭司：纯物理射手 —— 攻速 / 攻击 / 吸血 / 物爆 / 物爆伤 / 命中（无智力、无生命） */
  archer: {
    cls:'archer', name:'月华', full:'月华·流光', color:'#ffe9a8', price:500000, reqLv:20,
    pieces: {
      helm:    { slotName:'轻盔', stats:{ armor:380, agi:340, atk:1250, hp:900, dr:0.02, as:0.06, crit:0.05 } },
      chest:   { slotName:'皮甲', stats:{ armor:520, agi:400, atk:1300, hp:1400, dr:0.03, as:0.07, crit:0.06 } },
      legs:    { slotName:'护腿', stats:{ armor:440, agi:350, atk:1100, hp:1100, dr:0.02, as:0.06, crit:0.05 } },
      boots:   { slotName:'疾行靴', stats:{ armor:380, agi:380, atk:1300, hp:800, dr:0.02, as:0.12, crit:0.04 } },
      neck:    { slotName:'月链', stats:{ agi:440, atk:1650, hp:700, dr:0.02, crit:0.09, critDmg:0.35, hit:0.06 } },
      ring:    { slotName:'月戒', stats:{ agi:420, atk:1350, hp:700, dr:0.02, crit:0.08, critDmg:0.35, as:0.05 } },
      trinket: { slotName:'月符', stats:{ agi:430, atk:1400, hp:700, dr:0.03, lifesteal:0.04, crit:0.06, hit:0.06 } }
    }
  },
  /* 恶魔猎手：攻速 / 攻击 / 吸血 / 物爆 / 物爆伤 / 命中 */
  assassin: {
    cls:'assassin', name:'影煞', full:'影煞·噬魂', color:'#ffe9a8', price:500000, reqLv:20,
    pieces: {
      helm:    { slotName:'面罩', stats:{ armor:400, agi:310, hp:1500, atk:650, as:0.06, crit:0.06 } },
      chest:   { slotName:'影衣', stats:{ armor:540, agi:380, hp:2000, atk:820, as:0.07, crit:0.07 } },
      legs:    { slotName:'影裤', stats:{ armor:460, agi:340, hp:1700, atk:740, as:0.06, crit:0.06 } },
      boots:   { slotName:'影靴', stats:{ armor:360, agi:300, hp:1400, atk:680, as:0.10, crit:0.05 } },
      neck:    { slotName:'影链', stats:{ agi:420, atk:1500, crit:0.10, critDmg:0.45, hit:0.07 } },
      ring:    { slotName:'影戒', stats:{ agi:420, atk:1450, crit:0.09, critDmg:0.40, lifesteal:0.03 } },
      trinket: { slotName:'影珠', stats:{ agi:450, atk:1600, lifesteal:0.04, crit:0.07, hit:0.07 } }
    }
  }
};

/* 圣物套装效果门槛 */
DATA.RELIC_SET_BONUS = {
  b3: { attrPct: 0.06 },                                    // 四维 +6%
  b5: { finalDmg: 0.06 },                                   // 最终伤害 +6%
  b7: { expBonus: 0.06, dropBonus: 0.06, lifesteal: 0.06 }   // 经验/爆率/吸血 各 +6%
};

DATA.WEAPON_KINDS = {
  sword:   {label:'剑',   cls:['warrior'],  bonus:0.12, fx:'slash', names:['长剑','阔剑','骑士剑','军刀']},
  axe:     {label:'斧',   cls:['warrior'],  bonus:0.12, fx:'slash', names:['战斧','巨斧','劈山斧']},
  bow:     {label:'弓',   cls:['archer'],   bonus:0.12, fx:'arrow', names:['长弓','猎弓','复合弓','精灵弓']},
  crossbow:{label:'弩',   cls:['archer'],   bonus:0.10, fx:'arrow', names:['手弩','重弩','连弩']},
  dagger:  {label:'匕首', cls:['assassin'], bonus:0.12, fx:'stab',  names:['匕首','短刀','袖剑','毒匕']},
  staff:   {label:'法杖', cls:['mage'],     bonus:0.12, fx:'spell', names:['法杖','秘法杖','星辉杖','冰晶杖']},
  orb:     {label:'法球', cls:['mage'],     bonus:0.10, fx:'spell', names:['法球','奥术球','虚空球']}
};

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
  bossWolf:     {name:'基尔加丹',        title:'燃烧军团的欺诈者',  color:'#c09a70', hp:1500, atk:12,  spd:2.6, r:30, exp:320,  gold:[200,400]},
  bossKobold:   {name:'拉格纳罗斯',      title:'炎魔之王',    color:'#c97b2e', hp:4200, atk:15,  spd:2.3, r:32, exp:800,  gold:[450,800]},
  bossGrom:     {name:'格罗姆·地狱咆哮', title:'战歌氏族的酋长',  color:'#7a9b2e', hp:11500, atk:34,  spd:2.5, r:34, exp:1800, gold:[900,1500]},
  bossKel:      {name:'克尔苏加德',      title:'亡灵天灾的巫妖',  color:'#7fb3d5', hp:25000, atk:54,  spd:2.3, r:34, exp:3400, gold:[1600,2600]},
  bossMannoroth:{name:'玛诺洛斯',        title:'燃烧军团的毁灭者',color:'#a83232', hp:52000, atk:98,  spd:2.4, r:38, exp:6000, gold:[2800,4400]},
  bossArchimonde:{name:'阿克蒙德',       title:'污染者',          color:'#5b2c6f', hp:95000, atk:145, spd:2.5, r:40, exp:10000,gold:[5000,8000]}
};

/* ---------------- 房间 ---------------- */
DATA.ROOMS = [
  {id:0, name:'贫瘠之地',    lv:1,  reqLv:1,  mons:'centaur',   boss:'bossWolf',      count:50, elite:20, bosses:2,  bg:'#26221a', accent:'#5a4a32', desc:'半人马在荒野游荡'},
  {id:1, name:'废弃矿洞',    lv:11, reqLv:11, mons:'kobold',    boss:'bossKobold',    count:50, elite:20, bosses:2, bg:'#241f18', accent:'#5a4a30', desc:'矿车早已锈死'},
  {id:2, name:'兽人营地',    lv:21, reqLv:21, mons:'grunt',     boss:'bossGrom',      count:50, elite:20, bosses:2, bg:'#241a14', accent:'#6b4a2a', desc:'战鼓声从未停歇'},
  {id:3, name:'亡灵墓穴',    lv:31, reqLv:31, mons:'skeleton',  boss:'bossKel',       count:50, elite:20, bosses:2, bg:'#1a1f26', accent:'#3f5568', desc:'死亡并非终点'},
  {id:4, name:'燃烧军团裂隙',lv:41, reqLv:41, mons:'doomguard', boss:'bossMannoroth', count:50, elite:20, bosses:2, bg:'#26141a', accent:'#6b2438', desc:'虚空在低语'},
  {id:5, name:'深渊祭坛',    lv:51, reqLv:51, mons:'abyssal',   boss:'bossArchimonde',count:50, elite:20, bosses:2, bg:'#1c1226', accent:'#4a2a6b', desc:'污染者的王座'}
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
  iron:   {name:'魔铁锭', color:'#9aa0a6', icon:'▰',
    desc:'最常见的打造材料，用于熔铸史诗品质装备。',
    use:'锻造台（按 T 打开）→ 材料合成装备'},
  mithril:{name:'秘银矿', color:'#7fb3d5', icon:'▰',
    desc:'稀有金属，用于熔铸传说品质装备，也是史诗配方的辅料。',
    use:'锻造台（按 T 打开）→ 材料合成装备'},
  scale:  {name:'龙鳞片', color:'#ff9a2e', icon:'▰',
    desc:'巨龙身上剥下的鳞片，传说与神话装备的核心材料；出售神话装备也会返还。',
    use:'锻造台（按 T 打开）→ 材料合成装备'},
  shard:  {name:'虚空碎片', color:'#b45cff', icon:'▰',
    desc:'虚空裂隙中凝结的碎片，神话装备的核心材料；出售神话装备也会返还。',
    use:'锻造台（按 T 打开）→ 材料合成装备'},
  stone:  {name:'强化石', color:'#9aa0a6', icon:'◆',
    desc:'提升装备强化等级所需的消耗品，等级越高消耗越多。',
    use:'锻造台（按 T 打开）→ 装备强化'},
  protect:{name:'强化保护券', color:'#4a9eff', icon:'◇',
    desc:'强化失败时保护装备不掉级。强化到 N 级需要 N+1 张，可使成功率翻倍。',
    use:'锻造台（按 T 打开）→ 装备强化 → 勾选「使用保护券」'},
  skillT: {name:'技能强化券', color:'#3fd45a', icon:'✦',
    desc:'直接提升技能熟练度，让你更快攒满一次突破所需的熟练度。',
    use:'技能页（按 K 打开）→ 每个技能右侧的「强化券」按钮'},
  breakT: {name:'技能突破券', color:'#b45cff', icon:'✧',
    desc:'技能突破层数的门票。突破到 2/3/4/5/6 层分别需要 1/3/5/7/9 张。',
    use:'技能页（按 K 打开）→ 每个技能右侧的「突破」按钮'},
  bossToken:{name:'BOSS击杀凭证', color:'#ff9a3c', icon:'⬢',
    desc:'击败 BOSS 的荣誉证明。可用于兑换神秘物品（内容待定）。',
    use:'暂无（后续开放神秘兑换）'}
};

/* 合成配方：3 材料 + 金币 → 指定品质随机部位 */
DATA.CRAFT = [
  { need:{ iron:8, mithril:4 },              gold:10000, quality:'epic',      name:'史诗装备（当前等级）' },
  { need:{ mithril:8, scale:4 },             gold:30000, quality:'legendary', name:'传说装备（当前等级）' },
  { need:{ scale:6, shard:6 },               gold:50000, quality:'mythic',    name:'神话装备（当前等级）' }
];

/* ---------------- 悬赏任务 ---------------- */
/* 每次交任务的打造材料奖励
   3 次 → 可造史诗（铁8 秘银4）
   6 次 → 可造传说（秘银8 龙鳞4）
   9 次 → 可造神话（龙鳞6 碎片6） */
DATA.QUEST_MATS = { iron: 3, mithril: 2, scale: 1, shard: 1 };

DATA.QUEST_POOL = [
  {id:'q1', name:'清剿荒野', room:0, need:80, exp:260,  gold:220,  mat:'iron',    matN:2},
  {id:'q2', name:'矿洞除虫', room:1, need:80, exp:620,  gold:480,  mat:'iron',    matN:3},
  {id:'q3', name:'击退兽人', room:2, need:80, exp:1400, gold:900,  mat:'mithril', matN:2},
  {id:'q4', name:'净化亡灵', room:3, need:80, exp:2600, gold:1500, mat:'mithril', matN:3},
  {id:'q5', name:'封印恶魔', room:4, need:80, exp:4800, gold:2600, mat:'scale',   matN:2},
  {id:'q6', name:'深渊终战', room:5, need:80, exp:8000, gold:4200, mat:'shard',   matN:1}
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
  // 战士（剑圣）0-6
  whirlwind:0, shieldwall:1, battleShout:2, execute:3, charge:4,
  critMastery:5, toughness:6,
  // 法师（大法师）7-13
  fireball:7, frostNova:8, blizzard:9, arcaneTorrent:10, blink:11,
  arcaneMastery:12, manaSurge:13,
  // 猎人（月之女祭司）14-20
  multishot:14, pierceArrow:15, freezeTrap:16, rapidFire:17, backjump:18,
  eagleEye:19, swiftness:20,
  // 盗贼（恶魔猎手）21-27
  backstab:21, poisonBlade:22, fanOfKnives:23, vanish:24, shadowstep:25,
  lethality:26, shadowDance:27
};

/* ---------------- 强化 ---------------- */
/* 强化表（按《数值配置表》[4.1]，下标 = 当前强化等级） */
DATA.ENHANCE = {
  max: 15,
  GOLD:  [120, 480, 1080, 1920, 3000, 4320, 5880, 7680, 9720, 12000, 14520, 17280, 20280, 23520, 27000],
  STONE: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  RATE:  [1.00, 0.95, 0.90, 0.85, 0.80, 0.75, 0.70, 0.65, 0.60, 0.50, 0.45, 0.30, 0.25, 0.20, 0.15],
  STAT_STEP: 0.06,     // 每级属性倍率
  GOLD_MUL: 1,         // 强化金币系数
  goldCost:  lv => Math.round(DATA.ENHANCE.GOLD[Math.min(lv, 14)] * (DATA.ENHANCE.GOLD_MUL || 1)),
  stoneCost: lv => DATA.ENHANCE.STONE[Math.min(lv, 14)],
  rate:      lv => DATA.ENHANCE.RATE[Math.min(lv, 14)],
  // 保护券：强化到 +N 需要 N 张，成功率翻倍（上限 100%）
  protectNeed: lv => lv + 1,
  rateWithProtect: lv => Math.min(1, DATA.ENHANCE.RATE[Math.min(lv, 14)] * 2),
  failDrop: lv => lv >= 11 ? 1 : 0,
  statMul: lv => 1 + lv * (DATA.ENHANCE.STAT_STEP || 0.06)
};

/* ---------------- 技能强化 ---------------- */
/* 技能等级（Lv.1~5）金币升级费用：下标 = 当前等级-1
   Lv1→2 1万 · Lv2→3 3万 · Lv3→4 5万 · Lv4→5 8万（合计 17 万）
   第 5 个值 10 万预留给后续扩展到 Lv.6 */
DATA.SKILL_LV_COST = [10000, 30000, 50000, 80000, 100000];

DATA.SKILL_TIER = {
  maxTier: 6,
  breakCost: [1, 3, 5, 7, 9],      // 突破到 2/3/4/5/6 层所需突破券
  needProf: 100,
  tierDmg: 0.08,       // 每层 +8% 伤害
  tierCd: 0.05,        // 每层 -5% 冷却
  killProf: 1.5,
  // 技能等级 Lv 成长
  lvDmg: 0.20,      // 每级 +20% 伤害
  lvMana: 0.10,     // 每级 -10% 法力消耗
  lvRadius: 0.06,   // 每级 +6% 作用范围
  // 突破层数成长
  tierCtrl: 0.25,   // 每层 +25% 控制时长       // 每杀一只怪 +1.5%
  ticketProf: 15       // 技能强化券 +15%
};

/* ---------------- 爬塔 ---------------- */
DATA.TOWER = {
  maxFloor: 20,
  dailyAttempts: 2,
  // 适配 60 级版本：以玩家 Lv.51~60 的战力为基准
  // 20 层时血量 ×8.0、攻击 ×6.0（原为 ×12.8 / ×6.7，重排后更平滑）
  HP_STEP: 0.37,      // 每层血量增幅
  ATK_STEP: 0.26,     // 每层攻击增幅
  hpMul:  f => 1 + (f - 1) * DATA.TOWER.HP_STEP,
  atkMul: f => 1 + (f - 1) * DATA.TOWER.ATK_STEP,
  // 塔内怪物等级随层数提升（1 层 = 玩家等级，20 层 = 玩家等级 +19）
  levelOf: (f, baseLv) => Math.max(1, Math.min(70, (baseLv || 1) + (f - 1))),
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
DATA.MAIL = {
  cap: 1000,                 // 邮箱上限
  idleMinutes: 20,           // 每 20 分钟发一封
  idleReward: { gold: 10000, stone: 2, protect: 2, skillT: 2 }
};

/* 抽奖奖池：prob 为单抽概率，总和 = 1 */
DATA.LOTTERY = {
  cost1: 10,        // 单抽消耗 BOSS 击杀凭证
  cost10: 100,      // 十连消耗
  prizes: [
    { id:'relic', short:'圣物', icon:'🏆',  name:'圣物套装·随机一件', prob:0.01, color:'#ffd24a', kind:'relic',
      desc:'本职业 7 件套中随机 1 件' },
    { id:'token100', short:'凭证100', icon:'⬢', name:'BOSS击杀凭证 ×100', prob:0.05, color:'#ff9a3c', kind:'mat', key:'bossToken', amount:100 },
    { id:'token10', short:'凭证10', icon:'⬢',  name:'BOSS击杀凭证 ×10',  prob:0.10, color:'#ff9a3c', kind:'mat', key:'bossToken', amount:10 },
    { id:'scale10', short:'龙鳞10', icon:'▰',  name:'龙鳞片 ×10',        prob:0.10, color:'#ff9a2e', kind:'mat', key:'scale',     amount:10 },
    { id:'shard20', short:'碎片20', icon:'▰',  name:'虚空碎片 ×20',      prob:0.10, color:'#b45cff', kind:'mat', key:'shard',     amount:20 },
    { id:'stone10', short:'强化10', icon:'◆',  name:'强化石 ×10',        prob:0.25, color:'#9aa0a6', kind:'mat', key:'stone',     amount:10 },
    { id:'protect10', short:'保护10', icon:'◇',name:'强化保护券 ×10',    prob:0.13, color:'#4a9eff', kind:'mat', key:'protect',   amount:10 },
    { id:'skillT10', short:'技强10', icon:'✦', name:'技能强化券 ×10',    prob:0.13, color:'#3fd45a', kind:'mat', key:'skillT',    amount:10 },
    { id:'breakT10', short:'突破10', icon:'✧', name:'技能突破券 ×10',    prob:0.13, color:'#b45cff', kind:'mat', key:'breakT',    amount:10 }
  ]
};

/* 装备掉落倍率（1 = 原版；0.2 = 五分之一） */
DATA.EQ_DROP_MUL = 0.2;

DATA.RING_DROP_PCT = 0.5;   // BOSS 掉特戒基础概率（%）

DATA.BOSS_RINGS = {
  bossWolf:      {ring:'exp',    name:'经验之戒'},
  bossKobold:    {ring:'drop',   name:'爆率之戒'},
  bossGrom:      {ring:'cleave', name:'切割之戒'},
  bossKel:       {ring:'revive', name:'复活之戒'},
  bossMannoroth: {ring:'summon', name:'召唤之戒'},
  bossArchimonde:{ring:'gather', name:'聚合之戒'}
};

/* ---------------- 7 枚固定特戒（每个槽位只认自己的戒指） ---------------- */
DATA.RING_SLOTS = [
  {slot:'ring_exp',    ring:'exp',    name:'经验之戒', color:'#b45cff', desc:'经验获取 +25%'},
  {slot:'ring_revive', ring:'revive', name:'复活之戒', color:'#f7e26b', desc:'死亡后原地复活（120 秒冷却）'},
  {slot:'ring_summon', ring:'summon', name:'召唤之戒', color:'#4ad4ff', desc:'召唤灵兽协战，替你扛伤害'},
  {slot:'ring_cleave', ring:'cleave', name:'切割之戒', color:'#ff5a4a', desc:'8% 概率削减目标 5% 最大生命'},
  {slot:'ring_drop',   ring:'drop',   name:'爆率之戒', color:'#3fd45a', desc:'掉落品质 +35%'},
  {slot:'ring_gather', ring:'gather', name:'聚合之戒', color:'#ffd24a', desc:'按 X 把全图怪物吸到身边（30s CD）'}
];

DATA.SPECIAL_RINGS = {
  exp:    {name:'经验之戒', color:'#ff3b3b', effect:{expBonus:0.25}},
  revive: {name:'复活之戒', color:'#ff3b3b', effect:{revive:1}},
  summon: {name:'召唤之戒', color:'#ff3b3b', effect:{summon:1}},
  cleave: {name:'切割之戒', color:'#ff3b3b', effect:{cleave:0.08}},
  drop:   {name:'爆率之戒', color:'#ff3b3b', effect:{dropBonus:0.35}},
  gather: {name:'聚合之戒', color:'#ff3b3b', effect:{gather:1}}
};

/* 每图「简单」难度的推荐战力（按各档装备实测值标定） */
DATA.ROOM_CP = [2600, 4200, 7200, 9200, 12200, 16800];
/* 难度对战力的要求倍率 */
DATA.DIFF_CP_MUL = { normal: 1.00, hard: 1.55, hell: 2.35 };

/* ---------------- 收藏图鉴（每个 BOSS 一条线，10 级） ---------------- */
DATA.CODEX_LEVELS = [
  {lv:1,  kills:3,    dmg:0.02, drop:0.02, exp:0.02},
  {lv:2,  kills:6,    dmg:0.04, drop:0.04, exp:0.04},
  {lv:3,  kills:12,   dmg:0.07, drop:0.06, exp:0.07},
  {lv:4,  kills:20,   dmg:0.10, drop:0.09, exp:0.10},
  {lv:5,  kills:35,   dmg:0.14, drop:0.12, exp:0.14},
  {lv:6,  kills:55,   dmg:0.18, drop:0.16, exp:0.18},
  {lv:7,  kills:80,   dmg:0.23, drop:0.20, exp:0.23},
  {lv:8,  kills:120,  dmg:0.28, drop:0.25, exp:0.28},
  {lv:9,  kills:180,  dmg:0.34, drop:0.30, exp:0.34},
  {lv:10, kills:260,  dmg:0.42, drop:0.38, exp:0.42}
];

/* 普通装备可掉落的部位（特戒槽不参与随机掉落） */
DATA.LOOT_SLOTS = ['weapon','helm','chest','legs','boots','neck','ring','trinket'];

/* 技能特效配色 */
DATA.SKILL_COLOR = {
  fireball:'#ff6a2a', frostNova:'#6fd4ff', blizzard:'#bfe9ff',
  arcaneTorrent:'#b45cff', blink:'#9f7fff',
  whirlwind:'#ffb347', shieldwall:'#c9a24a', battleShout:'#ff8a3d',
  execute:'#ff3b3b', charge:'#ffb347',
  multishot:'#8fe36a', pierceArrow:'#b6ff8a', freezeTrap:'#6fd4ff',
  rapidFire:'#ffe08a', backjump:'#8fe36a',
  backstab:'#c06bff', poisonBlade:'#7fdc5a', fanOfKnives:'#c06bff',
  vanish:'#9f7fff', shadowstep:'#9f7fff'
};

/* 魔兽头像图集索引（avatars.png 12 格） */
DATA.RACE_AVATAR  = { human:0, orc:1, undead:2, elf:3 };
DATA.CLASS_AVATAR = { warrior:4, mage:5, archer:6, assassin:7 };

DATA.MAX_LEVEL = 60;
/* 经验曲线：1~25 级沿用原版 100×lv^1.5；26 级起每级 ×2.4（25 级之后非常慢） */
DATA.EXP_TAIL_FROM = 26;
DATA.EXP_TAIL_MUL = 2.4;
DATA.EXP_GEOM_MUL = 1.08447;   // 30 级起：每 5 级 ×1.5（等价每级 ×1.08447）
DATA.expForLevel = (lv) => {
  if (lv < DATA.EXP_TAIL_FROM) return Math.floor(100 * Math.pow(lv, 1.5));
  if (lv < 30) {
    const base = Math.floor(100 * Math.pow(DATA.EXP_TAIL_FROM - 1, 1.5));
    return Math.round(base * Math.pow(DATA.EXP_TAIL_MUL, lv - (DATA.EXP_TAIL_FROM - 1)));
  }
  // 30 级之后：每级需求 = 上一级 × 1.5（几何增长）
  const b0 = Math.floor(100 * Math.pow(DATA.EXP_TAIL_FROM - 1, 1.5));
  const n29 = Math.round(b0 * Math.pow(DATA.EXP_TAIL_MUL, 29 - (DATA.EXP_TAIL_FROM - 1)));
  return Math.round(n29 * Math.pow(DATA.EXP_GEOM_MUL, lv - 29));
};
