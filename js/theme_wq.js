/* 水墨武侠版：文案替换（在 data.js 之后加载） */
'use strict';
(function () {
  const ROOMS = ['落霞荒原','幽篁矿洞','赤焰山寨','白骨幽冢','焚天裂隙','九幽祭坛'];
  const MONSTERS = { centaur:'山贼', kobold:'矿鬼', grunt:'寨兵', skeleton:'枯骨', doomguard:'魔卒', abyssal:'幽魂' };
  const BOSSES = {
    bossWolf:'落霞寨主·刀疤', bossKobold:'幽篁矿主·铁须', bossGrom:'赤焰大王·燃山',
    bossKel:'白骨真人·枯禅', bossMannoroth:'焚天魔王·赤炎', bossArchimonde:'九幽魔尊·无相'
  };
  DATA.ROOMS.forEach((r,i) => { if (ROOMS[i]) r.name = ROOMS[i]; });
  Object.keys(MONSTERS).forEach(k => { if (DATA.MONSTERS[k]) DATA.MONSTERS[k].name = MONSTERS[k]; });
  Object.keys(BOSSES).forEach(k => { if (DATA.BOSSES[k]) DATA.BOSSES[k].name = BOSSES[k]; });
  // 职业名
  const CLS = { warrior:'刀客', mage:'术士', archer:'弓手', assassin:'刺客' };
  Object.keys(CLS).forEach(k => { if (DATA.CLASSES[k]) DATA.CLASSES[k].name = CLS[k]; });
  DATA.RACES.human.name = '江湖';
  // 品质
  const Q = ['凡品','良品','上品','珍品','绝品','神兵'];
  DATA.QUALITY.forEach((q,i) => { if (Q[i]) q.name = Q[i]; });
})();
