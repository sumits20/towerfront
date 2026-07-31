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
export async function connectToMatch(): Promise<MatchConnection> {
  const client = new Client(SERVER_URL);
  const storedToken = sessionStorage.getItem(RECONNECTION_TOKEN_KEY);

  if (storedToken) {
    try {
      return wrap(client, await client.reconnect<MatchState>(storedToken));
    } catch {
      // Grace window expired, or the room/seat is gone — fall through to a fresh join.
      sessionStorage.removeItem(RECONNECTION_TOKEN_KEY);
    }
  }

  return wrap(client, await client.joinOrCreate<MatchState>("match"));
}

/** Attempts to resume the same session after an unexpected drop (network blip, not a deliberate leave). Throws if the grace window has expired. */
export async function reconnectToMatch(connection: MatchConnection): Promise<MatchConnection> {
  return wrap(connection.client, await connection.client.reconnect<MatchState>(connection.room.reconnectionToken));
}
