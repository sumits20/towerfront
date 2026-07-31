import { defineConfig } from "@playwright/test";

// Regression suite for the networked MatchRoom client (NetworkMatchScene).
// Run after any change to client/src/net/**, client/src/scenes/NetworkMatchScene.ts,
// or server/src/rooms/MatchRoom.ts's connection lifecycle — these scenarios have
// broken silently before (see client/tests/multiplayer.spec.ts header comment).
export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "npm run dev",
      cwd: "../server",
      port: 2567,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: "npm run dev",
      cwd: ".",
      port: 5173,
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
