import Phaser from "phaser";
import type { GoodieType } from "@towerfront/shared";
import { SPRITE_KEYS } from "../assetKeys";

const DISPLAY_SIZE = 34;
const GOLD_TINT = 0xf2c14e;
const REPAIR_TINT = 0x4caf50;

/** View-only sky goodie — `GoodieState.step()` on the server owns the drift; this only renders wherever it currently is. */
export class GoodieView {
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly label: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, goodieType: GoodieType, x: number, y: number) {
    this.sprite = scene.add.sprite(x, y, SPRITE_KEYS.goodie);
    this.sprite.setDisplaySize(DISPLAY_SIZE, DISPLAY_SIZE);
    this.sprite.setTint(goodieType === "gold" ? GOLD_TINT : REPAIR_TINT);

    this.label = scene.add
      .text(x, y, goodieType === "gold" ? "G" : "R", {
        fontFamily: "monospace",
        fontSize: "16px",
        fontStyle: "bold",
        color: "#0b0c10",
      })
      .setOrigin(0.5);
  }

  sync(x: number, y: number): void {
    this.sprite.setPosition(x, y);
    this.label.setPosition(x, y);
  }

  destroy(): void {
    this.sprite.destroy();
    this.label.destroy();
  }
}
