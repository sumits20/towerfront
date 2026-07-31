import { Schema, type } from "@colyseus/schema";
import type { Side } from "../ids.js";
import { UNIT_DEFINITIONS, type UnitType } from "../units.js";
import type { PlayerState } from "./PlayerState.js";

/**
 * Authoritative ground-unit simulation (ported from the old Phaser-coupled
 * client/src/entities/Unit.ts — same state machine, no rendering). Lives
 * entirely server-side; the client only ever reads the `@type()` fields.
 */
export class UnitState extends Schema {
  @type("string") id = "";
  @type("string") side: Side = "left";
  @type("string") unitType: UnitType = "recruit";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") health = 0;
  @type("number") maxHealth = 0;
  /** Bumped on every successful attack — the client watches this to trigger the lunge tween. */
  @type("number") attackFlashSeq = 0;

  /** Server-only bookkeeping, never networked. */
  alive = true;
  private directionSign: 1 | -1 = 1;
  private target: UnitState | null = null;
  private nextAttackAtMs = 0;

  init(id: string, side: Side, unitType: UnitType, x: number, y: number): void {
    const definition = UNIT_DEFINITIONS[unitType];
    this.id = id;
    this.side = side;
    this.unitType = unitType;
    this.x = x;
    this.y = y;
    this.health = definition.maxHealth;
    this.maxHealth = definition.maxHealth;
    this.directionSign = side === "left" ? 1 : -1;
  }

  /** `opponents` must already be the opposing side's *live* units (dead ones are pruned by the room each tick). */
  update(nowMs: number, deltaMs: number, opponents: readonly UnitState[], enemyTower: PlayerState): void {
    if (!this.alive) return;
    const definition = UNIT_DEFINITIONS[this.unitType];

    if (this.target && (!this.target.alive || this.distanceTo(this.target) > definition.attackRange)) {
      this.target = null;
    }
    if (!this.target) {
      this.target = this.findNearestOpponentInRange(opponents, definition.attackRange);
    }

    if (this.target) {
      const target = this.target;
      this.tryAttack(nowMs, definition.attackCooldownMs, () => target.takeDamage(definition.attackDamage));
    } else if (Math.abs(this.x - enemyTower.laneEdgeX) <= definition.attackRange) {
      // Tower-destroyed detection happens centrally in the room's tick loop
      // (checks every PlayerState.towerHealth after updates), not here.
      this.tryAttack(nowMs, definition.attackCooldownMs, () => {
        enemyTower.towerTakeDamage(definition.attackDamage * definition.towerDamageMultiplier);
      });
    } else {
      this.x += this.directionSign * definition.moveSpeed * (deltaMs / 1000);
    }
  }

  takeDamage(amount: number): void {
    if (!this.alive) return;
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) this.alive = false;
  }

  private distanceTo(other: UnitState): number {
    return Math.abs(this.x - other.x);
  }

  private findNearestOpponentInRange(opponents: readonly UnitState[], attackRange: number): UnitState | null {
    let closest: UnitState | null = null;
    let closestDist = Infinity;
    for (const opponent of opponents) {
      if (!opponent.alive) continue;
      const dist = this.distanceTo(opponent);
      if (dist <= attackRange && dist < closestDist) {
        closest = opponent;
        closestDist = dist;
      }
    }
    return closest;
  }

  private tryAttack(nowMs: number, cooldownMs: number, dealDamage: () => void): void {
    if (nowMs < this.nextAttackAtMs) return;
    dealDamage();
    this.nextAttackAtMs = nowMs + cooldownMs;
    this.attackFlashSeq++;
  }
}
