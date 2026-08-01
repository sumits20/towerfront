import Phaser from "phaser";
import {
  WEAPON_DEFINITIONS,
  UNIT_DEFINITIONS,
  type Side,
  BATTLEFIELD_WIDTH,
  BATTLEFIELD_HEIGHT,
  GROUND_Y,
  TOWER_MARGIN_X,
  STARTING_MONEY,
  PROJECTILE_GRAVITY_Y,
  BARREL_LENGTH,
  GOODIE_MIN_INTERVAL_MS,
  GOODIE_MAX_INTERVAL_MS,
  GOODIE_SPAWN_MARGIN,
  GOODIE_START_Y,
  GOODIE_GOLD_AMOUNT,
  GOODIE_REPAIR_AMOUNT,
  GOODIE_DRIFT_SPEED,
  AI_AIM_SPREAD_RAD,
  AI_INITIAL_DELAY_MIN_MS,
  AI_INITIAL_DELAY_MAX_MS,
  EasyAiController,
  MAX_PLAYER_NAME_LENGTH,
  type GoodieType,
} from "@towerfront/shared";
import { Tower } from "../entities/Tower";
import { GunnerView } from "../entities/GunnerView";
import { Unit } from "../entities/Unit";
import { Drone } from "../entities/Drone";
import { GoodieView } from "../entities/GoodieView";
import type { ImplementedUnitType } from "../entities/unitVisuals";
import { SPRITE_KEYS, SPRITE_PATHS } from "../assetKeys";
import { AUDIO_KEYS, AUDIO_PATHS } from "../audioKeys";
import { PurchaseButton } from "../ui/PurchaseButton";
import { winnerLabel } from "../ui/winnerLabel";
import { AudioManager } from "../audio/AudioManager";

const PROJECTILE_DISPLAY_WIDTH = 26;
const PROJECTILE_DISPLAY_HEIGHT = 11;
const UNIT_DEATH_PARTICLE_COUNT = 10;
const UNIT_SPAWN_OFFSET = 70;
const SIDES: readonly Side[] = ["left", "right"];
const PURCHASABLE_UNIT_TYPES: readonly ImplementedUnitType[] = ["recruit", "runner", "shieldUnit", "drone"];
const AI_SIDE: Side = "right";
const PASSIVE_INCOME_AMOUNT = 10;
const PASSIVE_INCOME_INTERVAL_MS = 5000;

export interface StartData {
  readonly autoStart?: boolean;
  readonly playerName?: string;
}

/**
 * Build plan phase 1+2+3 (partial): rifle combat sandbox, the unit lane
 * prototype (Recruit/Runner/Shield Unit), and the start of the bounty
 * economy (rifle fire damages/kills opposing units, final-hit bounty award,
 * passive income). Both towers have a gunner; the right side's purchases AND
 * shooting are driven by a build-plan-section-7 "Easy" AI.
 */
export class CombatSandboxScene extends Phaser.Scene {
  private leftTower!: Tower;
  private rightTower!: Tower;
  /** View-only — this scene owns the ammo/fire-cooldown/reload simulation itself below, mirroring MatchRoom's per-side state pattern (build plan 5.2's authoritative-server rule applies just as well locally: one place decides, the view only ever renders). */
  private gunnerViews!: Record<Side, GunnerView>;
  private gunnerAmmo!: Record<Side, number>;
  private gunnerReloading!: Record<Side, boolean>;
  private nextFireAtMs!: Record<Side, number>;
  private reloadCompleteAtMs!: Record<Side, number>;
  private projectiles!: Phaser.Physics.Arcade.Group;
  private deathParticles!: Phaser.GameObjects.Particles.ParticleEmitter;
  private reloadKey!: Phaser.Input.Keyboard.Key;
  private purchaseKeys!: Record<ImplementedUnitType, Phaser.Input.Keyboard.Key>;
  private aimAngle = 0;

