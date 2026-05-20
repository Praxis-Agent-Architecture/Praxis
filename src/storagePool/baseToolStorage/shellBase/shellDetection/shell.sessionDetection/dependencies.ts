import type { BaseToolDependencyDeclaration } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type {
  ShellSessionDetectionOutput,
  ShellSessionDetectionProvider,
  ShellSessionDetectionProviderRequest,
  ShellSessionKind,
} from "./core.js";

export type ShellSessionDetectionPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type ShellSessionDetectionDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: ShellSessionDetectionProvider;
};

export type ShellSessionDetectionProviderPractice = {
  providerName: ShellSessionDetectionPracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: ShellSessionDetectionDependencies): ShellSessionDetectionProvider | undefined;
};

export const shellSessionDetectionDependencyDeclarations = [
  {
    dependencyId: "runtime.execEngine.shellExecutor",
    kind: "runtime",
    required: true,
    description: "Runtime-provided shell executor exposed through BaseToolExecutorPort.shell.run for real session probes",
  },
  {
    dependencyId: "runtime.governancePlane.toolInvocationGrant",
    kind: "permission",
    required: true,
    description: "Runtime governance decision carried in ShellSessionDetectionContext.guard",
  },
  {
    dependencyId: "runtime.capabilityExposure.shellSessionEnvelope",
    kind: "runtime",
    required: true,
    description: "Runtime-normalized shell session detection output and audit envelope",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

const sessionProbeScript = `
tty_value="$(tty 2>/dev/null || printf not-a-tty)"
printf 'pid=%s\\n' "$$"
printf 'ppid=%s\\n' "\${PPID:-}"
printf 'tty=%s\\n' "$tty_value"
printf 'flags=%s\\n' "$-"
printf 'shell=%s\\n' "$0"
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

function inferShellKind(shellExecutable: string | undefined, probedShell: string | undefined): string {
  const candidate = (probedShell ?? shellExecutable ?? "").split(/[\\/]/u).pop()?.toLowerCase() ?? "";
  if (candidate.includes("zsh")) return "zsh";
  if (candidate.includes("bash")) return "bash";
  if (candidate.includes("fish")) return "fish";
  if (candidate.includes("pwsh") || candidate.includes("powershell")) return "powershell";
  if (candidate.includes("cmd")) return "cmd";
  if (candidate === "sh" || candidate.endsWith("-sh") || candidate === "dash" || candidate === "ash") return "sh";
  return "unknown";
}

function inferSessionKind(hasTty: boolean, flags: string | undefined, knownInteractive: boolean | undefined): ShellSessionKind {
  if (knownInteractive === true || hasTty || flags?.includes("i")) {
    return "interactive";
  }
  if (knownInteractive === false) {
    return "non-interactive";
  }
  return "unknown";
}

export function createHostExecutorShellSessionDetectionProvider(
  executor: BaseToolExecutorPort | undefined,
): ShellSessionDetectionProvider | undefined {
  const run = executor?.shell?.run;
  if (run === undefined) {
    return undefined;
  }

  return async (request: ShellSessionDetectionProviderRequest): Promise<ShellSessionDetectionOutput> => {
    const command = request.target.shellExecutable ?? "sh";
    const result = await run({
      command,
      args: ["-c", sessionProbeScript],
      timeoutMs: 5_000,
    });

    if (!result.ok) {
      throw new Error("shell session detection failed in the runtime executor");
    }
    if (result.output.exitCode !== 0) {
      throw new Error(`shell session detection exited with code ${result.output.exitCode}`);
    }

    const probed = parseKeyValueLines(result.output.stdout);
    const probedTty = probed.tty !== undefined && probed.tty !== "not-a-tty" ? probed.tty : undefined;
    const hasTty = request.target.tty !== undefined || probedTty !== undefined;
    const sessionKind = inferSessionKind(hasTty, probed.flags, request.target.knownInteractive);
    return {
      kind: "agentCore.basicTool.shell.sessionDetection",
      target: {
        ...request.target,
        processId: request.target.processId ?? (Number.isSafeInteger(Number(probed.pid)) ? Number(probed.pid) : undefined),
        tty: request.target.tty ?? probedTty,
      },
      detected: {
        sessionKind,
        interactive: sessionKind === "unknown" ? "unknown" : sessionKind === "interactive",
        hasTty,
        shellKind: inferShellKind(request.target.shellExecutable, probed.shell),
      },
      permissionsRequired:
        request.target.processId === undefined ? ["shell:session:detect"] : ["shell:session:detect", "shell:process:read"],
      dryRun: false,
      executionBlocked: false,
      unsafeSideEffects: false,
      detectionEnvelope: {
        operation: "detect-shell-session",
        realProcessReadRequired: true,
      },
    };
  };
}
