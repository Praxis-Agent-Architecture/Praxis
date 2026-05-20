/*
 * git.getCommitHistory storage core.
 * Owns the fixed git-log contract and delegates host execution to BaseToolExecutorPort.git.runGit.
 */

export type GitGetCommitHistoryPermission = "git:read" | "filesystem:read";

export type GitCommitHistoryGuard = {
  allowed?: boolean;
  accepted?: boolean;
  reason?: string;
};

export type GitGetCommitHistoryContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: GitCommitHistoryGuard;
  allowedRepositoryRoots?: readonly string[];
  grantedPermissions?: readonly GitGetCommitHistoryPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type GitGetCommitHistoryTarget = {
  repositoryPath: string;
  maxCount: number;
  ref?: string;
  pathFilter?: string;
};

export type GitGetCommitHistoryRequest = {
  target?: Partial<GitGetCommitHistoryTarget>;
  context?: GitGetCommitHistoryContext;
  provider?: GitCommitHistoryProvider;
  timeoutMs?: number;
  metadata?: Readonly<Record<string, unknown>>;
};

export type GitCommitHistoryEntryEnvelope = {
  fullHash: string;
  shortHash: string;
  authorName: string;
  authorEmail: string;
  authoredAt: string;
  subject: string;
};

export type GitCommitHistoryRuntimeEntry = {
  owner: "runtime";
  port: "BaseToolExecutorPort.git.runGit";
  method: "runGit";
  binary: "git";
  argvMode: "fixed-log-read";
  allowedSubcommand: "log";
};

export type GitCommitHistoryRisk = {
  category: "read-only-inspection";
  riskLevel: "normal";
  mutatesRepository: false;
  mutatesWorkingTree: false;
  spawnsProcess: true;
  requiresTapApproval: true;
  runtimeOwnsExecution: true;
};

export type GitCommitHistoryEnvelope = {
  parser: "git-log-unit-separator-v1";
  entries: readonly GitCommitHistoryEntryEnvelope[];
};

export type GitGetCommitHistoryOutput = {
  kind: "agentCore.basicTool.git.getCommitHistory";
  target: GitGetCommitHistoryTarget;
  runtimeEntry: GitCommitHistoryRuntimeEntry;
  risk: GitCommitHistoryRisk;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  timeoutMs: number;
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  permissionsRequired: readonly GitGetCommitHistoryPermission[];
  unsafeSideEffects: false;
  resultEnvelope: GitCommitHistoryEnvelope;
};

