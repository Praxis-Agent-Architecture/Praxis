import type { BaseToolDependencyDeclaration } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { CodeDebugCaptureStateProvider } from "./core.js";
export type CodeDebugCaptureStatePracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";
export type CodeDebugCaptureStateDependencies = { executor?: BaseToolExecutorPort; provider?: CodeDebugCaptureStateProvider };
export type CodeDebugCaptureStateProviderPractice = { providerName: CodeDebugCaptureStatePracticeProviderName; source: { kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native"; label: string; path?: string }; directCliSupport: boolean; sideEffectPolicy: "runtime-governed"; notes: readonly string[]; createProvider(dependencies: CodeDebugCaptureStateDependencies): CodeDebugCaptureStateProvider | undefined };
export const codeDebugCaptureStateDependencyDeclarations: readonly BaseToolDependencyDeclaration[] = [
  { dependencyId: "runtime.execEngine.debug.captureState", kind: "runtime", required: true, description: "Runtime-owned debug state capture exposed through BaseToolExecutorPort.debug.captureState." },
  { dependencyId: "runtime.governancePlane.debugReadGrant", kind: "permission", required: true, description: "dryRun:false must carry explicit guard/governance approval before capturing debug state." },
];
export function createHostExecutorCodeDebugCaptureStateProvider(executor: BaseToolExecutorPort | undefined): CodeDebugCaptureStateProvider | undefined {
  const captureState = executor?.debug?.captureState;
  if (captureState === undefined) return undefined;
  return async (request, context) => { const result = await captureState({ target: request.target, capture: request.capture, context }); if (!result.ok) throw new Error(result.error.message); return result.output; };
}
