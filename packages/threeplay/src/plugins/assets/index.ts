import { definePlugin } from "../../core/engine";
import type { AssetsAPI } from "./types";

export type * from "./types";

/** TODO(stub): replaced by the real implementation. */
export const assetsPlugin = definePlugin<AssetsAPI>({
  name: "assets",
  dependencies: ["transform"],
  install: () => ({}) as AssetsAPI,
});
