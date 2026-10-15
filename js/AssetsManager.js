import * as THREE from 'three';

export class AssetManager {
  constructor() {
    this.textures = {
      person: [],   // [person1 спокойный ... person4 паника] — стресс Максогена
      guard: [],    // [guard1 спокойный, sticker середина, guard2 злой] — злость Гендоса
      coin1: null,
      coin2: null,
      skybox: null,
      sticker: null, // тот же sticker, отдельно для катсцены
    };
    this.loaded = false;
  }

  load() {
    return new Promise((resolve) => {
      const loader = new THREE.TextureLoader();
      const toLoad = [
        { url: 'sprites/person1.png', kind: 'person', idx: 0 },
        { url: 'sprites/person2.png', kind: 'person', idx: 1 },
        { url: 'sprites/person3.png', kind: 'person', idx: 2 },
        { url: 'sprites/person4.png', kind: 'person', idx: 3 },
        { url: 'sprites/guard1.png', kind: 'guard', idx: 0 },
        { url: 'sprites/sticker.png', kind: 'guard', idx: 1 },
        { url: 'sprites/guard2.png', kind: 'guard', idx: 2 },
        { url: 'sprites/coin1.png', kind: 'coin1' },
        { url: 'sprites/coin2.png', kind: 'coin2' },
        { url: 'sprites/skybox.jpg', kind: 'skybox' },
      ];

      let remaining = toLoad.length;

      const done = () => {
        remaining--;
        if (remaining <= 0) {
          this.loaded = true;
          this.textures.sticker = this.textures.guard[1] || null;
          resolve(this.textures);
        }
      };

      toLoad.forEach(item => {
        loader.load(
          item.url,
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.minFilter = THREE.LinearFilter;
            tex.magFilter = THREE.LinearFilter;
            if (item.kind === 'person' || item.kind === 'guard' || item.kind === 'coin1' || item.kind === 'coin2') {
              tex.generateMipmaps = false;
            }
            if (item.kind === 'person') this.textures.person[item.idx] = tex;
            else if (item.kind === 'guard') this.textures.guard[item.idx] = tex;
            else if (item.kind === 'coin1') this.textures.coin1 = tex;
            else if (item.kind === 'coin2') this.textures.coin2 = tex;
            else if (item.kind === 'skybox') this.textures.skybox = tex;
            done();
          },
          undefined,
          () => {
            console.warn('Failed to load', item.url);
            done();
          }
        );
      });
    });
  }

  getPerson(i) {
    if (!this.textures.person.length) return null;
    const n = this.textures.person.length;
    return this.textures.person[((i % n) + n) % n] || null;
  }
  getGuard(i) {
    if (!this.textures.guard.length) return null;
    const n = this.textures.guard.length;
    return this.textures.guard[((i % n) + n) % n] || null;
  }
}
