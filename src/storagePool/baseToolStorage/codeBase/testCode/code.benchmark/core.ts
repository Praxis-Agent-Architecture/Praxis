import type { CodeToolAuditEvent, CodeToolResult } from "../../_shared/baseToolAdapter.js";

export type CodeBenchmarkBoundary = "input" | "contract" | "governance" | "scope" | "resource" | "provider";
export type CodeBenchmarkGate = { accepted?: boolean; allowed?: boolean; reason?: string };
export type CodeBenchmarkContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: CodeBenchmarkGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};
export type CodeBenchmarkRequest = {
  context?: CodeBenchmarkContext;
  runtimeId?: string;
  invocationId?: string;
  workspaceRoot?: string;
  benchmarkTarget?: string;
  command?: readonly string[];
  metric?: string;
  iterations?: number;
  warmup?: number;
  timeoutMs?: number;
  stdin?: string;
  env?: Readonly<Record<string, string>>;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  guard?: CodeBenchmarkGate;
  contract?: CodeBenchmarkGate;
  governance?: CodeBenchmarkGate;
  provider?: CodeBenchmarkProvider;
  metadata?: Readonly<Record<string, unknown>>;
};
export type CodeBenchmarkErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_WORKSPACE_ROOT"
  | "MISSING_BENCHMARK_TARGET"
  | "MISSING_COMMAND"
  | "INVALID_COMMAND"
  | "INVALID_ITERATIONS"
  | "INVALID_WARMUP"
  | "INVALID_TIMEOUT"
  | "INVALID_ENVIRONMENT"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_FAILURE";
export type CodeBenchmarkError = {
  code: CodeBenchmarkErrorCode;
  message: string;
  boundary: CodeBenchmarkBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};
export type CodeBenchmarkRuntimeEntry = {
  owner: "runtime";
  port: "BaseToolExecutorPort.process.run";
  method: "run";
  intent: "benchmark";
};
export type CodeBenchmarkPlan = {
  toolKind: "code.benchmark";
  runtimeId: string;
  invocationId: string;
  workspaceRoot: string;
  benchmarkTarget: string;
  command: readonly string[];
  metric: string;
  iterations: number;
  timeoutMs: number;
  permissions: readonly string[];
  acceptedScopes: readonly string[];
  execution: { dryRun: true; benchmarkExecuted: false; unsafeSideEffects: false };
  audit: { capability: "benchmark-code"; governanceRequired: true; tapCanWrap: true };
};
export type CodeBenchmarkSummary = { minMs: number; maxMs: number; meanMs: number; p95Ms: number };
export type CodeBenchmarkOutput = {
  kind: "agentCore.basicTool.code.benchmark.output";
  runtimeId: string;
  invocationId: string;
  workspaceRoot: string;
  benchmarkTarget: string;
  command: readonly string[];
  commandPreview: readonly string[];
  metric: string;
  iterations: number;
  warmup: number;
  timeoutMs: number;
  runtimeEntry: CodeBenchmarkRuntimeEntry;
  dryRun: boolean;
  providerCalled: boolean;
  runs: readonly { iteration: number; exitCode?: number; durationMs?: number; status: "planned" | "passed" | "failed" }[];
  summary?: CodeBenchmarkSummary;
  stdoutPreview: string;
  stderrPreview: string;
  truncated: boolean;
  unsafeSideEffects: false;
};
export type CodeBenchmarkResult =
  | { ok: true; plan: CodeBenchmarkPlan; events: readonly string[] }
  | { ok: false; error: CodeBenchmarkError; events: readonly string[] };
export type CodeBenchmarkProviderRequest = {
  command: string;
  args: readonly string[];
  cwd: string;
  timeoutMs: number;
  stdin?: string;
  env?: Readonly<Record<string, string>>;
  benchmarkTarget: string;
  iteration: number;
  metric: string;
};
export type CodeBenchmarkProviderResult = { exitCode: number; stdout: string; stderr: string; durationMs?: number };
export type CodeBenchmarkProvider = (
  request: CodeBenchmarkProviderRequest,
  context: CodeBenchmarkContext,
) => CodeBenchmarkProviderResult | Promise<CodeBenchmarkProviderResult>;

type Normalized = {
  runtimeId: string;
  invocationId: string;
  workspaceRoot: string;
  benchmarkTarget: string;
  command: readonly string[];
  metric: string;
  iterations: number;
  warmup: number;
  timeoutMs: number;
  dryRun: boolean;
  acceptedScopes: readonly string[];
  stdin?: string;
  env?: Readonly<Record<string, string>>;
  context: CodeBenchmarkContext;
};

