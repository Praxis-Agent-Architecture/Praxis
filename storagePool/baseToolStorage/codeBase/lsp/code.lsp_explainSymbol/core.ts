/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 代码基础工具 / LSP 语义工具。
 * 核心目的：提供 代码基础工具 / LSP 语义工具 中的“解释符号含义”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type LspExplainSymbolBoundary =
  | "input"
  | "contract"
  | "governance"
  | "scope"
  | "environment";

export type LspExplainSymbolGate = {
  accepted: boolean;
  reason?: string;
};

export type LspSymbolPosition = {
  line: number;
  character: number;
};

export type LspExplainSymbolRequest = {
  runtimeId?: string;
  sessionId?: string;
  workspaceRoot?: string;
  documentUri?: string;
  position?: LspSymbolPosition;
  symbolName?: string;
  includeDefinitionHint?: boolean;
  includeReferencesHint?: boolean;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  lspClientReady?: boolean;
  dryRun?: boolean;
  contract?: LspExplainSymbolGate;
  governance?: LspExplainSymbolGate;
  auditContext?: Record<string, unknown>;
};

export type LspExplainSymbolErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_SESSION_ID"
  | "MISSING_WORKSPACE_ROOT"
  | "MISSING_DOCUMENT_URI"
  | "MISSING_SYMBOL_TARGET"
  | "INVALID_POSITION"
  | "LSP_CLIENT_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED";

export type LspExplainSymbolError = {
  code: LspExplainSymbolErrorCode;
  message: string;
  boundary: LspExplainSymbolBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type LspExplainSymbolPlan = {
  toolId: "code.lsp_explainSymbol";
  capability: "explain-lsp-symbol";
  runtimeId: string;
  sessionId: string;
  workspaceRoot: string;
  documentUri: string;
  target: {
    position?: LspSymbolPosition;
    symbolName?: string;
  };
  explanationHints: {
    includeDefinitionHint: boolean;
    includeReferencesHint: boolean;
  };
  permissions: {
    required: readonly ["tool:lsp", "workspace:read"];
    acceptedScopes: readonly string[];
    approvalRequired: false;
  };
  execution: {
    dryRun: true;
    lspInvoked: false;
    modelInvoked: false;
    documentMutated: false;
    unsafeSideEffects: false;
  };
  audit: {
    event: "basicTool.lsp.explainSymbol.planned";
    auditContext: Readonly<Record<string, unknown>>;
  };
};

export type LspExplainSymbolResult =
  | {
      ok: true;
      plan: LspExplainSymbolPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: LspExplainSymbolError;
      events: readonly string[];
    };

export const lspExplainSymbolDescriptor = {
  toolId: "code.lsp_explainSymbol",
  capability: "explain-lsp-symbol",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.codeBase.lsp",
  purpose: "plan an LSP-backed symbol explanation without invoking providers or mutating code",
  sideEffectPolicy: "dry-run-only",
  requiresApproval: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function isValidPosition(position: LspSymbolPosition): boolean {
  return (
    Number.isInteger(position.line) &&
    Number.isInteger(position.character) &&
    position.line >= 0 &&
    position.character >= 0
  );
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: LspExplainSymbolErrorCode,
  message: string,
  boundary: LspExplainSymbolBoundary,
): LspExplainSymbolResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.lsp.explainSymbol.rejected"],
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | LspExplainSymbolResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `LSP symbol explanation scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

export function planLspSymbolExplanation(request?: LspExplainSymbolRequest): LspExplainSymbolResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "LSP symbol explanation requires runtimeId", "input");
  }

  if (isBlank(request.sessionId)) {
    return failure("MISSING_SESSION_ID", "LSP symbol explanation requires sessionId", "input");
  }

  if (isBlank(request.workspaceRoot)) {
    return failure("MISSING_WORKSPACE_ROOT", "LSP symbol explanation requires workspaceRoot", "input");
  }

  if (isBlank(request.documentUri)) {
    return failure("MISSING_DOCUMENT_URI", "LSP symbol explanation requires documentUri", "input");
  }

  if (request.position === undefined && isBlank(request.symbolName)) {
    return failure("MISSING_SYMBOL_TARGET", "LSP symbol explanation requires a position or symbolName", "input");
  }

  if (request.position !== undefined && !isValidPosition(request.position)) {
    return failure("INVALID_POSITION", "LSP symbol explanation position must use non-negative integers", "input");
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_SIDE_EFFECT_NOT_ALLOWED",
      "first-round LSP symbol explanation only supports dry-run planning",
      "governance",
    );
  }

  if (request.lspClientReady === false) {
    return failure("LSP_CLIENT_NOT_READY", "LSP symbol explanation requires a ready LSP client", "environment");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "LSP symbol explanation was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "LSP symbol explanation was rejected by runtime governance",
      "governance",
    );
  }

  const acceptedScopes = resolveScopes(request.requestedScopes, request.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  const runtimeId = request.runtimeId?.trim() ?? "";
  const sessionId = request.sessionId?.trim() ?? "";
  const workspaceRoot = request.workspaceRoot?.trim() ?? "";
  const documentUri = request.documentUri?.trim() ?? "";

  return {
    ok: true,
    plan: {
      toolId: "code.lsp_explainSymbol",
      capability: "explain-lsp-symbol",
      runtimeId,
      sessionId,
      workspaceRoot,
      documentUri,
      target: {
        position:
          request.position === undefined
            ? undefined
            : {
                line: request.position.line,
                character: request.position.character,
              },
        symbolName: request.symbolName?.trim() || undefined,
      },
      explanationHints: {
        includeDefinitionHint: request.includeDefinitionHint ?? true,
        includeReferencesHint: request.includeReferencesHint ?? false,
      },
      permissions: {
        required: ["tool:lsp", "workspace:read"],
        acceptedScopes,
        approvalRequired: false,
      },
      execution: {
        dryRun: true,
        lspInvoked: false,
        modelInvoked: false,
        documentMutated: false,
        unsafeSideEffects: false,
      },
      audit: {
        event: "basicTool.lsp.explainSymbol.planned",
        auditContext: request.auditContext ?? {},
      },
    },
    events: ["basicTool.lsp.explainSymbol.planned"],
  };
}
