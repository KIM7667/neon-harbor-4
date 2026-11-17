// Wanted level + Harbor PD. Crimes raise stars; police cars spawn and
// chase the player, ramming their car or hurting them on foot; officers
// shoot when the heat is high; at four stars a helicopter joins the hunt
// and circles overhead with a searchlight. Stars cool off when the player
// breaks line of sight and stays quiet.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { makeCarMesh } from './vehicles.js';
import { makeRng, range, angleDiff } from './random.js';

function makePoliceCarMesh() {
  const group = makeCarMesh(0x1a2a4a, 'sedan');
  // Light bar: red + blue beacons that flash.
  const red = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.18, 0.5),
    new THREE.MeshBasicMaterial({ color: 0xff2020 }),
  );
  red.position.set(-0.45, 1.75, -0.2);
  const blue = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.18, 0.5),
    new THREE.MeshBasicMaterial({ color: 0x2040ff }),
  );
  blue.position.set(0.45, 1.75, -0.2);
  group.add(red, blue);
  group.userData.redLight = red;
  group.userData.blueLight = blue;
  group.userData.redMat = red.material;
  group.userData.blueMat = blue.material;
  return group;
}

function makeOfficerMesh() {
  const group = new THREE.Group();
  const navy = new THREE.MeshLambertMaterial({ color: 0x1a2a4a });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98a5e });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.95, 0.45), navy);
  torso.position.y = 1.35;
  group.add(torso);
  const badge = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.2, 0.05),
    new THREE.MeshBasicMaterial({ color: 0xffd27a }),
  );
  badge.position.set(-0.2, 1.5, 0.24);
  group.add(badge);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin);
  head.position.y = 2.05;
  group.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.46), navy);
  cap.position.y = 2.28;
  group.add(cap);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.85, 0.36), navy);
  legL.position.set(-0.22, 0.45, 0);
  const legR = legL.clone();
  legR.position.x = 0.22;
  group.add(legL, legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.8, 0.28), navy);
  armL.position.set(-0.56, 1.35, 0);
  const armR = armL.clone();
  armR.position.x = 0.56;
  group.add(armR);
  group.userData = { legL, legR, armL, armR };
  return group;
}

function makeHeliMesh() {
  const group = new THREE.Group();
  const navy = new THREE.MeshLambertMaterial({ color: 0x1a2a4a, emissive: 0x0a1226, emissiveIntensity: 0.5 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 4.6), navy);
  group.add(body);
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 0.9, 1.2),
    new THREE.MeshLambertMaterial({ color: 0x18222e, emissive: 0x0a1420, emissiveIntensity: 0.6 }),
  );
  glass.position.set(0, 0.2, 2.0);
  group.add(glass);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 4.4), navy);
  tail.position.set(0, 0.3, -4.2);
  group.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.6, 1.0), navy);
  fin.position.set(0, 1.0, -6.0);
  group.add(fin);
  const skidMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  for (const sx of [-0.9, 0.9]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 4.0), skidMat);
    skid.position.set(sx, -1.1, 0.4);
    group.add(skid);
  }
  // Main rotor: two long blades that spin.
  const rotor = new THREE.Group();
  const bladeMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  for (const rz of [0, Math.PI / 2]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(11, 0.08, 0.5), bladeMat);
    blade.rotation.y = rz;
    rotor.add(blade);
  }
  rotor.position.y = 1.1;
  group.add(rotor);
  // Searchlight cone under the nose, aimed at the ground.
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(7, 34, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff6c0, transparent: true, opacity: 0.10, side: THREE.DoubleSide, depthWrite: false }),
  );
  cone.position.set(0, -17, 2.0);
  cone.rotation.x = Math.PI;
  group.add(cone);
  group.userData = { rotor, cone };
  return group;
}

export class PoliceSystem {
  constructor(scene, city, seed) {
    this.scene = scene;
    this.city = city;
    this.rng = makeRng(seed + 33);
    this.wanted = 0;
    this.heat = 0; // 0..100, crimes add, quiet time drains
    this.cooldownTimer = 0;
    this.cars = [];
    this.officers = [];
    this.heli = null; // {mesh, pos, angle, rotor}
    this.flashTimer = 0;
    this.onWantedChange = null;
    this.spawnTimer = 0;
    this.shotFreeze = false; // screenshot mode: hold the chase formation still
  }

