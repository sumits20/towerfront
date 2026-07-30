// Central registry of sprite asset keys + source paths so preload() and the
// entities that use them can't drift out of sync (build plan action pipeline
// for sprite assets — see client/public/assets/sprites/).
export const SPRITE_KEYS = {
  tower: "tower",
  gunner: "gunner",
  projectile: "projectile",
  recruit: "recruit",
  runner: "runner",
  shieldUnit: "shieldUnit",
  drone: "drone",
  goodie: "goodie",
} as const;

export const SPRITE_PATHS: Record<(typeof SPRITE_KEYS)[keyof typeof SPRITE_KEYS], string> = {
  tower: "/assets/sprites/tower.svg",
  gunner: "/assets/sprites/gunner.svg",
  projectile: "/assets/sprites/projectile.svg",
  recruit: "/assets/sprites/recruit.svg",
  runner: "/assets/sprites/runner.svg",
  shieldUnit: "/assets/sprites/shield-unit.svg",
  drone: "/assets/sprites/drone.svg",
  goodie: "/assets/sprites/goodie.svg",
};
