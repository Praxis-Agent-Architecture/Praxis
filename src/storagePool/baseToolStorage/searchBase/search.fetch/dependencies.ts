import type { BaseToolDependencyDeclaration } from "../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { SearchFetchExecutor } from "./core.js";

export type SearchFetchPracticeProviderName = "openai" | "anthropic" | "deepmind" | "praxis-native";

export type SearchFetchDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: SearchFetchExecutor;
};

export type SearchFetchProviderPractice = {
  providerName: SearchFetchPracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  sideEffectPolicy: "read-only";
  notes: readonly string[];
  createProvider(dependencies: SearchFetchDependencies): SearchFetchExecutor | undefined;
};

export const searchFetchDependencyDeclarations = [
  {
    dependencyId: "runtime.execEngine.network.fetch",
    kind: "runtime",
    required: true,
    description: "Runtime-provided HTTP fetch exposed through BaseToolExecutorPort.network.fetch",
  },
  {
    dependencyId: "runtime.governancePlane.networkFetchGuard",
    kind: "permission",
    required: true,
    description: "Runtime network/fetch governance, domain policy, and affirmative real-execution guard",
  },
  {
    dependencyId: "provider.web.fetch",
    kind: "service",
    required: false,
    description: "Provider-native or portable web fetch carried by runtime; baseTool never creates SDK clients",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createHostExecutorSearchFetchProvider(executor: BaseToolExecutorPort | undefined): SearchFetchExecutor | undefined {
  const fetch = executor?.network?.fetch;
  if (fetch === undefined) {
    return undefined;
  }

  return async (request) => {
    const result = await fetch({
      url: request.url,
      method: request.method,
      expectedContentType: request.expectedContentType,
      maxBytes: request.maxBytes,
      timeoutMs: request.timeoutMs,
      context: request.context,
    });
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    return result.output;
  };
}
