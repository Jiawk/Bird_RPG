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

  /* ---------- 音效表 ---------- */
  play(name) {
    if (!this.on) return;
    this.resume();
    switch (name) {
      case 'click':
        this._tone({ freq: 420, to: 300, dur: 0.045, type: 'triangle', gain: 0.09 });
        this._noise({ dur: 0.03, freq: 1800, q: 2.0, gain: 0.05, filter: 'bandpass' });
        break;
      /* ---- 翻书声：菜单/对话/窗口 统一用这个 ---- */
      case 'open':  this.page(true);  break;
      case 'close': this.page(false); break;

      case 'cast':
        // 施法：低沉的气流 + 一点金属尾音，不再卡通
        this._noise({ dur: 0.22, freq: 700, q: 0.6, gain: 0.14, filter: 'lowpass' });
        this._tone({ freq: 180, to: 520, dur: 0.20, type: 'sine', gain: 0.07 });
        break;

      /* ---- 战斗：魔兽风金属撞击 ---- */
      case 'hit': {
        const now = Date.now();
        if (now - this._lastHit < 45) return;      // 连击限流
        this._lastHit = now;
        this.clang(0.55, 1.0);
        break;
      }
      case 'crit':
        this.clang(1.0, 1.35);
        this._tone({ freq: 92, to: 55, dur: 0.14, type: 'sine', gain: 0.14 });
        break;
      case 'kill':
        this.clang(0.75, 0.95);
        this._tone({ freq: 120, to: 45, dur: 0.28, type: 'sine', gain: 0.16 });
        this._noise({ dur: 0.22, freq: 380, q: 0.6, gain: 0.13, filter: 'lowpass' });
        break;
      case 'death':
        this._tone({ freq: 220, to: 38, dur: 1.0, type: 'sawtooth', gain: 0.22 });
        this._tone({ freq: 110, to: 30, dur: 1.1, type: 'sine', gain: 0.18, delay: 0.05 });
        this._noise({ dur: 0.5, freq: 300, q: 0.7, gain: 0.12 });
        break;
      case 'lvlup':
        [523, 659, 784, 1046].forEach((f, i) =>
          this._tone({ freq: f, dur: 0.18, type: 'triangle', gain: 0.18, delay: i * 0.09 }));
        break;
      case 'loot':
        this._tone({ freq: 1180, dur: 0.09, type: 'sine', gain: 0.13 });
        this._tone({ freq: 1560, dur: 0.10, type: 'sine', gain: 0.10, delay: 0.05 });
        break;
      case 'boss':
        this._tone({ freq: 90, to: 55, dur: 0.7, type: 'sawtooth', gain: 0.20 });
        this._noise({ dur: 0.6, freq: 180, q: 0.6, gain: 0.14 });
        break;
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
