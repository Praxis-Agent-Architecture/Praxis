import type { CodeSearchRipgrepProviderPractice } from "./dependencies.js";
import { createHostExecutorCodeSearchRipgrepProvider } from "./dependencies.js";

export const openaiCodeSearchRipgrepPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex Rust grep_files handler and rg search tests",
    path: "/home/proview/Desktop/three/codex_rust_0_125_0/codex-rs/core/src/tools/handlers/grep_files.rs",
  },
  directCliSupport: true,
  sideEffectPolicy: "read-only",
  notes: [
    "Codex contributes rg-backed search, glob support, limit behavior, and no-match handling.",
    "Praxis keeps query/result semantics in storage and calls runtime search.ripgrep as support.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorCodeSearchRipgrepProvider(executor),
} as const satisfies CodeSearchRipgrepProviderPractice;
