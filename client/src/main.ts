import Phaser from "phaser";
import "./style.css";
import { BATTLEFIELD_WIDTH, BATTLEFIELD_HEIGHT } from "@towerfront/shared";
import { MainMenuScene } from "./scenes/MainMenuScene";
import { CombatSandboxScene } from "./scenes/CombatSandboxScene";
import { NetworkMatchScene } from "./scenes/NetworkMatchScene";

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "app",
  width: BATTLEFIELD_WIDTH,
  height: BATTLEFIELD_HEIGHT,
  backgroundColor: "#1c2230",
  // Centering is handled by the #app flexbox in style.css, not Phaser's own
  // autoCenter — setting both fights over the canvas's margin and produces
  // asymmetric offsets for non-16:9 viewports.
  scale: {
    mode: Phaser.Scale.FIT,
  },
  // Required for MainMenuScene's this.add.dom() display-name input.
  dom: {
    createContainer: true,
  },
  physics: {
    default: "arcade",
    arcade: { debug: false },
  },
  // The first scene in this list auto-starts; the rest are registered but
  // dormant until MainMenuScene routes to one via scene.start().
  scene: [MainMenuScene, CombatSandboxScene, NetworkMatchScene],
});
