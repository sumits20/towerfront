import Phaser from "phaser";
import type { Side } from "@towerfront/shared";
import { HealthBar } from "./HealthBar";
import { SPRITE_KEYS } from "../assetKeys";

const TOWER_WIDTH = 90;
const TOWER_HEIGHT = 220;
const HIT_FLASH_MS = 100;
const SHAKE_DURATION_MS = 120;
const SHAKE_INTENSITY = 0.004;

/**
 * View-only tower — no simulation of its own. Every visual change is driven
 * by watching `PlayerState` fields the server broadcasts (health ratio, plus
 * the hit/heal flash sequence counters used to trigger one-shot effects on
 * deltas the raw health number alone can't distinguish, e.g. two hits that
 * net to the same total).
 */
export class TowerView {
  private readonly scene: Phaser.Scene;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly healthBar: HealthBar;
  private readonly teamTint: number;

  constructor(scene: Phaser.Scene, side: Side, x: number, groundY: number) {
    this.scene = scene;
    this.teamTint = side === "left" ? 0x3d6bd6 : 0xd64545;

    this.sprite = scene.add.sprite(x, groundY - TOWER_HEIGHT / 2, SPRITE_KEYS.tower);
    this.sprite.setDisplaySize(TOWER_WIDTH, TOWER_HEIGHT);
    this.sprite.setTint(this.teamTint);

    this.healthBar = new HealthBar(scene, x, groundY - TOWER_HEIGHT - 26, 120, 12);
  }

  setHealthRatio(ratio: number): void {
    this.healthBar.setRatio(ratio);
  }

  flashHit(): void {
    this.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(HIT_FLASH_MS, () => this.sprite.setTint(this.teamTint));
    this.scene.cameras.main.shake(SHAKE_DURATION_MS, SHAKE_INTENSITY);
  }

  flashHeal(): void {
    this.sprite.setTintFill(0x4caf50);
    this.scene.time.delayedCall(HIT_FLASH_MS, () => this.sprite.setTint(this.teamTint));
  }
}
