// Deterministic screenshot modes (?shot=start|driving|wanted|mission).
// Each one composes a scene that shows several systems at once, lets it
// settle for a few frames, then sets window.__shotReady for the shooter.
export function applyShotMode(game, mode) {
  const p = game.player;
  const set = (x, z, heading) => {
    p.pos.set(x, 0, z);
    p.heading = heading;
    p.camYaw = heading + Math.PI;
    p.mesh.rotation.y = heading;
  };
  if (mode === 'start') {
    // On foot on a neon street at dusk, start screen on top.
    set(-14, 92, Math.PI * 0.85);
    game.state = 'menu';
    game.showStartScreen();
    // Park a couple of cars in frame for colour.
    game.camera.position.set(-30, 6, 108);
    game.camera.lookAt(10, 2, 60);
    game.shotCamera = { pos: [-30, 6, 108], look: [10, 2, 60] };
  } else if (mode === 'driving') {
    // Behind the wheel on the main avenue, traffic ahead, HUD live.
    const car = game.vehicles.parked.find((c) => c.name === 'Falcon Sport') || game.vehicles.parked[0];
    set(car.pos.x - 3, car.pos.z, car.heading);
    p.enterCar(car);
    car.speed = 22;
    game.shotDrive = true; // hold the throttle while the shot settles
    game.shotCruiseSpeed = 24;
    game.startPlaying();
    game.shotCamera = null;
    game.hud.feed('You jacked the Falcon Sport.', 'info');
  } else if (mode === 'wanted') {
    // Four-star chase: player in a stolen car, police on the tail, the
    // helicopter circling overhead.
    const car = game.vehicles.parked.find((c) => c.name === 'Coyote Sedan') || game.vehicles.parked[0];
    set(car.pos.x - 3, car.pos.z, car.heading);
    p.enterCar(car);
    car.speed = 26;
    game.shotDrive = true; // hold the throttle while the shot settles
    game.shotCruiseSpeed = 26;
    game.startPlaying();
    game.police.addHeat(70, 'shot');
    game.police.spawnPoliceCar(p.pos);
    game.police.spawnPoliceCar(p.pos);
    // Hold the chase formation for the screenshot: the two units sit
    // ahead of the player on the same road, headlights toward the
    // camera, while the player cruises up to them. Snapped onto the
    // road centre line so a unit never sits inside a shopfront.
    game.police.shotFreeze = true;
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    const onXRoad = Math.abs(fx) > 0.5; // driving along X
    game.police.cars.forEach((pc, i) => {
      const side = i === 0 ? -1 : 1;
      const ax = p.pos.x + fx * 48;
      const az = p.pos.z + fz * 48;
      if (onXRoad) {
        pc.pos.x = ax;
        pc.pos.z = game.city.nearestRoadCoord(az) + side * 5;
      } else {
        pc.pos.x = game.city.nearestRoadCoord(ax) + side * 5;
        pc.pos.z = az;
      }
      pc.heading = car.heading + Math.PI; // facing the player, head-on
      pc.speed = 0;
    });
    game.shotCamera = null;
    game.hud.feed('Harbor PD is on your tail!', 'danger');
  } else if (mode === 'mission') {
    // Mission 3 at Coral Plaza: gang shooters, objective on the HUD.
    game.missions.activeIndex = 2;
    game.missions.stepIndex = 1;
    game.missions.gangSpawned = false;
    game.missions.placeBeacon();
    set(-16, 16, Math.PI * 0.75); // facing Coral Plaza at (0,0)
    game.startPlaying();
    game.combat.spawnGang(4, 0, 0);
    game.missions.gangSpawned = true;
    game.hud.feed('The Vipers hold Coral Plaza.', 'danger');
    game.shotCamera = null;
  }
  // Let the world settle, then signal the screenshot tool.
  // 30 frames is enough for traffic, peds and the camera to settle.
  let frames = 0;
  const tick = () => {
    frames += 1;
    if (frames >= 30) {
      window.__shotReady = true;
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
