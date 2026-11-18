/* ============================================================
   音效系统：仅播放指定素材，媒体播放失败时使用 WebAudio 解码兜底
   ============================================================ */
'use strict';

const Sfx = {
  ctx: null,
  on: true,
  vol: 0.50,
  _unlocked: false,
  _samples: {},
  _buffers: {},
  _diagnostics: {},
  _lastHit: 0,
  _lastAttack: 0,
  _alias: Object.freeze({
    open: 'openBig', close: 'page', level: 'confirm', lvlup: 'confirm',
    loot: 'confirm', kill: 'hit', enterB: 'enterFallback', death: 'playerDie', boss: 'enter'
  }),

  initialize() {
    try {
      const saved = localStorage.getItem('orc_audio_enabled');
      this.on = saved === null ? true : saved === '1';
    } catch (e) { this.on = true; }
    return this.on;
  },
  init() {
    if (this.ctx) return this.ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = AC ? new AC() : null;
    } catch (e) { this.ctx = null; }
    return this.ctx;
  },
  resume() {
    const c = this.init();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
    return c;
  },
  setOn(enabled) { this.setEnabled(enabled); },
  setEnabled(enabled) {
    this.on = !!enabled;
    try { localStorage.setItem('orc_audio_enabled', this.on ? '1' : '0'); } catch (e) {}
  },
  isEnabled() { return this.on; },
  _key(key) { return this._alias[key] || key; },
  _asset(key) {
    key = this._key(key);
    return typeof AUDIO_ASSET_REGISTRY !== 'undefined' ? AUDIO_ASSET_REGISTRY[key] : null;
  },
  _record(key, status, reason) {
    this._diagnostics[this._key(key)] = { status, reason: reason || '', at: Date.now() };
  },
  getDiagnostic(key) { return this._diagnostics[this._key(key)] || null; },
  _bytes(key) {
    const asset = this._asset(key);
    if (!asset || !asset.data) return null;
    try {
      const raw = atob(asset.data.slice(asset.data.indexOf(',') + 1));
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      return { bytes, mime: asset.mime };
    } catch (e) { this._record(key, 'unavailable', e.message); return null; }
  },
  _ensureSample(key) {
    key = this._key(key);
    if (this._samples[key]) return this._samples[key];
    const data = this._bytes(key);
    if (!data || typeof Audio === 'undefined') return null;
    try {
      const url = URL.createObjectURL(new Blob([data.bytes], { type: data.mime }));
      const audio = new Audio();
      audio.preload = 'auto';
      audio.src = url;
      audio._blobUrl = url;
      this._samples[key] = audio;
      return audio;
    } catch (e) { this._record(key, 'unavailable', e.message); return null; }
  },
  _playBuffer(key, gain) {
    key = this._key(key);
    const c = this.resume();
    const start = buffer => {
      const source = c.createBufferSource();
      const volume = c.createGain();
      source.buffer = buffer;
      volume.gain.value = gain;
      source.connect(volume); volume.connect(c.destination); source.start(0);
      this._record(key, 'played-by-fallback');
    };
    if (!c) { this._record(key, 'unavailable', 'WebAudio unavailable'); return Promise.reject(new Error('WebAudio unavailable')); }
    if (this._buffers[key]) { try { start(this._buffers[key]); return Promise.resolve(); } catch (e) { this._record(key, 'unavailable', e.message); return Promise.reject(e); } }
    const data = this._bytes(key);
    if (!data) return Promise.reject(new Error('asset unavailable'));
    const copy = data.bytes.buffer.slice(0);
    return c.decodeAudioData(copy).then(buffer => { this._buffers[key] = buffer; start(buffer); }).catch(err => {
      this._record(key, 'unavailable', err && err.message ? err.message : String(err));
      throw err;
    });
  },
  _play(key, gain, allowEnterFallback) {
    key = this._key(key);
    const sample = this._ensureSample(key);
    if (!sample) return this._playBuffer(key, gain).catch(() => this._fallbackEnter(key, gain, allowEnterFallback));
    try {
      const node = sample.cloneNode(true);
      node.volume = gain;
      node.currentTime = 0;
      const attempt = node.play();
      if (attempt && attempt.then) {
        return attempt.then(() => this._record(key, 'played')).catch(err =>
          this._playBuffer(key, gain).catch(() => this._fallbackEnter(key, gain, allowEnterFallback, err))
        );
      }
      this._record(key, 'played');
      return Promise.resolve();
    } catch (err) {
      return this._playBuffer(key, gain).catch(() => this._fallbackEnter(key, gain, allowEnterFallback, err));
    }
  },
  _fallbackEnter(key, gain, allowed, err) {
    if (allowed && key === 'enter') return this._play('enterFallback', gain, false);
    this._record(key, 'unavailable', err && err.message ? err.message : 'playback failed');
    return Promise.reject(err || new Error('playback failed'));
  },
  play(requestedKey, gain) {
    const key = this._key(requestedKey);
    if (key === 'attack') {
      const now = Date.now();
      if (now - this._lastAttack < 3000) return;
      this._lastAttack = now;
    }
    if (!this._asset(key)) { this._record(key, 'unavailable', 'unknown audio key'); return; }
    if (!this.on) { this._record(key, 'disabled-by-preference'); return; }
    const volume = Math.min(1, Math.max(0.08, (gain === undefined ? 0.85 : gain) * this.vol * 1.6));
    this.resume();
    this._play(key, volume, key === 'enter').catch(() => {});
  },
  unlock() {
    if (this._unlocked) return;
    this._unlocked = true;
    this.resume();
    const keys = typeof AUDIO_ASSET_KEYS === 'undefined' ? [] : AUDIO_ASSET_KEYS;
    keys.forEach(key => {
      const audio = this._ensureSample(key);
      if (!audio || !this.on) return;
      try {
        const probe = audio.cloneNode(true);
        probe.volume = 0.001;
        const play = probe.play();
        if (play && play.then) play.then(() => { probe.pause(); probe.currentTime = 0; }).catch(() => {});
      } catch (e) {}
    });
  },
  testAll() {
    const keys = typeof AUDIO_ASSET_KEYS === 'undefined' ? [] : AUDIO_ASSET_KEYS;
    keys.forEach((key, i) => setTimeout(() => this.play(key, 0.55), i * 260));
    return keys.length;
  }
};

Sfx.initialize();
document.addEventListener('pointerdown', () => Sfx.unlock(), { once: true, capture: true });
document.addEventListener('touchstart', () => Sfx.unlock(), { once: true, capture: true, passive: true });
document.addEventListener('keydown', () => Sfx.unlock(), { once: true, capture: true });