  addHeat(amount, reason) {
    this.heat = Math.min(100, this.heat + amount);
    this.cooldownTimer = CONFIG.wantedDecaySeconds;
    const level = this.levelFromHeat();
    if (level > this.wanted) {
      this.wanted = level;
      if (this.onWantedChange) this.onWantedChange(this.wanted, reason);
    }
  }

  levelFromHeat() {
    if (this.heat <= 0) return 0;
    if (this.heat < 25) return 1;
    if (this.heat < 45) return 2;
    if (this.heat < 65) return 3;
    if (this.heat < 85) return 4;
    return 5;
  }

  clearWanted() {
    this.wanted = 0;
    this.heat = 0;
    this.despawnAll();
    if (this.onWantedChange) this.onWantedChange(0, 'clean');
  }

  despawnAll() {
    for (const car of this.cars) this.scene.remove(car.mesh);
    for (const off of this.officers) this.scene.remove(off.mesh);
    if (this.heli) this.scene.remove(this.heli.mesh);
    this.cars = [];
    this.officers = [];
    this.heli = null;
  }

  spawnPoliceCar(playerPos) {
    const angle = range(this.rng, 0, Math.PI * 2);
    const dist = range(this.rng, 55, 75);
    let x = playerPos.x + Math.cos(angle) * dist;
    let z = playerPos.z + Math.sin(angle) * dist;
    x = this.city.nearestRoadCoord(x);
    z = this.city.nearestRoadCoord(z);
    const mesh = makePoliceCarMesh();
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    const car = {
      mesh, pos: mesh.position, heading: 0, speed: 0, police: true, ramTimer: 0,
      flank: this.cars.length % 2 === 0 ? -1 : 1, // pull alongside left/right
      forward() { return { x: Math.sin(this.heading), z: Math.cos(this.heading) }; },
    };
    this.cars.push(car);
    return car;
  }

  spawnOfficer(playerPos) {
    const angle = range(this.rng, 0, Math.PI * 2);
    const mesh = makeOfficerMesh();
    mesh.position.set(playerPos.x + Math.cos(angle) * 14, 0, playerPos.z + Math.sin(angle) * 14);
    this.scene.add(mesh);
    const off = { mesh, pos: mesh.position, heading: 0, health: 60, shootTimer: 1.5, phase: 0 };
    this.officers.push(off);
    return off;
  }

  spawnHelicopter(playerPos) {
    const mesh = makeHeliMesh();
    mesh.position.set(playerPos.x + 30, 34, playerPos.z);
    this.scene.add(mesh);
    this.heli = { mesh, pos: mesh.position, angle: 0 };
    return this.heli;
  }

  // Helicopter: spawns at four stars, circles the player with its
  // searchlight, and leaves when the heat drops.
  updateHeli(dt, player) {
    if (this.wanted >= CONFIG.heliWanted && !this.heli) {
      this.spawnHelicopter(player.pos);
    } else if (this.wanted < CONFIG.heliWanted && this.heli) {
      this.scene.remove(this.heli.mesh);
      this.heli = null;
    }
    if (this.heli) {
      const h = this.heli;
      h.angle += dt * 0.35;
      h.pos.x = player.pos.x + Math.cos(h.angle) * 26;
      h.pos.z = player.pos.z + Math.sin(h.angle) * 26;
      h.pos.y = 34 + Math.sin(this.flashTimer * 1.3) * 1.5;
      h.mesh.rotation.y = Math.atan2(player.pos.x - h.pos.x, player.pos.z - h.pos.z);
      h.mesh.userData.rotor.rotation.y += dt * 22;
    }
  }

