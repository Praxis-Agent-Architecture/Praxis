/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Shell 基础工具 / Shell 探测。
 * 核心目的：提供 Shell 基础工具 / Shell 探测 中的“识别 Shell 类型”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type ShellTypeKind = "bash" | "zsh" | "fish" | "powershell" | "cmd" | "sh" | "unknown";

export type ShellTypeDetectionBoundary = "input" | "contract" | "governance" | "scope" | "permission" | "provider";

export type ShellTypeDetectionGate = {
  accepted?: boolean;
  allowed?: boolean;
  reason?: string;
};

export type ShellTypeDetectionContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: ShellTypeDetectionGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type ShellTypeDetectionRequest = {
  context?: ShellTypeDetectionContext;
  shellPath?: string;
  executableName?: string;
  envShell?: string;
  platform?: string;
  provider?: ShellTypeDetectionProvider;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ShellTypeDetectionErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_SHELL_HINT"
  | "INVALID_SHELL_HINT"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SHELL_PROBE_NOT_ALLOWED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type ShellTypeDetectionError = {
  code: ShellTypeDetectionErrorCode;
  message: string;
  boundary: ShellTypeDetectionBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type ShellTypeDetectionReport = {
  toolId: "shell.typeDetection";
  capability: "detect-shell-type";
  runtimeId: string;
  invocationId: string;
  detectedType: ShellTypeKind;
  confidence: "high" | "medium" | "low";
  normalizedShellName: string;
  source: "shellPath" | "executableName" | "envShell";
  platform?: string;
  requiredPermissions: readonly ("shell:detect:dry-run" | "shell:detect")[];
  requiresTapApproval: true;
  dispatch: "dry-run" | "provider";
  dryRun: boolean;
  unsafeSideEffects: false;
  acceptedScopes: readonly string[];
  audit: {
    event: "basicTool.shell.typeDetection.detected";
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type ShellTypeDetectionOutput = ShellTypeDetectionReport;

export type ShellTypeDetectionAuditEvent = {
  type: string;
  toolId: "shell.typeDetection";
  invocationId: string;
  dryRun: boolean;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ShellTypeDetectionProviderRequest = {
  shellPath?: string;
  executableName?: string;
  envShell?: string;
  platform?: string;
  context?: ShellTypeDetectionContext;
};

export type ShellTypeDetectionProvider = (
  request: ShellTypeDetectionProviderRequest,
) => ShellTypeDetectionOutput | Promise<ShellTypeDetectionOutput>;

export type ShellTypeDetectionResult =
  | {
      ok: true;
      report: ShellTypeDetectionReport;
      events: readonly string[];
    }
  | {
      ok: false;
      error: ShellTypeDetectionError;
      events: readonly string[];
    };

export type ShellTypeDetectionToolResult =
  | {
      ok: true;
      toolId: "shell.typeDetection";
      output: ShellTypeDetectionOutput;
      audit: readonly ShellTypeDetectionAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "shell.typeDetection";
      error: ShellTypeDetectionError;
      audit: readonly ShellTypeDetectionAuditEvent[];
      events: readonly string[];
    };

export const shellTypeDetectionDescriptor = {
  toolId: "shell.typeDetection",
  capability: "detect-shell-type",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.shellBase.shellDetection",
  defaultDispatch: "dry-run",
  unsafeSideEffects: false,
  requiresTapApproval: true,
} as const;

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function publicReason(value: unknown, fallback: string): string {
  const reason = stringValue(value)?.trim();
  return reason !== undefined && reason.length > 0 ? reason : fallback;
}

function recordValue(value: unknown): Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}

function requestValue(value: unknown): ShellTypeDetectionRequest {
  return recordValue(value) as ShellTypeDetectionRequest;
}

function isBlank(value: unknown): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return [...new Set(values.map((value) => stringValue(value)?.trim() ?? "").filter(Boolean))];
}

function failure(
  code: ShellTypeDetectionErrorCode,
  message: string,
  boundary: ShellTypeDetectionBoundary,
): ShellTypeDetectionResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.shell.typeDetection.rejected"],
  };
}

function auditEvent(
  type: string,
  request: ShellTypeDetectionRequest,
  metadata?: Readonly<Record<string, unknown>>,
): ShellTypeDetectionAuditEvent {
  const runtimeId = stringValue(request.context?.runtimeId)?.trim() || "runtime";
  const invocationId = stringValue(request.context?.invocationId)?.trim() || `${runtimeId}:shell.typeDetection`;

  return {
    type,
    toolId: "shell.typeDetection",
    invocationId,
    dryRun: request.context?.dryRun !== false,
    metadata: {
      ...recordValue(request.context?.auditMetadata),
      ...recordValue(request.metadata),
      ...recordValue(metadata),
    },
  };
}

function toToolResult(result: ShellTypeDetectionResult, request: ShellTypeDetectionRequest): ShellTypeDetectionToolResult {
  if (!result.ok) {
    return {
      ok: false,
      toolId: "shell.typeDetection",
      error: result.error,
      audit: [auditEvent("agentCore.basicTool.shell.typeDetection.rejected", request, { code: result.error.code })],
      events: result.events,
    };
  }

  return {
    ok: true,
    toolId: "shell.typeDetection",
    output: result.report,
    audit: [auditEvent("agentCore.basicTool.shell.typeDetection.detected", request, result.report.audit.metadata)],
    events: result.events,
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | ShellTypeDetectionResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);
  const denied = requested.filter((scope) => !allowed.includes(scope));

  if (denied.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `shell.typeDetection scope ${denied[0]} is outside runtime governance`,
      "scope",
    );
  }

  return requested;
}

