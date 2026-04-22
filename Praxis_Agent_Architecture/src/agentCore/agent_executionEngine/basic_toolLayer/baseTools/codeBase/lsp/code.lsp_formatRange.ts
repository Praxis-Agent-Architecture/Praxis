/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 代码基础工具 / LSP 语义工具。
 * 核心目的：提供 代码基础工具 / LSP 语义工具 中的“格式化指定范围”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type LspFormatRangeBoundary = "input" | "contract" | "governance" | "scope";

export type LspFormatRangeGate = {
  accepted: boolean;
  reason?: string;
};

export type LspPosition = {
  line: number;
  character: number;
};

export type LspRange = {
  start: LspPosition;
  end: LspPosition;
};

export type LspFormatRangeOptions = {
  tabSize?: number;
  insertSpaces?: boolean;
};

export type LspFormatRangeRequest = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  documentUri?: string;
  languageId?: string;
  range?: LspRange;
  options?: LspFormatRangeOptions;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  contract?: LspFormatRangeGate;
  governance?: LspFormatRangeGate;
};

export type LspFormatRangeErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_SESSION_ID"
  | "MISSING_DOCUMENT_URI"
  | "MISSING_RANGE"
  | "INVALID_RANGE"
  | "INVALID_FORMAT_OPTIONS"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_LSP_CALL_NOT_ALLOWED";

export type LspFormatRangeError = {
  code: LspFormatRangeErrorCode;
  message: string;
  boundary: LspFormatRangeBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type LspFormatRangePlan = {
  tool: "code.lsp_formatRange";
  runtimeId: string;
  sessionId: string;
  invocationId: string;
  documentUri: string;
  languageId?: string;
  range: LspRange;
  options: Required<LspFormatRangeOptions>;
  acceptedScopes: readonly string[];
  execution: {
    dryRun: true;
    lspServerInvoked: false;
    fileMutationPlanned: false;
    unsafeSideEffects: false;
  };
  audit: {
    capability: "format-range";
    governanceRequired: true;
    tapDelegation: "basic-tool-primitive";
  };
};

export type LspFormatRangeResult =
  | {
      ok: true;
      plan: LspFormatRangePlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: LspFormatRangeError;
      events: readonly string[];
    };

export const lspFormatRangeDescriptor = {
  tool: "code.lsp_formatRange",
  capability: "format-range",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.codeBase.lsp",
  unsafeSideEffects: false,
  firstRoundExecution: "dry-run-envelope",
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(code: LspFormatRangeErrorCode, message: string, boundary: LspFormatRangeBoundary): LspFormatRangeResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.code.lsp.formatRange.rejected"],
  };
}

function isPosition(value: LspPosition | undefined): value is LspPosition {
  return (
    value !== undefined &&
    Number.isInteger(value.line) &&
    Number.isInteger(value.character) &&
    value.line >= 0 &&
    value.character >= 0
  );
}

function comparePosition(left: LspPosition, right: LspPosition): number {
  return left.line === right.line ? left.character - right.character : left.line - right.line;
}

function normalizeRange(range: LspRange | undefined): LspRange | undefined {
  if (range === undefined || !isPosition(range.start) || !isPosition(range.end)) {
    return undefined;
  }

  if (comparePosition(range.start, range.end) > 0) {
    return undefined;
  }

  return {
    start: { line: range.start.line, character: range.start.character },
    end: { line: range.end.line, character: range.end.character },
  };
}

function normalizeOptions(options: LspFormatRangeOptions | undefined): Required<LspFormatRangeOptions> | undefined {
  const tabSize = options?.tabSize ?? 2;
  if (!Number.isInteger(tabSize) || tabSize <= 0 || tabSize > 16) {
    return undefined;
  }

  return {
    tabSize,
    insertSpaces: options?.insertSpaces ?? true,
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | LspFormatRangeResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);
  const denied = requested.filter((scope) => !allowed.includes(scope));

  if (requested.length > 0 && denied.length > 0) {
    return failure("SCOPE_DENIED", `formatRange scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

export function createLspFormatRangePlan(request?: LspFormatRangeRequest): LspFormatRangeResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "formatRange requires runtimeId for audit and governance", "input");
  }

  if (isBlank(request.sessionId)) {
    return failure("MISSING_SESSION_ID", "formatRange requires sessionId for invocation traceability", "input");
  }

  if (isBlank(request.documentUri)) {
    return failure("MISSING_DOCUMENT_URI", "formatRange requires a target documentUri", "input");
  }

  if (request.range === undefined) {
    return failure("MISSING_RANGE", "formatRange requires an explicit LSP range", "input");
  }

  const range = normalizeRange(request.range);
  if (range === undefined) {
    return failure("INVALID_RANGE", "formatRange range must use non-negative positions with start before end", "input");
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_LSP_CALL_NOT_ALLOWED",
      "first-round formatRange only builds a dry-run LSP formatting envelope",
      "governance",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "formatRange was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "formatRange was rejected by runtime governance",
      "governance",
    );
  }

  const options = normalizeOptions(request.options);
  if (options === undefined) {
    return failure("INVALID_FORMAT_OPTIONS", "formatRange options require a tabSize between 1 and 16", "input");
  }

  const acceptedScopes = resolveScopes(request.requestedScopes, request.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  const runtimeId = (request.runtimeId ?? "").trim();
  const sessionId = request.sessionId?.trim() ?? "";
  const documentUri = request.documentUri?.trim() ?? "";

  return {
    ok: true,
    plan: {
      tool: "code.lsp_formatRange",
      runtimeId,
      sessionId,
      invocationId: request.invocationId?.trim() || `${runtimeId}:${sessionId}:lsp.formatRange`,
      documentUri,
      languageId: request.languageId?.trim() || undefined,
      range,
      options,
      acceptedScopes,
      execution: {
        dryRun: true,
        lspServerInvoked: false,
        fileMutationPlanned: false,
        unsafeSideEffects: false,
      },
      audit: {
        capability: "format-range",
        governanceRequired: true,
        tapDelegation: "basic-tool-primitive",
      },
    },
    events: ["basicTool.code.lsp.formatRange.planned"],
  };
}
