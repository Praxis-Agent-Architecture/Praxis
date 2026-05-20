import { praxis } from "@praxis-ai/praxis";
import type { SessionSpec, StorageSpec } from "@praxis-ai/praxis";

import type { NormalizedRepoInspectorOptions } from "../config/repoInspectorOptions.js";

export function createRepoInspectorStorage(options: NormalizedRepoInspectorOptions): StorageSpec {
  return options.persistence === "memory"
    ? praxis.storage.memory()
    : praxis.storage.raxWorkspace({ init: "on-run" });
}

export function createRepoInspectorSession(options: NormalizedRepoInspectorOptions): SessionSpec {
  return praxis.session({
    persistence: options.persistence,
    resume: "auto",
    thread: options.persistence === "sqlite" ? "durable" : "ephemeral",
    logs: "full",
  });
}