function basename(value: string): string {
  const normalized = value.trim().replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).at(-1) ?? normalized;
}

function normalizeShellName(value: string): string {
  return basename(value).toLowerCase().replace(/\.(exe|cmd)$/u, "");
}

function classifyShellName(name: string): { detectedType: ShellTypeKind; confidence: "high" | "medium" | "low" } {
  if (name === "bash" || name.endsWith("-bash")) {
    return { detectedType: "bash", confidence: "high" };
  }

  if (name === "zsh" || name.endsWith("-zsh")) {
    return { detectedType: "zsh", confidence: "high" };
  }

  if (name === "fish") {
    return { detectedType: "fish", confidence: "high" };
  }

  if (name === "pwsh" || name === "powershell" || name === "powershell_ise") {
    return { detectedType: "powershell", confidence: "high" };
  }

  if (name === "cmd" || name === "cmd32" || name === "cmd64") {
    return { detectedType: "cmd", confidence: "high" };
  }

  if (name === "sh" || name === "dash" || name === "ash") {
    return { detectedType: "sh", confidence: name === "sh" ? "high" : "medium" };
  }

  return { detectedType: "unknown", confidence: "low" };
}

function selectShellHint(request: ShellTypeDetectionRequest): { source: "shellPath" | "executableName" | "envShell"; value: string } | undefined {
  if (!isBlank(request.shellPath)) {
    return { source: "shellPath", value: stringValue(request.shellPath) ?? "" };
  }

  if (!isBlank(request.executableName)) {
    return { source: "executableName", value: stringValue(request.executableName) ?? "" };
  }

  if (!isBlank(request.envShell)) {
    return { source: "envShell", value: stringValue(request.envShell) ?? "" };
  }

  return undefined;
}

