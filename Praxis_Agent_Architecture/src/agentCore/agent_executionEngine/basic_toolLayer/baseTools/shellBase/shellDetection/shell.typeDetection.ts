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

export type ShellTypeDetectionBoundary = "input" | "contract" | "governance" | "scope" | "permission";

export type ShellTypeDetectionGate = {
  accepted: boolean;
  reason?: string;
};

export type ShellTypeDetectionContext = {
  runtimeId?: string;
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
  metadata?: Readonly<Record<string, unknown>>;
};

export type ShellTypeDetectionErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_SHELL_HINT"
  | "INVALID_SHELL_HINT"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SHELL_PROBE_NOT_ALLOWED";

export type ShellTypeDetectionError = {
  code: ShellTypeDetectionErrorCode;
  message: string;
  boundary: ShellTypeDetectionBoundary;
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
  requiredPermissions: readonly ["shell:detect:dry-run"];
  requiresTapApproval: true;
  dispatch: "dry-run";
  dryRun: true;
  unsafeSideEffects: false;
  acceptedScopes: readonly string[];
  audit: {
    event: "basicTool.shell.typeDetection.detected";
    metadata: Readonly<Record<string, unknown>>;
  };
};

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

export const shellTypeDetectionDescriptor = {
  toolId: "shell.typeDetection",
  capability: "detect-shell-type",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.shellBase.shellDetection",
  defaultDispatch: "dry-run",
  unsafeSideEffects: false,
  requiresTapApproval: true,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
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
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.shell.typeDetection.rejected"],
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
    return { source: "shellPath", value: request.shellPath ?? "" };
  }

  if (!isBlank(request.executableName)) {
    return { source: "executableName", value: request.executableName ?? "" };
  }

  if (!isBlank(request.envShell)) {
    return { source: "envShell", value: request.envShell ?? "" };
  }

  return undefined;
}

export function detectShellType(request: ShellTypeDetectionRequest = {}): ShellTypeDetectionResult {
  const runtimeId = request.context?.runtimeId?.trim();
  if (isBlank(runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "shell.typeDetection requires context.runtimeId for audit", "input");
  }

  if (request.context?.dryRun === false) {
    return failure(
      "REAL_SHELL_PROBE_NOT_ALLOWED",
      "first-round shell.typeDetection only classifies supplied shell hints",
      "contract",
    );
  }

  if (request.context?.guard?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.context.guard.reason ?? "shell.typeDetection was rejected by runtime governance",
      "governance",
    );
  }

  const acceptedScopes = resolveScopes(request.context?.requestedScopes, request.context?.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  const hint = selectShellHint(request);
  if (hint === undefined) {
    return failure("MISSING_SHELL_HINT", "shell.typeDetection requires a shellPath, executableName, or envShell", "input");
  }

  if (hint.value.includes("\0")) {
    return failure("INVALID_SHELL_HINT", "shell.typeDetection shell hint must be a safe string", "input");
  }

  const normalizedShellName = normalizeShellName(hint.value);
  const classified = classifyShellName(normalizedShellName);
  const invocationId =
    request.context?.invocationId?.trim() || `${runtimeId}:shell.typeDetection:${normalizedShellName}`;

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
      platform: request.platform?.trim() || undefined,
      requiredPermissions: ["shell:detect:dry-run"],
      requiresTapApproval: true,
      dispatch: "dry-run",
      dryRun: true,
      unsafeSideEffects: false,
      acceptedScopes,
      audit: {
        event: "basicTool.shell.typeDetection.detected",
        metadata: {
          ...(request.context?.auditMetadata ?? {}),
          ...(request.metadata ?? {}),
        },
      },
    },
    events: ["basicTool.shell.typeDetection.detected"],
  };
}
