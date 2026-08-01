import { Schema, type } from "@colyseus/schema";
import { GOODIE_DRIFT_SPEED } from "../config.js";

export type GoodieType = "gold" | "repair";

/** Falling sky pickup (build plan section 6). Constant-speed drift — not gravity-accelerated. */
export class GoodieState extends Schema {
  @type("string") goodieType: GoodieType = "gold";
  @type("number") x = 0;
  @type("number") y = 0;

  init(goodieType: GoodieType, x: number, y: number): void {
    this.goodieType = goodieType;
    this.x = x;
    this.y = y;
  }

  step(deltaMs: number): void {
    this.y += GOODIE_DRIFT_SPEED * (deltaMs / 1000);
  }
}
