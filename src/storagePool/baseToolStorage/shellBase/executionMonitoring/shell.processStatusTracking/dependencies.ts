import type { BaseToolDependencyDeclaration } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type {
  ShellProcessStatus,
  ShellProcessStatusSnapshot,
  ShellProcessStatusTrackingProvider,
  ShellProcessStatusTrackingProviderResult,
} from "./core.js";

export type ShellProcessStatusTrackingPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type ShellProcessStatusTrackingDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: ShellProcessStatusTrackingProvider;
};

export type ShellProcessStatusTrackingProviderPractice = {
  providerName: ShellProcessStatusTrackingPracticeProviderName;
  source: { kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native"; label: string; path?: string };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: ShellProcessStatusTrackingDependencies): ShellProcessStatusTrackingProvider | undefined;
};

export const shellProcessStatusTrackingDependencyDeclarations = [
  {
    dependencyId: "runtime.execEngine.shellExecution.monitorExecution",
    kind: "runtime",
    required: true,
    description: "Runtime-owned shell process observation port exposed through BaseToolExecutorPort.shell.monitorExecution",
  },
  {
    dependencyId: "runtime.governancePlane.toolInvocationGrant",
    kind: "permission",
    required: true,
    description: "Runtime governance decision carried in context.guard for real status dispatch",
  },
  {
    dependencyId: "runtime.shellProcessOwnership",
    kind: "runtime",
    required: true,
    description: "Runtime owns process lifecycle and supplies status snapshots; baseTool only normalizes them",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function invalidNumberValue(value: unknown): number | undefined {
  return value !== undefined && value !== null && typeof value !== "number" ? Number.NaN : undefined;
}

function isoFromMs(value: unknown): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function invalidTimestampFromMs(value: unknown): string | undefined {
  return value !== undefined && isoFromMs(value) === undefined ? "__invalid_timestamp__" : undefined;
}

function timestampValue(textValue: unknown, msValue: unknown): string | undefined {
  return stringValue(textValue) ?? isoFromMs(msValue) ?? invalidTimestampFromMs(msValue);
}

function signalValue(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return stringValue(value) ?? "__invalid_signal__";
}

function runtimeStatus(value: unknown, exitCode: unknown, signal: unknown): ShellProcessStatus | undefined {
  if (typeof value !== "string") return undefined;
  if (value === "exited") {
    if (typeof signal === "string" && signal.trim().length > 0) return "terminated";
    if (exitCode === 0) return "completed";
    if (typeof exitCode === "number") return "failed";
    return "unknown";
  }
  if (value === "healthy") return "running";
  if (value === "stalled") return "running";
  return value as ShellProcessStatus;
}

function snapshotFromRecord(value: Record<string, unknown>): ShellProcessStatusSnapshot {
  return {
    pid: invalidNumberValue(value.pid) ?? numberValue(value.pid) ?? invalidNumberValue(value.processId) ?? numberValue(value.processId),
    status: runtimeStatus(value.status ?? value.state ?? value.health, value.exitCode, value.signal),
    exitCode: invalidNumberValue(value.exitCode) ?? (typeof value.exitCode === "number" || value.exitCode === null ? value.exitCode : undefined),
    signal: signalValue(value.signal),
    startedAt: timestampValue(value.startedAt, value.startedAtMs),
    observedAt: timestampValue(value.observedAt, value.observedAtMs),
    lastOutputAt: timestampValue(value.lastOutputAt, value.lastActivityAtMs),
  };
}

export function createHostExecutorShellProcessStatusTrackingProvider(
  executor: BaseToolExecutorPort | undefined,
): ShellProcessStatusTrackingProvider | undefined {
  const monitorExecution = executor?.shell?.monitorExecution;
  if (monitorExecution === undefined) return undefined;

  return async (request, context) => {
    const result = await monitorExecution({
      target: { toolId: "shell.processStatusTracking", executionId: request.executionId, command: request.command },
      observation: {
        snapshot: request.snapshot,
        expectedStatuses: request.expectedStatuses,
        staleAfterMs: request.staleAfterMs,
      },
      context: context as Readonly<Record<string, unknown>>,
    });
    if (!result.ok) throw new Error(result.error.message);
    const output = result.output;
    if (!isRecord(output)) return {};
    const runtimeEnvelope = isRecord(output.observation) ? { ...output.observation, ...(isRecord(output.target) ? output.target : {}) } : output;
    const snapshot = isRecord(output.snapshot) ? snapshotFromRecord(output.snapshot) : snapshotFromRecord(runtimeEnvelope);
    return {
      command: stringValue(output.command),
      snapshot,
      expectedStatuses: Array.isArray(output.expectedStatuses)
        ? (output.expectedStatuses.filter((value) => typeof value === "string") as readonly ShellProcessStatus[])
        : undefined,
    } satisfies ShellProcessStatusTrackingProviderResult;
  };
}
