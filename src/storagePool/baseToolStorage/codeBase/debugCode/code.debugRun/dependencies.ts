import type { BaseToolDependencyDeclaration } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { CodeDebugRunProvider } from "./core.js";
export type CodeDebugRunPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";
export type CodeDebugRunDependencies = { executor?: BaseToolExecutorPort; provider?: CodeDebugRunProvider };
export type CodeDebugRunProviderPractice = { providerName: CodeDebugRunPracticeProviderName; source: { kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native"; label: string; path?: string }; directCliSupport: boolean; sideEffectPolicy: "runtime-governed"; notes: readonly string[]; createProvider(dependencies: CodeDebugRunDependencies): CodeDebugRunProvider | undefined };
export const codeDebugRunDependencyDeclarations: readonly BaseToolDependencyDeclaration[] = [
  { dependencyId: "runtime.execEngine.debug.launch", kind: "runtime", required: true, description: "Runtime-owned debug launcher exposed through BaseToolExecutorPort.debug.launch." },
  { dependencyId: "runtime.governancePlane.debugRunGrant", kind: "permission", required: true, description: "dryRun:false must carry explicit guard/governance approval before launching or attaching a debug session." },
];
export function createHostExecutorCodeDebugRunProvider(executor: BaseToolExecutorPort | undefined): CodeDebugRunProvider | undefined {
  const launch = executor?.debug?.launch;
  if (launch === undefined) return undefined;
  return async (request, context) => { const result = await launch({ target: request.target, breakpoints: request.breakpoints, environment: request.environment, timeoutMs: request.timeoutMs, context }); if (!result.ok) throw new Error(result.error.message); return result.output; };
}
