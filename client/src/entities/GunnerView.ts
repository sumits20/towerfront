import Phaser from "phaser";
import { PROJECTILE_GRAVITY_Y, BATTLEFIELD_WIDTH, BATTLEFIELD_HEIGHT, BARREL_LENGTH, type WeaponDefinition } from "@towerfront/shared";
import { SPRITE_KEYS } from "../assetKeys";

const GUNNER_DISPLAY_WIDTH = 84;
const GUNNER_DISPLAY_HEIGHT = 50;
// Fraction of the sprite's own art (viewBox 100x60) where the torso/shoulder
// pivot sits, so rotation swings the gun around the fixed tower-top anchor
// instead of around the sprite's bounding-box center.
const GUNNER_ORIGIN_X = 31 / 100;
const GUNNER_ORIGIN_Y = 28 / 60;

const TRAJECTORY_DOT_COUNT = 7;
const TRAJECTORY_STEP_SECONDS = 0.09;

/**
 * View-only gunner — MatchRoom owns ammo/reload/fire-rate entirely; this
 * class only ever renders whatever it's told. The own-side gunner is
 * rotated from local mouse input (immediate, no round-trip needed since
 * rotation is cosmetic — the server independently computes the same angle
 * from the `fire`/`aim` message payload); the opponent's is rotated from
 * the broadcast `gunnerAimAngle` via `setAimAngle`.
 */
export class GunnerView {
  readonly x: number;
  readonly y: number;
  private readonly weapon: WeaponDefinition;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly ammoText: Phaser.GameObjects.Text;
  private readonly trajectoryGraphics?: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, x: number, y: number, weapon: WeaponDefinition, showTrajectoryPreview = false) {
    this.x = x;
    this.y = y;
    this.weapon = weapon;

    this.sprite = scene.add.sprite(x, y, SPRITE_KEYS.gunner);
    this.sprite.setOrigin(GUNNER_ORIGIN_X, GUNNER_ORIGIN_Y);
    this.sprite.setDisplaySize(GUNNER_DISPLAY_WIDTH, GUNNER_DISPLAY_HEIGHT);
    this.sprite.setTint(0xf2c14e);

    this.ammoText = scene.add
      .text(x, y - 40, "", { fontFamily: "monospace", fontSize: "16px", color: "#f2c14e" })
      .setOrigin(0.5, 1);

    if (showTrajectoryPreview) {
      this.trajectoryGraphics = scene.add.graphics();
    }
  }

  /** Rotates to face (targetX, targetY) and returns the true, unclamped angle — callers computing a muzzle/fire angle must use this, not the sprite's visually-clamped rotation. */
  aimAt(targetX: number, targetY: number): number {
    const angle = Phaser.Math.Angle.Between(this.x, this.y, targetX, targetY);
    this.setAimAngle(angle);
    return angle;
  }

  /**
   * Same rotation as `aimAt`, but from an already-known angle — used for the
   * opponent's gunner, driven by the broadcast `gunnerAimAngle` rather than
   * a local pointer position. Keeps the sprite upright: past ±90° it flips
   * horizontally instead of continuing to rotate through vertical.
   */
  setAimAngle(angle: number): void {
    const facingLeft = Math.cos(angle) < 0;
    if (facingLeft) {
      this.sprite.setFlipX(true);
      // Phaser applies scale (the flip) before rotation, so a flipped
      // sprite's local +X axis points at world -X: rotating by `angle`
      // directly would then aim at the *mirror* of the intended direction
      // (confirmed empirically — aiming up-behind rendered the barrel
      // pointing down-behind, and vice versa). `angle + PI` cancels that
      // out: for a target direction (cos a, sin a), the rendered direction
      // is (-cos r, -sin r), which only equals (cos a, sin a) when
      // r = a + PI, not PI - a.
      this.sprite.rotation = Phaser.Math.Angle.Wrap(angle + Math.PI);
    } else {
      this.sprite.setFlipX(false);
      this.sprite.rotation = angle;
    }

    if (this.trajectoryGraphics) {
      this.drawTrajectoryPreview(angle);
    }
  }

  setAmmo(ammo: number, magazineSize: number, reloading: boolean): void {
    this.ammoText.setText(reloading ? "RELOADING" : `${ammo} / ${magazineSize}`);
  }

  private drawTrajectoryPreview(angle: number): void {
    const g = this.trajectoryGraphics!;
    g.clear();

    const muzzleX = this.x + Math.cos(angle) * BARREL_LENGTH;
    const muzzleY = this.y + Math.sin(angle) * BARREL_LENGTH;
    const vx = Math.cos(angle) * this.weapon.projectileSpeed;
    const vy = Math.sin(angle) * this.weapon.projectileSpeed;

    g.fillStyle(0xffe08a, 0.5);
    for (let i = 1; i <= TRAJECTORY_DOT_COUNT; i++) {
      const t = i * TRAJECTORY_STEP_SECONDS;
      const px = muzzleX + vx * t;
      const py = muzzleY + vy * t + 0.5 * PROJECTILE_GRAVITY_Y * t * t;
      if (px < 0 || px > BATTLEFIELD_WIDTH || py > BATTLEFIELD_HEIGHT) break;
      g.fillCircle(px, py, 3);
    }
  }
}
