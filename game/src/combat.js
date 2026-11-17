// Combat: the player's pistol, tracer shots, muzzle flash, and the
// Viper gang shooters who guard Coral Plaza in mission 3.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { makeRng, range } from './random.js';

function makeGangMesh() {
  const group = new THREE.Group();
  const vest = new THREE.MeshLambertMaterial({ color: 0x3a2a1a, emissive: 0x201404, emissiveIntensity: 0.4 });
  const skin = new THREE.MeshLambertMaterial({ color: 0x8a5a3a });
  const bandana = new THREE.MeshLambertMaterial({ color: 0xb02020 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.95, 0.48), vest);
  torso.position.y = 1.35;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin);
  head.position.y = 2.05;
  group.add(head);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.46), bandana);
  band.position.y = 2.22;
  group.add(band);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.85, 0.36), new THREE.MeshLambertMaterial({ color: 0x2a2a2a }));
  legL.position.set(-0.22, 0.45, 0);
  const legR = legL.clone();
  legR.position.x = 0.22;
  group.add(legL, legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.8, 0.28), vest);
  armL.position.set(-0.56, 1.35, 0);
  const armR = armL.clone();
  armR.position.x = 0.56;
  group.add(armR);
  // Health bar floating above the head.
  const barBg = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 0.14),
    new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.85 }),
  );
  barBg.position.y = 2.65;
  const barFg = new THREE.Mesh(
    new THREE.PlaneGeometry(1.14, 0.1),
    new THREE.MeshBasicMaterial({ color: 0xff4040 }),
  );
  barFg.position.set(0, 2.65, 0.01);
  group.add(barBg, barFg);
  group.userData = { legL, legR, armL, armR, barFg };
  return group;
}

export class CombatSystem {
  constructor(scene, city, seed) {
    this.scene = scene;
    this.city = city;
    this.rng = makeRng(seed + 55);
    this.enemies = [];
    this.tracers = [];
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = CONFIG.pistolRange;
    this.onEnemyDown = null;
    this.onShotFired = null;
  }

  spawnGang(count, centerX, centerZ) {
    for (let i = 0; i < count; i += 1) {
      const mesh = makeGangMesh();
      const angle = (i / count) * Math.PI * 2 + range(this.rng, -0.4, 0.4);
      const r = range(this.rng, 6, 14);
      mesh.position.set(centerX + Math.cos(angle) * r, 0, centerZ + Math.sin(angle) * r);
      this.scene.add(mesh);
      this.enemies.push({
        mesh, pos: mesh.position, heading: angle, health: CONFIG.enemyHealth,
        shootTimer: 1 + this.rng(), phase: 0, strafeDir: this.rng() < 0.5 ? 1 : -1,
      });
    }
  }

  clearEnemies() {
    for (const e of this.enemies) this.scene.remove(e.mesh);
    this.enemies = [];
  }

  // Fire from the camera through the crosshair. Returns what was hit.
  shoot(camera, player, police) {
    if (player.ammoMag <= 0) return { hit: 'empty' };
    player.ammoMag -= 1;
    if (this.onShotFired) this.onShotFired();
    this.raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    const targets = [];
    for (const e of this.enemies) targets.push({ mesh: e.mesh, kind: 'enemy', ref: e });
    for (const off of police.officers) targets.push({ mesh: off.mesh, kind: 'officer', ref: off });
    const hits = this.raycaster.intersectObjects(targets.map((t) => t.mesh), true);
    if (!hits.length) {
      this.spawnTracer(camera);
      return { hit: 'miss' };
    }
    // Walk up to the grouped root to find which target it belongs to.
    let obj = hits[0].object;
    while (obj.parent && obj.parent !== this.scene) obj = obj.parent;
    const target = targets.find((t) => t.mesh === obj);
    this.spawnTracer(camera, hits[0].point);
    if (!target) return { hit: 'world' };
    if (target.kind === 'enemy') {
      target.ref.health -= CONFIG.pistolDamage;
      target.ref.mesh.userData.barFg.scale.x = Math.max(0.01, target.ref.health / CONFIG.enemyHealth);
      if (target.ref.health <= 0) {
        this.scene.remove(target.ref.mesh);
        this.enemies.splice(this.enemies.indexOf(target.ref), 1);
        if (this.onEnemyDown) this.onEnemyDown(target.ref);
        return { hit: 'kill', kind: 'enemy' };
      }
      return { hit: 'hit', kind: 'enemy' };
    }
    const dead = police.damageOfficer(target.ref, CONFIG.pistolDamage);
    if (dead) {
      police.removeOfficer(target.ref);
      return { hit: 'kill', kind: 'officer' };
    }
    return { hit: 'hit', kind: 'officer' };
  }

  spawnTracer(camera, endPoint) {
    const start = new THREE.Vector3();
    camera.getWorldPosition(start);
    start.y -= 0.3;
    const end = endPoint ? endPoint.clone() : start.clone().add(
      new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).multiplyScalar(CONFIG.pistolRange),
    );
    const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9 }));
    this.scene.add(line);
    this.tracers.push({ line, life: 0.09 });
    // Muzzle flash: a quick bright sprite at the gun.
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0.95 }),
    );
    flash.position.copy(start).add(new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).multiplyScalar(1.2));
    this.scene.add(flash);
    this.tracers.push({ line: flash, life: 0.06, isMesh: true });
  }

  update(dt, player, police, onPlayerHit) {
    // Tracer fade.
    for (const t of [...this.tracers]) {
      t.life -= dt;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        this.tracers.splice(this.tracers.indexOf(t), 1);
      }
    }
    // Enemies: strafe, keep distance, shoot at the player.
    for (const e of this.enemies) {
      const dx = player.pos.x - e.pos.x;
      const dz = player.pos.z - e.pos.z;
      const dist = Math.hypot(dx, dz);
      e.heading = Math.atan2(dx, dz);
      e.mesh.rotation.y = e.heading;
      if (dist > 16) {
        this.city.moveWithCollision(e.pos, Math.sin(e.heading) * 4.5 * dt, Math.cos(e.heading) * 4.5 * dt, 0.5);
        e.phase += dt * 8;
      } else if (dist < 7) {
        this.city.moveWithCollision(e.pos, -Math.sin(e.heading) * 3 * dt, -Math.cos(e.heading) * 3 * dt, 0.5);
      } else {
        // Strafe sideways so they are not standing targets.
        const sx = Math.cos(e.heading) * e.strafeDir;
        const sz = -Math.sin(e.heading) * e.strafeDir;
        this.city.moveWithCollision(e.pos, sx * 2.5 * dt, sz * 2.5 * dt, 0.5);
        if (this.rng() < dt * 0.4) e.strafeDir *= -1;
      }
      e.mesh.userData.legL.rotation.x = Math.sin(e.phase) * 0.5;
      e.mesh.userData.legR.rotation.x = -Math.sin(e.phase) * 0.5;
      e.mesh.userData.barFg.lookAt(player.pos.x, e.pos.y + 2.65, player.pos.z);
      e.shootTimer -= dt;
      if (e.shootTimer <= 0 && dist < 42) {
        e.shootTimer = 1.2 + this.rng() * 0.9;
        if (onPlayerHit && this.rng() < 0.5) onPlayerHit(6);
      }
    }
  }
}
