import { definePlugin } from "../../core/engine";
import type { LevelAPI } from "./types";

export type * from "./types";

/** TODO(stub): replaced by the real implementation. */
export const levelPlugin = definePlugin<LevelAPI>({
  name: "level",
  dependencies: ["transform"],
  install: () => ({}) as LevelAPI,
});
