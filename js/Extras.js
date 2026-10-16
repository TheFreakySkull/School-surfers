import * as THREE from 'three';
import { buildObstacle, buildPickup } from './Models.js';
import { IgnatCar } from './Car.js';

// EXTRAS-книга FNAF-стайл: 3D-галерея всех моделек (смотреть/крутить/читать),
// конструктор своего рана и темы интерфейса.

const THEMES = [
  { id: 'default', name: 'Дефолт', desc: 'Классика School Surfers' },
  { id: 'dark', name: 'Тёмная', desc: 'Ночь, AMOLED, глаза отдыхают' },
  { id: 'win98', name: 'Windows 98', desc: 'Серые панели и скошенные кнопки' },
  { id: 'win7', name: 'Windows 7', desc: 'Стеклянное aero с голубым свечением' },
  { id: 'neon', name: 'Неон', desc: 'Киберпанк: маджента и циан' },
];

// Параметры конструктора рана: слайдеры и тумблеры
const PARAMS = [
  { key: 'baseSpeed', label: 'Стартовая скорость', min: 8, max: 24, step: 1 },
  { key: 'maxSpeed', label: 'Макс. скорость', min: 16, max: 40, step: 1 },
  { key: 'chaseBase', label: 'Догон Гендоса', min: 0.1, max: 1.0, step: 0.05 },
  { key: 'hitPenalty', label: 'Штраф за удар', min: 0.5, max: 3.0, step: 0.1 },
  { key: 'hp', label: 'Здоровье (сердца)', min: 1, max: 10, step: 1 },
  { key: 'shootEvery', label: 'Выстрелы каждые, с', min: 4, max: 25, step: 1 },
  { key: 'carEvery', label: 'Форд каждые, с', min: 10, max: 60, step: 1 },
  { key: 'coinPatternP', label: 'Частота монет', min: 0.1, max: 0.7, step: 0.02 },
  { key: 'mercyDist', label: 'Радиус последнего шанса', min: 1.5, max: 5.0, step: 0.1 },
  { key: 'bulletKill', label: 'Пуля = смерть', type: 'toggle' },
];

function spritePlane(tex, w, h) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex || null, transparent: true, side: THREE.DoubleSide })
  );
  m.position.y = h / 2;
  return m;
}

export class Extras {
  constructor() {
    this.am = null;
    this.presets = null;
    this.onPlayCustom = null;
    this.bookOpen = false;
    this.models = [];
    this.modelIdx = 0;
    this.values = {};
    // вьювер
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.turntable = null;
    this.rotX = 0.15;
    this.dragging = false;
    this.lastDrag = 0;
  }

  init(am, presets) {
    this.am = am;
    this.presets = presets;
    try {
      const saved = JSON.parse(localStorage.getItem('school_custom') || '{}');
      this.values = { ...this._presetValues('normal'), ...saved };
    } catch {
      this.values = this._presetValues('normal');
    }
    this._buildRegistry();
    this._buildCustomUI();
    this._buildThemeUI();
    this.applyTheme(localStorage.getItem('school_theme') || 'default');
    this._bindTabs();
    document.getElementById('model-prev').addEventListener('click', () => this.showModel(this.modelIdx - 1));
    document.getElementById('model-next').addEventListener('click', () => this.showModel(this.modelIdx + 1));
    document.getElementById('btn-custom-play').addEventListener('click', () => {
      if (this.onPlayCustom) this.onPlayCustom();
    });
    document.querySelectorAll('#tab-custom [data-preset]').forEach(b => {
      b.addEventListener('click', () => {
        this.values = { ...this._presetValues(b.dataset.preset) };
        this._syncCustomUI();
      });
    });
  }

  _presetValues(name) {
    const p = (this.presets && this.presets[name]) || {};
    return {
      baseSpeed: p.baseSpeed ?? 12, maxSpeed: p.maxSpeed ?? 24,
      chaseBase: p.chaseBase ?? 0.28, hitPenalty: p.hitPenalty ?? 1.35,
      hp: 5, shootEvery: p.shootMin ?? 10, carEvery: p.carMin ?? 26,
      coinPatternP: p.coinPatternP ?? 0.38, mercyDist: p.mercyDist ?? 3.5,
      bulletKill: !!p.bulletKill,
    };
  }

  customOpts() {
    const v = this.values;
    return {
      label: 'СВОЙ', baseSpeed: v.baseSpeed, maxSpeed: v.maxSpeed,
      gapMin: 6, gapMax: 12, doubleChance: 0.18,
      shootMin: v.shootEvery, shootMax: v.shootEvery + 4, warnTime: 1.1,
      coinPatternP: v.coinPatternP, arcP: 0.45,
      carMin: v.carEvery, carMax: v.carEvery + 10, mercyDist: v.mercyDist,
      chaseBase: v.chaseBase, chaseAnger: 1.2, hitPenalty: v.hitPenalty,
      hp: v.hp, bulletKill: v.bulletKill,
    };
  }

