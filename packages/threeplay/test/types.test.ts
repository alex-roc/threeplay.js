import { describe, expectTypeOf, it } from "vitest";
import type { Engine } from "../src/index.js";

// Compile-time checks: the Engine type includes every plugin API.
describe("Engine type", () => {
  it("merges plugin APIs through the registry", () => {
    expectTypeOf<Engine["box"]>().toBeFunction();
    expectTypeOf<Engine["area"]>().toBeFunction();
    expectTypeOf<Engine["camFollow"]>().toBeFunction();
    expectTypeOf<Engine["onKeyPress"]>().toBeFunction();
    expectTypeOf<Engine["vec3"]>().toBeFunction();
    expectTypeOf<Engine["add"]>().toBeFunction();
  });
});
