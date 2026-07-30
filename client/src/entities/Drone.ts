import Phaser from "phaser";
import type { Side, UnitDefinition } from "@towerfront/shared";
import { HealthBar } from "./HealthBar";
import { Tower } from "./Tower";
import { Unit } from "./Unit";
import { UNIT_VISUALS } from "./unitVisuals";
import { SPRITE_KEYS } from "../assetKeys";

const HIT_FLASH_MS = 80;
const HEALTH_BAR_GAP = 10;
const LUNGE_DISTANCE = 8;
const LUNGE_DURATION_MS = 90;
const SHOT_DISPLAY_WIDTH = 20;
const SHOT_DISPLAY_HEIGHT = 9;
const SHOT_TRAVEL_MS = 130;

// "pick a sensible height range... 100-250px above the lane" — governs idle
// wandering altitude only; engagement range (below) is horizontal-only, same
// as every other unit's range check, so the sky band never blocks combat.
const SKY_BAND_MIN_HEIGHT = 100;
const SKY_BAND_MAX_HEIGHT = 250;
const VERTICAL_WANDER_SPEED = 30;
const WANDER_RETARGET_MIN_MS = 2000;
const WANDER_RETARGET_MAX_MS = 3500;
const TOWER_HOVER_MARGIN = 20;

type DroneTarget = Unit | Drone;

/**
 * Ranged, freely-2D-moving unit (fourth purchasable unit). Unlike the ground
 * units it never attacks towers — it just stops short of the enemy tower's
 * edge and hovers. Targeting prioritizes the nearest opposing Drone anywhere
 * on the field; failing that, the nearest opposing ground Unit anywhere on
 * the field — in both cases it actively flies (horizontally) into its own
 * attack range rather than only reacting once something wanders into range.
 */
export class Drone {
  readonly side: Side;
  readonly definition: UnitDefinition;
  readonly sprite: Phaser.GameObjects.Sprite;
  health: number;
  alive = true;

  private readonly scene: Phaser.Scene;
  private readonly healthBar: HealthBar;
  private readonly teamTint: number;
  private readonly directionSign: 1 | -1;
  private readonly groundY: number;
  private readonly onDeath?: (x: number, y: number) => void;
  private readonly onHit?: () => void;

  private target: DroneTarget | null = null;
  private nextAttackAtMs = 0;
  private wanderTargetY: number;
  private nextWanderPickAtMs = 0;

  constructor(
    scene: Phaser.Scene,
    side: Side,
    definition: UnitDefinition,
    x: number,
    groundY: number,
    onDeath?: (x: number, y: number) => void,
    onHit?: () => void,
  ) {
    const visual = UNIT_VISUALS.drone;

    this.scene = scene;
    this.side = side;
    this.definition = definition;
    this.health = definition.maxHealth;
    this.directionSign = side === "left" ? 1 : -1;
    this.groundY = groundY;
    this.onDeath = onDeath;
    this.onHit = onHit;
    this.teamTint = side === "left" ? 0x3d6bd6 : 0xd64545;

    const y = groundY - Phaser.Math.Between(SKY_BAND_MIN_HEIGHT, SKY_BAND_MAX_HEIGHT);
    this.sprite = scene.add.sprite(x, y, visual.spriteKey);
    this.sprite.setDisplaySize(visual.width, visual.height);
    this.sprite.setTint(this.teamTint);
    this.sprite.setFlipX(side === "right");

    this.wanderTargetY = y;
    this.healthBar = new HealthBar(scene, x, y - visual.height / 2 - HEALTH_BAR_GAP, 40, 6);
  }

