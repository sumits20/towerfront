import { Schema, type, MapSchema } from "@colyseus/schema";
import type { Side } from "../ids.js";
import { PlayerState } from "./PlayerState.js";
import { UnitState } from "./UnitState.js";
import { DroneState } from "./DroneState.js";
import { ProjectileState } from "./ProjectileState.js";
import { GoodieState } from "./GoodieState.js";

/** Root authoritative state for one MatchRoom. */
export class MatchState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type({ map: UnitState }) units = new MapSchema<UnitState>();
  @type({ map: DroneState }) drones = new MapSchema<DroneState>();
  @type({ map: ProjectileState }) projectiles = new MapSchema<ProjectileState>();
  @type(GoodieState) goodie?: GoodieState;

  @type("boolean") started = false;
  @type("boolean") matchOver = false;
  @type("string") winner: Side | "" = "";
  /** Room's internal simulation clock, mirrored here so clients can compute purchase-cooldown countdowns without a shared wall clock. */
  @type("number") elapsedMs = 0;
}

export { PlayerState, UnitState, DroneState, ProjectileState, GoodieState };