export function detectShellType(request: ShellTypeDetectionRequest = {}): ShellTypeDetectionResult {
  const normalizedRequest = requestValue(request);
  const runtimeId = stringValue(normalizedRequest.context?.runtimeId)?.trim();
  if (isBlank(runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "shell.typeDetection requires context.runtimeId for audit", "input");
  }

  if (normalizedRequest.context?.dryRun === false) {
    return failure(
      "REAL_SHELL_PROBE_NOT_ALLOWED",
      "first-round shell.typeDetection only classifies supplied shell hints",
      "contract",
    );
  }

  if (normalizedRequest.context?.guard?.accepted === false || normalizedRequest.context?.guard?.allowed === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      publicReason(normalizedRequest.context.guard.reason, "shell.typeDetection was rejected by runtime governance"),
      "governance",
    );
  }

  const acceptedScopes = resolveScopes(
    normalizedRequest.context?.requestedScopes,
    normalizedRequest.context?.allowedScopes,
  );
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  const hint = selectShellHint(normalizedRequest);
  if (hint === undefined) {
    return failure("MISSING_SHELL_HINT", "shell.typeDetection requires a shellPath, executableName, or envShell", "input");
  }

  if (/[\u0000-\u001F\u007F]/u.test(hint.value)) {
    return failure("INVALID_SHELL_HINT", "shell.typeDetection shell hint must be a safe string", "input");
  }

  const normalizedShellName = normalizeShellName(hint.value);
  const classified = classifyShellName(normalizedShellName);
  const invocationId =
    stringValue(normalizedRequest.context?.invocationId)?.trim() ||
    `${runtimeId}:shell.typeDetection:${normalizedShellName}`;

  return {
    ok: true,
    report: {
      toolId: "shell.typeDetection",
      capability: "detect-shell-type",
      runtimeId: runtimeId ?? "",
      invocationId,
      detectedType: classified.detectedType,
      confidence: classified.confidence,
      normalizedShellName,
      source: hint.source,
      platform: stringValue(normalizedRequest.platform)?.trim() || undefined,
      requiredPermissions: ["shell:detect:dry-run"],
      requiresTapApproval: true,
      dispatch: "dry-run",
      dryRun: true,
      unsafeSideEffects: false,
      acceptedScopes,
      audit: {
        event: "basicTool.shell.typeDetection.detected",
        metadata: {
          ...recordValue(normalizedRequest.context?.auditMetadata),
          ...recordValue(normalizedRequest.metadata),
        },
      },
    },
    events: ["basicTool.shell.typeDetection.detected"],
  };
}

export async function executeShellTypeDetection(
  request: ShellTypeDetectionRequest = {},
): Promise<ShellTypeDetectionToolResult> {
  const normalizedRequest = requestValue(request);
  if (normalizedRequest.context?.dryRun !== false) {
    return toToolResult(detectShellType(normalizedRequest), normalizedRequest);
  }

  const validation = detectShellType({
    ...normalizedRequest,
    context: {
      ...normalizedRequest.context,
      dryRun: true,
    },
  });
  if (!validation.ok) {
    return toToolResult(validation, normalizedRequest);
  }

  if (!(normalizedRequest.context?.guard?.allowed === true || normalizedRequest.context?.guard?.accepted === true)) {
    return toToolResult(
      failure(
        "GOVERNANCE_REJECTED",
        publicReason(
          normalizedRequest.context?.guard?.reason,
          "shell.typeDetection requires an affirmative runtime guard for real probing",
        ),
        "governance",
      ),
      normalizedRequest,
    );
  }

  if (typeof normalizedRequest.provider !== "function") {
    return toToolResult(
      failure(
        "PROVIDER_UNAVAILABLE",
        "shell.typeDetection requires a runtime provider for real probing",
        "provider",
      ),
      normalizedRequest,
    );
  }

  try {
    const output = await normalizedRequest.provider({
      shellPath: stringValue(normalizedRequest.shellPath),
      executableName: stringValue(normalizedRequest.executableName),
      envShell: stringValue(normalizedRequest.envShell),
      platform: stringValue(normalizedRequest.platform),
      context: normalizedRequest.context,
    });

    return {
      ok: true,
      toolId: "shell.typeDetection",
      output: {
        ...output,
        requiredPermissions: ["shell:detect"],
        dryRun: false,
        dispatch: "provider",
      },
      audit: [auditEvent("agentCore.basicTool.shell.typeDetection.probed", normalizedRequest, output.audit.metadata)],
      events: ["basicTool.shell.typeDetection.probed"],
    };
  } catch (error) {
    return toToolResult(
      failure(
        "PROVIDER_REJECTED",
        "shell.typeDetection provider rejected the probe",
        "provider",
      ),
      normalizedRequest,
    );
  }
}
