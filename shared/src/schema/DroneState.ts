import { Schema, type } from "@colyseus/schema";
import type { Side } from "../ids.js";
import { UNIT_DEFINITIONS, type UnitType } from "../units.js";
import { GROUND_Y } from "../config.js";
import type { PlayerState } from "./PlayerState.js";
import type { UnitState } from "./UnitState.js";

// "pick a sensible height range... 100-250px above the lane" — governs idle
// wandering altitude only; engagement range (below) is horizontal-only, same
// convention as UnitState, so the sky band never blocks combat.
const SKY_BAND_MIN_HEIGHT = 100;
const SKY_BAND_MAX_HEIGHT = 250;
const VERTICAL_WANDER_SPEED = 30;
const WANDER_RETARGET_MIN_MS = 2000;
const WANDER_RETARGET_MAX_MS = 3500;
const TOWER_HOVER_MARGIN = 20;

type DroneTarget = UnitState | DroneState;

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Authoritative drone simulation (ported from the old Phaser-coupled
 * client/src/entities/Drone.ts). Ranged, freely-2D-moving, never attacks
 * towers, prioritizes the nearest opposing Drone over the nearest opposing
 * ground Unit, both anywhere on the field (not range-limited like Unit's
 * reactive targeting) — it actively flies into its own attack range.
 */
export class DroneState extends Schema {
  @type("string") id = "";
  @type("string") side: Side = "left";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") health = 0;
  @type("number") maxHealth = 0;
  /** Bumped on every successful attack — the client watches this to trigger the lunge + shot-visual. */
  @type("number") attackFlashSeq = 0;

  alive = true;
  /** Not networked (the client already knows a `drones` map entry is a drone) — kept for the room's uniform bounty lookup against `UnitState.unitType`. */
  readonly unitType: UnitType = "drone";
  private directionSign: 1 | -1 = 1;
  private target: DroneTarget | null = null;
  private nextAttackAtMs = 0;
  private wanderTargetY = 0;
  private nextWanderPickAtMs = 0;

  init(id: string, side: Side, x: number): void {
    const definition = UNIT_DEFINITIONS.drone;
    this.id = id;
    this.side = side;
    this.x = x;
    this.y = GROUND_Y - randomBetween(SKY_BAND_MIN_HEIGHT, SKY_BAND_MAX_HEIGHT);
    this.health = definition.maxHealth;
    this.maxHealth = definition.maxHealth;
    this.directionSign = side === "left" ? 1 : -1;
    this.wanderTargetY = this.y;
  }

  update(
    nowMs: number,
    deltaMs: number,
    opposingDrones: readonly DroneState[],
    opposingUnits: readonly UnitState[],
    enemyTower: PlayerState,
  ): void {
    if (!this.alive) return;
    const definition = UNIT_DEFINITIONS[this.unitType];

    this.updateVerticalWander(nowMs, deltaMs);

    if (this.target && !this.target.alive) {
      this.target = null;
    }
    if (!this.target) {
      this.target = this.findPriorityTarget(opposingDrones, opposingUnits);
    }

    if (this.target) {
      const target = this.target;
      const dist = Math.abs(this.x - target.x);
      if (dist <= definition.attackRange) {
        this.tryAttack(nowMs, definition.attackCooldownMs, () => target.takeDamage(definition.attackDamage));
      } else {
        this.moveTowardX(target.x, definition.moveSpeed, deltaMs);
      }
    } else {
      this.advanceTowardEnemy(definition.moveSpeed, deltaMs, enemyTower);
    }
  }

  takeDamage(amount: number): void {
    if (!this.alive) return;
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) this.alive = false;
  }

  private findPriorityTarget(
    opposingDrones: readonly DroneState[],
    opposingUnits: readonly UnitState[],
  ): DroneTarget | null {
    return this.findNearest(opposingDrones) ?? this.findNearest(opposingUnits);
  }

  private findNearest<T extends DroneTarget>(candidates: readonly T[]): T | null {
    let closest: T | null = null;
    let closestDist = Infinity;
    for (const candidate of candidates) {
      if (!candidate.alive) continue;
      const dist = Math.abs(this.x - candidate.x);
      if (dist < closestDist) {
        closest = candidate;
        closestDist = dist;
      }
    }
    return closest;
  }

  private moveTowardX(targetX: number, moveSpeed: number, deltaMs: number): void {
    const step = moveSpeed * (deltaMs / 1000);
    if (Math.abs(targetX - this.x) <= step) {
      this.x = targetX;
    } else {
      this.x += targetX > this.x ? step : -step;
    }
  }

  private advanceTowardEnemy(moveSpeed: number, deltaMs: number, enemyTower: PlayerState): void {
    const nextX = this.x + this.directionSign * moveSpeed * (deltaMs / 1000);
    const hoverLimit = enemyTower.laneEdgeX - this.directionSign * TOWER_HOVER_MARGIN;
    // Never damages towers — just stop short of the edge and hover instead of attacking.
    this.x = this.directionSign > 0 ? Math.min(nextX, hoverLimit) : Math.max(nextX, hoverLimit);
  }

  private updateVerticalWander(nowMs: number, deltaMs: number): void {
    if (nowMs >= this.nextWanderPickAtMs) {
      this.wanderTargetY = GROUND_Y - randomBetween(SKY_BAND_MIN_HEIGHT, SKY_BAND_MAX_HEIGHT);
      this.nextWanderPickAtMs = nowMs + randomBetween(WANDER_RETARGET_MIN_MS, WANDER_RETARGET_MAX_MS);
    }

    const step = VERTICAL_WANDER_SPEED * (deltaMs / 1000);
    if (Math.abs(this.wanderTargetY - this.y) <= step) {
      this.y = this.wanderTargetY;
    } else {
      this.y += this.wanderTargetY > this.y ? step : -step;
    }
  }

  private tryAttack(nowMs: number, cooldownMs: number, dealDamage: () => void): void {
    if (nowMs < this.nextAttackAtMs) return;
    dealDamage();
    this.nextAttackAtMs = nowMs + cooldownMs;
    this.attackFlashSeq++;
  }
}
