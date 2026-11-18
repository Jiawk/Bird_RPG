/* ============================================================
   音效系统：Web Audio 程序化合成（零素材）+ 英文语音（TTS）
   ============================================================ */
const Sfx = {
  ctx: null,
  on: false,   // 默认关闭，玩家主动开启
  vol: 0.50,
  _voiceCd: 0,
  _lastHit: 0,

  /* ---------- 初始化 ---------- */
  init() {
    if (this.ctx) return this.ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
    } catch (e) { this.ctx = null; }
    return this.ctx;
  },
  resume() {
    const c = this.init();
    if (c && c.state === 'suspended') c.resume();
  },
  setOn(v) {
    this.on = !!v;
    if (!this.on && window.speechSynthesis) window.speechSynthesis.cancel();
  },

  /* ---------- 采样音频（MP3，来自素材）---------- */
  _samples: {},
  _ensureSample(key) {
    if (this._samples[key]) return this._samples[key];
    const src = (typeof SFX_VOICE !== 'undefined') ? SFX_VOICE[key] : null;
    if (!src) return null;
    try {
      const a = new Audio(src);
      a.preload = 'auto';
      a.volume = 1;
      this._samples[key] = a;
      return a;
    } catch (e) { return null; }
  },
  sample(key, gain) {
    if (!this.on) return;
    const a = this._ensureSample(key);
    if (!a) return;
    try {
      const node = a.cloneNode ? a.cloneNode() : new Audio(a.src);   // 允许同时叠放
      node.volume = Math.min(1, (gain === undefined ? 0.9 : gain) * this.vol * 1.6);
      node.currentTime = 0;
      const pr = node.play();
      if (pr && pr.catch) pr.catch(() => {});
    } catch (e) { /* 忽略 */ }
  },

  /* ---------- 基础发声 ---------- */
  _tone(o) {
    const c = this.init(); if (!c || !this.on) return;
    const t0 = c.currentTime + (o.delay || 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + o.dur);
    const peak = (o.gain === undefined ? 0.3 : o.gain) * this.vol;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(g); g.connect(c.destination);
    osc.start(t0); osc.stop(t0 + o.dur + 0.02);
  },

  _noise(o) {
    const c = this.init(); if (!c || !this.on) return;
    const t0 = c.currentTime + (o.delay || 0);
    const dur = o.dur || 0.08;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.frequency.value = o.freq || 1200;
    f.Q.value = o.q || 1.2;
    const g = c.createGain();
    g.gain.setValueAtTime((o.gain === undefined ? 0.3 : o.gain) * this.vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(c.destination);
    src.start(t0);
  },

  /* ---------- 翻书声 ---------- */
  page(up) {
    if (this._samples) { this.sample('page', up ? 0.85 : 0.75); return; }
    // 兜底：无素材时走合成
    const c = this.init(); if (!c || !this.on) return;
    this.resume();
    const t0 = c.currentTime;
    // 纸张摩擦：带通噪声从高扫到低（开）/ 低到高（关）
    const dur = 0.20;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const k = i / len;
      // 前段密集、后段稀疏 → 像翻页
      const env = Math.pow(1 - k, 2.2) * (i % 37 < 26 ? 1 : 0.25);
      d[i] = (Math.random() * 2 - 1) * env;
    }
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.9;
    f.frequency.setValueAtTime(up ? 1200 : 2600, t0);
    f.frequency.exponentialRampToValueAtTime(up ? 3200 : 900, t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.55 * this.vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(c.destination);
    src.start(t0);
    // 书页合上的闷响
    this._tone({ freq: up ? 150 : 120, to: 70, dur: 0.09, type: 'sine', gain: 0.10 });
  },

  /* ---------- 金属撞击（魔兽风） ---------- */
  clang(gain, pitch) {
    // 已改为素材音效：统一用「打击 3 声」
    this.sample('crit', (gain === undefined ? 0.7 : gain));
    return;
  },
  _clangSynth(gain, pitch) {
    const c = this.init(); if (!c || !this.on) return;
    this.resume();
    const t0 = c.currentTime;
    const g0 = (gain === undefined ? 0.7 : gain) * this.vol;
    // 起始的金属噪音瞬态（压低高频，去掉"脆"感）
    this._noise({ dur: 0.055, freq: 1500 * pitch, q: 0.7, gain: g0 * 0.38, filter: 'bandpass' });
    // 非谐波泛音堆叠 → 金属感（基频下调，泛音比收敛，听感更厚重）
    const base = 880 * pitch;
    const ratios = [1, 2.35, 3.86, 5.62];
    const amps   = [1, 0.50, 0.24, 0.11];
    ratios.forEach((r, i) => {
      this._tone({
        freq: base * r,
        dur: 0.10 + 0.20 / (i + 1),
        type: i === 0 ? 'triangle' : 'sine',
        gain: g0 * amps[i] * 0.22
      });
    });
    // 低频冲击（砸在盔甲上的闷响）
    this._tone({ freq: 150, to: 62, dur: 0.13, type: 'sine', gain: g0 * 0.30 });
    this._noise({ dur: 0.06, freq: 520, q: 0.6, gain: g0 * 0.18, filter: 'lowpass' });
  },

  /* ---------- 音效表（全部使用素材音频，已移除程序化合成） ---------- */
  play(name) {
    if (!this.on) return;
    this.resume();

    // 名字 → 素材 key（默认同名）
    switch (name) {
      /* ---- 界面 ---- */
      case 'click':   this.sample('click', 0.85); break;     // 点击咚声
      case 'open':    this.sample('page', 0.9);   break;     // 翻书一声（开面板）
      case 'close':   this.sample('page', 0.8);   break;     // 翻书一声（关面板）
      case 'page':    this.sample('page', 0.85);  break;     // 翻书
      case 'openBig': this.sample('open', 0.9);   break;     // 翻书 2 声（大面板）
      case 'confirm': this.sample('confirm', 0.9); break;    // 点击成功

      /* ---- 战斗 ---- */
      case 'attack':  this.sample('attack', 0.75); break;    // 普通攻击（挥砍）
      case 'hit': {
        const now = Date.now();
        if (now - this._lastHit < 45) return;                // 连击限流
        this._lastHit = now;
        this.sample('hit', 0.7);                             // 打击 1 声
        break;
      }
      case 'crit':    this.sample('crit', 0.9);  break;      // 打击 3 声（重击）
      case 'kill':    this.sample('hit', 0.85);  break;      // 击杀
      case 'hurt':    this.sample('hurt', 0.9);  break;      // 角色受到攻击
      case 'cast':    this.sample('cast', 0.85); break;      // 放技能用力的哼声

      /* ---- 场景 & 结算 ---- */
      case 'enter':   this.sample('enter', 1.0); break;      // 进入副本
      case 'enterB':  this.sample('enterB', 0.9); break;     // 进入副本（玻璃悬念）

      /* ---- 素材语音 ---- */
      case 'bossDie':   this.sample('bossDie', 1.0); break;    // BOSS 死亡
      case 'playerDie': this.sample('playerDie', 1.0); break;  // 角色阵亡
      case 'success':   this.sample('success', 1.0); break;    // 强化成功 / 转盘出货 / 获得特戒
      case 'fail':      this.sample('fail', 0.9); break;       // 强化失败

      /* ---- 其余事件复用已有素材 ---- */
      case 'lvlup':   this.sample('confirm', 0.95); break;   // 升级 → 点击成功
      case 'loot':    this.sample('confirm', 0.7);  break;   // 拾取 → 点击成功
      case 'boss':    this.sample('enter', 0.8);    break;   // BOSS 出现 → 进入副本
      case 'death':   this.sample('playerDie', 1.0); break;  // 死亡
      case 'level':   this.sample('confirm', 0.8);  break;
      default: break;
    }
  },

  /* ---------- 英文语音 ---------- */
  speak(text, opt) {
    if (!this.on || !text) return;
    if (!('speechSynthesis' in window)) return;
    const now = Date.now();
    if (now - this._voiceCd < 2200) return;       // 语音别太密
    this._voiceCd = now;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = (opt && opt.rate) || 0.95;
      u.pitch = (opt && opt.pitch) || 0.95;
      u.volume = Math.min(1, this.vol + 0.35);
      const vs = window.speechSynthesis.getVoices() || [];
      const en = vs.filter(v => /^en([-_]|$)/i.test(v.lang));
      const pref = en.find(v => /male|david|alex|daniel|fred|google us/i.test(v.name)) || en[0];
      if (pref) u.voice = pref;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch (e) { /* 忽略 */ }
  }
};

/* 各职业的英文台词 */
const VOICE_LINES = {
  warrior:  ['For honor!', 'Blade of the Horde!', 'Victory or death!'],
  mage:     ['Burn!', 'By the arcane!', 'Feel the frost!'],
  archer:   ['By the moon!', 'Swift as wind!', 'Elune, guide me!'],
  assassin: ['Darkness calls.', 'I am vengeance!', 'No escape.']
};

function voiceFor(p, pool) {
  const lines = VOICE_LINES[p.cls] || ['For glory!'];
  return (pool && pool.length) ? pool[Math.floor(Math.random() * pool.length)]
                               : lines[Math.floor(Math.random() * lines.length)];
}
