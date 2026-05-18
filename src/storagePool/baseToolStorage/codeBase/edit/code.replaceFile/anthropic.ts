import type { CodeReplaceFileProviderPractice } from "./dependencies.js";
import { createHostExecutorCodeReplaceFileProvider } from "./dependencies.js";

export const anthropicCodeReplaceFilePractice = {
  providerName: "anthropic",
  source: { kind: "cli", label: "Claude Code Edit/Write tool practice", path: "/home/proview/Desktop/three/claude_code_2_1_88/tools" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Whole-file replacement must remain permissioned, scoped, and auditable.", "Praxis keeps replacement semantics in storage core and delegates only text IO to runtime."],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorCodeReplaceFileProvider(executor),
} as const satisfies CodeReplaceFileProviderPractice;
