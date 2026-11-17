// Pedestrians: ordinary Harbor folk strolling the sidewalks, who flee
// when shots are fired or a car comes at them.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { makeRng, pick, range } from './random.js';

const SHIRTS = [0xe8e0d0, 0x4a7a8a, 0xc2a03a, 0x7a4a6b, 0x3a5a3a, 0x8a3a3a, 0xd8d8d8, 0x2a2a3a];
const PANTS = [0x2a3a55, 0x3a2a2a, 0x555555, 0x2a4a3a];

function makePedMesh(shirt, pants, skin) {
  const group = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.42), shirtMat);
  torso.position.y = 1.3;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skinMat);
  head.position.y = 2.0;
  group.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.85, 0.34), pantsMat);
  legL.position.set(-0.2, 0.42, 0);
  const legR = legL.clone();
  legR.position.x = 0.2;
  group.add(legL, legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.75, 0.26), shirtMat);
  armL.position.set(-0.52, 1.3, 0);
  const armR = armL.clone();
  armR.position.x = 0.52;
  group.add(armL, armR);
  group.userData = { legL, legR, armL, armR };
  return group;
}

export class Pedestrian {
  constructor(mesh, x, z) {
    this.mesh = mesh;
    this.pos = mesh.position;
    this.heading = 0;
    this.speed = 2.2;
    this.phase = Math.random() * 6;
    this.fleeing = false;
    this.fleeTimer = 0;
    this.target = null;
    this.panicked = false;
  }
  get x() { return this.pos.x; }
  get z() { return this.pos.z; }
}

export class PedestrianSystem {
  constructor(scene, city, seed) {
    this.scene = scene;
    this.city = city;
    this.rng = makeRng(seed + 21);
    this.peds = [];
    const pitch = CONFIG.blockPitch;
    const half = (CONFIG.blocks * pitch) / 2;
    for (let i = 0; i < CONFIG.pedestrians; i += 1) {
      const mesh = makePedMesh(
        pick(this.rng, SHIRTS), pick(this.rng, PANTS),
        pick(this.rng, [0xc98a5e, 0x8a5a3a, 0xe8b88a, 0x6b4530]),
      );
      const x = range(this.rng, -half, half);
      const z = range(this.rng, -half, half);
      mesh.position.set(x, 0, z);
      scene.add(mesh);
      const ped = new Pedestrian(mesh, x, z);
      ped.heading = range(this.rng, 0, Math.PI * 2);
      ped.speed = range(this.rng, 1.6, 3.0);
      ped.target = this.randomSidewalkPoint();
      this.peds.push(ped);
    }
  }

  randomSidewalkPoint() {
    const rng = this.rng;
    const pitch = CONFIG.blockPitch;
    const half = (CONFIG.blocks * pitch) / 2;
    const streets = [];
    for (let i = 0; i <= CONFIG.blocks; i += 1) streets.push(-half + i * pitch);
    const street = pick(rng, streets);
    const along = range(rng, -half + 8, half - 8);
    if (rng() < 0.5) return { x: along, z: street + (rng() < 0.5 ? 8.6 : -8.6) };
    return { x: street + (rng() < 0.5 ? 8.6 : -8.6), z: along };
  }

  scare(x, z, radius) {
    for (const ped of this.peds) {
      const d = Math.hypot(ped.pos.x - x, ped.pos.z - z);
      if (d < radius) {
        ped.fleeing = true;
        ped.fleeTimer = 4 + this.rng() * 2;
        ped.panicked = true;
      }
    }
  }

  update(dt, playerPos, playerCar) {
    for (const ped of this.peds) {
      if (ped.fleeing) {
        ped.fleeTimer -= dt;
        if (ped.fleeTimer <= 0) { ped.fleeing = false; ped.panicked = false; }
      }
      let tx, tz, speed;
      if (ped.fleeing) {
        // Run away from the player.
        const dx = ped.pos.x - playerPos.x;
        const dz = ped.pos.z - playerPos.z;
        const len = Math.hypot(dx, dz) || 1;
        tx = ped.pos.x + (dx / len) * 12;
        tz = ped.pos.z + (dz / len) * 12;
        speed = 6.5;
      } else {
        if (!ped.target || Math.hypot(ped.target.x - ped.pos.x, ped.target.z - ped.pos.z) < 2) {
          ped.target = this.randomSidewalkPoint();
        }
        tx = ped.target.x;
        tz = ped.target.z;
        speed = ped.speed;
      }
      const dx = tx - ped.pos.x;
      const dz = tz - ped.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.2) {
        const want = Math.atan2(dx, dz);
        let diff = want - ped.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        ped.heading += Math.max(-3 * dt, Math.min(3 * dt, diff));
        this.city.moveWithCollision(ped.pos, Math.sin(ped.heading) * speed * dt, Math.cos(ped.heading) * speed * dt, 0.5);
        ped.phase += dt * speed * 2.2;
      }
      ped.mesh.rotation.y = ped.heading;
      const swing = Math.sin(ped.phase) * (ped.fleeing ? 0.8 : 0.45);
      ped.mesh.userData.legL.rotation.x = swing;
      ped.mesh.userData.legR.rotation.x = -swing;
      ped.mesh.userData.armL.rotation.x = -swing * 0.7;
      ped.mesh.userData.armR.rotation.x = swing * 0.7;
      // A car ploughing through a ped knocks them down: they get up and flee.
      if (playerCar) {
        const d = Math.hypot(ped.pos.x - playerCar.pos.x, ped.pos.z - playerCar.pos.z);
        if (d < 2.6 && Math.abs(playerCar.speed) > 4) {
          ped.fleeing = true;
          ped.fleeTimer = 5;
          ped.panicked = true;
        }
      }
    }
  }

  nearest(x, z, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const ped of this.peds) {
      const d = Math.hypot(ped.pos.x - x, ped.pos.z - z);
      if (d < bestD) { bestD = d; best = ped; }
    }
    return best;
  }
}
