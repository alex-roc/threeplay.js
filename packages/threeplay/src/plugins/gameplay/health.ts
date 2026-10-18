import { clamp } from "../../core/math.js";
import { self } from "../../core/util.js";
import type { HealthComp } from "./types.js";

/** Builds the `health()` component. Events go through the object's own events. */
export function createHealth(hp: number, maxHp: number = hp): HealthComp {
  let cur = clamp(hp, 0, maxHp);
  let dead = cur <= 0;

  /** Fires `death` once per life; re-arms as soon as hp is positive again. */
  const checkDeath = (obj: ReturnType<typeof self>) => {
    if (cur > 0) {
      dead = false;
    } else if (!dead) {
      dead = true;
      obj.trigger("death");
    }
  };

  return {
    id: "health",
    // Accessor, so a plain `obj.hp -= 1` also clamps and fires `death`.
    get hp() {
      return cur;
    },
    set hp(v: number) {
      self(this).setHP(v);
    },
    maxHp,
    hurt(amount = 1) {
      const obj = self(this);
      cur = clamp(cur - amount, 0, obj.maxHp);
      obj.trigger("hurt", amount);
      checkDeath(obj);
    },
    heal(amount = 1) {
      const obj = self(this);
      cur = clamp(cur + amount, 0, obj.maxHp);
      obj.trigger("heal", amount);
      checkDeath(obj);
    },
    setHP(v: number) {
      const obj = self(this);
      cur = clamp(v, 0, obj.maxHp);
      checkDeath(obj);
    },
    onHurt(fn) {
      return self(this).on("hurt", fn);
    },
    onHeal(fn) {
      return self(this).on("heal", fn);
    },
    onDeath(fn) {
      return self(this).on("death", fn);
    },
    inspect() {
      return `${cur}/${self(this).maxHp}`;
    },
  };
}
