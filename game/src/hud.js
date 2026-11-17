// HUD: cash, health, wanted stars + heat bar, clock, speed, mission
// objective, message feed, and a live minimap drawn on a 2D canvas.
import { CONFIG, PLACES } from './config.js';

export class HUD {
  constructor() {
    this.el = {};
    for (const id of ['cash', 'health-fill', 'health-num', 'stars', 'heat-fill', 'clock', 'speed', 'speed-label', 'objective', 'objective-title', 'feed', 'crosshair', 'hint', 'banner', 'banner-title', 'banner-sub', 'vignette', 'damage-flash']) {
      this.el[id] = document.getElementById(id);
    }
    this.minimap = document.getElementById('minimap');
    this.mapCtx = this.minimap ? this.minimap.getContext('2d') : null;
    this.feedItems = [];
    this.lastHealth = 100;
  }

  cash(v) { this.el.cash.textContent = `$${Math.floor(v).toLocaleString('en-US')}`; }

  health(v) {
    this.el['health-num'].textContent = Math.ceil(v);
    this.el['health-fill'].style.width = `${Math.max(0, v)}%`;
    this.el['health-fill'].classList.toggle('low', v < 30);
    if (v < this.lastHealth) {
      this.el['damage-flash'].classList.add('on');
      setTimeout(() => this.el['damage-flash'].classList.remove('on'), 120);
    }
    this.lastHealth = v;
  }

  stars(n) {
    let s = '';
    for (let i = 0; i < CONFIG.maxWanted; i += 1) s += i < n ? '★' : '☆';
    this.el.stars.textContent = s;
    this.el.stars.classList.toggle('hot', n > 0);
    this.el.vignette.classList.toggle('on', n >= 3);
  }

  heat(v) {
    this.el['heat-fill'].style.width = `${Math.max(0, Math.min(100, v))}%`;
  }

  clock(seconds) {
    const total = 17 * 3600 + seconds; // day starts 17:00, golden hour
    const h = Math.floor(total / 3600) % 24;
    const m = Math.floor((total % 3600) / 60);
    this.el.clock.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  speed(kmh, driving) {
    this.el.speed.textContent = driving ? Math.round(kmh) : '';
    this.el['speed-label'].textContent = driving ? 'KM/H' : '';
  }

  objective(title, text) {
    this.el['objective-title'].textContent = title;
    this.el.objective.textContent = text;
  }

  hint(text) {
    this.el.hint.textContent = text || '';
  }

  banner(title, sub, ms) {
    this.el['banner-title'].textContent = title;
    this.el['banner-sub'].textContent = sub || '';
    this.el.banner.classList.add('on');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => this.el.banner.classList.remove('on'), ms || 3200);
  }

  feed(text, kind) {
    const li = document.createElement('li');
    li.textContent = text;
    if (kind) li.className = kind;
    this.el.feed.prepend(li);
    this.feedItems.unshift(li);
    while (this.feedItems.length > 5) {
      const old = this.feedItems.pop();
      old.remove();
    }
    setTimeout(() => li.classList.add('fade'), 4200);
    setTimeout(() => { li.remove(); const i = this.feedItems.indexOf(li); if (i >= 0) this.feedItems.splice(i, 1); }, 5200);
  }

  crosshair(on) {
    this.el.crosshair.style.display = on ? 'block' : 'none';
  }

  // Minimap: roads, blocks, water, places, mission beacon, cars, police,
  // helicopter, the player arrow (rotating) — north up.
  drawMinimap(game) {
    const ctx = this.mapCtx;
    if (!ctx) return;
    const W = this.minimap.width;
    const H = this.minimap.height;
    const citySpan = CONFIG.blocks * CONFIG.blockPitch + 40;
    const scale = W / citySpan;
    const toMap = (x, z) => [W / 2 + x * scale, H / 2 + z * scale];
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(16,20,28,0.92)';
    ctx.fillRect(0, 0, W, H);
    // Sea to the east.
    ctx.fillStyle = '#1d5f7a';
    const [seaX] = toMap(170, 0);
    ctx.fillRect(seaX, 0, W - seaX, H);
    // Beach strip.
    ctx.fillStyle = '#8a6a4a';
    const [beachX] = toMap(163, 0);
    ctx.fillRect(beachX, 0, seaX - beachX, H);
    // Roads.
    ctx.strokeStyle = '#4a4f58';
    ctx.lineWidth = Math.max(2, CONFIG.roadWidth * scale);
    const pitch = CONFIG.blockPitch;
    const half = (CONFIG.blocks * pitch) / 2;
    for (let i = 0; i <= CONFIG.blocks; i += 1) {
      const c = -half + i * pitch;
      const [x1, y1] = toMap(c, -half - 10);
      const [x2, y2] = toMap(c, half + 10);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      const [x3, y3] = toMap(-half - 10, c);
      const [x4, y4] = toMap(half + 10, c);
      ctx.beginPath(); ctx.moveTo(x3, y3); ctx.lineTo(x4, y4); ctx.stroke();
    }
    // Blocks.
    ctx.fillStyle = '#2e3440';
    for (let bx = 0; bx < CONFIG.blocks; bx += 1) {
      for (let bz = 0; bz < CONFIG.blocks; bz += 1) {
        const cx = -half + pitch / 2 + bx * pitch;
        const cz = -half + pitch / 2 + bz * pitch;
        const [x, y] = toMap(cx - pitch / 2 + 5, cz - pitch / 2 + 5);
        ctx.fillRect(x, y, (pitch - 10) * scale, (pitch - 10) * scale);
      }
    }
    // Named places.
    ctx.fillStyle = '#9aa3ab';
    ctx.font = '7px system-ui, sans-serif';
    for (const p of PLACES) {
      const [x, y] = toMap(p.x, p.z);
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }
    // Mission beacon.
    const step = game.missions.step;
    if (step && !game.missions.done) {
      const [x, y] = toMap(step.target[0], step.target[2]);
      ctx.fillStyle = '#ffd27a';
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffd27a';
      ctx.beginPath(); ctx.arc(x, y, 8 + Math.sin(performance.now() / 300) * 2, 0, Math.PI * 2); ctx.stroke();
    }
    // Traffic cars: white dots. Police: flashing blue/red dots. Heli: yellow ring.
    const flash = Math.floor(performance.now() / 350) % 2 === 0;
    for (const car of game.vehicles.traffic) {
      const [x, y] = toMap(car.pos.x, car.pos.z);
      ctx.fillStyle = '#d8d8d8';
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }
    for (const car of game.police.cars) {
      const [x, y] = toMap(car.pos.x, car.pos.z);
      ctx.fillStyle = flash ? '#ff4040' : '#4060ff';
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    }
    if (game.police.heli) {
      const [x, y] = toMap(game.police.heli.pos.x, game.police.heli.pos.z);
      ctx.strokeStyle = '#ffe95a';
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.stroke();
    }
    // Pickups: green dots.
    for (const p of game.pickups.pickups) {
      if (p.taken) continue;
      const [x, y] = toMap(p.pos.x, p.pos.z);
      ctx.fillStyle = p.kind === 'ammo' ? '#7dff9a' : '#ff8ac2';
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    // Player arrow.
    const p = game.player;
    const [px, py] = toMap(p.pos.x, p.pos.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(p.inCar ? p.inCar.heading : p.heading);
    ctx.fillStyle = '#ff4fa3';
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(4.5, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-4.5, 5);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    // North marker.
    ctx.fillStyle = '#9aa3ab';
    ctx.font = 'bold 9px system-ui, sans-serif';
    ctx.fillText('N', W / 2 - 3, 11);
  }
}
