import type { Side } from "./ids.js";
import type { UnitType } from "./units.js";
import type { WeaponType } from "./weapons.js";

// Placeholder network protocol for the future Colyseus multiplayer phase
// (build plan 5.2/11.3). Not wired up yet — the local prototype phase runs
// with no network layer. Kept here so the shape is agreed before it matters.

export interface FireCommand {
  readonly type: "fire";
  readonly side: Side;
  readonly aimAngleRad: number;
}

export interface ReloadCommand {
  readonly type: "reload";
  readonly side: Side;
}

export interface PurchaseUnitCommand {
  readonly type: "purchaseUnit";
  readonly side: Side;
  readonly unitType: UnitType;
}

export type ClientCommand = FireCommand | ReloadCommand | PurchaseUnitCommand;

export interface DamageEvent {
  readonly type: "damage";
  readonly targetId: string;
  readonly amount: number;
  readonly sourceWeapon?: WeaponType;
}

export interface MatchEndedEvent {
  readonly type: "matchEnded";
  readonly winner: Side;
}

export type ServerEvent = DamageEvent | MatchEndedEvent;
