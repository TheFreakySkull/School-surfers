import * as THREE from 'three';

// Все 3D-модельки игры в одном месте: ими пользуется и Level,
// и галерея EXTRAS (посмотреть/покрутить). Каждая функция возвращает
// голую модель (без позиции и userData — их выставляет Level).

function std(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, ...extra });
}

export function buildDesk() {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.16, 0.9), std(0x8B5A2B));
  top.position.y = 0.75;
  g.add(top);
  const legGeo = new THREE.BoxGeometry(0.08, 0.75, 0.08);
  const legMat = std(0x5a3a1a);
  for (const dx of [-0.85, 0.85]) for (const dz of [-0.32, 0.32]) {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(dx, 0.375, dz);
    g.add(leg);
  }
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.35), std(0xff6b6b));
  b.position.set(0.2, 0.92, 0);
  g.add(b);
  return { group: g, kind: 'low', h: 0.9, yRange: [0, 0.95] };
}

export function buildLocker() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.4, 0.9), std(0x2e86de));
  body.position.y = 1.2;
  g.add(body);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.28, 0.05), std(0x222222));
  handle.position.set(0.35, 1.2, 0.48);
  g.add(handle);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.71, 0.08, 0.92), std(0x1a5fb4));
  stripe.position.y = 1.8;
  g.add(stripe);
  return { group: g, kind: 'full', h: 2.4, yRange: [0, 2.4] };
}

export function buildBooks() {
  const g = new THREE.Group();
  const colors = [0xff4757, 0x2ed573, 0x1e90ff, 0xffa502];
  let y = 0.15;
  for (let i = 0; i < 4; i++) {
    const h = 0.22 + Math.random() * 0.1;
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.1, h, 0.75), std(colors[i % colors.length]));
    b.position.y = y + h / 2;
    b.rotation.y = (Math.random() - 0.5) * 0.2;
    g.add(b);
    y += h;
  }
  return { group: g, kind: 'low', h: y, yRange: [0, y + 0.05] };
}

export function buildTrash() {
  const g = new THREE.Group();
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 1.0, 14), std(0x636e72));
  cyl.position.y = 0.5;
  g.add(cyl);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.07, 8, 14), std(0x2f3542));
  rim.position.y = 1.0;
  rim.rotation.x = Math.PI / 2;
  g.add(rim);
  const paper = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.18), std(0xf1f2f6));
  paper.position.set(0.15, 1.05, 0);
  paper.rotation.set(0.4, 0.6, 0.2);
  g.add(paper);
  return { group: g, kind: 'low', h: 1.0, yRange: [0, 1.05] };
}

export function buildBarrier() {
  const g = new THREE.Group();
  const postGeo = new THREE.BoxGeometry(0.15, 1.9, 0.15);
  const postMat = std(0xc0392b);
  const p1 = new THREE.Mesh(postGeo, postMat);
  p1.position.set(-0.75, 0.95, 0);
  g.add(p1);
  const p2 = new THREE.Mesh(postGeo, postMat);
  p2.position.set(0.75, 0.95, 0);
  g.add(p2);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.18, 0.18), std(0xe74c3c));
  bar.position.set(0, 1.55, 0);
  g.add(bar);
  const bar2 = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.09, 0.09), std(0xff7979));
  bar2.position.set(0, 1.75, 0);
  g.add(bar2);
  const tape = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.06, 0.02), std(0xf1c40f));
  tape.position.set(0, 1.45, 0.08);
  g.add(tape);
  return { group: g, kind: 'high', h: 1.55, yRange: [1.35, 1.95] };
}

export function buildObstacle(type) {
  switch (type) {
    case 'locker': return buildLocker();
    case 'books': return buildBooks();
    case 'trash': return buildTrash();
    case 'barrier': return buildBarrier();
    case 'desk':
    default: return buildDesk();
  }
}

// Пикапы подуровней и ствола. Возвращает модель + анимируемые части.
export function buildPickup(kind) {
  const g = new THREE.Group();
  let ring = null;
  let spinMesh = null;
  if (kind === 'tunnel') {
    const grate = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.12, 1.6),
      std(0x2f3542, { roughness: 0.9 })
    );
    grate.position.y = 0.06;
    g.add(grate);
    for (let i = -1; i <= 1; i++) {
      const slat = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.04, 0.12),
        std(0x57606f, { emissive: 0x00d2ff, emissiveIntensity: 0.5 })
      );
      slat.position.set(0, 0.13, i * 0.45);
      g.add(slat);
    }
    ring = new THREE.Mesh(
      new THREE.RingGeometry(0.95, 1.15, 20),
      new THREE.MeshBasicMaterial({ color: 0x00d2ff, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    g.add(ring);
  } else if (kind === 'gun') {
    const gunMat = std(0x2b2b2b, { roughness: 0.4, metalness: 0.7 });
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.12), gunMat);
    slide.position.y = 1.2;
    g.add(slide);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.32, 0.11), gunMat);
    grip.position.set(-0.18, 1.0, 0);
    grip.rotation.z = 0.25;
    g.add(grip);
    const sight = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.06, 0.06),
      std(0xffdd33, { emissive: 0xffdd33, emissiveIntensity: 1 })
    );
    sight.position.set(0.24, 1.28, 0);
    g.add(sight);
    ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.68, 18),
      new THREE.MeshBasicMaterial({ color: 0xff9f43, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    g.add(ring);
    spinMesh = slide;
  } else {
    // 'jet' — джетпак
    const pack = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.75, 0.32),
      std(0xe67e22, { emissive: 0xd35400, emissiveIntensity: 0.4 })
    );
    pack.position.y = 1.1;
    g.add(pack);
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.24, 0.55, 10),
      new THREE.MeshBasicMaterial({ color: 0xffdd33, transparent: true, opacity: 0.9 })
    );
    flame.position.y = 0.45;
    flame.rotation.x = Math.PI;
    g.add(flame);
    ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.68, 18),
      new THREE.MeshBasicMaterial({ color: 0xff9f43, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    g.add(ring);
  }
  return { group: g, ring, spinMesh };
}
