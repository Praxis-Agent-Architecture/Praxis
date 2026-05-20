import { praxis } from "@praxis-ai/praxis";
import type { MainLoopSpec } from "@praxis-ai/praxis";

import type { NormalizedRepoInspectorOptions } from "../config/repoInspectorOptions.js";

export function createRepoInspectorMainLoop(options: NormalizedRepoInspectorOptions): MainLoopSpec {
  return praxis.mainLoop.standard({
    hooks: {
      buildPrompt: { strategyRef: "example.prompt.repoInspector" },
      chooseModel: { strategyRef: "example.model.primaryResponses" },
      beforeTool: { policyRef: "example.toolPolicy.readonly" },
      afterTool: { strategyRef: "example.observation.summarize" },
      shouldContinue: { strategyRef: options.mode === "deep" ? "example.loop.deep" : "example.loop.quick" },
    },
    metadata: {
      mode: options.mode,
      arbitraryUserJs: false,
      extensionContractOnly: true,
    },
  });
}
