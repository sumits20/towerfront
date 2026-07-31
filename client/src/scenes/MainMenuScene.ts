import Phaser from "phaser";
import { BATTLEFIELD_WIDTH, BATTLEFIELD_HEIGHT, MAX_PLAYER_NAME_LENGTH } from "@towerfront/shared";
import { tryResumeSession } from "../net/connection";
import { setMenuDebugState } from "../net/testHooks";
import { PurchaseButton } from "../ui/PurchaseButton";
import type { StartData as CombatSandboxStartData } from "./CombatSandboxScene";
import type { StartData as NetworkMatchStartData } from "./NetworkMatchScene";

const BUTTON_WIDTH = 260;
const BUTTON_HEIGHT = 72;
const BUTTON_GAP = 30;

// "World-unit" (1:1 game scale) sizing for the name input — syncInputPosition()
// multiplies these by the current game scale on every resize.
const INPUT_BASE_WIDTH = 280;
const INPUT_BASE_PADDING_V = 10;
const INPUT_BASE_PADDING_H = 12;
const INPUT_BASE_FONT_SIZE = 16;
const INPUT_BASE_BORDER = 2;

/**
 * First scene shown on page load (see main.ts's scene order). Before
 * showing anything else, checks for a resumable networked session (a
 * refresh within the 20s reconnection grace window) and skips straight
 * into NetworkMatchScene if one exists — matching the pre-menu refresh
 * behavior, since re-entering a name for a session the server already has
 * a name for would be pure friction. Otherwise collects a display name
 * (no auth — just a label shown in-game) and routes to either the local
 * single-player sandbox or the networked match.
 */
export class MainMenuScene extends Phaser.Scene {
  private nameInputEl?: HTMLInputElement;
  private errorText?: Phaser.GameObjects.Text;
  private statusText?: Phaser.GameObjects.Text;
  private inputTopYWorld = 0;

  constructor() {
    super("MainMenuScene");
  }

  create(): void {
    this.add.rectangle(0, 0, BATTLEFIELD_WIDTH, BATTLEFIELD_HEIGHT, 0x1c2230).setOrigin(0, 0).setDepth(-2);

    const centerX = BATTLEFIELD_WIDTH / 2;
    const centerY = BATTLEFIELD_HEIGHT / 2;

    this.statusText = this.add
      .text(centerX, centerY, "Checking for an existing session...", {
        fontFamily: "monospace",
        fontSize: "18px",
        color: "#aab0bd",
      })
      .setOrigin(0.5);

    void this.checkForResumableSession();
  }

  /**
   * A fresh visit (no stored token at all) resolves this near-instantly —
   * no network round trip happens unless a token is actually present (see
   * tryResumeSession) — so the "Checking..." text is only ever visibly
   * shown for the refresh-within-grace-window case.
   */
  private async checkForResumableSession(): Promise<void> {
    let resumed: Awaited<ReturnType<typeof tryResumeSession>> = null;
    try {
      resumed = await tryResumeSession();
    } catch (err) {
      // tryResumeSession is designed to never throw (its own reconnect
      // attempt is caught internally) — this is only a guard against a
      // menu bug permanently stranding the page behind "Checking...".
      console.error(err);
    }

    if (resumed) {
      this.scene.start("NetworkMatchScene", { connection: resumed } satisfies NetworkMatchStartData);
      return;
    }

    this.statusText?.destroy();
    this.statusText = undefined;
    this.buildMenu();
  }

