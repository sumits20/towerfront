import Phaser from "phaser";
import type { Side } from "@towerfront/shared";
import { HealthBar } from "./HealthBar";
import { UNIT_VISUALS, type ImplementedUnitType } from "./unitVisuals";

const HIT_FLASH_MS = 80;
const HEALTH_BAR_GAP = 10;
const LUNGE_DISTANCE = 10;
const LUNGE_DURATION_MS = 90;

/**
 * View-only ground unit — MatchRoom's `UnitState` owns all movement/combat;
 * this only renders whatever it's told via `sync()`, called every frame
 * with the current server fields. Position is only pushed to the sprite
 * when it actually changed (units stand still while attacking), so the
 * attack lunge tween isn't stomped by a same-value reassignment every frame.
 */
export class UnitView {
  private readonly scene: Phaser.Scene;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly healthBar: HealthBar;
  private readonly teamTint: number;
  private readonly directionSign: 1 | -1;
  private readonly onHit?: () => void;
  private readonly onDeath?: (x: number, y: number) => void;

  private lastX: number;
  private lastY: number;
  private lastHealth: number;
  private lastAttackFlashSeq = 0;

  constructor(
    scene: Phaser.Scene,
    side: Side,
    unitType: ImplementedUnitType,
    x: number,
    y: number,
    maxHealth: number,
    onHit?: () => void,
    onDeath?: (x: number, y: number) => void,
  ) {
    const visual = UNIT_VISUALS[unitType];
    this.scene = scene;
    this.teamTint = side === "left" ? 0x3d6bd6 : 0xd64545;
    this.directionSign = side === "left" ? 1 : -1;
    this.onHit = onHit;
    this.onDeath = onDeath;
    this.lastX = x;
    this.lastY = y;
    this.lastHealth = maxHealth;

    this.sprite = scene.add.sprite(x, y, visual.spriteKey);
    this.sprite.setDisplaySize(visual.width, visual.height);
    this.sprite.setTint(this.teamTint);
    this.sprite.setFlipX(side === "right");

    this.healthBar = new HealthBar(scene, x, y - visual.height / 2 - HEALTH_BAR_GAP, 40, 6);
  }

  sync(x: number, y: number, health: number, maxHealth: number, attackFlashSeq: number): void {
    if (x !== this.lastX) {
      this.sprite.x = x;
      this.lastX = x;
    }
    if (y !== this.lastY) {
      this.sprite.y = y;
      this.lastY = y;
    }
    this.healthBar.setPosition(this.sprite.x, this.sprite.y - this.sprite.displayHeight / 2 - HEALTH_BAR_GAP);
    this.healthBar.setRatio(health / maxHealth);

    if (health < this.lastHealth) {
      this.flashHit();
      this.onHit?.();
    }
    this.lastHealth = health;

    if (attackFlashSeq !== this.lastAttackFlashSeq) {
      this.lastAttackFlashSeq = attackFlashSeq;
      this.playAttackLunge();
    }
  }

  /** Server already removed this unit from `state.units` — it died. */
  die(): void {
    this.onDeath?.(this.sprite.x, this.sprite.y);
    this.destroy();
  }

  destroy(): void {
    this.sprite.destroy();
    this.healthBar.destroy();
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
}
