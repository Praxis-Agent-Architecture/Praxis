/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 代码基础工具 / LSP 语义工具。
 * 核心目的：提供 代码基础工具 / LSP 语义工具 中的“应用 LSP code action”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type LspApplyCodeActionBoundary =
  | "input"
  | "contract"
  | "governance"
  | "scope"
  | "environment";

export type LspApplyCodeActionGate = {
  accepted: boolean;
  reason?: string;
};

export type LspCodeActionEditPreview = {
  filesTouched?: readonly string[];
  diagnosticsResolved?: readonly string[];
  summary?: string;
};

export type LspApplyCodeActionRequest = {
  runtimeId?: string;
  sessionId?: string;
  workspaceRoot?: string;
  documentUri?: string;
  actionId?: string;
  actionTitle?: string;
  actionKind?: string;
  editPreview?: LspCodeActionEditPreview;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  lspClientReady?: boolean;
  dryRun?: boolean;
  contract?: LspApplyCodeActionGate;
  governance?: LspApplyCodeActionGate;
  auditContext?: Record<string, unknown>;
};

export type LspApplyCodeActionErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_SESSION_ID"
  | "MISSING_WORKSPACE_ROOT"
  | "MISSING_DOCUMENT_URI"
  | "MISSING_CODE_ACTION"
  | "LSP_CLIENT_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED";

export type LspApplyCodeActionError = {
  code: LspApplyCodeActionErrorCode;
  message: string;
  boundary: LspApplyCodeActionBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type LspApplyCodeActionPlan = {
  toolId: "code.lsp_applyCodeAction";
  capability: "apply-lsp-code-action";
  runtimeId: string;
  sessionId: string;
  workspaceRoot: string;
  documentUri: string;
  action: {
    id?: string;
    title: string;
    kind?: string;
  };
  permissions: {
    required: readonly ["tool:lsp", "workspace:read", "workspace:write"];
    acceptedScopes: readonly string[];
    approvalRequired: true;
  };
  execution: {
    dryRun: true;
    lspInvoked: false;
    editApplied: false;
    unsafeSideEffects: false;
  };
  audit: {
    event: "basicTool.lsp.applyCodeAction.planned";
    editPreview?: LspCodeActionEditPreview;
    auditContext: Readonly<Record<string, unknown>>;
  };
};

export type LspApplyCodeActionResult =
  | {
      ok: true;
      plan: LspApplyCodeActionPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: LspApplyCodeActionError;
      events: readonly string[];
    };

export const lspApplyCodeActionDescriptor = {
  toolId: "code.lsp_applyCodeAction",
  capability: "apply-lsp-code-action",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.codeBase.lsp",
  purpose: "plan and audit an LSP code action application without applying edits",
  sideEffectPolicy: "dry-run-only",
  requiresApproval: true,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: LspApplyCodeActionErrorCode,
  message: string,
  boundary: LspApplyCodeActionBoundary,
): LspApplyCodeActionResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.lsp.applyCodeAction.rejected"],
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | LspApplyCodeActionResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `LSP code action scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

export function planLspApplyCodeAction(request?: LspApplyCodeActionRequest): LspApplyCodeActionResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "applying an LSP code action requires runtimeId", "input");
  }

  if (isBlank(request.sessionId)) {
    return failure("MISSING_SESSION_ID", "applying an LSP code action requires sessionId", "input");
  }

  if (isBlank(request.workspaceRoot)) {
    return failure("MISSING_WORKSPACE_ROOT", "applying an LSP code action requires workspaceRoot", "input");
  }

  if (isBlank(request.documentUri)) {
    return failure("MISSING_DOCUMENT_URI", "applying an LSP code action requires documentUri", "input");
  }

  if (isBlank(request.actionId) && isBlank(request.actionTitle)) {
    return failure("MISSING_CODE_ACTION", "applying an LSP code action requires an action id or title", "input");
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_SIDE_EFFECT_NOT_ALLOWED",
      "first-round LSP code action application only supports dry-run planning",
      "governance",
    );
  }

  if (request.lspClientReady === false) {
    return failure("LSP_CLIENT_NOT_READY", "LSP code action application requires a ready LSP client", "environment");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "LSP code action application was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "LSP code action application was rejected by runtime governance",
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
      toolId: "code.lsp_applyCodeAction",
      capability: "apply-lsp-code-action",
      runtimeId,
      sessionId,
      workspaceRoot,
      documentUri,
      action: {
        id: request.actionId?.trim() || undefined,
        title: request.actionTitle?.trim() || request.actionId?.trim() || "",
        kind: request.actionKind?.trim() || undefined,
      },
      permissions: {
        required: ["tool:lsp", "workspace:read", "workspace:write"],
        acceptedScopes,
        approvalRequired: true,
      },
      execution: {
        dryRun: true,
        lspInvoked: false,
        editApplied: false,
        unsafeSideEffects: false,
      },
      audit: {
        event: "basicTool.lsp.applyCodeAction.planned",
        editPreview: request.editPreview,
        auditContext: request.auditContext ?? {},
      },
    },
    events: ["basicTool.lsp.applyCodeAction.planned"],
  };
}
