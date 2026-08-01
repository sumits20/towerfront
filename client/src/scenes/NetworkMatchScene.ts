import Phaser from "phaser";
import {
  BATTLEFIELD_WIDTH,
  BATTLEFIELD_HEIGHT,
  GROUND_Y,
  TOWER_MARGIN_X,
  TOWER_HEIGHT,
  TOWER_MAX_HEALTH,
  UNIT_DEFINITIONS,
  WEAPON_DEFINITIONS,
  PURCHASABLE_UNIT_TYPES,
  CLIENT_MESSAGE,
  SERVER_MESSAGE,
  MAX_PLAYER_NAME_LENGTH,
  type Side,
  type PurchasableUnitType,
  type MatchState,
} from "@towerfront/shared";
import { connectToMatch, reconnectToMatch, type MatchConnection } from "../net/connection";
import { setDebugState, setSimulateDropHook } from "../net/testHooks";
import { TowerView } from "../entities/TowerView";
import { GunnerView } from "../entities/GunnerView";
import { UnitView } from "../entities/UnitView";
import { ProjectileView } from "../entities/ProjectileView";
import { GoodieView } from "../entities/GoodieView";
import type { ImplementedUnitType } from "../entities/unitVisuals";
import { SPRITE_KEYS, SPRITE_PATHS } from "../assetKeys";
import { AUDIO_KEYS, AUDIO_PATHS } from "../audioKeys";
import { AudioManager } from "../audio/AudioManager";
import { PurchaseButton } from "../ui/PurchaseButton";
import { winnerLabel } from "../ui/winnerLabel";

const SIDES: readonly Side[] = ["left", "right"];
const TOWER_X: Record<Side, number> = {
  left: TOWER_MARGIN_X,
  right: BATTLEFIELD_WIDTH - TOWER_MARGIN_X,
};
const GUNNER_Y = GROUND_Y - TOWER_HEIGHT;
const UNIT_DEATH_PARTICLE_COUNT = 10;

const RECONNECT_RETRY_DELAY_MS = 1000;
const RECONNECT_MAX_ATTEMPTS = 20; // ~20s, matching the server's grace window

const PURCHASE_KEY_CODES: Record<PurchasableUnitType, number> = {
  recruit: Phaser.Input.Keyboard.KeyCodes.ONE,
  runner: Phaser.Input.Keyboard.KeyCodes.TWO,
  shieldUnit: Phaser.Input.Keyboard.KeyCodes.THREE,
  drone: Phaser.Input.Keyboard.KeyCodes.FOUR,
};

export interface StartData {
  readonly playerName?: string;
  /** Set by MainMenuScene when it already resumed a session itself (see tryResumeSession) — skips this scene's own connectToMatch() entirely, since a fresh join would need a name we deliberately never asked for on that path. */
  readonly connection?: MatchConnection;
}

/**
 * Server-authoritative match view. Every piece of gameplay state (health,
 * gold, unit/drone/projectile positions, cooldowns) is owned by MatchRoom;
 * this scene only ever renders broadcast state and sends intentions
 * (aim/fire/reload/purchase/restart) — see CLAUDE.md's authoritative-server
 * rule. Reflection-mode decoding (see net/connection.ts) means the decoded
 * PlayerState/UnitState/etc. instances have their `@type()` fields but NONE
 * of the real classes' getters/methods (towerX, laneEdgeX, gunnerAnchorX/Y,
 * towerTakeDamage, ...) — every one of those is recomputed here from shared
 * constants instead of called on the decoded instance.
 */
export class NetworkMatchScene extends Phaser.Scene {
  /** Full-screen: pre-match waiting, and this client's own dropped connection (a stronger case than the opponent's — nothing is renderable/actionable for *us* mid-reconnect). */
  private statusText?: Phaser.GameObjects.Text;
  /** Small corner notice for the opponent's mid-match disconnect — never replaces or covers the live match view. */
  private disconnectBanner?: Phaser.GameObjects.Text;
  private readonly towers: Partial<Record<Side, TowerView>> = {};
  private leftConnected = false;
  private rightConnected = false;
  private sentReady = false;
  private reconnecting = false;

