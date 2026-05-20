import type { BaseToolDependencyDeclaration } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type {
  ShellEnvironmentInspectionOutput,
  ShellEnvironmentInspectionProvider,
  ShellEnvironmentInspectionProviderRequest,
} from "./core.js";

export type ShellEnvironmentInspectionPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type ShellEnvironmentInspectionDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: ShellEnvironmentInspectionProvider;
};

export type ShellEnvironmentInspectionProviderPractice = {
  providerName: ShellEnvironmentInspectionPracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: ShellEnvironmentInspectionDependencies): ShellEnvironmentInspectionProvider | undefined;
};

export const shellEnvironmentInspectionDependencyDeclarations = [
  {
    dependencyId: "runtime.execEngine.shellExecutor",
    kind: "runtime",
    required: true,
    description: "Runtime-provided shell executor exposed through BaseToolExecutorPort.shell.run for real environment reads",
  },
  {
    dependencyId: "runtime.governancePlane.toolInvocationGrant",
    kind: "permission",
    required: true,
    description: "Runtime governance decision carried in ShellEnvironmentInspectionContext.guard",
  },
  {
    dependencyId: "runtime.capabilityExposure.shellEnvironmentEnvelope",
    kind: "runtime",
    required: true,
    description: "Runtime-normalized environment inspection output and audit envelope",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

function parseEnv(stdout: string): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const line of stdout.split(/\r?\n/u)) {
    const splitAt = line.indexOf("=");
    if (splitAt <= 0) {
      continue;
    }
    entries[line.slice(0, splitAt)] = line.slice(splitAt + 1);
  }
  return entries;
}

function shouldRedact(variableName: string, value?: string): boolean {
  if (
    /(^|_)(TOKEN|SECRET|PASSWORD|PASS|KEY|CREDENTIAL|AUTH|COOKIE|SESSION|PRIVATE|PAT|DSN|DATABASE_URL|DB_URL|REDIS_URL|POSTGRES_URL|MYSQL_URL|MONGO_URL|MONGODB_URI)(_|$)/iu.test(
      variableName,
    )
  ) {
    return true;
  }

  if (value === undefined) {
    return false;
  }

  return /^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/u.test(value) || /(?:password|token|secret|api[_-]?key)=/iu.test(value);
}

function previewValue(value: string): string {
  return value.length <= 16 ? value : `${value.slice(0, 16)}...`;
}

export function createHostExecutorShellEnvironmentInspectionProvider(
  executor: BaseToolExecutorPort | undefined,
): ShellEnvironmentInspectionProvider | undefined {
  const run = executor?.shell?.run;
  if (run === undefined) {
    return undefined;
  }

  return async (request: ShellEnvironmentInspectionProviderRequest): Promise<ShellEnvironmentInspectionOutput> => {
    const result = await run({
      command: request.target.shellExecutable ?? "env",
      args: request.target.shellExecutable === undefined ? [] : ["-c", "env"],
      cwd: request.target.workingDirectory,
      timeoutMs: 5_000,
    });

    if (!result.ok) {
      throw new Error("shell environment inspection failed in the runtime executor");
    }
    if (result.output.exitCode !== 0) {
      throw new Error(`shell environment inspection exited with code ${result.output.exitCode}`);
    }

    const environment = parseEnv(result.output.stdout);
    const variables = request.target.variablesToInspect?.length
      ? request.target.variablesToInspect
      : Object.keys(environment).sort();

    return {
      kind: "agentCore.basicTool.shell.environmentInspection",
      target: {
        workingDirectory: request.target.workingDirectory,
        shellExecutable: request.target.shellExecutable,
      },
      variables: variables.map((name) => ({
        name,
        present: environment[name] !== undefined,
        redacted: environment[name] !== undefined && shouldRedact(name, environment[name]),
        valuePreview:
          environment[name] !== undefined && !shouldRedact(name, environment[name])
            ? previewValue(environment[name])
            : undefined,
      })),
      pathEntries: (environment.PATH ?? "").split(":").map((entry) => entry.trim()).filter(Boolean),
      permissionsRequired: ["shell:environment:inspect"],
      dryRun: false,
      executionBlocked: false,
      unsafeSideEffects: false,
      inspectionEnvelope: {
        operation: "inspect-shell-environment",
        source: "provided-snapshot",
        realProcessReadRequired: true,
      },
    };
  };
}
