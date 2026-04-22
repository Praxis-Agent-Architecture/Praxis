/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Git 基础工具 / Git 检查。
 * 核心目的：提供 Git 基础工具 / Git 检查 中的“展示 Git 对象细节”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import path from "node:path";

export type ShowGitObjectDetailsBoundary = "input" | "contract" | "governance" | "scope";

export type ShowGitObjectDetailsGate = {
  accepted: boolean;
  reason?: string;
};

export type GitObjectDetailsFormat = "summary" | "patch" | "raw";

export type ShowGitObjectDetailsRequest = {
  runtimeId?: string;
  invocationId?: string;
  repositoryPath?: string;
  objectRef?: string;
  format?: GitObjectDetailsFormat;
  maxBytes?: number;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  contract?: ShowGitObjectDetailsGate;
  governance?: ShowGitObjectDetailsGate;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ShowGitObjectDetailsErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_REPOSITORY_PATH"
  | "REPOSITORY_PATH_OUTSIDE_SCOPE"
  | "NUL_BYTE_IN_PATH"
  | "MISSING_OBJECT_REF"
  | "INVALID_OBJECT_REF"
  | "INVALID_DETAILS_FORMAT"
  | "INVALID_MAX_BYTES"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED";

export type ShowGitObjectDetailsError = {
  code: ShowGitObjectDetailsErrorCode;
  message: string;
  boundary: ShowGitObjectDetailsBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type ShowGitObjectDetailsPlan = {
  toolKind: "git.showGitObjectDetails";
  runtimeId: string;
  invocationId: string;
  repositoryPath: string;
  objectRef: string;
  format: GitObjectDetailsFormat;
  maxBytes: number;
  commandPreview: readonly string[];
  requiredPermissions: readonly ["git:object:read"];
  acceptedScopes: readonly string[];
  dispatch: "dry-run";
  dryRun: true;
  wouldReadGitObject: true;
  unsafeSideEffects: false;
  audit: {
    guard: "repo-scope-and-object-ref-audit";
    event: "basicTool.git.showGitObjectDetails.planned";
    governanceRequired: true;
    tapCanWrap: true;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type ShowGitObjectDetailsResult =
  | {
      ok: true;
      plan: ShowGitObjectDetailsPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: ShowGitObjectDetailsError;
      events: readonly string[];
    };

export const showGitObjectDetailsDescriptor = {
  toolKind: "git.showGitObjectDetails",
  capability: "show-git-object-details",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.inspection",
  supportedFormats: ["summary", "patch", "raw"],
  defaultFormat: "summary",
  defaultMaxBytes: 128_000,
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
  code: ShowGitObjectDetailsErrorCode,
  message: string,
  boundary: ShowGitObjectDetailsBoundary,
): ShowGitObjectDetailsResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.git.showGitObjectDetails.rejected"],
  };
}

function normalizeRepositoryPath(repositoryPath: string): string | ShowGitObjectDetailsResult {
  if (repositoryPath.includes("\0")) {
    return failure("NUL_BYTE_IN_PATH", "git.showGitObjectDetails repositoryPath cannot contain NUL bytes", "input");
  }

  const trimmed = repositoryPath.trim();
  if (path.isAbsolute(trimmed)) {
    return failure(
      "REPOSITORY_PATH_OUTSIDE_SCOPE",
      "git.showGitObjectDetails repositoryPath must be workspace-relative",
      "scope",
    );
  }

  const normalized = path.posix.normalize(trimmed.replaceAll("\\", "/"));
  if (normalized === ".." || normalized.startsWith("../")) {
    return failure(
      "REPOSITORY_PATH_OUTSIDE_SCOPE",
      "git.showGitObjectDetails repositoryPath must stay inside the workspace scope",
      "scope",
    );
  }

  return normalized === "." ? "." : normalized.replace(/\/$/, "");
}

function normalizeObjectRef(objectRef: string | undefined): string | ShowGitObjectDetailsResult {
  if (!hasText(objectRef)) {
    return failure("MISSING_OBJECT_REF", "git.showGitObjectDetails requires objectRef", "input");
  }

  const ref = objectRef.trim();
  if (ref.includes("\0") || /\s/.test(ref) || ref.startsWith("-")) {
    return failure("INVALID_OBJECT_REF", "git.showGitObjectDetails objectRef must be a safe git object reference", "input");
  }

  return ref;
}

function normalizeFormat(format: GitObjectDetailsFormat | undefined): GitObjectDetailsFormat | ShowGitObjectDetailsResult {
  const resolved = format ?? showGitObjectDetailsDescriptor.defaultFormat;
  if (!showGitObjectDetailsDescriptor.supportedFormats.includes(resolved)) {
    return failure("INVALID_DETAILS_FORMAT", "git.showGitObjectDetails format is not supported", "input");
  }

  return resolved;
}

function normalizeMaxBytes(maxBytes: number | undefined): number | ShowGitObjectDetailsResult {
  const resolved = maxBytes ?? showGitObjectDetailsDescriptor.defaultMaxBytes;
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > 10_000_000) {
    return failure("INVALID_MAX_BYTES", "git.showGitObjectDetails maxBytes must be an integer from 1 to 10000000", "input");
  }

  return resolved;
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | ShowGitObjectDetailsResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `git.showGitObjectDetails scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

function buildShowCommand(repositoryPath: string, objectRef: string, format: GitObjectDetailsFormat): readonly string[] {
  const command = ["git", "-C", repositoryPath, "show", "--no-ext-diff"];

  if (format === "summary") {
    command.push("--stat", "--decorate");
  } else if (format === "raw") {
    command.push("--no-patch", "--pretty=raw");
  } else {
    command.push("--patch");
  }

  command.push(objectRef);
  return command;
}

export function planShowGitObjectDetails(
  request: ShowGitObjectDetailsRequest = {},
): ShowGitObjectDetailsResult {
  if (!hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "git.showGitObjectDetails requires runtimeId", "input");
  }

  if (!hasText(request.repositoryPath)) {
    return failure("MISSING_REPOSITORY_PATH", "git.showGitObjectDetails requires repositoryPath", "input");
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_SIDE_EFFECT_NOT_ALLOWED",
      "first-round git.showGitObjectDetails only creates a guarded dry-run object inspection plan",
      "governance",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "git.showGitObjectDetails was rejected by runtime contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "git.showGitObjectDetails was rejected by runtime governance",
      "governance",
    );
  }

  const repositoryPath = normalizeRepositoryPath(request.repositoryPath);
  if (typeof repositoryPath !== "string") {
    return repositoryPath;
  }

  const objectRef = normalizeObjectRef(request.objectRef);
  if (typeof objectRef !== "string") {
    return objectRef;
  }

  const format = normalizeFormat(request.format);
  if (typeof format !== "string") {
    return format;
  }

  const maxBytes = normalizeMaxBytes(request.maxBytes);
  if (typeof maxBytes !== "number") {
    return maxBytes;
  }

  const acceptedScopes = resolveScopes(request.requestedScopes, request.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  const runtimeId = request.runtimeId.trim();

  return {
    ok: true,
    plan: {
      toolKind: "git.showGitObjectDetails",
      runtimeId,
      invocationId: request.invocationId?.trim() || `${runtimeId}:git.showGitObjectDetails:${objectRef}`,
      repositoryPath,
      objectRef,
      format,
      maxBytes,
      commandPreview: buildShowCommand(repositoryPath, objectRef, format),
      requiredPermissions: ["git:object:read"],
      acceptedScopes,
      dispatch: "dry-run",
      dryRun: true,
      wouldReadGitObject: true,
      unsafeSideEffects: false,
      audit: {
        guard: "repo-scope-and-object-ref-audit",
        event: "basicTool.git.showGitObjectDetails.planned",
        governanceRequired: true,
        tapCanWrap: true,
        metadata: request.metadata ?? {},
      },
    },
    events: ["basicTool.git.showGitObjectDetails.planned"],
  };
}
