import type { BaseToolDependencyDeclaration } from "../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { SearchEngineExecutor } from "./core.js";

export type SearchEnginePracticeProviderName = "openai" | "anthropic" | "deepmind" | "praxis-native";

export type SearchEngineDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: SearchEngineExecutor;
};

export type SearchEngineProviderPractice = {
  providerName: SearchEnginePracticeProviderName;
  source: { kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native"; label: string; path?: string };
  directCliSupport: boolean;
  sideEffectPolicy: "read-only";
  notes: readonly string[];
  createProvider(dependencies: SearchEngineDependencies): SearchEngineExecutor | undefined;
};

export const searchEngineRuntimePort = "BaseToolExecutorPort.network.search" as const;

export const searchEngineDependencyDeclarations = [
  {
    dependencyId: "runtime.executor.network.search",
    kind: "runtime",
    required: true,
    description: "Runtime-provided generic search exposed through BaseToolExecutorPort.network.search.",
  },
  {
    dependencyId: "runtime.governancePlane.searchEngineGuard",
    kind: "permission",
    required: true,
    description: "Runtime search governance, provider policy, and affirmative real-execution guard",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createRuntimeSearchEngineProvider(dependencies: SearchEngineDependencies = {}): SearchEngineExecutor | undefined {
  if (dependencies.provider !== undefined) return dependencies.provider;
  const search = dependencies.executor?.network?.search;
  if (search === undefined) return undefined;
  return async (request) => {
    const result = await search({
      provider: request.provider,
      query: request.query,
      maxResults: request.maxResults,
      recencyDays: request.recencyDays,
      safeSearch: request.safeSearch,
      locale: request.locale,
      context: request.context,
    });
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    return {
      results: result.output.results.map((item) => ({ title: item.title, url: item.url, snippet: item.snippet, ...(item.raw !== undefined ? { raw: item.raw } : {}) })),
      providerMetadata: {
        runtimeEntry: searchEngineRuntimePort,
        provider: request.provider,
        safeSearch: request.safeSearch,
        ...(result.output.providerMetadata ?? {}),
      },
      ...(result.output.raw !== undefined ? { raw: result.output.raw } : {}),
    };
  };
}

export function createHostExecutorSearchEngineProvider(executor: BaseToolExecutorPort | undefined): SearchEngineExecutor | undefined {
  return createRuntimeSearchEngineProvider({ executor });
}
