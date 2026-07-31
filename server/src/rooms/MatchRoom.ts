import { Room, Client } from "@colyseus/core";
import {
  MatchState,
  PlayerState,
  UnitState,
  DroneState,
  ProjectileState,
  GoodieState,
  UNIT_DEFINITIONS,
  WEAPON_DEFINITIONS,
  PURCHASABLE_UNIT_TYPES,
  EasyAiController,
  CLIENT_MESSAGE,
  SERVER_MESSAGE,
  BATTLEFIELD_WIDTH,
  GROUND_Y,
  SIMULATION_TICK_MS,
  UNIT_HIT_RADIUS,
  DRONE_HIT_RADIUS,
  GOODIE_HIT_RADIUS,
  BARREL_LENGTH,
  UNIT_SPAWN_OFFSET,
  STARTING_MONEY,
  PASSIVE_INCOME_AMOUNT,
  PASSIVE_INCOME_INTERVAL_MS,
  GOODIE_MIN_INTERVAL_MS,
  GOODIE_MAX_INTERVAL_MS,
  GOODIE_SPAWN_MARGIN,
  GOODIE_START_Y,
  GOODIE_GOLD_AMOUNT,
  GOODIE_REPAIR_AMOUNT,
  AI_AIM_SPREAD_RAD,
  AI_INITIAL_DELAY_MIN_MS,
  AI_INITIAL_DELAY_MAX_MS,
  MAX_PLAYER_NAME_LENGTH,
  type Side,
  type UnitType,
  type PurchasableUnitType,
  type GoodieType,
  type FireMessage,
  type AimMessage,
  type PurchaseUnitMessage,
} from "@towerfront/shared";

const SIDES: readonly Side[] = ["left", "right"];
const RECONNECTION_GRACE_SECONDS = 20;