export type GitGetCommitHistoryPlan = {
  toolId: "git.getCommitHistory";
  capability: "get-commit-history";
  runtimeId: string;
  invocationId: string;
  repositoryPath: string;
  maxCount: number;
  ref?: string;
  pathFilter?: string;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  requiredPermissions: readonly GitGetCommitHistoryPermission[];
  runtimeEntry: GitCommitHistoryRuntimeEntry;
  risk: GitCommitHistoryRisk;
  dispatch: "dry-run" | "runtime-git-executor";
  dryRun: boolean;
  unsafeSideEffects: false;
  outputEnvelope: { stdoutPreview: ""; stderrPreview: ""; parsed: false };
  audit: {
    guard: "git-log-runtime-guard";
    event: "basicTool.git.getCommitHistory.planned";
    governanceRequired: true;
    tapCanWrap: true;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type GitGetCommitHistoryErrorBoundary = "input" | "scope" | "permission" | "governance" | "provider";
export type GitGetCommitHistoryErrorCode =
  | "MISSING_REPOSITORY_PATH"
  | "INVALID_ARGUMENT"
  | "INVALID_CONTEXT"
  | "INVALID_MAX_COUNT"
  | "UNSAFE_REF"
  | "UNSAFE_PATH_FILTER"
  | "INVALID_TIMEOUT"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type GitGetCommitHistoryError = {
  code: GitGetCommitHistoryErrorCode;
  message: string;
  boundary: GitGetCommitHistoryErrorBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type GitGetCommitHistoryAuditEvent = {
  type: string;
  toolId: "git.getCommitHistory";
  invocationId: string;
  dryRun: boolean;
  repositoryPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type GitGetCommitHistoryResult =
  | {
      ok: true;
      toolId: "git.getCommitHistory";
      output: GitGetCommitHistoryOutput;
      plan: GitGetCommitHistoryPlan;
      audit: readonly GitGetCommitHistoryAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "git.getCommitHistory";
      error: GitGetCommitHistoryError;
      audit: readonly GitGetCommitHistoryAuditEvent[];
      events: readonly string[];
    };

export type GitCommitHistoryProviderRequest = {
  repositoryPath: string;
  args: readonly string[];
  timeoutMs?: number;
};

export type GitCommitHistoryProviderResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type GitCommitHistoryProvider = (
  request: GitCommitHistoryProviderRequest,
  context: GitGetCommitHistoryContext,
) => GitCommitHistoryProviderResult | Promise<GitCommitHistoryProviderResult>;

type NormalizedRequest = {
  target: GitGetCommitHistoryTarget;
  context: GitGetCommitHistoryContext;
  timeoutMs?: number;
};

export const gitGetCommitHistoryDescriptor = {
  toolId: "git.getCommitHistory",
  capability: "get-commit-history",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.inspection",
  defaultDryRun: true,
  tapOwnsApproval: true,
  requiresTapApproval: true,
  runtimeEntryPort: "BaseToolExecutorPort.git.runGit",
  operationRisk: "read-only-inspection",
  permissionsRequired: ["git:read", "filesystem:read"],
  defaultMaxCount: 20,
  maxAllowedCount: 200,
  defaultTimeoutMs: 30_000,
  maxTimeoutMs: 600_000,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function stringArrayValue(value: unknown): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return undefined;
  return value;
}

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: GitGetCommitHistoryContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: GitGetCommitHistoryContext | undefined): string {
  return stringValue(context?.invocationId)?.trim() || "git.getCommitHistory:dry-run";
}

function runtimeId(context: GitGetCommitHistoryContext | undefined): string {
  return stringValue(context?.runtimeId)?.trim() || "runtime.unspecified";
}

function auditEvent(
  type: string,
  context: GitGetCommitHistoryContext | undefined,
  repositoryPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): GitGetCommitHistoryAuditEvent {
  return {
    type,
    toolId: "git.getCommitHistory",
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    repositoryPath,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: GitGetCommitHistoryErrorCode,
  message: string,
  boundary: GitGetCommitHistoryErrorBoundary,
  context: GitGetCommitHistoryContext | undefined,
  repositoryPath?: string,
): GitGetCommitHistoryResult {
  return {
    ok: false,
    toolId: "git.getCommitHistory",
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.git.getCommitHistory.rejected", context, repositoryPath, { code })],
    events: ["basicTool.git.getCommitHistory.rejected"],
  };
}

function normalizeContext(rawContext: unknown): GitGetCommitHistoryContext | GitGetCommitHistoryResult {
  if (rawContext === undefined) return {};
  if (!isRecord(rawContext)) {
    return failure("INVALID_CONTEXT", "git.getCommitHistory context must be an object", "input", undefined);
  }
  const guard = rawContext.guard;
  if (guard !== undefined && !isRecord(guard)) {
    return failure("INVALID_CONTEXT", "git.getCommitHistory context.guard must be an object", "input", undefined);
  }
  const allowedRepositoryRoots = stringArrayValue(rawContext.allowedRepositoryRoots);
  if (rawContext.allowedRepositoryRoots !== undefined && allowedRepositoryRoots === undefined) {
    return failure("INVALID_CONTEXT", "git.getCommitHistory context.allowedRepositoryRoots must be a string array", "input", undefined);
  }
  const grantedPermissions = stringArrayValue(rawContext.grantedPermissions);
  if (rawContext.grantedPermissions !== undefined && grantedPermissions === undefined) {
    return failure("INVALID_CONTEXT", "git.getCommitHistory context.grantedPermissions must be a string array", "input", undefined);
  }
  const auditMetadata = isRecord(rawContext.auditMetadata) ? rawContext.auditMetadata : undefined;
  if (rawContext.auditMetadata !== undefined && auditMetadata === undefined) {
    return failure("INVALID_CONTEXT", "git.getCommitHistory context.auditMetadata must be an object", "input", undefined);
  }
  return {
    runtimeId: stringValue(rawContext.runtimeId),
    sessionId: stringValue(rawContext.sessionId),
    invocationId: stringValue(rawContext.invocationId),
    dryRun: booleanValue(rawContext.dryRun),
    guard:
      guard === undefined
        ? undefined
        : {
            allowed: booleanValue(guard.allowed),
            accepted: booleanValue(guard.accepted),
            reason: stringValue(guard.reason),
          },
    allowedRepositoryRoots,
    grantedPermissions: grantedPermissions as readonly GitGetCommitHistoryPermission[] | undefined,
    auditMetadata,
  };
}

function normalizeRepositoryPath(value: unknown, context: GitGetCommitHistoryContext | undefined): string | GitGetCommitHistoryResult {
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_REPOSITORY_PATH", "git.getCommitHistory requires target.repositoryPath", "input", context);
  }
  if (normalized.includes("\0")) {
    return failure("INVALID_ARGUMENT", "git.getCommitHistory repositoryPath cannot contain NUL bytes", "input", context, normalized);
  }
  return normalized;
}

function normalizeMaxCount(value: unknown, context: GitGetCommitHistoryContext, repositoryPath: string): number | GitGetCommitHistoryResult {
  const normalized = value ?? gitGetCommitHistoryDescriptor.defaultMaxCount;
  if (
    typeof normalized !== "number" ||
    !Number.isInteger(normalized) ||
    normalized < 1 ||
    normalized > gitGetCommitHistoryDescriptor.maxAllowedCount
  ) {
    return failure(
      "INVALID_MAX_COUNT",
      `git.getCommitHistory target.maxCount must be an integer from 1 to ${gitGetCommitHistoryDescriptor.maxAllowedCount}`,
      "input",
      context,
      repositoryPath,
    );
  }
  return normalized;
}

function normalizePathFilter(value: unknown, context: GitGetCommitHistoryContext, repositoryPath: string): string | undefined | GitGetCommitHistoryResult {
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) return undefined;
  const path = normalized.replaceAll("\\", "/");
  if (path.includes("\0") || path.startsWith("/") || /^[A-Za-z]:\//u.test(path) || path.split("/").filter(Boolean).includes("..")) {
    return failure("UNSAFE_PATH_FILTER", "git.getCommitHistory target.pathFilter must stay relative to the repository root", "scope", context, repositoryPath);
  }
  return path.replace(/\/+$/u, "");
}

function normalizeRef(value: unknown, context: GitGetCommitHistoryContext, repositoryPath: string): string | undefined | GitGetCommitHistoryResult {
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) return undefined;
  if (normalized.includes("\0") || /\s/u.test(normalized) || normalized.startsWith("-")) {
    return failure("UNSAFE_REF", "git.getCommitHistory target.ref must be a safe revision or ref name", "scope", context, repositoryPath);
  }
  return normalized;
}

function normalizeTimeout(value: unknown, context: GitGetCommitHistoryContext, repositoryPath: string): number | undefined | GitGetCommitHistoryResult {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > gitGetCommitHistoryDescriptor.maxTimeoutMs) {
    return failure("INVALID_TIMEOUT", `git.getCommitHistory timeoutMs must be an integer from 1 to ${gitGetCommitHistoryDescriptor.maxTimeoutMs}`, "input", context, repositoryPath);
  }
  return value;
}

