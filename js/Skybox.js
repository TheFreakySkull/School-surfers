import * as THREE from 'three';

// Фон-школа: два больших задника, плавный кроссфейд каждые ~25 секунд.
// Текстуры — sprites/skyboxes/*.jpg (коридоры, лестницы, спортзал, туалет...).
export class Skybox {
  constructor(scene, textures) {
    this.scene = scene;
    this.textures = (textures || []).filter(Boolean);
    this.CYCLE = 24;   // смена фона каждые N секунд
    this.FADE = 3.0;   // длительность кроссфейда
    this.timer = this.CYCLE;
    this.fade = 0;
    this.idx = 0;
    this.next = this.textures.length > 1 ? 1 : 0;

    const geo = new THREE.PlaneGeometry(340, 260);
    const first = this.textures[0] || null;
    this.a = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: first, fog: false }));
    this.a.position.set(0, 30, -100);
    scene.add(this.a);

    this.b = new THREE.Mesh(
      geo.clone(),
      new THREE.MeshBasicMaterial({ map: this.textures[this.next] || null, fog: false, transparent: true, opacity: 0 })
    );
    this.b.position.set(0, 30, -99);
    scene.add(this.b);
  }

  update(delta) {
    if (this.textures.length < 2) return;
    if (this.fade > 0) {
      this.fade -= delta;
      const t = THREE.MathUtils.clamp(1 - this.fade / this.FADE, 0, 1);
      this.b.material.opacity = t;
      if (this.fade <= 0) {
        // фейд кончился: нижний слой забирает новую текстуру
        this.idx = this.next;
        this.a.material.map = this.textures[this.idx];
        this.a.material.needsUpdate = true;
        this.next = (this.idx + 1) % this.textures.length;
        this.b.material.map = this.textures[this.next];
        this.b.material.needsUpdate = true;
        this.b.material.opacity = 0;
        this.timer = this.CYCLE;
      }
    } else {
      this.timer -= delta;
      if (this.timer <= 0) this.fade = this.FADE;
    }
  }

  reset() {
    this.timer = this.CYCLE;
    this.fade = 0;
    this.idx = 0;
    this.next = this.textures.length > 1 ? 1 : 0;
    this.a.material.map = this.textures[0] || null;
    this.a.material.needsUpdate = true;
    this.b.material.map = this.textures[this.next] || null;
    this.b.material.needsUpdate = true;
    this.b.material.opacity = 0;
  }
}
