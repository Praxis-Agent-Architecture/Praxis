import type { BaseToolDependencyDeclaration } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type {
  ShellRuntimeObservationMaterialError,
  ShellRuntimeObservationMaterialErrorCode,
  ShellRuntimeObservationEvent,
  ShellRuntimeObservationProvider,
  ShellRuntimeObservationProviderResult,
} from "./core.js";

export type ShellRuntimeObservationPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type ShellRuntimeObservationDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: ShellRuntimeObservationProvider;
};

export type ShellRuntimeObservationProviderPractice = {
  providerName: ShellRuntimeObservationPracticeProviderName;
  source: { kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native"; label: string; path?: string };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: ShellRuntimeObservationDependencies): ShellRuntimeObservationProvider | undefined;
};

export const shellRuntimeObservationDependencyDeclarations = [
  {
    dependencyId: "runtime.execEngine.shellExecution.monitorExecution",
    kind: "runtime",
    required: true,
    description: "Runtime-owned shell observation port exposed through BaseToolExecutorPort.shell.monitorExecution",
  },
  {
    dependencyId: "runtime.governancePlane.toolInvocationGrant",
    kind: "permission",
    required: true,
    description: "Runtime governance decision carried in context.guard for real observation dispatch",
  },
  {
    dependencyId: "runtime.capabilityExposure.shellRuntimeEvents",
    kind: "runtime",
    required: true,
    description: "Runtime supplies shell lifecycle/output events; baseTool only summarizes the event stream",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function eventFromRecord(value: Record<string, unknown>): ShellRuntimeObservationEvent {
  return {
    type: typeof value.type === "string" ? value.type : undefined,
    observedAt:
      typeof value.observedAt === "string"
        ? value.observedAt
        : value.observedAt === undefined
          ? undefined
          : "__invalid_timestamp__",
    severity:
      typeof value.severity === "string"
        ? value.severity as ShellRuntimeObservationEvent["severity"]
        : value.severity === undefined
          ? undefined
          : "__invalid_severity__" as ShellRuntimeObservationEvent["severity"],
    message: typeof value.message === "string" ? value.message : undefined,
    metadata: isRecord(value.metadata) ? value.metadata : undefined,
  };
}

function invalidMaterial(code: ShellRuntimeObservationMaterialErrorCode): ShellRuntimeObservationMaterialError {
  return { code };
}

function isoFromMs(value: unknown): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function invalidMs(value: unknown): boolean {
  return value !== undefined && isoFromMs(value) === undefined;
}

function invalidByteCount(value: unknown): boolean {
  return value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < 0);
}

function byteCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function invalidExitCode(value: unknown): boolean {
  return value !== undefined && value !== null && (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 255);
}

function stringLength(value: unknown): number | undefined {
  return typeof value === "string" ? value.length : undefined;
}

function observationMaterialFromOutput(
  output: Readonly<Record<string, unknown>>,
): Pick<ShellRuntimeObservationProviderResult, "events" | "runtimeObservationError"> | undefined {
  const observation = isRecord(output.observation) ? output.observation : undefined;
  if (observation === undefined) return undefined;
  if (observation.state !== undefined && typeof observation.state !== "string") return { runtimeObservationError: invalidMaterial("INVALID_STATE") };
  if (invalidMs(observation.observedAtMs)) return { runtimeObservationError: invalidMaterial("INVALID_OBSERVED_AT_MS") };
  if (observation.stdout !== undefined && typeof observation.stdout !== "string") return { runtimeObservationError: invalidMaterial("INVALID_STDOUT") };
  if (observation.stderr !== undefined && typeof observation.stderr !== "string") return { runtimeObservationError: invalidMaterial("INVALID_STDERR") };
  if (invalidByteCount(observation.stdoutBytes)) return { runtimeObservationError: invalidMaterial("INVALID_STDOUT_BYTES") };
  if (invalidByteCount(observation.stderrBytes)) return { runtimeObservationError: invalidMaterial("INVALID_STDERR_BYTES") };
  if (invalidExitCode(observation.exitCode)) return { runtimeObservationError: invalidMaterial("INVALID_EXIT_CODE") };
  const events: ShellRuntimeObservationEvent[] = [];
  const observedAt = isoFromMs(observation.observedAtMs);
  const state = observation.state as string | undefined;
  if (state !== undefined) events.push({ type: `state:${state}`, observedAt, severity: state === "failed" ? "error" : "info" });
  const stdoutSize = byteCount(observation.stdoutBytes) ?? stringLength(observation.stdout);
  const stderrSize = byteCount(observation.stderrBytes) ?? stringLength(observation.stderr);
  if (stdoutSize !== undefined && stdoutSize > 0) events.push({ type: "stdout", observedAt, severity: "debug" });
  if (stderrSize !== undefined && stderrSize > 0) events.push({ type: "stderr", observedAt, severity: "warn" });
  if (typeof observation.exitCode === "number") events.push({ type: "exit", observedAt, severity: observation.exitCode === 0 ? "info" : "error" });
  return events.length > 0 ? { events } : undefined;
}

export function createHostExecutorShellRuntimeObservationProvider(
  executor: BaseToolExecutorPort | undefined,
): ShellRuntimeObservationProvider | undefined {
  const monitorExecution = executor?.shell?.monitorExecution;
  if (monitorExecution === undefined) return undefined;

  return async (request, context) => {
    const result = await monitorExecution({
      target: { toolId: "shell.runtimeObservation", executionId: request.executionId, command: request.command },
      observation: {
        events: request.events,
        maxEvents: request.maxEvents,
      },
      context: context as Readonly<Record<string, unknown>>,
    });
    if (!result.ok) throw new Error(result.error.message);
    const output = result.output;
    if (!isRecord(output)) return {};
    const observationMaterial = Array.isArray(output.events) ? undefined : observationMaterialFromOutput(output);
    return {
      command: typeof output.command === "string" ? output.command : undefined,
      events: Array.isArray(output.events)
        ? output.events.map((event) => (isRecord(event) ? eventFromRecord(event) : {}))
        : observationMaterial?.events,
      runtimeObservationError: observationMaterial?.runtimeObservationError,
      maxEvents: typeof output.maxEvents === "number" ? output.maxEvents : undefined,
    } satisfies ShellRuntimeObservationProviderResult;
  };
}
