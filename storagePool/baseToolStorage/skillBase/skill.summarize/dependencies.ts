import type { BaseToolDependencyDeclaration } from "../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { SkillFilesystemProvider } from "../_shared/skillCore.js";
import type { SkillBasePracticeProviderName, SkillBasePracticeSource } from "../_shared/baseToolAdapter.js";

export type SkillSummarizeDependencies = { executor?: BaseToolExecutorPort; provider?: SkillFilesystemProvider };

export type SkillSummarizeProviderPractice = {
  providerName: SkillBasePracticeProviderName;
  source: SkillBasePracticeSource;
  directCliSupport: boolean;
  sideEffectPolicy: "read-only";
  notes: readonly string[];
  createProvider(dependencies: SkillSummarizeDependencies): SkillFilesystemProvider | undefined;
};

export const skillSummarizeDependencyDeclarations = [
  { dependencyId: "runtime.execEngine.filesystem.readText", kind: "filesystem", required: false, description: "Optional runtime-owned reader when caller provides a skillPath instead of source excerpts." },
  { dependencyId: "runtime.capabilityExposure.skillMetadataBudget", kind: "runtime", required: true, description: "Storage owns model-visible summary budget and truncation." },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createHostExecutorSkillFilesystemProvider(executor: BaseToolExecutorPort | undefined): SkillFilesystemProvider | undefined {
  const readText = executor?.filesystem?.readText;
  if (readText === undefined) return undefined;
  return {
    async readText(request) {
      const result = await readText({ path: request.path, encoding: request.encoding, maxBytes: request.maxBytes });
      if (!result.ok) throw new Error(result.error.message);
      return result.output;
    },
  };
}
