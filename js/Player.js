import * as THREE from 'three';

export class Player {
  constructor(scene, assetManager) {
    this.scene = scene;
    this.am = assetManager;

    this.LANES = [-2.6, 0, 2.6];
    this.lane = 1;
    this.targetX = this.LANES[this.lane];
    this.currentX = this.targetX;
    this.z = 0;
    this.y = 0; // base height offset from floor
    this.baseY = 1.1;

    // group at player position
    this.group = new THREE.Group();
    this.group.position.set(this.currentX, this.baseY, this.z);
    scene.add(this.group);

    // Sprite for boy
    const tex = this.am.getPerson(0);
    this.spriteMat = new THREE.SpriteMaterial({
      map: tex || null,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      fog: true
    });
    this.sprite = new THREE.Sprite(this.spriteMat);
    this.sprite.scale.set(2.0, 2.4, 1);
    this.sprite.position.set(0, 0.15, 0);
    this.group.add(this.sprite);

    // alternative billboard plane when sprite not ideal (fallback mesh)
    // keep sprite only

    // Shadow
    const shadowGeo = new THREE.CircleGeometry(0.55, 16);
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 });
    this.shadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.set(0, -this.baseY + 0.02, 0);
    this.group.add(this.shadow);

    // physics
    this.vy = 0;
    this.isJumping = false;
    this.isSliding = false;
    this.slideTimer = 0;
    this.slideDuration = 0.65;
    this.gravity = -28;
    this.jumpSpeed = 10.5;

    // stress: 0 спокойный (person1) ... 3 паника (person4)
    // чем ближе Гендос — тем выше версия спрайта
    this.stress = 0; // 0..1
    this.stressLevel = 0; // 0..3 -> person1..person4
    this.stressBoost = 0; // временный spike после удара
    this.runPhase = 0; // фаза бега для bob-а (лицо не меняется, только тело)

    // подуровни как в Subway Surfers: 'run' | 'tunnel' (люк вниз) | 'fly' (джетпак вверх)
    this.mode = 'run';
    this.modeTimer = 0;
    this.MODE_Y = { run: 0, tunnel: -3.2, fly: 5.0 };
    this.MODE_TIME = 6.0;
    this.yOff = 0; // сглаженное смещение подуровня

    // перестрелка с Гендосом: spin — разворот на 360, inDuel — стойка дуэли
    // (раундами рулит js/Duel.js, Level дёргает player.inDuel)
    this.spin = 0;
    this.spinAngle = 0;
    this.duel = 0;
    this.mirrored = false; // спрайт зеркалится — Максоген развернулся к Гендосу
    this.inDuel = false;

    // invulnerability after hit
    this.invuln = 0;

    // здоровье: 5 ударов — проигрыш
    this.maxHp = 5;
    this.hp = this.maxHp;

    // visual lean
    this.lean = 0;
  }

  move(dir) {
    const newLane = THREE.MathUtils.clamp(this.lane + dir, 0, 2);
    if (newLane === this.lane) return;
    this.lane = newLane;
    this.targetX = this.LANES[this.lane];
  }

  jump() {
    if (this.mode !== 'run') return;
    if (this.isJumping || this.isSliding) return;
    this.isJumping = true;
    this.vy = this.jumpSpeed;
  }

  slide() {
    if (this.mode !== 'run') return;
    if (this.isJumping || this.isSliding) return;
    this.isSliding = true;
    this.slideTimer = this.slideDuration;
    // visual: squash sprite (с учётом зеркала дуэли)
    this.sprite.scale.set(this._baseScaleX(), 1.25, 1);
    this.sprite.position.y = -0.45;
  }

  _baseScaleX() { return this.mirrored ? -2.0 : 2.0; }

  // подобрать ствол: разворот на 360 с неуязвимостью, затем стойка дуэли
  // (раунды ведёт Duel: Level выставляет inDuel и гасит через cancelDuel)
  startDuel() {
    if (this.mode !== 'run' || this.inDuel || this.spin > 0) return false;
    this.spin = 0.8;
    this.spinAngle = 0;
    this.invuln = Math.max(this.invuln, 1.0);
    return true;
  }

  cancelDuel() {
    this.duel = 0;
    this.spin = 0;
    this.mirrored = false;
    this.inDuel = false;
  }

  enterTunnel() {
    this.mode = 'tunnel';
    this.modeTimer = this.MODE_TIME;
    this.isJumping = false; this.isSliding = false;
    this.y = 0; this.vy = 0;
  }

  enterFly() {
    this.mode = 'fly';
    this.modeTimer = this.MODE_TIME;
    this.isJumping = false; this.isSliding = false;
    this.y = 0; this.vy = 0;
  }

  hit() {
    this.invuln = 1.1;
    this.stressBoost = 1.0; // лицо сразу в панику после удара
    this.hp = Math.max(0, this.hp - 1);
  }

  get alive() { return this.hp > 0; }

  // guardDistance: дистанция Гендоса (1.1 поймал ... 8.0 далеко)
  setStressFromGuard(guardDistance) {
    const FAR = 8.0, CAUGHT = 1.1;
    const closeness = THREE.MathUtils.clamp(1 - (guardDistance - CAUGHT) / (FAR - CAUGHT), 0, 1);
    // базовый стресс от близости + временный буст после удара
    this.stress = THREE.MathUtils.clamp(closeness * 0.85 + this.stressBoost * 0.6, 0, 1);
    if (this.stressBoost > 0) this.stressBoost = Math.max(0, this.stressBoost - 0.02);
    const lvl = Math.floor(this.stress * 3.999);
    this.stressLevel = THREE.MathUtils.clamp(lvl, 0, 3);
  }

  update(delta, guardDistance = null) {
    if (guardDistance !== null && guardDistance !== undefined) {
      this.setStressFromGuard(guardDistance);
    }
    // таймер подуровня
    if (this.mode !== 'run') {
      this.modeTimer -= delta;
      if (this.modeTimer <= 0) {
        this.mode = 'run';
        this.invuln = Math.max(this.invuln, 1.2); // мягкая посадка
      }
    }
    this.yOff = THREE.MathUtils.lerp(this.yOff, this.MODE_Y[this.mode], Math.min(1, delta * 3.2));

    // разворот на 360: ровно 2π за 0.8с, затем стойка дуэли
    // (конец дуэли — через cancelDuel из Level)
    if (this.spin > 0) {
      this.spin -= delta;
      this.spinAngle += delta * (Math.PI * 2 / 0.8);
      this.sprite.material.rotation = this.spinAngle;
      if (this.spin <= 0) {
        this.spinAngle = 0;
        this.mirrored = true;
        this.inDuel = true;
      }
    } else {
      this.sprite.material.rotation = this.lean;
    }
    // invuln blink
    if (this.invuln > 0) {
      this.invuln -= delta;
      const blink = Math.floor(this.invuln * 12) % 2 === 0;
      this.sprite.material.opacity = blink ? 0.35 : 1;
    } else {
      this.sprite.material.opacity = 1;
    }

    // lane lerp
    const laneSpeed = 13;
    this.currentX = THREE.MathUtils.lerp(this.currentX, this.targetX, Math.min(1, delta * laneSpeed));
    // lean based on diff
    const diff = this.targetX - this.currentX;
    this.lean = THREE.MathUtils.lerp(this.lean, diff * 0.22, delta * 10);
    // поворот спрайта выставляется ниже: спин 360 / дуэль / обычный наклон
    this.group.position.x = this.currentX;

    // jump physics
    if (this.isJumping) {
      this.vy += this.gravity * delta;
      this.y += this.vy * delta;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.isJumping = false;
      }
    }

    // slide timer
    if (this.isSliding) {
      this.slideTimer -= delta;
      if (this.slideTimer <= 0) {
        this.isSliding = false;
        // restore
        this.sprite.scale.set(2.0, 2.4, 1);
        this.sprite.position.y = 0.15;
      }
    }

    // подскок во время разворота на 360
    const hop = this.spin > 0 ? Math.sin((0.8 - this.spin) / 0.8 * Math.PI) * 0.8 : 0;
    this.group.position.y = this.baseY + this.y + this.yOff + hop;

    // тень: в полёте прячем (земля далеко), в туннеле лежит на нижнем полу
    this.shadow.visible = this.mode !== 'fly';
    // shadow scale based on height
    const h = this.y;
    const scale = THREE.MathUtils.clamp(1 - h * 0.18, 0.55, 1);
    this.shadow.scale.set(scale, scale, 1);
    this.shadow.material.opacity = THREE.MathUtils.clamp(0.35 - h * 0.07, 0.08, 0.35);

    // лицо = версия спрайта по стрессу: person1 спокоен ... person4 паника/проигрыш
    const tex = this.am.getPerson(this.stressLevel);
    if (tex && this.sprite.material.map !== tex) this.sprite.material.map = tex;

    // бег имитируем телом (bob + лёгкое дыхание масштаба), а не сменой лица
    this.runPhase += delta * (6 + this.stress * 6);
    const bob = Math.sin(this.runPhase) * (0.03 + this.stress * 0.02);
    const breathe = 1 + Math.sin(this.runPhase * 0.5) * 0.012;
    if (!this.isSliding) {
      this.sprite.scale.set(this._baseScaleX() * breathe, 2.4 / breathe, 1);
      this.sprite.position.y = 0.15 + bob + (this.isJumping ? 0.1 : 0);
    }
    // паника: тряска спрайта когда стресс высокий
    if (this.stress > 0.6 && !this.isSliding) {
      const shake = (this.stress - 0.6) * 0.35;
      this.sprite.position.x = (Math.random() - 0.5) * shake;
    } else {
      this.sprite.position.x = 0;
    }

    this.sprite.center.set(0.5, 0.45);
  }

  getPosition() {
    return this.group.position.clone();
  }

  getCollider() {
    // returns Box3 style dimensions for collision
    // width 0.9, depth 0.7
    const pos = this.group.position;
    const h = this.isSliding ? 1.0 : 1.9;
    const yTop = pos.y + (this.isSliding ? 0.3 : 0.95);
    const yBottom = pos.y - 1.05;
    return {
      x: pos.x,
      z: pos.z,
      width: 0.85,
      depth: 0.8,
      yBottom,
      yTop,
      lane: this.lane
    };
  }

  reset() {
    this.lane = 1;
    this.targetX = this.LANES[1];
    this.currentX = this.targetX;
    this.y = 0;
    this.vy = 0;
    this.mode = 'run';
    this.modeTimer = 0;
    this.yOff = 0;
    this.spin = 0;
    this.spinAngle = 0;
    this.duel = 0;
    this.mirrored = false;
    this.inDuel = false;
    this.hp = this.maxHp;
    this.sprite.material.rotation = 0;
    this.isJumping = false;
    this.isSliding = false;
    this.slideTimer = 0;
    this.invuln = 0;
    this.stress = 0;
    this.stressLevel = 0;
    this.stressBoost = 0;
    this.runPhase = 0;
    this.sprite.scale.set(2.0, 2.4, 1);
    this.sprite.position.y = 0.15;
    this.group.position.set(this.currentX, this.baseY, 0);
  }
}
