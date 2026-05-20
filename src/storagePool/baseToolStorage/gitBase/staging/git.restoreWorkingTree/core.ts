/*
 * git.restoreWorkingTree storage core.
 * Owns the fixed git-restore worktree mutation contract and delegates host execution to BaseToolExecutorPort.git.runGit.
 */

export type GitRestoreWorkingTreePermission = "git:read" | "git:write" | "filesystem:read" | "filesystem:write";

export type GitRestoreWorkingTreeGuard = {
  allowed?: boolean;
  accepted?: boolean;
  reason?: string;
};

export type GitRestoreWorkingTreeContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: GitRestoreWorkingTreeGuard;
  allowedRepositoryRoots?: readonly string[];
  grantedPermissions?: readonly GitRestoreWorkingTreePermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type GitRestoreWorkingTreeTarget = {
  repositoryPath: string;
  paths: readonly string[];
  sourceRef?: string;
};

export type GitRestoreWorkingTreeRequest = {
  target?: Partial<GitRestoreWorkingTreeTarget>;
  context?: GitRestoreWorkingTreeContext;
  provider?: GitRestoreWorkingTreeProvider;
  timeoutMs?: number;
  metadata?: Readonly<Record<string, unknown>>;
  runtimeId?: string;
  invocationId?: string;
  repositoryPath?: string;
  paths?: readonly string[];
  sourceRef?: string;
  dryRun?: boolean;
};

export type GitRestoreWorkingTreeRuntimeEntry = {
  owner: "runtime";
  port: "BaseToolExecutorPort.git.runGit";
  method: "runGit";
  binary: "git";
  argvMode: "fixed-restore-worktree-mutation";
  allowedSubcommand: "restore";
};

export type GitRestoreWorkingTreeRisk = {
  category: "workspace-mutation";
  riskLevel: "risky";
  mutatesRepository: true;
  mutatesWorkingTree: true;
  mutatesIndex: false;
  spawnsProcess: true;
  requiresTapApproval: true;
  runtimeOwnsExecution: true;
};

export type GitRestoreWorkingTreeEnvelope = {
  parser: "git-restore-exit-v1";
  paths: readonly string[];
  sourceRef?: string;
  exitCode?: number;
  stdoutLineCount: number;
  stderrLineCount: number;
};

export type GitRestoreWorkingTreeOutput = {
  kind: "agentCore.basicTool.git.restoreWorkingTree";
  target: GitRestoreWorkingTreeTarget;
  runtimeEntry: GitRestoreWorkingTreeRuntimeEntry;
  risk: GitRestoreWorkingTreeRisk;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  timeoutMs: number;
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  permissionsRequired: readonly GitRestoreWorkingTreePermission[];
  unsafeSideEffects: true;
  resultEnvelope: GitRestoreWorkingTreeEnvelope;
};

