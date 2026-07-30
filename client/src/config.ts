// Reference battlefield resolution (build plan action #6: "Create a 1600x900
// reference battlefield").
export const BATTLEFIELD_WIDTH = 1600;
export const BATTLEFIELD_HEIGHT = 900;

export const GROUND_Y = BATTLEFIELD_HEIGHT - 140;
export const TOWER_MARGIN_X = 120;
export const GUNNER_HEIGHT_OFFSET = 170;

export const STARTING_MONEY = 500;

// Rifle projectiles arc under gravity rather than travelling in a flat line
// (build plan 5.1's "visible projectile travel" note). Kept modest so
// close-range shots stay easy to land.
export const PROJECTILE_GRAVITY_Y = 150;
