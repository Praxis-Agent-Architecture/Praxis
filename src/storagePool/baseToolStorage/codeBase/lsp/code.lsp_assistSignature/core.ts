/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 代码基础工具 / LSP 语义工具。
 * 核心目的：提供 代码基础工具 / LSP 语义工具 中的“提供函数签名辅助”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type LspAssistSignatureBoundary =
  | "input"
  | "contract"
  | "governance"
  | "scope"
  | "environment";

export type LspAssistSignatureGate = {
  accepted: boolean;
  reason?: string;
};

export type LspDocumentPosition = {
  line: number;
  character: number;
};

export type LspAssistSignatureRequest = {
  runtimeId?: string;
  sessionId?: string;
  workspaceRoot?: string;
  documentUri?: string;
  position?: LspDocumentPosition;
  triggerCharacter?: string;
  callExpressionHint?: string;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  lspClientReady?: boolean;
  dryRun?: boolean;
  contract?: LspAssistSignatureGate;
  governance?: LspAssistSignatureGate;
  auditContext?: Record<string, unknown>;
};

export type LspAssistSignatureErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_SESSION_ID"
  | "MISSING_WORKSPACE_ROOT"
  | "MISSING_DOCUMENT_URI"
  | "MISSING_POSITION"
  | "INVALID_POSITION"
  | "LSP_CLIENT_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED";

export type LspAssistSignatureError = {
  code: LspAssistSignatureErrorCode;
  message: string;
  boundary: LspAssistSignatureBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type LspSignatureAssistPlan = {
  toolId: "code.lsp_assistSignature";
  capability: "assist-lsp-signature";
  runtimeId: string;
  sessionId: string;
  workspaceRoot: string;
  documentUri: string;
  position: LspDocumentPosition;
  signatureContext: {
    triggerCharacter?: string;
    callExpressionHint?: string;
  };
  permissions: {
    required: readonly ["tool:lsp", "workspace:read"];
    acceptedScopes: readonly string[];
    approvalRequired: false;
  };
  execution: {
    dryRun: true;
    lspInvoked: false;
    documentMutated: false;
    unsafeSideEffects: false;
  };
  audit: {
    event: "basicTool.lsp.assistSignature.planned";
    auditContext: Readonly<Record<string, unknown>>;
  };
};

export type LspAssistSignatureResult =
  | {
      ok: true;
      plan: LspSignatureAssistPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: LspAssistSignatureError;
      events: readonly string[];
    };

export const lspAssistSignatureDescriptor = {
  toolId: "code.lsp_assistSignature",
  capability: "assist-lsp-signature",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.codeBase.lsp",
  purpose: "plan a signature-help lookup without calling a live LSP server",
  sideEffectPolicy: "dry-run-only",
  requiresApproval: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function isValidPosition(position: LspDocumentPosition): boolean {
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
  code: LspAssistSignatureErrorCode,
  message: string,
  boundary: LspAssistSignatureBoundary,
): LspAssistSignatureResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.lsp.assistSignature.rejected"],
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | LspAssistSignatureResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `LSP signature scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

export function planLspSignatureAssistance(request?: LspAssistSignatureRequest): LspAssistSignatureResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "LSP signature assistance requires runtimeId", "input");
  }

  if (isBlank(request.sessionId)) {
    return failure("MISSING_SESSION_ID", "LSP signature assistance requires sessionId", "input");
  }

  if (isBlank(request.workspaceRoot)) {
    return failure("MISSING_WORKSPACE_ROOT", "LSP signature assistance requires workspaceRoot", "input");
  }

  if (isBlank(request.documentUri)) {
    return failure("MISSING_DOCUMENT_URI", "LSP signature assistance requires documentUri", "input");
  }

  if (request.position === undefined) {
    return failure("MISSING_POSITION", "LSP signature assistance requires a document position", "input");
  }

  if (!isValidPosition(request.position)) {
    return failure("INVALID_POSITION", "LSP signature assistance position must use non-negative integers", "input");
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_SIDE_EFFECT_NOT_ALLOWED",
      "first-round LSP signature assistance only supports dry-run planning",
      "governance",
    );
  }

  if (request.lspClientReady === false) {
    return failure("LSP_CLIENT_NOT_READY", "LSP signature assistance requires a ready LSP client", "environment");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "LSP signature assistance was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "LSP signature assistance was rejected by runtime governance",
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
      toolId: "code.lsp_assistSignature",
      capability: "assist-lsp-signature",
      runtimeId,
      sessionId,
      workspaceRoot,
      documentUri,
      position: {
        line: request.position.line,
        character: request.position.character,
      },
      signatureContext: {
        triggerCharacter: request.triggerCharacter?.trim() || undefined,
        callExpressionHint: request.callExpressionHint?.trim() || undefined,
      },
      permissions: {
        required: ["tool:lsp", "workspace:read"],
        acceptedScopes,
        approvalRequired: false,
      },
      execution: {
        dryRun: true,
        lspInvoked: false,
        documentMutated: false,
        unsafeSideEffects: false,
      },
      audit: {
        event: "basicTool.lsp.assistSignature.planned",
        auditContext: request.auditContext ?? {},
      },
    },
    events: ["basicTool.lsp.assistSignature.planned"],
  };
}
