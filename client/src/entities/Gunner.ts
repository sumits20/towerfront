import Phaser from "phaser";
import { PROJECTILE_GRAVITY_Y, BATTLEFIELD_WIDTH, BATTLEFIELD_HEIGHT, type WeaponDefinition } from "@towerfront/shared";
import { SPRITE_KEYS } from "../assetKeys";

const BARREL_LENGTH = 46;
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
 * Fixed gunner position on top of a tower (build plan 3.1: "A fixed gunner
 * position on top of each tower", 8.1: aim via mouse movement). Owns the
 * equipped weapon's magazine/reload/fire-rate state (build plan action #10).
 */
export class Gunner {
  readonly x: number;
  readonly y: number;
  private readonly weapon: WeaponDefinition;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly ammoText: Phaser.GameObjects.Text;
  private readonly trajectoryGraphics?: Phaser.GameObjects.Graphics;

  private ammo: number;
  private reloading = false;
  private nextFireAtMs = 0;
  private reloadTimer: Phaser.Time.TimerEvent | null = null;
  private readonly onReloadStart?: () => void;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    weapon: WeaponDefinition,
    onReloadStart?: () => void,
    showTrajectoryPreview = false,
  ) {
    this.x = x;
    this.y = y;
    this.weapon = weapon;
    this.ammo = weapon.magazineSize;
    this.onReloadStart = onReloadStart;

    this.sprite = scene.add.sprite(x, y, SPRITE_KEYS.gunner);
    this.sprite.setOrigin(GUNNER_ORIGIN_X, GUNNER_ORIGIN_Y);
    this.sprite.setDisplaySize(GUNNER_DISPLAY_WIDTH, GUNNER_DISPLAY_HEIGHT);
    this.sprite.setTint(0xf2c14e);

    this.ammoText = scene.add
      .text(x, y - 40, this.formatAmmo(), {
        fontFamily: "monospace",
        fontSize: "16px",
        color: "#f2c14e",
      })
      .setOrigin(0.5, 1);

    if (showTrajectoryPreview) {
      this.trajectoryGraphics = scene.add.graphics();
    }
  }

  /**
   * Rotates the sprite to face (targetX, targetY), keeping it upright: past
   * ±90° (target behind the sprite's default rightward-facing art) it flips
   * horizontally instead of continuing to rotate through vertical, which
   * would otherwise render the gunner upside-down. Returns the true,
   * unclamped angle — muzzle position and projectile velocity must use the
   * real geometry, not the visually-adjusted rotation.
   */
  aimAt(targetX: number, targetY: number): number {
    const angle = Phaser.Math.Angle.Between(this.x, this.y, targetX, targetY);
    const facingLeft = Math.cos(angle) < 0;

    if (facingLeft) {
      this.sprite.setFlipX(true);
      this.sprite.rotation = Phaser.Math.Angle.Wrap(Math.PI - angle);
    } else {
      this.sprite.setFlipX(false);
      this.sprite.rotation = angle;
    }

    if (this.trajectoryGraphics) {
      this.drawTrajectoryPreview(angle);
    }
    return angle;
  }

  /** Returns the spawn point + angle for a new projectile, or null if the weapon can't fire right now. */
  tryFire(nowMs: number, angle: number): { x: number; y: number; angle: number; damage: number } | null {
    if (this.reloading) return null;
    if (this.ammo <= 0) {
      this.startReload(nowMs);
      return null;
    }
    if (nowMs < this.nextFireAtMs) return null;

    this.ammo -= 1;
    this.nextFireAtMs = nowMs + this.weapon.fireCooldownMs;
    this.ammoText.setText(this.formatAmmo());

    const muzzleX = this.x + Math.cos(angle) * BARREL_LENGTH;
    const muzzleY = this.y + Math.sin(angle) * BARREL_LENGTH;
    return { x: muzzleX, y: muzzleY, angle, damage: this.weapon.damage };
  }

  startReload(nowMs: number): void {
    if (this.reloading || this.ammo === this.weapon.magazineSize) return;
    this.reloading = true;
    this.ammoText.setText("RELOADING");
    this.onReloadStart?.();
    this.reloadTimer?.remove();
    this.reloadTimer = this.sprite.scene.time.delayedCall(this.weapon.reloadTimeMs, () => {
      this.ammo = this.weapon.magazineSize;
      this.reloading = false;
      this.nextFireAtMs = nowMs + this.weapon.reloadTimeMs;
      this.ammoText.setText(this.formatAmmo());
    });
  }

  get projectileSpeed(): number {
    return this.weapon.projectileSpeed;
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

  private formatAmmo(): string {
    return `${this.ammo} / ${this.weapon.magazineSize}`;
  }
}
