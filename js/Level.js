import * as THREE from 'three';
import { IgnatCar } from './Car.js';
import { buildObstacle, buildPickup } from './Models.js';
import { Duel, DUEL_ROUNDS } from './Duel.js';
import { sfx } from './sfx.js';

export class Level {
  constructor(scene, assetManager) {
    this.scene = scene;
    this.am = assetManager;
    this.LANES = [-2.6, 0, 2.6];

    // параметры сложности (переопределяются через applyMode)
    this.baseSpeed = 12;
    this.maxSpeed = 24;
    this.gapMin = 6; this.gapMax = 12;
    this.doubleChance = 0.18;
    this.shootMin = 10; this.shootMax = 18;
    this.warnTime = 1.1;
    this.coinPatternP = 0.38; // доля сегментов с монетными паттернами
    this.arcP = 0.45;         // шанс арки над низким препятствием
    this.carMin = 26; this.carMax = 38; // интервал ивента с фордом

    this.speed = this.baseSpeed;
    this.score = 0;
    this.coins = 0;
    this.vodka = 0;
    this.dodges = 0;
    this.distance = 0;
    this.elapsed = 0; // время забега — сложность растёт со временем
    this.multiplier = 1;
    this.multiplierTimer = 0;

    this.obstacles = [];
    this.coinMeshes = [];
    this.pickups = []; // люк вниз / джетпак вверх
    this.world = new THREE.Group();
    scene.add(this.world);

    this.floors = [];
    this.lowFloors = []; // нижний ярус для подуровня «люк»

    // пули Гендоса + временные ивенты
    this.bullets = [];
    this.shootTimer = 9;
    this.warnTimer = 0;
    this.warnLane = 1;
    this.eventText = '';
    this.eventTextTimer = 0;

    // подуровни: люк/джетпак — крайне редкие гости
    this.pickupTimer = 45;
    this.pickupNext = 'tunnel';
    this.gunTimer = 32; // ствол для перестрелки — редкий

    // mercy-бутылка: последний шанс перед проигрышем
    this.mercyDist = 3.5; // на НОРМЕ раньше (щедрее), на сложных — позже
    this.mercyT = 0;

    // Игнатьевич на красном форде
    this.car = new IgnatCar(scene, assetManager);
    this.carTimer = 24;
    this.carWarn = 0;
    this.carLane = 1;
    this.carHomed = false; // подруливание на середине пути
    this.carT = 0;

    // дуэль с Гендосом: мир замирает, решает QTE
    this.duel = new Duel(scene);
    this.duelLost = false;

    this._floorTex = this._makeFloorTexture();

    this._buildGround();
    this._spawnInitial();
  }

  applyMode(opts) {
    if (!opts) return;
    for (const k of ['baseSpeed','maxSpeed','gapMin','gapMax','doubleChance',
      'shootMin','shootMax','warnTime','coinPatternP','arcP','carMin','carMax','mercyDist']) {
      if (opts[k] !== undefined) this[k] = opts[k];
    }
    this.speed = this.baseSpeed;
  }

