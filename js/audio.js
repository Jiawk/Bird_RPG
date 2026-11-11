/* ============================================================
   音效系统：Web Audio 程序化合成（零素材）+ 英文语音（TTS）
   ============================================================ */
const Sfx = {
  ctx: null,
  on: true,
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

  /* ---------- 音效表 ---------- */
  play(name) {
    if (!this.on) return;
    this.resume();
    switch (name) {
      case 'click':
        this._tone({ freq: 880, to: 760, dur: 0.05, type: 'square', gain: 0.10 });
        break;
      case 'open':
        this._tone({ freq: 520, dur: 0.09, type: 'triangle', gain: 0.16 });
        this._tone({ freq: 780, dur: 0.11, type: 'triangle', gain: 0.13, delay: 0.06 });
        break;
      case 'close':
        this._tone({ freq: 700, dur: 0.08, type: 'triangle', gain: 0.14 });
        this._tone({ freq: 420, dur: 0.10, type: 'triangle', gain: 0.11, delay: 0.05 });
        break;
      case 'cast':
        this._tone({ freq: 300, to: 980, dur: 0.16, type: 'sawtooth', gain: 0.11 });
        this._noise({ dur: 0.14, freq: 2200, q: 0.9, gain: 0.10 });
        break;
      case 'hit': {
        const now = Date.now();
        if (now - this._lastHit < 55) return;      // 连击限流
        this._lastHit = now;
        this._noise({ dur: 0.07, freq: 900, q: 1.4, gain: 0.20 });
        this._tone({ freq: 150, to: 80, dur: 0.07, type: 'sine', gain: 0.16 });
        break;
      }
      case 'crit':
        this._noise({ dur: 0.10, freq: 1600, q: 1.0, gain: 0.24 });
        this._tone({ freq: 420, to: 180, dur: 0.10, type: 'square', gain: 0.12 });
        break;
      case 'kill':
        this._noise({ dur: 0.18, freq: 500, q: 0.8, gain: 0.20 });
        this._tone({ freq: 300, to: 70, dur: 0.22, type: 'sawtooth', gain: 0.14 });
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
