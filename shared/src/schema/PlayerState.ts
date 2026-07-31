import { Schema, type, MapSchema } from "@colyseus/schema";
import type { Side } from "../ids.js";
import { GROUND_Y, TOWER_MARGIN_X, TOWER_WIDTH, TOWER_HEIGHT, TOWER_MAX_HEALTH, BATTLEFIELD_WIDTH } from "../config.js";

/**
 * Per-side player state: gold, gunner/weapon state, and the tower itself
 * (ported from client/src/entities/Tower.ts + Gunner.ts's non-rendering
 * fields). One instance per side, always present (AI-controlled whenever
 * `connected` is false), keyed "left"/"right" on MatchState.players.
 */
export class PlayerState extends Schema {
  @type("string") side: Side = "left";
  /** Player-chosen display name (menu-only, no auth) — server-sanitized, never trusted as-is from the client. */
  @type("string") displayName = "";
  @type("number") gold = 0;
  @type("boolean") connected = false;
  @type("boolean") ready = false;

  @type("number") towerHealth = TOWER_MAX_HEALTH;
  /** Bumped whenever the tower takes damage — client plays the white flash + camera shake. */
  @type("number") towerHitFlashSeq = 0;
  /** Bumped whenever the tower is repaired — client plays the green heal flash. */
  @type("number") towerHealFlashSeq = 0;

  @type("number") gunnerAmmo = 0;
  @type("number") gunnerMagazineSize = 0;
  @type("boolean") gunnerReloading = false;
  @type("number") gunnerAimAngle = 0;

  /** unitType -> timestamp (server clock ms) when it next becomes purchasable. */
  @type({ map: "number" }) purchaseCooldownUntilMs = new MapSchema<number>();

  init(side: Side): void {
    this.side = side;
  }

  get towerX(): number {
    return this.side === "left" ? TOWER_MARGIN_X : BATTLEFIELD_WIDTH - TOWER_MARGIN_X;
  }

  /** X-coordinate of the tower's edge facing the lane, where units go melee it. */
  get laneEdgeX(): number {
    return this.side === "left" ? this.towerX + TOWER_WIDTH / 2 : this.towerX - TOWER_WIDTH / 2;
  }

  get gunnerAnchorX(): number {
    return this.towerX;
  }

  get gunnerAnchorY(): number {
    return GROUND_Y - TOWER_HEIGHT;
  }

  towerTakeDamage(amount: number): void {
    this.towerHealth = Math.max(0, this.towerHealth - amount);
    this.towerHitFlashSeq++;
  }

  towerRepair(amount: number): void {
    this.towerHealth = Math.min(TOWER_MAX_HEALTH, this.towerHealth + amount);
    this.towerHealFlashSeq++;
  }
}
