import type { BaseToolDependencyDeclaration } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type {
  ShellCapabilityFinding,
  ShellCapabilityName,
  ShellCapabilityDetectionOutput,
  ShellCapabilityDetectionProvider,
  ShellCapabilityDetectionProviderRequest,
  ShellCapabilityStatus,
} from "./core.js";

export type ShellCapabilityDetectionPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type ShellCapabilityDetectionDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: ShellCapabilityDetectionProvider;
};

export type ShellCapabilityDetectionProviderPractice = {
  providerName: ShellCapabilityDetectionPracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: ShellCapabilityDetectionDependencies): ShellCapabilityDetectionProvider | undefined;
};

export const shellCapabilityDetectionDependencyDeclarations = [
  {
    dependencyId: "runtime.execEngine.shellExecutor",
    kind: "runtime",
    required: true,
    description: "Runtime-provided shell executor exposed through BaseToolExecutorPort.shell.run for real capability probes",
  },
  {
    dependencyId: "runtime.governancePlane.toolInvocationGrant",
    kind: "permission",
    required: true,
    description: "Runtime governance decision carried in ShellCapabilityDetectionContext.guard",
  },
  {
    dependencyId: "runtime.capabilityExposure.shellCapabilityEnvelope",
    kind: "runtime",
    required: true,
    description: "Runtime-normalized shell capability detection output and audit envelope",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

const knownCapabilities: readonly ShellCapabilityName[] = [
  "command-execution",
  "script-execution",
  "pipeline",
  "environment-expansion",
  "interactive-session",
  "job-control",
  "posix-signals",
];

const posixCapabilityProbeScript = `
probe() {
  name="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    printf '%s=supported\\n' "$name"
  else
    printf '%s=unsupported\\n' "$name"
  fi
}
probe command-execution sh -c 'printf praxis-command'
probe script-execution sh -c 'exit 0'
if printf praxis-pipeline | cat >/dev/null 2>&1; then
  printf 'pipeline=supported\\n'
else
  printf 'pipeline=unsupported\\n'
fi
if PRAXIS_ENV_PROBE=ok sh -c '[ "$PRAXIS_ENV_PROBE" = ok ]' >/dev/null 2>&1; then
  printf 'environment-expansion=supported\\n'
else
  printf 'environment-expansion=unsupported\\n'
fi
case "$-" in
  *i*) printf 'interactive-session=supported\\n' ;;
  *) printf 'interactive-session=unknown\\n' ;;
esac
if (set -m) >/dev/null 2>&1; then
  printf 'job-control=supported\\n'
else
  printf 'job-control=unknown\\n'
fi
if kill -l TERM >/dev/null 2>&1; then
  printf 'posix-signals=supported\\n'
else
  printf 'posix-signals=unknown\\n'
fi
`;

function parseCapabilityStatus(value: string | undefined): ShellCapabilityStatus {
  if (value === "supported" || value === "unsupported" || value === "unknown") {
    return value;
  }

  return "unknown";
}

function parseCapabilityFindings(
  stdout: string,
  requestedCapabilities: readonly ShellCapabilityName[] | undefined,
): readonly ShellCapabilityFinding[] {
  const statuses = new Map<ShellCapabilityName, ShellCapabilityStatus>();
  for (const line of stdout.split(/\r?\n/u)) {
    const [name, status] = line.split("=");
    if (knownCapabilities.includes(name as ShellCapabilityName)) {
      statuses.set(name as ShellCapabilityName, parseCapabilityStatus(status?.trim()));
    }
  }

  const selected = requestedCapabilities?.length ? requestedCapabilities : knownCapabilities;
  return selected.map((capability) => ({
    capability,
    status: statuses.get(capability) ?? "unknown",
    confidence: statuses.has(capability) ? "inferred" : "unverified",
    evidence: statuses.has(capability)
      ? "runtime shell probe via BaseToolExecutorPort.shell.run"
      : "runtime shell probe did not report this capability",
  }));
}

export function createHostExecutorShellCapabilityDetectionProvider(
  executor: BaseToolExecutorPort | undefined,
): ShellCapabilityDetectionProvider | undefined {
  const run = executor?.shell?.run;
  if (run === undefined) {
    return undefined;
  }

  return async (request: ShellCapabilityDetectionProviderRequest): Promise<ShellCapabilityDetectionOutput> => {
    const result = await run({
      command: request.target.shellExecutable,
      args: ["-c", posixCapabilityProbeScript],
      timeoutMs: 5_000,
    });

    if (!result.ok) {
      throw new Error("shell capability probe failed in the runtime executor");
    }
    if (result.output.exitCode !== 0) {
      throw new Error(`shell capability probe exited with code ${result.output.exitCode}`);
    }

    const requestedCapabilities = request.target.requestedCapabilities?.length
      ? request.target.requestedCapabilities
      : knownCapabilities;

    return {
      kind: "agentCore.basicTool.shell.capabilityDetection",
      target: {
        shellExecutable: request.target.shellExecutable,
        shellKind: request.target.shellKind,
        reportedVersion: request.target.reportedVersion,
      },
      requestedCapabilities,
      findings: parseCapabilityFindings(result.output.stdout, requestedCapabilities),
      permissionsRequired: ["shell:detect"],
      dryRun: false,
      executionBlocked: false,
      unsafeSideEffects: false,
      probePlan: {
        operation: "detect-shell-capabilities",
        realProbeRequired: true,
        shellExecutable: request.target.shellExecutable,
      },
    };
  };
}
