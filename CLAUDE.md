# Towerfront

2D browser tower-battle game. Full design spec: `Towerfront_Complete_Game_Build_Plan.pdf` (repo root).

## Current phase

**Unit lane prototype (phase 2) + a working slice of the bounty economy (phase 3) + a full local
playable loop** (start screen, win banner, restart, an Easy-difficulty AI opponent that both buys
units and shoots). Local-only, no network layer. A full match can be played and replayed
start-to-finish without manual debugging or a page reload.

Implemented so far:
- Rifle combat: both towers have a `Gunner` (player-controlled left, AI-controlled right).
  Rifle stats are deliberately slow-paced (450ms fire cooldown, 2.2s reload, 600px/s projectile
  speed — see `shared/src/weapons.ts`). Projectiles arc under gravity
  (`config.PROJECTILE_GRAVITY_Y`, applied via `body.setGravityY()`), with a dotted trajectory
  preview shown only for the player's gunner (`Gunner`'s `showTrajectoryPreview` flag).
  `Gunner.aimAt()` clamps visual rotation to stay upright and uses `setFlipX` past ±90° instead of
  rotating through vertical — don't reintroduce unclamped `sprite.rotation = angle` there.
- Recruit/Runner/Shield Unit: movement, nearest-opponent-in-range targeting, unit-vs-unit and
  unit-vs-tower melee combat, attack-lunge tween + tower hit-flash/camera-shake on strikes.
