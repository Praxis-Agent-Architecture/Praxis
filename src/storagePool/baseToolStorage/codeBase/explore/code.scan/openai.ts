import type { CodeScanProviderPractice } from "./dependencies.js";
import { createHostExecutorCodeScanProvider } from "./dependencies.js";

export const openaiCodeScanPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex Rust list_dir handler with depth, offset, and limit",
    path: "/home/proview/Desktop/three/codex_rust_0_125_0/codex-rs/core/src/tools/handlers/list_dir.rs",
  },
  directCliSupport: true,
  sideEffectPolicy: "read-only",
  notes: [
    "Codex contributes depth, pagination, sorting, symlink marking, and sandbox-aware listing boundaries.",
    "Praxis keeps depth/pagination semantics in code.scan core and uses runtime filesystem.list as support.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorCodeScanProvider(executor),
} as const satisfies CodeScanProviderPractice;
