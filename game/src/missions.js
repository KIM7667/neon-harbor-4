// Story missions: four jobs for Mara Voss and Deke Rallo, each with
// steps the player walks or drives through. A glowing beacon marks the
// current target; completing a mission pays cash and saves the game.
import * as THREE from 'three';
import { MISSIONS } from './config.js';

function makeBeacon(color) {
  const group = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 2.6, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 30;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(3, 0.35, 8, 32),
    new THREE.MeshBasicMaterial({ color }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.4;
  const marker = new THREE.Mesh(
    new THREE.ConeGeometry(0.9, 2.2, 4),
    new THREE.MeshBasicMaterial({ color }),
  );
  marker.position.y = 5.5;
  marker.rotation.x = Math.PI;
  group.add(beam, ring, marker);
  group.userData = { beam, ring, marker };
  return group;
}

export class MissionSystem {
  constructor(scene) {
    this.scene = scene;
    this.activeIndex = 0; // 0-based into MISSIONS
    this.stepIndex = 0;
    this.stepProgress = 0;
    this.completed = 0;
    this.done = false;
    this.beacon = makeBeacon(0xffd27a);
    this.beacon.visible = false;
    scene.add(this.beacon);
    this.onMissionStart = null;
    this.onMissionComplete = null;
    this.onStepComplete = null;
    this.gangSpawned = false;
    this.startMission(0);
  }

  dispose() {
    this.scene.remove(this.beacon);
  }

  get current() { return MISSIONS[this.activeIndex]; }
  get step() { return this.current ? this.current.steps[this.stepIndex] : null; }

  startMission(i) {
    this.activeIndex = i;
    this.stepIndex = 0;
    this.stepProgress = 0;
    this.gangSpawned = false;
    if (this.onMissionStart) this.onMissionStart(MISSIONS[i]);
    this.placeBeacon();
  }

  placeBeacon() {
    const step = this.step;
    if (!step) { this.beacon.visible = false; return; }
    this.beacon.position.set(step.target[0], 0, step.target[2]);
    this.beacon.visible = true;
  }

  // Called every frame; returns 'step' when a step completes.
  update(dt, game) {
    if (this.done || !this.current) return null;
    const step = this.step;
    const p = game.player;
    const pos = p.inCar ? p.inCar.pos : p.pos;
    const d = Math.hypot(step.target[0] - pos.x, step.target[2] - pos.z);
    // Beacon pulse.
    this.beacon.userData.marker.rotation.y += dt * 2;
    this.beacon.userData.marker.position.y = 5.5 + Math.sin(performance.now() / 350) * 0.6;
    this.beacon.userData.ring.scale.setScalar(1 + Math.sin(performance.now() / 300) * 0.12);

    if (step.kind === 'goto' && d < 7) return this.completeStep(game);
    if (step.kind === 'clear' && this.stepProgress >= step.count) return this.completeStep(game);
    if (step.kind === 'escape') {
      if (d < 8 && game.police.wanted === 0) return this.completeStep(game);
    }
    if (step.kind === 'steal' && game.missionCarDelivered) return this.completeStep(game);
    return null;
  }

  // The E key interacts with the current step's target.
  interact(game) {
    if (this.done || !this.current) return false;
    const step = this.step;
    const p = game.player;
    const pos = p.inCar ? p.inCar.pos : p.pos;
    const d = Math.hypot(step.target[0] - pos.x, step.target[2] - pos.z);
    if (d > 9) return false;
    if (step.kind === 'grab') {
      this.completeStep(game);
      return true;
    }
    return false;
  }

  completeStep(game) {
    const step = this.step;
    if (this.onStepComplete) this.onStepComplete(step);
    this.stepIndex += 1;
    this.stepProgress = 0;
    if (this.stepIndex >= this.current.steps.length) {
      this.completeMission(game);
    } else {
      this.placeBeacon();
    }
    return 'step';
  }

  completeMission(game) {
    const mission = this.current;
    const reward = game.config.missionRewards[this.activeIndex];
    game.player.cash += reward;
    this.completed += 1;
    // Mark the story done BEFORE the completion handler runs: the
    // handler reads this.done to decide whether to show the finale.
    const isLast = this.activeIndex + 1 >= MISSIONS.length;
    if (isLast) {
      this.done = true;
      this.beacon.visible = false;
    }
    if (this.onMissionComplete) this.onMissionComplete(mission, reward);
    if (!isLast) this.startMission(this.activeIndex + 1);
  }

  // Mission 3: spawn the gang when the player reaches the plaza.
  maybeSpawnGang(game) {
    if (this.done || !this.current) return;
    if (this.current.id !== 3 || this.step.kind !== 'clear' || this.gangSpawned) return;
    const p = game.player;
    const d = Math.hypot(this.step.target[0] - p.pos.x, this.step.target[2] - p.pos.z);
    if (d < 30) {
      this.gangSpawned = true;
      game.combat.spawnGang(this.step.count, this.step.target[0], this.step.target[2]);
    }
  }

  // Mission 2: the gold GT counts once it is parked at the chop shop.
  checkStealDelivery(game) {
    if (this.done || !this.current || this.current.id !== 2) return;
    if (this.step.kind !== 'steal') return;
    const car = game.missionCar;
    if (!car || !car.stolen) return;
    const d = Math.hypot(-138 - car.pos.x, -46 - car.pos.z);
    const playerNear = Math.hypot(-138 - game.player.pos.x, -46 - game.player.pos.z) < 12;
    if (d < 8 && playerNear) {
      game.missionCarDelivered = true;
    }
  }

  statusText() {
    if (this.done) return 'All missions complete — Neon Harbor is yours, Rook.';
    const m = this.current;
    const s = this.step;
    let label = s.label;
    if (s.kind === 'clear') label = `Take down the Vipers (${this.stepProgress}/${s.count})`;
    return `M${m.id} · ${m.title} — ${label}`;
  }

  serialize() {
    return { activeIndex: this.activeIndex, stepIndex: this.stepIndex, completed: this.completed, done: this.done };
  }

  restore(data) {
    if (!data) return;
    this.completed = data.completed || 0;
    this.done = !!data.done;
    if (this.done) { this.beacon.visible = false; return; }
    this.activeIndex = data.activeIndex || 0;
    this.stepIndex = data.stepIndex || 0;
    this.gangSpawned = false;
    this.placeBeacon();
  }
}
