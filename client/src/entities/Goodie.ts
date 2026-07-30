import Phaser from "phaser";
import { SPRITE_KEYS } from "../assetKeys";

export type GoodieType = "gold" | "repair";

const DISPLAY_SIZE = 34;
// Slow constant downward drift, not gravity-accelerated — "falling slowly
// like a balloon" (build plan section 6 sky goodies).
const DRIFT_SPEED = 40;
const GOLD_TINT = 0xf2c14e;
const REPAIR_TINT = 0x4caf50;

/**
 * A falling sky pickup. Purely visual/positional — the scene decides what
 * effect `type` has and applies it once a rifle projectile hits this.
 */
export class Goodie {
  readonly type: GoodieType;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly label: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, type: GoodieType, x: number, startY: number) {
    this.type = type;

    this.sprite = scene.add.sprite(x, startY, SPRITE_KEYS.goodie);
    this.sprite.setDisplaySize(DISPLAY_SIZE, DISPLAY_SIZE);
    this.sprite.setTint(type === "gold" ? GOLD_TINT : REPAIR_TINT);

    this.label = scene.add
      .text(x, startY, type === "gold" ? "G" : "R", {
        fontFamily: "monospace",
        fontSize: "16px",
        fontStyle: "bold",
        color: "#0b0c10",
      })
      .setOrigin(0.5);
  }

  update(deltaMs: number): void {
    const dy = DRIFT_SPEED * (deltaMs / 1000);
    this.sprite.y += dy;
    this.label.y += dy;
  }

  get y(): number {
    return this.sprite.y;
  }

  getBounds(): Phaser.Geom.Rectangle {
    return this.sprite.getBounds();
  }

  destroy(): void {
    this.sprite.destroy();
    this.label.destroy();
  }
}
