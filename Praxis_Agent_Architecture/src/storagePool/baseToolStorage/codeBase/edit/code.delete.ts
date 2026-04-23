/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 代码基础工具 / 代码编辑工具。
 * 核心目的：提供 代码基础工具 / 代码编辑工具 中的“删除代码或文件”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type CodeDeleteBoundary = "input" | "contract" | "governance" | "scope";

export type CodeDeleteGate = {
  accepted: boolean;
  reason?: string;
};

export type CodeDeleteKind = "file" | "directory" | "code-range";

export type CodeDeleteRange = {
  startLine: number;
  endLine: number;
};

export type CodeDeleteRequest = {
  workspaceRoot?: string;
  targetPath?: string;
  deleteKind?: CodeDeleteKind;
  range?: CodeDeleteRange;
  reason?: string;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  contract?: CodeDeleteGate;
  governance?: CodeDeleteGate;
  metadata?: Readonly<Record<string, unknown>>;
};

export type CodeDeleteErrorCode =
  | "MISSING_WORKSPACE_ROOT"
  | "MISSING_TARGET_PATH"
  | "TARGET_OUT_OF_SCOPE"
  | "INVALID_DELETE_RANGE"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED";

export type CodeDeleteError = {
  code: CodeDeleteErrorCode;
  message: string;
  boundary: CodeDeleteBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type CodeDeletePlan = {
  tool: "code.delete";
  capability: "delete-code-or-file";
  workspaceRoot: string;
  targetPath: string;
  deleteKind: CodeDeleteKind;
  range?: CodeDeleteRange;
  reason?: string;
  requiredPermission: "filesystem:delete";
  requiresTapApproval: true;
  dispatch: "dry-run";
  dryRun: true;
  wouldDelete: true;
  unsafeSideEffects: false;
  acceptedScopes: readonly string[];
  audit: {
    guard: "target-scope-and-approval";
    event: "basicTool.code.delete.planned";
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type CodeDeleteResult =
  | {
      ok: true;
      plan: CodeDeletePlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: CodeDeleteError;
      events: readonly string[];
    };

export const codeDeleteDescriptor = {
  tool: "code.delete",
  capability: "delete-code-or-file",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.codeBase.edit",
  defaultDispatch: "dry-run",
  requiresTapApproval: true,
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(code: CodeDeleteErrorCode, message: string, boundary: CodeDeleteBoundary): CodeDeleteResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.code.delete.rejected"],
  };
}

function normalizeRelativeTargetPath(targetPath: string): string | undefined {
  const normalized = targetPath.trim().replaceAll("\\", "/").replace(/\/+/g, "/");
  const parts = normalized.split("/");

  if (
    normalized.length === 0 ||
    normalized.includes("\0") ||
    normalized.startsWith("/") ||
    parts.some((part) => part === "..")
  ) {
    return undefined;
  }

  return parts.filter((part) => part !== "." && part.length > 0).join("/");
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | CodeDeleteResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `code.delete scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

function isValidRange(range: CodeDeleteRange | undefined): boolean {
  return (
    range !== undefined &&
    Number.isInteger(range.startLine) &&
    Number.isInteger(range.endLine) &&
    range.startLine > 0 &&
    range.endLine >= range.startLine
  );
}

export function planCodeDelete(request: CodeDeleteRequest = {}): CodeDeleteResult {
  if (isBlank(request.workspaceRoot)) {
    return failure("MISSING_WORKSPACE_ROOT", "code.delete requires a workspaceRoot for scope auditing", "input");
  }

  if (isBlank(request.targetPath)) {
    return failure("MISSING_TARGET_PATH", "code.delete requires a targetPath", "input");
  }

  const targetPath = normalizeRelativeTargetPath(request.targetPath ?? "");
  if (targetPath === undefined) {
    return failure("TARGET_OUT_OF_SCOPE", "code.delete targetPath must stay inside the declared workspace scope", "scope");
  }

  const deleteKind = request.deleteKind ?? "file";
  if (deleteKind === "code-range" && !isValidRange(request.range)) {
    return failure("INVALID_DELETE_RANGE", "code.delete code-range requires a valid startLine and endLine", "input");
  }

  if (request.dryRun === false) {
    return failure("REAL_SIDE_EFFECT_NOT_ALLOWED", "first-round code.delete only supports dry-run planning", "governance");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "code.delete was rejected by runtime contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "code.delete was rejected by runtime governance",
      "governance",
    );
  }

  const acceptedScopes = resolveScopes(request.requestedScopes, request.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  return {
    ok: true,
    plan: {
      tool: "code.delete",
      capability: "delete-code-or-file",
      workspaceRoot: request.workspaceRoot?.trim() ?? "",
      targetPath,
      deleteKind,
      range: deleteKind === "code-range" ? request.range : undefined,
      reason: request.reason?.trim() || undefined,
      requiredPermission: "filesystem:delete",
      requiresTapApproval: true,
      dispatch: "dry-run",
      dryRun: true,
      wouldDelete: true,
      unsafeSideEffects: false,
      acceptedScopes,
      audit: {
        guard: "target-scope-and-approval",
        event: "basicTool.code.delete.planned",
        metadata: request.metadata ?? {},
      },
    },
    events: ["basicTool.code.delete.planned"],
  };
}
