/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 代码基础工具 / LSP 语义工具。
 * 核心目的：提供 代码基础工具 / LSP 语义工具 中的“格式化整个文档”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type LspFormatDocumentBoundary = "input" | "contract" | "governance" | "scope";

export type LspFormatDocumentGate = {
  accepted: boolean;
  reason?: string;
};

export type LspFormatDocumentOptions = {
  tabSize?: number;
  insertSpaces?: boolean;
  trimTrailingWhitespace?: boolean;
  insertFinalNewline?: boolean;
};

export type LspFormatDocumentRequest = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  documentUri?: string;
  languageId?: string;
  options?: LspFormatDocumentOptions;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  contract?: LspFormatDocumentGate;
  governance?: LspFormatDocumentGate;
};

export type LspFormatDocumentErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_SESSION_ID"
  | "MISSING_DOCUMENT_URI"
  | "INVALID_FORMAT_OPTIONS"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_LSP_CALL_NOT_ALLOWED";

export type LspFormatDocumentError = {
  code: LspFormatDocumentErrorCode;
  message: string;
  boundary: LspFormatDocumentBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type LspFormatDocumentPlan = {
  tool: "code.lsp_formatDocument";
  runtimeId: string;
  sessionId: string;
  invocationId: string;
  documentUri: string;
  languageId?: string;
  options: Required<LspFormatDocumentOptions>;
  acceptedScopes: readonly string[];
  execution: {
    dryRun: true;
    lspServerInvoked: false;
    fileMutationPlanned: false;
    unsafeSideEffects: false;
  };
  audit: {
    capability: "format-document";
    governanceRequired: true;
    tapDelegation: "basic-tool-primitive";
  };
};

export type LspFormatDocumentResult =
  | {
      ok: true;
      plan: LspFormatDocumentPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: LspFormatDocumentError;
      events: readonly string[];
    };

export const lspFormatDocumentDescriptor = {
  tool: "code.lsp_formatDocument",
  capability: "format-document",
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

function failure(
  code: LspFormatDocumentErrorCode,
  message: string,
  boundary: LspFormatDocumentBoundary,
): LspFormatDocumentResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.code.lsp.formatDocument.rejected"],
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | LspFormatDocumentResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);
  const denied = requested.filter((scope) => !allowed.includes(scope));

  if (requested.length > 0 && denied.length > 0) {
    return failure("SCOPE_DENIED", `formatDocument scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

function normalizeOptions(options: LspFormatDocumentOptions | undefined): Required<LspFormatDocumentOptions> | undefined {
  const tabSize = options?.tabSize ?? 2;
  if (!Number.isInteger(tabSize) || tabSize <= 0 || tabSize > 16) {
    return undefined;
  }

  return {
    tabSize,
    insertSpaces: options?.insertSpaces ?? true,
    trimTrailingWhitespace: options?.trimTrailingWhitespace ?? true,
    insertFinalNewline: options?.insertFinalNewline ?? true,
  };
}

export function createLspFormatDocumentPlan(request?: LspFormatDocumentRequest): LspFormatDocumentResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "formatDocument requires runtimeId for audit and governance", "input");
  }

  if (isBlank(request.sessionId)) {
    return failure("MISSING_SESSION_ID", "formatDocument requires sessionId for invocation traceability", "input");
  }

  if (isBlank(request.documentUri)) {
    return failure("MISSING_DOCUMENT_URI", "formatDocument requires a target documentUri", "input");
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_LSP_CALL_NOT_ALLOWED",
      "first-round formatDocument only builds a dry-run LSP formatting envelope",
      "governance",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "formatDocument was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "formatDocument was rejected by runtime governance",
      "governance",
    );
  }

  const options = normalizeOptions(request.options);
  if (options === undefined) {
    return failure("INVALID_FORMAT_OPTIONS", "formatDocument options require a tabSize between 1 and 16", "input");
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
      tool: "code.lsp_formatDocument",
      runtimeId,
      sessionId,
      invocationId: request.invocationId?.trim() || `${runtimeId}:${sessionId}:lsp.formatDocument`,
      documentUri,
      languageId: request.languageId?.trim() || undefined,
      options,
      acceptedScopes,
      execution: {
        dryRun: true,
        lspServerInvoked: false,
        fileMutationPlanned: false,
        unsafeSideEffects: false,
      },
      audit: {
        capability: "format-document",
        governanceRequired: true,
        tapDelegation: "basic-tool-primitive",
      },
    },
    events: ["basicTool.code.lsp.formatDocument.planned"],
  };
}
