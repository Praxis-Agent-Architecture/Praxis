import type { BaseToolDependencyDeclaration } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { CodeDebugCollectLogsProvider } from "./core.js";

export type CodeDebugCollectLogsPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";
export type CodeDebugCollectLogsDependencies = { executor?: BaseToolExecutorPort; provider?: CodeDebugCollectLogsProvider };
export type CodeDebugCollectLogsProviderPractice = {
  providerName: CodeDebugCollectLogsPracticeProviderName;
  source: { kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native"; label: string; path?: string };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: CodeDebugCollectLogsDependencies): CodeDebugCollectLogsProvider | undefined;
};
export const codeDebugCollectLogsDependencyDeclarations: readonly BaseToolDependencyDeclaration[] = [
  { dependencyId: "runtime.execEngine.debug.collectLogs", kind: "runtime", required: true, description: "Runtime-owned debug log collector exposed through BaseToolExecutorPort.debug.collectLogs." },
  { dependencyId: "runtime.governancePlane.debugReadGrant", kind: "permission", required: true, description: "dryRun:false must carry explicit guard/governance approval before collecting logs." },
];
export function createHostExecutorCodeDebugCollectLogsProvider(executor: BaseToolExecutorPort | undefined): CodeDebugCollectLogsProvider | undefined {
  const collectLogs = executor?.debug?.collectLogs;
  if (collectLogs === undefined) return undefined;
  return async (request, context) => {
    const result = await collectLogs({ sources: request.sources, maxEntries: request.maxEntries, since: request.since, redaction: request.redaction, context });
    if (!result.ok) throw new Error(result.error.message);
    return result.output;
  };
}
