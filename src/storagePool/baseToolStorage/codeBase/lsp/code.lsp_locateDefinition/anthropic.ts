/*
 * Anthropic practice source: Claude Code 2.1.88 LSPTool.
 * Praxis keeps the host executor boundary, while adopting Claude Code's LSP lifecycle lessons.
 */

import type { LspLocateDefinitionProviderPractice } from "./dependencies.js";
import {
  createHostExecutorLocateDefinitionProvider,
  createNativeLspRuntimeLocateDefinitionProvider,
} from "./dependencies.js";

export const anthropicLspLocateDefinitionPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code 2.1.88 LSPTool",
    path: "/home/proview/Desktop/three/claude_code_2_1_88/tools/LSPTool/LSPTool.ts",
  },
  directCliSupport: true,
  notes: [
    "Claude Code maps definition lookup to textDocument/definition.",
    "It ensures the target file is opened on the language server before issuing symbol requests.",
    "It treats missing server, oversized files, malformed URI data, and transient LSP failures as classified provider errors.",
    "Praxis implements those lessons through a local stdio JSON-RPC LSP runtime when no host executor is supplied.",
  ],
  createProvider: ({ provider, executor, runtime }) =>
    provider ?? createHostExecutorLocateDefinitionProvider(executor) ?? createNativeLspRuntimeLocateDefinitionProvider(runtime),
} satisfies LspLocateDefinitionProviderPractice;