function otherSide(side: Side): Side {
  return side === "left" ? "right" : "left";
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function isPurchasable(unitType: UnitType): unitType is PurchasableUnitType {
  return (PURCHASABLE_UNIT_TYPES as readonly UnitType[]).includes(unitType);
}

/** Never trust the client's join options as-is, even for a display-only field — re-trim/cap/type-check server-side. */
function sanitizeDisplayName(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim().slice(0, MAX_PLAYER_NAME_LENGTH);
  return trimmed || fallback;
}

/**
 * Authoritative match simulation (build plan 5.2/5.3). Owns money, health,
 * cooldowns, purchases, collisions, damage, kills and victory — clients only
 * ever send intentions via onMessage below and render whatever this room
 * broadcasts. Any side without a connected human is driven by EasyAiController
 * so a match always has two active sides.
 */
export class MatchRoom extends Room<MatchState> {
  override maxClients = 2;

  private readonly sessionSides = new Map<string, Side>();
  private readonly ai: Record<Side, EasyAiController> = {
    left: new EasyAiController(randomBetween(AI_INITIAL_DELAY_MIN_MS, AI_INITIAL_DELAY_MAX_MS)),
    right: new EasyAiController(randomBetween(AI_INITIAL_DELAY_MIN_MS, AI_INITIAL_DELAY_MAX_MS)),
  };

  private elapsedMs = 0;
  private nextEntityId = 0;
  private nextGoodieAtMs = 0;
  private nextPassiveIncomeAtMs = 0;
  private readonly nextFireAtMs: Record<Side, number> = { left: 0, right: 0 };
  private readonly reloadCompleteAtMs: Record<Side, number> = { left: 0, right: 0 };

  override onCreate(): void {
    this.resetMatch();

    this.onMessage(CLIENT_MESSAGE.ready, (client) => {
      const side = this.sessionSides.get(client.sessionId);
      if (!side || this.state.started) return;
      this.state.players.get(side)!.ready = true;
    });

    this.onMessage<AimMessage>(CLIENT_MESSAGE.aim, (client, message) => {
      const side = this.sessionSides.get(client.sessionId);
      if (!side || !this.state.started || this.state.matchOver) return;
      this.state.players.get(side)!.gunnerAimAngle = message.angle;
    });

    this.onMessage<FireMessage>(CLIENT_MESSAGE.fire, (client, message) => {
      const side = this.sessionSides.get(client.sessionId);
      if (!side || !this.state.started || this.state.matchOver) return;
      this.fireWeapon(side, message.angle);
    });

    this.onMessage(CLIENT_MESSAGE.reload, (client) => {
      const side = this.sessionSides.get(client.sessionId);
      if (!side || !this.state.started || this.state.matchOver) return;
      this.startReload(side);
    });

    this.onMessage<PurchaseUnitMessage>(CLIENT_MESSAGE.purchaseUnit, (client, message) => {
      const side = this.sessionSides.get(client.sessionId);
      if (!side || !this.state.started || this.state.matchOver) return;
      this.purchaseUnit(side, message.unitType);
    });

    this.onMessage(CLIENT_MESSAGE.restart, (client) => {
      const side = this.sessionSides.get(client.sessionId);
      // Mirrors the original single-player design, where Restart only ever
      // appeared on the post-match win banner — without this gate, either
      // side could force-reset a match the other side is still playing.
      if (!side || !this.state.matchOver) return;
      this.broadcast(SERVER_MESSAGE.matchRestarted, { initiatedBySide: side });
      this.resetMatch();
    });

    this.setSimulationInterval((deltaMs) => this.tick(deltaMs), SIMULATION_TICK_MS);
  }

  override onJoin(client: Client, options?: { name?: unknown }): void {
    const side = SIDES.find((candidate) => !this.state.players.get(candidate)!.connected);
    if (!side) {
      // maxClients already guards this, but never silently misassign a side.
      throw new Error("MatchRoom is full");
    }
    this.sessionSides.set(client.sessionId, side);
    const player = this.state.players.get(side)!;
    player.connected = true;
    player.displayName = sanitizeDisplayName(options?.name, side === "left" ? "Player 1" : "Player 2");
    client.send(SERVER_MESSAGE.assignedSide, side);
  }

  override async onLeave(client: Client, consented: boolean): Promise<void> {
    const side = this.sessionSides.get(client.sessionId);
    if (!side) return;
    const player = this.state.players.get(side)!;
    // AI takes over immediately so the match doesn't stall — control is
    // handed back automatically if/when this side's connected flag flips
    // true again below.
    player.connected = false;
    player.ready = false;

    if (consented) {
      // Deliberate leave (e.g. closed tab/navigated away) — don't hold the seat.
      this.sessionSides.delete(client.sessionId);
      return;
    }

    try {
      // Reserves the seat for the grace window so a third client can't take
      // it out from under a merely-disconnected player; resolves with the
      // same sessionId on reconnect, so `sessionSides` stays valid as-is.
      await this.allowReconnection(client, RECONNECTION_GRACE_SECONDS);
      player.connected = true;
      // onJoin (where this is normally sent) does NOT re-fire for a
      // reconnect — and a page refresh wipes any client-side memory of it —
      // so it has to be resent here too.
      client.send(SERVER_MESSAGE.assignedSide, side);
    } catch {
      this.sessionSides.delete(client.sessionId);
    }
  }

  /** Shared by onCreate and the "restart" message — resets all match state in place so connected clients don't need to reconnect. */
  private resetMatch(): void {
    const state = new MatchState();

    for (const side of SIDES) {
      const player = new PlayerState();
      player.init(side);
      player.gold = STARTING_MONEY;
      player.gunnerMagazineSize = WEAPON_DEFINITIONS.rifle.magazineSize;
      player.gunnerAmmo = WEAPON_DEFINITIONS.rifle.magazineSize;
      const previous = this.state?.players.get(side);
      player.connected = previous?.connected ?? false;
      player.displayName = sanitizeDisplayName(previous?.displayName, side === "left" ? "Player 1" : "Player 2");
      state.players.set(side, player);
    }

    this.state = state;
    this.elapsedMs = 0;
    this.nextEntityId = 0;
    this.nextPassiveIncomeAtMs = PASSIVE_INCOME_INTERVAL_MS;
    this.scheduleNextGoodie();
    this.nextFireAtMs.left = 0;
    this.nextFireAtMs.right = 0;
    this.reloadCompleteAtMs.left = 0;
    this.reloadCompleteAtMs.right = 0;
  }

  private nextId(prefix: string): string {
    this.nextEntityId += 1;
    return `${prefix}${this.nextEntityId}`;
  }

  private tick(deltaMs: number): void {
    this.elapsedMs += deltaMs;
    this.state.elapsedMs = this.elapsedMs;

    if (!this.state.started) {
      this.checkAllReady();
      return;
    }
    if (this.state.matchOver) return;

    this.updateReloads();
    this.updateAiPurchasing();
    this.updateAiShooting();
    this.stepProjectiles(deltaMs);
    this.handleProjectileCollisions();
    this.updateUnitsAndDrones(deltaMs);
    this.pruneDead();
    this.updatePassiveIncome();
    this.updateGoodie(deltaMs);
    this.checkWinCondition();
  }

  private checkAllReady(): void {
    const allReady = SIDES.every((side) => {
      const player = this.state.players.get(side)!;
      return !player.connected || player.ready;
    });
    if (allReady) {
      this.state.started = true;
    }
  }

  // ---- weapon handling ----------------------------------------------------

  private fireWeapon(side: Side, angle: number): void {
    const player = this.state.players.get(side)!;
    if (player.gunnerReloading) return;
    if (player.gunnerAmmo <= 0) {
      this.startReload(side);
      return;
    }
    if (this.elapsedMs < this.nextFireAtMs[side]) return;

    const weapon = WEAPON_DEFINITIONS.rifle;
    player.gunnerAmmo -= 1;
    this.nextFireAtMs[side] = this.elapsedMs + weapon.fireCooldownMs;

    const muzzleX = player.gunnerAnchorX + Math.cos(angle) * BARREL_LENGTH;
    const muzzleY = player.gunnerAnchorY + Math.sin(angle) * BARREL_LENGTH;
    const id = this.nextId("p");
    const projectile = new ProjectileState();
    projectile.init(
      id,
      side,
      muzzleX,
      muzzleY,
      Math.cos(angle) * weapon.projectileSpeed,
      Math.sin(angle) * weapon.projectileSpeed,
      weapon.damage,
    );
    this.state.projectiles.set(id, projectile);

    if (player.gunnerAmmo <= 0) {
      this.startReload(side);
    }
  }

  private startReload(side: Side): void {
    const player = this.state.players.get(side)!;
    if (player.gunnerReloading || player.gunnerAmmo === player.gunnerMagazineSize) return;
    player.gunnerReloading = true;
    this.reloadCompleteAtMs[side] = this.elapsedMs + WEAPON_DEFINITIONS.rifle.reloadTimeMs;
  }

  private updateReloads(): void {
    for (const side of SIDES) {
      const player = this.state.players.get(side)!;
      if (player.gunnerReloading && this.elapsedMs >= this.reloadCompleteAtMs[side]) {
        player.gunnerAmmo = player.gunnerMagazineSize;
        player.gunnerReloading = false;
      }
    }
  }

  // ---- purchases ------------------------------------------------------------

  private purchaseUnit(side: Side, unitType: UnitType): boolean {
    if (!isPurchasable(unitType)) return false;
    const player = this.state.players.get(side)!;
    const definition = UNIT_DEFINITIONS[unitType];
    const cooldownUntil = player.purchaseCooldownUntilMs.get(unitType) ?? 0;
    if (this.elapsedMs < cooldownUntil) return false;
    if (player.gold < definition.cost) return false;

    player.gold -= definition.cost;
    player.purchaseCooldownUntilMs.set(unitType, this.elapsedMs + definition.purchaseCooldownMs);
    this.spawnUnit(side, unitType);
    return true;
  }

  private spawnUnit(side: Side, unitType: UnitType): void {
    const player = this.state.players.get(side)!;
    const spawnX = side === "left" ? player.towerX + UNIT_SPAWN_OFFSET : player.towerX - UNIT_SPAWN_OFFSET;

    if (unitType === "drone") {
      const id = this.nextId("d");
      const drone = new DroneState();
      drone.init(id, side, spawnX);
      this.state.drones.set(id, drone);
      return;
    }

    const id = this.nextId("u");
    const unit = new UnitState();
    unit.init(id, side, unitType, spawnX, GROUND_Y);
    this.state.units.set(id, unit);
  }

  // ---- per-tick simulation ---------------------------------------------------

  private unitsOf(side: Side): UnitState[] {
    const list: UnitState[] = [];
    this.state.units.forEach((unit) => {
      if (unit.side === side && unit.alive) list.push(unit);
    });
    return list;
  }

  private dronesOf(side: Side): DroneState[] {
    const list: DroneState[] = [];
    this.state.drones.forEach((drone) => {
      if (drone.side === side && drone.alive) list.push(drone);
    });
    return list;
  }

  private updateUnitsAndDrones(deltaMs: number): void {
    const leftUnits = this.unitsOf("left");
    const rightUnits = this.unitsOf("right");
    const leftDrones = this.dronesOf("left");
    const rightDrones = this.dronesOf("right");
    const leftPlayer = this.state.players.get("left")!;
    const rightPlayer = this.state.players.get("right")!;

    for (const unit of leftUnits) unit.update(this.elapsedMs, deltaMs, rightUnits, rightPlayer);
    for (const unit of rightUnits) unit.update(this.elapsedMs, deltaMs, leftUnits, leftPlayer);
    for (const drone of leftDrones) drone.update(this.elapsedMs, deltaMs, rightDrones, rightUnits, rightPlayer);
    for (const drone of rightDrones) drone.update(this.elapsedMs, deltaMs, leftDrones, leftUnits, leftPlayer);
  }

  private pruneDead(): void {
    const deadUnitIds: string[] = [];
    this.state.units.forEach((unit, id) => {
      if (!unit.alive) deadUnitIds.push(id);
    });
    for (const id of deadUnitIds) this.state.units.delete(id);

    const deadDroneIds: string[] = [];
    this.state.drones.forEach((drone, id) => {
      if (!drone.alive) deadDroneIds.push(id);
    });
    for (const id of deadDroneIds) this.state.drones.delete(id);
  }

  private stepProjectiles(deltaMs: number): void {
    this.state.projectiles.forEach((projectile) => projectile.step(deltaMs));
  }

  private isOffscreen(x: number, y: number): boolean {
    return x < -50 || x > BATTLEFIELD_WIDTH + 50 || y > GROUND_Y + 50;
  }

  private distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private handleProjectileCollisions(): void {
    const spentProjectileIds: string[] = [];

    this.state.projectiles.forEach((projectile, id) => {
      const targetSide = otherSide(projectile.side);
      let hit = false;

      for (const unit of this.unitsOf(targetSide)) {
        if (this.distance(projectile, unit) <= UNIT_HIT_RADIUS) {
          unit.takeDamage(projectile.damage);
          this.awardBountyIfKilled(projectile.side, unit);
          hit = true;
          break;
        }
      }

      if (!hit) {
        for (const drone of this.dronesOf(targetSide)) {
          if (this.distance(projectile, drone) <= DRONE_HIT_RADIUS) {
            drone.takeDamage(projectile.damage);
            this.awardBountyIfKilled(projectile.side, drone);
            hit = true;
            break;
          }
        }
      }

      if (!hit && this.state.goodie && this.distance(projectile, this.state.goodie) <= GOODIE_HIT_RADIUS) {
        this.applyGoodieEffect(projectile.side, this.state.goodie.goodieType);
        this.state.goodie = undefined;
        this.scheduleNextGoodie();
        hit = true;
      }

      if (hit || this.isOffscreen(projectile.x, projectile.y)) {
        spentProjectileIds.push(id);
      }
    });

    for (const id of spentProjectileIds) this.state.projectiles.delete(id);
  }

  /** Build plan bounty rule: only rifle-projectile kills pay out — never unit-vs-unit or drone melee kills (those call `takeDamage` directly, not this path). */
  private awardBountyIfKilled(shooterSide: Side, target: UnitState | DroneState): void {
    if (target.alive) return;
    this.state.players.get(shooterSide)!.gold += UNIT_DEFINITIONS[target.unitType].bounty;
  }

  // ---- goodies ----------------------------------------------------------------

  private applyGoodieEffect(side: Side, goodieType: GoodieType): void {
    const player = this.state.players.get(side)!;
    if (goodieType === "gold") {
      player.gold += GOODIE_GOLD_AMOUNT;
    } else {
      player.towerRepair(GOODIE_REPAIR_AMOUNT);
    }
  }

  private updateGoodie(deltaMs: number): void {
    if (this.state.goodie) {
      this.state.goodie.step(deltaMs);
      if (this.state.goodie.y >= GROUND_Y) {
        this.state.goodie = undefined;
        this.scheduleNextGoodie();
      }
    } else if (this.elapsedMs >= this.nextGoodieAtMs) {
      this.spawnGoodie();
    }
  }

  private spawnGoodie(): void {
    const goodieType: GoodieType = Math.random() < 0.5 ? "gold" : "repair";
    const x = GOODIE_SPAWN_MARGIN + Math.random() * (BATTLEFIELD_WIDTH - 2 * GOODIE_SPAWN_MARGIN);
    const goodie = new GoodieState();
    goodie.init(goodieType, x, GOODIE_START_Y);
    this.state.goodie = goodie;
  }

  private scheduleNextGoodie(): void {
    this.nextGoodieAtMs = this.elapsedMs + randomBetween(GOODIE_MIN_INTERVAL_MS, GOODIE_MAX_INTERVAL_MS);
  }

  // ---- passive income -----------------------------------------------------------

  private updatePassiveIncome(): void {
    if (this.elapsedMs < this.nextPassiveIncomeAtMs) return;
    for (const side of SIDES) {
      this.state.players.get(side)!.gold += PASSIVE_INCOME_AMOUNT;
    }
    this.nextPassiveIncomeAtMs = this.elapsedMs + PASSIVE_INCOME_INTERVAL_MS;
  }

  // ---- AI (drives any side without a connected human) --------------------------------

  private updateAiPurchasing(): void {
    for (const side of SIDES) {
      const player = this.state.players.get(side)!;
      if (player.connected) continue;

      const options = PURCHASABLE_UNIT_TYPES.map((unitType) => ({
        type: unitType,
        cost: UNIT_DEFINITIONS[unitType].cost,
        ready: (player.purchaseCooldownUntilMs.get(unitType) ?? 0) <= this.elapsedMs,
      }));
      const choice = this.ai[side].decide(this.elapsedMs, player.gold, options);
      if (choice) this.purchaseUnit(side, choice);
    }
  }

  private findNearestByX<T extends { x: number }>(candidates: readonly T[], fromX: number): T | null {
    let closest: T | null = null;
    let closestDist = Infinity;
    for (const candidate of candidates) {
      const dist = Math.abs(candidate.x - fromX);
      if (dist < closestDist) {
        closest = candidate;
        closestDist = dist;
      }
    }
    return closest;
  }

  /** Build plan section 7 "Easy": tracks accurately (so the sprite visually aims right) but fires with a random angular spread — that's the "lower shooting accuracy" trait, not a firing-rate delay. */
  private updateAiShooting(): void {
    for (const side of SIDES) {
      const player = this.state.players.get(side)!;
      if (player.connected) continue;

      const enemySide = otherSide(side);
      const target =
        this.findNearestByX(this.dronesOf(enemySide), player.gunnerAnchorX) ??
        this.findNearestByX(this.unitsOf(enemySide), player.gunnerAnchorX);
      if (!target) continue;

      const trackAngle = Math.atan2(target.y - player.gunnerAnchorY, target.x - player.gunnerAnchorX);
      player.gunnerAimAngle = trackAngle;
      const shotAngle = trackAngle + (Math.random() - 0.5) * AI_AIM_SPREAD_RAD;
      this.fireWeapon(side, shotAngle);
    }
  }

  // ---- win condition -----------------------------------------------------------------

  private checkWinCondition(): void {
    const left = this.state.players.get("left")!;
    const right = this.state.players.get("right")!;
    if (left.towerHealth <= 0) {
      this.endMatch("right");
    } else if (right.towerHealth <= 0) {
      this.endMatch("left");
    }
  }

  private endMatch(winner: Side): void {
    if (this.state.matchOver) return;
    this.state.matchOver = true;
    this.state.winner = winner;
  }
}
