import { test, expect, type Page, type Browser } from "@playwright/test";
import type { TowerfrontDebugState } from "../src/net/testHooks";

// Regression suite for NetworkMatchScene <-> MatchRoom connection lifecycle.
// Every scenario here corresponds to a bug that actually shipped once and
// was only caught by manually opening two tabs:
//   - the "waiting for opponent" full-screen text getting reused for a
//     mid-match opponent disconnect (should be a small non-blocking banner);
//   - a race where the join promise resolves before ROOM_STATE arrives,
//     crashing setup and leaving only one tower rendered;
//   - a page refresh not reusing the reconnection token, silently orphaning
//     the old seat and racing a second, unpaired room.
// Run this after any change to client/src/net/**, client/src/scenes/
// NetworkMatchScene.ts, or server/src/rooms/MatchRoom.ts's join/leave
// handling — treat any failure here as a blocker, not a footnote, before
// calling networking work "verified".

async function gotoMatch(page: Page): Promise<void> {
  await page.goto("/");
  await page.waitForFunction(() => window.__towerfrontDebug !== undefined, undefined, { timeout: 15_000 });
}

async function debugState(page: Page): Promise<TowerfrontDebugState | undefined> {
  return page.evaluate(() => window.__towerfrontDebug);
}

async function waitForDebug(
  page: Page,
  predicate: (state: TowerfrontDebugState) => boolean,
  timeout = 15_000,
): Promise<TowerfrontDebugState> {
  let last: TowerfrontDebugState | undefined;
  try {
    await expect
      .poll(async () => {
        last = await debugState(page);
        return last ? predicate(last) : false;
      }, { timeout })
      .toBe(true);
  } catch (err) {
    // `expect.poll`'s `message` option is a string, not a function — passing
    // a closure there (as this used to) gets stringified via its own
    // toString() instead of being called, silently hiding `last` from every
    // failure. Re-throwing here is what actually surfaces the real state.
    throw new Error(`debug state predicate never became true; last state: ${JSON.stringify(last)}`, { cause: err });
  }
  return last!;
}

/** Two tabs = two separate browser profiles (contexts), not two pages sharing one — matches real usage and lets a network disruption target only one side. */
async function openTwoTabs(browser: Browser) {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  const errorsA: string[] = [];
  const errorsB: string[] = [];
  pageA.on("pageerror", (err) => errorsA.push(err.message));
  pageB.on("pageerror", (err) => errorsB.push(err.message));

  await gotoMatch(pageA);
  await waitForDebug(pageA, (s) => s.towersReady); // let A settle before B joins, matching real usage pacing
  await gotoMatch(pageB);
  await waitForDebug(pageA, (s) => s.started);
  await waitForDebug(pageB, (s) => s.started);

  return { contextA, contextB, pageA, pageB, errorsA, errorsB };
}

test.describe("MatchRoom multiplayer", () => {
  test("two tabs connect and both see full authoritative state", async ({ browser }) => {
    const { contextA, contextB, pageA, pageB, errorsA, errorsB } = await openTwoTabs(browser);
    try {
      const stateA = await debugState(pageA);
      const stateB = await debugState(pageB);

      for (const state of [stateA, stateB]) {
        expect(state?.towersReady).toBe(true);
        expect(state?.leftConnected).toBe(true);
        expect(state?.rightConnected).toBe(true);
        expect(state?.started).toBe(true);
        expect(state?.statusVisible).toBe(false);
        expect(state?.disconnectBannerVisible).toBe(false);
      }

      expect(errorsA).toEqual([]);
      expect(errorsB).toEqual([]);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });

  test("closing one tab shows a small non-blocking banner on the survivor, never the full-screen waiting text", async ({
    browser,
  }) => {
    const { contextA, contextB, pageA, errorsA } = await openTwoTabs(browser);
    try {
      await contextB.close(); // abrupt-ish close, same as a user closing the tab

      const state = await waitForDebug(pageA, (s) => s.disconnectBannerVisible);

      expect(state.towersReady).toBe(true);
      expect(state.disconnectBannerText).toContain("AI took over");
      // The critical regression: a mid-match disconnect must NEVER fall back
      // to the pre-match full-screen text — the match is still live underneath.
      expect(state.statusVisible).toBe(false);
      expect(state.statusText).toBe("");

      expect(errorsA).toEqual([]);
    } finally {
      await contextA.close();
    }
  });

  test("a mid-match network drop auto-reconnects within the grace window", async ({ browser }) => {
    // Two mechanisms were tried and rejected here:
    // - `contextA.setOffline(true)` does NOT sever an already-established
    //   WebSocket in Chromium — confirmed by a standalone 24s probe where
    //   `reconnecting` never flipped true, i.e. the client never even
    //   noticed anything was wrong.
    // - `context.routeWebSocket()` crashes the page: colyseus.js's transport
    //   tries `new WebSocket(url, { headers, protocols })` first (a Node-only
    //   form meant to throw synchronously in real browsers so it can fall
    //   back to `new WebSocket(url, protocols)`), and Playwright's WS-mock
    //   layer accepts that malformed call instead of throwing, then crashes
    //   deserializing `protocols` as an array.
    // Closing the live socket directly from the page (see
    // client/src/net/testHooks.ts) sidesteps both.
    const { contextA, contextB, pageA, errorsA } = await openTwoTabs(browser);

    try {
      await pageA.evaluate(() => window.__towerfrontSimulateDrop?.());
      await waitForDebug(pageA, (s) => s.reconnecting, 20_000);

      const state = await waitForDebug(pageA, (s) => !s.reconnecting && s.leftConnected && s.rightConnected, 25_000);
      expect(state.towersReady).toBe(true);
      expect(state.disconnectBannerVisible).toBe(false);
      expect(state.statusVisible).toBe(false);

      expect(errorsA).toEqual([]);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });

  test("refreshing a single connected tab resumes the same session cleanly, never a broken half-render", async ({
    browser,
  }) => {
    const { contextA, contextB, pageA, errorsA } = await openTwoTabs(browser);
    try {
      await pageA.reload();
      await pageA.waitForFunction(() => window.__towerfrontDebug !== undefined, undefined, { timeout: 15_000 });
      await waitForDebug(pageA, (s) => s.towersReady);

      // The regression this guards: a half-rendered state (only one tower,
      // stray-styled overlay, off-center text) caused by a race between the
      // join promise and the first state sync. Post-refresh, the client must
      // land in exactly one of two well-defined states — never anything else.
      const state = await waitForDebug(
        pageA,
        (s) => (s.leftConnected && s.rightConnected && s.statusText === "") || s.reconnecting,
        15_000,
      );
      expect(state.towersReady).toBe(true);

      if (!state.reconnecting) {
        expect(state.leftConnected).toBe(true);
        expect(state.rightConnected).toBe(true);
        expect(state.statusVisible).toBe(false);
      }

      expect(errorsA).toEqual([]);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
