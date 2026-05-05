import type { CodeReadProviderPractice } from "./dependencies.js";
import { createHostExecutorCodeReadProvider } from "./dependencies.js";

export const anthropicCodeReadPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code 2.1.88 Read tool practice",
    path: "/home/proview/Desktop/three/claude_code_2_1_88/tools/FileReadTool",
  },
  directCliSupport: true,
  sideEffectPolicy: "read-only",
  notes: [
    "Claude Code keeps file reading behind a named tool with path, offset, limit, permission, and result-shaping boundaries.",
    "Praxis keeps read semantics in storage core and uses runtime filesystem support only for host IO.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorCodeReadProvider(executor),
} as const satisfies CodeReadProviderPractice;
