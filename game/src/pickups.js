// Pickups: ammo crates and a health kit scattered around the city.
// Walk or drive over one to grab it; it respawns after a while.
import * as THREE from 'three';
import { CONFIG } from './config.js';

function makeAmmoMesh() {
  const group = new THREE.Group();
  const crate = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.8, 1.1),
    new THREE.MeshLambertMaterial({ color: 0x3a6b3a, emissive: 0x0a2a0a, emissiveIntensity: 0.6 }),
  );
  crate.position.y = 0.4;
  group.add(crate);
  const lid = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.18, 1.2),
    new THREE.MeshLambertMaterial({ color: 0xd8a03a }),
  );
  lid.position.y = 0.9;
  group.add(lid);
  group.userData = { spin: group };
  return group;
}

function makeHealthMesh() {
  const group = new THREE.Group();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.9, 1.1),
    new THREE.MeshLambertMaterial({ color: 0xf2f0ea, emissive: 0x555555, emissiveIntensity: 0.3 }),
  );
  box.position.y = 0.45;
  group.add(box);
  const crossMat = new THREE.MeshBasicMaterial({ color: 0xff4040 });
  const v = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.7, 0.1), crossMat);
  v.position.set(0, 0.5, 0.56);
  const h = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 0.1), crossMat);
  h.position.set(0, 0.5, 0.56);
  group.add(v, h);
  return group;
}

export class PickupSystem {
  constructor(scene) {
    this.scene = scene;
    this.pickups = [];
    const defs = [
      { kind: 'ammo', x: 69, z: 115 },
      { kind: 'ammo', x: -69, z: -115 },
      { kind: 'ammo', x: 115, z: -69 },
      { kind: 'health', x: -132, z: 132 },
    ];
    for (const d of defs) {
      const mesh = d.kind === 'ammo' ? makeAmmoMesh() : makeHealthMesh();
      mesh.position.set(d.x, 0, d.z);
      scene.add(mesh);
      this.pickups.push({
        mesh, pos: mesh.position, kind: d.kind,
        taken: false, respawnTimer: 0, bobPhase: Math.random() * 6,
      });
    }
    this.onPickup = null;
  }

  // Put every pickup back for a fresh story run.
  reset() {
    for (const p of this.pickups) {
      p.taken = false;
      p.respawnTimer = 0;
      p.mesh.visible = true;
    }
  }

  update(dt, player, playerCar) {
    const px = playerCar ? playerCar.pos.x : player.pos.x;
    const pz = playerCar ? playerCar.pos.z : player.pos.z;
    for (const p of this.pickups) {
      if (p.taken) {
        p.respawnTimer -= dt;
        if (p.respawnTimer <= 0) {
          p.taken = false;
          p.mesh.visible = true;
        }
        continue;
      }
      p.bobPhase += dt * 2.4;
      p.mesh.rotation.y += dt * 1.2;
      p.mesh.position.y = 0.25 + Math.sin(p.bobPhase) * 0.15;
      const d = Math.hypot(p.pos.x - px, p.pos.z - pz);
      if (d < 3) {
        p.taken = true;
        p.respawnTimer = CONFIG.pickupRespawnSeconds;
        p.mesh.visible = false;
        if (this.onPickup) this.onPickup(p.kind);
      }
    }
  }
}
