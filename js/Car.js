import * as THREE from 'three';

// Красный Ford Fusion 2006 по фото из sprites/car: высокий хэтчбек,
// крупные фары, чёрная решётка, туманки, серый молдинг, антенна.
// Лобовое почти прозрачное — Игнатьевича (sprites/characters/sergey.png)
// за рулём видно отлично. Едет мордой +Z (на Максогена).
export class IgnatCar {
  constructor(scene, am) {
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.wheels = [];
    this.panic = false;
    this.panicPhase = 0;

    const paint = new THREE.MeshStandardMaterial({ color: 0xc01818, metalness: 0.55, roughness: 0.35 });
    const darkTrim = new THREE.MeshStandardMaterial({ color: 0x2f3542, roughness: 0.8 });
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.9 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.95 });
    const hubMat = new THREE.MeshStandardMaterial({ color: 0xc2c8d0, metalness: 0.85, roughness: 0.28 });

    // кузов КАБРИОЛЕТА: крыши нет, салон открыт — Игнатьевича видно полностью
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.85, 4.3), paint);
    body.position.y = 0.85;
    this.group.add(body);
    // ванна салона
    const tub = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.3, 2.6), darkTrim);
    tub.position.set(0, 1.25, -0.2);
    this.group.add(tub);
    // задняя полка кабриолета
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.22, 1.0), paint);
    deck.position.set(0, 1.32, -1.6);
    this.group.add(deck);
    // сиденья
    for (const sx of [-0.5, 0.5]) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), seatMat);
      seat.position.set(sx, 1.45, -0.45);
      this.group.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.2), seatMat);
      back.position.set(sx, 1.7, -0.72);
      back.rotation.x = 0.12;
      this.group.add(back);
    }

    // низкое лобовое кабриолета + рамка
    const glassLow = new THREE.MeshStandardMaterial({ color: 0x9fc4dd, roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.22, depthWrite: false });
    const shield = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.42), glassLow);
    shield.position.set(0, 1.5, 0.95);
    shield.rotation.x = -0.35;
    this.group.add(shield);
    const frameTop = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.07, 0.07), paint);
    frameTop.position.set(0, 1.72, 0.88);
    frameTop.rotation.x = -0.35;
    this.group.add(frameTop);

    // ИГНАТЬЕВИЧ: шириной в два сиденья, сидит высоко, ничем не закрыт.
    // Плоскость — в пропорциях фото (1280x590), иначе рожа корежится.
    const driverTex = am.textures.sergey || null;
    this.driver = new THREE.Mesh(
      new THREE.PlaneGeometry(1.9, 0.88),
      new THREE.MeshBasicMaterial({ map: driverTex, transparent: true, side: THREE.DoubleSide })
    );
    this.driver.position.set(-0.15, 1.98, -0.25);
    this.driver.renderOrder = 5;
    this.group.add(this.driver);
    // торпеда + руль
    const dash = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.25, 0.4), darkTrim);
    dash.position.set(0, 1.3, 0.6);
    this.group.add(dash);
    const steer = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.04, 8, 18), darkTrim);
    steer.position.set(-0.5, 1.42, 0.42);
    steer.rotation.x = -0.5;
    this.group.add(steer);
    // серый молдинг по бокам — фирменная черта фьюжна
    const moldingMat = darkTrim;
    for (const sx of [-1, 1]) {
      const molding = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.15, 3.4), moldingMat);
      molding.position.set(sx * 1.16, 0.78, -0.1);
      this.group.add(molding);
      // ручки дверей
      for (const hz of [0.45, -0.75]) {
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.22), darkTrim);
        handle.position.set(sx * 1.16, 1.05, hz);
        this.group.add(handle);
      }
    }
    // антенна на заднем крыле кабриолета
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.55, 6), darkTrim);
    ant.position.set(0.85, 1.65, -1.6);
    ant.rotation.z = -0.15;
    this.group.add(ant);
    const antBall = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), darkTrim);
    antBall.position.set(0.89, 1.92, -1.6);
    this.group.add(antBall);

    // фары + поворотники + свечение
    this.headMat = new THREE.MeshStandardMaterial({ color: 0xfff6c8, emissive: 0xffedb0, emissiveIntensity: 1.6 });
    const turnMat = new THREE.MeshStandardMaterial({ color: 0xff9500, emissive: 0xff7700, emissiveIntensity: 0.9 });
    for (const sx of [-1, 1]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.36, 0.08), this.headMat);
      hl.position.set(sx * 0.72, 1.05, 2.16);
      this.group.add(hl);
      const turn = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.36, 0.08), turnMat);
      turn.position.set(sx * 1.0, 1.05, 2.16);
      this.group.add(turn);
      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(0.62, 0.62),
        new THREE.MeshBasicMaterial({ color: 0xffedb0, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      glow.position.set(sx * 0.72, 1.05, 2.22);
      this.group.add(glow);
      const fog = new THREE.Mesh(new THREE.CircleGeometry(0.1, 12), this.headMat);
      fog.position.set(sx * 0.7, 0.52, 2.21);
      this.group.add(fog);
    }

    // решётка + синий овал + номера
    const grille = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.32, 0.06), darkTrim);
    grille.position.set(0, 0.9, 2.16);
    this.group.add(grille);
    const oval = new THREE.Mesh(
      new THREE.CircleGeometry(0.1, 16),
      new THREE.MeshStandardMaterial({ color: 0x1a4fa0, emissive: 0x1a4fa0, emissiveIntensity: 0.5 })
    );
    oval.scale.x = 1.6;
    oval.position.set(0, 0.9, 2.20);
    this.group.add(oval);
    const plateF = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.13, 0.02),
      new THREE.MeshStandardMaterial({ color: 0xf5f5f5 }));
    plateF.position.set(0, 0.58, 2.21);
    this.group.add(plateF);
    const plateR = plateF.clone();
    plateR.position.set(0, 0.58, -2.16);
    plateR.rotation.y = Math.PI;
    this.group.add(plateR);

    // бамперы, зеркала, выхлоп
    const bumperF = new THREE.Mesh(new THREE.BoxGeometry(2.32, 0.32, 0.1), darkTrim);
    bumperF.position.set(0, 0.36, 2.15);
    this.group.add(bumperF);
    const bumperR = new THREE.Mesh(new THREE.BoxGeometry(2.32, 0.32, 0.1), darkTrim);
    bumperR.position.set(0, 0.36, -2.15);
    this.group.add(bumperR);
    for (const sx of [-1, 1]) {
      const mir = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.18), paint);
      mir.position.set(sx * 1.22, 1.28, 0.72);
      this.group.add(mir);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.32, 0.06),
        new THREE.MeshStandardMaterial({ color: 0xaa1111, emissive: 0xcc0000, emissiveIntensity: 0.8 }));
      tail.position.set(sx * 0.74, 1.05, -2.16);
      this.group.add(tail);
    }
    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.35, 10), darkTrim);
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(0.55, 0.3, -2.2);
    this.group.add(exhaust);

    // колёса со спицами
    const tireGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 20);
    tireGeo.rotateZ(Math.PI / 2);
    const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.34, 12);
    hubGeo.rotateZ(Math.PI / 2);
    const spokeGeo = new THREE.BoxGeometry(0.05, 0.68, 0.1);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const wg = new THREE.Group();
      wg.position.set(sx * 1.02, 0.42, sz * 1.45);
      wg.add(new THREE.Mesh(tireGeo, tireMat));
      wg.add(new THREE.Mesh(hubGeo, hubMat));
      // 5 спиц на внешней стороне колеса
      for (let s = 0; s < 5; s++) {
        const spoke = new THREE.Mesh(spokeGeo, hubMat);
        spoke.position.x = sx * 0.13;
        spoke.rotation.x = (s / 5) * Math.PI * 2;
        wg.add(spoke);
      }
      this.group.add(wg);
      this.wheels.push(wg);
    }

    // тень
    const sh = new THREE.Mesh(
      new THREE.CircleGeometry(1.5, 14),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32 })
    );
    sh.rotation.x = -Math.PI / 2;
    sh.scale.set(0.8, 1.5, 1);
    sh.position.y = 0.02;
    this.group.add(sh);
  }

  spawn(x, z) {
    this.group.position.set(x, 0, z);
    this.group.visible = true;
    this.panic = true;
  }

  despawn() {
    this.group.visible = false;
    this.panic = false;
  }

  get active() { return this.group.visible; }
  get x() { return this.group.position.x; }
  get z() { return this.group.position.z; }

  setPanic(v) { this.panic = v; }

  update(delta, totalSpeed) {
    if (!this.group.visible) return;
    this.group.position.z += totalSpeed * delta;
    const spin = (totalSpeed / 0.42) * delta;
    for (const w of this.wheels) w.rotation.x -= spin;
    // моргание фарами пока несётся на Максогена
    if (this.panic) {
      this.panicPhase += delta * 10;
      this.headMat.emissiveIntensity = 1.2 + Math.abs(Math.sin(this.panicPhase)) * 1.6;
    } else {
      this.headMat.emissiveIntensity = 1.6;
    }
  }
}
