import { definePlugin } from "../../core/engine";
import type { PhysicsAPI } from "./types";

export type * from "./types";

/** TODO(stub): replaced by the real implementation. */
export const physicsPlugin = definePlugin<PhysicsAPI>({
  name: "physics",
  dependencies: ["transform"],
  install: () => ({}) as PhysicsAPI,
});
