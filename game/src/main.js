// NEON HARBOR — main loop and game orchestration.
// Boots the renderer, wires every system together, and runs the state
// machine: menu -> playing -> paused / dead / complete.
import * as THREE from 'three';
import { CONFIG, MISSIONS } from './config.js';
import { City } from './city.js';
import { Player } from './player.js';
import { VehicleSystem } from './vehicles.js';
import { PedestrianSystem } from './pedestrians.js';
import { PoliceSystem } from './police.js';
import { CombatSystem } from './combat.js';
import { PickupSystem } from './pickups.js';
import { MissionSystem } from './missions.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { saveGame, loadGame, hasSave, clearSave } from './save.js';
import { applyShotMode } from './shots.js';

const params = new URLSearchParams(window.location.search);
const seed = Number(params.get('seed') || '1');
const shotMode = params.get('shot');

export class Game {
  constructor() {
    this.config = CONFIG;
    this.state = 'menu';
    this.clockSeconds = 0;
    this.shotCamera = null;
    this.missionCarDelivered = false;
    this.missionCar = null;
    this.playTime = 0;
    this.kills = 0;
    this.carsStolen = 0;
    this.pedHitCooldown = new Map();
    this.lastCrashSound = 0;
    this.lastRamDamage = 0;
    this.shotDrive = false; // shot modes hold the throttle so the car keeps rolling
    this.shotCruiseSpeed = 24; // speed the shot-mode throttle holds

    const container = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
    this.camera.position.set(0, 40, 60);

    this.input = new Input(this.renderer.domElement);
    this.audio = new AudioEngine();
    this.city = new City(this.scene, seed);
    this.player = new Player(this.scene, this.city, { x: -14, z: 92 });
    this.vehicles = new VehicleSystem(this.scene, this.city, seed);
    this.peds = new PedestrianSystem(this.scene, this.city, seed);
    this.police = new PoliceSystem(this.scene, this.city, seed);
    this.combat = new CombatSystem(this.scene, this.city, seed);
    this.pickups = new PickupSystem(this.scene);
    this.missions = new MissionSystem(this.scene);
    this.hud = new HUD();
    this.missionCar = this.vehicles.parked.find((c) => c.missionCar) || null;

    this.wireEvents();
    this.wireMissionEvents();
    this.bindButtons();

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Exposed for headless tests and the screenshot modes.
    window.__game = this;
    window.__shotReady = false;

    if (shotMode) {
      applyShotMode(this, shotMode);
    } else {
      this.showStartScreen();
    }
    this.lastTime = performance.now();
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  wireEvents() {
    this.police.onWantedChange = (level, reason) => {
      this.hud.stars(level);
      this.audio.setSiren(level > 0);
      if (level > 0) {
        this.audio.wantedUp();
        const labels = {
          steal: 'Grand theft auto — the PD is coming!',
          shot: 'Shots fired — the PD is coming!',
          ped: 'You hit a pedestrian!',
          kill: 'Officer down — every unit is coming!',
        };
        this.hud.feed(labels[reason] || `Wanted level ${level}`, 'danger');
        this.hud.banner(`WANTED — ${'★'.repeat(level)}`, 'Lose the cops: break line of sight and stay quiet.', 2600);
      } else if (reason === 'cooling' || reason === 'clean') {
        this.hud.feed('You lost the cops. Heat is off.', 'good');
      }
    };
    this.combat.onShotFired = () => {
      this.audio.gunshot();
      this.police.addHeat(6, 'shot');
      this.peds.scare(this.player.pos.x, this.player.pos.z, 40);
    };
    this.combat.onEnemyDown = (enemy) => {
      this.kills += 1;
      this.audio.hit();
      this.hud.feed('Viper down.', 'good');
      if (this.missions.current && this.missions.current.id === 3 && this.missions.step.kind === 'clear') {
        this.missions.stepProgress += 1;
      }
    };
    this.pickups.onPickup = (kind) => {
      if (kind === 'ammo') {
        this.player.ammoReserve = Math.min(CONFIG.pistolReserveMax, this.player.ammoReserve + CONFIG.ammoPickupAmount);
        this.audio.pickup();
        this.hud.feed(`Ammo crate: +${CONFIG.ammoPickupAmount} rounds.`, 'good');
      } else {
        this.player.heal(CONFIG.healthPickupAmount);
        this.audio.heal();
        this.hud.feed(`First-aid kit: +${CONFIG.healthPickupAmount} health.`, 'good');
      }
    };
  }

  wireMissionEvents() {
    this.missions.onMissionStart = (m) => {
      this.audio.missionStart();
      this.hud.banner(`${m.title}`, `${m.giver}: ${m.brief}`, 4200);
      this.hud.feed(`New mission: ${m.title} — ${m.giver}`, 'info');
    };
    this.missions.onStepComplete = (step) => {
      this.audio.pickup();
      this.hud.feed(`Done: ${step.label}`, 'good');
    };
    this.missions.onMissionComplete = (m, reward) => {
      this.audio.missionDone();
      this.audio.cash();
      this.player.ammoReserve = Math.min(CONFIG.pistolReserveMax, this.player.ammoReserve + 60);
      this.hud.banner('MISSION COMPLETE', `${m.title} — +$${reward}`, 3800);
      this.hud.feed(`Mission complete: ${m.title} (+$${reward})`, 'good');
      saveGame(this);
      if (this.missions.done) {
        this.state = 'complete';
        document.getElementById('complete-overlay').hidden = false;
        document.getElementById('complete-stats').textContent =
          `Cash $${Math.floor(this.player.cash).toLocaleString('en-US')} · ${this.kills} takedowns · ${this.carsStolen} cars stolen · ${this.playTime.toFixed(0)}s on the street`;
      }
    };
  }

  bindButtons() {
    const $ = (id) => document.getElementById(id);
    $('btn-new').addEventListener('click', () => {
      clearSave();
      this.audio.unlock();
      this.audio.click();
      this.resetNewGame();
      this.startPlaying();
    });
    $('btn-continue').addEventListener('click', () => {
      this.audio.unlock();
      this.audio.click();
      this.loadSavedGame();
      this.startPlaying();
    });
    $('btn-resume').addEventListener('click', () => { this.audio.click(); this.startPlaying(); });
    $('btn-save').addEventListener('click', () => {
      this.audio.click();
      const ok = saveGame(this);
      this.hud.feed(ok ? 'Game saved.' : 'Save failed (storage blocked).', ok ? 'good' : 'danger');
    });
    $('btn-restart').addEventListener('click', () => {
      this.audio.click();
      this.resetNewGame();
      this.startPlaying();
    });
    $('btn-respawn').addEventListener('click', () => {
      this.audio.click();
      this.respawn();
    });
    $('btn-freeroam').addEventListener('click', () => {
      this.audio.click();
      $('complete-overlay').hidden = true;
      this.state = 'playing';
    });
    $('btn-quit-menu').addEventListener('click', () => {
      this.audio.click();
      $('pause-overlay').hidden = true;
      this.showStartScreen();
    });
    if (hasSave()) $('btn-continue').hidden = false;
  }

  showStartScreen() {
    this.state = 'menu';
    document.getElementById('start-overlay').hidden = false;
    document.getElementById('pause-overlay').hidden = true;
    document.getElementById('hud').style.display = 'none';
    document.getElementById('btn-continue').hidden = !hasSave();
  }

  startPlaying() {
    this.state = 'playing';
    document.getElementById('start-overlay').hidden = true;
    document.getElementById('pause-overlay').hidden = true;
    document.getElementById('dead-overlay').hidden = true;
    document.getElementById('complete-overlay').hidden = true;
    document.getElementById('hud').style.display = 'block';
    this.audio.unlock();
    this.audio.resume();
    this.refreshObjective();
  }

  resetNewGame() {
    const p = this.player;
    p.pos.set(-14, 0, 92);
    p.heading = Math.PI;
    p.health = CONFIG.playerMaxHealth;
    p.cash = CONFIG.startCash;
    p.ammoMag = CONFIG.pistolMag;
    p.ammoReserve = 60;
    p.dead = false;
    p.mesh.visible = true;
    if (p.inCar) p.inCar = null;
    this.police.clearWanted();
    this.combat.clearEnemies();
    this.pickups.reset();
    this.missionCarDelivered = false;
    this.missions.dispose();
    this.missions = new MissionSystem(this.scene);
    this.wireMissionEvents();
    this.missions.onMissionStart(MISSIONS[0]);
    this.clockSeconds = 0;
    this.kills = 0;
    this.carsStolen = 0;
    this.refreshObjective();
  }

  loadSavedGame() {
    const data = loadGame();
    if (!data) { this.resetNewGame(); return; }
    const p = this.player;
    p.pos.set(data.x, 0, data.z);
    p.heading = data.heading;
    p.cash = data.cash;
    p.health = data.health;
    p.ammoMag = data.ammoMag;
    p.ammoReserve = data.ammoReserve;
    p.dead = false;
    p.mesh.visible = true;
    this.clockSeconds = data.clock || 0;
    this.police.clearWanted();
    this.combat.clearEnemies();
    this.missions.restore(data.missions);
    this.hud.feed('Save loaded. Welcome back, Rook.', 'good');
    this.refreshObjective();
  }

  respawn() {
    const p = this.player;
    p.health = CONFIG.playerMaxHealth;
    p.cash = Math.max(0, p.cash - 100);
    p.dead = false;
    p.mesh.visible = true;
    if (p.inCar) { p.inCar = null; }
    p.pos.set(-138, 0, 138); // the safehouse
    p.heading = 0;
    this.police.clearWanted();
    this.combat.clearEnemies();
    document.getElementById('dead-overlay').hidden = true;
    this.hud.feed('You woke up at the safehouse. The hospital kept $100.', 'info');
    this.startPlaying();
  }

  refreshObjective() {
    const m = this.missions.current;
    if (!m) { this.hud.objective('NEON HARBOR', 'Free roam — the city is yours.'); return; }
    this.hud.objective(`M${m.id} · ${m.title}`, this.missions.statusText());
  }

  reload() {
    const p = this.player;
    if (p.ammoMag >= CONFIG.pistolMag || p.ammoReserve <= 0) return;
    const need = CONFIG.pistolMag - p.ammoMag;
    const take = Math.min(need, p.ammoReserve);
    p.ammoMag += take;
    p.ammoReserve -= take;
    this.audio.click();
  }

  tryEnterCar() {
    const p = this.player;
    const car = this.vehicles.nearestParked(p.pos.x, p.pos.z, 5.5)
      || this.vehicles.nearestCar(p.pos.x, p.pos.z, 5.5, null);
    if (!car) return false;
    this.audio.doorSlam();
    p.enterCar(car);
    this.carsStolen += 1;
    if (!car.wasDriven) {
      car.wasDriven = true;
      this.police.addHeat(20, 'steal');
      this.hud.feed(`You stole the ${car.name}.`, 'danger');
      if (car.missionCar) this.hud.feed('That is the gold GT Mara wants.', 'info');
    } else {
      this.hud.feed(`You got into the ${car.name}.`, 'info');
    }
    return true;
  }

  frame(now) {
    const dt = Math.min(0.05, (now - this.lastTime) / 1000 || 0.016);
    this.lastTime = now;
    const input = this.input;

    if (this.state === 'menu') {
      if (this.shotCamera) {
        // Screenshot mode: hold the composed frame.
        this.camera.position.set(...this.shotCamera.pos);
        this.camera.lookAt(...this.shotCamera.look);
      } else {
        // Slow cinematic orbit behind the start screen.
        const t = now / 1000;
        const cx = Math.sin(t * 0.05) * 120;
        const cz = Math.cos(t * 0.05) * 120;
        this.camera.position.set(cx, 42, cz);
        this.camera.lookAt(0, 6, 0);
      }
      this.city.update(dt, now / 1000);
      this.vehicles.updateTraffic(dt, null);
      this.peds.update(dt, this.player.pos, null);
      this.renderer.render(this.scene, this.camera);
      input.endFrame();
      return;
    }

    if (this.state === 'paused') {
      // Esc resumes from pause too.
      if (input.hit('Escape') || input.hit('KeyP')) this.startPlaying();
      this.renderer.render(this.scene, this.camera);
      input.endFrame();
      return;
    }

    if (this.state === 'playing') {
      this.playTime += dt;
      this.clockSeconds += dt * 180; // a full day in 8 minutes
      const p = this.player;

      if (input.hit('Escape') || input.hit('KeyP')) {
        this.state = 'paused';
        document.getElementById('pause-overlay').hidden = false;
        this.audio.suspend();
        input.endFrame();
        this.renderer.render(this.scene, this.camera);
        return;
      }
      if (input.hit('KeyM')) {
        this.audio.musicOn = !this.audio.musicOn;
        this.hud.feed(this.audio.musicOn ? 'Music on.' : 'Music off.', 'info');
      }
      if (input.hit('KeyR')) this.reload();

      if (p.inCar) {
        // Local copy: exiting the car mid-frame (F) must not null the
        // reference the rest of this branch still uses.
        const car = p.inCar;
        // Shot modes hold the throttle down (up to the cruise speed) so
        // the car keeps rolling while the screenshot settles.
        const driveInput = this.shotDrive
          ? { axis: (neg, pos) => (pos === 'KeyW' && car.speed < this.shotCruiseSpeed ? 1 : 0), down: () => false }
          : input;
        const speed = this.vehicles.drive(car, driveInput, dt);
        p.updateCarCamera(car, dt, this.camera);
        this.audio.setEngine(Math.abs(speed) / CONFIG.carMaxSpeed, true);
        if (input.hit('KeyF')) {
          this.audio.doorSlam();
          p.exitCar();
        }
        // Hitting pedestrians in a car is a crime.
        for (const ped of this.peds.peds) {
          const d = Math.hypot(ped.pos.x - car.pos.x, ped.pos.z - car.pos.z);
          if (d < 2.6 && Math.abs(car.speed) > 8) {
            const last = this.pedHitCooldown.get(ped) || 0;
            if (now - last > 2000) {
              this.pedHitCooldown.set(ped, now);
              this.police.addHeat(15, 'ped');
              this.peds.scare(ped.pos.x, ped.pos.z, 30);
            }
          }
        }
        // Bumping traffic cars shoves them out of the way instead of
        // grinding both cars to a halt.
        for (const other of this.vehicles.traffic) {
          const d = Math.hypot(other.pos.x - car.pos.x, other.pos.z - car.pos.z);
          if (d < 4.2 && d > 0.01) {
            other.speed = Math.max(other.speed, Math.abs(car.speed) * 0.75);
            car.speed *= 0.88;
          }
        }
      } else {
        p.update(input, dt, this.camera);
        this.audio.setEngine(0, false);
        if (input.hit('KeyE')) {
          if (!this.missions.interact(this)) this.tryEnterCar();
          this.refreshObjective();
        }
        if (input.mouseClicked) {
          const result = this.combat.shoot(this.camera, p, this.police);
          if (result.hit === 'empty') {
            if (p.ammoReserve > 0) this.reload();
            else { this.audio.denied(); this.hud.feed('Out of ammo — finish a mission to restock.', 'danger'); }
          } else if (result.hit === 'kill' && result.kind === 'officer') {
            this.police.addHeat(25, 'kill');
          }
          this.refreshObjective();
        }
      }

      this.city.update(dt, now / 1000);
      this.vehicles.updateTraffic(dt, p.inCar);
      this.vehicles.updateSmoke(dt);
      this.peds.update(dt, p.pos, p.inCar);
      this.pickups.update(dt, p, p.inCar);
      this.police.update(dt, p, p.inCar,
        (dmg) => { p.takeDamage(dmg); },
        () => {
          // Rammed by a police car: dent the car (throttled) + crash sound.
          if (p.inCar && now - this.lastRamDamage > 500) {
            this.lastRamDamage = now;
            this.vehicles.addDamage(p.inCar, 8);
          }
          if (now - this.lastCrashSound > 900) {
            this.lastCrashSound = now;
            this.audio.crash();
          }
        },
      );
      this.combat.update(dt, p, this.police, (dmg) => { p.takeDamage(dmg); });
      this.missions.maybeSpawnGang(this);
      this.missions.checkStealDelivery(this);
      const ev = this.missions.update(dt, this);
      if (ev) this.refreshObjective();

      if (p.dead) {
        this.state = 'dead';
        document.getElementById('dead-overlay').hidden = false;
        this.audio.setSiren(false);
        this.audio.setEngine(0, false);
      }

      // HUD refresh.
      this.hud.cash(p.cash);
      this.hud.health(p.health);
      this.hud.stars(this.police.wanted);
      this.hud.heat(this.police.heat);
      document.getElementById('ammo-line').textContent =
        `P9 PISTOL · ${p.ammoMag} / ${p.ammoReserve}`;
      this.hud.clock(this.clockSeconds);
      this.hud.speed(p.inCar ? Math.abs(p.inCar.speed) * 3.6 : 0, !!p.inCar);
      this.hud.crosshair(!p.inCar);
      this.hud.drawMinimap(this);
      const nearCar = !p.inCar && this.vehicles.nearestParked(p.pos.x, p.pos.z, 5.5);
      const step = this.missions.step;
      let hint = '';
      if (nearCar) hint = `E — steal the ${nearCar.name}`;
      else if (step && step.kind === 'grab') {
        const d = Math.hypot(step.target[0] - p.pos.x, step.target[2] - p.pos.z);
        if (d < 9) hint = 'E — pick it up';
      } else if (p.inCar) hint = 'F — get out · Space — handbrake';
      else hint = 'WASD — move · E — enter car · Click — shoot · R — reload';
      this.hud.hint(hint);
    }

    if (this.shotCamera) {
      this.camera.position.set(...this.shotCamera.pos);
      this.camera.lookAt(...this.shotCamera.look);
    }
    this.renderer.render(this.scene, this.camera);
    input.endFrame();
  }
}

try {
  const game = new Game();
  window.__neonHarbor = game;
} catch (err) {
  console.error(err);
  const el = document.getElementById('fatal');
  if (el) { el.hidden = false; el.textContent = `Failed to start: ${err.message}`; }
  window.__fatalError = String(err && err.message ? err.message : err);
}
