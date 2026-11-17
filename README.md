[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01)
[![rank](https://make.fun/badge/gta6-01/KIM7667/neon-harbor-4/rank.svg)](https://make.fun/c/gta6-01)
[![reward](https://make.fun/badge/gta6-01/KIM7667/neon-harbor-4/reward.svg)](https://make.fun/c/gta6-01)

# NEON HARBOR — an open-world crime game

An original open-world crime game for the make.fun **gta6-01** bounty ("Make GTA 6").
You are Rook Calloway, fresh out of the Harbor lockup with $250, a pistol, and a
debt to Mara Voss. Explore the sun-soaked coastal city of Neon Harbor on foot
or behind the wheel, steal cars, outrun the Harbor PD, and run four story
missions for the crew.

## What's in the game

- **A city to explore** — a procedural 7×7-block coastal city: towers with lit
  windows, neon shop signs, palms, street lamps, working traffic lights, Coral
  Plaza with its fountain and market stalls, a beach boardwalk, and the Pier 9
  harbor with moored boats and the sea.
- **On foot and by car** — third-person walking with a walk cycle, and arcade
  driving (accelerate, brake, handbrake) with a chase camera. Wrecked cars
  smoke and lose top speed.
- **Stealable cars** — eight parked cars around the city, including the gold
  Sunbeam GT that mission 2 asks for.
- **Traffic and pedestrians** — cars cruise the road grid and turn at
  intersections; pedestrians stroll the sidewalks and flee from gunfire and
  speeding cars.
- **Wanted level + police** — five stars with a heat bar. Stealing, shooting,
  and hitting pedestrians raise the heat; police cars chase and ram, officers
  close in and shoot at high heat, and at four stars a helicopter circles
  overhead with a searchlight and slows your cooldown. Sirens wail. Break
  line of sight and stay quiet to cool off.
- **Missions and a story** — four jobs with objectives, a glowing beacon, and
  payouts: Harbor Lights, Hot Wheels, Street Heat, and The Big Score.
- **Combat** — pistol with tracers, muzzle flash, ammo and reload, and Viper
  gang shooters with health bars who strafe and return fire.
- **Pickups** — ammo crates and a first-aid kit around the city, respawning
  after a while.
- **HUD with minimap** — cash, clock, wanted stars, heat bar, health, speed,
  ammo, mission objective, message feed, and a live circular minimap with
  roads, beach, the mission beacon, traffic, police, helicopter, pickups,
  and the player arrow.
- **Start screen, pause menu, and save** — progress saves to localStorage after
  every mission and on demand; continue a saved game from the start screen.
- **Sound** — everything synthesized with WebAudio: engine drone, two-tone
  siren, gunshots, crashes, pickups, and a synthwave bassline + arpeggio loop.
  No audio files.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

Static files only — no build step, no network request at runtime. three.js is
vendored under `game/vendor/three/`.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move / drive |
| Shift | Sprint |
| Mouse drag | Look around |
| Click | Shoot (on foot) |
| R | Reload |
| E | Enter / steal car, pick up |
| F | Get out of car |
| Space | Handbrake |
| Esc | Pause & save |
| M | Music on/off |

## Entry

`main.ts` (Node 22, standard library only) copies `game/` and `screenshots/`
to `/output` and writes `/output/dossier.json`:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Everything here — city, characters, vehicles, names, story, art, and sound —
is original work made for this bounty. Nothing is taken from any commercial game.
