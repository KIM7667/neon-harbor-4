// Cars: a box-built car factory, arcade driving, traffic AI that cruises
// the road grid, parked cars the player can steal, and damage smoke for
// cars that have taken a beating.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { makeRng, pick, range } from './random.js';

const CAR_COLORS = [0xc23a3a, 0x3a6bc2, 0xd8a03a, 0x3a8a5a, 0xd8d8d8, 0x222222, 0x7a3ab0, 0x3ab0a0, 0xb03a6b, 0xe07a2a];
const CAR_NAMES = ['Sunbeam GT', 'Coyote Sedan', 'Marlin Coupe', 'Bison Pickup', 'Vortex Hatch', 'Regal Limo', 'Dune Buggy', 'Falcon Sport'];

export function makeCarMesh(color, kind) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.12 });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x18222e, emissive: 0x0a1420, emissiveIntensity: 0.5 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.75, 4.4), bodyMat);
  body.position.y = 0.65;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.65, 2.2), glassMat);
  cabin.position.set(0, 1.3, -0.2);
  group.add(cabin);
  if (kind === 'pickup') {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 1.6), new THREE.MeshLambertMaterial({ color: 0x2a2d31 }));
    bed.position.set(0, 1.05, 1.3);
    group.add(bed);
  }
  // Headlights and taillights.
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const sx of [-0.7, 0.7]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), headMat);
    head.position.set(sx, 0.7, 2.21);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), tailMat);
    tail.position.set(sx, 0.7, -2.21);
    group.add(tail);
  }
  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  group.userData.wheels = [];
  for (const [wx, wz] of [[-1.0, 1.35], [1.0, 1.35], [-1.0, -1.35], [1.0, -1.35]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.38, wz);
    group.add(wheel);
    group.userData.wheels.push(wheel);
  }
  group.userData.body = body;
  return group;
}

export class Car {
  constructor(mesh, opts) {
    this.mesh = mesh;
    this.pos = mesh.position;
    this.heading = opts.heading || 0;
    this.speed = 0;
    this.name = opts.name || 'Sedan';
    this.color = opts.color || 0x888888;
    this.kind = opts.kind || 'sedan';
    this.parked = !!opts.parked;
    this.traffic = !!opts.traffic;
    this.police = !!opts.police;
    this.stolen = false;
    this.wheelSpin = 0;
    this.damage = 0; // 0..100, smoke and handling suffer as it climbs
    this.smokeTimer = 0;
    // Traffic AI state.
    this.lane = opts.lane || 0;
    this.targetSpeed = opts.targetSpeed || 11;
    this.turnAt = null;
    this.brakeTimer = 0;
  }

  get x() { return this.pos.x; }
  get z() { return this.pos.z; }

  forward() {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  }
}

export class VehicleSystem {
  constructor(scene, city, seed) {
    this.scene = scene;
    this.city = city;
    this.rng = makeRng(seed + 7);
    this.cars = [];
    this.traffic = [];
    this.parked = [];
    this.smoke = [];
    this.spawnTraffic();
    this.spawnParked();
  }

  addCar(x, z, heading, opts) {
    const rng = this.rng;
    const color = opts.color ?? pick(rng, CAR_COLORS);
    const mesh = makeCarMesh(color, opts.kind || 'sedan');
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading;
    this.scene.add(mesh);
    const car = new Car(mesh, { ...opts, color, heading });
    this.cars.push(car);
    return car;
  }

  spawnTraffic() {
    const rng = this.rng;
    const pitch = CONFIG.blockPitch;
    const half = (CONFIG.blocks * pitch) / 2;
    const streets = [];
    for (let i = 0; i <= CONFIG.blocks; i += 1) streets.push(-half + i * pitch);
    for (let i = 0; i < CONFIG.trafficCars; i += 1) {
      const alongRoad = rng() < 0.5;
      const street = pick(rng, streets);
      const along = range(rng, -half + 10, half - 10);
      const lane = (rng() < 0.5 ? -3.4 : 3.4);
      const x = alongRoad ? along : street + lane;
      const z = alongRoad ? street + lane : along;
      const heading = alongRoad ? (lane < 0 ? Math.PI / 2 : -Math.PI / 2) : (lane < 0 ? Math.PI : 0);
      const car = this.addCar(x, z, heading, {
        traffic: true,
        kind: pick(rng, ['sedan', 'sedan', 'hatch', 'pickup']),
        name: pick(rng, CAR_NAMES),
        targetSpeed: range(rng, 8, 14),
      });
      car.speed = car.targetSpeed;
      this.traffic.push(car);
    }
  }