  private connection?: MatchConnection;
  private mySide?: Side;
  private playerName = "Player";
  private resumedConnection?: MatchConnection;
  private audio!: AudioManager;
  private deathParticles!: Phaser.GameObjects.Particles.ParticleEmitter;

  private readonly gunners: Partial<Record<Side, GunnerView>> = {};
  private aimAngle = 0;
  private reloadKey?: Phaser.Input.Keyboard.Key;
  private readonly purchaseKeys: Partial<Record<PurchasableUnitType, Phaser.Input.Keyboard.Key>> = {};

  private readonly moneyText: Partial<Record<Side, Phaser.GameObjects.Text>> = {};
  private readonly purchaseButtons: Record<Side, Partial<Record<PurchasableUnitType, PurchaseButton>>> = {
    left: {},
    right: {},
  };
  private muteButton?: PurchaseButton;

  private readonly unitViews = new Map<string, UnitView>();
  private readonly droneViews = new Map<string, UnitView>();
  private readonly projectileViews = new Map<string, ProjectileView>();
  private goodieView?: GoodieView;
  private winBannerObjects: Phaser.GameObjects.GameObject[] = [];
  private restartButton?: PurchaseButton;

  /** Guards `room.onStateChange`, which fires on every patch — this identifies the rarer case where the server swapped in a brand-new `MatchState` (a rematch), which orphans every listener bound to the old one. */
  private boundMatchState?: MatchState;

  constructor() {
    super("NetworkMatchScene");
  }

