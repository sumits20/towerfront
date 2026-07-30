export type WeaponType =
  | "rifle"
  | "machineGun"
  | "sniperRifle"
  | "shotgun"
  | "grenadeLauncher"
  | "frostWeapon"
  | "rocketLauncher";

export interface WeaponDefinition {
  readonly type: WeaponType;
  readonly displayName: string;
  readonly damage: number;
  readonly projectileSpeed: number;
  readonly magazineSize: number;
  readonly reloadTimeMs: number;
  readonly fireCooldownMs: number;
}

// MVP scope (build plan 4.1) ships only the rifle; the rest are stubs for
// content-expansion phase (build plan 3.4) so the shared schema is stable
// before more weapons are implemented.
export const WEAPON_DEFINITIONS: Record<WeaponType, WeaponDefinition> = {
  rifle: {
    type: "rifle",
    displayName: "Rifle",
    damage: 12,
    projectileSpeed: 600,
    magazineSize: 10,
    reloadTimeMs: 2200,
    fireCooldownMs: 450,
  },
  machineGun: {
    type: "machineGun",
    displayName: "Machine Gun",
    damage: 6,
    projectileSpeed: 900,
    magazineSize: 30,
    reloadTimeMs: 1800,
    fireCooldownMs: 90,
  },
  sniperRifle: {
    type: "sniperRifle",
    displayName: "Sniper Rifle",
    damage: 40,
    projectileSpeed: 1400,
    magazineSize: 4,
    reloadTimeMs: 2200,
    fireCooldownMs: 700,
  },
  shotgun: {
    type: "shotgun",
    displayName: "Shotgun",
    damage: 8,
    projectileSpeed: 800,
    magazineSize: 6,
    reloadTimeMs: 1600,
    fireCooldownMs: 500,
  },
  grenadeLauncher: {
    type: "grenadeLauncher",
    displayName: "Grenade Launcher",
    damage: 30,
    projectileSpeed: 500,
    magazineSize: 3,
    reloadTimeMs: 2000,
    fireCooldownMs: 800,
  },
  frostWeapon: {
    type: "frostWeapon",
    displayName: "Frost Weapon",
    damage: 5,
    projectileSpeed: 700,
    magazineSize: 8,
    reloadTimeMs: 1500,
    fireCooldownMs: 250,
  },
  rocketLauncher: {
    type: "rocketLauncher",
    displayName: "Rocket Launcher",
    damage: 60,
    projectileSpeed: 450,
    magazineSize: 2,
    reloadTimeMs: 2800,
    fireCooldownMs: 900,
  },
};
