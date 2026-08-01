// Battlefield/simulation constants shared by client (rendering) and server
// (authoritative simulation) so positions and physics stay consistent
// between them. Reference battlefield resolution: build plan action #6
// ("Create a 1600x900 reference battlefield").
export const BATTLEFIELD_WIDTH = 1600;
export const BATTLEFIELD_HEIGHT = 900;

export const GROUND_Y = BATTLEFIELD_HEIGHT - 140;
export const TOWER_MARGIN_X = 120;
export const TOWER_WIDTH = 90;
export const TOWER_HEIGHT = 220;
export const TOWER_MAX_HEALTH = 1000;

export const STARTING_MONEY = 500;

// Menu display name (no auth) — shared so the menu's client-side validation
// and the server's defensive re-sanitization (never trust the client's
// join options as-is) can't drift apart.
export const MAX_PLAYER_NAME_LENGTH = 20;

// Rifle projectiles arc under gravity rather than travelling in a flat line
// (build plan 5.1's "visible projectile travel" note). Kept modest so
// close-range shots stay easy to land.
export const PROJECTILE_GRAVITY_Y = 150;

// Server simulation tick (build plan 5.3: "initially 15-20 ticks per second").
export const SIMULATION_TICK_MS = 55;

// Approximate collision radii for server-side hit detection. Deliberately
// decoupled from the client's exact sprite pixel dimensions (a rendering
// concern) — these just need to be "close enough" circles.
export const UNIT_HIT_RADIUS = 25;
export const DRONE_HIT_RADIUS = 25;
export const GOODIE_HIT_RADIUS = 20;

export const BARREL_LENGTH = 46;
export const UNIT_SPAWN_OFFSET = 70;

export const PASSIVE_INCOME_AMOUNT = 10;
export const PASSIVE_INCOME_INTERVAL_MS = 5000;

export const GOODIE_MIN_INTERVAL_MS = 60_000;
export const GOODIE_MAX_INTERVAL_MS = 180_000;
export const GOODIE_SPAWN_MARGIN = 60;
export const GOODIE_START_Y = -20;
export const GOODIE_GOLD_AMOUNT = 100;
export const GOODIE_REPAIR_AMOUNT = 150;
// Slow constant downward drift, not gravity-accelerated — "falling slowly
// like a balloon" (build plan section 6 sky goodies). Shared by GoodieState
// (online) and CombatSandboxScene's own local simulation (vs-AI) so both
// modes fall at the same visual speed.
export const GOODIE_DRIFT_SPEED = 40;

// Build plan section 7 "Easy": "lower shooting accuracy" — the AI gunner
// tracks its target's true position (so it visually aims correctly) but the
// shot it actually fires is thrown off by a random angle within this spread.
export const AI_AIM_SPREAD_RAD = 0.14;
export const AI_INITIAL_DELAY_MIN_MS = 1500;
export const AI_INITIAL_DELAY_MAX_MS = 3000;
