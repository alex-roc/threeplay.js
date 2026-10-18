import { definePlugin } from "../../core/engine";
import type { HudAPI } from "./types";

export type * from "./types";

/** TODO(stub): replaced by the real implementation. */
export const hudPlugin = definePlugin<HudAPI>({
  name: "hud",
  dependencies: ["render", "transform"],
  install: () => ({}) as HudAPI,
});
