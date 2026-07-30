import Phaser from "phaser";

export interface PurchaseButtonOptions {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly title: string;
  readonly onClick: () => void;
  /** Set false for a display-only button (e.g. the AI-controlled side's buttons in this single-client session). Defaults to true. */
  readonly interactive?: boolean;
}

const ENABLED_FILL = 0x1f2430;
const DISABLED_FILL = 0x14161d;

/** A clickable button: title + a status line (price, cooldown countdown, or a hint). */
export class PurchaseButton {
  private readonly bg: Phaser.GameObjects.Rectangle;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly statusText: Phaser.GameObjects.Text;
  private enabled = true;

  constructor(scene: Phaser.Scene, options: PurchaseButtonOptions) {
    const { x, y, width, height, title, onClick, interactive = true } = options;

    this.bg = scene.add.rectangle(x, y, width, height, ENABLED_FILL).setOrigin(0, 0).setStrokeStyle(2, 0x4a5064);

    if (interactive) {
      this.bg.setInteractive({ useHandCursor: true }).on(Phaser.Input.Events.POINTER_DOWN, () => {
        if (this.enabled) onClick();
      });
    }

    this.titleText = scene.add
      .text(x + width / 2, y + 8, title, {
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#e6e8ee",
      })
      .setOrigin(0.5, 0);

    this.statusText = scene.add
      .text(x + width / 2, y + height - 8, "", {
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#f2c14e",
      })
      .setOrigin(0.5, 1);
  }

  setStatus(text: string, affordableAndReady: boolean): void {
    this.statusText.setText(text);
    if (affordableAndReady === this.enabled) return;
    this.enabled = affordableAndReady;
    this.bg.setFillStyle(this.enabled ? ENABLED_FILL : DISABLED_FILL);
    this.bg.setAlpha(this.enabled ? 1 : 0.55);
  }

  destroy(): void {
    this.bg.destroy();
    this.titleText.destroy();
    this.statusText.destroy();
  }
}
