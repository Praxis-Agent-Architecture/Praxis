import type { CodeToolAuditEvent, CodeToolResult } from "../../_shared/baseToolAdapter.js";

export type CodeTestBoundary = "input" | "contract" | "governance" | "scope" | "resource" | "provider";

export type CodeTestGate = {
  accepted?: boolean;
  allowed?: boolean;
  reason?: string;
};

export type CodeTestContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: CodeTestGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type CodeTestRequest = {
  context?: CodeTestContext;
  runtimeId?: string;
  invocationId?: string;
  workspaceRoot?: string;
  testTarget?: string;
  command?: readonly string[];
  testFramework?: string;
  updateSnapshots?: boolean;
  timeoutMs?: number;
  stdin?: string;
  env?: Readonly<Record<string, string>>;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  guard?: CodeTestGate;
  contract?: CodeTestGate;
  governance?: CodeTestGate;
  provider?: CodeTestProvider;
  metadata?: Readonly<Record<string, unknown>>;
};

export type CodeTestErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_WORKSPACE_ROOT"
  | "MISSING_TEST_TARGET"
  | "MISSING_COMMAND"
  | "INVALID_COMMAND"
  | "INVALID_TIMEOUT"
  | "INVALID_ENVIRONMENT"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_FAILURE";

export type CodeTestError = {
  code: CodeTestErrorCode;
  message: string;
  boundary: CodeTestBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type CodeTestRuntimeEntry = {
  owner: "runtime";
  port: "BaseToolExecutorPort.process.run";
  method: "run";
  intent: "test";
};

export type CodeTestRisk = {
  category: "test-execution";
  riskLevel: "risky";
  spawnsProcess: true;
  mutatesWorkspace: boolean;
  requiresTapApproval: true;
  runtimeOwnsExecution: true;
};

export type CodeTestPlan = {
  toolKind: "code.testCode";
  runtimeId: string;
  invocationId: string;
  workspaceRoot: string;
  testTarget: string;
  command: readonly string[];
  testFramework?: string;
  updateSnapshots: boolean;
  timeoutMs: number;
  permissions: readonly string[];
  acceptedScopes: readonly string[];
  execution: {
    dryRun: true;
    testsExecuted: false;
    unsafeSideEffects: false;
  };
  audit: {
    capability: "test-code";
    governanceRequired: true;
    tapCanWrap: true;
  };
};

export type CodeTestOutput = {
  kind: "agentCore.basicTool.code.testCode.output";
  runtimeId: string;
  invocationId: string;
  workspaceRoot: string;
  testTarget: string;
  command: readonly string[];
  commandPreview: readonly string[];
  testFramework?: string;
  updateSnapshots: boolean;
  timeoutMs: number;
  runtimeEntry: CodeTestRuntimeEntry;
  risk: CodeTestRisk;
  dryRun: boolean;
  providerCalled: boolean;
  exitCode?: number;
  status: "planned" | "passed" | "failed";
  durationMs?: number;
  stdoutPreview: string;
  stderrPreview: string;
  truncated: boolean;
  unsafeSideEffects: boolean;
};

export type CodeTestResult =
  | {
      ok: true;
      plan: CodeTestPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: CodeTestError;
      events: readonly string[];
    };

export type CodeTestProviderRequest = {
  command: string;
  args: readonly string[];
  cwd: string;
  timeoutMs: number;
  stdin?: string;
  env?: Readonly<Record<string, string>>;
  testTarget: string;
  testFramework?: string;
  updateSnapshots: boolean;
};

export type CodeTestProviderResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs?: number;
};

export type CodeTestProvider = (
  request: CodeTestProviderRequest,
  context: CodeTestContext,
) => CodeTestProviderResult | Promise<CodeTestProviderResult>;

type NormalizedCodeTest = {
  runtimeId: string;
  invocationId: string;
  workspaceRoot: string;
  testTarget: string;
  command: readonly string[];
  testFramework?: string;
  updateSnapshots: boolean;
  timeoutMs: number;
  dryRun: boolean;
  acceptedScopes: readonly string[];
  stdin?: string;
  env?: Readonly<Record<string, string>>;
  context: CodeTestContext;
};

