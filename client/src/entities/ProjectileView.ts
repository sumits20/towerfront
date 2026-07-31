import Phaser from "phaser";
import { SPRITE_KEYS } from "../assetKeys";

const DISPLAY_WIDTH = 26;
const DISPLAY_HEIGHT = 11;

/** View-only rifle projectile — `ProjectileState.step()` on the server owns the gravity-arced flight; this only renders wherever it currently is. */
export class ProjectileView {
  private readonly sprite: Phaser.GameObjects.Sprite;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.sprite = scene.add.sprite(x, y, SPRITE_KEYS.projectile);
    this.sprite.setDisplaySize(DISPLAY_WIDTH, DISPLAY_HEIGHT);
  }

  sync(x: number, y: number, vx: number, vy: number): void {
    this.sprite.setPosition(x, y);
    this.sprite.setRotation(Math.atan2(vy, vx));
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