export const codeBenchmarkDescriptor = {
  toolKind: "code.benchmark",
  toolId: "code.benchmark",
  purpose: "run a fixed benchmark target through runtime-owned process execution",
  defaultMetric: "duration-ms",
  defaultIterations: 1,
  maxIterations: 20,
  defaultTimeoutMs: 30_000,
  maxTimeoutMs: 600_000,
  unsafeSideEffects: false,
  runtimeEntryPort: "BaseToolExecutorPort.process.run",
} as const;

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
function isBlank(value: unknown): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}
function cleanList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => (typeof value === "string" ? value.trim() : "")).filter(Boolean))];
}
function failure(code: CodeBenchmarkErrorCode, message: string, boundary: CodeBenchmarkBoundary): Extract<CodeBenchmarkResult, { ok: false }> {
  return { ok: false, error: { code, message, boundary, safeForRuntimeInspection: true, internalDetailExposed: false }, events: ["basicTool.code.benchmark.rejected"] };
}
function auditEvent(type: string, normalized?: Pick<Normalized, "invocationId" | "dryRun" | "context">, metadata?: Readonly<Record<string, unknown>>): CodeToolAuditEvent {
  return { type, toolId: "code.benchmark", invocationId: normalized?.invocationId ?? "code.benchmark:unknown", dryRun: normalized?.dryRun ?? true, metadata: { ...(normalized?.context.auditMetadata ?? {}), ...(metadata ?? {}) } };
}
function toolFailure(code: CodeBenchmarkErrorCode, message: string, boundary: CodeBenchmarkBoundary, normalized?: Pick<Normalized, "invocationId" | "dryRun" | "context">): CodeToolResult<CodeBenchmarkOutput, CodeBenchmarkErrorCode> {
  return { ok: false, toolId: "code.benchmark", error: { code, message, boundary, safeForRuntimeInspection: true, internalDetailExposed: false }, audit: [auditEvent("agentCore.basicTool.code.benchmark.rejected", normalized, { code, boundary })], events: ["basicTool.code.benchmark.rejected"] };
}
function normalizeCommand(command: unknown): readonly string[] | Extract<CodeBenchmarkResult, { ok: false }> {
  if (command === undefined) return [];
  if (!Array.isArray(command)) return failure("INVALID_COMMAND", "code.benchmark command must be an array of safe strings", "input");
  const normalized: string[] = [];
  for (const arg of command) {
    if (typeof arg !== "string" || arg.trim().length === 0 || arg.includes("\0")) return failure("INVALID_COMMAND", "code.benchmark command entries must be non-empty safe strings", "input");
    normalized.push(arg);
  }
  return normalized;
}
function normalizeInt(value: unknown, fallback: number, max: number, code: CodeBenchmarkErrorCode, label: string): number | Extract<CodeBenchmarkResult, { ok: false }> {
  if (value !== undefined && typeof value !== "number") return failure(code, `code.benchmark ${label} must be a positive integer`, "resource");
  const next = value ?? fallback;
  if (!Number.isInteger(next) || next < 0 || next > max || (label !== "warmup" && next < 1)) return failure(code, `code.benchmark ${label} is outside supported limits`, "resource");
  return next;
}
function normalizeEnv(value: unknown): Readonly<Record<string, string>> | Extract<CodeBenchmarkResult, { ok: false }> | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return failure("INVALID_ENVIRONMENT", "code.benchmark env must be a string record", "input");
  const env: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "string" || key.trim().length === 0 || key.includes("\0") || entry.includes("\0")) return failure("INVALID_ENVIRONMENT", "code.benchmark env must be a string record", "input");
    env[key] = entry;
  }
  return env;
}
function rejectedGate(...gates: readonly (CodeBenchmarkGate | undefined)[]): CodeBenchmarkGate | undefined {
  return gates.find((gate) => gate?.accepted === false || gate?.allowed === false);
}
function hasApproval(...gates: readonly (CodeBenchmarkGate | undefined)[]): boolean {
  return gates.some((gate) => gate?.accepted === true || gate?.allowed === true);
}
function resolveScopes(request: CodeBenchmarkRequest): readonly string[] | Extract<CodeBenchmarkResult, { ok: false }> {
  const requested = cleanList(request.context?.requestedScopes ?? request.requestedScopes);
  const allowed = cleanList(request.context?.allowedScopes ?? request.allowedScopes);
  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) return failure("SCOPE_DENIED", `code.benchmark scope ${denied[0]} is outside runtime governance`, "scope");
  return requested;
}
function normalize(request: CodeBenchmarkRequest = {}): Normalized | Extract<CodeBenchmarkResult, { ok: false }> {
  const context = request.context ?? {};
  const runtimeId = stringValue(context.runtimeId ?? request.runtimeId)?.trim() ?? "";
  if (runtimeId.length === 0) return failure("MISSING_RUNTIME_ID", "code.benchmark requires context.runtimeId for audit", "input");
  if (isBlank(request.workspaceRoot)) return failure("MISSING_WORKSPACE_ROOT", "code.benchmark requires a workspaceRoot", "input");
  if (isBlank(request.benchmarkTarget)) return failure("MISSING_BENCHMARK_TARGET", "code.benchmark requires a benchmarkTarget", "input");
  const rejected = rejectedGate(request.contract, request.governance, request.guard, context.guard);
  if (rejected !== undefined) return failure(rejected === request.contract ? "CONTRACT_REJECTED" : "GOVERNANCE_REJECTED", rejected.reason ?? "code.benchmark was rejected by runtime governance", rejected === request.contract ? "contract" : "governance");
  const command = normalizeCommand(request.command);
  if ("ok" in command) return command;
  const iterations = normalizeInt(request.iterations, codeBenchmarkDescriptor.defaultIterations, codeBenchmarkDescriptor.maxIterations, "INVALID_ITERATIONS", "iterations");
  if (typeof iterations !== "number") return iterations;
  const warmup = normalizeInt(request.warmup, 0, codeBenchmarkDescriptor.maxIterations, "INVALID_WARMUP", "warmup");
  if (typeof warmup !== "number") return warmup;
  const timeoutMs = normalizeInt(request.timeoutMs, codeBenchmarkDescriptor.defaultTimeoutMs, codeBenchmarkDescriptor.maxTimeoutMs, "INVALID_TIMEOUT", "timeoutMs");
  if (typeof timeoutMs !== "number") return timeoutMs;
  const env = normalizeEnv(request.env);
  if (env !== undefined && "ok" in env) return env as Extract<CodeBenchmarkResult, { ok: false }>;
  const normalizedEnv = env as Readonly<Record<string, string>> | undefined;
  const acceptedScopes = resolveScopes(request);
  if ("ok" in acceptedScopes) return acceptedScopes;
  return {
    runtimeId,
    invocationId: stringValue(context.invocationId ?? request.invocationId)?.trim() || `${runtimeId}:code.benchmark:${request.benchmarkTarget}`,
    workspaceRoot: stringValue(request.workspaceRoot)?.trim() ?? "",
    benchmarkTarget: stringValue(request.benchmarkTarget)?.trim() ?? "",
    command,
    metric: stringValue(request.metric)?.trim() || codeBenchmarkDescriptor.defaultMetric,
    iterations,
    warmup,
    timeoutMs,
    dryRun: request.dryRun !== false && context.dryRun !== false,
    acceptedScopes,
    stdin: stringValue(request.stdin),
    env: normalizedEnv,
    context,
  };
}
function planFromNormalized(normalized: Normalized): CodeBenchmarkPlan {
  return { toolKind: "code.benchmark", runtimeId: normalized.runtimeId, invocationId: normalized.invocationId, workspaceRoot: normalized.workspaceRoot, benchmarkTarget: normalized.benchmarkTarget, command: normalized.command, metric: normalized.metric, iterations: normalized.iterations, timeoutMs: normalized.timeoutMs, permissions: ["workspace:read", "process:spawn:dry-run"], acceptedScopes: normalized.acceptedScopes, execution: { dryRun: true, benchmarkExecuted: false, unsafeSideEffects: false }, audit: { capability: "benchmark-code", governanceRequired: true, tapCanWrap: true } };
}
function runtimeEntry(): CodeBenchmarkRuntimeEntry {
  return { owner: "runtime", port: "BaseToolExecutorPort.process.run", method: "run", intent: "benchmark" };
}
function limitText(value: string, max = 12_000): { text: string; truncated: boolean } {
  if (value.length <= max) return { text: value, truncated: false };
  return { text: value.slice(0, max), truncated: true };
}
function emptyOutput(normalized: Normalized): CodeBenchmarkOutput {
  return { kind: "agentCore.basicTool.code.benchmark.output", runtimeId: normalized.runtimeId, invocationId: normalized.invocationId, workspaceRoot: normalized.workspaceRoot, benchmarkTarget: normalized.benchmarkTarget, command: normalized.command, commandPreview: normalized.command, metric: normalized.metric, iterations: normalized.iterations, warmup: normalized.warmup, timeoutMs: normalized.timeoutMs, runtimeEntry: runtimeEntry(), dryRun: true, providerCalled: false, runs: Array.from({ length: normalized.iterations }, (_, index) => ({ iteration: index + 1, status: "planned" as const })), stdoutPreview: "", stderrPreview: "", truncated: false, unsafeSideEffects: false };
}
function summarize(values: readonly number[]): CodeBenchmarkSummary | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((left, right) => left - right);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return { minMs: sorted[0], maxMs: sorted[sorted.length - 1], meanMs: mean, p95Ms: sorted[p95Index] };
}
export function planCodeBenchmark(request: CodeBenchmarkRequest = {}): CodeBenchmarkResult {
  if (request.dryRun === false || request.context?.dryRun === false) return failure("REAL_SIDE_EFFECT_NOT_ALLOWED", "planCodeBenchmark only creates a dry-run benchmark plan", "governance");
  const normalized = normalize(request);
  if ("ok" in normalized) return normalized;
  return { ok: true, plan: planFromNormalized(normalized), events: ["basicTool.code.benchmark.planned"] };
}
export async function executeCodeBenchmark(request: CodeBenchmarkRequest = {}): Promise<CodeToolResult<CodeBenchmarkOutput, CodeBenchmarkErrorCode>> {
  const normalized = normalize(request);
  if ("ok" in normalized) return toolFailure(normalized.error.code, normalized.error.message, normalized.error.boundary);
  if (normalized.dryRun) return { ok: true, toolId: "code.benchmark", output: emptyOutput(normalized), audit: [auditEvent("agentCore.basicTool.code.benchmark.planned", normalized)], events: ["basicTool.code.benchmark.planned"] };
  if (!hasApproval(request.guard, request.governance, normalized.context.guard)) return toolFailure("GOVERNANCE_REJECTED", "code.benchmark real execution requires an affirmative runtime guard", "governance", normalized);
  if (normalized.command.length === 0) return toolFailure("MISSING_COMMAND", "code.benchmark real execution requires a fixed command array", "input", normalized);
  if (request.provider === undefined) return toolFailure("PROVIDER_UNAVAILABLE", "code.benchmark requires runtime process.run support for non-dry-run execution", "provider", normalized);
  try {
    const [command, ...args] = normalized.command;
    let stdoutText = "";
    let stderrText = "";
    const runs: { iteration: number; exitCode?: number; durationMs?: number; status: "planned" | "passed" | "failed" }[] = [];
    for (let index = 0; index < normalized.warmup + normalized.iterations; index += 1) {
      const result = await request.provider({ command, args, cwd: normalized.workspaceRoot, timeoutMs: normalized.timeoutMs, stdin: normalized.stdin, env: normalized.env, benchmarkTarget: normalized.benchmarkTarget, iteration: index + 1, metric: normalized.metric }, normalized.context);
      if (index >= normalized.warmup) {
        runs.push({ iteration: index - normalized.warmup + 1, exitCode: result.exitCode, durationMs: result.durationMs, status: result.exitCode === 0 ? "passed" : "failed" });
      }
      stdoutText += result.stdout;
      stderrText += result.stderr;
    }
    const stdout = limitText(stdoutText);
    const stderr = limitText(stderrText);
    return { ok: true, toolId: "code.benchmark", output: { ...emptyOutput(normalized), dryRun: false, providerCalled: true, runs, summary: summarize(runs.map((run) => run.durationMs).filter((value): value is number => typeof value === "number")), stdoutPreview: stdout.text, stderrPreview: stderr.text, truncated: stdout.truncated || stderr.truncated }, audit: [auditEvent("agentCore.basicTool.code.benchmark.completed", normalized, { iterations: normalized.iterations })], events: ["basicTool.code.benchmark.completed"] };
  } catch {
    return toolFailure("PROVIDER_FAILURE", "code.benchmark provider failed while running the runtime-supported benchmark process", "provider", normalized);
  }
}
