import { definePlugin } from "../../core/engine";
import type { AudioAPI } from "./types";

export type * from "./types";

/** TODO(stub): replaced by the real implementation. */
export const audioPlugin = definePlugin<AudioAPI>({
  name: "audio",
  install: () => ({}) as AudioAPI,
});