  spawnParked() {
    // Parked cars along the roads, stealable. One of them is the gold GT
    // for mission 2, parked by the marina.
    const spots = [
      [92, -46, 0, 0xd8a03a, 'Sunbeam GT', true],
      [30, -92, 1, 0xc23a3a, 'Falcon Sport', false],
      [-30, 46, 2, 0x3a6bc2, 'Coyote Sedan', false],
      [60, 92, 3, 0xd8d8d8, 'Regal Limo', false],
      [-92, -92, 0, 0x3a8a5a, 'Bison Pickup', false],
      [138, 46, 1, 0x7a3ab0, 'Vortex Hatch', false],
      [-46, -138, 2, 0xb03a6b, 'Marlin Coupe', false],
      [14, 138, 3, 0xe07a2a, 'Dune Buggy', false],
    ];
    for (const [x, z, dir, color, name, isMission] of spots) {
      const roadX = this.city.nearestRoadCoord(x);
      const roadZ = this.city.nearestRoadCoord(z);
      const onXRoad = Math.abs(x - roadX) < Math.abs(z - roadZ);
      const px = onXRoad ? x : roadX + 5.2;
      const pz = onXRoad ? roadZ + 5.2 : z;
      const heading = onXRoad ? (dir % 2 === 0 ? Math.PI / 2 : -Math.PI / 2) : (dir % 2 === 0 ? 0 : Math.PI);
      const car = this.addCar(px, pz, heading, { parked: true, color, name, kind: name === 'Bison Pickup' ? 'pickup' : 'sedan' });
      car.missionCar = isMission;
      this.parked.push(car);
    }
  }

