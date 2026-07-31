import { Schema, type } from "@colyseus/schema";
import type { Side } from "../ids.js";
import { PROJECTILE_GRAVITY_Y } from "../config.js";

/**
 * Authoritative rifle projectile. Only the player/AI rifle fires these
 * (drone attacks are instant server-side hits with a client-inferred visual
 * — see DroneState.attackFlashSeq — not real networked projectiles).
 */
export class ProjectileState extends Schema {
  @type("string") id = "";
  @type("string") side: Side = "left";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") vx = 0;
  @type("number") vy = 0;
  @type("number") damage = 0;

  init(id: string, side: Side, x: number, y: number, vx: number, vy: number, damage: number): void {
    this.id = id;
    this.side = side;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.damage = damage;
  }

  /** Gravity-arced flight (build plan 5.1 "visible projectile travel"). */
  step(deltaMs: number): void {
    const dt = deltaMs / 1000;
    this.vy += PROJECTILE_GRAVITY_Y * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }
}
