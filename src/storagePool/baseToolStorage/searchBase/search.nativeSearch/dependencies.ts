import type { BaseToolDependencyDeclaration } from "../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { NativeSearchExecutor } from "./core.js";

export type NativeSearchPracticeProviderName = "openai" | "anthropic" | "deepmind" | "praxis-native";

export type NativeSearchDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: NativeSearchExecutor;
};

export type NativeSearchProviderPractice = {
  providerName: NativeSearchPracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  sideEffectPolicy: "read-only";
  notes: readonly string[];
  createProvider(dependencies: NativeSearchDependencies): NativeSearchExecutor | undefined;
};

export const nativeSearchDependencyDeclarations = [
  {
    dependencyId: "runtime.execEngine.network.nativeWebSearch",
    kind: "runtime",
    required: true,
    description: "Runtime-provided provider-native web search exposed through BaseToolExecutorPort.network.nativeWebSearch",
  },
  {
    dependencyId: "runtime.governancePlane.networkSearchGuard",
    kind: "permission",
    required: true,
    description: "Runtime network/search governance, allowed provider policy, and affirmative real-execution guard",
  },
  {
    dependencyId: "provider.native.webSearch",
    kind: "service",
    required: false,
    description: "OpenAI Responses web_search, Anthropic Messages web_search, or Gemini google_search backend carried by runtime/Raxode",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createHostExecutorNativeSearchProvider(
  executor: BaseToolExecutorPort | undefined,
): NativeSearchExecutor | undefined {
  const nativeWebSearch = executor?.network?.nativeWebSearch;
  if (nativeWebSearch === undefined) {
    return undefined;
  }

  return async (request) => {
    const result = await nativeWebSearch({
      provider: request.provider,
      query: request.query,
      model: request.model,
      maxResults: request.maxResults,
      recencyDays: request.recencyDays,
      freshness: request.freshness,
      allowedDomains: request.allowedDomains,
      searchContextSize: request.searchContextSize,
      userLocation: request.userLocation,
      citations: request.citations,
      context: request.context,
    });

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    return result.output;
  };
}
