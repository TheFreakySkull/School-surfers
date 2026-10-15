import * as THREE from 'three';

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
    this.coinProb = 0.45;
    this.vodkaProb = 0.12;
    this.coinLineLen = 2;
    this.wavyProb = 0.25;

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

    // подуровни: принудительный спавн pickups по таймеру
    this.pickupTimer = 18;
    this.pickupNext = 'tunnel';

    this._floorTex = this._makeFloorTexture();

    this._buildGround();
    this._spawnInitial();
  }

  applyMode(opts) {
    if (!opts) return;
    for (const k of ['baseSpeed','maxSpeed','gapMin','gapMax','doubleChance',
      'shootMin','shootMax','warnTime','coinProb','vodkaProb','coinLineLen','wavyProb']) {
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
      for (let l = 0; l < 3; l++) if (l !== lane && Math.random() < this.coinProb) {
        const ct = Math.random() < this.vodkaProb ? 'vodka' : 'cig';
        this._createCoin(this.LANES[l], z + (Math.random()-0.5)*1.5, ct);
      }
    } else if (r < 0.62 + this._doubleP()) {
      const freeLane = Math.floor(Math.random()*3);
      for (let l = 0; l < 3; l++) if (l !== freeLane) {
        const type = Math.random() < 0.6 ? 'desk' : 'locker';
        this._createObstacle(this.LANES[l], z, type, l);
      }
      if (Math.random() < 0.9) this._createCoin(this.LANES[freeLane], z, Math.random() < 0.12 ? 'vodka' : 'cig');
    } else {
      const lane = Math.floor(Math.random()*3);
      for (let k = 0; k < this.coinLineLen; k++) {
        const ct = (k === 1 && Math.random() < 0.3) ? 'vodka' : 'cig';
        this._createCoin(this.LANES[lane], z - k*1.4, ct);
      }
      if (Math.random() < this.wavyProb) {
        const lane2 = (lane+1)%3;
        for (let k = 0; k < 2; k++) this._createCoin(this.LANES[lane2], z - k*1.4 - 0.7, 'cig');
      }
    }
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

    if (type === 'desk') {
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.16, 0.9), new THREE.MeshStandardMaterial({color:0x8B5A2B}));
      top.position.y = 0.75;
      group.add(top);
      const legGeo = new THREE.BoxGeometry(0.08, 0.75, 0.08);
      const legMat = new THREE.MeshStandardMaterial({color:0x5a3a1a});
      for (let dx of [-0.85,0.85]) for (let dz of [-0.32,0.32]) {
        const leg = new THREE.Mesh(legGeo, legMat);
        leg.position.set(dx, 0.375, dz);
        group.add(leg);
      }
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.5,0.18,0.35), new THREE.MeshStandardMaterial({color:0xff6b6b}));
      b.position.set(0.2,0.92,0);
      group.add(b);
      group.userData.h = 0.9;
      group.userData.kind = 'low';
      group.userData.yRange = [0, 0.95];
    } else if (type === 'locker') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.4, 0.9), new THREE.MeshStandardMaterial({color:0x2e86de}));
      body.position.y = 1.2;
      group.add(body);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.06,0.28,0.05), new THREE.MeshStandardMaterial({color:0x222222}));
      handle.position.set(0.35,1.2,0.48);
      group.add(handle);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.71,0.08,0.92), new THREE.MeshStandardMaterial({color:0x1a5fb4}));
      stripe.position.y = 1.8;
      group.add(stripe);
      group.userData.h = 2.4;
      group.userData.kind = 'full';
      group.userData.yRange = [0, 2.4];
    } else if (type === 'books') {
      const colors = [0xff4757,0x2ed573,0x1e90ff,0xffa502];
      let y = 0.15;
      for (let i = 0; i < 4; i++) {
        const h = 0.22 + Math.random()*0.1;
        const b = new THREE.Mesh(new THREE.BoxGeometry(1.1, h, 0.75), new THREE.MeshStandardMaterial({color: colors[i%colors.length]}));
        b.position.y = y + h/2;
        b.rotation.y = (Math.random()-0.5)*0.2;
        group.add(b);
        y += h;
      }
      group.userData.h = y;
      group.userData.kind = 'low';
      group.userData.yRange = [0, y + 0.05];
    } else if (type === 'trash') {
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.55,0.6,1.0,14), new THREE.MeshStandardMaterial({color:0x636e72}));
      cyl.position.y = 0.5;
      group.add(cyl);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.55,0.07,8,14), new THREE.MeshStandardMaterial({color:0x2f3542}));
      rim.position.y = 1.0;
      rim.rotation.x = Math.PI/2;
      group.add(rim);
      const paper = new THREE.Mesh(new THREE.BoxGeometry(0.3,0.2,0.18), new THREE.MeshStandardMaterial({color:0xf1f2f6}));
      paper.position.set(0.15,1.05,0);
      paper.rotation.set(0.4,0.6,0.2);
      group.add(paper);
      group.userData.h = 1.0;
      group.userData.kind = 'low';
      group.userData.yRange = [0, 1.05];
    } else if (type === 'barrier') {
      const postGeo = new THREE.BoxGeometry(0.15, 1.9, 0.15);
      const postMat = new THREE.MeshStandardMaterial({color:0xc0392b});
      const p1 = new THREE.Mesh(postGeo, postMat);
      p1.position.set(-0.75, 0.95, 0);
      group.add(p1);
      const p2 = new THREE.Mesh(postGeo, postMat);
      p2.position.set(0.75, 0.95, 0);
      group.add(p2);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.18, 0.18), new THREE.MeshStandardMaterial({color:0xe74c3c}));
      bar.position.set(0, 1.55, 0);
      group.add(bar);
      const bar2 = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.09, 0.09), new THREE.MeshStandardMaterial({color:0xff7979}));
      bar2.position.set(0,1.75,0);
      group.add(bar2);
      const tape = new THREE.Mesh(new THREE.BoxGeometry(1.92,0.06,0.02), new THREE.MeshStandardMaterial({color:0xf1c40f}));
      tape.position.set(0,1.45,0.08);
      group.add(tape);
      group.userData.h = 1.55;
      group.userData.kind = 'high';
      group.userData.yRange = [1.35, 1.95];
    }

    this.world.add(group);
    this.obstacles.push(group);
  }

  _createCoin(x, z, type) {
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
    mesh.position.set(x, 1.0 + (type==='vodka'?0.25:0), z);
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
    group.userData = { isPickup: true, kind, collected: false, phase: Math.random()*Math.PI*2 };
    if (kind === 'tunnel') {
      const grate = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.12, 1.6),
        new THREE.MeshStandardMaterial({ color: 0x2f3542, roughness: 0.9 })
      );
      grate.position.y = 0.06;
      group.add(grate);
      for (let i = -1; i <= 1; i++) {
        const slat = new THREE.Mesh(
          new THREE.BoxGeometry(1.4, 0.04, 0.12),
          new THREE.MeshStandardMaterial({ color: 0x57606f, emissive: 0x00d2ff, emissiveIntensity: 0.5 })
        );
        slat.position.set(0, 0.13, i * 0.45);
        group.add(slat);
      }
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.95, 1.15, 20),
        new THREE.MeshBasicMaterial({ color: 0x00d2ff, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI/2;
      ring.position.y = 0.05;
      group.add(ring);
      group.userData.ring = ring;
      group.userData.baseY = 0;
    } else {
      const pack = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.75, 0.32),
        new THREE.MeshStandardMaterial({ color: 0xe67e22, emissive: 0xd35400, emissiveIntensity: 0.4 })
      );
      pack.position.y = 1.1;
      group.add(pack);
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.24, 0.55, 10),
        new THREE.MeshBasicMaterial({ color: 0xffdd33, transparent: true, opacity: 0.9 })
      );
      flame.position.y = 0.45;
      flame.rotation.x = Math.PI;
      group.add(flame);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.5, 0.68, 18),
        new THREE.MeshBasicMaterial({ color: 0xff9f43, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI/2;
      ring.position.y = 0.06;
      group.add(ring);
      group.userData.ring = ring;
      group.userData.baseY = 0;
    }
    this.world.add(group);
    this.pickups.push(group);
    return group;
  }

  _frontZ(list) {
    let m = 0;
    for (const o of list) m = Math.min(m, o.position.z);
    return m;
  }

  _spawnBullet(lane, fromZ) {
    const geo = new THREE.SphereGeometry(0.16, 10, 10);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffdd33 });
    const b = new THREE.Mesh(geo, mat);
    const glowGeo = new THREE.SphereGeometry(0.30, 10, 10);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.45 });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    b.add(glow);
    b.position.set(this.LANES[lane], 1.35, fromZ);
    b.userData = { lane, hit: false, dodged: false, life: 4 };
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
        const ct = (k === 2 || k === 4) ? 'vodka' : 'cig';
        const l = this.LANES[(lane + (k % 2)) % 3];
        const c = this._createCoin(l, -8 - k * 2.4, ct);
        c.position.y = 4.2 + Math.sin(k * 0.9) * 1.6;
        c.userData.baseY = c.position.y;
      }
    }
  }

  update(delta, camera, player = null, guard = null) {
    const move = this.speed * delta;
    this.distance += move;
    this.elapsed += delta;

    this.obstacles.forEach(o => o.position.z += move);
    this.coinMeshes.forEach(c => c.position.z += move);
    this.pickups.forEach(p => {
      p.position.z += move;
      if (p.userData.ring) p.userData.ring.rotation.z += delta * 1.5;
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

    // скорость и сложность растут со временем
    const rampK = 1 + Math.min(1.0, this.elapsed / 120);
    this.speed = Math.min(this.maxSpeed, this.baseSpeed + this.distance * 0.012 * rampK + this.elapsed * 0.05);

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
      if (o.position.z > recycleZ) {
        const lane = Math.floor(Math.random()*3);
        o.position.x = this.LANES[lane];
        o.userData.lane = lane;
        o.position.z = this._frontZ(this.obstacles) - this._gap();
      }
    }
    const retypeCoin = (c, z) => {
      const lane = Math.floor(Math.random()*3);
      const type = Math.random() < this.vodkaProb ? 'vodka' : 'cig';
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
      if (c.position.z > recycleZ) retypeCoin(c, this._frontZ(this.coinMeshes) - Math.random()*3);
    }
    for (let p of this.pickups) {
      if (p.position.z > recycleZ && !p.userData.collected) {
        p.position.z = this._frontZ(this.obstacles) - 4;
        p.position.x = this.LANES[Math.floor(Math.random()*3)];
      } else if (p.position.z > recycleZ && p.userData.collected) {
        p.userData.collected = false;
        p.visible = true;
        p.position.z = this._frontZ(this.obstacles) - 4;
        p.position.x = this.LANES[Math.floor(Math.random()*3)];
      }
    }

    this.score += move * 1.8 * this.multiplier;

    // принудительный спавн подуровней по таймеру (чередуем люк/джетпак)
    if (player && player.mode === 'run') {
      this.pickupTimer -= delta;
      if (this.pickupTimer <= 0) {
        const lane = Math.floor(Math.random()*3);
        this._createPickup(this.LANES[lane], this._frontZ(this.obstacles) - 6, this.pickupNext);
        this.pickupNext = this.pickupNext === 'tunnel' ? 'jet' : 'tunnel';
        this.pickupTimer = 22 + Math.random()*8;
      }
    }

    // ивент «Гендос стреляет»: предупреждение -> выстрел в дорожку Максогена
    if (player && guard && player.mode === 'run') {
      if (this.warnTimer > 0) {
        this.warnTimer -= delta;
        guard.forceRagePose(2, 0.25);
        this.eventText = `⚠ ГЕНДОС ЦЕЛИТСЯ В ${['ЛЕВУЮ','СРЕДНЮЮ','ПРАВУЮ'][this.warnLane]} ДОРОЖКУ! УХОДИ ИЛИ ПРИГНИСЬ!`;
        if (this.warnTimer <= 0) {
          this._spawnBullet(this.warnLane, guard.group.position.z - 0.6);
          this.eventText = '💥 ВЫСТРЕЛ! УВОРАЧИВАЙСЯ!';
          this.eventTextTimer = 0.9;
          const k = Math.max(0.55, 1 - this.elapsed / 200);
          this.shootTimer = (this.shootMin + Math.random() * (this.shootMax - this.shootMin)) * k;
        }
      } else {
        this.shootTimer -= delta;
        if (this.shootTimer <= 0) {
          this.warnLane = player.lane;
          this.warnTimer = this.warnTime;
          guard.forceRagePose(2, this.warnTime + 0.3);
        }
      }
    }
    if (this.eventTextTimer > 0) {
      this.eventTextTimer -= delta;
      if (this.eventTextTimer <= 0 && this.warnTimer <= 0) this.eventText = '';
    }

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.position.z -= (30 + this.speed * 0.4) * delta;
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

  checkBullets(player) {
    if (player.mode !== 'run') return null; // на подуровнях пули не достают
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
    for (let p of this.pickups) {
      if (p.userData.collected) continue;
      const dx = p.position.x - playerPos.x;
      const dz = p.position.z - playerPos.z;
      if (Math.abs(dx) < 1.3 && Math.abs(dz) < 1.4 && player.mode === 'run') {
        p.userData.collected = true;
        p.visible = false;
        p.position.z = 9999;
        const kind = p.userData.kind;
        if (kind === 'tunnel') {
          player.enterTunnel();
          this._spawnBonusCoins('tunnel', player.lane);
          this.eventText = '🕳 ЛЮК ВНИЗ! Максоген ушёл в туннель — тут безопасно!';
          this.eventTextTimer = 2.2;
        } else {
          player.enterFly();
          this._spawnBonusCoins('fly', player.lane);
          this.eventText = '🚀 ДЖЕТПАК! Максоген взмыл вверх за монетами!';
          this.eventTextTimer = 2.2;
        }
        pickupTaken = { kind: kind };
      }
    }

    return { hit, coinCollected, pickupTaken };
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
    this.pickupTimer = 18;
    this.pickupNext = 'tunnel';
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
      const type = Math.random() < this.vodkaProb ? 'vodka' : 'cig';
      const tex = type==='vodka' ? this.am.textures.coin2 : this.am.textures.coin1;
      if (tex && c.material) c.material.map = tex;
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
