/*
 * OpenAI practice source: Codex Rust 0.123.0.
 * Current Codex CLI source does not expose a direct LSP definition tool, so Praxis uses the shared host LSP port.
 */

import type { LspLocateDefinitionProviderPractice } from "./dependencies.js";
import {
  createHostExecutorLocateDefinitionProvider,
  createNativeLspRuntimeLocateDefinitionProvider,
} from "./dependencies.js";

export const openaiLspLocateDefinitionPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex Rust 0.123.0 tool/runtime boundary",
    path: "/home/proview/Desktop/three/codex_rust_0_123_0/codex-rs/core/src/tools",
  },
  directCliSupport: false,
  notes: [
    "Codex contributes the registry/router/executor-port separation rather than a direct LSP implementation.",
    "For this tool, the OpenAI-flavored best practice is to keep LSP as a host capability and avoid hidden filesystem or process side effects.",
    "If no host executor is supplied, Praxis can still use its local stdio JSON-RPC LSP runtime.",
  ],
  createProvider: ({ provider, executor, runtime }) =>
    provider ?? createHostExecutorLocateDefinitionProvider(executor) ?? createNativeLspRuntimeLocateDefinitionProvider(runtime),
} satisfies LspLocateDefinitionProviderPractice;
