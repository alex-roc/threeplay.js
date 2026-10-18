import { definePlugin } from "../../core/engine";
import type { TransformAPI } from "./types";

export type * from "./types";

/** TODO(stub): replaced by the real implementation. */
export const transformPlugin = definePlugin<TransformAPI>({
  name: "transform",
  install: () => ({}) as TransformAPI,
});