  update(dt, player, playerCar, onPlayerHit, onCarRam) {
    this.flashTimer += dt;
    const flashOn = Math.floor(this.flashTimer * 4) % 2 === 0;
    for (const car of this.cars) {
      car.mesh.userData.redMat.color.setHex(flashOn ? 0xff2020 : 0x550000);
      car.mesh.userData.blueMat.color.setHex(flashOn ? 0x101040 : 0x2040ff);
    }
    // Screenshot mode: hold the composed chase formation; only the
    // light bar flashes and the helicopter circles.
    if (this.shotFreeze) {
      this.updateHeli(dt, player);
      return;
    }
    // Cool off when quiet. The helicopter's eye slows the cooldown.
    if (this.wanted > 0) {
      this.cooldownTimer -= dt;
      if (this.cooldownTimer <= 0) {
        this.heat = Math.max(0, this.heat - 22 * dt * (this.heli ? 0.5 : 1));
        const level = this.levelFromHeat();
        if (level < this.wanted) {
          this.wanted = level;
          if (this.onWantedChange) this.onWantedChange(level, 'cooling');
          if (level === 0) this.despawnAll();
        }
      }
    }
    if (this.wanted === 0) return;
    // Keep the right number of units on the street.
    const wantCars = Math.min(this.wanted + 1, CONFIG.policeMaxCars);
    this.spawnTimer -= dt;
    if (this.cars.length < wantCars && this.spawnTimer <= 0) {
      this.spawnPoliceCar(player.pos);
      this.spawnTimer = 2.5;
    }
    if (this.wanted >= 3 && this.officers.length < this.wanted - 1 && this.spawnTimer <= 0) {
      this.spawnOfficer(player.pos);
      this.spawnTimer = 3;
    }
    this.updateHeli(dt, player);
    const target = playerCar || player;
    // The player's forward, for the flanking offset below.
    const tfx = playerCar ? playerCar.forward().x : Math.sin(player.heading);
    const tfz = playerCar ? playerCar.forward().z : Math.cos(player.heading);
    // Police cars chase and ram, pulling alongside the player instead of
    // just rear-ending: each unit aims at a point offset to its flank,
    // the offset shrinking as it closes in so it can still ram.
    for (const car of [...this.cars]) {
      const dx = target.pos.x - car.pos.x;
      const dz = target.pos.z - car.pos.z;
      const dist = Math.hypot(dx, dz);
      const sideBias = car.flank * 5 * Math.min(1, dist / 25);
      const aimX = target.pos.x + tfz * sideBias;
      const aimZ = target.pos.z - tfx * sideBias;
      const wantHeading = Math.atan2(aimX - car.pos.x, aimZ - car.pos.z);
      car.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, angleDiff(wantHeading, car.heading)));
      const topSpeed = 26 + this.wanted * 2.5;
      car.speed = Math.min(topSpeed, car.speed + 18 * dt);
      const f = car.forward();
      const nx = car.pos.x + f.x * car.speed * dt;
      const nz = car.pos.z + f.z * car.speed * dt;
      if (!this.city.collides(nx, nz, 2.1)) {
        car.pos.x = nx;
        car.pos.z = nz;
      } else {
        car.speed *= 0.5;
        car.heading += 0.6;
      }
      car.mesh.rotation.y = car.heading;
      // Ram! Once per second per unit: shove the player's car, dent it,
      // and call the ram callback. Between rams the police car just
      // pushes alongside instead of draining speed every frame.
      car.ramTimer -= dt;
      if (dist < 4.6) {
        if (playerCar) {
          // Car ram: once per second per unit.
          if (car.ramTimer <= 0) {
            car.ramTimer = 1.0;
            playerCar.speed *= 0.55;
            if (onCarRam) onCarRam();
            car.speed *= 0.4;
          }
        } else if (onPlayerHit) {
          // On foot, contact hurts continuously.
          onPlayerHit(CONFIG.policeRamDamage * dt * 4);
        }
      }
      // Too far away for too long: despawn and respawn closer.
      if (dist > 160) {
        this.scene.remove(car.mesh);
        this.cars.splice(this.cars.indexOf(car), 1);
      }
    }
    // Officers on foot: close in and shoot at wanted >= 2.
    for (const off of [...this.officers]) {
      const dx = player.pos.x - off.pos.x;
      const dz = player.pos.z - off.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 120) {
        this.scene.remove(off.mesh);
        this.officers.splice(this.officers.indexOf(off), 1);
        continue;
      }
      off.heading = Math.atan2(dx, dz);
      off.mesh.rotation.y = off.heading;
      if (dist > 9) {
        this.city.moveWithCollision(off.pos, Math.sin(off.heading) * 7 * dt, Math.cos(off.heading) * 7 * dt, 0.5);
        off.phase += dt * 9;
        off.mesh.userData.legL.rotation.x = Math.sin(off.phase) * 0.6;
        off.mesh.userData.legR.rotation.x = -Math.sin(off.phase) * 0.6;
      } else if (this.wanted >= 2) {
        off.shootTimer -= dt;
        if (off.shootTimer <= 0) {
          off.shootTimer = 1.1 + this.rng() * 0.7;
          if (onPlayerHit && this.rng() < 0.55) onPlayerHit(7);
        }
      }
    }
  }

  // Officers are shootable targets too.
  damageOfficer(off, amount) {
    off.health -= amount;
    return off.health <= 0;
  }

  removeOfficer(off) {
    this.scene.remove(off.mesh);
    this.officers.splice(this.officers.indexOf(off), 1);
  }
}
