import { definePlugin } from "../../core/engine";
import type { DebugAPI } from "./types";

export type * from "./types";

/** TODO(stub): replaced by the real implementation. */
export const debugPlugin = definePlugin<DebugAPI>({
  name: "debug",
  dependencies: ["render"],
  install: () => ({}) as DebugAPI,
});