  // ---------- галерея ----------
  _buildRegistry() {
    const T = this.am.textures;
    const P = (i, w = 2.0, h = 2.4) => spritePlane(T.person[i] || null, w, h);
    const G = (i, w = 2.15, h = 2.6) => spritePlane(T.guard[i] || null, w, h);
    this.models = [
      { name: 'Максоген', desc: 'Учитель географии. Спалили с сигаретой в туалете — теперь улепётывает от обжэшника по всей школе. 4 версии лица: чем ближе Гендос — тем выше стресс.', tags: ['герой', 'географ', '4 версии'], build: () => P(0) },
      { name: 'Гендос', desc: 'Учитель ОБЖ. Помешан на дисциплине и технике безопасности. Догоняет, злится и растёт: спокойный → напряжённый → злой с пистолетом.', tags: ['догоняет', 'обжэшник', '3 версии'], build: () => G(0) },
      { name: 'Игнатьевич', desc: 'Физрук. Владелец красного форда-кабриолета. Выезжает на дорожку и давит. Один раз подруливает за тобой — не зевай.', tags: ['форд', 'физрук', 'таран'], build: () => spritePlane(T.sergey || null, 1.8, 0.83) },
      { name: 'Красный Ford Fusion', desc: 'Кабриолет Игнатьевича: лобовое почти прозрачное, водитель виден. Фары моргают, колёса крутятся.', tags: ['транспорт', 'ивент'], build: () => { const c = new IgnatCar(this.scene, this.am); c.spawn(0, 0); return c.group; } },
      { name: 'Парта', desc: 'Школьная парта с учебником. Низкая — перепрыгивай.', tags: ['прыжок'], build: () => buildObstacle('desk').group },
      { name: 'Шкаф', desc: 'Синий шкаф во всю дорожку. Не перепрыгнуть — только объезд.', tags: ['объезд'], build: () => buildObstacle('locker').group },
      { name: 'Стопка книг', desc: 'Четыре учебника друг на друге. Прыгай сквозь арку монет над ними.', tags: ['прыжок', 'арка'], build: () => buildObstacle('books').group },
      { name: 'Урна', desc: 'Мусорка с бумажкой. Низкая — прыжок.', tags: ['прыжок'], build: () => buildObstacle('trash').group },
      { name: 'Турник', desc: 'Красный барьер с лентой. Только подкат!', tags: ['подкат'], build: () => buildObstacle('barrier').group },
      { name: 'Сигарета', desc: 'Причина всех бед Максогена. +10 очков.', tags: ['+10'], build: () => spritePlane(T.coin1 || null, 1.0, 1.0) },
      { name: 'Бутылка', desc: '+50, ускорение x2 на 5 секунд и отброс Гендоса. Спавнится поштучно и только когда шкала Гендоса почти на нуле — последний шанс.', tags: ['+50', 'щит'], build: () => spritePlane(T.coin2 || null, 1.5, 1.5) },
      { name: 'Люк', desc: 'Уход в туннель на 6 секунд: там темно, но безопасно и монеты.', tags: ['подуровень'], build: () => buildPickup('tunnel').group },
      { name: 'Джетпак', desc: 'Полёт за аркой монет на 6 секунд. Препятствия и пули не достают.', tags: ['подуровень'], build: () => buildPickup('jet').group },
      { name: 'Ствол', desc: 'Разворот на 360° и дуэль с Гендосом: жми показанные кнопки 3 раунда. Ошибка — смерть.', tags: ['дуэль'], build: () => buildPickup('gun').group },
    ];
  }

