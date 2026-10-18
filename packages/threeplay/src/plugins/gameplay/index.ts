import { definePlugin } from "../../core/engine";
import type { GameplayAPI } from "./types";

export type * from "./types";

/** TODO(stub): replaced by the real implementation. */
export const gameplayPlugin = definePlugin<GameplayAPI>({
  name: "gameplay",
  install: () => ({}) as GameplayAPI,
});
