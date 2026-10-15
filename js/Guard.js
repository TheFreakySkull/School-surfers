import * as THREE from 'three';

// ГЕНДОС. Бежит ПОЗАДИ Максогена (между камерой и игроком),
// поэтому визуально находится со стороны камеры (z > z игрока).
// Злость по версиям: guard1 спокойный -> sticker напряжён -> guard2 злой/стреляет.
export class Guard {
  constructor(scene, assetManager) {
    this.scene = scene;
    this.am = assetManager;
    this.LANES = [-2.6, 0, 2.6];

    this.FAR = 8.0;          // Гендос далеко (безопасно)
    this.catchDistance = 1.1; // догнал — поимка
    this.START_DIST = 5.5;
    this.distance = this.START_DIST;
    this.targetLane = 1;
    this.currentX = this.LANES[1];
    this.z = 4;

    this.group = new THREE.Group();
    scene.add(this.group);

    const tex = this.am.getGuard(0);
    this.spriteMat = new THREE.SpriteMaterial({
      map: tex || null,
      transparent: true,
      depthWrite: false,
      fog: true
    });
    this.sprite = new THREE.Sprite(this.spriteMat);
    this.sprite.scale.set(2.15, 2.6, 1);
    this.sprite.position.set(0, 0.2, 0);
    this.group.add(this.sprite);

    const shadowGeo = new THREE.CircleGeometry(0.6, 16);
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.30 });
    this.shadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadow.rotation.x = -Math.PI/2;
    this.shadow.position.y = -1.08;
    this.group.add(this.shadow);

    this.y = 1.1;
    this.rage = 0; // 0 спокойный ... 1 злой
    this.rageLevel = 0; // 0 guard1, 1 sticker, 2 guard2
    this.runPhase = 0;

    // форсированная поза стрельбы (ивент с пулями): держит guard2
    this.forcePose = -1;
    this.forceTimer = 0;

    this.stun = 0;
    this.anger = 0;

    // параметры сложности (переопределяются через applyMode)
    this.chaseBase = 0.28;
    this.chaseAnger = 1.2;
    this.hitPenalty = 1.35;
  }

  applyMode(opts) {
    if (!opts) return;
    if (opts.chaseBase !== undefined) this.chaseBase = opts.chaseBase;
    if (opts.chaseAnger !== undefined) this.chaseAnger = opts.chaseAnger;
    if (opts.hitPenalty !== undefined) this.hitPenalty = opts.hitPenalty;
  }

  update(delta, player, speed) {
    // на подуровнях (люк/джетпак) Гендос ждёт у края — дистанция заморожена
    const frozen = player.mode && player.mode !== 'run';
    if (this.stun > 0) this.stun -= delta;
    else if (!frozen) {
      const chase = this.chaseBase + this.anger * this.chaseAnger;
      this.distance -= chase * delta;
      if (this.anger < 0.1) this.distance += 0.12 * delta;
    }
    this.distance = THREE.MathUtils.clamp(this.distance, this.catchDistance - 0.2, this.FAR);
    this.anger = Math.max(0, this.anger - delta * 0.07);

    // злость = близость + накопленный anger
    const closeness = THREE.MathUtils.clamp(
      1 - (this.distance - this.catchDistance) / (this.FAR - this.catchDistance), 0, 1);
    this.rage = THREE.MathUtils.clamp(Math.max(this.anger, closeness * 1.05), 0, 1);

    // версия спрайта: 0 спокойный (guard1), 1 середина (sticker), 2 злой (guard2)
    if (this.forceTimer > 0) {
      this.forceTimer -= delta;
      this.rageLevel = this.forcePose >= 0 ? this.forcePose : 2;
      if (this.forceTimer <= 0) this.forcePose = -1;
    } else if (this.rage > 0.62) this.rageLevel = 2;
    else if (this.rage > 0.30) this.rageLevel = 1;
    else this.rageLevel = 0;
    const rtex = this.am.getGuard(this.rageLevel);
    if (rtex && this.sprite.material.map !== rtex) this.sprite.material.map = rtex;

    // lane follow with lag
    this.targetLane = player.lane;
    const laneSpeed = this.stun > 0 ? 2 : 5;
    const targetX = this.LANES[this.targetLane];
    this.currentX = THREE.MathUtils.lerp(this.currentX, targetX, Math.min(1, delta * laneSpeed));

    // ПОЗАДИ игрока (сторона камеры): визуальная компрессия,
    // чтобы Гендос не закрывал весь экран у самой камеры
    const safeT = THREE.MathUtils.clamp(
      (this.distance - this.catchDistance) / (this.FAR - this.catchDistance), 0, 1);
    this.z = player.group.position.z + 2.0 + safeT * 2.8;
    this.group.position.set(this.currentX, this.y, this.z);

    // бег: bob ускоряется со злостью
    this.runPhase += delta * (8 + this.rage * 8);
    const bob = Math.sin(this.runPhase) * (0.05 + this.rage * 0.04);
    this.sprite.position.y = 0.2 + bob;

    // злой Гендос больше и краснее
    const grow = 1 + this.rage * 0.12;
    this.sprite.scale.set(2.15 * grow, 2.6 * grow, 1);
    this.spriteMat.color.setHSL(0, this.rage * 0.45, 1 - this.rage * 0.12);
    if (this.rage > 0.75 && this.forceTimer <= 0) {
      this.sprite.position.x = (Math.random() - 0.5) * 0.09;
    } else {
      this.sprite.position.x = 0;
    }

    if (this.stun > 0) {
      this.sprite.material.opacity = 0.7;
      this.sprite.material.rotation = Math.sin(Date.now()*0.01)*0.12;
    } else {
      this.sprite.material.opacity = 1;
      this.sprite.material.rotation = THREE.MathUtils.lerp(this.sprite.material.rotation, 0, delta*8);
    }
  }

  // держать позу (для ивента стрельбы — guard2 с пистолетом)
  forceRagePose(level, seconds) {
    this.forcePose = level;
    this.forceTimer = seconds;
  }

  onPlayerHit() {
    this.distance = Math.max(this.catchDistance, this.distance - this.hitPenalty);
    this.anger = Math.min(1, this.anger + 0.22);
    this.stun = 0;
  }

  onPlayerPowerUp() {
    this.distance = Math.min(this.FAR, this.distance + 6.5);
    this.anger = Math.max(0, this.anger - 0.35);
    this.stun = 1.0;
  }

  isCaught() {
    return this.distance <= this.catchDistance;
  }

  reset() {
    this.distance = this.START_DIST;
    this.anger = 0;
    this.rage = 0;
    this.rageLevel = 0;
    this.runPhase = 0;
    this.stun = 0;
    this.forcePose = -1;
    this.forceTimer = 0;
    this.currentX = this.LANES[1];
    this.targetLane = 1;
    this.spriteMat.color.setHSL(0, 0, 1);
  }

  getPosition() { return this.group.position.clone(); }
}
