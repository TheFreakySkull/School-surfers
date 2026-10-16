import * as THREE from 'three';

// Дуэль с Гендосом: мир замирает, камера улетает за спину Максогена,
// дальше QTE — 3 раунда. Показанную кнопку надо нажать вовремя:
// попал — Гендос получает, промазал/не успел — ран сразу кончается.
const ARROWS = { left: '◀', right: '▶', up: '▲', down: '▼' };
const ROUND_TIME = [1.8, 1.4, 1.1];
export const DUEL_ROUNDS = 3;

export class Duel {
  constructor(scene) {
    this.scene = scene;
    this.active = false;
    this.transition = 0; // перелёт камеры, ввод заблокирован
    this.round = 0;
    this.prompt = null;
    this.timer = 0;
    this.roundTime = 1;
    this.lastPrompt = null;
    this.timeScale = 1; // Level ужимает окна раундов по мере роста сложности

    // вспышки выстрелов (видны камере за спиной Максогена)
    const mkFlash = () => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(0.85, 0.85),
        new THREE.MeshBasicMaterial({ color: 0xfff2a8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      m.rotation.y = Math.PI;
      m.visible = false;
      scene.add(m);
      return m;
    };
    this.playerFlash = mkFlash();
    this.guardFlash = mkFlash();
    this.playerFlashT = 0;
    this.guardFlashT = 0;
  }

  start() {
    this.active = true;
    this.transition = 1.0;
    this.round = 0;
    this.prompt = null;
    this.timer = 0;
    this.lastPrompt = null;
    this.nextRound();
  }

  nextRound() {
    this.round++;
    const opts = ['left', 'right', 'up', 'down'].filter(d => d !== this.lastPrompt);
    this.prompt = opts[(Math.random() * opts.length) | 0];
    this.lastPrompt = this.prompt;
    this.roundTime = ROUND_TIME[Math.min(this.round - 1, ROUND_TIME.length - 1)] * this.timeScale;
    this.timer = this.roundTime;
  }

  get arrow() { return ARROWS[this.prompt] || ''; }
  get progress() { return this.roundTime > 0 ? Math.max(0, this.timer / this.roundTime) : 0; }

  // 'hit' | 'miss' | null (перелёт камеры / нет активной дуэли)
  input(dir) {
    if (!this.active || this.transition > 0 || !this.prompt) return null;
    return dir === this.prompt ? 'hit' : 'miss';
  }

  // 'timeout' | null
  update(delta) {
    if (!this.active) return null;
    this._tickFlashes(delta);
    if (this.transition > 0) {
      this.transition -= delta;
      return null;
    }
    this.timer -= delta;
    if (this.timer <= 0) return 'timeout';
    return null;
  }

  onPlayerShoot(x, y, z) {
    this.playerFlash.position.set(x, y, z);
    this.playerFlash.visible = true;
    this.playerFlash.material.opacity = 1;
    this.playerFlashT = 0.14;
  }

  onGuardShoot(x, y, z) {
    this.guardFlash.position.set(x, y, z);
    this.guardFlash.visible = true;
    this.guardFlash.material.opacity = 1;
    this.guardFlashT = 0.2;
  }

  _tickFlashes(delta) {
    if (this.playerFlashT > 0) {
      this.playerFlashT -= delta;
      this.playerFlash.material.opacity = Math.max(0, this.playerFlashT / 0.14);
      if (this.playerFlashT <= 0) this.playerFlash.visible = false;
    }
    if (this.guardFlashT > 0) {
      this.guardFlashT -= delta;
      this.guardFlash.material.opacity = Math.max(0, this.guardFlashT / 0.2);
      if (this.guardFlashT <= 0) this.guardFlash.visible = false;
    }
  }

  reset() {
    this.active = false;
    this.transition = 0;
    this.round = 0;
    this.prompt = null;
    this.timer = 0;
    this.timeScale = 1;
    this.playerFlash.visible = false;
    this.guardFlash.visible = false;
    this.playerFlashT = 0;
    this.guardFlashT = 0;
  }
}
