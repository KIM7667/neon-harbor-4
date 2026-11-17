// Rook — the player character on foot. Box-built with a jacket, a walk
// cycle, and a third-person camera that orbits on mouse drag.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { angleDiff } from './random.js';

export function makePlayerMesh() {
  const group = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0xd84a5a, emissive: 0x40101a, emissiveIntensity: 0.4 });
  const jeans = new THREE.MeshLambertMaterial({ color: 0x2a3a55 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98a5e });
  const hair = new THREE.MeshLambertMaterial({ color: 0x1a1210 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.95, 0.45), jacket);
  torso.position.y = 1.35;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin);
  head.position.y = 2.05;
  group.add(head);
  const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.46), hair);
  hairTop.position.y = 2.3;
  group.add(hairTop);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.85, 0.36), jeans);
  legL.position.set(-0.22, 0.45, 0);
  const legR = legL.clone();
  legR.position.x = 0.22;
  group.add(legL, legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.8, 0.28), jacket);
  armL.position.set(-0.56, 1.35, 0);
  const armR = armL.clone();
  armR.position.x = 0.56;
  group.add(armR);
  // Pistol in the right hand, visible when aiming/firing.
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.5), new THREE.MeshLambertMaterial({ color: 0x181818 }));
  gun.position.set(0.56, 1.0, 0.25);
  group.add(gun);
  group.userData = { legL, legR, armL, armR, gun, torso };
  return group;
}

export class Player {
  constructor(scene, city, spawn) {
    this.city = city;
    this.mesh = makePlayerMesh();
    this.mesh.position.set(spawn.x, 0, spawn.z);
    scene.add(this.mesh);
    this.pos = this.mesh.position;
    this.heading = Math.PI; // facing north into the city
    this.speed = 0;
    this.health = CONFIG.playerMaxHealth;
    this.cash = CONFIG.startCash;
    this.ammoMag = CONFIG.pistolMag;
    this.ammoReserve = 60;
    this.inCar = null;
    this.walkPhase = 0;
    this.dead = false;
    // Camera sits behind the player: opposite the facing direction.
    this.camYaw = this.heading + Math.PI;
    this.camPitch = 0.32;
    this.camDist = 9;
  }

  get x() { return this.pos.x; }
  get z() { return this.pos.z; }

  update(input, dt, camera) {
    if (this.dead) return;
    // Camera orbit from mouse drag.
    this.camYaw -= input.dragX * 0.005;
    this.camPitch = Math.max(0.05, Math.min(1.1, this.camPitch + input.dragY * 0.003));
    const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
    const speed = sprint ? CONFIG.sprintSpeed : CONFIG.walkSpeed;
    const fwd = input.axis('KeyS', 'KeyW');
    const strafe = input.axis('KeyA', 'KeyD');
    const moving = fwd !== 0 || strafe !== 0;
    if (moving) {
      // Movement is relative to the camera yaw.
      const fx = -Math.sin(this.camYaw);
      const fz = -Math.cos(this.camYaw);
      const rx = -fz;
      const rz = fx;
      let dx = fx * fwd + rx * strafe;
      let dz = fz * fwd + rz * strafe;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      this.city.moveWithCollision(this.pos, dx * speed * dt, dz * speed * dt, CONFIG.playerRadius);
      this.heading = Math.atan2(dx, dz);
      this.speed = speed;
      this.walkPhase += dt * speed * 1.6;
    } else {
      this.speed = 0;
    }
    this.mesh.rotation.y = this.heading;
    // Walk cycle: legs and arms swing.
    const swing = moving ? Math.sin(this.walkPhase) * 0.55 : 0;
    const ud = this.mesh.userData;
    ud.legL.rotation.x = swing;
    ud.legR.rotation.x = -swing;
    ud.armL.rotation.x = -swing * 0.8;
    ud.armR.rotation.x = swing * 0.8;
    ud.torso.position.y = 1.35 + (moving ? Math.abs(Math.sin(this.walkPhase)) * 0.05 : 0);
    // Camera: third person behind the player.
    const cx = this.pos.x + Math.sin(this.camYaw) * Math.cos(this.camPitch) * this.camDist;
    const cz = this.pos.z + Math.cos(this.camYaw) * Math.cos(this.camPitch) * this.camDist;
    const cy = 2.2 + Math.sin(this.camPitch) * this.camDist;
    camera.position.set(cx, cy, cz);
    camera.lookAt(this.pos.x, 1.6, this.pos.z);
  }

  // Camera for driving: behind the car, smoothed.
  updateCarCamera(car, dt, camera) {
    const targetYaw = car.heading + Math.PI;
    // Shortest-angle lerp of the camera yaw.
    this.camYaw += angleDiff(targetYaw, this.camYaw) * Math.min(1, dt * 3.2);
    const dist = 12.5;
    const height = 5.4;
    const cx = car.pos.x + Math.sin(this.camYaw) * dist;
    const cz = car.pos.z + Math.cos(this.camYaw) * dist;
    camera.position.set(cx, height, cz);
    camera.lookAt(car.pos.x, 1.4, car.pos.z);
  }

  enterCar(car) {
    this.inCar = car;
    car.stolen = true;
    car.parked = false;
    this.mesh.visible = false;
  }

  exitCar() {
    if (!this.inCar) return;
    const car = this.inCar;
    this.inCar = null;
    const f = car.forward();
    this.pos.set(car.pos.x - f.x * 3.2, 0, car.pos.z - f.z * 3.2);
    this.mesh.visible = true;
    this.heading = car.heading;
  }

  takeDamage(amount) {
    if (this.dead) return;
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
    }
  }

  heal(amount) {
    this.health = Math.min(CONFIG.playerMaxHealth, this.health + amount);
  }
}
