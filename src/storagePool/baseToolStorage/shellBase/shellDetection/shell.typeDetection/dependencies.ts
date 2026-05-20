import type { BaseToolDependencyDeclaration } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { ShellTypeDetectionOutput, ShellTypeDetectionProvider, ShellTypeDetectionProviderRequest } from "./core.js";
import { detectShellType } from "./core.js";

export type ShellTypeDetectionPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type ShellTypeDetectionDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: ShellTypeDetectionProvider;
};

export type ShellTypeDetectionProviderPractice = {
  providerName: ShellTypeDetectionPracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: ShellTypeDetectionDependencies): ShellTypeDetectionProvider | undefined;
};

export const shellTypeDetectionDependencyDeclarations = [
  {
    dependencyId: "runtime.execEngine.shellExecutor",
    kind: "runtime",
    required: true,
    description: "Runtime-provided shell executor exposed through BaseToolExecutorPort.shell.run for real shell probes",
  },
  {
    dependencyId: "runtime.governancePlane.toolInvocationGrant",
    kind: "permission",
    required: true,
    description: "Runtime governance decision carried in ShellTypeDetectionContext.guard",
  },
  {
    dependencyId: "runtime.capabilityExposure.shellTypeEnvelope",
    kind: "runtime",
    required: true,
    description: "Runtime-normalized shell type detection output and audit envelope",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

const shellTypeProbeScript = `
printf 'argv0=%s\\n' "$0"
printf 'shell=%s\\n' "\${SHELL:-}"
printf 'flags=%s\\n' "$-"
`;

function parseKeyValueLines(stdout: string): Readonly<Record<string, string>> {
  const parsed: Record<string, string> = {};
  for (const line of stdout.split(/\r?\n/u)) {
    const splitAt = line.indexOf("=");
    if (splitAt <= 0) {
      continue;
    }
    parsed[line.slice(0, splitAt)] = line.slice(splitAt + 1);
  }
  return parsed;
}

export function createHostExecutorShellTypeDetectionProvider(
  executor: BaseToolExecutorPort | undefined,
): ShellTypeDetectionProvider | undefined {
  const run = executor?.shell?.run;
  if (run === undefined) {
    return undefined;
  }

  return async (request: ShellTypeDetectionProviderRequest): Promise<ShellTypeDetectionOutput> => {
    const command = request.shellPath ?? request.executableName ?? request.envShell;
    if (command === undefined) {
      throw new Error("shell.typeDetection provider requires a shell hint");
    }

    const result = await run({
      command,
      args: ["-c", shellTypeProbeScript],
      timeoutMs: 5_000,
    });

    if (!result.ok) {
      throw new Error("shell type probe failed in the runtime executor");
    }
    if (result.output.exitCode !== 0) {
      throw new Error(`shell type probe exited with code ${result.output.exitCode}`);
    }

    const probed = parseKeyValueLines(result.output.stdout);
    const probedShell = probed.argv0?.trim() || probed.shell?.trim() || command;

    const detected = detectShellType({
      context: {
        ...request.context,
        dryRun: true,
      },
      shellPath: probedShell,
      platform: request.platform,
    });

    if (!detected.ok) {
      throw new Error(detected.error.message);
    }

    return detected.report;
  };
}
