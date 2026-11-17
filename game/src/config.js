// NEON HARBOR — every tuning number and story beat in one place.
// The city is a 7x7 grid of blocks split by roads; the story is four jobs
// Rook runs for Mara Voss and Deke Rallo across that grid.
export const CONFIG = {
  // City layout: block pitch 46, road width 14, so the city spans ~322.
  blockPitch: 46,
  roadWidth: 14,
  blocks: 7,
  sidewalk: 3,

  // On foot.
  walkSpeed: 9,
  sprintSpeed: 15,
  playerRadius: 0.7,
  playerHeight: 1.9,

  // Driving.
  carAccel: 26,
  carBrake: 42,
  carMaxSpeed: 42,
  carReverseSpeed: 14,
  carTurn: 1.9,
  carLength: 4.4,
  carWidth: 2.0,

  // Combat.
  pistolDamage: 34,
  pistolRange: 90,
  pistolMag: 12,
  pistolReserveMax: 120,
  enemyHealth: 100,
  playerMaxHealth: 100,

  // Wanted / police.
  maxWanted: 5,
  wantedDecaySeconds: 14,
  policeMaxCars: 6,
  policeRamDamage: 6,
  heliWanted: 4, // helicopter joins the chase at this many stars

  // Pickups scattered around the city.
  pickupRespawnSeconds: 45,
  ammoPickupAmount: 36,
  healthPickupAmount: 50,

  // World life.
  trafficCars: 14,
  pedestrians: 22,
  dayLengthSeconds: 480,

  // Money.
  startCash: 250,
  missionRewards: [400, 650, 900, 1500],

  // Save.
  saveKey: 'neon-harbor-save-v1',
};

// The story: four missions, each a leg of Rook's rise in Neon Harbor.
export const MISSIONS = [
  {
    id: 1,
    title: 'Harbor Lights',
    giver: 'Mara Voss',
    brief: 'Mara needs a package lifted from the docks before the tide turns. Get to the yellow marker at Pier 9 and grab it.',
    steps: [
      { kind: 'goto', label: 'Reach Pier 9 on the east docks', target: [138, 0, -138] },
      { kind: 'grab', label: 'Pick up the package (press E)', target: [138, 0, -138] },
      { kind: 'goto', label: 'Bring it back to Mara at the club', target: [-60, 0, 92] },
    ],
  },
  {
    id: 2,
    title: 'Hot Wheels',
    giver: 'Mara Voss',
    brief: 'A client wants a Sunbeam GT, no questions. Steal the gold GT parked by the marina and deliver it to the chop shop.',
    steps: [
      { kind: 'steal', label: 'Steal the gold Sunbeam GT at the marina', target: [92, 0, -46] },
      { kind: 'goto', label: 'Deliver the GT to the chop shop', target: [-138, 0, -46] },
    ],
  },
  {
    id: 3,
    title: 'Street Heat',
    giver: 'Deke Rallo',
    brief: 'The Vipers moved into Coral Plaza and they are taxing every stall. Clear them out — all four — and the plaza is ours.',
    steps: [
      { kind: 'goto', label: 'Reach Coral Plaza', target: [0, 0, 0] },
      { kind: 'clear', label: 'Take down the Vipers (0/4)', target: [0, 0, 0], count: 4 },
      { kind: 'goto', label: 'Report back to Deke at the garage', target: [-92, 0, 46] },
    ],
  },
  {
    id: 4,
    title: 'The Big Score',
    giver: 'Mara Voss',
    brief: 'One job and we are done: the Harbor Bank vault, then lose the cops and vanish into the safehouse. Do not get caught.',
    steps: [
      { kind: 'goto', label: 'Reach Harbor Bank', target: [46, 0, -92] },
      { kind: 'grab', label: 'Grab the vault cash (press E)', target: [46, 0, -92] },
      { kind: 'escape', label: 'Escape the police and reach the safehouse', target: [-138, 0, 138] },
    ],
  },
];

// Named places, shown on the minimap and named in mission text.
export const PLACES = [
  { name: 'Pier 9', x: 138, z: -138 },
  { name: 'Marina', x: 92, z: -46 },
  { name: 'Chop Shop', x: -138, z: -46 },
  { name: 'Coral Plaza', x: 0, z: 0 },
  { name: 'Harbor Bank', x: 46, z: -92 },
  { name: 'Safehouse', x: -138, z: 138 },
  { name: 'Club Neon', x: -60, z: 92 },
  { name: 'Deke Garage', x: -92, z: 46 },
];

// Palette: sun-soaked dusk over a neon coastal city.
export const PALETTE = {
  skyTop: 0x2a4d8f,
  skyBottom: 0xff9a5c,
  sun: 0xffd9a0,
  road: 0x2b2f36,
  roadLine: 0xd8c95a,
  sidewalk: 0x6d6a63,
  grass: 0x3d6b4f,
  water: 0x1d5f7a,
  buildingGlass: 0x223349,
  neonPink: 0xff4fa3,
  neonCyan: 0x39d5ff,
  neonAmber: 0xffb454,
};
