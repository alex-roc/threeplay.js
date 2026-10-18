import { definePlugin } from "../../core/engine";
import type { CameraAPI } from "./types";

export type * from "./types";

/** TODO(stub): replaced by the real implementation. */
export const cameraPlugin = definePlugin<CameraAPI>({
  name: "camera",
  dependencies: ["render", "transform", "input"],
  install: () => ({}) as CameraAPI,
});
