/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Git 基础工具 / 远端操作。
 * 核心目的：提供 Git 基础工具 / 远端操作 中的“抓取远端更新”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import path from "node:path";

export type FetchRemoteUpdatesBoundary = "input" | "contract" | "governance" | "scope";

export type FetchRemoteUpdatesGate = {
  accepted: boolean;
  reason?: string;
};

export type FetchRemoteTagsMode = "default" | "tags" | "no-tags";

export type FetchRemoteUpdatesRequest = {
  runtimeId?: string;
  invocationId?: string;
  repositoryPath?: string;
  remote?: string;
  refspecs?: readonly string[];
  prune?: boolean;
  tagsMode?: FetchRemoteTagsMode;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  contract?: FetchRemoteUpdatesGate;
  governance?: FetchRemoteUpdatesGate;
  metadata?: Readonly<Record<string, unknown>>;
};

export type FetchRemoteUpdatesErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_REPOSITORY_PATH"
  | "REPOSITORY_PATH_OUTSIDE_SCOPE"
  | "NUL_BYTE_IN_PATH"
  | "INVALID_REMOTE"
  | "INVALID_REFSPEC"
  | "INVALID_TAGS_MODE"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED";

export type FetchRemoteUpdatesError = {
  code: FetchRemoteUpdatesErrorCode;
  message: string;
  boundary: FetchRemoteUpdatesBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type FetchRemoteUpdatesPlan = {
  toolKind: "git.fetchRemoteUpdates";
  runtimeId: string;
  invocationId: string;
  repositoryPath: string;
  remote?: string;
  refspecs: readonly string[];
  prune: boolean;
  tagsMode: FetchRemoteTagsMode;
  commandPreview: readonly string[];
  requiredPermissions: readonly ["git:remote:read", "git:remote:write:dry-run", "network:egress:dry-run"];
  acceptedScopes: readonly string[];
  dispatch: "dry-run";
  dryRun: true;
  networkAccessBlocked: true;
  wouldContactRemote: true;
  wouldUpdateRemoteTrackingRefs: false;
  unsafeSideEffects: false;
  audit: {
    guard: "repo-scope-remote-and-network-audit";
    event: "basicTool.git.fetchRemoteUpdates.planned";
    governanceRequired: true;
    tapCanWrap: true;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type FetchRemoteUpdatesResult =
  | {
      ok: true;
      plan: FetchRemoteUpdatesPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: FetchRemoteUpdatesError;
      events: readonly string[];
    };

export const fetchRemoteUpdatesDescriptor = {
  toolKind: "git.fetchRemoteUpdates",
  capability: "fetch-remote-updates",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.remote",
  supportedTagsModes: ["default", "tags", "no-tags"],
  defaultTagsMode: "default",
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
  code: FetchRemoteUpdatesErrorCode,
  message: string,
  boundary: FetchRemoteUpdatesBoundary,
): FetchRemoteUpdatesResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.git.fetchRemoteUpdates.rejected"],
  };
}

function normalizeRepositoryPath(repositoryPath: string): string | FetchRemoteUpdatesResult {
  if (repositoryPath.includes("\0")) {
    return failure("NUL_BYTE_IN_PATH", "git.fetchRemoteUpdates repositoryPath cannot contain NUL bytes", "input");
  }

  const trimmed = repositoryPath.trim();
  if (path.isAbsolute(trimmed)) {
    return failure(
      "REPOSITORY_PATH_OUTSIDE_SCOPE",
      "git.fetchRemoteUpdates repositoryPath must be workspace-relative",
      "scope",
    );
  }

  const normalized = path.posix.normalize(trimmed.replaceAll("\\", "/"));
  if (normalized === ".." || normalized.startsWith("../")) {
    return failure(
      "REPOSITORY_PATH_OUTSIDE_SCOPE",
      "git.fetchRemoteUpdates repositoryPath must stay inside the workspace scope",
      "scope",
    );
  }

  return normalized === "." ? "." : normalized.replace(/\/$/, "");
}

function normalizeRemote(remote: string | undefined): string | undefined | FetchRemoteUpdatesResult {
  const value = remote?.trim();
  if (value === undefined || value.length === 0) {
    return undefined;
  }

  if (value.includes("\0") || /\s/.test(value) || value.startsWith("-")) {
    return failure("INVALID_REMOTE", "git.fetchRemoteUpdates remote must be a safe remote name or URL", "input");
  }

  return value;
}

function normalizeRefspecs(refspecs: readonly string[] | undefined): string[] | FetchRemoteUpdatesResult {
  const normalized: string[] = [];
  for (const refspec of cleanList(refspecs)) {
    if (refspec.includes("\0") || /\s/.test(refspec) || refspec.startsWith("-")) {
      return failure("INVALID_REFSPEC", "git.fetchRemoteUpdates refspecs must be safe strings without whitespace", "input");
    }

    normalized.push(refspec);
  }

  return [...new Set(normalized)];
}

function normalizeTagsMode(tagsMode: FetchRemoteTagsMode | undefined): FetchRemoteTagsMode | FetchRemoteUpdatesResult {
  const resolved = tagsMode ?? fetchRemoteUpdatesDescriptor.defaultTagsMode;
  if (!fetchRemoteUpdatesDescriptor.supportedTagsModes.includes(resolved)) {
    return failure("INVALID_TAGS_MODE", "git.fetchRemoteUpdates tagsMode is not supported", "input");
  }

  return resolved;
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | FetchRemoteUpdatesResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `git.fetchRemoteUpdates scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

function buildFetchCommand(plan: {
  repositoryPath: string;
  remote?: string;
  refspecs: readonly string[];
  prune: boolean;
  tagsMode: FetchRemoteTagsMode;
}): readonly string[] {
  const command = ["git", "-C", plan.repositoryPath, "fetch", "--dry-run"];

  if (plan.prune) {
    command.push("--prune");
  }

  if (plan.tagsMode === "tags") {
    command.push("--tags");
  } else if (plan.tagsMode === "no-tags") {
    command.push("--no-tags");
  }

  if (plan.remote !== undefined) {
    command.push(plan.remote);
  }

  command.push(...plan.refspecs);
  return command;
}

export function planFetchRemoteUpdates(
  request: FetchRemoteUpdatesRequest = {},
): FetchRemoteUpdatesResult {
  if (!hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "git.fetchRemoteUpdates requires runtimeId", "input");
  }

  if (!hasText(request.repositoryPath)) {
    return failure("MISSING_REPOSITORY_PATH", "git.fetchRemoteUpdates requires repositoryPath", "input");
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_SIDE_EFFECT_NOT_ALLOWED",
      "first-round git.fetchRemoteUpdates only creates a guarded dry-run fetch plan",
      "governance",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "git.fetchRemoteUpdates was rejected by runtime contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "git.fetchRemoteUpdates was rejected by runtime governance",
      "governance",
    );
  }

  const repositoryPath = normalizeRepositoryPath(request.repositoryPath);
  if (typeof repositoryPath !== "string") {
    return repositoryPath;
  }

  const remote = normalizeRemote(request.remote);
  if (remote !== undefined && typeof remote !== "string") {
    return remote;
  }

  const refspecs = normalizeRefspecs(request.refspecs);
  if (!Array.isArray(refspecs)) {
    return refspecs;
  }

  const tagsMode = normalizeTagsMode(request.tagsMode);
  if (typeof tagsMode !== "string") {
    return tagsMode;
  }

  const acceptedScopes = resolveScopes(request.requestedScopes, request.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  const runtimeId = request.runtimeId.trim();
  const planBase = {
    repositoryPath,
    remote,
    refspecs,
    prune: request.prune === true,
    tagsMode,
  };

  return {
    ok: true,
    plan: {
      toolKind: "git.fetchRemoteUpdates",
      runtimeId,
      invocationId: request.invocationId?.trim() || `${runtimeId}:git.fetchRemoteUpdates:${remote ?? "default"}`,
      ...planBase,
      commandPreview: buildFetchCommand(planBase),
      requiredPermissions: ["git:remote:read", "git:remote:write:dry-run", "network:egress:dry-run"],
      acceptedScopes,
      dispatch: "dry-run",
      dryRun: true,
      networkAccessBlocked: true,
      wouldContactRemote: true,
      wouldUpdateRemoteTrackingRefs: false,
      unsafeSideEffects: false,
      audit: {
        guard: "repo-scope-remote-and-network-audit",
        event: "basicTool.git.fetchRemoteUpdates.planned",
        governanceRequired: true,
        tapCanWrap: true,
        metadata: request.metadata ?? {},
      },
    },
    events: ["basicTool.git.fetchRemoteUpdates.planned"],
  };
}
