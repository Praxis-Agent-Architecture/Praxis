/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 代码基础工具 / LSP 语义工具。
 * 核心目的：提供 代码基础工具 / LSP 语义工具 中的“检查诊断信息”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type LspInspectDiagnosticsBoundary = "input" | "contract" | "governance" | "scope";

export type LspInspectDiagnosticsGate = {
  accepted: boolean;
  reason?: string;
};

export type LspDiagnosticSeverity = "error" | "warning" | "information" | "hint";

export type LspDiagnosticPosition = {
  line: number;
  character: number;
};

export type LspDiagnosticRange = {
  start: LspDiagnosticPosition;
  end: LspDiagnosticPosition;
};

export type LspDiagnostic = {
  code?: string;
  source?: string;
  message: string;
  severity: LspDiagnosticSeverity;
  range: LspDiagnosticRange;
};

export type LspInspectDiagnosticsRequest = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  documentUri?: string;
  diagnostics?: readonly LspDiagnostic[];
  severities?: readonly LspDiagnosticSeverity[];
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  contract?: LspInspectDiagnosticsGate;
  governance?: LspInspectDiagnosticsGate;
};

export type LspInspectDiagnosticsErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_SESSION_ID"
  | "MISSING_DOCUMENT_URI"
  | "INVALID_DIAGNOSTICS"
  | "INVALID_SEVERITY_FILTER"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_LSP_CALL_NOT_ALLOWED";

export type LspInspectDiagnosticsError = {
  code: LspInspectDiagnosticsErrorCode;
  message: string;
  boundary: LspInspectDiagnosticsBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type LspInspectDiagnosticsSummary = {
  total: number;
  bySeverity: Record<LspDiagnosticSeverity, number>;
  highestSeverity?: LspDiagnosticSeverity;
};

export type LspInspectDiagnosticsSnapshot = {
  tool: "code.lsp_inspectDiagnostics";
  runtimeId: string;
  sessionId: string;
  invocationId: string;
  documentUri: string;
  diagnostics: readonly LspDiagnostic[];
  summary: LspInspectDiagnosticsSummary;
  acceptedScopes: readonly string[];
  execution: {
    dryRun: true;
    lspServerInvoked: false;
    fileMutationPlanned: false;
    unsafeSideEffects: false;
  };
  audit: {
    capability: "inspect-diagnostics";
    governanceRequired: true;
    tapDelegation: "basic-tool-primitive";
  };
};

export type LspInspectDiagnosticsResult =
  | {
      ok: true;
      snapshot: LspInspectDiagnosticsSnapshot;
      events: readonly string[];
    }
  | {
      ok: false;
      error: LspInspectDiagnosticsError;
      events: readonly string[];
    };

export const lspInspectDiagnosticsDescriptor = {
  tool: "code.lsp_inspectDiagnostics",
  capability: "inspect-diagnostics",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.codeBase.lsp",
  unsafeSideEffects: false,
  firstRoundExecution: "snapshot-envelope",
} as const;

const severityOrder: readonly LspDiagnosticSeverity[] = ["error", "warning", "information", "hint"];

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: LspInspectDiagnosticsErrorCode,
  message: string,
  boundary: LspInspectDiagnosticsBoundary,
): LspInspectDiagnosticsResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.code.lsp.inspectDiagnostics.rejected"],
  };
}

function isPosition(value: LspDiagnosticPosition | undefined): value is LspDiagnosticPosition {
  return (
    value !== undefined &&
    Number.isInteger(value.line) &&
    Number.isInteger(value.character) &&
    value.line >= 0 &&
    value.character >= 0
  );
}

function isRange(value: LspDiagnosticRange | undefined): value is LspDiagnosticRange {
  return (
    value !== undefined &&
    isPosition(value.start) &&
    isPosition(value.end) &&
    comparePosition(value.start, value.end) <= 0
  );
}

function comparePosition(left: LspDiagnosticPosition, right: LspDiagnosticPosition): number {
  return left.line === right.line ? left.character - right.character : left.line - right.line;
}

