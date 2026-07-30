import Phaser from "phaser";

export class HealthBar {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly width: number;
  private readonly height: number;
  private x: number;
  private y: number;
  private ratio = 1;

  constructor(scene: Phaser.Scene, x: number, y: number, width = 90, height = 10) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.graphics = scene.add.graphics();
    this.draw();
  }

  setPosition(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.draw();
  }

  setRatio(ratio: number): void {
    this.ratio = Phaser.Math.Clamp(ratio, 0, 1);
    this.draw();
  }

  private draw(): void {
    const g = this.graphics;
    g.clear();
    const left = this.x - this.width / 2;
    const top = this.y - this.height / 2;

    g.fillStyle(0x000000, 0.55);
    g.fillRect(left - 2, top - 2, this.width + 4, this.height + 4);

    g.fillStyle(0x3a3f4b, 1);
    g.fillRect(left, top, this.width, this.height);

    const fillColor = this.ratio > 0.5 ? 0x4caf50 : this.ratio > 0.25 ? 0xe0a72a : 0xd6453d;
    g.fillStyle(fillColor, 1);
    g.fillRect(left, top, this.width * this.ratio, this.height);
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
