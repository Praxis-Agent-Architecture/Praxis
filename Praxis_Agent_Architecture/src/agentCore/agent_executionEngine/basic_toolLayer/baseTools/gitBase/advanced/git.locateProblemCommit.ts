/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Git 基础工具 / 高级 Git 操作。
 * 核心目的：提供 Git 基础工具 / 高级 Git 操作 中的“定位问题提交”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import path from "node:path";

export type LocateProblemCommitBoundary = "input" | "contract" | "governance" | "scope" | "resource";

export type LocateProblemCommitGate = {
  accepted: boolean;
  reason?: string;
};

export type LocateProblemCommitRequest = {
  runtimeId?: string;
  invocationId?: string;
  repositoryPath?: string;
  knownGoodRef?: string;
  knownBadRef?: string;
  verificationCommand?: string;
  maxSteps?: number;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  contract?: LocateProblemCommitGate;
  governance?: LocateProblemCommitGate;
  metadata?: Readonly<Record<string, unknown>>;
};

export type LocateProblemCommitErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_REPOSITORY_PATH"
  | "REPOSITORY_PATH_OUTSIDE_SCOPE"
  | "NUL_BYTE_IN_PATH"
  | "MISSING_KNOWN_GOOD_REF"
  | "MISSING_KNOWN_BAD_REF"
  | "INVALID_REF"
  | "REFS_MUST_DIFFER"
  | "INVALID_VERIFICATION_COMMAND"
  | "INVALID_MAX_STEPS"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED";

