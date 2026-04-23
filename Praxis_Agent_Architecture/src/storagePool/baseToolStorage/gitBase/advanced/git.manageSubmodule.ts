/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Git 基础工具 / 高级 Git 操作。
 * 核心目的：提供 Git 基础工具 / 高级 Git 操作 中的“管理 Git 子模块”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import path from "node:path";

export type ManageSubmoduleBoundary = "input" | "contract" | "governance" | "scope";

export type ManageSubmoduleGate = {
  accepted: boolean;
  reason?: string;
};

export type ManageSubmoduleAction = "status" | "add" | "update" | "sync" | "deinit";

export type ManageSubmoduleRequest = {
  runtimeId?: string;
  invocationId?: string;
  repositoryPath?: string;
  action?: ManageSubmoduleAction;
  submodulePath?: string;
  remoteUrl?: string;
  branch?: string;
  recursive?: boolean;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  contract?: ManageSubmoduleGate;
  governance?: ManageSubmoduleGate;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ManageSubmoduleErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_REPOSITORY_PATH"
  | "REPOSITORY_PATH_OUTSIDE_SCOPE"
  | "NUL_BYTE_IN_PATH"
  | "MISSING_ACTION"
  | "INVALID_ACTION"
  | "MISSING_SUBMODULE_PATH"
  | "SUBMODULE_PATH_OUTSIDE_SCOPE"
  | "MISSING_REMOTE_URL"
  | "INVALID_REMOTE_URL"
  | "INVALID_BRANCH"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED";

export type ManageSubmoduleError = {
  code: ManageSubmoduleErrorCode;
  message: string;
  boundary: ManageSubmoduleBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type ManageSubmodulePlan = {
  toolKind: "git.manageSubmodule";
  runtimeId: string;
  invocationId: string;
  repositoryPath: string;
  action: ManageSubmoduleAction;
  submodulePath?: string;
  remoteUrl?: string;
  branch?: string;
  recursive: boolean;
  requiredPermissions: readonly ["git:submodule:read", "git:submodule:write:dry-run"];
  acceptedScopes: readonly string[];
  dispatch: "dry-run";
  dryRun: true;
  wouldModifyGitMetadata: boolean;
  unsafeSideEffects: false;
  audit: {
    guard: "repo-scope-and-submodule-audit";
    event: "basicTool.git.manageSubmodule.planned";
    governanceRequired: true;
    tapCanWrap: true;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type ManageSubmoduleResult =
  | {
      ok: true;
      plan: ManageSubmodulePlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: ManageSubmoduleError;
      events: readonly string[];
    };

export const manageSubmoduleDescriptor = {
  toolKind: "git.manageSubmodule",
  capability: "manage-git-submodule",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.advanced",
  supportedActions: ["status", "add", "update", "sync", "deinit"],
  defaultDispatch: "dry-run",
  requiresTapApproval: true,
  unsafeSideEffects: false,
} as const;

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: ManageSubmoduleErrorCode,
  message: string,
  boundary: ManageSubmoduleBoundary,
): ManageSubmoduleResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.git.manageSubmodule.rejected"],
  };
}

function normalizeRelativePath(
  value: string,
  outsideCode: "REPOSITORY_PATH_OUTSIDE_SCOPE" | "SUBMODULE_PATH_OUTSIDE_SCOPE",
): string | ManageSubmoduleResult {
  if (value.includes("\0")) {
    return failure("NUL_BYTE_IN_PATH", "git.manageSubmodule paths cannot contain NUL bytes", "input");
  }

  const trimmed = value.trim();
  if (path.isAbsolute(trimmed)) {
    return failure(outsideCode, "git.manageSubmodule paths must be workspace-relative", "scope");
  }

  const normalized = path.posix.normalize(trimmed.replaceAll("\\", "/"));
  if (normalized === ".." || normalized.startsWith("../")) {
    return failure(outsideCode, "git.manageSubmodule paths must stay inside the workspace scope", "scope");
  }

  return normalized === "." ? "." : normalized.replace(/\/$/, "");
}

function normalizeAction(action: ManageSubmoduleAction | undefined): ManageSubmoduleAction | ManageSubmoduleResult {
  if (!hasText(action)) {
    return failure("MISSING_ACTION", "git.manageSubmodule requires an action", "input");
  }

  if (!manageSubmoduleDescriptor.supportedActions.includes(action)) {
    return failure("INVALID_ACTION", "git.manageSubmodule action is not supported", "input");
  }

  return action;
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | ManageSubmoduleResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `git.manageSubmodule scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

export function planManageSubmodule(request: ManageSubmoduleRequest = {}): ManageSubmoduleResult {
  if (!hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "git.manageSubmodule requires runtimeId", "input");
  }

  if (!hasText(request.repositoryPath)) {
    return failure("MISSING_REPOSITORY_PATH", "git.manageSubmodule requires repositoryPath", "input");
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_SIDE_EFFECT_NOT_ALLOWED",
      "first-round git.manageSubmodule only creates a dry-run submodule plan",
      "governance",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "git.manageSubmodule was rejected by runtime contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "git.manageSubmodule was rejected by runtime governance",
      "governance",
    );
  }

  const repositoryPath = normalizeRelativePath(request.repositoryPath, "REPOSITORY_PATH_OUTSIDE_SCOPE");
  if (typeof repositoryPath !== "string") {
    return repositoryPath;
  }

  const action = normalizeAction(request.action);
  if (typeof action !== "string") {
    return action;
  }

  let submodulePath: string | undefined;
  if (action !== "status" || hasText(request.submodulePath)) {
    if (!hasText(request.submodulePath)) {
      return failure("MISSING_SUBMODULE_PATH", `git.manageSubmodule ${action} requires submodulePath`, "input");
    }

    const normalizedSubmodulePath = normalizeRelativePath(request.submodulePath, "SUBMODULE_PATH_OUTSIDE_SCOPE");
    if (typeof normalizedSubmodulePath !== "string") {
      return normalizedSubmodulePath;
    }

    submodulePath = normalizedSubmodulePath;
  }

  const remoteUrl = request.remoteUrl?.trim() || undefined;
  if (action === "add" && remoteUrl === undefined) {
    return failure("MISSING_REMOTE_URL", "git.manageSubmodule add requires remoteUrl", "input");
  }

  if (remoteUrl?.includes("\0") === true) {
    return failure("INVALID_REMOTE_URL", "git.manageSubmodule remoteUrl must be a safe string", "input");
  }

  const branch = request.branch?.trim() || undefined;
  if (branch?.includes("\0") === true || branch?.includes(" ") === true) {
    return failure("INVALID_BRANCH", "git.manageSubmodule branch must be a safe ref-like string", "input");
  }

  const acceptedScopes = resolveScopes(request.requestedScopes, request.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  const runtimeId = request.runtimeId.trim();

  return {
    ok: true,
    plan: {
      toolKind: "git.manageSubmodule",
      runtimeId,
      invocationId: request.invocationId?.trim() || `${runtimeId}:git.manageSubmodule:${action}`,
      repositoryPath,
      action,
      submodulePath,
      remoteUrl,
      branch,
      recursive: request.recursive ?? true,
      requiredPermissions: ["git:submodule:read", "git:submodule:write:dry-run"],
      acceptedScopes,
      dispatch: "dry-run",
      dryRun: true,
      wouldModifyGitMetadata: action !== "status",
      unsafeSideEffects: false,
      audit: {
        guard: "repo-scope-and-submodule-audit",
        event: "basicTool.git.manageSubmodule.planned",
        governanceRequired: true,
        tapCanWrap: true,
        metadata: request.metadata ?? {},
      },
    },
    events: ["basicTool.git.manageSubmodule.planned"],
  };
}
