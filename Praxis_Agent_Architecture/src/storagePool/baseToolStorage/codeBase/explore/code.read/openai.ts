import type { CodeReadProviderPractice } from "./dependencies.js";
import { createHostExecutorCodeReadProvider } from "./dependencies.js";

export const openaiCodeReadPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex Rust read_file and fs_api read boundaries",
    path: "/home/proview/Desktop/three/codex_rust_0_125_0/codex-rs/core/src/tools/handlers/read_file.rs",
  },
  directCliSupport: true,
  sideEffectPolicy: "read-only",
  notes: [
    "Codex contributes line-oriented read behavior, truncation, sandbox-aware filesystem boundaries, and app-server fs API separation.",
    "Praxis adopts the boundary by keeping path/range/result semantics in storage core and host IO behind BaseToolExecutorPort.filesystem.readText.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorCodeReadProvider(executor),
} as const satisfies CodeReadProviderPractice;
