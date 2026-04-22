/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 代码基础工具 / 代码编辑工具。
 * 核心目的：提供 代码基础工具 / 代码编辑工具 中的“整体覆盖写入文件”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type CodeOverwriteBoundary = "input" | "contract" | "governance" | "scope" | "resource";

export type CodeOverwriteGate = {
  accepted: boolean;
  reason?: string;
};

export type CodeOverwriteRequest = {
  workspaceRoot?: string;
  targetPath?: string;
  content?: string;
  expectedExistingHash?: string;
  maxBytes?: number;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  contract?: CodeOverwriteGate;
  governance?: CodeOverwriteGate;
  metadata?: Readonly<Record<string, unknown>>;
};

export type CodeOverwriteErrorCode =
  | "MISSING_WORKSPACE_ROOT"
  | "MISSING_TARGET_PATH"
  | "TARGET_OUT_OF_SCOPE"
  | "MISSING_CONTENT"
  | "CONTENT_TOO_LARGE"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED";

export type CodeOverwriteError = {
  code: CodeOverwriteErrorCode;
  message: string;
  boundary: CodeOverwriteBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type CodeOverwritePlan = {
  tool: "code.overwrite";
  capability: "overwrite-file-content";
  workspaceRoot: string;
  targetPath: string;
  contentBytes: number;
  expectedExistingHash?: string;
  maxBytes: number;
  requiredPermission: "filesystem:overwrite";
  requiresTapApproval: true;
  dispatch: "dry-run";
  dryRun: true;
  wouldOverwrite: true;
  unsafeSideEffects: false;
  acceptedScopes: readonly string[];
  audit: {
    guard: "target-scope-size-and-approval";
    event: "basicTool.code.overwrite.planned";
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type CodeOverwriteResult =
  | {
      ok: true;
      plan: CodeOverwritePlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: CodeOverwriteError;
      events: readonly string[];
    };

export const codeOverwriteDescriptor = {
  tool: "code.overwrite",
  capability: "overwrite-file-content",
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

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function failure(code: CodeOverwriteErrorCode, message: string, boundary: CodeOverwriteBoundary): CodeOverwriteResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.code.overwrite.rejected"],
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
): string[] | CodeOverwriteResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `code.overwrite scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

export function planCodeOverwrite(request: CodeOverwriteRequest = {}): CodeOverwriteResult {
  if (isBlank(request.workspaceRoot)) {
    return failure("MISSING_WORKSPACE_ROOT", "code.overwrite requires a workspaceRoot for scope auditing", "input");
  }

  if (isBlank(request.targetPath)) {
    return failure("MISSING_TARGET_PATH", "code.overwrite requires a targetPath", "input");
  }

  const targetPath = normalizeRelativeTargetPath(request.targetPath ?? "");
  if (targetPath === undefined) {
    return failure("TARGET_OUT_OF_SCOPE", "code.overwrite targetPath must stay inside the declared workspace scope", "scope");
  }

  if (typeof request.content !== "string") {
    return failure("MISSING_CONTENT", "code.overwrite requires explicit content", "input");
  }

  const maxBytes = request.maxBytes ?? 1_048_576;
  const contentBytes = byteLength(request.content);
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || contentBytes > maxBytes) {
    return failure("CONTENT_TOO_LARGE", "code.overwrite content exceeds the configured byte limit", "resource");
  }

  if (request.dryRun === false) {
    return failure("REAL_SIDE_EFFECT_NOT_ALLOWED", "first-round code.overwrite only supports dry-run planning", "governance");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "code.overwrite was rejected by runtime contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "code.overwrite was rejected by runtime governance",
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
      tool: "code.overwrite",
      capability: "overwrite-file-content",
      workspaceRoot: request.workspaceRoot?.trim() ?? "",
      targetPath,
      contentBytes,
      expectedExistingHash: request.expectedExistingHash?.trim() || undefined,
      maxBytes,
      requiredPermission: "filesystem:overwrite",
      requiresTapApproval: true,
      dispatch: "dry-run",
      dryRun: true,
      wouldOverwrite: true,
      unsafeSideEffects: false,
      acceptedScopes,
      audit: {
        guard: "target-scope-size-and-approval",
        event: "basicTool.code.overwrite.planned",
        metadata: request.metadata ?? {},
      },
    },
    events: ["basicTool.code.overwrite.planned"],
  };
}