export type GitRestoreWorkingTreePlan = {
  toolId: "git.restoreWorkingTree";
  toolKind: "git.restoreWorkingTree";
  capability: "restore-working-tree";
  runtimeId: string;
  invocationId: string;
  repositoryPath: string;
  paths: readonly string[];
  sourceRef?: string;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  requiredPermissions: readonly GitRestoreWorkingTreePermission[];
  runtimeEntry: GitRestoreWorkingTreeRuntimeEntry;
  risk: GitRestoreWorkingTreeRisk;
  dispatch: "dry-run" | "runtime-git-executor";
  dryRun: boolean;
  wouldMutateWorkingTree: true;
  unsafeSideEffects: true;
  outputEnvelope: { stdoutPreview: ""; stderrPreview: ""; parsed: false };
  audit: {
    guard: "git-restore-runtime-guard";
    event: "basicTool.git.restoreWorkingTree.planned";
    governanceRequired: true;
    tapCanWrap: true;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type GitRestoreWorkingTreeErrorBoundary = "input" | "scope" | "permission" | "governance" | "provider";
export type GitRestoreWorkingTreeErrorCode =
  | "MISSING_REPOSITORY_PATH"
  | "MISSING_TARGET_PATH"
  | "INVALID_ARGUMENT"
  | "INVALID_CONTEXT"
  | "INVALID_PATH"
  | "PATH_OUTSIDE_SCOPE"
  | "INVALID_SOURCE_REF"
  | "INVALID_TIMEOUT"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type GitRestoreWorkingTreeError = {
  code: GitRestoreWorkingTreeErrorCode;
  message: string;
  boundary: GitRestoreWorkingTreeErrorBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type GitRestoreWorkingTreeAuditEvent = {
  type: string;
  toolId: "git.restoreWorkingTree";
  invocationId: string;
  dryRun: boolean;
  repositoryPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type GitRestoreWorkingTreeResult =
  | {
      ok: true;
      toolId: "git.restoreWorkingTree";
      output: GitRestoreWorkingTreeOutput;
      plan: GitRestoreWorkingTreePlan;
      audit: readonly GitRestoreWorkingTreeAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "git.restoreWorkingTree";
      error: GitRestoreWorkingTreeError;
      audit: readonly GitRestoreWorkingTreeAuditEvent[];
      events: readonly string[];
    };

export type GitRestoreWorkingTreeProviderRequest = {
  repositoryPath: string;
  args: readonly string[];
  timeoutMs?: number;
};

export type GitRestoreWorkingTreeProviderResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type GitRestoreWorkingTreeProvider = (
  request: GitRestoreWorkingTreeProviderRequest,
  context: GitRestoreWorkingTreeContext,
) => GitRestoreWorkingTreeProviderResult | Promise<GitRestoreWorkingTreeProviderResult>;

type NormalizedRequest = {
  target: GitRestoreWorkingTreeTarget;
  context: GitRestoreWorkingTreeContext;
  timeoutMs?: number;
};

export const gitRestoreWorkingTreeDescriptor = {
  toolId: "git.restoreWorkingTree",
  toolKind: "git.restoreWorkingTree",
  capability: "restore-working-tree",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.staging",
  defaultDryRun: true,
  defaultDispatch: "dry-run",
  tapOwnsApproval: true,
  requiresTapApproval: true,
  runtimeEntryPort: "BaseToolExecutorPort.git.runGit",
  operationRisk: "workspace-mutation",
  permissionsRequired: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
  defaultTimeoutMs: 30_000,
  maxTimeoutMs: 600_000,
  unsafeSideEffects: true,
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

function dryRunEnabled(context: GitRestoreWorkingTreeContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: GitRestoreWorkingTreeContext | undefined): string {
  return stringValue(context?.invocationId)?.trim() || "git.restoreWorkingTree:dry-run";
}

function runtimeId(context: GitRestoreWorkingTreeContext | undefined): string {
  return stringValue(context?.runtimeId)?.trim() || "runtime.unspecified";
}

function auditEvent(
  type: string,
  context: GitRestoreWorkingTreeContext | undefined,
  repositoryPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): GitRestoreWorkingTreeAuditEvent {
  return {
    type,
    toolId: gitRestoreWorkingTreeDescriptor.toolId,
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
  code: GitRestoreWorkingTreeErrorCode,
  message: string,
  boundary: GitRestoreWorkingTreeErrorBoundary,
  context: GitRestoreWorkingTreeContext | undefined,
  repositoryPath?: string,
): GitRestoreWorkingTreeResult {
  return {
    ok: false,
    toolId: gitRestoreWorkingTreeDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.git.restoreWorkingTree.rejected", context, repositoryPath, { code })],
    events: ["basicTool.git.restoreWorkingTree.rejected"],
  };
}

function normalizeContext(
  rawContext: unknown,
  legacyRequest: Record<string, unknown>,
): GitRestoreWorkingTreeContext | GitRestoreWorkingTreeResult {
  const contextRecord = rawContext === undefined ? {} : rawContext;
  if (!isRecord(contextRecord)) {
    return failure("INVALID_CONTEXT", "git.restoreWorkingTree context must be an object", "input", undefined);
  }
  const guard = contextRecord.guard;
  if (guard !== undefined && !isRecord(guard)) {
    return failure("INVALID_CONTEXT", "git.restoreWorkingTree context.guard must be an object", "input", undefined);
  }
  const allowedRepositoryRoots = stringArrayValue(contextRecord.allowedRepositoryRoots);
  if (contextRecord.allowedRepositoryRoots !== undefined && allowedRepositoryRoots === undefined) {
    return failure("INVALID_CONTEXT", "git.restoreWorkingTree context.allowedRepositoryRoots must be a string array", "input", undefined);
  }
  const grantedPermissions = stringArrayValue(contextRecord.grantedPermissions);
  if (contextRecord.grantedPermissions !== undefined && grantedPermissions === undefined) {
    return failure("INVALID_CONTEXT", "git.restoreWorkingTree context.grantedPermissions must be a string array", "input", undefined);
  }
  const auditMetadata = isRecord(contextRecord.auditMetadata) ? contextRecord.auditMetadata : undefined;
  if (contextRecord.auditMetadata !== undefined && auditMetadata === undefined) {
    return failure("INVALID_CONTEXT", "git.restoreWorkingTree context.auditMetadata must be an object", "input", undefined);
  }
  return {
    runtimeId: stringValue(contextRecord.runtimeId) ?? stringValue(legacyRequest.runtimeId),
    sessionId: stringValue(contextRecord.sessionId),
    invocationId: stringValue(contextRecord.invocationId) ?? stringValue(legacyRequest.invocationId),
    dryRun: booleanValue(contextRecord.dryRun) ?? booleanValue(legacyRequest.dryRun),
    guard:
      guard === undefined
        ? undefined
        : {
            allowed: booleanValue(guard.allowed),
            accepted: booleanValue(guard.accepted),
            reason: stringValue(guard.reason),
          },
    allowedRepositoryRoots,
    grantedPermissions: grantedPermissions as readonly GitRestoreWorkingTreePermission[] | undefined,
    auditMetadata,
  };
}

function normalizeRepositoryPath(
  value: unknown,
  context: GitRestoreWorkingTreeContext | undefined,
): string | GitRestoreWorkingTreeResult {
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_REPOSITORY_PATH", "git.restoreWorkingTree requires target.repositoryPath", "input", context);
  }
  if (normalized.includes("\0")) {
    return failure("INVALID_ARGUMENT", "git.restoreWorkingTree repositoryPath cannot contain NUL bytes", "input", context, normalized);
  }
  return normalized;
}

function normalizePath(value: string, context: GitRestoreWorkingTreeContext, repositoryPath: string): string | GitRestoreWorkingTreeResult {
  const normalized = value.trim().replaceAll("\\", "/");
  if (normalized.length === 0) return "";
  if (normalized.includes("\0") || normalized.startsWith("/") || /^[A-Za-z]:\//u.test(normalized)) {
    return failure("PATH_OUTSIDE_SCOPE", "git.restoreWorkingTree target.paths must be repository-relative paths", "scope", context, repositoryPath);
  }
  const parts = normalized.split("/").filter(Boolean);
  if (parts.includes("..")) {
    return failure("PATH_OUTSIDE_SCOPE", "git.restoreWorkingTree target.paths must stay inside the repository", "scope", context, repositoryPath);
  }
  return normalized.replace(/\/+$/u, "");
}

function normalizePaths(value: unknown, context: GitRestoreWorkingTreeContext, repositoryPath: string): readonly string[] | GitRestoreWorkingTreeResult {
  const raw = stringArrayValue(value);
  if (value !== undefined && raw === undefined) {
    return failure("INVALID_PATH", "git.restoreWorkingTree target.paths must be a string array", "input", context, repositoryPath);
  }
  const normalized: string[] = [];
  for (const item of cleanList(raw)) {
    const path = normalizePath(item, context, repositoryPath);
    if (typeof path !== "string") return path;
    if (path.length > 0) normalized.push(path);
  }
  return [...new Set(normalized)];
}

function normalizeSourceRef(value: unknown, context: GitRestoreWorkingTreeContext, repositoryPath: string): string | undefined | GitRestoreWorkingTreeResult {
  if (value === undefined) return undefined;
  const ref = stringValue(value)?.trim() ?? "";
  if (ref.length === 0) return undefined;
  if (ref.includes("\0") || /\s/u.test(ref) || ref.startsWith("-")) {
    return failure("INVALID_SOURCE_REF", "git.restoreWorkingTree target.sourceRef must be a safe git revision", "input", context, repositoryPath);
  }
  return ref;
}

function normalizeTimeout(
  value: unknown,
  context: GitRestoreWorkingTreeContext,
  repositoryPath: string,
): number | undefined | GitRestoreWorkingTreeResult {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > gitRestoreWorkingTreeDescriptor.maxTimeoutMs) {
    return failure(
      "INVALID_TIMEOUT",
      `git.restoreWorkingTree timeoutMs must be an integer from 1 to ${gitRestoreWorkingTreeDescriptor.maxTimeoutMs}`,
      "input",
      context,
      repositoryPath,
    );
  }
  return value;
}

function normalizeRequest(request: unknown): NormalizedRequest | GitRestoreWorkingTreeResult {
  if (request !== undefined && !isRecord(request)) {
    return failure("INVALID_ARGUMENT", "git.restoreWorkingTree request must be an object", "input", undefined);
  }
  const requestRecord = isRecord(request) ? request : {};
  const context = normalizeContext(requestRecord.context, requestRecord);
  if ("ok" in context) return context;
  const targetRecord = isRecord(requestRecord.target) ? requestRecord.target : requestRecord;
  if (requestRecord.target !== undefined && !isRecord(requestRecord.target)) {
    return failure("INVALID_ARGUMENT", "git.restoreWorkingTree target must be an object", "input", context);
  }
  const repositoryPath = normalizeRepositoryPath(targetRecord.repositoryPath, context);
  if (typeof repositoryPath !== "string") return repositoryPath;
  const paths = normalizePaths(targetRecord.paths, context, repositoryPath);
  if ("ok" in paths) return paths;
  if (paths.length === 0) {
    return failure("MISSING_TARGET_PATH", "git.restoreWorkingTree requires at least one target path", "input", context, repositoryPath);
  }
  const sourceRef = normalizeSourceRef(targetRecord.sourceRef, context, repositoryPath);
  if (sourceRef !== undefined && typeof sourceRef !== "string") return sourceRef;
  const timeoutMs = normalizeTimeout(requestRecord.timeoutMs, context, repositoryPath);
  if (timeoutMs !== undefined && typeof timeoutMs !== "number") return timeoutMs;
  return { target: { repositoryPath, paths, sourceRef }, context, timeoutMs };
}

function normalizeAllowedRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/u, "");
}

function ensureScope(repositoryPath: string, context: GitRestoreWorkingTreeContext | undefined): GitRestoreWorkingTreeResult | undefined {
  const allowedRoots = cleanList(context?.allowedRepositoryRoots).map(normalizeAllowedRoot);
  if (allowedRoots.length === 0) return undefined;
  const allowed = allowedRoots.some((root) => repositoryPath === root || repositoryPath.startsWith(`${root}/`));
  return allowed
    ? undefined
    : failure("SCOPE_REJECTED", "git.restoreWorkingTree target repository is outside the allowed repository roots", "scope", context, repositoryPath);
}

function ensurePermissions(repositoryPath: string, context: GitRestoreWorkingTreeContext | undefined): GitRestoreWorkingTreeResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) return undefined;
  const missing = gitRestoreWorkingTreeDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  return missing.length === 0
    ? undefined
    : failure("PERMISSION_DENIED", `git.restoreWorkingTree is missing permissions: ${missing.join(", ")}`, "permission", context, repositoryPath);
}