  // процедурный школьный линолеум: бежево-серая шахматка с крапом
  _makeFloorTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const T = 64;
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const even = (x + y) % 2 === 0;
        g.fillStyle = even ? '#cfc6b4' : '#bfb6a1';
        g.fillRect(x * T, y * T, T, T);
        for (let i = 0; i < 40; i++) {
          g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)';
          g.fillRect(x * T + Math.random() * T, y * T + Math.random() * T, 2, 2);
        }
        g.strokeStyle = 'rgba(90,80,60,0.55)';
        g.lineWidth = 2;
        g.strokeRect(x * T + 1, y * T + 1, T - 2, T - 2);
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 10);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  _buildGround() {
    // фон — skybox.jpg (коридор школы) на весь экран, 3D-коридоры убраны
    this.scene.fog = new THREE.Fog(0xdfe9f5, 30, 115);

    const floorGeo = new THREE.PlaneGeometry(9, 30);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.85,
      map: this._floorTex
    });

    for (let i = 0; i < 10; i++) {
      const z = -i * 30;
      const mesh = new THREE.Mesh(floorGeo, floorMat.clone());
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(0, 0, z + 5);
      this.world.add(mesh);
      this.floors.push(mesh);

      for (let l = 0; l < 2; l++) {
        const lineGeo = new THREE.PlaneGeometry(0.12, 30);
        const lineMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x444444 });
        const line = new THREE.Mesh(lineGeo, lineMat);
        line.rotation.x = -Math.PI/2;
        line.position.set(-1.3 + l*2.6, 0.015, z+5);
        this.world.add(line);
      }

      // нижний ярус (подуровень «люк»): тёмный пол, виден только в туннеле
      const lowGeo = new THREE.PlaneGeometry(9, 30);
      const lowMat = new THREE.MeshStandardMaterial({ color: 0x2f3542, roughness: 0.95 });
      const low = new THREE.Mesh(lowGeo, lowMat);
      low.rotation.x = -Math.PI / 2;
      low.position.set(0, -3.4, z + 5);
      low.visible = false;
      this.world.add(low);
      this.lowFloors.push(low);
    }
  }

  _gap() {
    // зазор между сегментами сужается со временем — плотность растёт
    const k = Math.max(0.6, 1 - this.elapsed / 240);
    return (this.gapMin + Math.random() * (this.gapMax - this.gapMin)) * k;
  }

  _doubleP() {
    return Math.min(0.55, this.doubleChance + this.elapsed / 300);
  }

  _spawnInitial() {
    let z = -18;
    for (let i = 0; i < 50; i++) {
      this._spawnSegment(z);
      z -= this._gap();
    }
  }

  _spawnSegment(z) {
    const r = Math.random();
    // монетные паттерны как в Subway Surfers: редко, но красиво и собираемо.
    // Частота падает со временем — иначе из-за сужающихся зазоров
    // сигарет в минуту становилось бы больше. Количество константа.
    const patternP = this.coinPatternP * Math.max(0.55, 1 - this.elapsed / 300);
    if (r < patternP) {
      this._spawnCoinPattern(z);
      return;
    }
    if (r < 0.62) {
      const lane = Math.floor(Math.random()*3);
      const typeRoll = Math.random();
      let type = 'desk';
      if (typeRoll < 0.32) type = 'desk';
      else if (typeRoll < 0.58) type = 'locker';
      else if (typeRoll < 0.78) type = 'books';
      else if (typeRoll < 0.9) type = 'trash';
      else type = 'barrier';
      this._createObstacle(this.LANES[lane], z, type, lane);
      // арка монет над низким препятствием — прыгай сквозь неё
      const kind = this.obstacles[this.obstacles.length - 1].userData.kind;
      const arcP = this.arcP * Math.max(0.6, 1 - this.elapsed / 300);
      if ((kind === 'low') && Math.random() < arcP) {
        this._spawnArc(z, lane);
      } else if (Math.random() < 0.30) {
        // короткая линия на свободной дорожке
        const free = [0, 1, 2].filter(l => l !== lane);
        const fl = free[Math.floor(Math.random() * free.length)];
        for (let k = 0; k < 3; k++) this._createCoin(this.LANES[fl], z - k * 1.4, 'cig');
      }
    } else if (r < 0.62 + this._doubleP()) {
      const freeLane = Math.floor(Math.random()*3);
      for (let l = 0; l < 3; l++) if (l !== freeLane) {
        const type = Math.random() < 0.6 ? 'desk' : 'locker';
        this._createObstacle(this.LANES[l], z, type, l);
      }
      if (Math.random() < 0.6) {
        for (let k = 0; k < 4; k++) this._createCoin(this.LANES[freeLane], z - k * 1.4, 'cig');
      }
    }
  }

  // линия прямо по дорожке
  _spawnLine(z, lane, n = 6, y = 1.0) {
    for (let k = 0; k < n; k++) this._createCoin(this.LANES[lane], z - k * 1.4, 'cig', y);
  }

  // арка над препятствием: 5 монет параболой, пик ~2.4 — берётся в прыжке
  _spawnArc(z, lane) {
    for (let k = 0; k < 5; k++) {
      const y = 1.0 + Math.sin((k / 4) * Math.PI) * 1.4;
      this._createCoin(this.LANES[lane], z - 2.1 + k * 1.05, 'cig', y);
    }
  }

  // змейка по дорожкам
  _spawnZigzag(z) {
    const start = Math.floor(Math.random() * 3);
    const dir = Math.random() < 0.5 ? 1 : -1;
    let lane = start;
    for (let k = 0; k < 6; k++) {
      this._createCoin(this.LANES[lane], z - k * 1.5, 'cig');
      lane += dir;
      if (lane > 2) { lane = 1; }
      if (lane < 0) { lane = 1; }
    }
  }

  // высокая линия — только в прыжке
  _spawnHighLine(z, lane) {
    this._spawnLine(z, lane, 4, 2.3);
  }

  _spawnCoinPattern(z) {
    const lane = Math.floor(Math.random() * 3);
    const roll = Math.random();
    if (roll < 0.4) this._spawnLine(z, lane, 5 + Math.floor(Math.random() * 3));
    else if (roll < 0.65) this._spawnZigzag(z);
    else if (roll < 0.85) this._spawnHighLine(z, lane);
    else this._spawnArc(z, lane); // арка без препятствия — просто красивая
  }

  _createObstacle(x, z, type, lane) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.userData = { type, lane, x, passed:false };

    const shGeo = new THREE.CircleGeometry(0.7, 12);
    const shMat = new THREE.MeshBasicMaterial({ color:0x000000, transparent:true, opacity:0.28 });
    const sh = new THREE.Mesh(shGeo, shMat);
    sh.rotation.x = -Math.PI/2;
    sh.position.y = 0.02;
    group.add(sh);

    // сама модель — из общей фабрики (ею же пользуется галерея EXTRAS)
    const built = buildObstacle(type);
    group.add(built.group);
    group.userData.h = built.h;
    group.userData.kind = built.kind;
    group.userData.yRange = built.yRange;

    this.world.add(group);
    this.obstacles.push(group);
  }

  _createCoin(x, z, type, yOverride) {
    const size = type === 'vodka' ? 0.95 : 0.62;
    const tex = type === 'vodka' ? this.am.textures.coin2 : this.am.textures.coin1;
    let mesh;
    if (tex) {
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent:true, side:THREE.DoubleSide, depthWrite:false });
      const geo = new THREE.PlaneGeometry(size*1.6, size*1.6);
      mesh = new THREE.Mesh(geo, mat);
    } else {
      const mat = new THREE.MeshStandardMaterial({ color: type==='vodka'?0x70a1ff:0xf1c40f, emissive: type==='vodka'?0x1e90ff:0xffa502, emissiveIntensity:0.5 });
      mesh = new THREE.Mesh(new THREE.SphereGeometry(0.35,12,12), mat);
    }
    mesh.position.set(x, yOverride !== undefined ? yOverride : 1.0 + (type==='vodka'?0.25:0), z);
    mesh.userData = { type, collected:false, baseY: mesh.position.y, baseX: x, phase: Math.random()*Math.PI*2, size };
    const sGeo = new THREE.CircleGeometry(0.28,10);
    const sMat = new THREE.MeshBasicMaterial({color:0x000000, transparent:true, opacity:0.22});
    const sh = new THREE.Mesh(sGeo, sMat);
    sh.rotation.x = -Math.PI/2;
    sh.position.set(0,-0.98,0);
    mesh.add(sh);
    if (type==='vodka') {
      const glowGeo = new THREE.RingGeometry(0.45,0.65,16);
      const glowMat = new THREE.MeshBasicMaterial({ color:0x00d2ff, transparent:true, opacity:0.35, side:THREE.DoubleSide });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.rotation.x = -Math.PI/2;
      glow.position.y = -0.9;
      mesh.add(glow);
      mesh.userData.glow = glow;
    }
    this.world.add(mesh);
    this.coinMeshes.push(mesh);
    return mesh;
  }

  // подуровни: 'tunnel' — люк вниз, 'jet' — джетпак вверх
  _createPickup(x, z, kind) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.userData = { isPickup: true, kind, collected: false, phase: Math.random()*Math.PI*2, baseY: 0 };
    // сама модель — из общей фабрики (ею же пользуется галерея EXTRAS)
    const built = buildPickup(kind);
    group.add(built.group);
    if (built.ring) group.userData.ring = built.ring;
    if (built.spinMesh) group.userData.spinMesh = built.spinMesh;
    this.world.add(group);
    this.pickups.push(group);
    return group;
  }

  _frontZ(list) {
    let m = 0;
    for (const o of list) m = Math.min(m, o.position.z);
    return m;
  }

  // есть ли несобранная бутылка неподалёку впереди (чтобы не спамить mercy)
  _vodkaNear(player) {
    const pz = player.group.position.z;
    for (const c of this.coinMeshes) {
      if (c.userData.collected || c.userData.type !== 'vodka') continue;
      const dz = c.position.z - pz;
      if (dz < 2 && dz > -30) return true;
    }
    return false;
  }

  _spawnBullet(lane, fromZ, speed = null) {
    const geo = new THREE.SphereGeometry(0.16, 10, 10);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffdd33 });
    const b = new THREE.Mesh(geo, mat);
    const glowGeo = new THREE.SphereGeometry(0.30, 10, 10);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.45 });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    b.add(glow);
    b.position.set(this.LANES[lane], 1.35, fromZ);
    b.userData = { lane, hit: false, dodged: false, life: 4, speed };
    this.scene.add(b);
    this.bullets.push(b);
  }

  // бонусные монеты на высоте подуровня
  _spawnBonusCoins(mode, lane) {
    if (mode === 'tunnel') {
      for (let k = 0; k < 5; k++) {
        const c = this._createCoin(this.LANES[lane], -8 - k * 2.2, 'cig');
        c.position.y = -2.2;
        c.userData.baseY = -2.2;
      }
    } else {
      for (let k = 0; k < 6; k++) {
        const ct = 'cig'; // бутылка — только mercy-спавн перед поимкой
        const l = this.LANES[(lane + (k % 2)) % 3];
        const c = this._createCoin(l, -8 - k * 2.4, ct);
        c.position.y = 4.2 + Math.sin(k * 0.9) * 1.6;
        c.userData.baseY = c.position.y;
      }
    }
  }

  update(delta, camera, player = null, guard = null) {
    // на дуэли мир замирает: Максоген стоит, решает QTE
    const frozen = !!(player && this.duel.active);
    const move = frozen ? 0 : this.speed * delta;
    this.distance += move;
    if (!frozen) this.elapsed += delta;

    this.obstacles.forEach(o => o.position.z += move);
    this.coinMeshes.forEach(c => c.position.z += move);
    this.pickups.forEach(p => {
      p.position.z += move;
      if (p.userData.ring) p.userData.ring.rotation.z += delta * 1.5;
      if (p.userData.spinMesh) p.userData.spinMesh.rotation.y += delta * 2.5; // ствол крутится
    });
    for (let f of this.floors) {
      f.position.z += move;
      if (f.position.z > 22) f.position.z -= 300;
    }
    const inTunnel = player && player.mode === 'tunnel';
    for (let f of this.lowFloors) {
      f.visible = !!inTunnel;
      if (f.visible) {
        f.position.z += move;
        if (f.position.z > 22) f.position.z -= 300;
      }
    }
    for (let child of this.world.children) {
      if (this.floors.includes(child) || this.lowFloors.includes(child)) continue;
      if (this.obstacles.includes(child) || this.coinMeshes.includes(child) || this.pickups.includes(child)) continue;
      child.position.z += move;
      if (child.position.z > 22) child.position.z -= 300;
    }

    if (this.multiplierTimer > 0) {
      this.multiplierTimer -= delta;
      if (this.multiplierTimer <= 0) this.multiplier = 1;
    }

    // скорость и сложность растут со временем (0 → 1 за 3 минуты)
    const rampK = 1 + Math.min(1.0, this.elapsed / 120);
    this.diffT = Math.min(1, this.elapsed / 180);
    this.speed = Math.min(this.maxSpeed, this.baseSpeed + this.distance * 0.012 * rampK + this.elapsed * 0.05);
    // Гендос со временем злее
    if (guard) guard.chaseBonus = Math.min(0.3, this.elapsed * 0.002);
    // окна дуэли со временем уже
    this.duel.timeScale = Math.max(0.65, 1 - 0.35 * this.diffT);

    const time = Date.now() * 0.001;
    for (let c of this.coinMeshes) {
      if (c.userData.collected) continue;
      c.position.y = c.userData.baseY + Math.sin(time*2 + c.userData.phase)*0.18;
      if (c.material && c.material.map) c.lookAt(camera.position);
      if (c.userData.glow) {
        c.userData.glow.material.opacity = 0.25 + Math.sin(time*3 + c.userData.phase)*0.12;
        c.userData.glow.rotation.z += delta*1.2;
      }
      if (!c.material.map) c.rotation.y += delta*2;
    }

    const recycleZ = 8;
    for (let o of this.obstacles) {
      if (o.position.z > recycleZ && !frozen) {
        const lane = Math.floor(Math.random()*3);
        o.position.x = this.LANES[lane];
        o.userData.lane = lane;
        o.position.z = this._frontZ(this.obstacles) - this._gap();
      }
    }
    const retypeCoin = (c, z) => {
      const lane = Math.floor(Math.random()*3);
      const type = 'cig'; // бутылка — только mercy-спавн перед поимкой
      const tex = type==='vodka' ? this.am.textures.coin2 : this.am.textures.coin1;
      if (tex && c.material) {
        c.material.map = tex;
        c.material.needsUpdate = true;
        const sz = type==='vodka' ? 0.95 : 0.62;
        c.geometry.dispose();
        c.geometry = new THREE.PlaneGeometry(sz*1.6, sz*1.6);
        c.userData.baseY = 1.0 + (type==='vodka'?0.25:0);
        c.userData.type = type;
        if (type==='vodka' && !c.userData.glow) {
          const glowGeo = new THREE.RingGeometry(0.45,0.65,16);
          const glowMat = new THREE.MeshBasicMaterial({ color:0x00d2ff, transparent:true, opacity:0.35, side:THREE.DoubleSide });
          const glow = new THREE.Mesh(glowGeo, glowMat);
          glow.rotation.x = -Math.PI/2;
          glow.position.y = -0.9;
          c.add(glow);
          c.userData.glow = glow;
        } else if (type!=='vodka' && c.userData.glow) {
          c.remove(c.userData.glow);
          c.userData.glow = null;
        }
      }
      c.position.set(this.LANES[lane], c.userData.baseY || 1.0, z);
      c.userData.baseX = this.LANES[lane];
      c.userData.collected = false;
      c.visible = true;
      c.scale.set(1,1,1);
    };
    for (let c of this.coinMeshes) {
      if (c.position.z > recycleZ && !frozen) retypeCoin(c, this._frontZ(this.coinMeshes) - Math.random()*3);
    }
    for (let p of this.pickups) {
      if (p.position.z > recycleZ && !frozen && !p.userData.collected) {
        p.position.z = this._frontZ(this.obstacles) - 4;
        p.position.x = this.LANES[Math.floor(Math.random()*3)];
      } else if (p.position.z > recycleZ && !frozen && p.userData.collected) {
        p.userData.collected = false;
        p.visible = true;
        p.position.z = this._frontZ(this.obstacles) - 4;
        p.position.x = this.LANES[Math.floor(Math.random()*3)];
      }
    }

    this.score += move * 1.8 * this.multiplier;

    // принудительный спавн подуровней по таймеру (чередуем люк/джетпак) — редко
    if (player && player.mode === 'run' && !player.inDuel && player.spin <= 0 && !frozen) {
      this.pickupTimer -= delta;
      if (this.pickupTimer <= 0) {
        const lane = Math.floor(Math.random()*3);
        this._createPickup(this.LANES[lane], this._frontZ(this.obstacles) - 6, this.pickupNext);
        this.pickupNext = this.pickupNext === 'tunnel' ? 'jet' : 'tunnel';
        this.pickupTimer = 80 + Math.random()*30;
      }
      // ствол для перестрелки: сразу на все 3 полосы — не скипнуть
      this.gunTimer -= delta;
      if (this.gunTimer <= 0) {
        const z = this._frontZ(this.obstacles) - 6;
        for (let l = 0; l < 3; l++) this._createPickup(this.LANES[l], z, 'gun');
        this.gunTimer = 34 + Math.random()*14;
      }
      // mercy-бутылка: одна, поштучно, только когда шкала Гендоса почти на нуле
      this.mercyT -= delta;
      const dying = guard && guard.distance < this.mercyDist;
      if (dying && this.mercyT <= 0 && !this._vodkaNear(player)) {
        this._createCoin(this.LANES[player.lane], player.group.position.z - 14, 'vodka');
        this.mercyT = 20;
        this.eventText = '🆘 ПОСЛЕДНИЙ ШАНС! Хватай бутылку!';
        this.eventTextTimer = 2.2;
      }
    }

    const dueling = player && (player.inDuel || player.spin > 0 || this.duel.active);
    const carBusy = this.car.active || this.carWarn > 0;

    // ивент «Гендос стреляет»: предупреждение -> выстрел в дорожку Максогена
    // на паузе во время дуэли и заезда форда
    if (player && guard && player.mode === 'run' && !dueling && !carBusy) {
      if (this.warnTimer > 0) {
        this.warnTimer -= delta;
        guard.forceRagePose(2, 0.25);
        this.eventText = `⚠ ГЕНДОС ЦЕЛИТСЯ В ${['ЛЕВУЮ','СРЕДНЮЮ','ПРАВУЮ'][this.warnLane]} ДОРОЖКУ! УХОДИ ИЛИ ПРИГНИСЬ!`;
        if (this.warnTimer <= 0) {
          this._spawnBullet(this.warnLane, guard.group.position.z - 0.6);
          sfx.shot();
          this.eventText = '💥 ВЫСТРЕЛ! УВОРАЧИВАЙСЯ!';
          this.eventTextTimer = 0.9;
          const k = Math.max(0.55, 1 - this.elapsed / 200);
          this.shootTimer = (this.shootMin + Math.random() * (this.shootMax - this.shootMin)) * k;
        }
      } else {
        this.shootTimer -= delta;
        if (this.shootTimer <= 0) {
          this.warnLane = player.lane;
          // со временем на реакцию всё меньше
          this.warnTimer = this.warnTime * (1 - 0.35 * this.diffT);
          guard.forceRagePose(2, this.warnTimer + 0.3);
        }
      }
    }

    // ивент «Игнатьевич на форде»: предупреждение -> заезд -> самонаведение
    if (player && guard && player.mode === 'run' && !dueling && !frozen) {
      if (this.carWarn > 0) {
        this.carWarn -= delta;
        this.eventText = `🚗 ИГНАТЬЕВИЧ НА КРАСНОМ ФОРДЕ! УХОДИ С ${['ЛЕВОЙ','СРЕДНЕЙ','ПРАВОЙ'][this.carLane]} ДОРОЖКИ!`;
        if (this.carWarn <= 0) {
          this.car.spawn(this.LANES[this.carLane], -60);
          this.carHomed = false;
          this.carT = 0;
          sfx.horn();
          this.eventText = '🚗 ФОРД НЕСЁТСЯ! БЕГИ С ДОРОЖКИ!';
          this.eventTextTimer = 1.2;
        }
      } else if (!this.car.active) {
        this.carTimer -= delta;
        if (this.carTimer <= 0) {
          this.carLane = player.lane; // целится в Максогена
          this.carWarn = 1.4 * (1 - 0.3 * this.diffT); // со временем меньше времени на реакцию
          sfx.horn();
          const k = Math.max(0.6, 1 - this.elapsed / 240);
          this.carTimer = (this.carMin + Math.random() * (this.carMax - this.carMin)) * k;
        }
      }
    }
    // форд ускоряется и подруливает за Максогеном на середине пути
    if (this.car.active && !frozen) {
      this.carT += delta;
      const extra = 12 + Math.min(10, this.carT * 4) + this.diffT * 6;
      this.car.update(delta, this.speed + extra);
      // лёгкое виляние + самонаведение один раз
      const laneX = this.LANES[this.carLane];
      this.car.group.position.x = laneX + Math.sin(this.elapsed * 3) * 0.25;
      if (!this.carHomed && this.car.z > -30) {
        this.carHomed = true;
        this.carLane = player.lane;
        sfx.horn();
        this.eventText = `🚗 ИГНАТЬЕВИЧ ПОДРУЛИВАЕТ НА ${['ЛЕВУЮ','СРЕДНЮЮ','ПРАВУЮ'][this.carLane]}!`;
        this.eventTextTimer = 1.2;
      }
      if (this.car.z > 14) {
        this.car.despawn();
        this.score += 25 * this.multiplier;
        this.eventText = '💨 Пронесло! Игнатьевич промазал! +25';
        this.eventTextTimer = 1.4;
      }
    }

    // дуэль: старт из стойки Максогена, дальше рулит QTE
    if (player && guard && player.inDuel && !this.duel.active) {
      this.duel.start();
      guard.forceRagePose(2, 60);
      sfx.shot();
      this.eventText = '🔫 ДУЭЛЬ С ГЕНДОСОМ! Жми показанную кнопку!';
      this.eventTextTimer = 1.6;
    }
    if (this.duel.active && player && guard) {
      guard.forceRagePose(2, 0.5); // Гендос с пистолетом
      const r = this.duel.update(delta);
      if (this.duel.transition <= 0 && this.duel.prompt) {
        this.eventText = `🔫 ДУЭЛЬ ${this.duel.round}/${DUEL_ROUNDS} — ЖМИ ${this.duel.arrow}!`;
      }
      if (r === 'timeout') {
        // не успел — Гендос стреляет первым, ран кончается
        this._duelLose(player, guard);
      }
    }
    if (this.eventTextTimer > 0) {
      this.eventTextTimer -= delta;
      if (this.eventTextTimer <= 0 && this.warnTimer <= 0) this.eventText = '';
    }

    // на дуэли пули висят в воздухе
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      if (frozen) break;
      const b = this.bullets[i];
      const bspeed = (b.userData.speed || (30 + this.speed * 0.4)) * (1 + 0.3 * this.diffT);
      b.position.z -= bspeed * delta;
      b.userData.life -= delta;
      b.rotation.x += delta * 12;
      if (player && !b.userData.hit && !b.userData.dodged && b.position.z < player.group.position.z - 2.5) {
        b.userData.dodged = true;
        this.dodges += 1;
        this.score += 25 * this.multiplier;
        this.eventText = '😎 УВОРОТ ОТ ПУЛИ! +25';
        this.eventTextTimer = 1.1;
      }
      if (b.position.z < -70 || b.userData.life <= 0) {
        this.scene.remove(b);
        this.bullets.splice(i, 1);
      }
    }

  }

  // QTE-попадание: вызывается из main при верной кнопке
  _duelHit(player, guard) {
    if (!this.duel.active) return;
    const pp = player.group.position;
    this.duel.onPlayerShoot(pp.x, pp.y + 0.8, pp.z + 0.8);
    sfx.shot();
    guard.onDuelHit();
    this.score += 50 * this.multiplier;
    if (this.duel.round >= DUEL_ROUNDS) {
      // дуэль выиграна: Гендос отброшен вдаль
      this.duel.active = false;
      player.cancelDuel();
      guard.distance = guard.FAR;
      guard.anger = 0;
      player.invuln = Math.max(player.invuln, 1.0); // передышка на возврат
      this.score += 150 * this.multiplier;
      this.eventText = '🏆 ДУЭЛЬ ВЫИГРАНА! +150';
      this.eventTextTimer = 2.2;
      sfx.win();
    } else {
      this.duel.nextRound();
    }
  }

  // QTE-промах/таймаут: Гендос стреляет первым — ран кончается (см. main)
  _duelLose(player, guard) {
    if (!this.duel.active) return;
    const gp = guard.group.position;
    this.duel.onGuardShoot(gp.x, gp.y + 0.4, gp.z - 0.8);
    sfx.shot();
    this.duel.active = false;
    player.cancelDuel();
    this.duelLost = true;
  }

  checkBullets(player) {
    if (player.mode !== 'run') return null; // на подуровнях пули не достают
    if (this.duel.active) return null; // на дуэли мир замер
    const pp = player.group.position;
    for (const b of this.bullets) {
      if (b.userData.hit || b.userData.dodged) continue;
      if (Math.abs(b.position.z - pp.z) > 0.9) continue;
      if (Math.abs(b.position.x - pp.x) > 1.0) continue;
      if (player.isSliding) continue;
      b.userData.hit = true;
      b.visible = false;
      return b;
    }
    return null;
  }

  checkCollisions(player) {
    // на дуэли мир замер — коллизий нет
    if (this.duel.active) return { hit: null, coinCollected: null, pickupTaken: null, carKill: null };
    const pBox = player.getCollider();
    const playerPos = player.group.position;

    // магнит отключён: монеты подбираются только при касании
    let hit = null;

    for (let o of this.obstacles) {
      if (Math.abs(o.position.z - playerPos.z) > 1.15) continue;
      if (Math.abs(o.position.x - pBox.x) > 1.38) continue;
      // вертикальное разделение подуровней: туннель внизу, полёт вверху
      const yr = o.userData.yRange || [0, 2.4];
      if (pBox.yTop < yr[0] + 0.05 || pBox.yBottom > yr[1] - 0.05) continue;
      const kind = o.userData.kind;
      if (kind === 'low' && player.isJumping && player.y > 0.65) continue;
      if (kind === 'high' && player.isSliding) continue;
      const ox = o.position.x, oz = o.position.z;
      const dx = Math.abs(ox - pBox.x);
      const dz = Math.abs(oz - playerPos.z);
      if (dx < 0.95 && dz < 0.85) {
        hit = o;
        break;
      }
    }

    let coinCollected = null;
    for (let c of this.coinMeshes) {
      if (c.userData.collected) continue;
      const dx = c.position.x - playerPos.x;
      const dz = c.position.z - playerPos.z;
      const dy = c.position.y - playerPos.y;
      const dist = Math.sqrt(dx*dx + dz*dz + dy*dy*0.5);
      if (dist < 1.6) {
        c.userData.collected = true;
        c.visible = false;
        c.position.z = 9999;
        if (c.userData.type === 'cig') {
          this.score += 10 * this.multiplier;
          this.coins += 1;
          coinCollected = { type:'cig', mesh:c };
        } else {
          this.score += 50 * this.multiplier;
          this.vodka += 1;
          coinCollected = { type:'vodka', mesh:c };
          this.multiplier = 2;
          this.multiplierTimer = 5.0;
        }
      }
    }

    let pickupTaken = null;
    const busyDuel = player.spin > 0 || player.inDuel || this.duel.active;
    for (let p of this.pickups) {
      if (p.userData.collected) continue;
      const dx = p.position.x - playerPos.x;
      const dz = p.position.z - playerPos.z;
      if (Math.abs(dx) < 1.3 && Math.abs(dz) < 1.4 && player.mode === 'run' && !busyDuel) {
        p.userData.collected = true;
        p.visible = false;
        p.position.z = 9999;
        const kind = p.userData.kind;
        if (kind === 'tunnel') {
          player.enterTunnel();
          this._spawnBonusCoins('tunnel', player.lane);
          this.eventText = '🕳 ЛЮК ВНИЗ! Максоген ушёл в туннель — тут безопасно!';
          this.eventTextTimer = 2.2;
          sfx.pickup();
        } else if (kind === 'jet') {
          player.enterFly();
          this._spawnBonusCoins('fly', player.lane);
          this.eventText = '🚀 ДЖЕТПАК! Максоген взмыл вверх за монетами!';
          this.eventTextTimer = 2.2;
          sfx.pickup();
        } else if (kind === 'gun') {
          if (player.startDuel()) {
            this.duelLost = false;
            // остальные стволы с дорожек убираем — дуэль уже началась
            for (let i = this.pickups.length - 1; i >= 0; i--) {
              const q = this.pickups[i];
              if (q !== p && q.userData.kind === 'gun' && !q.userData.collected) {
                this.world.remove(q);
                this.pickups.splice(i, 1);
              }
            }
            this.eventText = '🔫 СТВОЛ! Максоген разворачивается на 360!';
            this.eventTextTimer = 1.6;
            sfx.pickup();
          } else {
            p.userData.collected = false;
            p.visible = true;
            continue;
          }
        }
        pickupTaken = { kind: kind };
      }
    }

    // форд Игнатьевича: задел — ран сразу кончается (это же машина)
    let carKill = null;
    if (this.car.active) {
      const dx = Math.abs(this.car.x - pBox.x);
      const dz = Math.abs(this.car.z - playerPos.z);
      if (dx < 1.5 && dz < 1.9) {
        this.car.despawn();
        sfx.crash();
        carKill = { survived: false };
      }
    }

    return { hit, coinCollected, pickupTaken, carKill };
  }

  reset() {
    this.score = 0;
    this.coins = 0;
    this.vodka = 0;
    this.dodges = 0;
    this.distance = 0;
    this.elapsed = 0;
    this.speed = this.baseSpeed;
    this.multiplier = 1;
    this.multiplierTimer = 0;
    this.shootTimer = 9;
    this.warnTimer = 0;
    this.eventText = '';
    this.eventTextTimer = 0;
    this.pickupTimer = 45;
    this.pickupNext = 'tunnel';
    this.gunTimer = 32;
    this.mercyT = 0;
    this.carTimer = 24;
    this.carWarn = 0;
    this.carHomed = false;
    this.carT = 0;
    this.car.despawn();
    this.duel.reset();
    this.duelLost = false;
    for (const b of this.bullets) this.scene.remove(b);
    this.bullets = [];
    for (const p of this.pickups) this.world.remove(p);
    this.pickups = [];
    let z = -18;
    for (let o of this.obstacles) {
      const lane = Math.floor(Math.random()*3);
      o.position.set(this.LANES[lane], 0, z);
      o.userData.lane = lane;
      z -= this._gap();
    }
    // ВАЖНО: у монет свой курсор z с начала трассы, а не продолжение после препятствий
    let zc = -18;
    for (let c of this.coinMeshes) {
      const lane = Math.floor(Math.random()*3);
      const type = 'cig'; // бутылка — только mercy-спавн перед поимкой
      const tex = this.am.textures.coin1;
      if (tex && c.material) {
        c.material.map = tex;
        c.material.needsUpdate = true;
      }
      if (c.userData.glow) { c.remove(c.userData.glow); c.userData.glow = null; }
      const sz = 0.62;
      c.geometry.dispose();
      c.geometry = new THREE.PlaneGeometry(sz*1.6, sz*1.6);
      c.userData.baseY = 1.0;
      c.userData.type = type;
      c.userData.collected = false;
      c.visible = true;
      c.position.set(this.LANES[lane], 1.0 + (type==='vodka'?0.25:0), zc - Math.random()*4);
      c.userData.baseY = c.position.y;
      c.userData.baseX = this.LANES[lane];
      zc -= 3 + Math.random()*3;
    }
  }
}
