import type { Side } from "@towerfront/shared";

/** "BLUE WINS"/"RED WINS" — the same team-color convention used everywhere else (tower/unit tints, gunner rendering). Shared by CombatSandboxScene and NetworkMatchScene so this only ever needs to change in one place. */
export function winnerLabel(winner: Side): string {
  return winner === "left" ? "BLUE WINS" : "RED WINS";
}
