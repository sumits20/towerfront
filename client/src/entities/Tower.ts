import Phaser from "phaser";
import type { Side } from "@towerfront/shared";
import { HealthBar } from "./HealthBar";
import { SPRITE_KEYS } from "../assetKeys";

const TOWER_WIDTH = 90;
const TOWER_HEIGHT = 220;
export const TOWER_MAX_HEALTH = 1000;

const HIT_FLASH_MS = 100;
const SHAKE_DURATION_MS = 120;
const SHAKE_INTENSITY = 0.004;

export class Tower {
  readonly side: Side;
  readonly x: number;
  readonly groundY: number;
  health = TOWER_MAX_HEALTH;
  private readonly scene: Phaser.Scene;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly healthBar: HealthBar;
  private readonly teamTint: number;
  private readonly onHit?: () => void;

  constructor(scene: Phaser.Scene, side: Side, x: number, groundY: number, onHit?: () => void) {
    this.scene = scene;
    this.side = side;
    this.x = x;
    this.groundY = groundY;
    this.teamTint = side === "left" ? 0x3d6bd6 : 0xd64545;
    this.onHit = onHit;

    this.sprite = scene.add.sprite(x, groundY - TOWER_HEIGHT / 2, SPRITE_KEYS.tower);
    this.sprite.setDisplaySize(TOWER_WIDTH, TOWER_HEIGHT);
    this.sprite.setTint(this.teamTint);

    this.healthBar = new HealthBar(scene, x, groundY - TOWER_HEIGHT - 26, 120, 12);
  }

  /** World position of the fixed gunner position on top of this tower. */
  getGunnerAnchor(): { x: number; y: number } {
    return { x: this.x, y: this.groundY - TOWER_HEIGHT };
  }

  /** X-coordinate of the tower's edge facing the lane, where units go melee it. */
  get laneEdgeX(): number {
    return this.side === "left" ? this.x + TOWER_WIDTH / 2 : this.x - TOWER_WIDTH / 2;
  }

  takeDamage(amount: number): boolean {
    this.health = Math.max(0, this.health - amount);
    this.healthBar.setRatio(this.health / TOWER_MAX_HEALTH);
    this.flashHit();
    this.scene.cameras.main.shake(SHAKE_DURATION_MS, SHAKE_INTENSITY);
    this.onHit?.();
    return this.health <= 0;
  }

  /** Repair pickup effect (build plan section 6 goodies). */
  repair(amount: number): void {
    this.health = Math.min(TOWER_MAX_HEALTH, this.health + amount);
    this.healthBar.setRatio(this.health / TOWER_MAX_HEALTH);
    this.flashHeal();
  }

  private flashHit(): void {
    this.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(HIT_FLASH_MS, () => this.sprite.setTint(this.teamTint));
  }

  private flashHeal(): void {
    this.sprite.setTintFill(0x4caf50);
    this.scene.time.delayedCall(HIT_FLASH_MS, () => this.sprite.setTint(this.teamTint));
  }
}
