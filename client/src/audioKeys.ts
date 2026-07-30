// Central registry of audio asset keys + source paths, mirroring assetKeys.ts
// for sprites. See client/public/assets/audio/LICENSE.md — these are
// synthesized placeholders, not final assets.
export const AUDIO_KEYS = {
  rifleFire: "rifleFire",
  rifleReload: "rifleReload",
  impactUnit: "impactUnit",
  impactTower: "impactTower",
  unitSpawn: "unitSpawn",
  unitDeath: "unitDeath",
  matchWin: "matchWin",
  uiClick: "uiClick",
} as const;

export type AudioKey = (typeof AUDIO_KEYS)[keyof typeof AUDIO_KEYS];

export const AUDIO_PATHS: Record<AudioKey, string> = {
  rifleFire: "/assets/audio/rifle-fire.wav",
  rifleReload: "/assets/audio/rifle-reload.wav",
  impactUnit: "/assets/audio/impact-unit.wav",
  impactTower: "/assets/audio/impact-tower.wav",
  unitSpawn: "/assets/audio/unit-spawn.wav",
  unitDeath: "/assets/audio/unit-death.wav",
  matchWin: "/assets/audio/match-win.wav",
  uiClick: "/assets/audio/ui-click.wav",
};