export const codeTestDescriptor = {
  toolKind: "code.testCode",
  toolId: "code.testCode",
  purpose: "run a fixed code test target through runtime-owned process execution",
  defaultTimeoutMs: 60_000,
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
  if (!Array.isArray(values)) {
    return [];
  }
  return [...new Set(values.map((value) => (typeof value === "string" ? value.trim() : "")).filter(Boolean))];
}

function failure(code: CodeTestErrorCode, message: string, boundary: CodeTestBoundary): Extract<CodeTestResult, { ok: false }> {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true, internalDetailExposed: false },
    events: ["basicTool.code.testCode.rejected"],
  };
}

function toolFailure(
  code: CodeTestErrorCode,
  message: string,
  boundary: CodeTestBoundary,
  normalized?: Pick<NormalizedCodeTest, "invocationId" | "dryRun" | "context">,
): CodeToolResult<CodeTestOutput, CodeTestErrorCode> {
  return {
    ok: false,
    toolId: "code.testCode",
    error: { code, message, boundary, safeForRuntimeInspection: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.code.testCode.rejected", normalized, { code, boundary })],
    events: ["basicTool.code.testCode.rejected"],
  };
}

function auditEvent(
  type: string,
  normalized?: Pick<NormalizedCodeTest, "invocationId" | "dryRun" | "context">,
  metadata?: Readonly<Record<string, unknown>>,
): CodeToolAuditEvent {
  return {
    type,
    toolId: "code.testCode",
    invocationId: normalized?.invocationId ?? "code.testCode:unknown",
    dryRun: normalized?.dryRun ?? true,
    metadata: {
      ...(normalized?.context.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function resolveScopes(request: CodeTestRequest): readonly string[] | Extract<CodeTestResult, { ok: false }> {
  const requested = cleanList(request.context?.requestedScopes ?? request.requestedScopes);
  const allowed = cleanList(request.context?.allowedScopes ?? request.allowedScopes);
  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `code.testCode scope ${denied[0]} is outside runtime governance`, "scope");
  }
  return requested;
}

function normalizeCommand(command: unknown): readonly string[] | Extract<CodeTestResult, { ok: false }> {
  if (command === undefined) {
    return [];
  }
  if (!Array.isArray(command)) {
    return failure("INVALID_COMMAND", "code.testCode command must be an array of safe strings", "input");
  }
  const normalized: string[] = [];
  for (const arg of command) {
    if (typeof arg !== "string" || arg.trim().length === 0 || arg.includes("\0")) {
      return failure("INVALID_COMMAND", "code.testCode command entries must be non-empty safe strings", "input");
    }
    normalized.push(arg);
  }
  return normalized;
}

function normalizeTimeout(value: unknown): number | Extract<CodeTestResult, { ok: false }> {
  if (value !== undefined && typeof value !== "number") {
    return failure("INVALID_TIMEOUT", "code.testCode timeoutMs must be between 1 and 600000", "resource");
  }
  const timeoutMs = value ?? codeTestDescriptor.defaultTimeoutMs;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > codeTestDescriptor.maxTimeoutMs) {
    return failure("INVALID_TIMEOUT", "code.testCode timeoutMs must be between 1 and 600000", "resource");
  }
  return timeoutMs;
}

function normalizeEnv(value: unknown): Readonly<Record<string, string>> | Extract<CodeTestResult, { ok: false }> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return failure("INVALID_ENVIRONMENT", "code.testCode env must be a string record", "input");
  }
  const env: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "string" || key.trim().length === 0 || key.includes("\0") || entry.includes("\0")) {
      return failure("INVALID_ENVIRONMENT", "code.testCode env must be a string record", "input");
    }
    env[key] = entry;
  }
  return env;
}

function rejectedGate(...gates: readonly (CodeTestGate | undefined)[]): CodeTestGate | undefined {
  return gates.find((gate) => gate?.accepted === false || gate?.allowed === false);
}

