import Phaser from "phaser";
import { BATTLEFIELD_WIDTH, BATTLEFIELD_HEIGHT, MAX_PLAYER_NAME_LENGTH } from "@towerfront/shared";
import { PurchaseButton } from "../ui/PurchaseButton";
import type { StartData as CombatSandboxStartData } from "./CombatSandboxScene";
import type { StartData as NetworkMatchStartData } from "./NetworkMatchScene";

const BUTTON_WIDTH = 260;
const BUTTON_HEIGHT = 72;
const BUTTON_GAP = 30;

/**
 * First scene shown on page load (see main.ts's scene order). Collects a
 * display name (no auth — just a label shown in-game) and routes to either
 * the local single-player sandbox or the networked match. Neither mode
 * scene ever runs without going through here first in normal play, so this
 * is the only place display-name validation needs to live.
 */
export class MainMenuScene extends Phaser.Scene {
  private nameInputEl?: HTMLInputElement;
  private errorText?: Phaser.GameObjects.Text;

  constructor() {
    super("MainMenuScene");
  }

  create(): void {
    this.add.rectangle(0, 0, BATTLEFIELD_WIDTH, BATTLEFIELD_HEIGHT, 0x1c2230).setOrigin(0, 0).setDepth(-2);

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
