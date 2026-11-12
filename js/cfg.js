/* ============================================================
   数值配置：运行时覆盖 + 存档 + 导出定制版 HTML
   内嵌配置块：<script id="orc-cfg" type="application/json">{...}</script>
   ============================================================ */
const CFG_DEFS = [
  // ---- 经验 ----
  { g:'经验', id:'maxLevel',   label:'等级上限',            min:10, max:99,  step:1,     get:()=>DATA.MAX_LEVEL, set:v=>{DATA.MAX_LEVEL=v;}, fmt:v=>v+' 级' },
  { g:'经验', id:'expTailFrom',label:'经验陡增起始等级',      min:2,  max:59,  step:1,     get:()=>DATA.EXP_TAIL_FROM, set:v=>{DATA.EXP_TAIL_FROM=v;}, fmt:v=>v+' 级' },
  { g:'经验', id:'expTailMul', label:'经验陡增倍率(26~29)',   min:1,  max:5,   step:0.1,   get:()=>DATA.EXP_TAIL_MUL, set:v=>{DATA.EXP_TAIL_MUL=v;}, fmt:v=>'×'+v },
  { g:'经验', id:'expGeomMul', label:'30级后每级倍率',        min:1,  max:2,   step:0.001, get:()=>DATA.EXP_GEOM_MUL, set:v=>{DATA.EXP_GEOM_MUL=v;}, fmt:v=>'×'+v.toFixed(3) },

  // ---- 掉落 ----
  { g:'掉落', id:'mythicW',    label:'红装(神话)权重·小怪',   min:0,  max:900, step:1,     get:()=>DATA.QUALITY.find(q=>q.key==='mythic').weight, set:v=>{DATA.QUALITY.find(q=>q.key==='mythic').weight=v;}, fmt:v=>v },
  { g:'掉落', id:'bossMythic', label:'红装(神话)权重·BOSS',   min:0,  max:2000,step:10,    get:()=>DATA.BOSS_WEIGHTS.mythic, set:v=>{DATA.BOSS_WEIGHTS.mythic=v;}, fmt:v=>v },
  { g:'掉落', id:'ringDrop',   label:'特戒爆率(基础)',        min:0,  max:10,  step:0.1,   get:()=>DATA.RING_DROP_PCT, set:v=>{DATA.RING_DROP_PCT=v;}, fmt:v=>v+'%' },

  // ---- 强化 ----
  { g:'强化', id:'enhMax',     label:'强化上限',             min:5,  max:30,  step:1,     get:()=>DATA.ENHANCE.max, set:v=>{DATA.ENHANCE.max=v;}, fmt:v=>'+'+v },
  { g:'强化', id:'enhStat',    label:'每级属性倍率',          min:0.01,max:0.2,step:0.01,  get:()=>DATA.ENHANCE.STAT_STEP, set:v=>{DATA.ENHANCE.STAT_STEP=v;}, fmt:v=>'+'+(v*100).toFixed(0)+'%' },
  { g:'强化', id:'enhGoldMul', label:'强化金币系数',          min:0.2, max:5,   step:0.1,   get:()=>DATA.ENHANCE.GOLD_MUL, set:v=>{DATA.ENHANCE.GOLD_MUL=v;}, fmt:v=>'×'+v },

  // ---- 技能 ----
  { g:'技能', id:'skLv1', label:'技能 Lv1→2 金币', min:0, max:2000000, step:1000, get:()=>DATA.SKILL_LV_COST[0], set:v=>{DATA.SKILL_LV_COST[0]=v;}, fmt:v=>fmt(v)+' 金' },
  { g:'技能', id:'skLv2', label:'技能 Lv2→3 金币', min:0, max:2000000, step:1000, get:()=>DATA.SKILL_LV_COST[1], set:v=>{DATA.SKILL_LV_COST[1]=v;}, fmt:v=>fmt(v)+' 金' },
  { g:'技能', id:'skLv3', label:'技能 Lv3→4 金币', min:0, max:2000000, step:1000, get:()=>DATA.SKILL_LV_COST[2], set:v=>{DATA.SKILL_LV_COST[2]=v;}, fmt:v=>fmt(v)+' 金' },
  { g:'技能', id:'skLv4', label:'技能 Lv4→5 金币', min:0, max:2000000, step:1000, get:()=>DATA.SKILL_LV_COST[3], set:v=>{DATA.SKILL_LV_COST[3]=v;}, fmt:v=>fmt(v)+' 金' },
  { g:'技能', id:'tierMax',  label:'突破层数上限',   min:2, max:10, step:1, get:()=>DATA.SKILL_TIER.maxTier, set:v=>{DATA.SKILL_TIER.maxTier=v;}, fmt:v=>v+' 层' },
  { g:'技能', id:'lvDmg',    label:'每级伤害加成',   min:0, max:1, step:0.01, get:()=>DATA.SKILL_TIER.lvDmg, set:v=>{DATA.SKILL_TIER.lvDmg=v;}, fmt:v=>'+'+(v*100).toFixed(0)+'%' },
  { g:'技能', id:'tierCd',   label:'每层冷却缩减',   min:0, max:0.5, step:0.01, get:()=>DATA.SKILL_TIER.tierCd, set:v=>{DATA.SKILL_TIER.tierCd=v;}, fmt:v=>'-'+(v*100).toFixed(0)+'%' },

  // ---- 爬塔 ----
  { g:'爬塔', id:'towerHp',  label:'每层血量增幅', min:0.05, max:2, step:0.01, get:()=>DATA.TOWER.HP_STEP, set:v=>{DATA.TOWER.HP_STEP=v;}, fmt:v=>'+'+(v*100).toFixed(0)+'%/层' },
  { g:'爬塔', id:'towerAtk', label:'每层攻击增幅', min:0.05, max:2, step:0.01, get:()=>DATA.TOWER.ATK_STEP, set:v=>{DATA.TOWER.ATK_STEP=v;}, fmt:v=>'+'+(v*100).toFixed(0)+'%/层' },
  { g:'爬塔', id:'towerMax', label:'塔层上限',     min:5, max:50, step:1, get:()=>DATA.TOWER.maxFloor, set:v=>{DATA.TOWER.maxFloor=v;}, fmt:v=>v+' 层' },

  // ---- 任务 ----
  { g:'任务', id:'questNeed',label:'悬赏任务杀怪数', min:10, max:500, step:10, get:()=>DATA.QUEST_POOL[0].need, set:v=>{DATA.QUEST_POOL.forEach(q=>{q.need=v});}, fmt:v=>v+' 只' },

  // ---- 圣物 ----
  { g:'圣物', id:'relicPrice',label:'圣物兑换价格', min:0, max:5000000, step:10000, get:()=>DATA.RELIC_WEAPONS[0].price, set:v=>{DATA.RELIC_WEAPONS.forEach(w=>{w.price=v});}, fmt:v=>fmt(v)+' 金' },
  { g:'圣物', id:'relicPct',  label:'圣物削血比例', min:0, max:0.5, step:0.01, get:()=>DATA.RELIC_WEAPONS[0].relicPct, set:v=>{DATA.RELIC_WEAPONS.forEach(w=>{w.relicPct=v});}, fmt:v=>(v*100).toFixed(0)+'%' },
];