function hasApproval(...gates: readonly (CodeTestGate | undefined)[]): boolean {
  return gates.some((gate) => gate?.accepted === true || gate?.allowed === true);
}

function normalizeCodeTest(request: CodeTestRequest = {}): NormalizedCodeTest | Extract<CodeTestResult, { ok: false }> {
  const context = request.context ?? {};
  const runtimeId = stringValue(context.runtimeId ?? request.runtimeId)?.trim() ?? "";
  if (runtimeId.length === 0) {
    return failure("MISSING_RUNTIME_ID", "code.testCode requires context.runtimeId for audit", "input");
  }
  if (isBlank(request.workspaceRoot ?? context.auditMetadata?.workspaceRoot)) {
    return failure("MISSING_WORKSPACE_ROOT", "code.testCode requires a workspaceRoot", "input");
  }
  if (isBlank(request.testTarget)) {
    return failure("MISSING_TEST_TARGET", "code.testCode requires a testTarget", "input");
  }

  const rejected = rejectedGate(request.contract, request.governance, request.guard, context.guard);
  if (rejected !== undefined) {
    return failure(rejected === request.contract ? "CONTRACT_REJECTED" : "GOVERNANCE_REJECTED", rejected.reason ?? "code.testCode was rejected by runtime governance", rejected === request.contract ? "contract" : "governance");
  }

  const command = normalizeCommand(request.command);
  if ("ok" in command) {
    return command;
  }
  const timeoutMs = normalizeTimeout(request.timeoutMs);
  if (typeof timeoutMs !== "number") {
    return timeoutMs;
  }
  const env = normalizeEnv(request.env);
  if (env !== undefined && "ok" in env) {
    return env as Extract<CodeTestResult, { ok: false }>;
  }
  const normalizedEnv = env as Readonly<Record<string, string>> | undefined;
  const acceptedScopes = resolveScopes(request);
  if ("ok" in acceptedScopes) {
    return acceptedScopes;
  }

  const dryRun = request.dryRun !== false && context.dryRun !== false;
  return {
    runtimeId,
    invocationId: stringValue(context.invocationId ?? request.invocationId)?.trim() || `${runtimeId}:code.testCode:${request.testTarget}`,
    workspaceRoot: stringValue(request.workspaceRoot)?.trim() ?? "",
    testTarget: stringValue(request.testTarget)?.trim() ?? "",
    command,
    testFramework: stringValue(request.testFramework)?.trim() || undefined,
    updateSnapshots: request.updateSnapshots === true,
    timeoutMs,
    dryRun,
    acceptedScopes,
    stdin: stringValue(request.stdin),
    env: normalizedEnv,
    context,
  };
}

function planFromNormalized(normalized: NormalizedCodeTest): CodeTestPlan {
  return {
    toolKind: "code.testCode",
    runtimeId: normalized.runtimeId,
    invocationId: normalized.invocationId,
    workspaceRoot: normalized.workspaceRoot,
    testTarget: normalized.testTarget,
    command: normalized.command,
    testFramework: normalized.testFramework,
    updateSnapshots: normalized.updateSnapshots,
    timeoutMs: normalized.timeoutMs,
    permissions: ["workspace:read", "process:spawn:dry-run"],
    acceptedScopes: normalized.acceptedScopes,
    execution: { dryRun: true, testsExecuted: false, unsafeSideEffects: false },
    audit: { capability: "test-code", governanceRequired: true, tapCanWrap: true },
  };
}

function runtimeEntry(): CodeTestRuntimeEntry {
  return { owner: "runtime", port: "BaseToolExecutorPort.process.run", method: "run", intent: "test" };
}

function risk(updateSnapshots: boolean): CodeTestRisk {
  return {
    category: "test-execution",
    riskLevel: "risky",
    spawnsProcess: true,
    mutatesWorkspace: updateSnapshots,
    requiresTapApproval: true,
    runtimeOwnsExecution: true,
  };
}