function ensureGovernance(repositoryPath: string, context: GitRestoreWorkingTreeContext): GitRestoreWorkingTreeResult | undefined {
  if (dryRunEnabled(context)) return undefined;
  if (context.guard?.allowed === true || context.guard?.accepted === true) return undefined;
  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "git.restoreWorkingTree requires an affirmative runtime guard for real execution",
    "governance",
    context,
    repositoryPath,
  );
}

function providerArgs(target: GitRestoreWorkingTreeTarget): readonly string[] {
  return [
    "restore",
    ...(target.sourceRef === undefined ? [] : ["--source", target.sourceRef]),
    "--worktree",
    "--",
    ...target.paths,
  ];
}

function commandPreview(target: GitRestoreWorkingTreeTarget): readonly string[] {
  return ["git", "-C", target.repositoryPath, ...providerArgs(target)];
}

const runtimeEntry: GitRestoreWorkingTreeRuntimeEntry = {
  owner: "runtime",
  port: "BaseToolExecutorPort.git.runGit",
  method: "runGit",
  binary: "git",
  argvMode: "fixed-restore-worktree-mutation",
  allowedSubcommand: "restore",
};

const risk: GitRestoreWorkingTreeRisk = {
  category: "workspace-mutation",
  riskLevel: "risky",
  mutatesRepository: true,
  mutatesWorkingTree: true,
  mutatesIndex: false,
  spawnsProcess: true,
  requiresTapApproval: true,
  runtimeOwnsExecution: true,
};

