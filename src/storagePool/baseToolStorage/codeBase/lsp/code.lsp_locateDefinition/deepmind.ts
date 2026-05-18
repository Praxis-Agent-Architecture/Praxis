/*
 * DeepMind practice source: Gemini CLI 0.39.0.
 * Current Gemini CLI source does not expose a direct LSP definition tool, so Praxis uses the shared host LSP port.
 */

import type { LspLocateDefinitionProviderPractice } from "./dependencies.js";
import {
  createHostExecutorLocateDefinitionProvider,
  createNativeLspRuntimeLocateDefinitionProvider,
} from "./dependencies.js";

export const deepmindLspLocateDefinitionPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI 0.39.0 tool declaration and registry shape",
    path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/core/src/tools",
  },
  directCliSupport: false,
  notes: [
    "Gemini CLI contributes the model-facing declaration versus execution split.",
    "For this tool, the DeepMind-flavored practice keeps concrete LSP execution behind Praxis host dependencies.",
    "If no host executor is supplied, Praxis can still use its local stdio JSON-RPC LSP runtime.",
  ],
  createProvider: ({ provider, executor, runtime }) =>
    provider ?? createHostExecutorLocateDefinitionProvider(executor) ?? createNativeLspRuntimeLocateDefinitionProvider(runtime),
} satisfies LspLocateDefinitionProviderPractice;
