// NEON HARBOR city: a procedural sun-soaked coastal city.
// A 7x7 grid of blocks split by roads, towers with lit windows, neon shop
// signs, palms, lamps, traffic lights, Coral Plaza, a beach boardwalk and
// the Pier 9 harbor with the sea beyond it. Every texture is painted on
// canvases at runtime — no image files, no network.
//
// Mission-critical spots (docks, club, marina, chop shop, plaza, garage,
// bank, safehouse, spawn) are kept clear of buildings so the player can
// always reach them.
import * as THREE from 'three';
import { CONFIG, PALETTE } from './config.js';
import { makeRng, pick, range, intRange } from './random.js';

// Spots that must stay walkable: [x, z, clearRadius].
const CLEAR_ZONES = [
  [138, -138, 11], [-60, 92, 11], [92, -46, 11], [-138, -46, 11],
  [0, 0, 13], [-92, 46, 11], [46, -92, 11], [-138, 138, 11], [-14, 92, 9],
];

function clearOfZones(x, z, halfW, halfD) {
  for (const [cx, cz, r] of CLEAR_ZONES) {
    if (Math.abs(x - cx) < halfW + r && Math.abs(z - cz) < halfD + r) return false;
  }
  return true;
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A tower facade: dark glass with a grid of windows, some lit amber.
function facadeTexture(rng, hue) {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = hue;
    g.fillRect(0, 0, w, h);
    const cols = 8, rows = 18;
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const lit = rng() < 0.42;
        g.fillStyle = lit ? (rng() < 0.7 ? '#ffd27a' : '#9fe8ff') : '#1a2636';
        g.fillRect(6 + x * 15, 8 + y * 13.5, 10, 8);
      }
    }
  });
}

// Road surface with centre-line dashes. 'h' dashes run along U (for
// east-west roads), 'v' dashes run along V (for north-south roads);
// the caller repeats the texture so one tile is 16 world units.
function roadTexture(dir) {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#2b2f36';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#d8c95a';
    if (dir === 'h') {
      g.fillRect(8, h / 2 - 2, 34, 4);
      g.fillRect(72, h / 2 - 2, 34, 4);
    } else {
      g.fillRect(w / 2 - 2, 8, 4, 34);
      g.fillRect(w / 2 - 2, 72, 4, 34);
    }
    g.fillStyle = 'rgba(255,255,255,0.14)';
    if (dir === 'h') { g.fillRect(0, 4, w, 2); g.fillRect(0, h - 6, w, 2); }
    else { g.fillRect(4, 0, 2, h); g.fillRect(w - 6, 0, 2, h); }
  });
}