function normalizeRequest(request: unknown): NormalizedRequest | GitGetCommitHistoryResult {
  if (request !== undefined && !isRecord(request)) {
    return failure("INVALID_ARGUMENT", "git.getCommitHistory request must be an object", "input", undefined);
  }
  const requestRecord = isRecord(request) ? request : {};
  const context = normalizeContext(requestRecord.context);
  if ("ok" in context) return context;
  const targetRecord = isRecord(requestRecord.target) ? requestRecord.target : {};
  if (requestRecord.target !== undefined && !isRecord(requestRecord.target)) {
    return failure("INVALID_ARGUMENT", "git.getCommitHistory target must be an object", "input", context);
  }
  const repositoryPath = normalizeRepositoryPath(targetRecord.repositoryPath, context);
  if (typeof repositoryPath !== "string") return repositoryPath;
  const maxCount = normalizeMaxCount(targetRecord.maxCount, context, repositoryPath);
  if (typeof maxCount !== "number") return maxCount;
  const ref = normalizeRef(targetRecord.ref, context, repositoryPath);
  if (ref !== undefined && typeof ref !== "string") return ref;
  const pathFilter = normalizePathFilter(targetRecord.pathFilter, context, repositoryPath);
  if (pathFilter !== undefined && typeof pathFilter !== "string") return pathFilter;
  const timeoutMs = normalizeTimeout(requestRecord.timeoutMs, context, repositoryPath);
  if (timeoutMs !== undefined && typeof timeoutMs !== "number") return timeoutMs;
  return { target: { repositoryPath, maxCount, ref, pathFilter }, context, timeoutMs };
}

function normalizeAllowedRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/u, "");
}

function ensureScope(repositoryPath: string, context: GitGetCommitHistoryContext | undefined): GitGetCommitHistoryResult | undefined {
  const allowedRoots = cleanList(context?.allowedRepositoryRoots).map(normalizeAllowedRoot);
  if (allowedRoots.length === 0) return undefined;
  const allowed = allowedRoots.some((root) => repositoryPath === root || repositoryPath.startsWith(`${root}/`));
  return allowed
    ? undefined
    : failure("SCOPE_REJECTED", "git.getCommitHistory target repository is outside the allowed repository roots", "scope", context, repositoryPath);
}

function ensurePermissions(repositoryPath: string, context: GitGetCommitHistoryContext | undefined): GitGetCommitHistoryResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) return undefined;
  const missing = gitGetCommitHistoryDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  return missing.length === 0
    ? undefined
    : failure("PERMISSION_DENIED", `git.getCommitHistory is missing permissions: ${missing.join(", ")}`, "permission", context, repositoryPath);
}

function ensureGovernance(repositoryPath: string, context: GitGetCommitHistoryContext): GitGetCommitHistoryResult | undefined {
  if (dryRunEnabled(context)) return undefined;
  if (context.guard?.allowed === true || context.guard?.accepted === true) return undefined;
  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "git.getCommitHistory requires an affirmative runtime guard for real execution",
    "governance",
    context,
    repositoryPath,
  );
}

function providerArgs(target: GitGetCommitHistoryTarget): readonly string[] {
  return [
    "log",
    "--format=%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%s",
    "--max-count",
    String(target.maxCount),
    ...(target.ref === undefined ? [] : [target.ref]),
    ...(target.pathFilter === undefined ? [] : ["--", target.pathFilter]),
  ];
}

function commandPreview(target: GitGetCommitHistoryTarget): readonly string[] {
  return ["git", "-C", target.repositoryPath, ...providerArgs(target)];
}

const runtimeEntry: GitCommitHistoryRuntimeEntry = {
  owner: "runtime",
  port: "BaseToolExecutorPort.git.runGit",
  method: "runGit",
  binary: "git",
  argvMode: "fixed-log-read",
  allowedSubcommand: "log",
};

const risk: GitCommitHistoryRisk = {
  category: "read-only-inspection",
  riskLevel: "normal",
  mutatesRepository: false,
  mutatesWorkingTree: false,
  spawnsProcess: true,
  requiresTapApproval: true,
  runtimeOwnsExecution: true,
};

function plan(normalized: NormalizedRequest, dispatch: GitGetCommitHistoryPlan["dispatch"], dryRun: boolean): GitGetCommitHistoryPlan {
  return {
    toolId: "git.getCommitHistory",
    capability: "get-commit-history",
    runtimeId: runtimeId(normalized.context),
    invocationId: invocationId(normalized.context),
    repositoryPath: normalized.target.repositoryPath,
    maxCount: normalized.target.maxCount,
    ref: normalized.target.ref,
    pathFilter: normalized.target.pathFilter,
    gitArgs: providerArgs(normalized.target),
    commandPreview: commandPreview(normalized.target),
    requiredPermissions: gitGetCommitHistoryDescriptor.permissionsRequired,
    runtimeEntry,
    risk,
    dispatch,
    dryRun,
    unsafeSideEffects: false,
    outputEnvelope: { stdoutPreview: "", stderrPreview: "", parsed: false },
    audit: {
      guard: "git-log-runtime-guard",
      event: "basicTool.git.getCommitHistory.planned",
      governanceRequired: true,
      tapCanWrap: true,
      metadata: normalized.context.auditMetadata ?? {},
    },
  };
}

