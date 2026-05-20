import type { AgentIdentity } from "@praxis-ai/praxis";

import type { NormalizedRepoInspectorOptions } from "./repoInspectorOptions.js";

export function createRepoInspectorIdentity(options: NormalizedRepoInspectorOptions): AgentIdentity {
  return {
    id: `agent.example.repoInspector.${options.mode}.${options.policyProfile}`,
    name: "Repo Inspector Agent",
    version: "0.1.0",
    description: "一个用于真实测试 Praxis framework authoring 面的仓库观察 Agent。",
  };
}