function plan(normalized: NormalizedRequest, dispatch: GitRestoreWorkingTreePlan["dispatch"], dryRun: boolean): GitRestoreWorkingTreePlan {
  return {
    toolId: "git.restoreWorkingTree",
    toolKind: "git.restoreWorkingTree",
    capability: "restore-working-tree",
    runtimeId: runtimeId(normalized.context),
    invocationId: invocationId(normalized.context),
    repositoryPath: normalized.target.repositoryPath,
    paths: normalized.target.paths,
    sourceRef: normalized.target.sourceRef,
    gitArgs: providerArgs(normalized.target),
    commandPreview: commandPreview(normalized.target),
    requiredPermissions: gitRestoreWorkingTreeDescriptor.permissionsRequired,
    runtimeEntry,
    risk,
    dispatch,
    dryRun,
    wouldMutateWorkingTree: true,
    unsafeSideEffects: true,
    outputEnvelope: { stdoutPreview: "", stderrPreview: "", parsed: false },
    audit: {
      guard: "git-restore-runtime-guard",
      event: "basicTool.git.restoreWorkingTree.planned",
      governanceRequired: true,
      tapCanWrap: true,
      metadata: normalized.context.auditMetadata ?? {},
    },
  };
}

function lineCount(text: string): number {
  if (text.length === 0) return 0;
  return text.split(/\r?\n/u).length;
}

