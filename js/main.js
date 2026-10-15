import * as THREE from 'three';
import { AssetManager } from './AssetsManager.js';
import { Player } from './Player.js';
import { Guard } from './Guard.js';
import { Level } from './Level.js';

// Режимы сложности: НОРМА / СЛОЖНО / НЕВОЗМОЖНО
const MODES = {
  normal:     { label:'НОРМА', baseSpeed:12, maxSpeed:24, gapMin:6, gapMax:12, doubleChance:0.18, shootMin:10, shootMax:18, warnTime:1.1, coinProb:0.45, vodkaProb:0.12, coinLineLen:2, wavyProb:0.25, chaseBase:0.28, chaseAnger:1.2, hitPenalty:1.35, bulletKill:false },
  hard:       { label:'СЛОЖНО', baseSpeed:15, maxSpeed:30, gapMin:5, gapMax:10, doubleChance:0.28, shootMin:7, shootMax:12, warnTime:1.0, coinProb:0.35, vodkaProb:0.10, coinLineLen:2, wavyProb:0.20, chaseBase:0.45, chaseAnger:1.4, hitPenalty:1.80, bulletKill:false },
  impossible: { label:'НЕВОЗМОЖНО', baseSpeed:19, maxSpeed:36, gapMin:4.5, gapMax:8, doubleChance:0.38, shootMin:5, shootMax:9, warnTime:0.8, coinProb:0.28, vodkaProb:0.08, coinLineLen:1, wavyProb:0.15, chaseBase:0.65, chaseAnger:1.6, hitPenalty:2.40, bulletKill:true },
};

