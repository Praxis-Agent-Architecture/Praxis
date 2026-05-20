import type { BaseToolDependencyDeclaration } from "../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { SkillRipgrepProvider } from "../_shared/skillCore.js";
import type { SkillBasePracticeProviderName, SkillBasePracticeSource } from "../_shared/baseToolAdapter.js";

export type SkillRipgrepDependencies = { executor?: BaseToolExecutorPort; provider?: SkillRipgrepProvider };

export type SkillRipgrepProviderPractice = {
  providerName: SkillBasePracticeProviderName;
  source: SkillBasePracticeSource;
  directCliSupport: boolean;
  sideEffectPolicy: "read-only";
  notes: readonly string[];
  createProvider(dependencies: SkillRipgrepDependencies): SkillRipgrepProvider | undefined;
};

export const skillRipgrepDependencyDeclarations = [
  { dependencyId: "runtime.execEngine.search.ripgrep", kind: "runtime", required: true, description: "Runtime-owned ripgrep-style search over skill roots." },
  { dependencyId: "runtime.governancePlane.workspaceReadScope", kind: "permission", required: true, description: "Runtime carries allowed skill roots and read scope." },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createHostExecutorSkillRipgrepProvider(executor: BaseToolExecutorPort | undefined): SkillRipgrepProvider | undefined {
  const ripgrep = executor?.search?.ripgrep;
  if (ripgrep === undefined) return undefined;
  return {
    async ripgrep(request) {
      const result = await ripgrep(request);
      if (!result.ok) throw new Error(result.error.message);
      return result.output;
    },
  };
}