  init(data: StartData): void {
    this.playerName = data?.playerName?.trim().slice(0, MAX_PLAYER_NAME_LENGTH) || "Player";
    this.resumedConnection = data?.connection;
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
    this.drawBackground();
    this.createDeathParticles();
    this.audio = new AudioManager(this);

    this.statusText = this.add
      .text(BATTLEFIELD_WIDTH / 2, BATTLEFIELD_HEIGHT / 2, "Connecting...", {
        fontFamily: "monospace",
        fontSize: "28px",
        color: "#ffffff",
      })
      .setOrigin(0.5);

    this.disconnectBanner = this.add
      .text(12, 12, "", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#f2c14e",
        backgroundColor: "#000000aa",
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0, 0)
      .setVisible(false);

    this.createMuteButton();

    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      if (!this.mySide || !this.connection) return;
      const gunner = this.gunners[this.mySide];
      if (!gunner) return;
      this.aimAngle = gunner.aimAt(pointer.worldX, pointer.worldY);
      this.connection.room.send(CLIENT_MESSAGE.aim, { angle: this.aimAngle });
    });
    this.input.on(
      Phaser.Input.Events.POINTER_DOWN,
      (_pointer: Phaser.Input.Pointer, hitObjects: Phaser.GameObjects.GameObject[]) => {
        // Don't fire the rifle when the click actually landed on a UI button.
        if (hitObjects.length > 0) return;
        if (!this.mySide || !this.connection) return;
        const state = this.connection.room.state;
        if (!state.started || state.matchOver) return;
        this.connection.room.send(CLIENT_MESSAGE.fire, { angle: this.aimAngle });
      },
    );
    this.reloadKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R);

    void this.start();
  }

  override update(): void {
    const connection = this.connection;
    if (!connection) return;
    const state = connection.room.state;
    // `room.state` exists as soon as connectToMatch()/reconnectToMatch()
    // resolves, but in reflection-mode decoding its fields (players, units,
    // ...) stay undefined until the first full state decode actually lands
    // — and update() runs every frame starting immediately, well before
    // that. A truthy-only check on `boundMatchState` isn't enough: after a
    // reconnect, `this.connection` points at the new room before its first
    // decode arrives, while `boundMatchState` still holds the *old* room's
    // (now-decoded) state, so a truthy check would wrongly pass and read
    // through to the new, still-undecoded one. Comparing by reference
    // correctly stays blocked until `onStateChange` confirms this exact
    // state object is bound.
    if (state !== this.boundMatchState) return;

    if (this.mySide && this.reloadKey && Phaser.Input.Keyboard.JustDown(this.reloadKey)) {
      connection.room.send(CLIENT_MESSAGE.reload);
    }
    for (const unitType of PURCHASABLE_UNIT_TYPES) {
      const key = this.purchaseKeys[unitType];
      if (key && Phaser.Input.Keyboard.JustDown(key)) this.sendPurchase(connection, unitType);
    }

    for (const side of SIDES) {
      const player = state.players.get(side);
      const gunner = this.gunners[side];
      if (player && gunner) {
        gunner.setAmmo(player.gunnerAmmo, player.gunnerMagazineSize, player.gunnerReloading);
        // Own gunner's rotation is driven live by local mouse input (see
        // create()'s POINTER_MOVE handler) — polling the broadcast value
        // here too would fight it with stale, round-trip-delayed angles.
        if (side !== this.mySide) gunner.setAimAngle(player.gunnerAimAngle);
      }
      const fallbackName = side === "left" ? "Player 1" : "Player 2";
      this.moneyText[side]?.setText(this.formatMoney(side, player?.gold ?? 0, player?.displayName || fallbackName));
    }
    this.refreshPurchaseButtons(state);

    state.units.forEach((unitState, id) => {
      this.unitViews
        .get(id)
        ?.sync(unitState.x, unitState.y, unitState.health, unitState.maxHealth, unitState.attackFlashSeq);
    });
    state.drones.forEach((droneState, id) => {
      this.droneViews
        .get(id)
        ?.sync(droneState.x, droneState.y, droneState.health, droneState.maxHealth, droneState.attackFlashSeq);
    });
    state.projectiles.forEach((projectileState, id) => {
      this.projectileViews.get(id)?.sync(projectileState.x, projectileState.y, projectileState.vx, projectileState.vy);
    });
    if (state.goodie) this.goodieView?.sync(state.goodie.x, state.goodie.y);
  }

  private async start(): Promise<void> {
    let connection: MatchConnection;
    if (this.resumedConnection) {
      connection = this.resumedConnection;
    } else {
      try {
        connection = await connectToMatch(this.playerName);
      } catch (err) {
        this.statusText?.setText("Connection failed — is the server running?");
        console.error(err);
        return;
      }
    }
    this.connection = connection;

    this.towers.left = new TowerView(this, "left", TOWER_X.left, GROUND_Y);
    this.towers.right = new TowerView(this, "right", TOWER_X.right, GROUND_Y);

    this.bindConnection(connection);
  }

  /**
   * Connection-lifecycle binding (survives for as long as this `connection`
   * does — reconnects get a fresh call via `attemptReconnect`). Registers
   * `room.onStateChange`, which re-invokes `bindMatchState` any time the
   * server swaps in a brand-new root `MatchState` (a rematch) — see that
   * method for why a plain `$(room.state)` capture from here wouldn't do.
   */
  private bindConnection(connection: MatchConnection): void {
    const { room } = connection;

    room.onStateChange((state) => {
      if (state === this.boundMatchState) return;
      this.boundMatchState = state;
      this.bindMatchState(connection, state);
    });

    // Sent once per fresh join and once per successful reconnect (a page
    // refresh loses any client-side memory of it) — registered here rather
    // than once in start() so a reconnect's resend doesn't log colyseus.js's
    // "onMessage() not registered" warning against the new Room instance.
    room.onMessage(SERVER_MESSAGE.assignedSide, (side: Side) => {
      if (this.mySide) return; // already assigned on an earlier connect/reconnect — never reassign
      this.mySide = side;
      this.buildGunners();
      this.buildPurchaseRow(connection);
    });

    setSimulateDropHook(() => {
      // colyseus.js's public API has no "simulate a network blip" affordance
      // — `room.leave()` sends a graceful leave protocol message the server
      // treats as consented, which is a different (and already-covered)
      // scenario. Reaching into the transport's raw WebSocket and closing it
      // directly skips that handshake, so the server sees a genuine
      // unconsented drop, same as a real connectivity loss.
      const transport = (room.connection as unknown as { transport?: { ws?: { close(): void } } }).transport;
      transport?.ws?.close();
    });

    room.onLeave(() => {
      if (this.reconnecting) return;
      this.reconnecting = true;
      void this.attemptReconnect(connection);
    });
  }

  /**
   * Re-derived every time the root `MatchState` changes (initial connect,
   * and again after every rematch). A restart replaces `this.state` with a
   * brand-new `MatchState` server-side (fresh Players/units/drones/
   * projectiles maps) — every listener attached to the OLD instance's
   * collections is now orphaned (it'll simply never fire again), so this
   * has to fully re-register against the new one rather than assuming a
   * one-time setup. Gunners/purchase buttons/money text are intentionally
   * NOT touched here — they poll `connection.room.state` fresh every frame
   * in `update()`, so they need no rebinding at all.
   */
  private bindMatchState(connection: MatchConnection, state: MatchState): void {
    const { $ } = connection;

    this.sentReady = false;
    this.hideWinBanner();
    for (const view of this.unitViews.values()) view.destroy();
    for (const view of this.droneViews.values()) view.destroy();
    for (const view of this.projectileViews.values()) view.destroy();
    this.unitViews.clear();
    this.droneViews.clear();
    this.projectileViews.clear();
    this.goodieView?.destroy();
    this.goodieView = undefined;

    // `room.state` exists as soon as connectToMatch() resolves, but its
    // fields (players, started, ...) are only populated once the *separate*
    // ROOM_STATE message has been decoded — a message that can arrive after
    // the join promise resolves. Reading room.state.players synchronously
    // here raced that decode and threw "Cannot read properties of undefined
    // (reading 'get')", which killed the rest of setup via an uncaught
    // rejection. Everything below is driven entirely by reactive listeners
    // instead, which only ever fire once real data exists.
    $(state).players.onAdd((player, side) => {
      const towerSide = side as Side;
      $(player).listen(
        "connected",
        (connected) => {
          if (towerSide === "left") this.leftConnected = connected;
          else this.rightConnected = connected;
          this.updateConnectionUi(connection);
        },
        true,
      );
      $(player).listen(
        "towerHealth",
        (health) => this.towers[towerSide]?.setHealthRatio(health / TOWER_MAX_HEALTH),
        true,
      );
      $(player).listen("towerHitFlashSeq", () => {
        this.towers[towerSide]?.flashHit();
        this.audio.play(AUDIO_KEYS.impactTower);
      });
      $(player).listen("towerHealFlashSeq", () => this.towers[towerSide]?.flashHeal());
    }, true);

    $(state).units.onAdd((unitState, id) => {
      const view = new UnitView(
        this,
        unitState.side,
        unitState.unitType as ImplementedUnitType,
        unitState.x,
        unitState.y,
        unitState.maxHealth,
        () => this.audio.play(AUDIO_KEYS.impactUnit),
        (x, y) => {
          this.deathParticles.explode(UNIT_DEATH_PARTICLE_COUNT, x, y);
          this.audio.play(AUDIO_KEYS.unitDeath);
        },
      );
      this.unitViews.set(id, view);
      this.audio.play(AUDIO_KEYS.unitSpawn);
    }, true);
    $(state).units.onRemove((_unitState, id) => {
      this.unitViews.get(id)?.die();
      this.unitViews.delete(id);
    });

    $(state).drones.onAdd((droneState, id) => {
      const view = new UnitView(
        this,
        droneState.side,
        "drone",
        droneState.x,
        droneState.y,
        droneState.maxHealth,
        () => this.audio.play(AUDIO_KEYS.impactUnit),
        (x, y) => {
          this.deathParticles.explode(UNIT_DEATH_PARTICLE_COUNT, x, y);
          this.audio.play(AUDIO_KEYS.unitDeath);
        },
        () => this.nearestOpposingPosition(state, droneState.side, droneState.x),
      );
      this.droneViews.set(id, view);
      this.audio.play(AUDIO_KEYS.unitSpawn);
    }, true);
    $(state).drones.onRemove((_droneState, id) => {
      this.droneViews.get(id)?.die();
      this.droneViews.delete(id);
    });

    $(state).projectiles.onAdd((projectileState, id) => {
      this.projectileViews.set(id, new ProjectileView(this, projectileState.x, projectileState.y));
      this.audio.play(AUDIO_KEYS.rifleFire);
    }, true);
    $(state).projectiles.onRemove((_projectileState, id) => {
      this.projectileViews.get(id)?.destroy();
      this.projectileViews.delete(id);
    });

    $(state).listen(
      "goodie",
      (goodie) => {
        this.goodieView?.destroy();
        this.goodieView = goodie ? new GoodieView(this, goodie.goodieType, goodie.x, goodie.y) : undefined;
      },
      true,
    );

    $(state).listen(
      "matchOver",
      (matchOver) => {
        if (matchOver) this.showWinBanner(state.winner as Side, connection);
        // A stale "waiting for opponent"/"disconnected" message from before
        // the match ended won't otherwise get re-evaluated — nothing else
        // re-checks it once matchOver flips, and updateConnectionUi is only
        // ever triggered by "connected"/"started" changes.
        this.updateConnectionUi(connection);
      },
      true,
    );

    $(state).listen("started", () => this.updateConnectionUi(connection));
  }

  private async attemptReconnect(connection: MatchConnection): Promise<void> {
    for (let attempt = 1; attempt <= RECONNECT_MAX_ATTEMPTS; attempt++) {
      const statusText = `Reconnecting... (${attempt}/${RECONNECT_MAX_ATTEMPTS})`;
      this.statusText?.setVisible(true);
      this.statusText?.setText(statusText);
      this.disconnectBanner?.setVisible(false);
      setDebugState({
        leftConnected: this.leftConnected,
        rightConnected: this.rightConnected,
        started: connection.room.state?.started ?? false,
        reconnecting: true,
        statusText,
        statusVisible: true,
        disconnectBannerText: "",
        disconnectBannerVisible: false,
        towersReady: Boolean(this.towers.left && this.towers.right),
      });

      try {
        const fresh = await reconnectToMatch(connection);
        this.reconnecting = false;
        this.connection = fresh;
        this.bindConnection(fresh);
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, RECONNECT_RETRY_DELAY_MS));
      }
    }

    this.reconnecting = false;
    this.statusText?.setVisible(true);
    this.statusText?.setText("Disconnected — please refresh to rejoin.");
  }

  // Three mutually exclusive UI states: before the match starts, "both
  // connected" gates the ready handshake and deserves a full-screen message
  // (there's no match to see behind it yet). Once `started` flips true, a
  // dropped OPPONENT must NEVER fall back to that same full-screen text —
  // the match keeps simulating (AI covers the empty side immediately), so
  // the live view keeps rendering underneath and only gets a small,
  // non-blocking notice. And once `matchOver` is true, Restart is the only
  // relevant action regardless of connection state — both of the above are
  // suppressed entirely so they never stack with the win banner.
  private updateConnectionUi(connection: MatchConnection): void {
    if (this.reconnecting) return; // attemptReconnect owns the text while it's running
    const bothConnected = this.leftConnected && this.rightConnected;
    const { started, matchOver } = connection.room.state;

    const statusText = !matchOver && !started && !bothConnected ? "Waiting for opponent..." : "";
    const statusVisible = !matchOver && !started && !bothConnected;
    this.statusText?.setText(statusText);
    this.statusText?.setVisible(statusVisible);

    const disconnectBannerText = !matchOver && started && !bothConnected ? "Opponent disconnected — AI took over" : "";
    const disconnectBannerVisible = !matchOver && started && !bothConnected;
    this.disconnectBanner?.setText(disconnectBannerText);
    this.disconnectBanner?.setVisible(disconnectBannerVisible);

    if (bothConnected && !started && !this.sentReady) {
      this.sentReady = true;
      connection.room.send(CLIENT_MESSAGE.ready);
    }

    setDebugState({
      leftConnected: this.leftConnected,
      rightConnected: this.rightConnected,
      started,
      reconnecting: this.reconnecting,
      statusText,
      statusVisible,
      disconnectBannerText,
      disconnectBannerVisible,
      towersReady: Boolean(this.towers.left && this.towers.right),
    });
  }

  private buildGunners(): void {
    for (const side of SIDES) {
      this.gunners[side] = new GunnerView(
        this,
        TOWER_X[side],
        GUNNER_Y,
        WEAPON_DEFINITIONS.rifle,
        side === this.mySide,
      );
    }
  }

  private buildPurchaseRow(connection: MatchConnection): void {
    const buttonWidth = 110;
    const buttonHeight = 60;
    const gap = 10;
    const rowY = BATTLEFIELD_HEIGHT - 110;
    const rowWidth = PURCHASABLE_UNIT_TYPES.length * buttonWidth + (PURCHASABLE_UNIT_TYPES.length - 1) * gap;
    const leftStartX = 20;
    const rightStartX = BATTLEFIELD_WIDTH - 20 - rowWidth;
    const startX: Record<Side, number> = { left: leftStartX, right: rightStartX + rowWidth };

    for (const side of SIDES) {
      this.moneyText[side] = this.add
        .text(startX[side], rowY - 10, this.formatMoney(side, 0, side === "left" ? "Player 1" : "Player 2"), {
          fontFamily: "monospace",
          fontSize: "15px",
          color: "#f2c14e",
        })
        .setOrigin(side === "left" ? 0 : 1, 1);
    }

    PURCHASABLE_UNIT_TYPES.forEach((unitType, index) => {
      const definition = UNIT_DEFINITIONS[unitType];
      const offset = index * (buttonWidth + gap);

      this.purchaseButtons.left[unitType] = new PurchaseButton(this, {
        x: leftStartX + offset,
        y: rowY,
        width: buttonWidth,
        height: buttonHeight,
        title: definition.displayName,
        onClick: this.mySide === "left" ? () => this.sendPurchase(connection, unitType) : () => {},
        interactive: this.mySide === "left",
      });

      // The non-own side's row is shown but non-interactive — same rationale
      // as the original single-client prototype: informational (gold/
      // cooldown state) since we can't click for the other player.
      this.purchaseButtons.right[unitType] = new PurchaseButton(this, {
        x: rightStartX + offset,
        y: rowY,
        width: buttonWidth,
        height: buttonHeight,
        title: definition.displayName,
        onClick: this.mySide === "right" ? () => this.sendPurchase(connection, unitType) : () => {},
        interactive: this.mySide === "right",
      });

      // Only reachable once `mySide` is known (see the assignedSide handler that calls this).
      this.purchaseKeys[unitType] = this.input.keyboard!.addKey(PURCHASE_KEY_CODES[unitType]);
    });
  }

  private sendPurchase(connection: MatchConnection, unitType: PurchasableUnitType): void {
    this.audio.play(AUDIO_KEYS.uiClick);
    connection.room.send(CLIENT_MESSAGE.purchaseUnit, { unitType });
  }

  private refreshPurchaseButtons(state: MatchState): void {
    for (const side of SIDES) {
      const player = state.players.get(side);
      if (!player) continue;
      for (const unitType of PURCHASABLE_UNIT_TYPES) {
        const button = this.purchaseButtons[side][unitType];
        if (!button) continue;
        const definition = UNIT_DEFINITIONS[unitType];
        const cooldownUntil = player.purchaseCooldownUntilMs.get(unitType) ?? 0;
        const remainingMs = cooldownUntil - state.elapsedMs;
        const ready = remainingMs <= 0;
        const affordable = player.gold >= definition.cost;
        const status = ready ? `${definition.cost}` : `${(remainingMs / 1000).toFixed(1)}s`;
        button.setStatus(status, ready && affordable && state.started && !state.matchOver && side === this.mySide);
      }
    }
  }

  private formatMoney(side: Side, gold: number, displayName: string): string {
    const label = side === this.mySide ? `${displayName} (You)` : displayName;
    return `${label} Gold: ${gold}`;
  }

  /**
   * Approximates DroneState's own server-side targeting (nearest opposing
   * drone, else nearest opposing unit, both anywhere on the field) purely
   * from currently-rendered positions — used only to draw the drone's
   * client-inferred shot visual (see UnitView.fireProjectileEffect), never
   * for anything that affects actual game state.
   */
  private nearestOpposingPosition(state: MatchState, side: Side, fromX: number): { x: number; y: number } | null {
    const enemySide: Side = side === "left" ? "right" : "left";
    let closest: { x: number; y: number } | null = null;
    let closestDist = Infinity;

    state.drones.forEach((drone) => {
      if (drone.side !== enemySide) return;
      const dist = Math.abs(drone.x - fromX);
      if (dist < closestDist) {
        closestDist = dist;
        closest = { x: drone.x, y: drone.y };
      }
    });
    if (closest) return closest;

    state.units.forEach((unit) => {
      if (unit.side !== enemySide) return;
      const dist = Math.abs(unit.x - fromX);
      if (dist < closestDist) {
        closestDist = dist;
        closest = { x: unit.x, y: unit.y };
      }
    });
    return closest;
  }

  private showWinBanner(winner: Side, connection: MatchConnection): void {
    this.hideWinBanner();
    this.audio.play(AUDIO_KEYS.matchWin);

    const centerX = BATTLEFIELD_WIDTH / 2;
    const centerY = BATTLEFIELD_HEIGHT / 2;
    const label = winnerLabel(winner);

    const text = this.add
      .text(centerX, centerY - 40, label, {
        fontFamily: "monospace",
        fontSize: "48px",
        color: "#ffffff",
        backgroundColor: "#0b0c10",
        padding: { x: 24, y: 16 },
      })
      .setOrigin(0.5);
    this.winBannerObjects = [text];

    this.restartButton = new PurchaseButton(this, {
      x: centerX - 90,
      y: centerY + 40,
      width: 180,
      height: 56,
      title: "Restart",
      onClick: () => {
        this.audio.play(AUDIO_KEYS.uiClick);
        connection.room.send(CLIENT_MESSAGE.restart);
      },
    });
    this.restartButton.setStatus("Play again", true);
  }

  private hideWinBanner(): void {
    for (const obj of this.winBannerObjects) obj.destroy();
    this.winBannerObjects = [];
    this.restartButton?.destroy();
    this.restartButton = undefined;
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
        this.muteButton!.setStatus(muted ? "OFF" : "ON", true);
      },
    });
    this.muteButton.setStatus(this.audio.isMuted ? "OFF" : "ON", true);
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
    const sky = this.add.rectangle(0, 0, BATTLEFIELD_WIDTH, GROUND_Y, 0x232d3d).setOrigin(0, 0);
    const ground = this.add
      .rectangle(0, GROUND_Y, BATTLEFIELD_WIDTH, BATTLEFIELD_HEIGHT - GROUND_Y, 0x2f2f44)
      .setOrigin(0, 0);
    sky.setDepth(-2);
    ground.setDepth(-2);
    const line = this.add.graphics();
    line.lineStyle(2, 0x11151d, 1);
    line.lineBetween(0, GROUND_Y, BATTLEFIELD_WIDTH, GROUND_Y);
    line.setDepth(-1);
  }
}
