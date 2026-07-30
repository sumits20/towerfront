import Phaser from "phaser";
import type { AudioKey } from "../audioKeys";

// Per-category default volumes so gunfire/impacts don't overpower UI sounds.
const VOLUMES: Record<AudioKey, number> = {
  rifleFire: 0.5,
  rifleReload: 0.4,
  impactUnit: 0.35,
  impactTower: 0.55,
  unitSpawn: 0.4,
  unitDeath: 0.4,
  matchWin: 0.6,
  uiClick: 0.25,
};

/**
 * Thin wrapper over Phaser's scene-level SoundManager. The mute flag lives on
 * `scene.sound`, which is game-scoped and survives `scene.restart()`, so a
 * fresh AudioManager instance still reflects the player's existing mute
 * choice after a restart instead of silently re-enabling audio.
 */
export class AudioManager {
  private readonly scene: Phaser.Scene;
  private muted: boolean;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.muted = scene.sound.mute;
  }

  play(key: AudioKey): void {
    if (this.muted) return;
    this.scene.sound.play(key, { volume: VOLUMES[key] });
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.scene.sound.mute = this.muted;
    return this.muted;
  }

  get isMuted(): boolean {
    return this.muted;
  }
}
