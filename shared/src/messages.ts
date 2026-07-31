import type { UnitType } from "./units.js";
import type { Side } from "./ids.js";

// Network protocol for the Colyseus MatchRoom (build plan 5.2/11.3). The
// client only ever sends intentions; the server validates and decides
// everything (ammo/cooldown/cost/collision/damage/victory). Which side sent
// a message is derived server-side from `client.sessionId`, never trusted
// from the payload.

/** Client -> server message type strings (used as the Colyseus `type` argument). */
export const CLIENT_MESSAGE = {
  ready: "ready",
  fire: "fire",
  reload: "reload",
  aim: "aim",
  purchaseUnit: "purchaseUnit",
  restart: "restart",
} as const;

export interface FireMessage {
  readonly angle: number;
}

export interface AimMessage {
  readonly angle: number;
}

export interface PurchaseUnitMessage {
  readonly unitType: UnitType;
}

/** Server -> client notifications for events the state diff alone doesn't explain. */
export const SERVER_MESSAGE = {
  matchRestarted: "matchRestarted",
  assignedSide: "assignedSide",
} as const;

export interface MatchRestartedMessage {
  readonly initiatedBySide: Side;
}

/**
 * Sent once per fresh join (and once per successful reconnect, since a page
 * refresh loses any client-side memory of it) — nothing in `MatchState`
 * identifies which side a given connection controls, so without this the
 * client can't tell its own gunner/purchase row from the opponent's.
 */
export type AssignedSideMessage = Side;