  _ensureViewer() {
    if (this.renderer) return;
    const canvas = document.getElementById('extra-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444466, 1.0));
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(3, 5, 4);
    this.scene.add(dir);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1.7, 28),
      new THREE.MeshStandardMaterial({ color: 0x2a2a35, roughness: 0.9 })
    );
    disc.rotation.x = -Math.PI / 2;
    this.scene.add(disc);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.7, 1.85, 28),
      new THREE.MeshBasicMaterial({ color: 0xffdd33, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    this.scene.add(ring);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    this.turntable = new THREE.Group();
    this.scene.add(this.turntable);
    // кручение мышью/пальцем
    let px = 0, py = 0;
    canvas.addEventListener('pointerdown', (e) => { this.dragging = true; px = e.clientX; py = e.clientY; this.lastDrag = Date.now(); canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.turntable.rotation.y += (e.clientX - px) * 0.012;
      this.rotX = THREE.MathUtils.clamp(this.rotX + (e.clientY - py) * 0.006, -0.15, 1.0);
      px = e.clientX; py = e.clientY;
      this.lastDrag = Date.now();
    });
    const stop = () => { this.dragging = false; };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);
    const loop = () => {
      requestAnimationFrame(loop);
      if (!this.bookOpen) return;
      if (!this.dragging && Date.now() - this.lastDrag > 2000) {
        this.turntable.rotation.y += 0.012;
      }
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  showModel(i) {
    if (!this.models.length) return;
    this.modelIdx = (i + this.models.length) % this.models.length;
    this._ensureViewer();
    while (this.turntable.children.length) this.turntable.remove(this.turntable.children[0]);
    const entry = this.models[this.modelIdx];
    let root;
    try {
      root = entry.build();
    } catch (e) {
      console.warn('model build failed', entry.name, e);
      root = new THREE.Group();
    }
    this.turntable.add(root);
    this.turntable.rotation.y = 0;
    // кадрируем камеру под размер модели
    const box = new THREE.Box3().setFromObject(root);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const r = Math.max(0.8, sphere.radius);
    const dist = r * 2.7;
    this.camera.position.set(dist * 0.55, r * 1.1 + 0.5, dist * 0.85);
    this.camera.lookAt(0, Math.min(1.2, r * 0.55), 0);
    this.camera.aspect = 1;
    this.camera.updateProjectionMatrix();
    const canvas = document.getElementById('extra-canvas');
    const rect = canvas.getBoundingClientRect();
    if (rect.width > 0) {
      this.renderer.setSize(rect.width, rect.height || 260, false);
      this.camera.aspect = rect.width / (rect.height || 260);
      this.camera.updateProjectionMatrix();
    }
    document.getElementById('model-name').textContent = entry.name;
    document.getElementById('model-desc').textContent = entry.desc;
    document.getElementById('model-tags').innerHTML =
      entry.tags.map(t => `<span class="model-tag">${t}</span>`).join('');
    document.getElementById('model-count').textContent = `${this.modelIdx + 1}/${this.models.length}`;
    this.lastDrag = 0; // сразу крутится само
  }

  // ---------- конструктор рана ----------
  _buildCustomUI() {
    const box = document.getElementById('custom-controls');
    box.innerHTML = '';
    for (const p of PARAMS) {
      const div = document.createElement('div');
      div.className = 'custom-ctl' + (p.type === 'toggle' ? ' toggle' : '');
      if (p.type === 'toggle') {
        div.innerHTML = `<label>${p.label}</label><span class="switch"><input type="checkbox" data-key="${p.key}"><i></i></span>`;
        const input = div.querySelector('input');
        input.checked = !!this.values[p.key];
        input.addEventListener('change', () => {
          this.values[p.key] = input.checked;
          this._saveCustom();
        });
      } else {
        div.innerHTML = `<label>${p.label} <b data-val="${p.key}"></b></label>` +
          `<input type="range" data-key="${p.key}" min="${p.min}" max="${p.max}" step="${p.step}">`;
        const input = div.querySelector('input');
        input.value = this.values[p.key];
        const out = div.querySelector('b');
        out.textContent = this.values[p.key];
        input.addEventListener('input', () => {
          this.values[p.key] = parseFloat(input.value);
          out.textContent = input.value;
          this._saveCustom();
        });
      }
      box.appendChild(div);
    }
  }

  _syncCustomUI() {
    document.querySelectorAll('#custom-controls [data-key]').forEach(el => {
      const k = el.dataset.key;
      if (el.type === 'checkbox') el.checked = !!this.values[k];
      else {
        el.value = this.values[k];
        const out = el.closest('.custom-ctl').querySelector('b');
        if (out) out.textContent = el.value;
      }
    });
  }

  _saveCustom() {
    try { localStorage.setItem('school_custom', JSON.stringify(this.values)); } catch { /* ignore */ }
  }

  // ---------- темы ----------
  _buildThemeUI() {
    const box = document.getElementById('theme-list');
    box.innerHTML = '';
    for (const t of THEMES) {
      const div = document.createElement('div');
      div.className = 'theme-card' + (this.currentTheme() === t.id ? ' selected' : '');
      div.dataset.theme = t.id;
      div.innerHTML = `<span class="theme-swatch swatch-${t.id}"></span><span><b>${t.name}</b><small>${t.desc}</small></span>`;
      div.addEventListener('click', () => this.applyTheme(t.id));
      box.appendChild(div);
    }
  }

  currentTheme() {
    return document.body.dataset.theme || 'default';
  }

  applyTheme(id) {
    if (!THEMES.some(t => t.id === id)) id = 'default';
    document.body.dataset.theme = id;
    try { localStorage.setItem('school_theme', id); } catch { /* ignore */ }
    document.querySelectorAll('.theme-card').forEach(c => {
      c.classList.toggle('selected', c.dataset.theme === id);
    });
  }

  // ---------- книга ----------
  _bindTabs() {
    document.querySelectorAll('.book-tab[data-tab]').forEach(b => {
      b.addEventListener('click', () => this.open(b.dataset.tab));
    });
  }

  open(tab = 'models') {
    this.bookOpen = true;
    document.getElementById('overlay-extra').classList.remove('hidden');
    document.querySelectorAll('.book-tab[data-tab]').forEach(b => {
      b.classList.toggle('selected', b.dataset.tab === tab);
    });
    document.querySelectorAll('.book-page').forEach(p => p.classList.add('hidden'));
    const page = document.getElementById('tab-' + tab);
    if (page) page.classList.remove('hidden');
    if (tab === 'models') {
      this.showModel(this.modelIdx);
      // канвас мог быть невидим — обновляем размер
      setTimeout(() => this.showModel(this.modelIdx), 50);
    }
  }

  close() {
    this.bookOpen = false;
    document.getElementById('overlay-extra').classList.add('hidden');
  }

  isOpen() { return this.bookOpen; }
}
