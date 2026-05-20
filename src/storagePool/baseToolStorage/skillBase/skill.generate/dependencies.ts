import type { BaseToolDependencyDeclaration } from "../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { SkillFilesystemProvider } from "../_shared/skillCore.js";
import type { SkillBasePracticeProviderName, SkillBasePracticeSource } from "../_shared/baseToolAdapter.js";

export type SkillGenerateDependencies = { executor?: BaseToolExecutorPort; provider?: SkillFilesystemProvider };

export type SkillGenerateProviderPractice = {
  providerName: SkillBasePracticeProviderName;
  source: SkillBasePracticeSource;
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: SkillGenerateDependencies): SkillFilesystemProvider | undefined;
};

export const skillGenerateDependencyDeclarations = [
  { dependencyId: "runtime.execEngine.filesystem.writeText", kind: "filesystem", required: true, description: "Runtime-owned writer for generated SKILL.md and support files." },
  { dependencyId: "runtime.governancePlane.skillWriteApproval", kind: "permission", required: true, description: "dryRun:false requires an affirmative guard before writing skill files." },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createHostExecutorSkillFilesystemProvider(executor: BaseToolExecutorPort | undefined): SkillFilesystemProvider | undefined {
  const writeText = executor?.filesystem?.writeText;
  if (writeText === undefined) return undefined;
  return {
    async writeText(request) {
      const result = await writeText({ path: request.path, content: request.content, encoding: request.encoding });
      if (!result.ok) throw new Error(result.error.message);
      return result.output;
    },
  };
}