  update(
    nowMs: number,
    deltaMs: number,
    opposingDrones: readonly Drone[],
    opposingUnits: readonly Unit[],
    enemyTower: Tower,
  ): void {
    if (!this.alive) return;

    this.updateVerticalWander(nowMs, deltaMs);

    if (this.target && !this.target.alive) {
      this.target = null;
    }
    if (!this.target) {
      this.target = this.findPriorityTarget(opposingDrones, opposingUnits);
    }

    if (this.target) {
      const target = this.target;
      const dist = Math.abs(this.sprite.x - target.sprite.x);
      if (dist <= this.definition.attackRange) {
        this.tryAttack(nowMs, target, () => target.takeDamage(this.definition.attackDamage));
      } else {
        this.moveTowardX(target.sprite.x, deltaMs);
      }
    } else {
      this.advanceTowardEnemy(deltaMs, enemyTower);
    }

    this.repositionHealthBar();
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

  private findPriorityTarget(
    opposingDrones: readonly Drone[],
    opposingUnits: readonly Unit[],
  ): DroneTarget | null {
    const nearestDrone = this.findNearest(opposingDrones);
    if (nearestDrone) return nearestDrone;
    return this.findNearest(opposingUnits);
  }

  private findNearest<T extends DroneTarget>(candidates: readonly T[]): T | null {
    let closest: T | null = null;
    let closestDist = Infinity;
    for (const candidate of candidates) {
      if (!candidate.alive) continue;
      const dist = Math.abs(this.sprite.x - candidate.sprite.x);
      if (dist < closestDist) {
        closest = candidate;
        closestDist = dist;
      }
    }
    return closest;
  }

  private moveTowardX(targetX: number, deltaMs: number): void {
    const step = this.definition.moveSpeed * (deltaMs / 1000);
    if (Math.abs(targetX - this.sprite.x) <= step) {
      this.sprite.x = targetX;
    } else {
      this.sprite.x += targetX > this.sprite.x ? step : -step;
    }
  }

  private advanceTowardEnemy(deltaMs: number, enemyTower: Tower): void {
    const nextX = this.sprite.x + this.directionSign * this.definition.moveSpeed * (deltaMs / 1000);
    const hoverLimit = enemyTower.laneEdgeX - this.directionSign * TOWER_HOVER_MARGIN;
    // Never damages towers — just stop short of the edge and hover instead of attacking.
    this.sprite.x = this.directionSign > 0 ? Math.min(nextX, hoverLimit) : Math.max(nextX, hoverLimit);
  }

  private updateVerticalWander(nowMs: number, deltaMs: number): void {
    if (nowMs >= this.nextWanderPickAtMs) {
      this.wanderTargetY = this.groundY - Phaser.Math.Between(SKY_BAND_MIN_HEIGHT, SKY_BAND_MAX_HEIGHT);
      this.nextWanderPickAtMs = nowMs + Phaser.Math.Between(WANDER_RETARGET_MIN_MS, WANDER_RETARGET_MAX_MS);
    }

    const step = VERTICAL_WANDER_SPEED * (deltaMs / 1000);
    if (Math.abs(this.wanderTargetY - this.sprite.y) <= step) {
      this.sprite.y = this.wanderTargetY;
    } else {
      this.sprite.y += this.wanderTargetY > this.sprite.y ? step : -step;
    }
  }

  private repositionHealthBar(): void {
    this.healthBar.setPosition(this.sprite.x, this.sprite.y - this.sprite.displayHeight / 2 - HEALTH_BAR_GAP);
  }

  private tryAttack(nowMs: number, target: DroneTarget, dealDamage: () => void): void {
    if (nowMs < this.nextAttackAtMs) return;
    dealDamage();
    this.nextAttackAtMs = nowMs + this.definition.attackCooldownMs;
    this.playAttackLunge();
    this.fireProjectileEffect(target);
  }

  /**
   * Purely visual — damage is already applied synchronously by `dealDamage`
   * above. A straight-line (no gravity), team-tinted streak from the drone
   * to its target, distinct from the player/AI rifle's arcing projectiles.
   */
  private fireProjectileEffect(target: DroneTarget): void {
    const shot = this.scene.add.sprite(this.sprite.x, this.sprite.y, SPRITE_KEYS.projectile);
    shot.setDisplaySize(SHOT_DISPLAY_WIDTH, SHOT_DISPLAY_HEIGHT);
    shot.setTint(this.teamTint);
    shot.setRotation(Phaser.Math.Angle.Between(this.sprite.x, this.sprite.y, target.sprite.x, target.sprite.y));

    this.scene.tweens.add({
      targets: shot,
      x: target.sprite.x,
      y: target.sprite.y,
      duration: SHOT_TRAVEL_MS,
      onComplete: () => shot.destroy(),
    });
  }

  private playAttackLunge(): void {
    this.scene.tweens.add({
      targets: this.sprite,
      x: this.sprite.x + LUNGE_DISTANCE * this.directionSign,
      duration: LUNGE_DURATION_MS,
      yoyo: true,
      ease: "Quad.easeOut",
    });
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
