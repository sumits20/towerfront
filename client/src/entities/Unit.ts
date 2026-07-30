import Phaser from "phaser";
import type { Side, UnitDefinition } from "@towerfront/shared";
import { HealthBar } from "./HealthBar";
import { Tower } from "./Tower";
import { UNIT_VISUALS, type ImplementedUnitType } from "./unitVisuals";

const HIT_FLASH_MS = 80;
const HEALTH_BAR_GAP = 10;
const LUNGE_DISTANCE = 10;
const LUNGE_DURATION_MS = 90;

/**
 * A single lane unit (build plan phase 2: "unit lane prototype"). Advances
 * toward the enemy tower, stops to fight the nearest opposing unit that
 * comes within attack range, and melees the enemy tower once it gets close
 * unopposed. No AI decides *when* to spawn these — that's still manual via
 * the purchase buttons; this class only owns what a unit does once it exists.
 */
export class Unit {
  readonly side: Side;
  readonly definition: UnitDefinition;
  readonly sprite: Phaser.GameObjects.Sprite;
  health: number;
  alive = true;

  private readonly scene: Phaser.Scene;
  private readonly healthBar: HealthBar;
  private readonly teamTint: number;
  private readonly directionSign: 1 | -1;
  private readonly onDeath?: (x: number, y: number) => void;
  private readonly onTowerDestroyed?: (winningSide: Side) => void;
  private readonly onHit?: () => void;

  private target: Unit | null = null;
  private nextAttackAtMs = 0;

  constructor(
    scene: Phaser.Scene,
    side: Side,
    definition: UnitDefinition,
    x: number,
    groundY: number,
    onDeath?: (x: number, y: number) => void,
    onTowerDestroyed?: (winningSide: Side) => void,
    onHit?: () => void,
  ) {
    const visual = UNIT_VISUALS[definition.type as ImplementedUnitType];
    if (!visual) {
      throw new Error(`No sprite visual configured for unit type "${definition.type}"`);
    }

    this.scene = scene;
    this.side = side;
    this.definition = definition;
    this.health = definition.maxHealth;
    this.directionSign = side === "left" ? 1 : -1;
    this.onDeath = onDeath;
    this.onTowerDestroyed = onTowerDestroyed;
    this.onHit = onHit;
    this.teamTint = side === "left" ? 0x3d6bd6 : 0xd64545;

    const y = groundY - visual.height / 2;
    this.sprite = scene.add.sprite(x, y, visual.spriteKey);
    this.sprite.setDisplaySize(visual.width, visual.height);
    this.sprite.setTint(this.teamTint);
    this.sprite.setFlipX(side === "right");

    this.healthBar = new HealthBar(scene, x, y - visual.height / 2 - HEALTH_BAR_GAP, 40, 6);
  }

  /** Advance the unit's state machine one tick. `opponents` must be the opposing side's live units. */
  update(nowMs: number, deltaMs: number, opponents: readonly Unit[], enemyTower: Tower): void {
    if (!this.alive) return;

    if (this.target && (!this.target.alive || this.distanceTo(this.target) > this.definition.attackRange)) {
      this.target = null;
    }
    if (!this.target) {
      this.target = this.findNearestOpponentInRange(opponents);
    }

    if (this.target) {
      const target = this.target;
      this.tryAttack(nowMs, () => target.takeDamage(this.definition.attackDamage));
    } else if (Math.abs(this.sprite.x - enemyTower.laneEdgeX) <= this.definition.attackRange) {
      this.tryAttack(nowMs, () => {
        const destroyed = enemyTower.takeDamage(this.definition.attackDamage * this.definition.towerDamageMultiplier);
        if (destroyed) this.onTowerDestroyed?.(this.side);
      });
    } else {
      this.advance(deltaMs);
    }
  }

  takeDamage(amount: number): void {
    if (!this.alive) return;
    this.health = Math.max(0, this.health - amount);
    this.healthBar.setRatio(this.health / this.definition.maxHealth);
    this.flashHit();
    this.onHit?.();
    if (this.health <= 0) this.die();
  }

  destroy(): void {
    this.sprite.destroy();
    this.healthBar.destroy();
  }

  private advance(deltaMs: number): void {
    this.sprite.x += this.directionSign * this.definition.moveSpeed * (deltaMs / 1000);
    this.healthBar.setPosition(this.sprite.x, this.sprite.y - this.sprite.displayHeight / 2 - HEALTH_BAR_GAP);
  }

  private tryAttack(nowMs: number, dealDamage: () => void): void {
    if (nowMs < this.nextAttackAtMs) return;
    dealDamage();
    this.nextAttackAtMs = nowMs + this.definition.attackCooldownMs;
    this.playAttackLunge();
  }

  /** Lightweight lunge-and-return tween toward the target on each attack tick. */
  private playAttackLunge(): void {
    this.scene.tweens.add({
      targets: this.sprite,
      x: this.sprite.x + LUNGE_DISTANCE * this.directionSign,
      duration: LUNGE_DURATION_MS,
      yoyo: true,
      ease: "Quad.easeOut",
    });
  }

  private distanceTo(other: Unit): number {
    return Math.abs(this.sprite.x - other.sprite.x);
  }

  private findNearestOpponentInRange(opponents: readonly Unit[]): Unit | null {
    let closest: Unit | null = null;
    let closestDist = Infinity;
    for (const opponent of opponents) {
      if (!opponent.alive) continue;
      const dist = this.distanceTo(opponent);
      if (dist <= this.definition.attackRange && dist < closestDist) {
        closest = opponent;
        closestDist = dist;
      }
    }
    return closest;
  }

  private flashHit(): void {
    this.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(HIT_FLASH_MS, () => this.sprite.setTint(this.teamTint));
  }

  private die(): void {
    this.alive = false;
    this.sprite.setVisible(false);
    this.healthBar.setRatio(0);
    this.onDeath?.(this.sprite.x, this.sprite.y);
  }
}