/* 从内嵌 JSON / localStorage 读取并应用 */
function cfgApplyAll() {
  // 内嵌配置（发出去的文件）优先，本机 localStorage 覆盖（作者自己调完立刻生效）
  let baked = {}, local = {};
  const tag = document.getElementById('orc-cfg');
  if (tag && tag.textContent.trim()) { try { baked = JSON.parse(tag.textContent) || {}; } catch (e) {} }
  try { local = JSON.parse(localStorage.getItem('orc_cfg') || 'null') || {}; } catch (e) {}
  const raw = Object.assign({}, baked, local);
  if (!Object.keys(raw).length) return {};
  CFG_DEFS.forEach(d => {
    if (raw[d.id] !== undefined && raw[d.id] !== null) { try { d.set(raw[d.id]); } catch (e) {} }
  });
  return raw;
}

function cfgCurrent() {
  const o = {};
  CFG_DEFS.forEach(d => { o[d.id] = d.get(); });
  return o;
}

function cfgSave() {
  const cur = cfgCurrent();
  localStorage.setItem('orc_cfg', JSON.stringify(cur));
  const tag = document.getElementById('orc-cfg');
  if (tag) tag.textContent = JSON.stringify(cur);
  return cur;
}

/* 生成一个「烘焙了当前数值」的新 HTML 并下载 */
function cfgExportHtml() {
  const cur = cfgSave();
  const clone = document.documentElement.cloneNode(true);

  // 清理运行时状态
  const clean = (id, addHidden) => {
    const el = clone.querySelector('#' + id);
    if (!el) return;
    if (id === 'modal') { el.classList.add('hidden'); const b = el.querySelector('#modalBody'); if (b) b.innerHTML = ''; }
    else if (addHidden) el.classList.add('hidden');
  };
  ['modal', 'toast', 'tooltip', 'bigAnnounce', 'hud'].forEach(id => clean(id, true));
  clone.querySelectorAll('#hud .modal, .modal').forEach(m => m.classList.add('hidden'));

  // 写回配置
  let tag = clone.querySelector('#orc-cfg');
  if (!tag) {
    tag = document.createElement('script');
    tag.id = 'orc-cfg';
    tag.type = 'application/json';
    clone.querySelector('head').appendChild(tag);
  }
  tag.textContent = JSON.stringify(cur);

  const html = '<!doctype html>\n' + clone.outerHTML;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '兽人永不为奴-定制版.html';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  return true;
}