export function parseGitCommitHistory(stdout: string): GitCommitHistoryEnvelope {
  const entries: GitCommitHistoryEntryEnvelope[] = [];
  for (const line of stdout.split(/\r?\n/u)) {
    if (line.trim().length === 0) continue;
    const [fullHash, shortHash, authorName, authorEmail, authoredAt, ...subjectParts] = line.split("\x1f");
    if (!fullHash || !shortHash) continue;
    entries.push({
      fullHash,
      shortHash,
      authorName: authorName ?? "",
      authorEmail: authorEmail ?? "",
      authoredAt: authoredAt ?? "",
      subject: subjectParts.join("\x1f"),
    });
  }
  return { parser: "git-log-unit-separator-v1", entries };
}

function success(normalized: NormalizedRequest, dryRun: boolean, providerResult?: GitCommitHistoryProviderResult): GitGetCommitHistoryResult {
  const executionPlan = plan(normalized, dryRun ? "dry-run" : "runtime-git-executor", dryRun);
  return {
    ok: true,
    toolId: "git.getCommitHistory",
    plan: executionPlan,
    output: {
      kind: "agentCore.basicTool.git.getCommitHistory",
      target: normalized.target,
      runtimeEntry,
      risk,
      gitArgs: executionPlan.gitArgs,
      commandPreview: executionPlan.commandPreview,
      timeoutMs: normalized.timeoutMs ?? gitGetCommitHistoryDescriptor.defaultTimeoutMs,
      dryRun,
      executionBlocked: dryRun,
      providerCalled: providerResult !== undefined,
      exitCode: providerResult?.exitCode,
      stdout: providerResult?.stdout,
      stderr: providerResult?.stderr,
      permissionsRequired: gitGetCommitHistoryDescriptor.permissionsRequired,
      unsafeSideEffects: false,
      resultEnvelope: parseGitCommitHistory(providerResult?.stdout ?? ""),
    },
    audit: [
      auditEvent(
        dryRun ? "agentCore.basicTool.git.getCommitHistory.dryRun" : "agentCore.basicTool.git.getCommitHistory.executed",
        normalized.context,
        normalized.target.repositoryPath,
        { maxCount: normalized.target.maxCount, exitCode: providerResult?.exitCode },
      ),
    ],
    events: [dryRun ? "basicTool.git.getCommitHistory.dryRun" : "basicTool.git.getCommitHistory.executed"],
  };
}

export function planGitCommitHistoryRead(request: GitGetCommitHistoryRequest = {}): GitGetCommitHistoryResult {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const scopeFailure = ensureScope(normalized.target.repositoryPath, normalized.context);
  if (scopeFailure !== undefined) return scopeFailure;
  const permissionFailure = ensurePermissions(normalized.target.repositoryPath, normalized.context);
  if (permissionFailure !== undefined) return permissionFailure;
  return success(normalized, true);
}

export async function executeGitCommitHistory(request: GitGetCommitHistoryRequest = {}): Promise<GitGetCommitHistoryResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const scopeFailure = ensureScope(normalized.target.repositoryPath, normalized.context);
  if (scopeFailure !== undefined) return scopeFailure;
  const permissionFailure = ensurePermissions(normalized.target.repositoryPath, normalized.context);
  if (permissionFailure !== undefined) return permissionFailure;
  const governanceFailure = ensureGovernance(normalized.target.repositoryPath, normalized.context);
  if (governanceFailure !== undefined) return governanceFailure;
  if (dryRunEnabled(normalized.context)) return success(normalized, true);
  if (request.provider === undefined) {
    return failure(
      "PROVIDER_UNAVAILABLE",
      "git.getCommitHistory requires runtime.execEngine.git.runGit for real execution",
      "provider",
      normalized.context,
      normalized.target.repositoryPath,
    );
  }
  try {
    const providerResult = await request.provider(
      { repositoryPath: normalized.target.repositoryPath, args: providerArgs(normalized.target), timeoutMs: normalized.timeoutMs },
      normalized.context,
    );
    return success(normalized, false, providerResult);
  } catch {
    return failure("PROVIDER_REJECTED", "git.getCommitHistory provider failed", "provider", normalized.context, normalized.target.repositoryPath);
  }
}
