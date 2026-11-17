// All sound is synthesized with WebAudio — no audio files, no network.
// Engine hum, two-tone siren, gunshots, pickups, UI clicks, and a
// synthwave bassline + arpeggio loop that answers the wanted level.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicOn = true;
    this.unlocked = false;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenLfo = null;
    this.sirenGain = null;
    this.musicTimer = null;
    this.musicStep = 0;
  }

  unlock() {
    if (this.unlocked) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.unlocked = true;
      this.startEngine();
      this.startMusic();
    } catch {
      this.unlocked = false;
    }
  }

  now() { return this.ctx ? this.ctx.currentTime : 0; }

  blip(freq, dur, type, vol, slideTo) {
    if (!this.ctx) return;
    const t = this.now();
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    g.gain.setValueAtTime(vol || 0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noise(dur, vol, lowpass) {
    if (!this.ctx) return;
    const t = this.now();
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass || 1800;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t);
  }

  gunshot() { this.noise(0.14, 0.5, 2600); this.blip(160, 0.08, 'sawtooth', 0.2, 55); }
  hit() { this.blip(880, 0.07, 'sine', 0.2, 660); }
  pickup() { this.blip(660, 0.09, 'sine', 0.22); setTimeout(() => this.blip(990, 0.12, 'sine', 0.22), 70); }
  heal() { this.blip(523, 0.1, 'sine', 0.2); setTimeout(() => this.blip(784, 0.16, 'sine', 0.2), 90); }
  cash() {
    this.blip(784, 0.08, 'triangle', 0.22);
    setTimeout(() => this.blip(1046, 0.08, 'triangle', 0.22), 80);
    setTimeout(() => this.blip(1318, 0.16, 'triangle', 0.22), 160);
  }
  click() { this.blip(520, 0.05, 'square', 0.12); }
  denied() { this.blip(180, 0.16, 'square', 0.16, 120); }
  missionStart() { this.blip(392, 0.12, 'triangle', 0.22); setTimeout(() => this.blip(523, 0.18, 'triangle', 0.22), 110); }
  missionDone() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.2, 'triangle', 0.24), i * 110));
  }
  wantedUp() { this.blip(220, 0.12, 'sawtooth', 0.2, 440); }
  doorSlam() { this.noise(0.1, 0.35, 500); this.blip(90, 0.1, 'sine', 0.3, 50); }
  crash() { this.noise(0.22, 0.45, 900); this.blip(70, 0.18, 'sawtooth', 0.25, 40); }

  // Continuous engine drone whose pitch follows speed.
  startEngine() {
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    osc2.type = 'square';
    osc2.frequency.value = 28;
    g.gain.value = 0.0;
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    osc.start();
    osc2.start();
    this.engineOsc = osc;
    this.engineOsc2 = osc2;
    this.engineGain = g;
  }

  setEngine(speedRatio, driving) {
    if (!this.engineGain) return;
    const target = driving ? 0.05 + speedRatio * 0.09 : 0.0;
    this.engineGain.gain.setTargetAtTime(target, this.now(), 0.08);
    if (this.engineOsc) this.engineOsc.frequency.setTargetAtTime(55 + speedRatio * 130, this.now(), 0.1);
    if (this.engineOsc2) this.engineOsc2.frequency.setTargetAtTime(28 + speedRatio * 65, this.now(), 0.1);
  }

  // Two-tone police siren while wanted >= 1.
  setSiren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = 700;
      g.gain.value = 0.05;
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      lfo.frequency.value = 0.7;
      lfoGain.gain.value = 220;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      osc.connect(g);
      g.connect(this.master);
      osc.start();
      lfo.start();
      this.sirenOsc = osc;
      this.sirenLfo = lfo;
      this.sirenGain = g;
    } else if (!on && this.sirenOsc) {
      try { this.sirenOsc.stop(); this.sirenLfo.stop(); } catch { /* already stopped */ }
      this.sirenOsc = null;
      this.sirenLfo = null;
      this.sirenGain = null;
    }
  }

  // A slow synthwave loop: bassline, pad, and a sparse arpeggio.
  // The arpeggio quickens when the player is wanted.
  startMusic() {
    if (this.musicTimer) return;
    const bassNotes = [55, 55, 65.41, 49, 55, 55, 82.41, 73.42];
    const padNotes = [220, 261.63, 329.63, 392];
    const arpNotes = [440, 523.25, 659.25, 523.25, 440, 392, 523.25, 659.25];
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.ctx.state === 'suspended' || !this.musicOn) return;
      const step = this.musicStep;
      this.musicStep += 1;
      const bass = bassNotes[step % bassNotes.length];
      this.blip(bass, 0.42, 'sawtooth', 0.05);
      this.blip(bass / 2, 0.42, 'sine', 0.07);
      if (step % 8 === 0) {
        const pad = padNotes[((step / 8) | 0) % padNotes.length];
        this.blip(pad, 1.6, 'triangle', 0.035);
        this.blip(pad * 1.5, 1.6, 'triangle', 0.025);
      }
      if (step % 2 === 0) this.blip(arpNotes[step % arpNotes.length], 0.18, 'square', 0.018);
      if (step % 4 === 2) this.blip(1200, 0.04, 'square', 0.02);
    }, 300);
  }

  suspend() { if (this.ctx) this.ctx.suspend(); }
  resume() { if (this.ctx) this.ctx.resume(); }
}