export class Game {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xcfe6ff);

    // мобильный профиль: ниже DPR и без MSAA/теней ради FPS и батареи
    this.isMobile = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 200);
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: !this.isMobile,
      alpha: false,
      stencil: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.isMobile ? 1.5 : 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // теней в сцене нет (только blob-тени мешами), на мобилках shadow-карту не считаем вовсе
    this.renderer.shadowMap.enabled = !this.isMobile;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.clock = new THREE.Clock();

    this.assetManager = new AssetManager();
    this.player = null;
    this.guard = null;
    this.level = null;

    this.state = 'loading'; // loading, menu, cutscene, playing, paused, gameover
    this.best = parseInt(localStorage.getItem('school_best') || '0', 10);
    this.mode = 'normal';
    this.cutsceneIdx = 0;
    this.cutsceneData = [
      { who: 'gendos', name: 'ГЕНДОС', img: 'sprites/guard1.png', text: 'Так-так... Что это у нас тут? МАКСОГЕН! Опять куришь в школьном туалете?!' },
      { who: 'max', name: 'МАКСОГЕН', img: 'sprites/person1.png', text: 'Это... это не моё! Я просто держал для друга! Честно!' },
      { who: 'gendos', name: 'ГЕНДОС', img: 'sprites/sticker.png', text: 'ВСЁ! Достал! К директору! СТОЯТЬ!!!' },
      { who: 'max', name: 'МАКСОГЕН', img: 'sprites/person4.png', text: 'БЕЖИМ!!! (стресс: максимум)' },
    ];

    // DOM
    this.elScore = document.getElementById('score');
    this.elCoins = document.getElementById('coins');
    this.elVodka = document.getElementById('vodka');
    this.elBest = document.getElementById('best');
    this.elMult = document.getElementById('multiplier');
    this.elGuardFill = document.getElementById('guard-bar-fill');
    this.overlayStart = document.getElementById('overlay-start');
    this.overlayGO = document.getElementById('overlay-gameover');
    this.overlayPause = document.getElementById('overlay-pause');
    this.btnPlay = document.getElementById('btn-play');
    this.btnRestart = document.getElementById('btn-restart');
    this.btnResume = document.getElementById('btn-resume');
    this.loadingText = document.getElementById('loading');
    this.hitFlash = document.getElementById('hit-flash');
    this.eventBanner = document.getElementById('event-banner');
    this.vignette = document.getElementById('tunnel-vignette');
    this.overlayCut = document.getElementById('overlay-cutscene');
    this.cutImg = document.getElementById('cut-img');
    this.cutName = document.getElementById('cut-name');
    this.cutText = document.getElementById('cut-text');
    document.getElementById('btn-cut-next').addEventListener('click', () => this._cutsceneNext());
    document.getElementById('btn-cut-skip').addEventListener('click', () => this._cutsceneEnd());

    this.elBest.textContent = this.best;

    this._initLights();
    this._initEvents();
    this._resize();

    window.addEventListener('resize', () => this._resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this._resize(), 120));
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => this._resize());
    }
    // сворачивание/блокировка телефона — автопауза, иначе Гендос догонит без тебя
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.state === 'playing') this.pause();
        if (this._wakeLock) { this._wakeLock.release().catch(() => {}); this._wakeLock = null; }
      } else {
        this._acquireWakeLock();
        this.clock.getDelta();
      }
    });
  }

  // экран не гаснет посреди побега (Wake Lock API, где поддерживается)
  async _acquireWakeLock() {
    try {
      if ('wakeLock' in navigator && (this.state === 'playing' || this.state === 'cutscene')) {
        this._wakeLock = await navigator.wakeLock.request('screen');
      }
    } catch { /* не поддерживается — просто играем */ }
  }

  _toggleFullscreen() {
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      } else {
        const el = document.documentElement;
        (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
      }
    } catch { /* iPhone Safari не умеет — играем как есть */ }
  }

  _initLights() {
    const amb = new THREE.AmbientLight(0xffffff, 1.1);
    this.scene.add(amb);
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(4, 8, 6);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024,1024);
    dir.shadow.camera.near = 0.5;
    dir.shadow.camera.far = 40;
    dir.shadow.camera.left = -12;
    dir.shadow.camera.right = 12;
    dir.shadow.camera.top = 12;
    dir.shadow.camera.bottom = -12;
    this.scene.add(dir);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444466, 0.6);
    this.scene.add(hemi);
  }

  _initEvents() {
    this.btnPlay.addEventListener('click', () => this.startGame());
    this.btnRestart.addEventListener('click', () => this.restart());
    this.btnResume.addEventListener('click', () => this.resume());

    // долгое нажатие на canvas не должно вызывать контекстное меню
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    const btnFs = document.getElementById('btn-fs');
    if (btnFs) {
      const el = document.documentElement;
      if (!el.requestFullscreen && !el.webkitRequestFullscreen) btnFs.style.display = 'none';
      else btnFs.addEventListener('click', () => this._toggleFullscreen());
    }

    window.addEventListener('keydown', (e) => this._onKey(e));

    // mobile buttons
    document.getElementById('mc-left').addEventListener('touchstart', (e)=>{e.preventDefault(); this._tryMove(-1);}, {passive:false});
    document.getElementById('mc-right').addEventListener('touchstart', (e)=>{e.preventDefault(); this._tryMove(1);}, {passive:false});
    document.getElementById('mc-jump').addEventListener('touchstart', (e)=>{e.preventDefault(); this._tryJump();}, {passive:false});
    document.getElementById('mc-slide').addEventListener('touchstart', (e)=>{e.preventDefault(); this._trySlide();}, {passive:false});
    document.getElementById('mc-left').addEventListener('click', ()=>this._tryMove(-1));
    document.getElementById('mc-right').addEventListener('click', ()=>this._tryMove(1));
    document.getElementById('mc-jump').addEventListener('click', ()=>this._tryJump());
    document.getElementById('mc-slide').addEventListener('click', ()=>this._trySlide());

    // swipe
    let sx=0, sy=0;
    this.canvas.addEventListener('touchstart', (e)=>{
      sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    }, {passive:true});
    this.canvas.addEventListener('touchend', (e)=>{
      if (this.state!=='playing') return;
      const dx = e.changedTouches[0].clientX - sx;
      const dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > Math.abs(dy)) {
        if (Math.abs(dx)>30) this._tryMove(dx>0?1:-1);
      } else {
        if (dy < -30) this._tryJump();
        else if (dy > 30) this._trySlide();
      }
    }, {passive:true});
  }

  _tryMove(dir) { if (this.state==='playing') this.player.move(dir); }
  _tryJump() { if (this.state==='playing') this.player.jump(); }
  _trySlide() { if (this.state==='playing') this.player.slide(); }

  _onKey(e) {
    if (e.repeat) return;
    // e.code — раскладко-независимый (KeyA работает и при русской раскладке, где e.key='ф')
    const code = e.code;
    const key = (e.key || '').toLowerCase();
    const left = code==='ArrowLeft' || code==='KeyA' || key==='a' || key==='ф';
    const right = code==='ArrowRight' || code==='KeyD' || key==='d' || key==='в';
    const up = code==='ArrowUp' || code==='KeyW' || code==='Space' || key==='w' || key==='ц' || key===' ';
    const down = code==='ArrowDown' || code==='KeyS' || key==='s' || key==='ы';
    if (this.state==='playing') {
      if (left) { e.preventDefault(); this.player.move(-1); }
      if (right) { e.preventDefault(); this.player.move(1); }
      if (up) { e.preventDefault(); this.player.jump(); }
      if (down) { e.preventDefault(); this.player.slide(); }
      if (code==='KeyP' || code==='Escape' || key==='p' || key==='з') this.pause();
      return;
    }
    if (this.state==='paused') {
      if (code==='KeyP' || code==='Escape') this.resume();
      return;
    }
    if (this.state==='menu' && (code==='Space' || code==='Enter')) {
      this.startGame();
      return;
    }
    if (this.state==='gameover' && (code==='KeyR' || code==='Space' || code==='Enter')) {
      this.restart();
      return;
    }
    if (this.state==='cutscene' && (code==='Space' || code==='Enter' || code==='KeyE')) {
      this._cutsceneNext();
    }
  }

  _resize() {
    // visualViewport точнее отдаёт область без URL-плашки мобильного браузера
    const w = window.visualViewport ? window.visualViewport.width : window.innerWidth;
    const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
  }

  setMode(m) {
    if (!MODES[m]) return;
    this.mode = m;
    document.querySelectorAll('.mode-btn').forEach(b => {
      b.classList.toggle('selected', b.dataset.mode === m);
    });
  }

  async init() {
    await this.assetManager.load();
    // фон — skybox.jpg на весь экран по центру (3D-коридоры убраны)
    if (this.assetManager.textures.skybox) {
      this.scene.background = this.assetManager.textures.skybox;
    }
    document.querySelectorAll('.mode-btn').forEach(b => {
      b.addEventListener('click', () => this.setMode(b.dataset.mode));
    });
    this.setMode('normal');
    this.loadingText.textContent = 'Готово! Выбери режим и жми ИГРАТЬ';
    this.loadingText.style.color = '#2ecc71';

    // create game objects
    this.level = new Level(this.scene, this.assetManager);
    this.player = new Player(this.scene, this.assetManager);
    this.guard = new Guard(this.scene, this.assetManager);

    // set initial camera
    this._updateCamera(0);

    this.state = 'menu';
    this.overlayStart.classList.remove('hidden');

    this.animate();
  }

  startGame() {
    // перед побегом — катсцена в туалете; применяем выбранный режим
    this.level.applyMode(MODES[this.mode]);
    this.guard.applyMode(MODES[this.mode]);
    this.level.reset();
    this.player.reset();
    this.guard.reset();
    this.overlayStart.classList.add('hidden');
    this.overlayGO.classList.add('hidden');
    this.overlayPause.classList.add('hidden');
    this.cutsceneIdx = 0;
    this._cutsceneShow();
    this.state = 'cutscene';
    this._acquireWakeLock();
    this.clock.getDelta();
  }

  _cutsceneShow() {
    const step = this.cutsceneData[this.cutsceneIdx];
    this.cutImg.src = step.img;
    this.cutName.textContent = step.name;
    this.cutName.className = step.who === 'gendos' ? 'cut-name gendos' : 'cut-name max';
    this.cutText.textContent = step.text;
    document.getElementById('btn-cut-next').textContent =
      this.cutsceneIdx === this.cutsceneData.length - 1 ? 'БЕЖАТЬ! 🏃' : 'ДАЛЕЕ ▶';
    this.overlayCut.classList.remove('hidden');
  }

  _cutsceneNext() {
    if (this.state !== 'cutscene') return;
    this.cutsceneIdx++;
    if (this.cutsceneIdx >= this.cutsceneData.length) this._cutsceneEnd();
    else this._cutsceneShow();
  }

  _cutsceneEnd() {
    this.overlayCut.classList.add('hidden');
    this.state = 'playing';
    this.clock.getDelta();
  }

  pause() {
    if (this.state!=='playing') return;
    this.state='paused';
    this.overlayPause.classList.remove('hidden');
  }
  resume() {
    if (this.state!=='paused') return;
    this.overlayPause.classList.add('hidden');
    this.state='playing';
    this._acquireWakeLock();
    this.clock.getDelta();
  }
  restart() {
    this.level.reset();
    this.player.reset();
    this.guard.reset();
    this.overlayGO.classList.add('hidden');
    this.overlayPause.classList.add('hidden');
    this.overlayCut.classList.add('hidden');
    this.state='playing';
    this.clock.getDelta();
  }

  gameOver(reason='Гендос догнал Максогена') {
    this.state='gameover';
    const score = Math.floor(this.level.score);
    document.getElementById('go-score').textContent = score;
    document.getElementById('go-coins').textContent = this.level.coins;
    document.getElementById('go-vodka').textContent = this.level.vodka;
    document.getElementById('go-dist').textContent = Math.floor(this.level.distance);
    document.getElementById('go-mode').textContent = MODES[this.mode].label;
    document.getElementById('go-reason').textContent = reason;
    if (score > this.best) {
      this.best = score;
      localStorage.setItem('school_best', String(score));
    }
    this.elBest.textContent = this.best;
    document.getElementById('go-title').textContent = score>500?'НЕВЕРОЯТНО!':'ПОЙМАН!';
    this.overlayGO.classList.remove('hidden');
  }

  _updateCamera(delta) {
    const targetX = this.player ? this.player.currentX * 0.35 : 0;
    const targetY = 3.25 + (this.player ? this.player.y * 0.22 : 0);
    // на узком портретном экране отъезжаем и расширяем FOV, иначе крайние дорожки обрежет
    const narrow = this.camera.aspect < 0.9;
    const baseZ = narrow ? 8.4 : 7.2;
    const fovBoost = THREE.MathUtils.clamp(0.95 / this.camera.aspect, 1, 1.32);
    // smooth follow
    const camX = THREE.MathUtils.lerp(this.camera.position.x, targetX, Math.min(1, delta*4));
    const camY = THREE.MathUtils.lerp(this.camera.position.y, targetY, Math.min(1, delta*4));
    this.camera.position.set(camX, camY, baseZ);
    const lookY = 0.75 + (this.player? this.player.y*0.08:0);
    const lookX = this.player ? this.player.currentX*0.28 : 0;
    this.camera.lookAt(lookX, lookY, -14);
    // slight FOV boost with speed
    if (this.level) {
      const speedFactor = (this.level.speed - this.level.baseSpeed) / (this.level.maxSpeed - this.level.baseSpeed);
      this.camera.fov = (68 + speedFactor*6) * fovBoost;
      this.camera.updateProjectionMatrix();
    }
  }

  _updateHUD() {
    this.elScore.textContent = Math.floor(this.level.score);
    this.elCoins.textContent = this.level.coins;
    this.elVodka.textContent = this.level.vodka;
    if (this.level.multiplier > 1) {
      this.elMult.classList.remove('hidden');
      this.elMult.innerHTML = `x${this.level.multiplier} <span>${this.level.multiplierTimer.toFixed(1)}с</span>`;
    } else {
      this.elMult.classList.add('hidden');
    }
    // guard bar: distance 1.1 caught -> 0%, 8.0 far -> 100%
    const pct = THREE.MathUtils.clamp((this.guard.distance - 1.1) / (8.0 - 1.1), 0, 1);
    this.elGuardFill.style.width = `${pct*100}%`;
    if (pct < 0.28) {
      this.elGuardFill.style.background = 'linear-gradient(90deg,#e74c3c,#c0392b)';
    } else if (pct < 0.55) {
      this.elGuardFill.style.background = 'linear-gradient(90deg,#f1c40f,#e67e22)';
    } else {
      this.elGuardFill.style.background = 'linear-gradient(90deg,#2ecc71,#1abc9c)';
    }
  }

  animate() {
    requestAnimationFrame(()=>this.animate());
    const delta = Math.min(this.clock.getDelta(), 0.033);
    // состояние в body: CSS показывает тач-кнопки только во время игры
    if (document.body.dataset.state !== this.state) {
      document.body.dataset.state = this.state;
    }

    if (this.state==='playing' && this.level && this.player && this.guard) {
      this.level.update(delta, this.camera, this.player, this.guard);
      this.guard.update(delta, this.player, this.level.speed);
      this.player.update(delta, this.guard.distance);

      const res = this.level.checkCollisions(this.player);
      if (res.coinCollected) {
        const isVodka = res.coinCollected.type === 'vodka';
        if (isVodka) {
          this.guard.onPlayerPowerUp();
          this._pulseScreen('#00d2ff');
          this.camera.position.x += (Math.random()-0.5)*0.18;
        }
      }
      // пули Гендоса (на НЕВОЗМОЖНО — сразу проигрыш)
      const bulletHit = this.level.checkBullets(this.player);
      if (bulletHit) {
        if (MODES[this.mode].bulletKill) {
          this.gameOver('Гендос подстрелил Максогена!');
        } else {
          this.player.hit();
          this.guard.onPlayerHit();
          this.level.eventText = '🔫 ГЕНДОС ПОПАЛ! Максоген шатается!';
          this.level.eventTextTimer = 1.4;
          this._flashHit();
          if (this.guard.isCaught()) {
            this.gameOver('Гендос подстрелил Максогена и схватил его!');
          }
        }
      }
      if (res.hit) {
        if (this.player.invuln <= 0) {
          this.player.hit();
          this.guard.onPlayerHit();
          this._flashHit();
          if (this.guard.isCaught()) {
            this.gameOver('Гендос схватил Максогена после столкновения!');
          }
        }
      } else {
        if (this.guard.isCaught()) {
          this.gameOver('Гендос догнал Максогена!');
        }
      }

      // баннер временного ивента
      if (this.level.eventText) {
        this.eventBanner.textContent = this.level.eventText;
        this.eventBanner.classList.remove('hidden');
      } else {
        this.eventBanner.classList.add('hidden');
      }
      // затемнение туннеля + индикатор полёта
      if (this.player.mode === 'tunnel') {
        this.vignette.classList.remove('hidden');
        this.eventBanner.textContent = `🕳 ТУННЕЛЬ • ${this.player.modeTimer.toFixed(0)}с`;
        this.eventBanner.classList.remove('hidden');
      } else {
        this.vignette.classList.add('hidden');
        if (this.player.mode === 'fly' && !this.level.eventText) {
          this.eventBanner.textContent = `🚀 ДЖЕТПАК • ${this.player.modeTimer.toFixed(0)}с`;
          this.eventBanner.classList.remove('hidden');
        }
      }

      this._updateHUD();
    } else if (this.state==='menu' || this.state==='cutscene' || this.state==='gameover' || this.state==='paused') {
      if (this.level && this.player) {
        if (this.state==='menu' || this.state==='cutscene') {
          const idleDelta = 0.016;
          this.level.update(idleDelta * 0.35, this.camera);
          this.guard.update(idleDelta, this.player, 5);
          this.guard.distance = 5.5;
          this.player.update(idleDelta, this.guard.distance);
        }
      }
    }

    this._updateCamera(delta);
    this.renderer.render(this.scene, this.camera);
  }

  _flashHit() {
    this.hitFlash.classList.add('active');
    setTimeout(()=>this.hitFlash.classList.remove('active'), 140);
    // camera shake
    const origX = this.camera.position.x;
    this.camera.position.x += (Math.random()-0.5)*0.5;
    setTimeout(()=>{ this.camera.position.x = origX; }, 90);
  }
  _pulseScreen(color) {
    this.hitFlash.style.background = color + '55';
    this.hitFlash.classList.add('active');
    setTimeout(()=>{
      this.hitFlash.classList.remove('active');
      this.hitFlash.style.background = '';
    }, 220);
  }
}
