import type { BaseToolDependencyDeclaration } from "../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { SkillFilesystemProvider } from "../_shared/skillCore.js";
import type { SkillBasePracticeProviderName, SkillBasePracticeSource } from "../_shared/baseToolAdapter.js";

export type SkillRemoveDependencies = { executor?: BaseToolExecutorPort; provider?: SkillFilesystemProvider };

export type SkillRemoveProviderPractice = {
  providerName: SkillBasePracticeProviderName;
  source: SkillBasePracticeSource;
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: SkillRemoveDependencies): SkillFilesystemProvider | undefined;
};

export const skillRemoveDependencyDeclarations = [
  { dependencyId: "runtime.execEngine.filesystem.writeText", kind: "filesystem", required: false, description: "Runtime-owned writer for disable records." },
  { dependencyId: "runtime.execEngine.filesystem.deletePath", kind: "filesystem", required: false, description: "Runtime-owned remover for unlink/purge." },
  { dependencyId: "runtime.governancePlane.skillWriteApproval", kind: "permission", required: true, description: "dryRun:false requires an affirmative guard before removal." },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createHostExecutorSkillFilesystemProvider(executor: BaseToolExecutorPort | undefined): SkillFilesystemProvider | undefined {
  const writeText = executor?.filesystem?.writeText;
  const deletePath = executor?.filesystem?.deletePath;
  if (writeText === undefined && deletePath === undefined) return undefined;
  return {
    writeText:
      writeText === undefined
        ? undefined
        : async (request) => {
            const result = await writeText({ path: request.path, content: request.content, encoding: request.encoding });
            if (!result.ok) throw new Error(result.error.message);
            return result.output;
          },
    deletePath:
      deletePath === undefined
        ? undefined
        : async (request) => {
            const result = await deletePath({ path: request.path, recursive: request.recursive });
            if (!result.ok) throw new Error(result.error.message);
            return result.output;
          },
  };
}
