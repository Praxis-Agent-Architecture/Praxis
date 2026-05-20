import type { BaseToolDependencyDeclaration } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { CodeTestProvider } from "./core.js";

export type CodeTestPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type CodeTestDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: CodeTestProvider;
};

export type CodeTestProviderPractice = {
  providerName: CodeTestPracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: CodeTestDependencies): CodeTestProvider | undefined;
};

export const codeTestDependencyDeclarations: readonly BaseToolDependencyDeclaration[] = [
  {
    dependencyId: "runtime.execEngine.process.run",
    kind: "runtime",
    required: true,
    description: "Runtime-owned bounded process runner exposed through BaseToolExecutorPort.process.run.",
  },
  {
    dependencyId: "runtime.governancePlane.testExecutionGrant",
    kind: "permission",
    required: true,
    description: "dryRun:false must carry explicit guard/governance approval before spawning a test process.",
  },
];

export function createHostExecutorCodeTestProvider(executor: BaseToolExecutorPort | undefined): CodeTestProvider | undefined {
  const run = executor?.process?.run;
  if (run === undefined) {
    return undefined;
  }
  return async (request, context) => {
    const result = await run({
      command: request.command,
      args: request.args,
      cwd: request.cwd,
      timeoutMs: request.timeoutMs,
      stdin: request.stdin,
      env: request.env,
      intent: "test",
      context,
    });
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    return result.output;
  };
}
