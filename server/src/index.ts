// Colyseus match server (build plan section 15, "Online multiplayer alpha").
// Plain `ws`-based WebSocketTransport, not uWebSockets.js — see CLAUDE.md /
// session notes: uWebSockets.js requires a git-protocol fetch this sandbox
// blocks, and the plain ws transport is sufficient at this scale.
import http from "node:http";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { MatchRoom } from "./rooms/MatchRoom.js";

const port = Number(process.env.PORT ?? 2567);

const httpServer = http.createServer();
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define("match", MatchRoom);

gameServer.listen(port).then(() => {
  console.log(`towerfront match server listening on ws://localhost:${port}`);
});