  private leftUnits: Unit[] = [];
  private rightUnits: Unit[] = [];
  private leftDrones: Drone[] = [];
  private rightDrones: Drone[] = [];
  private money!: Record<Side, number>;
  private cooldownUntilMs!: Record<Side, Partial<Record<ImplementedUnitType, number>>>;
  private purchaseButtons: Record<Side, Partial<Record<ImplementedUnitType, PurchaseButton>>> = {
    left: {},
    right: {},
  };
  private moneyText!: Record<Side, Phaser.GameObjects.Text>;
  private ai!: EasyAiController;
  private audio!: AudioManager;
  private muteButton!: PurchaseButton;

  /** View-only, like the gunners — this scene owns the drift/despawn simulation itself below (see updateGoodie), matching how GoodieState.step() owns it server-side for online play. */
  private goodieView?: GoodieView;
  private activeGoodieType: GoodieType | null = null;
  private activeGoodieX = 0;
  private activeGoodieY = 0;
  private nextGoodieAtMs = 0;

  private started = false;
  private matchOver = false;
  private autoStart = false;
  private playerName = "Player";
  private startOverlayObjects: Phaser.GameObjects.GameObject[] = [];
  private startButton?: PurchaseButton;

  constructor() {
    super("CombatSandboxScene");
  }

  init(data: StartData): void {
    this.autoStart = data?.autoStart ?? false;
    this.playerName = data?.playerName?.trim().slice(0, MAX_PLAYER_NAME_LENGTH) || "Player";
  }

  preload(): void {
    this.load.svg(SPRITE_KEYS.tower, SPRITE_PATHS.tower, { width: 100, height: 240 });
    this.load.svg(SPRITE_KEYS.gunner, SPRITE_PATHS.gunner, { width: 100, height: 60 });
    this.load.svg(SPRITE_KEYS.projectile, SPRITE_PATHS.projectile, { width: 32, height: 14 });
    this.load.svg(SPRITE_KEYS.recruit, SPRITE_PATHS.recruit, { width: 48, height: 60 });
    this.load.svg(SPRITE_KEYS.runner, SPRITE_PATHS.runner, { width: 40, height: 54 });
    this.load.svg(SPRITE_KEYS.shieldUnit, SPRITE_PATHS.shieldUnit, { width: 54, height: 66 });
    this.load.svg(SPRITE_KEYS.drone, SPRITE_PATHS.drone, { width: 60, height: 40 });
    this.load.svg(SPRITE_KEYS.goodie, SPRITE_PATHS.goodie, { width: 40, height: 40 });

    for (const key of Object.keys(AUDIO_KEYS) as (keyof typeof AUDIO_KEYS)[]) {
      this.load.audio(AUDIO_KEYS[key], AUDIO_PATHS[AUDIO_KEYS[key]]);
    }
  }

