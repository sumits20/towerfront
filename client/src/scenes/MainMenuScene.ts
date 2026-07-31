import Phaser from "phaser";
import { BATTLEFIELD_WIDTH, BATTLEFIELD_HEIGHT, MAX_PLAYER_NAME_LENGTH } from "@towerfront/shared";
import { tryResumeSession } from "../net/connection";
import { PurchaseButton } from "../ui/PurchaseButton";
import type { StartData as CombatSandboxStartData } from "./CombatSandboxScene";
import type { StartData as NetworkMatchStartData } from "./NetworkMatchScene";

const BUTTON_WIDTH = 260;
const BUTTON_HEIGHT = 72;
const BUTTON_GAP = 30;

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

  private buildMenu(): void {
    const centerX = BATTLEFIELD_WIDTH / 2;
    const centerY = BATTLEFIELD_HEIGHT / 2;

    this.add
      .text(centerX, centerY - 220, "TOWERFRONT", { fontFamily: "monospace", fontSize: "56px", color: "#ffffff" })
      .setOrigin(0.5);

    this.add
      .text(centerX, centerY - 130, "Display name", {
        fontFamily: "monospace",
        fontSize: "16px",
        color: "#aab0bd",
      })
      .setOrigin(0.5);

    this.nameInputEl = document.createElement("input");
    this.nameInputEl.type = "text";
    this.nameInputEl.placeholder = "Enter your name";
    this.nameInputEl.maxLength = MAX_PLAYER_NAME_LENGTH;
    this.nameInputEl.style.cssText = [
      "width:280px",
      "padding:10px 12px",
      "font-family:monospace",
      "font-size:16px",
      "background:#0b0c10",
      "color:#e6e8ee",
      "border:2px solid #4a5064",
      "border-radius:4px",
      "outline:none",
      "text-align:center",
    ].join(";");
    this.nameInputEl.addEventListener("input", () => this.clearError());
    this.nameInputEl.addEventListener("keydown", (event) => {
      // Enter defaults to the (more common) local vs-AI mode rather than doing nothing.
      if (event.key === "Enter") this.tryStart("computer");
    });
    const inputDom = this.add.dom(centerX, centerY - 80, this.nameInputEl);
    inputDom.setDepth(1);

    this.errorText = this.add
      .text(centerX, centerY - 40, "", { fontFamily: "monospace", fontSize: "14px", color: "#d6453d" })
      .setOrigin(0.5);

    const vsComputer = new PurchaseButton(this, {
      x: centerX - BUTTON_GAP / 2 - BUTTON_WIDTH,
      y: centerY,
      width: BUTTON_WIDTH,
      height: BUTTON_HEIGHT,
      title: "Play vs Computer",
      onClick: () => this.tryStart("computer"),
    });
    vsComputer.setStatus("Local single-player vs AI", true);

    const playOnline = new PurchaseButton(this, {
      x: centerX + BUTTON_GAP / 2,
      y: centerY,
      width: BUTTON_WIDTH,
      height: BUTTON_HEIGHT,
      title: "Play Online",
      onClick: () => this.tryStart("online"),
    });
    playOnline.setStatus("Multiplayer match", true);

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
}
