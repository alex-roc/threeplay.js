import { definePlugin } from "../../core/engine";
import type { ShapesAPI } from "./types";

export type * from "./types";

/** TODO(stub): replaced by the real implementation. */
export const shapesPlugin = definePlugin<ShapesAPI>({
  name: "shapes",
  dependencies: ["transform"],
  install: () => ({}) as ShapesAPI,
});
