// Minimal introspection hook for Playwright (client/tests/*.spec.ts). Phaser
// renders to a <canvas>, so there's nothing in the DOM for tests to assert
// against directly — this exposes the same state the on-canvas UI is driven
// by, so tests can assert on real values instead of screenshot comparisons
// or fixed sleeps.
export interface TowerfrontDebugState {
  readonly leftConnected: boolean;
  readonly rightConnected: boolean;
  readonly started: boolean;
  readonly reconnecting: boolean;
  readonly statusText: string;
  readonly statusVisible: boolean;
  readonly disconnectBannerText: string;
  readonly disconnectBannerVisible: boolean;
  readonly towersReady: boolean;
}

declare global {
  interface Window {
    __towerfrontDebug?: TowerfrontDebugState;
    __towerfrontSimulateDrop?: () => void;
  }
}

export function setDebugState(state: TowerfrontDebugState): void {
  window.__towerfrontDebug = state;
}

// Test-only: `BrowserContext.setOffline()` does not sever an already-open
// WebSocket in Chromium, and Playwright's `routeWebSocket()` crashes against
// colyseus.js's Node/browser transport fallback (its `new WebSocket(url, {
// headers, protocols })` call, meant to throw synchronously and fall back to
// `new WebSocket(url, protocols)` in real browsers, instead gets accepted by
// Playwright's WS-mock layer and blows up deserializing `protocols` as an
// array). Closing the live socket directly from inside the page sidesteps
// both — no protocol handshake (unlike `room.leave()`), so the server sees
// a genuine unconsented drop, exactly like a real network blip.
export function setSimulateDropHook(fn: () => void): void {
  window.__towerfrontSimulateDrop = fn;
}
