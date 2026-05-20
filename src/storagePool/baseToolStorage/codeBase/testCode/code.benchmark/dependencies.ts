import type { BaseToolDependencyDeclaration } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { CodeBenchmarkProvider } from "./core.js";

export type CodeBenchmarkPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";
export type CodeBenchmarkDependencies = { executor?: BaseToolExecutorPort; provider?: CodeBenchmarkProvider };
export type CodeBenchmarkProviderPractice = {
  providerName: CodeBenchmarkPracticeProviderName;
  source: { kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native"; label: string; path?: string };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: CodeBenchmarkDependencies): CodeBenchmarkProvider | undefined;
};

export const codeBenchmarkDependencyDeclarations: readonly BaseToolDependencyDeclaration[] = [
  { dependencyId: "runtime.execEngine.process.run", kind: "runtime", required: true, description: "Runtime-owned bounded process runner exposed through BaseToolExecutorPort.process.run." },
  { dependencyId: "runtime.governancePlane.benchmarkExecutionGrant", kind: "permission", required: true, description: "dryRun:false must carry explicit guard/governance approval before benchmark process execution." },
];

export function createHostExecutorCodeBenchmarkProvider(executor: BaseToolExecutorPort | undefined): CodeBenchmarkProvider | undefined {
  const run = executor?.process?.run;
  if (run === undefined) return undefined;
  return async (request, context) => {
    const startedAt = Date.now();
    const result = await run({ command: request.command, args: request.args, cwd: request.cwd, timeoutMs: request.timeoutMs, stdin: request.stdin, env: request.env, intent: "benchmark", context: { ...context, iteration: request.iteration, benchmarkTarget: request.benchmarkTarget } });
    if (!result.ok) throw new Error(result.error.message);
    return { ...result.output, durationMs: result.output.durationMs ?? Date.now() - startedAt };
  };
}
