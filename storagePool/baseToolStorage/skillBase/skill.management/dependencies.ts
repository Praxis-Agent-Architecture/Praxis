import type { BaseToolDependencyDeclaration } from "../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { SkillFilesystemProvider } from "../_shared/skillCore.js";
import type { SkillBasePracticeProviderName, SkillBasePracticeSource } from "../_shared/baseToolAdapter.js";

export type SkillManagementDependencies = { executor?: BaseToolExecutorPort; provider?: SkillFilesystemProvider };

export type SkillManagementProviderPractice = {
  providerName: SkillBasePracticeProviderName;
  source: SkillBasePracticeSource;
  directCliSupport: boolean;
  sideEffectPolicy: "read-only" | "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: SkillManagementDependencies): SkillFilesystemProvider | undefined;
};

export const skillManagementDependencyDeclarations = [
  { dependencyId: "runtime.execEngine.filesystem.readText", kind: "filesystem", required: true, description: "Runtime-owned reader for inspect/activate/load." },
  { dependencyId: "runtime.execEngine.filesystem.list", kind: "filesystem", required: true, description: "Runtime-owned lister for skill registry discovery and resource indexes." },
  { dependencyId: "runtime.execEngine.filesystem.writeText", kind: "filesystem", required: false, description: "Runtime-owned writer for enable/disable/install/link state records." },
  { dependencyId: "runtime.governancePlane.skillWriteApproval", kind: "permission", required: true, description: "Write actions with dryRun:false require an affirmative guard." },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createHostExecutorSkillFilesystemProvider(executor: BaseToolExecutorPort | undefined): SkillFilesystemProvider | undefined {
  const readText = executor?.filesystem?.readText;
  const writeText = executor?.filesystem?.writeText;
  const list = executor?.filesystem?.list;
  if (readText === undefined && writeText === undefined && list === undefined) return undefined;
  return {
    readText:
      readText === undefined
        ? undefined
        : async (request) => {
            const result = await readText({ path: request.path, encoding: request.encoding, maxBytes: request.maxBytes });
            if (!result.ok) throw new Error(result.error.message);
            return result.output;
          },
    writeText:
      writeText === undefined
        ? undefined
        : async (request) => {
            const result = await writeText({ path: request.path, content: request.content, encoding: request.encoding });
            if (!result.ok) throw new Error(result.error.message);
            return result.output;
          },
    list:
      list === undefined
        ? undefined
        : async (request) => {
            const result = await list({ path: request.path, maxEntries: request.maxEntries, depth: request.depth, includeGlobs: request.includeGlobs, excludeGlobs: request.excludeGlobs });
            if (!result.ok) throw new Error(result.error.message);
            return result.output;
          },
  };
}