  create(): void {
    // create() re-runs on every scene.restart(), so every piece of mutable
    // per-match state is (re)initialized here rather than via field
    // initializers, which only run once when the scene object is first
    // constructed.
    this.leftUnits = [];
    this.rightUnits = [];
    this.leftDrones = [];
    this.rightDrones = [];
    this.goodieView?.destroy();
    this.goodieView = undefined;
    this.activeGoodieType = null;
    this.nextGoodieAtMs = 0;
    this.money = { left: STARTING_MONEY, right: STARTING_MONEY };
    this.cooldownUntilMs = { left: {}, right: {} };
    this.purchaseButtons = { left: {}, right: {} };
    this.started = false;
    this.matchOver = false;
    this.aimAngle = 0;
    const magazineSize = WEAPON_DEFINITIONS.rifle.magazineSize;
    this.gunnerAmmo = { left: magazineSize, right: magazineSize };
    this.gunnerReloading = { left: false, right: false };
    this.nextFireAtMs = { left: 0, right: 0 };
    this.reloadCompleteAtMs = { left: 0, right: 0 };
    this.startOverlayObjects = [];
    this.startButton = undefined;
    this.ai = new EasyAiController(
      AI_INITIAL_DELAY_MIN_MS + Math.random() * (AI_INITIAL_DELAY_MAX_MS - AI_INITIAL_DELAY_MIN_MS),
    );
    this.audio = new AudioManager(this);

    this.drawBackground();
    this.createDeathParticles();

    const onTowerHit = () => this.audio.play(AUDIO_KEYS.impactTower);
    this.leftTower = new Tower(this, "left", TOWER_MARGIN_X, GROUND_Y, onTowerHit);
    this.rightTower = new Tower(this, "right", BATTLEFIELD_WIDTH - TOWER_MARGIN_X, GROUND_Y, onTowerHit);

    const leftAnchor = this.leftTower.getGunnerAnchor();
    const rightAnchor = this.rightTower.getGunnerAnchor();
    this.gunnerViews = {
      left: new GunnerView(this, leftAnchor.x, leftAnchor.y, WEAPON_DEFINITIONS.rifle, true),
      right: new GunnerView(this, rightAnchor.x, rightAnchor.y, WEAPON_DEFINITIONS.rifle, false),
    };
    for (const side of SIDES) {
      this.gunnerViews[side].setAmmo(this.gunnerAmmo[side], magazineSize, false);
    }

    this.projectiles = this.physics.add.group();

    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      this.aimAngle = this.gunnerViews.left.aimAt(pointer.worldX, pointer.worldY);
    });
    this.input.on(
      Phaser.Input.Events.POINTER_DOWN,
      (_pointer: Phaser.Input.Pointer, hitObjects: Phaser.GameObjects.GameObject[]) => {
        // Don't fire the rifle when the click actually landed on a UI button.
        if (hitObjects.length > 0) return;
        if (!this.started || this.matchOver) return;
        this.fireWeapon("left", this.aimAngle);
      },
    );

    this.reloadKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.purchaseKeys = {
      recruit: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ONE),
      runner: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.TWO),
      shieldUnit: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.THREE),
      drone: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.FOUR),
    };

    this.createEconomyUi();
    this.createMuteButton();
    this.createStartOverlay();

    if (this.autoStart) {
      this.beginMatch();
    }
  }

  override update(time: number, delta: number): void {
    if (this.started && !this.matchOver) {
      this.updateReloads(time);
      if (Phaser.Input.Keyboard.JustDown(this.reloadKey)) {
        this.startReload("left");
      }
      for (const unitType of PURCHASABLE_UNIT_TYPES) {
        if (Phaser.Input.Keyboard.JustDown(this.purchaseKeys[unitType])) {
          this.tryPurchaseWithSound("left", unitType);
        }
      }
      this.updateAiShooting();
      this.handleProjectileVsUnits();
      this.handleProjectileVsGoodie();
      this.cleanupOffscreenProjectiles();
      this.updateUnits(time, delta);
      this.updateDrones(time, delta);
      this.updateGoodie(time, delta);
      this.updateAiPurchasing(time);
    }
    this.refreshPurchaseButtons(time);
  }

  /**
   * Fires `side`'s weapon (if ready) and spawns a tagged, damage-carrying
   * projectile. Ammo/cooldown/reload state lives on this scene, not on
   * GunnerView (view-only, like the online mode's own gunner rendering) —
   * mirrors MatchRoom.fireWeapon's exact rules.
   */
  private fireWeapon(side: Side, angle: number): void {
    if (this.gunnerReloading[side]) return;
    if (this.gunnerAmmo[side] <= 0) {
      this.startReload(side);
      return;
    }
    if (this.time.now < this.nextFireAtMs[side]) return;

    const weapon = WEAPON_DEFINITIONS.rifle;
    this.gunnerAmmo[side] -= 1;
    this.nextFireAtMs[side] = this.time.now + weapon.fireCooldownMs;
    this.gunnerViews[side].setAmmo(this.gunnerAmmo[side], weapon.magazineSize, false);
    this.audio.play(AUDIO_KEYS.rifleFire);

    const anchor = this.gunnerViews[side];
    const muzzleX = anchor.x + Math.cos(angle) * BARREL_LENGTH;
    const muzzleY = anchor.y + Math.sin(angle) * BARREL_LENGTH;

    const projectile = this.add.sprite(muzzleX, muzzleY, SPRITE_KEYS.projectile);
    projectile.setDisplaySize(PROJECTILE_DISPLAY_WIDTH, PROJECTILE_DISPLAY_HEIGHT);
    projectile.setRotation(angle);
    this.physics.add.existing(projectile);
    this.projectiles.add(projectile);
    projectile.setData("damage", weapon.damage);
    projectile.setData("side", side);

    const body = projectile.body as Phaser.Physics.Arcade.Body;
    body.setGravityY(PROJECTILE_GRAVITY_Y);
    body.setVelocity(Math.cos(angle) * weapon.projectileSpeed, Math.sin(angle) * weapon.projectileSpeed);

    if (this.gunnerAmmo[side] <= 0) {
      this.startReload(side);
    }
  }

  private startReload(side: Side): void {
    const magazineSize = WEAPON_DEFINITIONS.rifle.magazineSize;
    if (this.gunnerReloading[side] || this.gunnerAmmo[side] === magazineSize) return;
    this.gunnerReloading[side] = true;
    this.reloadCompleteAtMs[side] = this.time.now + WEAPON_DEFINITIONS.rifle.reloadTimeMs;
    this.gunnerViews[side].setAmmo(this.gunnerAmmo[side], magazineSize, true);
    this.audio.play(AUDIO_KEYS.rifleReload);
  }

  private updateReloads(time: number): void {
    const magazineSize = WEAPON_DEFINITIONS.rifle.magazineSize;
    for (const side of SIDES) {
      if (this.gunnerReloading[side] && time >= this.reloadCompleteAtMs[side]) {
        this.gunnerAmmo[side] = magazineSize;
        this.gunnerReloading[side] = false;
        this.gunnerViews[side].setAmmo(magazineSize, magazineSize, false);
      }
    }
  }

  /** AI gunner: tracks the nearest left-side unit or drone accurately, but fires with random spread. */
  private updateAiShooting(): void {
    const target =
      this.findNearestTarget(this.leftDrones, this.gunnerViews.right.x) ??
      this.findNearestTarget(this.leftUnits, this.gunnerViews.right.x);
    if (!target) return;

    const trackAngle = this.gunnerViews.right.aimAt(target.sprite.x, target.sprite.y);
    const shotAngle = trackAngle + (Math.random() - 0.5) * AI_AIM_SPREAD_RAD;
    this.fireWeapon("right", shotAngle);
  }

  private findNearestTarget<T extends { alive: boolean; sprite: Phaser.GameObjects.Sprite }>(
    candidates: readonly T[],
    fromX: number,
  ): T | null {
    let closest: T | null = null;
    let closestDist = Infinity;
    for (const candidate of candidates) {
      if (!candidate.alive) continue;
      const dist = Math.abs(candidate.sprite.x - fromX);
      if (dist < closestDist) {
        closest = candidate;
        closestDist = dist;
      }
    }
    return closest;
  }

  /** Projectile-vs-unit/drone hits: opposing side only (friendly fire is structurally impossible), final-hit bounty. */
  private handleProjectileVsUnits(): void {
    const projectiles = [...this.projectiles.getChildren()] as Phaser.GameObjects.Sprite[];
    for (const projectile of projectiles) {
      const side = projectile.getData("side") as Side;
      const targets: readonly (Unit | Drone)[] =
        side === "left" ? [...this.rightUnits, ...this.rightDrones] : [...this.leftUnits, ...this.leftDrones];
      const projectileBounds = projectile.getBounds();

      for (const target of targets) {
        if (!target.alive) continue;
        if (!Phaser.Geom.Intersects.RectangleToRectangle(projectileBounds, target.sprite.getBounds())) continue;

        const damage = (projectile.getData("damage") as number) ?? 0;
        target.takeDamage(damage);
        if (!target.alive) {
          this.money[side] += target.definition.bounty;
        }
        projectile.destroy();
        break;
      }
    }
  }

  /** Sky goodie: shoot it to trigger its effect for whichever side's projectile hit it. */
  private handleProjectileVsGoodie(): void {
    if (!this.goodieView || !this.activeGoodieType) return;

    const goodieBounds = this.goodieView.getBounds();
    const projectiles = [...this.projectiles.getChildren()] as Phaser.GameObjects.Sprite[];
    for (const projectile of projectiles) {
      if (!Phaser.Geom.Intersects.RectangleToRectangle(projectile.getBounds(), goodieBounds)) continue;

      const side = projectile.getData("side") as Side;
      this.applyGoodieEffect(side, this.activeGoodieType);
      this.goodieView.destroy();
      this.goodieView = undefined;
      this.activeGoodieType = null;
      this.scheduleNextGoodie(this.time.now);
      projectile.destroy();
      break;
    }
  }

  private applyGoodieEffect(side: Side, type: GoodieType): void {
    if (type === "gold") {
      this.money[side] += GOODIE_GOLD_AMOUNT;
    } else {
      const tower = side === "left" ? this.leftTower : this.rightTower;
      tower.repair(GOODIE_REPAIR_AMOUNT);
    }
  }

  /**
   * Drifts the active goodie down and despawns it (no effect) once it
   * reaches the lane, or spawns a new one when due. This scene owns the
   * simulation (position, drift speed, despawn) exactly like MatchRoom's
   * updateGoodie() does server-side for online play — GoodieView (shared
   * by both modes) only ever renders wherever it's told via sync().
   */
  private updateGoodie(time: number, deltaMs: number): void {
    if (this.goodieView && this.activeGoodieType) {
      this.activeGoodieY += GOODIE_DRIFT_SPEED * (deltaMs / 1000);
      this.goodieView.sync(this.activeGoodieX, this.activeGoodieY);
      if (this.activeGoodieY >= GROUND_Y) {
        this.goodieView.destroy();
        this.goodieView = undefined;
        this.activeGoodieType = null;
        this.scheduleNextGoodie(time);
      }
    } else if (time >= this.nextGoodieAtMs) {
      this.spawnGoodie();
    }
  }

  private spawnGoodie(): void {
    const type: GoodieType = Math.random() < 0.5 ? "gold" : "repair";
    const x = Phaser.Math.Between(GOODIE_SPAWN_MARGIN, BATTLEFIELD_WIDTH - GOODIE_SPAWN_MARGIN);
    this.activeGoodieType = type;
    this.activeGoodieX = x;
    this.activeGoodieY = GOODIE_START_Y;
    this.goodieView = new GoodieView(this, type, x, GOODIE_START_Y);
  }

  private scheduleNextGoodie(time: number): void {
    this.nextGoodieAtMs = time + GOODIE_MIN_INTERVAL_MS + Math.random() * (GOODIE_MAX_INTERVAL_MS - GOODIE_MIN_INTERVAL_MS);
  }

  private cleanupOffscreenProjectiles(): void {
    for (const child of this.projectiles.getChildren()) {
      const projectile = child as Phaser.GameObjects.Sprite;
      if (
        projectile.x < -20 ||
        projectile.x > BATTLEFIELD_WIDTH + 20 ||
        projectile.y < -20 ||
        projectile.y > BATTLEFIELD_HEIGHT + 20
      ) {
        projectile.destroy();
        continue;
      }
      // Keep the sprite pointing along its actual (gravity-curved) flight path.
      const body = projectile.body as Phaser.Physics.Arcade.Body;
      projectile.rotation = Math.atan2(body.velocity.y, body.velocity.x);
    }
  }

  private updateUnits(time: number, delta: number): void {
    for (const unit of this.leftUnits) unit.update(time, delta, this.rightUnits, this.rightTower);
    for (const unit of this.rightUnits) unit.update(time, delta, this.leftUnits, this.leftTower);

    this.leftUnits = this.pruneDead(this.leftUnits);
    this.rightUnits = this.pruneDead(this.rightUnits);
  }

  private updateDrones(time: number, delta: number): void {
    for (const drone of this.leftDrones) drone.update(time, delta, this.rightDrones, this.rightUnits, this.rightTower);
    for (const drone of this.rightDrones) drone.update(time, delta, this.leftDrones, this.leftUnits, this.leftTower);

    this.leftDrones = this.pruneDead(this.leftDrones);
    this.rightDrones = this.pruneDead(this.rightDrones);
  }

  private pruneDead<T extends { alive: boolean; destroy(): void }>(items: T[]): T[] {
    const alive: T[] = [];
    for (const item of items) {
      if (item.alive) {
        alive.push(item);
      } else {
        item.destroy();
      }
    }
    return alive;
  }

  private updateAiPurchasing(time: number): void {
    const options = PURCHASABLE_UNIT_TYPES.map((type) => ({
      type,
      cost: UNIT_DEFINITIONS[type].cost,
      ready: (this.cooldownUntilMs[AI_SIDE][type] ?? 0) <= time,
    }));
    const choice = this.ai.decide(time, this.money[AI_SIDE], options);
    if (choice) this.purchaseUnit(AI_SIDE, choice);
  }

  private createEconomyUi(): void {
    const buttonWidth = 110;
    const buttonHeight = 60;
    const gap = 10;
    const rowY = BATTLEFIELD_HEIGHT - 110;
    const rowWidth = PURCHASABLE_UNIT_TYPES.length * buttonWidth + (PURCHASABLE_UNIT_TYPES.length - 1) * gap;
    const leftStartX = 20;
    const rightStartX = BATTLEFIELD_WIDTH - 20 - rowWidth;

    this.moneyText = {
      left: this.add
        .text(leftStartX, rowY - 10, this.formatMoney("left"), {
          fontFamily: "monospace",
          fontSize: "15px",
          color: "#f2c14e",
        })
        .setOrigin(0, 1),
      right: this.add
        .text(rightStartX + rowWidth, rowY - 10, this.formatMoney("right"), {
          fontFamily: "monospace",
          fontSize: "15px",
          color: "#f2c14e",
        })
        .setOrigin(1, 1),
    };

    PURCHASABLE_UNIT_TYPES.forEach((unitType, index) => {
      const definition = UNIT_DEFINITIONS[unitType];
      const offset = index * (buttonWidth + gap);

      this.purchaseButtons.left[unitType] = new PurchaseButton(this, {
        x: leftStartX + offset,
        y: rowY,
        width: buttonWidth,
        height: buttonHeight,
        title: definition.displayName,
        onClick: this.withClickSound(() => this.purchaseUnit("left", unitType)),
      });

      // Display-only: P2 is the AI in this single-client session, so its
      // buttons show gold/cooldown state but aren't clickable by the human.
      // Revisit once real multiplayer gives P2 their own client.
      this.purchaseButtons.right[unitType] = new PurchaseButton(this, {
        x: rightStartX + offset,
        y: rowY,
        width: buttonWidth,
        height: buttonHeight,
        title: definition.displayName,
        onClick: () => {},
        interactive: false,
      });
    });
  }

  /** Wraps a UI button's action so every successful click also gets audio feedback. */
  private withClickSound(action: () => void): () => void {
    return () => {
      this.audio.play(AUDIO_KEYS.uiClick);
      action();
    };
  }

  private createMuteButton(): void {
    const width = 90;
    const height = 44;
    this.muteButton = new PurchaseButton(this, {
      x: BATTLEFIELD_WIDTH - 20 - width,
      y: 10,
      width,
      height,
      title: "Sound",
      onClick: () => {
        const muted = this.audio.toggleMute();
        this.muteButton.setStatus(muted ? "OFF" : "ON", true);
      },
    });
    this.muteButton.setStatus(this.audio.isMuted ? "OFF" : "ON", true);
  }

  /** Returns whether the purchase actually went through (used to gate the keyboard-shortcut click sound). */
  private purchaseUnit(side: Side, unitType: ImplementedUnitType): boolean {
    if (!this.started || this.matchOver) return false;

    const definition = UNIT_DEFINITIONS[unitType];
    const now = this.time.now;
    const cooldownUntil = this.cooldownUntilMs[side][unitType] ?? 0;
    if (now < cooldownUntil) return false;
    if (this.money[side] < definition.cost) return false;

    this.money[side] -= definition.cost;
    this.cooldownUntilMs[side][unitType] = now + definition.purchaseCooldownMs;
    this.spawnUnit(side, unitType);
    return true;
  }

  /** Keyboard-shortcut purchase path: same rules as the buttons, plus matching audio feedback. */
  private tryPurchaseWithSound(side: Side, unitType: ImplementedUnitType): void {
    if (this.purchaseUnit(side, unitType)) {
      this.audio.play(AUDIO_KEYS.uiClick);
    }
  }

  private spawnUnit(side: Side, unitType: ImplementedUnitType): void {
    const definition = UNIT_DEFINITIONS[unitType];
    const ownTower = side === "left" ? this.leftTower : this.rightTower;
    const spawnX = side === "left" ? ownTower.x + UNIT_SPAWN_OFFSET : ownTower.x - UNIT_SPAWN_OFFSET;
    const onDeath = (x: number, y: number) => {
      this.deathParticles.explode(UNIT_DEATH_PARTICLE_COUNT, x, y);
      this.audio.play(AUDIO_KEYS.unitDeath);
    };
    const onHit = () => this.audio.play(AUDIO_KEYS.impactUnit);

    if (unitType === "drone") {
      const drone = new Drone(this, side, definition, spawnX, GROUND_Y, onDeath, onHit);
      (side === "left" ? this.leftDrones : this.rightDrones).push(drone);
    } else {
      const unit = new Unit(
        this,
        side,
        definition,
        spawnX,
        GROUND_Y,
        onDeath,
        (winningSide) => this.endMatch(winningSide),
        onHit,
      );
      (side === "left" ? this.leftUnits : this.rightUnits).push(unit);
    }

    this.audio.play(AUDIO_KEYS.unitSpawn);
  }

  private createStartOverlay(): void {
    const centerX = BATTLEFIELD_WIDTH / 2;
    const centerY = BATTLEFIELD_HEIGHT / 2;

    const dim = this.add.rectangle(0, 0, BATTLEFIELD_WIDTH, BATTLEFIELD_HEIGHT, 0x000000, 0.6).setOrigin(0, 0);
    const title = this.add
      .text(centerX, centerY - 130, "TOWERFRONT", {
        fontFamily: "monospace",
        fontSize: "56px",
        color: "#ffffff",
      })
      .setOrigin(0.5);
    const hint = this.add
      .text(
        centerX,
        centerY - 55,
        "Aim: mouse   Fire: left click   Reload: R\nBuy units: click a button or press 1/2/3/4 — Player 2 is an AI",
        {
          fontFamily: "monospace",
          fontSize: "16px",
          color: "#aab0bd",
          align: "center",
        },
      )
      .setOrigin(0.5);

    this.startButton = new PurchaseButton(this, {
      x: centerX - 110,
      y: centerY + 20,
      width: 220,
      height: 64,
      title: "Start Match",
      onClick: this.withClickSound(() => this.beginMatch()),
    });
    this.startButton.setStatus("Click to begin", true);

    this.startOverlayObjects = [dim, title, hint];
  }

  private beginMatch(): void {
    if (this.started) return;
    this.started = true;

    for (const obj of this.startOverlayObjects) obj.destroy();
    this.startOverlayObjects = [];
    this.startButton?.destroy();
    this.startButton = undefined;

    this.time.addEvent({
      delay: PASSIVE_INCOME_INTERVAL_MS,
      loop: true,
      callback: () => {
        if (this.matchOver) return;
        this.money.left += PASSIVE_INCOME_AMOUNT;
        this.money.right += PASSIVE_INCOME_AMOUNT;
      },
    });

    this.scheduleNextGoodie(this.time.now);
  }

  private endMatch(winningSide: Side): void {
    if (this.matchOver) return;
    this.matchOver = true;
    this.audio.play(AUDIO_KEYS.matchWin);

    const centerX = BATTLEFIELD_WIDTH / 2;
    const centerY = BATTLEFIELD_HEIGHT / 2;
    const label = winnerLabel(winningSide);

    this.add
      .text(centerX, centerY - 40, label, {
        fontFamily: "monospace",
        fontSize: "48px",
        color: "#ffffff",
        backgroundColor: "#0b0c10",
        padding: { x: 24, y: 16 },
      })
      .setOrigin(0.5);

    const restartButton = new PurchaseButton(this, {
      x: centerX - 90,
      y: centerY + 40,
      width: 180,
      height: 56,
      title: "Restart",
      onClick: this.withClickSound(() =>
        this.scene.restart({ autoStart: true, playerName: this.playerName } satisfies StartData),
      ),
    });
    restartButton.setStatus("Play again", true);
  }

  private refreshPurchaseButtons(time: number): void {
    for (const side of SIDES) {
      for (const unitType of PURCHASABLE_UNIT_TYPES) {
        const definition = UNIT_DEFINITIONS[unitType];
        const cooldownUntil = this.cooldownUntilMs[side][unitType] ?? 0;
        const remainingMs = cooldownUntil - time;
        const ready = remainingMs <= 0;
        const affordable = this.money[side] >= definition.cost;
        const status = ready ? `${definition.cost}` : `${(remainingMs / 1000).toFixed(1)}s`;
        this.purchaseButtons[side][unitType]!.setStatus(status, ready && affordable && this.started && !this.matchOver);
      }
      this.moneyText[side].setText(this.formatMoney(side));
    }
  }

  private formatMoney(side: Side): string {
    return `${side === "left" ? this.playerName : "P2 (AI)"} Gold: ${this.money[side]}`;
  }

  private createDeathParticles(): void {
    if (!this.textures.exists("spark")) {
      const spark = this.add.graphics();
      spark.fillStyle(0xffffff, 1);
      spark.fillCircle(4, 4, 4);
      spark.generateTexture("spark", 8, 8);
      spark.destroy();
    }

    this.deathParticles = this.add.particles(0, 0, "spark", {
      lifespan: 500,
      speed: { min: 80, max: 220 },
      scale: { start: 1, end: 0 },
      tint: [0x9aa0ac, 0xffffff],
      emitting: false,
    });
  }

  private drawBackground(): void {
    const sky = this.add.rectangle(0, 0, BATTLEFIELD_WIDTH, GROUND_Y, 0x232a3d).setOrigin(0, 0);
    const ground = this.add
      .rectangle(0, GROUND_Y, BATTLEFIELD_WIDTH, BATTLEFIELD_HEIGHT - GROUND_Y, 0x2f2a24)
      .setOrigin(0, 0);
    sky.setDepth(-2);
    ground.setDepth(-2);

    const line = this.add.graphics();
    line.lineStyle(2, 0x11141d, 1);
    line.lineBetween(0, GROUND_Y, BATTLEFIELD_WIDTH, GROUND_Y);
    line.setDepth(-1);
  }
}
