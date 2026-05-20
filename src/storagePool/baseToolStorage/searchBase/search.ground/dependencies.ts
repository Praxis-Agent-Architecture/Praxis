import type { BaseToolDependencyDeclaration } from "../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { SearchGroundExecutor } from "./core.js";

export type SearchGroundPracticeProviderName = "openai" | "anthropic" | "deepmind" | "praxis-native";

export type SearchGroundDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: SearchGroundExecutor;
};

export type SearchGroundProviderPractice = {
  providerName: SearchGroundPracticeProviderName;
  source: { kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native"; label: string; path?: string };
  directCliSupport: boolean;
  sideEffectPolicy: "read-only";
  notes: readonly string[];
  createProvider(dependencies: SearchGroundDependencies): SearchGroundExecutor | undefined;
};

export const searchGroundDependencyDeclarations = [
  {
    dependencyId: "runtime.execEngine.network.ground",
    kind: "runtime",
    required: true,
    description: "Runtime-provided grounding support exposed through BaseToolExecutorPort.network.ground",
  },
  {
    dependencyId: "runtime.governancePlane.groundingGuard",
    kind: "permission",
    required: true,
    description: "Runtime grounding governance, citation policy, and affirmative real-execution guard",
  },
  {
    dependencyId: "provider.rax.websearch",
    kind: "service",
    required: false,
    description: "Optional Raxode websearch adapter or provider-native grounding backend carried by runtime",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createHostExecutorSearchGroundProvider(executor: BaseToolExecutorPort | undefined): SearchGroundExecutor | undefined {
  const ground = executor?.network?.ground;
  if (ground === undefined) return undefined;
  return async (request) => {
    const result = await ground({
      claim: request.claim,
      evidence: request.evidence,
      mode: request.mode,
      minimumEvidenceCount: request.minimumEvidenceCount,
      provider: request.provider,
      model: request.model,
      citations: request.citations,
      context: request.context,
    });
    if (!result.ok) throw new Error(result.error.message);
    return result.output;
  };
}
