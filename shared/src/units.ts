export type UnitType =
  | "recruit"
  | "runner"
  | "shieldUnit"
  | "drone"
  | "archer"
  | "brute"
  | "medic"
  | "bomber"
  | "siegeUnit";

export interface UnitDefinition {
  readonly type: UnitType;
  readonly displayName: string;
  readonly cost: number;
  readonly maxHealth: number;
  readonly moveSpeed: number;
  readonly attackDamage: number;
  readonly attackRange: number;
  readonly attackCooldownMs: number;
  readonly towerDamageMultiplier: number;
  readonly bounty: number;
  /** Minimum time between purchases of this unit type, per side. */
  readonly purchaseCooldownMs: number;
}

// MVP scope (build plan 4.1) ships recruit, runner and shieldUnit; the rest
// are stubs for the content-expansion phase (build plan 3.3) so purchase UI
// and balance tooling can be built against the full roster shape early.
export const UNIT_DEFINITIONS: Record<UnitType, UnitDefinition> = {
  recruit: {
    type: "recruit",
    displayName: "Recruit",
    cost: 25,
    maxHealth: 100,
    moveSpeed: 60,
    attackDamage: 10,
    attackRange: 40,
    attackCooldownMs: 800,
    towerDamageMultiplier: 1,
    bounty: 15,
    purchaseCooldownMs: 900,
  },
  runner: {
    type: "runner",
    displayName: "Runner",
    cost: 45,
    maxHealth: 60,
    moveSpeed: 110,
    attackDamage: 6,
    attackRange: 30,
    attackCooldownMs: 700,
    towerDamageMultiplier: 1.5,
    bounty: 25,
    purchaseCooldownMs: 1200,
  },
  shieldUnit: {
    type: "shieldUnit",
    displayName: "Shield Unit",
    cost: 70,
    maxHealth: 220,
    moveSpeed: 45,
    attackDamage: 8,
    attackRange: 35,
    attackCooldownMs: 900,
    towerDamageMultiplier: 0.75,
    bounty: 35,
    purchaseCooldownMs: 2000,
  },
  drone: {
    type: "drone",
    displayName: "Drone",
    cost: 150,
    maxHealth: 143,
    moveSpeed: 80,
    attackDamage: 14,
    attackRange: 100,
    attackCooldownMs: 750,
    towerDamageMultiplier: 0,
    bounty: 75,
    purchaseCooldownMs: 2800,
  },
  archer: {
    type: "archer",
    displayName: "Archer",
    cost: 80,
    maxHealth: 70,
    moveSpeed: 55,
    attackDamage: 14,
    attackRange: 180,
    attackCooldownMs: 1000,
    towerDamageMultiplier: 1,
    bounty: 40,
    purchaseCooldownMs: 1800,
  },
  brute: {
    type: "brute",
    displayName: "Brute",
    cost: 120,
    maxHealth: 260,
    moveSpeed: 35,
    attackDamage: 30,
    attackRange: 45,
    attackCooldownMs: 1100,
    towerDamageMultiplier: 1.2,
    bounty: 60,
    purchaseCooldownMs: 2500,
  },
  medic: {
    type: "medic",
    displayName: "Medic",
    cost: 135,
    maxHealth: 90,
    moveSpeed: 55,
    attackDamage: 0,
    attackRange: 120,
    attackCooldownMs: 2000,
    towerDamageMultiplier: 0,
    bounty: 65,
    purchaseCooldownMs: 2500,
  },
  bomber: {
    type: "bomber",
    displayName: "Bomber",
    cost: 160,
    maxHealth: 60,
    moveSpeed: 65,
    attackDamage: 45,
    attackRange: 60,
    attackCooldownMs: 1400,
    towerDamageMultiplier: 1,
    bounty: 75,
    purchaseCooldownMs: 2800,
  },
  siegeUnit: {
    type: "siegeUnit",
    displayName: "Siege Unit",
    cost: 220,
    maxHealth: 180,
    moveSpeed: 30,
    attackDamage: 12,
    attackRange: 50,
    attackCooldownMs: 1200,
    towerDamageMultiplier: 3,
    bounty: 100,
    purchaseCooldownMs: 3500,
  },
};
