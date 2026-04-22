/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 代码基础工具 / 代码编辑工具。
 * 核心目的：提供 代码基础工具 / 代码编辑工具 中的“格式化代码”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type CodeFormatBoundary = "input" | "contract" | "governance" | "scope";

export type CodeFormatGate = {
  accepted: boolean;
  reason?: string;
};

export type CodeFormatRange = {
  startLine: number;
  endLine: number;
};

export type CodeFormatRequest = {
  workspaceRoot?: string;
  targetPath?: string;
  languageHint?: string;
  formatterId?: string;
  range?: CodeFormatRange;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  contract?: CodeFormatGate;
  governance?: CodeFormatGate;
  metadata?: Readonly<Record<string, unknown>>;
};

export type CodeFormatErrorCode =
  | "MISSING_WORKSPACE_ROOT"
  | "MISSING_TARGET_PATH"
  | "TARGET_OUT_OF_SCOPE"
  | "INVALID_FORMAT_RANGE"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED";

export type CodeFormatError = {
  code: CodeFormatErrorCode;
  message: string;
  boundary: CodeFormatBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type CodeFormatPlan = {
  tool: "code.format";
  capability: "format-code";
  workspaceRoot: string;
  targetPath: string;
  languageHint?: string;
  formatterId: string;
  range?: CodeFormatRange;
  requiredPermission: "filesystem:readwrite";
  requiresTapApproval: true;
  dispatch: "dry-run";
  dryRun: true;
  wouldFormat: true;
  unsafeSideEffects: false;
  acceptedScopes: readonly string[];
  audit: {
    guard: "target-scope-and-formatter-selection";
    event: "basicTool.code.format.planned";
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type CodeFormatResult =
  | {
      ok: true;
      plan: CodeFormatPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: CodeFormatError;
      events: readonly string[];
    };

export const codeFormatDescriptor = {
  tool: "code.format",
  capability: "format-code",
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

function failure(code: CodeFormatErrorCode, message: string, boundary: CodeFormatBoundary): CodeFormatResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.code.format.rejected"],
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
): string[] | CodeFormatResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `code.format scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

function isValidRange(range: CodeFormatRange | undefined): boolean {
  return (
    range === undefined ||
    (Number.isInteger(range.startLine) &&
      Number.isInteger(range.endLine) &&
      range.startLine > 0 &&
      range.endLine >= range.startLine)
  );
}

export function planCodeFormat(request: CodeFormatRequest = {}): CodeFormatResult {
  if (isBlank(request.workspaceRoot)) {
    return failure("MISSING_WORKSPACE_ROOT", "code.format requires a workspaceRoot for scope auditing", "input");
  }

  if (isBlank(request.targetPath)) {
    return failure("MISSING_TARGET_PATH", "code.format requires a targetPath", "input");
  }

  const targetPath = normalizeRelativeTargetPath(request.targetPath ?? "");
  if (targetPath === undefined) {
    return failure("TARGET_OUT_OF_SCOPE", "code.format targetPath must stay inside the declared workspace scope", "scope");
  }

  if (!isValidRange(request.range)) {
    return failure("INVALID_FORMAT_RANGE", "code.format range must use positive startLine and endLine values", "input");
  }

  if (request.dryRun === false) {
    return failure("REAL_SIDE_EFFECT_NOT_ALLOWED", "first-round code.format only supports dry-run planning", "governance");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "code.format was rejected by runtime contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "code.format was rejected by runtime governance",
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
      tool: "code.format",
      capability: "format-code",
      workspaceRoot: request.workspaceRoot?.trim() ?? "",
      targetPath,
      languageHint: request.languageHint?.trim() || undefined,
      formatterId: request.formatterId?.trim() || "runtime-configured-formatter",
      range: request.range,
      requiredPermission: "filesystem:readwrite",
      requiresTapApproval: true,
      dispatch: "dry-run",
      dryRun: true,
      wouldFormat: true,
      unsafeSideEffects: false,
      acceptedScopes,
      audit: {
        guard: "target-scope-and-formatter-selection",
        event: "basicTool.code.format.planned",
        metadata: request.metadata ?? {},
      },
    },
    events: ["basicTool.code.format.planned"],
  };
}