export type LocateProblemCommitError = {
  code: LocateProblemCommitErrorCode;
  message: string;
  boundary: LocateProblemCommitBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type LocateProblemCommitPlan = {
  toolKind: "git.locateProblemCommit";
  runtimeId: string;
  invocationId: string;
  repositoryPath: string;
  knownGoodRef: string;
  knownBadRef: string;
  verificationCommand?: string;
  maxSteps: number;
  strategy: "bisect-plan";
  requiredPermissions: readonly ["git:history:read", "git:bisect:dry-run", "shell:execute:dry-run"];
  acceptedScopes: readonly string[];
  dispatch: "dry-run";
  dryRun: true;
  wouldRunGitBisect: false;
  wouldExecuteVerificationCommand: false;
  unsafeSideEffects: false;
  audit: {
    guard: "repo-scope-and-bisect-command-audit";
    event: "basicTool.git.locateProblemCommit.planned";
    governanceRequired: true;
    tapCanWrap: true;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type LocateProblemCommitResult =
  | {
      ok: true;
      plan: LocateProblemCommitPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: LocateProblemCommitError;
      events: readonly string[];
    };

export const locateProblemCommitDescriptor = {
  toolKind: "git.locateProblemCommit",
  capability: "locate-problem-commit",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.advanced",
  defaultDispatch: "dry-run",
  defaultMaxSteps: 64,
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
  code: LocateProblemCommitErrorCode,
  message: string,
  boundary: LocateProblemCommitBoundary,
): LocateProblemCommitResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.git.locateProblemCommit.rejected"],
  };
}

function normalizeRelativePath(value: string): string | LocateProblemCommitResult {
  if (value.includes("\0")) {
    return failure("NUL_BYTE_IN_PATH", "git.locateProblemCommit repositoryPath cannot contain NUL bytes", "input");
  }

  const trimmed = value.trim();
  if (path.isAbsolute(trimmed)) {
    return failure(
      "REPOSITORY_PATH_OUTSIDE_SCOPE",
      "git.locateProblemCommit repositoryPath must be workspace-relative",
      "scope",
    );
  }

  const normalized = path.posix.normalize(trimmed.replaceAll("\\", "/"));
  if (normalized === ".." || normalized.startsWith("../")) {
    return failure(
      "REPOSITORY_PATH_OUTSIDE_SCOPE",
      "git.locateProblemCommit repositoryPath must stay inside the workspace scope",
      "scope",
    );
  }

  return normalized === "." ? "." : normalized.replace(/\/$/, "");
}

function normalizeRef(value: string | undefined, missingCode: LocateProblemCommitErrorCode): string | LocateProblemCommitResult {
  if (!hasText(value)) {
    return failure(
      missingCode,
      missingCode === "MISSING_KNOWN_GOOD_REF"
        ? "git.locateProblemCommit requires knownGoodRef"
        : "git.locateProblemCommit requires knownBadRef",
      "input",
    );
  }

  const ref = value.trim();
  if (ref.includes("\0") || /\s/.test(ref)) {
    return failure("INVALID_REF", "git.locateProblemCommit refs must be non-empty git ref strings without whitespace", "input");
  }

  return ref;
}

function normalizeMaxSteps(maxSteps: number | undefined): number | LocateProblemCommitResult {
  const resolved = maxSteps ?? locateProblemCommitDescriptor.defaultMaxSteps;
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > 1024) {
    return failure("INVALID_MAX_STEPS", "git.locateProblemCommit maxSteps must be an integer between 1 and 1024", "resource");
  }

  return resolved;
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | LocateProblemCommitResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `git.locateProblemCommit scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

export function planLocateProblemCommit(request: LocateProblemCommitRequest = {}): LocateProblemCommitResult {
  if (!hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "git.locateProblemCommit requires runtimeId", "input");
  }

  if (!hasText(request.repositoryPath)) {
    return failure("MISSING_REPOSITORY_PATH", "git.locateProblemCommit requires repositoryPath", "input");
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_SIDE_EFFECT_NOT_ALLOWED",
      "first-round git.locateProblemCommit only creates a dry-run bisect plan",
      "governance",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "git.locateProblemCommit was rejected by runtime contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "git.locateProblemCommit was rejected by runtime governance",
      "governance",
    );
  }

  const repositoryPath = normalizeRelativePath(request.repositoryPath);
  if (typeof repositoryPath !== "string") {
    return repositoryPath;
  }

  const knownGoodRef = normalizeRef(request.knownGoodRef, "MISSING_KNOWN_GOOD_REF");
  if (typeof knownGoodRef !== "string") {
    return knownGoodRef;
  }

  const knownBadRef = normalizeRef(request.knownBadRef, "MISSING_KNOWN_BAD_REF");
  if (typeof knownBadRef !== "string") {
    return knownBadRef;
  }

  if (knownGoodRef === knownBadRef) {
    return failure("REFS_MUST_DIFFER", "git.locateProblemCommit knownGoodRef and knownBadRef must differ", "input");
  }

  const verificationCommand = request.verificationCommand?.trim() || undefined;
  if (verificationCommand?.includes("\0") === true) {
    return failure(
      "INVALID_VERIFICATION_COMMAND",
      "git.locateProblemCommit verificationCommand must be a safe string",
      "input",
    );
  }

  const maxSteps = normalizeMaxSteps(request.maxSteps);
  if (typeof maxSteps !== "number") {
    return maxSteps;
  }

  const acceptedScopes = resolveScopes(request.requestedScopes, request.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  const runtimeId = request.runtimeId.trim();

  return {
    ok: true,
    plan: {
      toolKind: "git.locateProblemCommit",
      runtimeId,
      invocationId: request.invocationId?.trim() || `${runtimeId}:git.locateProblemCommit:${knownBadRef}`,
      repositoryPath,
      knownGoodRef,
      knownBadRef,
      verificationCommand,
      maxSteps,
      strategy: "bisect-plan",
      requiredPermissions: ["git:history:read", "git:bisect:dry-run", "shell:execute:dry-run"],
      acceptedScopes,
      dispatch: "dry-run",
      dryRun: true,
      wouldRunGitBisect: false,
      wouldExecuteVerificationCommand: false,
      unsafeSideEffects: false,
      audit: {
        guard: "repo-scope-and-bisect-command-audit",
        event: "basicTool.git.locateProblemCommit.planned",
        governanceRequired: true,
        tapCanWrap: true,
        metadata: request.metadata ?? {},
      },
    },
    events: ["basicTool.git.locateProblemCommit.planned"],
  };
}
