import * as THREE from 'three';

// Все фоны-скайбоксы школы (плавная смена со временем — см. js/Skybox.js)
export const SKYBOX_FILES = [
  'hall-main', 'hall-yellow', 'hall-pink', 'stairs-blue', 'stairs-green',
  'exit', 'toilet', 'hall-long', 'gym',
];

export class AssetManager {
  constructor() {
    this.textures = {
      person: [],   // sprites/player: [person1 спокойный ... person4 паника] — стресс Максогена
      guard: [],    // sprites/gendos: [guard1 спокойный, sticker середина, guard2 злой] — злость Гендоса
      coin1: null,  // sprites/coins
      coin2: null,  // sprites/coins
      sergey: null, // sprites/characters — Игнатьевич за рулём форда
      skyboxList: [], // sprites/skyboxes — фоны
      skybox: null,   // первый фон (совместимость)
      sticker: null,
    };
    this.loaded = false;
  }

  load() {
    return new Promise((resolve) => {
      const loader = new THREE.TextureLoader();
      const toLoad = [
        { url: 'sprites/player/person1.png', kind: 'person', idx: 0 },
        { url: 'sprites/player/person2.png', kind: 'person', idx: 1 },
        { url: 'sprites/player/person3.png', kind: 'person', idx: 2 },
        { url: 'sprites/player/person4.png', kind: 'person', idx: 3 },
        { url: 'sprites/gendos/guard1.png', kind: 'guard', idx: 0 },
        { url: 'sprites/gendos/sticker.png', kind: 'guard', idx: 1 },
        { url: 'sprites/gendos/guard2.png', kind: 'guard', idx: 2 },
        { url: 'sprites/coins/coin1.png', kind: 'coin1' },
        { url: 'sprites/coins/coin2.png', kind: 'coin2' },
        { url: 'sprites/characters/sergey.png', kind: 'sergey' },
        ...SKYBOX_FILES.map((n, i) => ({ url: `sprites/skyboxes/${n}.jpg`, kind: 'skybox', idx: i })),
      ];

      let remaining = toLoad.length;

      const done = () => {
        remaining--;
        if (remaining <= 0) {
          this.loaded = true;
          this.textures.skybox = this.textures.skyboxList[0] || null;
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
            if (item.kind === 'person' || item.kind === 'guard' || item.kind === 'coin1' || item.kind === 'coin2' || item.kind === 'sergey') {
              tex.generateMipmaps = false;
            }
            if (item.kind === 'person') this.textures.person[item.idx] = tex;
            else if (item.kind === 'guard') this.textures.guard[item.idx] = tex;
            else if (item.kind === 'coin1') this.textures.coin1 = tex;
            else if (item.kind === 'coin2') this.textures.coin2 = tex;
            else if (item.kind === 'sergey') this.textures.sergey = tex;
            else if (item.kind === 'skybox') this.textures.skyboxList[item.idx] = tex;
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
