'use strict';
const EQ_FREQS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const EQ_PRESETS = {
  'Ровный':       [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'Бас':          [7, 6, 5, 3, 1, 0, 0, 0, 0, 0],
  'Супер бас':    [10, 9, 7, 4, 1, 0, -1, -1, 0, 0],
  'Меньше баса':  [-6, -5, -4, -2, 0, 0, 0, 0, 0, 0],
  'Высокие':      [0, 0, 0, 0, 0, 1, 2, 4, 5, 6],
  'Рок':          [5, 4, 3, 1, -1, -1, 1, 3, 4, 5],
  'Поп':          [-1, 1, 3, 4, 3, 0, -1, -1, 0, 1],
  'Хип-хоп':      [6, 5, 2, 3, -1, -1, 1, -1, 2, 3],
  'Электроника':  [5, 4, 1, 0, -2, 2, 1, 1, 4, 5],
  'Джаз':         [3, 2, 1, 2, -1, -1, 0, 1, 2, 3],
  'Классика':     [4, 3, 2, 1, -1, -1, 0, 2, 3, 4],
  'Вокал':        [-2, -3, -3, 1, 3, 4, 4, 3, 1, 0],
  'Акустика':     [4, 4, 3, 1, 1, 1, 2, 3, 2, 1],
  'Громкость':    [6, 4, 0, 0, -2, 0, -1, -3, 4, 2],
  'Наушники':     [3, 2, 0, -1, -1, 0, 1, 2, 3, 2],
};

class Equalizer {
  constructor(audio) {
    this.audio = audio;
    this.ctx = null;
  }

  // Lazily builds the Web Audio graph: source -> preamp -> 10 filters -> analyser -> out
  init() {
    if (this.ctx) return;
    this.ctx = new AudioContext({ latencyHint: 'playback' });
    this.source = this.ctx.createMediaElementSource(this.audio);
    this.pre = this.ctx.createGain();
    this.filters = EQ_FREQS.map((f, i) => {
      const b = this.ctx.createBiquadFilter();
      b.type = i === 0 ? 'lowshelf' : i === EQ_FREQS.length - 1 ? 'highshelf' : 'peaking';
      b.frequency.value = f;
      b.Q.value = 1.1;
      b.gain.value = 0;
      return b;
    });
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -1;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.1;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    let node = this.source.connect(this.pre);
    for (const f of this.filters) node = node.connect(f);
    // Reverb runs in parallel with the dry signal: filters -> dry ┐
    //                                            filters -> convolver -> wet ┴> limiter
    this.dry = this.ctx.createGain();
    this.wet = this.ctx.createGain(); this.wet.gain.value = 0;
    this.convolver = this.ctx.createConvolver();
    this.convolver.buffer = this.impulse(3.2, 2.6);
    node.connect(this.dry).connect(this.limiter);
    node.connect(this.convolver).connect(this.wet).connect(this.limiter);
    this.limiter.connect(this.analyser).connect(this.ctx.destination);
    if (this.pending) this.apply(this.pending);
    if (this.pendingFx) this.effects(this.pendingFx);
  }

  // A synthetic hall: stereo noise with an exponential decay.
  impulse(seconds, decay) {
    const rate = this.ctx.sampleRate, len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  // fx: { speed: 0.5…1.5, pitch: true = the pitch follows the speed (slowed / nightcore), reverb: 0…1 }
  effects(fx) {
    this.pendingFx = fx;
    const rate = fx.speed || 1;
    this.audio.preservesPitch = !fx.pitch;
    this.audio.defaultPlaybackRate = rate;
    this.audio.playbackRate = rate;
    if (!this.ctx) return;
    const t = this.ctx.currentTime, r = Math.max(0, Math.min(1, fx.reverb || 0));
    this.wet.gain.setTargetAtTime(r * 1.1, t, 0.05);
    this.dry.gain.setTargetAtTime(1 - r * 0.35, t, 0.05);
  }

  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); }

  apply(cfg) {
    this.pending = cfg;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const on = cfg.enabled;
    this.filters.forEach((f, i) => f.gain.setTargetAtTime(on ? cfg.gains[i] : 0, t, 0.03));
    this.pre.gain.setTargetAtTime(on ? Math.pow(10, cfg.preamp / 20) : 1, t, 0.03);
  }

  // Combined magnitude response (dB) of the whole filter chain at given frequencies.
  response(freqs, cfg) {
    const ctx = this.ctx || new OfflineAudioContext(1, 1, 44100);
    const total = new Float32Array(freqs.length).fill(cfg.enabled ? cfg.preamp : 0);
    const mag = new Float32Array(freqs.length);
    const phase = new Float32Array(freqs.length);
    EQ_FREQS.forEach((f, i) => {
      const b = ctx.createBiquadFilter();
      b.type = i === 0 ? 'lowshelf' : i === EQ_FREQS.length - 1 ? 'highshelf' : 'peaking';
      b.frequency.value = f; b.Q.value = 1.1; b.gain.value = cfg.enabled ? cfg.gains[i] : 0;
      b.getFrequencyResponse(freqs, mag, phase);
      for (let k = 0; k < freqs.length; k++) total[k] += 20 * Math.log10(mag[k]);
    });
    return total;
  }
}