  /**
   * Stacked top-down, in the required order (title, input, label, buttons),
   * each element positioned from the *measured* bottom edge of the one
   * above it (title.displayHeight, the DOM input's own updateSize()-
   * measured height, ...) rather than fixed magic-number offsets — guessed
   * offsets are what caused the original overlap: real font-metric/box-
   * model rendering doesn't match hand-estimated pixel values closely
   * enough to safely hardcode. Measuring after creation is correct
   * regardless of font/engine differences.
   */
  private buildMenu(): void {
    const centerX = BATTLEFIELD_WIDTH / 2;
    const GAP = 32;
    let y = 130;

    const title = this.add
      .text(centerX, y, "TOWERFRONT", { fontFamily: "monospace", fontSize: "56px", color: "#ffffff" })
      .setOrigin(0.5, 0);
    y += title.displayHeight + GAP;

    this.nameInputEl = document.createElement("input");
    this.nameInputEl.type = "text";
    this.nameInputEl.placeholder = "Enter your name";
    this.nameInputEl.maxLength = MAX_PLAYER_NAME_LENGTH;
    this.nameInputEl.style.cssText = [
      "position:fixed",
      "z-index:10",
      "box-sizing:border-box",
      "background:#0b0c10",
      "color:#e6e8ee",
      "border-style:solid",
      "border-color:#4a5064",
      "border-radius:4px",
      "outline:none",
      "text-align:center",
      "font-family:monospace",
    ].join(";");
    this.nameInputEl.addEventListener("input", () => this.clearError());
    this.nameInputEl.addEventListener("keydown", (event) => {
      // Enter defaults to the (more common) local vs-AI mode rather than doing nothing.
      if (event.key === "Enter") this.tryStart("computer");
    });
    // Phaser's own add.dom() positioning is bypassed here entirely: it puts
    // this element visibly off-center at any game scale other than 1:1
    // (confirmed empirically — correct at a 1600x900 viewport, off to the
    // left at the default 1280x720 one — across two different origin/offset
    // configurations, so it's an upstream quirk, not something worth
    // continuing to chase through Phaser's DOM transform math). Appending
    // directly to the document and positioning from the canvas's own real
    // getBoundingClientRect() in syncInputPosition() is correct by
    // construction regardless of the current game scale.
    document.body.appendChild(this.nameInputEl);
    this.inputTopYWorld = y;
    this.syncInputPosition();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.syncInputPosition, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.syncInputPosition, this);
      this.nameInputEl?.remove();
    });
    y += this.nameInputEl.getBoundingClientRect().height / this.getGameScale() + GAP;

    const label = this.add
      .text(centerX, y, "Display name", { fontFamily: "monospace", fontSize: "16px", color: "#aab0bd" })
      .setOrigin(0.5, 0);
    y += label.displayHeight + GAP;

    this.errorText = this.add
      .text(centerX, y, "", { fontFamily: "monospace", fontSize: "14px", color: "#d6453d" })
      .setOrigin(0.5, 0);
    y += this.errorText.displayHeight + GAP;

    const buttonY = y;
    const vsComputer = new PurchaseButton(this, {
      x: centerX - BUTTON_GAP / 2 - BUTTON_WIDTH,
      y: buttonY,
      width: BUTTON_WIDTH,
      height: BUTTON_HEIGHT,
      title: "Play vs Computer",
      onClick: () => this.tryStart("computer"),
    });
    vsComputer.setStatus("Local single-player vs AI", true);

    const playOnline = new PurchaseButton(this, {
      x: centerX + BUTTON_GAP / 2,
      y: buttonY,
      width: BUTTON_WIDTH,
      height: BUTTON_HEIGHT,
      title: "Play Online",
      onClick: () => this.tryStart("online"),
    });
    playOnline.setStatus("Multiplayer match", true);

    setMenuDebugState({
      playVsComputerButtonCenter: { x: centerX - BUTTON_GAP / 2 - BUTTON_WIDTH / 2, y: buttonY + BUTTON_HEIGHT / 2 },
      playOnlineButtonCenter: { x: centerX + BUTTON_GAP / 2 + BUTTON_WIDTH / 2, y: buttonY + BUTTON_HEIGHT / 2 },
    });

    this.nameInputEl.focus();
  }

  private tryStart(mode: "computer" | "online"): void {
    const playerName = (this.nameInputEl?.value ?? "").trim().slice(0, MAX_PLAYER_NAME_LENGTH);
    if (!playerName) {
      this.errorText?.setText("Enter a display name to continue");
      this.nameInputEl?.focus();
      return;
    }

    if (mode === "computer") {
      this.scene.start("CombatSandboxScene", {
        autoStart: true,
        playerName,
      } satisfies CombatSandboxStartData);
    } else {
      this.scene.start("NetworkMatchScene", { playerName } satisfies NetworkMatchStartData);
    }
  }

  private clearError(): void {
    if (this.errorText?.text) this.errorText.setText("");
  }

  /** Uniform — Phaser.Scale.FIT always preserves BATTLEFIELD's aspect ratio, so X and Y scale identically. */
  private getGameScale(): number {
    return this.game.canvas.getBoundingClientRect().width / BATTLEFIELD_WIDTH;
  }

  /**
   * Repositions/resizes the raw `<input>` from the canvas's real on-screen
   * rect (see the comment in buildMenu() for why this exists instead of
   * add.dom()). Re-run on every game resize, since Phaser.Scale.FIT changes
   * the canvas's CSS size whenever the browser window does.
   */
  private syncInputPosition(): void {
    if (!this.nameInputEl) return;
    const canvasRect = this.game.canvas.getBoundingClientRect();
    const scale = this.getGameScale();
    const centerXWorld = BATTLEFIELD_WIDTH / 2;

    this.nameInputEl.style.left = `${canvasRect.left + centerXWorld * scale}px`;
    this.nameInputEl.style.top = `${canvasRect.top + this.inputTopYWorld * scale}px`;
    this.nameInputEl.style.transform = "translateX(-50%)";
    this.nameInputEl.style.width = `${INPUT_BASE_WIDTH * scale}px`;
    this.nameInputEl.style.padding = `${INPUT_BASE_PADDING_V * scale}px ${INPUT_BASE_PADDING_H * scale}px`;
    this.nameInputEl.style.fontSize = `${INPUT_BASE_FONT_SIZE * scale}px`;
    this.nameInputEl.style.borderWidth = `${INPUT_BASE_BORDER * scale}px`;
  }
}