function isDiagnostic(value: LspDiagnostic | undefined): value is LspDiagnostic {
  return (
    value !== undefined &&
    severityOrder.includes(value.severity) &&
    typeof value.message === "string" &&
    value.message.trim().length > 0 &&
    isRange(value.range)
  );
}

function normalizeSeverityFilter(
  severities: readonly LspDiagnosticSeverity[] | undefined,
): readonly LspDiagnosticSeverity[] | undefined {
  if (severities === undefined) {
    return severityOrder;
  }

  const cleaned = [...new Set(severities)];
  return cleaned.every((severity) => severityOrder.includes(severity)) ? cleaned : undefined;
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | LspInspectDiagnosticsResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);
  const denied = requested.filter((scope) => !allowed.includes(scope));

  if (requested.length > 0 && denied.length > 0) {
    return failure("SCOPE_DENIED", `inspectDiagnostics scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

function summarizeDiagnostics(diagnostics: readonly LspDiagnostic[]): LspInspectDiagnosticsSummary {
  const bySeverity: Record<LspDiagnosticSeverity, number> = {
    error: 0,
    warning: 0,
    information: 0,
    hint: 0,
  };

  for (const diagnostic of diagnostics) {
    bySeverity[diagnostic.severity] += 1;
  }

  const highestSeverity = severityOrder.find((severity) => bySeverity[severity] > 0);

  return {
    total: diagnostics.length,
    bySeverity,
    highestSeverity,
  };
}

export function inspectLspDiagnostics(request?: LspInspectDiagnosticsRequest): LspInspectDiagnosticsResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "inspectDiagnostics requires runtimeId for audit and governance", "input");
  }

  if (isBlank(request.sessionId)) {
    return failure("MISSING_SESSION_ID", "inspectDiagnostics requires sessionId for invocation traceability", "input");
  }

  if (isBlank(request.documentUri)) {
    return failure("MISSING_DOCUMENT_URI", "inspectDiagnostics requires a target documentUri", "input");
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_LSP_CALL_NOT_ALLOWED",
      "first-round inspectDiagnostics only inspects a supplied diagnostic snapshot",
      "governance",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "inspectDiagnostics was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "inspectDiagnostics was rejected by runtime governance",
      "governance",
    );
  }

  const severityFilter = normalizeSeverityFilter(request.severities);
  if (severityFilter === undefined) {
    return failure("INVALID_SEVERITY_FILTER", "inspectDiagnostics severity filters must be known LSP severities", "input");
  }

  const diagnostics = request.diagnostics ?? [];
  if (!Array.isArray(diagnostics) || !diagnostics.every(isDiagnostic)) {
    return failure("INVALID_DIAGNOSTICS", "inspectDiagnostics requires diagnostics with message, severity and range", "input");
  }

  const acceptedScopes = resolveScopes(request.requestedScopes, request.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  const filteredDiagnostics = diagnostics.filter((diagnostic) => severityFilter.includes(diagnostic.severity));
  const runtimeId = (request.runtimeId ?? "").trim();
  const sessionId = request.sessionId?.trim() ?? "";
  const documentUri = request.documentUri?.trim() ?? "";

  return {
    ok: true,
    snapshot: {
      tool: "code.lsp_inspectDiagnostics",
      runtimeId,
      sessionId,
      invocationId: request.invocationId?.trim() || `${runtimeId}:${sessionId}:lsp.inspectDiagnostics`,
      documentUri,
      diagnostics: filteredDiagnostics,
      summary: summarizeDiagnostics(filteredDiagnostics),
      acceptedScopes,
      execution: {
        dryRun: true,
        lspServerInvoked: false,
        fileMutationPlanned: false,
        unsafeSideEffects: false,
      },
      audit: {
        capability: "inspect-diagnostics",
        governanceRequired: true,
        tapDelegation: "basic-tool-primitive",
      },
    },
    events: ["basicTool.code.lsp.inspectDiagnostics.snapshot"],
  };
}
