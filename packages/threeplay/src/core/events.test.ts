import { describe, expect, it } from "vitest";
import { HandlerList, Scope } from "./events.js";

describe("Scope", () => {
  it("forgets controllers once they are cancelled", () => {
    const scope = new Scope();
    const list = new HandlerList();
    for (let i = 0; i < 100; i++) scope.track(list.add(() => {})).cancel();
    expect(scope.size).toBe(0);
    expect(list.size).toBe(0);
    const live = scope.track(list.add(() => {}));
    expect(scope.size).toBe(1);
    scope.dispose();
    expect(list.size).toBe(0);
    live.cancel(); // safe after dispose
  });
});
