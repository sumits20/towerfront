const MIN_DECISION_INTERVAL_MS = 2500;
const MAX_DECISION_INTERVAL_MS = 4500;

export interface AiPurchaseOption<T extends string> {
  readonly type: T;
  readonly cost: number;
  readonly ready: boolean;
}

/**
 * Build plan section 7 "Easy" AI: "Slow reactions, random affordable units,
 * lower shooting accuracy." No shooting yet (phase 3 bounty economy isn't in
 * place), so this only decides what to buy. Purely a decision-maker — the
 * caller applies the resulting purchase through the same path a human
 * player's button click would use, so the AI can't cheat past cost/cooldown
 * rules.
 */
export class EasyAiController {
  private readonly initialDelayMs: number;
  private nextDecisionAtMs: number | null = null;

  constructor(initialDelayMs: number) {
    this.initialDelayMs = initialDelayMs;
  }

  /** Call every frame; returns a unit type to purchase, or null if it's not time yet / nothing affordable. */
  decide<T extends string>(nowMs: number, gold: number, options: readonly AiPurchaseOption<T>[]): T | null {
    if (this.nextDecisionAtMs === null) {
      this.nextDecisionAtMs = nowMs + this.initialDelayMs;
    }
    if (nowMs < this.nextDecisionAtMs) return null;

    this.nextDecisionAtMs =
      nowMs + MIN_DECISION_INTERVAL_MS + Math.random() * (MAX_DECISION_INTERVAL_MS - MIN_DECISION_INTERVAL_MS);

    const affordable = options.filter((option) => option.ready && option.cost <= gold);
    if (affordable.length === 0) return null;
    return affordable[Math.floor(Math.random() * affordable.length)]!.type;
  }
}
