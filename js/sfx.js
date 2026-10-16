// Крошечные процедурные звуки на WebAudio — без аудиофайлов.
// Контекст создаётся по первому жесту игрока (иначе браузер заблокирует).
class Sfx {
  constructor() {
    this.ctx = null;
  }

  ensure() {
    try {
      if (!this.ctx && typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    } catch { /* без звука — играем молча */ }
  }

  _tone(freq, dur, type = 'sine', vol = 0.12, slideTo = null, delay = 0) {
    if (!this.ctx) return;
    try {
      const t0 = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g).connect(this.ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch { /* ignore */ }
  }

  horn() { // клаксон форда: две дудки
    this._tone(400, 0.45, 'square', 0.07);
    this._tone(505, 0.45, 'square', 0.07);
  }
  shot() { this._tone(750, 0.16, 'square', 0.10, 90); }          // выстрел Гендоса
  pew() { this._tone(1250, 0.09, 'square', 0.05, 600); }         // выстрел Максогена
  pickup() { this._tone(660, 0.09, 'sine', 0.10); this._tone(880, 0.12, 'sine', 0.10, null, 0.09); }
  crash() { this._tone(150, 0.45, 'sawtooth', 0.16, 35); }       // авария / удар
  win() { [523, 659, 784].forEach((f, i) => this._tone(f, 0.14, 'sine', 0.10, null, i * 0.11)); }
}

export const sfx = new Sfx();