function limitText(value: string, max = 12_000): { text: string; truncated: boolean } {
  if (value.length <= max) {
    return { text: value, truncated: false };
  }
  return { text: value.slice(0, max), truncated: true };
}

function dryRunOutput(normalized: NormalizedCodeTest): CodeTestOutput {
  return {
    kind: "agentCore.basicTool.code.testCode.output",
    runtimeId: normalized.runtimeId,
    invocationId: normalized.invocationId,
    workspaceRoot: normalized.workspaceRoot,
    testTarget: normalized.testTarget,
    command: normalized.command,
    commandPreview: normalized.command,
    testFramework: normalized.testFramework,
    updateSnapshots: normalized.updateSnapshots,
    timeoutMs: normalized.timeoutMs,
    runtimeEntry: runtimeEntry(),
    risk: risk(normalized.updateSnapshots),
    dryRun: true,
    providerCalled: false,
    status: "planned",
    stdoutPreview: "",
    stderrPreview: "",
    truncated: false,
    unsafeSideEffects: false,
  };
}

export function planCodeTest(request: CodeTestRequest = {}): CodeTestResult {
  if (request.dryRun === false || request.context?.dryRun === false) {
    return failure("REAL_SIDE_EFFECT_NOT_ALLOWED", "planCodeTest only creates a dry-run guard and audit plan", "governance");
  }
  const normalized = normalizeCodeTest(request);
  if ("ok" in normalized) {
    return normalized;
  }
  return { ok: true, plan: planFromNormalized(normalized), events: ["basicTool.code.testCode.planned"] };
}

export async function executeCodeTest(
  request: CodeTestRequest = {},
): Promise<CodeToolResult<CodeTestOutput, CodeTestErrorCode>> {
  const normalized = normalizeCodeTest(request);
  if ("ok" in normalized) {
    return toolFailure(normalized.error.code, normalized.error.message, normalized.error.boundary);
  }

  if (normalized.dryRun) {
    return {
      ok: true,
      toolId: "code.testCode",
      output: dryRunOutput(normalized),
      audit: [auditEvent("agentCore.basicTool.code.testCode.planned", normalized)],
      events: ["basicTool.code.testCode.planned"],
    };
  }

  if (!hasApproval(request.guard, request.governance, normalized.context.guard)) {
    return toolFailure("GOVERNANCE_REJECTED", "code.testCode real execution requires an affirmative runtime guard", "governance", normalized);
  }
  if (normalized.command.length === 0) {
    return toolFailure("MISSING_COMMAND", "code.testCode real execution requires a fixed command array", "input", normalized);
  }
  if (request.provider === undefined) {
    return toolFailure("PROVIDER_UNAVAILABLE", "code.testCode requires runtime process.run support for non-dry-run execution", "provider", normalized);
  }

  try {
    const [command, ...args] = normalized.command;
    const result = await request.provider(
      {
        command,
        args,
        cwd: normalized.workspaceRoot,
        timeoutMs: normalized.timeoutMs,
        stdin: normalized.stdin,
        env: normalized.env,
        testTarget: normalized.testTarget,
        testFramework: normalized.testFramework,
        updateSnapshots: normalized.updateSnapshots,
      },
      normalized.context,
    );
    const stdout = limitText(result.stdout);
    const stderr = limitText(result.stderr);
    return {
      ok: true,
      toolId: "code.testCode",
      output: {
        ...dryRunOutput(normalized),
        dryRun: false,
        providerCalled: true,
        exitCode: result.exitCode,
        status: result.exitCode === 0 ? "passed" : "failed",
        durationMs: result.durationMs,
        stdoutPreview: stdout.text,
        stderrPreview: stderr.text,
        truncated: stdout.truncated || stderr.truncated,
        unsafeSideEffects: normalized.updateSnapshots,
      },
      audit: [auditEvent("agentCore.basicTool.code.testCode.completed", normalized, { exitCode: result.exitCode })],
      events: ["basicTool.code.testCode.completed"],
    };
  } catch {
    return toolFailure("PROVIDER_FAILURE", "code.testCode provider failed while running the runtime-supported test process", "provider", normalized);
  }
}