- Projectile-vs-unit collision (`CombatSandboxScene.handleProjectileVsUnits`, AABB via
  `getBounds()`, no physics bodies on units) — rifle fire damages/kills the *opposing* side's units
  only (friendly fire is structurally impossible: each projectile's tagged `side` only ever checks
  the other side's unit array). A kill awards the shooter's side `unit.definition.bounty` gold
  (distinct from `cost` — both fields exist in `shared/src/units.ts`), attributed purely by
  checking `unit.alive` immediately after the fatal `takeDamage()` call, no source-tracking needed
  on `Unit` itself.
- Passive income: 10 gold/5s per side, started in `beginMatch()`, guarded against `matchOver`.
- Purchases: buttons + number keys 1/2/3/4, **left (human) side only**. The right side's buttons
  are rendered but non-interactive (`PurchaseButton`'s `interactive: false` option) — still shown
  informationally (gold/cooldown state) since P2 is the AI in this single-client session; revisit
  when real multiplayer gives P2 its own client. Both purchase paths go through the same
  `purchaseUnit()` (returns a boolean so callers can gate audio feedback on actual success, not
  just an attempt). `PURCHASABLE_UNIT_TYPES` drives the button row, AI purchase options, and
  keyboard bindings generically — adding a unit type there is most of the integration work.
- `Drone` (4th unit, `client/src/entities/Drone.ts`) is a separate class from `Unit`, not a
  subclass — free 2D movement (horizontal advance/pursuit + independent vertical wander within a
  100–250px sky band above the lane), ranged (attackRange 100, maxHealth 143) and actively flies
  horizontally into range of its target rather than only reacting when something wanders in, never
  damages towers (hovers at the enemy tower's edge instead), and prioritizes the nearest opposing
  Drone over the nearest opposing ground Unit. Range checks are horizontal-only (X distance), same
  convention as `Unit` — the sky band is cosmetic/wander-only and never blocks engagement. Ground
  `Unit`s cannot target or retaliate against Drones (deliberately one-directional; `Unit.ts` is
  untouched by this). `leftDrones`/`rightDrones` are separate arrays from `leftUnits`/`rightUnits`;
  rifle collision and the AI's shooting target search both check drones and ground units together.
  Drone attacks spawn a purely visual, team-tinted projectile (`Drone.fireProjectileEffect`) — a
  Phaser tween, not a physics body, so it's a straight line with no gravity by construction, and
  intentionally *not* wired into the rifle's bounty-awarding collision system (damage is applied
  synchronously by `tryAttack`'s `dealDamage` callback; routing drone shots through
  `handleProjectileVsUnits` would incorrectly grant rifle-only bounty for a unit-vs-unit kill).
- `Goodie` (`client/src/entities/Goodie.ts`) sky pickups: one gold ("G", +100 gold) or repair ("R",
  `Tower.repair()`, +150 health capped at max) goodie spawns at a time, random top-of-screen X,
  1–5 minute random interval since the last one disappeared (collected or reached the ground line
  unshot), constant-speed drift (no gravity — distinct from projectile physics). Effect always
  applies to whichever side's projectile hit it (`projectile`'s tagged `side`), so this already
  works for the AI symmetrically — **but the AI doesn't shoot at goodies**, it only shoots at units,
  so in practice only the human player currently triggers these.
- `EasyAiController` (build plan section 7 "Easy": slow reactions, random affordable units) drives
  the right side's purchases. AI *shooting* is separate: `updateAiShooting()` tracks the nearest
  left unit accurately (so the sprite visually aims right) but fires with a random angular spread
  (`AI_AIM_SPREAD_RAD`) — that's the "lower shooting accuracy" trait, not a reaction-delay on
  firing itself (the weapon's own cooldown already paces it).
- Start screen (gates all gameplay — units/purchases/AI/rifle — behind a `started` flag) and a
  win banner + Restart button that calls `this.scene.restart({ autoStart: true })`. Because
  `scene.restart()` reuses the same JS instance, **all mutable per-match state is reset at the top
  of `create()`**, not via field initializers — keep that pattern for any new mutable scene state.

Do not jump ahead to later phases (tower defences/random powers, multiplayer, accounts) unless
explicitly asked. Follow the phase order in the build plan section 10 and the task sequence in
section 17 ("Recommended First 30 Development Actions").

## Layout

Monorepo, one GitHub repo (no separate repos per package):

- `client/` — Phaser 3 + TypeScript + Vite game client.
- `server/` — plain Node/TypeScript skeleton today; becomes the authoritative Colyseus match
  server once local MVP is complete. Currently does nothing at runtime.
- `shared/` — TypeScript-only package (no build step, imported as source) with unit/weapon
  definitions, entity ID types, and placeholder network message types. Both client and server
  reference it via the `@towerfront/shared` path alias, not an npm dependency.

## Commands

- `cd client && npm run dev` — run the game locally (Vite dev server).
- `cd client && npm run build` — typecheck + production build.
- `cd server && npm run dev` — run the server skeleton (tsx watch).
- `cd shared && npm run typecheck` — typecheck the shared package standalone.

## Architecture rules

- **Authoritative server rule** (build plan 5.2): once multiplayer exists, the server owns
  money, health, cooldowns, purchases, collisions, damage attribution, kills and victory. The
  client only ever sends intentions (`fire`, `buy unit`, `activate ability`); it must never send
  trusted outcomes. Not relevant yet in the current local-only phase, but don't build client-side
  code that assumes it will later own authoritative state.
- Strict TypeScript everywhere (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`).
- Sprite assets live in `client/public/assets/sprites/` as hand-authored SVGs (no binary
  PNGs/raster art yet), loaded via `this.load.svg()` in `CombatSandboxScene.preload()` and keyed
  through `client/src/assetKeys.ts`. Team/accent colors are applied at runtime via `setTint()`
  rather than baked into each asset, so keep new sprite fills white/light-gray unless the color
  should stay fixed (e.g. the projectile). See build plan section 9 for the intended final art
  direction — current art is placeholder shape work, not final style.
- Audio lives in `client/public/assets/audio/`, keyed through `client/src/audioKeys.ts` and played
  via `client/src/audio/AudioManager.ts` (per-category default volumes, mute state read from/written
  to the game-scoped `scene.sound.mute` so it survives `scene.restart()`). **Every `.wav` file
  there is a procedurally-synthesized placeholder**, not real Kenney.nl CC0 assets — this sandbox
  has no network access to download real ones. See `client/public/assets/audio/LICENSE.md` before
  assuming any audio file is cleared for real use; replace them with real CC0 assets before
  shipping.
- Unit and weapon balance numbers live in `shared/src/units.ts` and `shared/src/weapons.ts` as
  the single source of truth — don't hardcode costs/damage/health in scene code.

## Security (relevant once multiplayer/Supabase land — section 13)

- Never place Supabase service-role keys in the client.
- Row Level Security on every user-owned table.
- Validate all purchases and damage server-side; rate-limit fire/purchase commands.