function signTexture(text, color, bg) {
  return canvasTexture(256, 96, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.font = 'bold 44px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = color;
    g.shadowBlur = 22;
    g.fillStyle = color;
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

function awningTexture(rng) {
  const colors = ['#ff4fa3', '#39d5ff', '#ffb454', '#7dff9a'];
  const c = pick(rng, colors);
  return canvasTexture(128, 64, (g, w, h) => {
    for (let i = 0; i < 8; i += 1) {
      g.fillStyle = i % 2 === 0 ? c : '#f2f0ea';
      g.fillRect(i * 16, 0, 16, h);
    }
  });
}

export class City {
  constructor(scene, seed) {
    this.scene = scene;
    this.rng = makeRng(seed);
    this.buildingBoxes = []; // {minX,maxX,minZ,maxZ} for collision
    this.trafficLights = []; // {red, yellow, green} materials, cycled in update
    this.sea = null;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.buildLights();
    this.buildGround();
    this.buildBlocks();
    this.buildHarbor();
    this.buildBeach();
    this.buildSky();
  }

  buildLights() {
    const sun = new THREE.DirectionalLight(PALETTE.sun, 2.4);
    sun.position.set(120, 180, 60);
    sun.castShadow = false;
    this.scene.add(sun);
    const hemi = new THREE.HemisphereLight(0x8fb4ff, 0x3a2a1e, 0.9);
    this.scene.add(hemi);
    this.scene.fog = new THREE.Fog(0xf2a56b, 180, 520);
    this.scene.background = new THREE.Color(0xf2855a);
  }

  buildGround() {
    const size = CONFIG.blocks * CONFIG.blockPitch + 60;
    // Base ground: warm concrete/asphalt apron under the whole city.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(size + 300, size + 300),
      new THREE.MeshLambertMaterial({ color: 0x55504a }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    this.group.add(ground);

    // Roads: one plane per street, both directions, with dashed centres.
    // One texture tile covers 16 world units along the road.
    const texH = roadTexture('h');
    texH.wrapS = THREE.RepeatWrapping;
    texH.repeat.set(size / 16, 1);
    const texV = roadTexture('v');
    texV.wrapT = THREE.RepeatWrapping;
    texV.repeat.set(1, size / 16);
    const roadMatH = new THREE.MeshLambertMaterial({ map: texH });
    const roadMatV = new THREE.MeshLambertMaterial({ map: texV });
    const swMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
    const half = (CONFIG.blocks * CONFIG.blockPitch) / 2;
    const coords = [];
    for (let i = 0; i <= CONFIG.blocks; i += 1) coords.push(-half + i * CONFIG.blockPitch);
    for (const c of coords) {
      // East-west street: long in X, dashes along X.
      const roadH = new THREE.Mesh(new THREE.PlaneGeometry(size, CONFIG.roadWidth), roadMatH);
      roadH.rotation.x = -Math.PI / 2;
      roadH.position.set(0, 0, c);
      this.group.add(roadH);
      // North-south street: long in Z, dashes along Z.
      const roadV = new THREE.Mesh(new THREE.PlaneGeometry(CONFIG.roadWidth, size), roadMatV);
      roadV.rotation.x = -Math.PI / 2;
      roadV.position.set(c, 0, 0);
      this.group.add(roadV);
      // Sidewalks flanking each road.
      const swOff = CONFIG.roadWidth / 2 + 1.5;
      for (const s of [-1, 1]) {
        const swH = new THREE.Mesh(new THREE.PlaneGeometry(size, 3), swMat);
        swH.rotation.x = -Math.PI / 2;
        swH.position.set(0, 0.02, c + s * swOff);
        this.group.add(swH);
        const swV = new THREE.Mesh(new THREE.PlaneGeometry(3, size), swMat);
        swV.rotation.x = -Math.PI / 2;
        swV.position.set(c + s * swOff, 0.02, 0);
        this.group.add(swV);
      }
    }
    // Traffic lights at the four central intersections.
    for (const [lx, lz] of [[-23, -23], [23, -23], [-23, 23], [23, 23]]) {
      this.buildTrafficLight(lx + 8.5, lz + 8.5);
    }
  }

  buildTrafficLight(x, z) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.16, 5.4, 6),
      new THREE.MeshLambertMaterial({ color: 0x2a2d31 }),
    );
    pole.position.set(x, 2.7, z);
    this.group.add(pole);
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 1.9, 0.7),
      new THREE.MeshLambertMaterial({ color: 0x141414 }),
    );
    box.position.set(x, 5.6, z);
    this.group.add(box);
    const lamp = (color, y) => {
      const m = new THREE.MeshBasicMaterial({ color });
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), m);
      s.position.set(x, y, z + 0.36);
      this.group.add(s);
      return m;
    };
    this.trafficLights.push({
      red: lamp(0xff2020, 6.2),
      yellow: lamp(0x554400, 5.6),
      green: lamp(0x225522, 5.0),
    });
  }

  // Cycle the traffic lights: green 5s, yellow 1.2s, red 5s, staggered.
  update(dt, t) {
    const phase = (t % 12.4);
    for (let i = 0; i < this.trafficLights.length; i += 1) {
      const p = (phase + i * 3.1) % 12.4;
      const L = this.trafficLights[i];
      const state = p < 5 ? 'g' : p < 6.2 ? 'y' : 'r';
      L.red.color.setHex(state === 'r' ? 0xff2020 : 0x550000);
      L.yellow.color.setHex(state === 'y' ? 0xffd23a : 0x554400);
      L.green.color.setHex(state === 'g' ? 0x35ff70 : 0x225522);
    }
    if (this.sea) this.sea.position.y = -0.2 + Math.sin(t * 0.6) * 0.06;
  }

  buildBlocks() {
    const rng = this.rng;
    const pitch = CONFIG.blockPitch;
    const half = (CONFIG.blocks * CONFIG.blockPitch) / 2;
    const facades = [
      facadeTexture(rng, '#2c3a4e'),
      facadeTexture(rng, '#3a2f42'),
      facadeTexture(rng, '#26343c'),
      facadeTexture(rng, '#46342a'),
    ];
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x3a3f45 });
    const shopColors = [0x7a4a3a, 0x3a5a6b, 0x5a4a6b, 0x6b5a3a, 0x2f4a3a];
    const signDefs = [
      ['CLUB NEON', '#ff4fa3'], ['TACOS', '#ffb454'], ['24H MART', '#39d5ff'],
      ['PIZZA', '#ff6b4a'], ['HOTEL', '#ffd27a'], ['GYM', '#7dff9a'],
      ['BANK', '#9fe8ff'], ['ARCADE', '#ff4fa3'], ['DONUTS', '#ffb4d5'],
    ];

    for (let bx = 0; bx < CONFIG.blocks; bx += 1) {
      for (let bz = 0; bz < CONFIG.blocks; bz += 1) {
        const cx = -half + pitch / 2 + bx * pitch;
        const cz = -half + pitch / 2 + bz * pitch;
        // Coral Plaza: the central block stays an open square.
        if (bx === 3 && bz === 3) { this.buildPlaza(cx, cz); continue; }
        const towers = intRange(rng, 2, 4);
        for (let t = 0; t < towers; t += 1) {
          const w = range(rng, 10, 18);
          const d = range(rng, 10, 18);
          const h = range(rng, 12, 58);
          // Keep the whole footprint inside the block interior (within
          // 13 units of the block centre) so towers never jut into the
          // road strip and clip cars driving along the kerb.
          const maxOffX = 13 - w / 2 - 0.5;
          const maxOffZ = 13 - d / 2 - 0.5;
          if (maxOffX < 1 || maxOffZ < 1) continue;
          const x = cx + range(rng, -maxOffX, maxOffX);
          const z = cz + range(rng, -maxOffZ, maxOffZ);
          // Never block a mission spot or the spawn.
          if (!clearOfZones(x, z, w / 2 + 1, d / 2 + 1)) continue;
          const mat = new THREE.MeshLambertMaterial({
            map: pick(rng, facades),
            emissive: 0xffffff,
            emissiveMap: pick(rng, facades),
            emissiveIntensity: 0.55,
          });
          const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
          tower.position.set(x, h / 2, z);
          this.group.add(tower);
          const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.8, d + 0.6), roofMat);
          roof.position.set(x, h + 0.4, z);
          this.group.add(roof);
          // Rooftop antenna with a red beacon on tall towers.
          if (h > 30) {
            const ant = new THREE.Mesh(
              new THREE.BoxGeometry(0.4, 8, 0.4),
              new THREE.MeshLambertMaterial({ color: 0x222222 }),
            );
            ant.position.set(x + w / 4, h + 4.4, z);
            this.group.add(ant);
            const tip = new THREE.Mesh(
              new THREE.SphereGeometry(0.5, 8, 6),
              new THREE.MeshBasicMaterial({ color: 0xff4747 }),
            );
            tip.position.set(x + w / 4, h + 8.6, z);
            this.group.add(tip);
          }
          this.buildingBoxes.push({
            minX: x - w / 2 - 0.4, maxX: x + w / 2 + 0.4,
            minZ: z - d / 2 - 0.4, maxZ: z + d / 2 + 0.4,
          });
        }
        // Street-level shopfront on one edge of the block. Kept 12 units
        // off-centre (box 2.5 deep) so its collision box never reaches
        // the road strip and clips cars driving along the kerb.
        const sx = cx + range(rng, -10, 10);
        const sz = cz + (rng() < 0.5 ? -12 : 12);
        if (clearOfZones(sx, sz, 6.5, 3)) {
          const shop = new THREE.Mesh(
            new THREE.BoxGeometry(range(rng, 8, 12), 4.5, 5),
            new THREE.MeshLambertMaterial({ color: pick(rng, shopColors) }),
          );
          shop.position.set(sx, 2.25, sz);
          this.group.add(shop);
          this.buildingBoxes.push({
            minX: sx - 6, maxX: sx + 6, minZ: sz - 2.5, maxZ: sz + 2.5,
          });
          // Neon sign on the shopfront.
          if (rng() < 0.75) {
            const [text, color] = pick(rng, signDefs);
            const sign = new THREE.Mesh(
              new THREE.PlaneGeometry(9, 3.4),
              new THREE.MeshBasicMaterial({
                map: signTexture(text, color, '#120a18'),
                transparent: true,
              }),
            );
            sign.position.set(sx, 5.6, sz + (sz > cz ? 2.6 : -2.6));
            if (sz < cz) sign.rotation.y = Math.PI;
            this.group.add(sign);
          }
        }
        // One palm tree on a block corner and one street lamp on the edge.
        this.buildPalm(cx + (rng() < 0.5 ? -14 : 14), cz + (rng() < 0.5 ? -14 : 14), rng);
        this.buildLamp(cx + (rng() < 0.5 ? -17 : 17), cz + range(rng, -14, 14));
      }
    }
  }

  buildPlaza(cx, cz) {
    // Open square: fountain, market stalls, benches, palms, no towers.
    const slab = new THREE.Mesh(
      new THREE.CylinderGeometry(9, 9, 0.6, 24),
      new THREE.MeshLambertMaterial({ color: 0x7d8aa0 }),
    );
    slab.position.set(cx, 0.3, cz);
    this.group.add(slab);
    const water = new THREE.Mesh(
      new THREE.CylinderGeometry(7.5, 7.5, 0.7, 24),
      new THREE.MeshLambertMaterial({ color: PALETTE.water, emissive: 0x0a3548, emissiveIntensity: 0.6 }),
    );
    water.position.set(cx, 0.45, cz);
    this.group.add(water);
    const rng = this.rng;
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2;
      this.buildPalm(cx + Math.cos(a) * 15, cz + Math.sin(a) * 15, rng);
    }
    // Market stalls with striped awnings around the fountain.
    for (let i = 0; i < 4; i += 1) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const sx = cx + Math.cos(a) * 13;
      const sz = cz + Math.sin(a) * 13;
      const stall = new THREE.Mesh(
        new THREE.BoxGeometry(4, 2.4, 3),
        new THREE.MeshLambertMaterial({ color: pick(rng, [0x7a4a3a, 0x3a5a6b, 0x5a4a6b]) }),
      );
      stall.position.set(sx, 1.2, sz);
      stall.rotation.y = -a;
      this.group.add(stall);
      const awn = new THREE.Mesh(
        new THREE.PlaneGeometry(4.6, 2.6),
        new THREE.MeshBasicMaterial({ map: awningTexture(rng), side: THREE.DoubleSide }),
      );
      awn.position.set(sx, 3.1, sz);
      awn.rotation.x = -Math.PI / 2 + 0.25;
      awn.rotation.z = -a;
      this.group.add(awn);
      this.buildingBoxes.push({
        minX: sx - 2.2, maxX: sx + 2.2, minZ: sz - 1.7, maxZ: sz + 1.7,
      });
    }
    // Benches facing the fountain.
    const benchMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
    for (const [bx, bz, ry] of [[-11, 0, 0], [11, 0, 0], [0, -11, Math.PI / 2], [0, 11, Math.PI / 2]]) {
      const bench = new THREE.Mesh(new THREE.BoxGeometry(3, 0.5, 1), benchMat);
      bench.position.set(cx + bx, 0.5, cz + bz);
      bench.rotation.y = ry;
      this.group.add(bench);
    }
  }

  buildPalm(x, z, rng) {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.35, 6, 6),
      new THREE.MeshLambertMaterial({ color: 0x6b4a2f }),
    );
    trunk.position.set(x, 3, z);
    trunk.rotation.z = range(rng, -0.12, 0.12);
    this.group.add(trunk);
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f7a3d });
    for (let i = 0; i < 6; i += 1) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.4, 4), leafMat);
      const a = (i / 6) * Math.PI * 2;
      leaf.position.set(x + Math.cos(a) * 1.1, 6.2, z + Math.sin(a) * 1.1);
      leaf.rotation.set(Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1);
      this.group.add(leaf);
    }
  }

  buildLamp(x, z) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.16, 7, 6),
      new THREE.MeshLambertMaterial({ color: 0x2a2d31 }),
    );
    pole.position.set(x, 3.5, z);
    this.group.add(pole);
    // Emissive-look bulb only: a real PointLight per lamp (~100 of them)
    // would crush software rendering. The sun + hemisphere carry the scene.
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd27a }),
    );
    bulb.position.set(x, 7.1, z);
    this.group.add(bulb);
  }

  buildHarbor() {
    // The sea to the east, a wooden pier, and moored boats.
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(260, 700),
      new THREE.MeshLambertMaterial({ color: PALETTE.water, emissive: 0x0a2e40, emissiveIntensity: 0.5 }),
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(300, -0.2, 0);
    this.group.add(sea);
    this.sea = sea;
    const pier = new THREE.Mesh(
      new THREE.BoxGeometry(26, 1, 60),
      new THREE.MeshLambertMaterial({ color: 0x6b4a2f }),
    );
    pier.position.set(168, 0.4, -138);
    this.group.add(pier);
    const rng = this.rng;
    for (let i = 0; i < 3; i += 1) {
      const boat = new THREE.Group();
      const hull = new THREE.Mesh(
        new THREE.BoxGeometry(4, 1.6, 12),
        new THREE.MeshLambertMaterial({ color: pick(rng, [0xd8d8d8, 0x3a6b8a, 0xb03a3a]) }),
      );
      hull.position.y = 0.4;
      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, 1.6, 4),
        new THREE.MeshLambertMaterial({ color: 0xf2f0ea }),
      );
      cabin.position.set(0, 1.8, -1);
      boat.add(hull, cabin);
      boat.position.set(196 + i * 14, 0, -160 + i * 26);
      boat.rotation.y = range(rng, -0.2, 0.2);
      this.group.add(boat);
    }
    // Big PIER 9 sign over the docks.
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 6.8),
      new THREE.MeshBasicMaterial({ map: signTexture('PIER 9', '#39d5ff', '#0a1626'), transparent: true }),
    );
    sign.position.set(150, 12, -138);
    sign.rotation.y = -Math.PI / 2;
    this.group.add(sign);
  }

  buildBeach() {
    // Sand strip + boardwalk along the east edge, between city and sea.
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 340),
      new THREE.MeshLambertMaterial({ color: 0xd8b878 }),
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(178, 0.02, 0);
    this.group.add(sand);
    const walk = new THREE.Mesh(
      new THREE.BoxGeometry(4, 0.3, 340),
      new THREE.MeshLambertMaterial({ color: 0x8a6a4a }),
    );
    walk.position.set(163, 0.15, 0);
    this.group.add(walk);
    const rng = this.rng;
    // Beach umbrellas in a row down the sand.
    for (let i = 0; i < 5; i += 1) {
      const z = -120 + i * 60;
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 2.6, 6),
        new THREE.MeshLambertMaterial({ color: 0xd8d8d8 }),
      );
      pole.position.set(182, 1.3, z);
      this.group.add(pole);
      const top = new THREE.Mesh(
        new THREE.ConeGeometry(2.4, 1, 8),
        new THREE.MeshLambertMaterial({ color: pick(rng, [0xff4fa3, 0x39d5ff, 0xffb454]) }),
      );
      top.position.set(182, 2.9, z);
      this.group.add(top);
    }
  }

  buildSky() {
    // Low sun disc + a few flat drifting clouds.
    const sun = new THREE.Mesh(
      new THREE.CircleGeometry(26, 32),
      new THREE.MeshBasicMaterial({ color: 0xffdf9e, fog: false }),
    );
    sun.position.set(-260, 130, -260);
    sun.lookAt(0, 40, 0);
    this.group.add(sun);
    const rng = this.rng;
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffe8d8, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 10; i += 1) {
      const cloud = new THREE.Group();
      for (let j = 0; j < 4; j += 1) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(range(rng, 6, 12), 8, 6), cloudMat);
        puff.position.set(j * 8 - 12, range(rng, -2, 2), range(rng, -4, 4));
        puff.scale.y = 0.45;
        cloud.add(puff);
      }
      cloud.position.set(range(rng, -260, 260), range(rng, 90, 140), range(rng, -260, 260));
      this.group.add(cloud);
    }
  }

  // Collision: true when a circle at (x,z) with radius r hits a building.
  collides(x, z, r) {
    for (const b of this.buildingBoxes) {
      if (x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ) return true;
    }
    return false;
  }

  // Slide along buildings: try x then z separately.
  moveWithCollision(pos, dx, dz, r) {
    if (!this.collides(pos.x + dx, pos.z, r)) pos.x += dx;
    if (!this.collides(pos.x, pos.z + dz, r)) pos.z += dz;
    const limit = (CONFIG.blocks * CONFIG.blockPitch) / 2 + 8;
    pos.x = Math.max(-limit, Math.min(limit, pos.x));
    pos.z = Math.max(-limit, Math.min(limit, pos.z));
  }

  // Is (x,z) on a road (within the road strip of some street)?
  onRoad(x, z) {
    const pitch = CONFIG.blockPitch;
    const half = (CONFIG.blocks * pitch) / 2;
    const w = CONFIG.roadWidth / 2 + 1;
    for (let i = 0; i <= CONFIG.blocks; i += 1) {
      const c = -half + i * pitch;
      if (Math.abs(x - c) < w || Math.abs(z - c) < w) return true;
    }
    return false;
  }

  // Nearest road centre coordinate on one axis.
  nearestRoadCoord(v) {
    const pitch = CONFIG.blockPitch;
    const half = (CONFIG.blocks * pitch) / 2;
    let best = -half;
    let bestD = Infinity;
    for (let i = 0; i <= CONFIG.blocks; i += 1) {
      const c = -half + i * pitch;
      const d = Math.abs(v - c);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }
}
