import { Client, getStateCallbacks, type Room } from "colyseus.js";
import type { MatchState } from "@towerfront/shared";

// Dev-only: no deployed server yet, so this is hardcoded to the local
// MatchRoom bootstrap (server/src/index.ts) rather than derived from
// location/env. Revisit once there's a real deployment target.
const SERVER_URL = "ws://localhost:2567";

// colyseus.js has no built-in reconnection — a dropped WS connection just
// stays dropped unless the app explicitly calls client.reconnect(). Without
// persisting the token, a page refresh (F5) always looks like a brand new
// player to the server: MatchRoom reserves the old seat for a 20s grace
// window (see server onLeave), so the refreshed tab's fresh joinOrCreate()
// can't rejoin that same room/side and ends up racing a second one instead.
// sessionStorage scopes this to the single tab/session, same as the seat
// reservation's own intent — a genuinely different tab (or the seat expiring)
// should NOT silently inherit someone else's side.
const RECONNECTION_TOKEN_KEY = "towerfront:reconnectionToken";

export interface MatchConnection {
  readonly client: Client;
  readonly room: Room<MatchState>;
  readonly $: ReturnType<typeof getStateCallbacks<MatchState>>;
}

function wrap(client: Client, room: Room<MatchState>): MatchConnection {
  sessionStorage.setItem(RECONNECTION_TOKEN_KEY, room.reconnectionToken);
  return { client, room, $: getStateCallbacks(room) };
}

/** Shared by `tryResumeSession` and `connectToMatch` — never throws: a missing/expired/invalid token both look the same to a caller (nothing to resume), so this normalizes them to `null` and clears the stale token either way. */
async function attemptStoredReconnect(client: Client): Promise<MatchConnection | null> {
  const storedToken = sessionStorage.getItem(RECONNECTION_TOKEN_KEY);
  if (!storedToken) return null;
  try {
    return wrap(client, await client.reconnect<MatchState>(storedToken));
  } catch {
    // Grace window expired, or the room/seat is gone.
    sessionStorage.removeItem(RECONNECTION_TOKEN_KEY);
    return null;
  }
}

/**
 * Used by MainMenuScene to decide whether a resumable session exists before
 * ever showing the name-entry UI — a stored token found valid here skips
 * straight back into the same match, matching the pre-menu refresh
 * behavior. Returns `null` (never throws) for "nothing to resume": a fresh
 * visit with no token, or one whose grace window already expired.
 */
export async function tryResumeSession(): Promise<MatchConnection | null> {
  return attemptStoredReconnect(new Client(SERVER_URL));
}

// Deliberately NOT passing MatchState as an explicit rootSchema, even though
// that would give real getters/methods (e.g. PlayerState.laneEdgeX) instead
// of colyseus.js's reflection-built fallback class: empirically, passing a
// real decorated class as rootSchema breaks the reactive callback system
// entirely — `$(state).players.onAdd()` and `.listen()` silently never fire
// (confirmed by a standalone repro against a live server; state.players
// itself still decodes fine, only the change-callback wiring breaks). Every
// UI update in this scene depends on those callbacks, so reflection mode is
// the only one that actually works today — revisit if colyseus.js fixes
// this, or if an entity genuinely needs a server-side getter.
/**
 * `name` is only used for a fresh join — a reconnect (stored token or
 * `reconnectToMatch` below) resumes the same session, which already has a
 * `displayName` set server-side from the original join, so there's nothing
 * to resend.
 */
export async function connectToMatch(name: string): Promise<MatchConnection> {
  const client = new Client(SERVER_URL);
  // MainMenuScene already tries this first (see tryResumeSession) and would
  // have skipped straight to NetworkMatchScene with an established
  // connection on success, so this only ever finds something to resume here
  // if this scene was reached some other way (there isn't one today) —
  // kept as a safety net rather than assuming the caller always checked.
  const resumed = await attemptStoredReconnect(client);
  if (resumed) return resumed;

  return wrap(client, await client.joinOrCreate<MatchState>("match", { name }));
}

/** Attempts to resume the same session after an unexpected drop (network blip, not a deliberate leave). Throws if the grace window has expired. */
export async function reconnectToMatch(connection: MatchConnection): Promise<MatchConnection> {
  return wrap(connection.client, await connection.client.reconnect<MatchState>(connection.room.reconnectionToken));
}
