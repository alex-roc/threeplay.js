import { definePlugin } from "../../core/engine";
import type { InputAPI } from "./types";

export type * from "./types";

/** TODO(stub): replaced by the real implementation. */
export const inputPlugin = definePlugin<InputAPI>({
  name: "input",
  dependencies: ["render"],
  install: () => ({}) as InputAPI,
});
