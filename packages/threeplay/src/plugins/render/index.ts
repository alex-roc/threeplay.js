import { definePlugin } from "../../core/engine";
import type { RenderAPI } from "./types";

export type * from "./types";

/** TODO(stub): replaced by the real implementation. */
export const renderPlugin = definePlugin<RenderAPI>({
  name: "render",
  install: () => ({}) as RenderAPI,
});
