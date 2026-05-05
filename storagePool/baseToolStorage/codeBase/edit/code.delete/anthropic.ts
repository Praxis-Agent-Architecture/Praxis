import type { CodeDeleteProviderPractice } from "./dependencies.js";
import { createHostExecutorCodeDeleteProvider } from "./dependencies.js";

export const anthropicCodeDeletePractice = {
  providerName: "anthropic",
  source: { kind: "cli", label: "Claude Code file edit/delete permission practice", path: "/home/proview/Desktop/three/claude_code_2_1_88/tools" },
  directCliSupport: false,
  sideEffectPolicy: "runtime-governed",
  notes: ["Deletion is high-risk and must be scoped, approved, and auditable.", "Runtime supplies delete/text IO; storage owns file/directory/range semantics."],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorCodeDeleteProvider(executor),
} as const satisfies CodeDeleteProviderPractice;