  // Arcade driving: W/S accelerate/brake, A/D steer, Space handbrake.
  drive(car, input, dt) {
    const accelIn = input.axis('KeyS', 'KeyW');
    const steerIn = input.axis('KeyD', 'KeyA');
    const handbrake = input.down('Space');
    // A wrecked car loses top speed.
    const topSpeed = CONFIG.carMaxSpeed * (1 - Math.min(0.45, car.damage / 220));
    if (accelIn > 0) car.speed += CONFIG.carAccel * dt;
    else if (accelIn < 0) {
      car.speed -= (car.speed > 0.5 ? CONFIG.carBrake : CONFIG.carAccel * 0.6) * dt;
    } else {
      car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * dt);
    }
    if (handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 30 * dt);
    car.speed = Math.max(-CONFIG.carReverseSpeed, Math.min(topSpeed, car.speed));
    const steer = steerIn * CONFIG.carTurn * dt * (car.speed >= 0 ? 1 : -1) * Math.min(1, Math.abs(car.speed) / 8 + 0.25);
    car.heading += steer * Math.sign(car.speed || 1);
    const f = car.forward();
    const nx = car.pos.x + f.x * car.speed * dt;
    const nz = car.pos.z + f.z * car.speed * dt;
    if (!this.city.collides(nx, nz, 2.1)) {
      car.pos.x = nx;
      car.pos.z = nz;
    } else {
      if (Math.abs(car.speed) > 12) this.addDamage(car, 12);
      car.speed *= 0.35; // bump: lose speed, keep rolling
    }
    // Keep inside the city.
    const limit = (CONFIG.blocks * CONFIG.blockPitch) / 2 + 8;
    car.pos.x = Math.max(-limit, Math.min(limit, car.pos.x));
    car.pos.z = Math.max(-limit, Math.min(limit, car.pos.z));
    car.mesh.rotation.y = car.heading;
    car.wheelSpin += car.speed * dt * 2.4;
    for (const w of car.mesh.userData.wheels) w.rotation.x = car.wheelSpin;
    return Math.abs(car.speed);
  }

  addDamage(car, amount) {
    car.damage = Math.min(100, car.damage + amount);
  }

  // Smoke puffs from a damaged car, rising and fading.
  updateSmoke(dt) {
    for (const car of this.cars) {
      if (car.damage < 35 || this.smoke.length > 14) continue;
      car.smokeTimer -= dt;
      if (car.smokeTimer <= 0) {
        car.smokeTimer = 0.3;
        const puff = new THREE.Mesh(
          new THREE.SphereGeometry(0.38, 8, 6),
          new THREE.MeshBasicMaterial({ color: 0x777777, transparent: true, opacity: 0.4 }),
        );
        puff.position.set(car.pos.x, 1.6, car.pos.z);
        this.scene.add(puff);
        this.smoke.push({ mesh: puff, life: 0.9 });
      }
    }
    for (const s of [...this.smoke]) {
      s.life -= dt;
      s.mesh.position.y += dt * 2.0;
      s.mesh.scale.setScalar(1 + (0.9 - s.life) * 0.9);
      s.mesh.material.opacity = Math.max(0, s.life * 0.45);
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        this.smoke.splice(this.smoke.indexOf(s), 1);
      }
    }
  }

  // Traffic: cruise along the current street; at each intersection pick
  // a new direction; slow down when another car is right ahead.
  updateTraffic(dt, playerCar) {
    const pitch = CONFIG.blockPitch;
    const half = (CONFIG.blocks * pitch) / 2;
    for (const car of this.traffic) {
      if (car === playerCar) continue;
      // Car ahead? brake.
      let blocked = false;
      const f = car.forward();
      for (const other of this.cars) {
        if (other === car) continue;
        const dx = other.pos.x - car.pos.x;
        const dz = other.pos.z - car.pos.z;
        const ahead = dx * f.x + dz * f.z;
        const side = Math.abs(dx * f.z - dz * f.x);
        if (ahead > 0 && ahead < 9 && side < 2.4) { blocked = true; break; }
      }
      const target = blocked ? 0 : car.targetSpeed;
      car.speed += Math.sign(target - car.speed) * Math.min(Math.abs(target - car.speed), 10 * dt);
      const nx = car.pos.x + f.x * car.speed * dt;
      const nz = car.pos.z + f.z * car.speed * dt;
      car.pos.x = nx;
      car.pos.z = nz;
      car.mesh.rotation.y = car.heading;
      car.wheelSpin += car.speed * dt * 2.4;
      for (const w of car.mesh.userData.wheels) w.rotation.x = car.wheelSpin;
      // At an intersection, sometimes turn onto the crossing street.
      const rx = this.city.nearestRoadCoord(car.pos.x);
      const rz = this.city.nearestRoadCoord(car.pos.z);
      const nearX = Math.abs(car.pos.x - rx) < 1.2;
      const nearZ = Math.abs(car.pos.z - rz) < 1.2;
      if (nearX && nearZ && this.rng() < dt * 0.5) {
        const vertical = Math.abs(f.z) > 0.5;
        const lane = this.rng() < 0.5 ? -3.4 : 3.4;
        if (vertical) {
          car.heading = lane < 0 ? Math.PI / 2 : -Math.PI / 2;
          car.pos.x = rx + lane;
        } else {
          car.heading = lane < 0 ? Math.PI : 0;
          car.pos.z = rz + lane;
        }
      }
      // Wrap around the far edge so traffic never runs out.
      if (car.pos.x > half + 20) car.pos.x = -half - 20;
      if (car.pos.x < -half - 20) car.pos.x = half + 20;
      if (car.pos.z > half + 20) car.pos.z = -half - 20;
      if (car.pos.z < -half - 20) car.pos.z = half + 20;
    }
  }

  nearestParked(x, z, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of this.parked) {
      if (car.stolen) continue;
      const d = Math.hypot(car.pos.x - x, car.pos.z - z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  nearestCar(x, z, maxDist, exclude) {
    let best = null;
    let bestD = maxDist;
    for (const car of this.cars) {
      if (car === exclude || car.traffic) continue;
      const d = Math.hypot(car.pos.x - x, car.pos.z - z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }
}