export function parseGitRestoreWorkingTreeResult(
  providerResult: GitRestoreWorkingTreeProviderResult | undefined,
  target: GitRestoreWorkingTreeTarget,
): GitRestoreWorkingTreeEnvelope {
  return {
    parser: "git-restore-exit-v1",
    paths: target.paths,
    sourceRef: target.sourceRef,
    exitCode: providerResult?.exitCode,
    stdoutLineCount: lineCount(providerResult?.stdout ?? ""),
    stderrLineCount: lineCount(providerResult?.stderr ?? ""),
  };
}

function success(
  normalized: NormalizedRequest,
  dryRun: boolean,
  providerResult?: GitRestoreWorkingTreeProviderResult,
): GitRestoreWorkingTreeResult {
  const executionPlan = plan(normalized, dryRun ? "dry-run" : "runtime-git-executor", dryRun);
  return {
    ok: true,
    toolId: "git.restoreWorkingTree",
    plan: executionPlan,
    output: {
      kind: "agentCore.basicTool.git.restoreWorkingTree",
      target: normalized.target,
      runtimeEntry,
      risk,
      gitArgs: executionPlan.gitArgs,
      commandPreview: executionPlan.commandPreview,
      timeoutMs: normalized.timeoutMs ?? gitRestoreWorkingTreeDescriptor.defaultTimeoutMs,
      dryRun,
      executionBlocked: dryRun,
      providerCalled: providerResult !== undefined,
      exitCode: providerResult?.exitCode,
      stdout: providerResult?.stdout,
      stderr: providerResult?.stderr,
      permissionsRequired: gitRestoreWorkingTreeDescriptor.permissionsRequired,
      unsafeSideEffects: true,
      resultEnvelope: parseGitRestoreWorkingTreeResult(providerResult, normalized.target),
    },
    audit: [
      auditEvent(
        dryRun ? "agentCore.basicTool.git.restoreWorkingTree.dryRun" : "agentCore.basicTool.git.restoreWorkingTree.executed",
        normalized.context,
        normalized.target.repositoryPath,
        {
          pathCount: normalized.target.paths.length,
          sourceRef: normalized.target.sourceRef,
          exitCode: providerResult?.exitCode,
        },
      ),
    ],
    events: [dryRun ? "basicTool.git.restoreWorkingTree.dryRun" : "basicTool.git.restoreWorkingTree.executed"],
  };
}

export function planGitRestoreWorkingTree(request: GitRestoreWorkingTreeRequest = {}): GitRestoreWorkingTreeResult {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const scopeFailure = ensureScope(normalized.target.repositoryPath, normalized.context);
  if (scopeFailure !== undefined) return scopeFailure;
  const permissionFailure = ensurePermissions(normalized.target.repositoryPath, normalized.context);
  if (permissionFailure !== undefined) return permissionFailure;
  return success(normalized, true);
}

export async function executeGitRestoreWorkingTree(
  request: GitRestoreWorkingTreeRequest = {},
): Promise<GitRestoreWorkingTreeResult> {
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
      "git.restoreWorkingTree requires runtime.execEngine.git.runGit for real execution",
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
    return failure(
      "PROVIDER_REJECTED",
      "git.restoreWorkingTree provider failed",
      "provider",
      normalized.context,
      normalized.target.repositoryPath,
    );
  }
}
