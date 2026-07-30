import { SPRITE_KEYS } from "../assetKeys";

// Unit lane prototype (build plan phase 2) only ships these four unit
// types; the rest of shared's UnitType union is content-expansion scope.
export type ImplementedUnitType = "recruit" | "runner" | "shieldUnit" | "drone";

export interface UnitVisual {
  readonly spriteKey: string;
  readonly width: number;
  readonly height: number;
}

export const UNIT_VISUALS: Record<ImplementedUnitType, UnitVisual> = {
  recruit: { spriteKey: SPRITE_KEYS.recruit, width: 44, height: 56 },
  runner: { spriteKey: SPRITE_KEYS.runner, width: 36, height: 50 },
  shieldUnit: { spriteKey: SPRITE_KEYS.shieldUnit, width: 50, height: 62 },
  drone: { spriteKey: SPRITE_KEYS.drone, width: 54, height: 36 },
};
