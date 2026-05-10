import { praxis } from "@praxis-ai/framework";
import type { SessionSpec, StorageSpec } from "@praxis-ai/framework";

import type { NormalizedRaxodeOptions } from "../config/raxodeOptions.js";

export function createRaxodeStorage(options: NormalizedRaxodeOptions): StorageSpec {
  return options.persistence === "memory"
    ? praxis.storage.memory()
    : praxis.storage.raxWorkspace({ init: "on-run" });
}

export function createRaxodeSession(options: NormalizedRaxodeOptions): SessionSpec {
  return praxis.session({
    persistence: options.persistence,
    resume: "auto",
    thread: options.persistence === "sqlite" ? "durable" : "ephemeral",
    logs: "full",
  });
}

