import type { BaseToolDependencyDeclaration } from "../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { SkillFilesystemProvider } from "../_shared/skillCore.js";
import type { SkillBasePracticeProviderName, SkillBasePracticeSource } from "../_shared/baseToolAdapter.js";

export type SkillIterateDependencies = { executor?: BaseToolExecutorPort; provider?: SkillFilesystemProvider };

export type SkillIterateProviderPractice = {
  providerName: SkillBasePracticeProviderName;
  source: SkillBasePracticeSource;
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: SkillIterateDependencies): SkillFilesystemProvider | undefined;
};

export const skillIterateDependencyDeclarations = [
  { dependencyId: "runtime.execEngine.filesystem.readText", kind: "filesystem", required: true, description: "Runtime-owned reader for existing skill files." },
  { dependencyId: "runtime.execEngine.filesystem.writeText", kind: "filesystem", required: true, description: "Runtime-owned writer for final iterated skill files." },
  { dependencyId: "runtime.governancePlane.skillWriteApproval", kind: "permission", required: true, description: "dryRun:false requires an affirmative guard before mutating skill files." },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createHostExecutorSkillFilesystemProvider(executor: BaseToolExecutorPort | undefined): SkillFilesystemProvider | undefined {
  const readText = executor?.filesystem?.readText;
  const writeText = executor?.filesystem?.writeText;
  if (readText === undefined || writeText === undefined) return undefined;
  return {
    async readText(request) {
      const result = await readText({ path: request.path, encoding: request.encoding, maxBytes: request.maxBytes });
      if (!result.ok) throw new Error(result.error.message);
      return result.output;
    },
    async writeText(request) {
      const result = await writeText({ path: request.path, content: request.content, encoding: request.encoding });
      if (!result.ok) throw new Error(result.error.message);
      return result.output;
    },
  };
}
