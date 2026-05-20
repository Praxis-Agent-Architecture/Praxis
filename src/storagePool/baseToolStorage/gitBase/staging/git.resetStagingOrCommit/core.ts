/*
 * git.resetStagingOrCommit storage core.
 * Owns fixed git-reset staging/history mutation contracts and delegates host execution to BaseToolExecutorPort.git.runGit.
 */

export type GitResetStagingOrCommitPermission = "git:read" | "git:write" | "filesystem:read" | "filesystem:write";

export type GitResetStagingOrCommitGuard = {
  allowed?: boolean;
  accepted?: boolean;
  reason?: string;
};

export type GitResetStagingOrCommitContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: GitResetStagingOrCommitGuard;
  allowedRepositoryRoots?: readonly string[];
  grantedPermissions?: readonly GitResetStagingOrCommitPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type GitResetStagingOrCommitAction = "staging" | "commit";

export type GitResetCommitMode = "soft" | "mixed" | "hard" | "merge" | "keep";

export type GitResetStagingOrCommitTarget = {
  repositoryPath: string;
  action: GitResetStagingOrCommitAction;
  pathspecs: readonly string[];
  targetRef?: string;
  mode?: GitResetCommitMode;
};

export type GitResetStagingOrCommitRequest = {
  target?: Partial<GitResetStagingOrCommitTarget>;
  context?: GitResetStagingOrCommitContext;
  provider?: GitResetStagingOrCommitProvider;
  timeoutMs?: number;
  metadata?: Readonly<Record<string, unknown>>;
  runtimeId?: string;
  invocationId?: string;
  repositoryPath?: string;
  action?: GitResetStagingOrCommitAction;
  pathspecs?: readonly string[];
  targetRef?: string;
  mode?: GitResetCommitMode;
  dryRun?: boolean;
};

export type GitResetStagingOrCommitRuntimeEntry = {
  owner: "runtime";
  port: "BaseToolExecutorPort.git.runGit";
  method: "runGit";
  binary: "git";
  argvMode: "fixed-reset-staging-or-commit-mutation";
  allowedSubcommand: "reset";
};

export type GitResetStagingOrCommitRisk = {
  category: "workspace-mutation" | "history-mutation" | "destructive";
  riskLevel: "risky" | "dangerous";
  mutatesRepository: true;
  mutatesWorkingTree: boolean;
  mutatesIndex: true;
  spawnsProcess: true;
  requiresTapApproval: true;
  runtimeOwnsExecution: true;
};

export type GitResetStagingOrCommitEnvelope = {
  parser: "git-reset-exit-v1";
  action: GitResetStagingOrCommitAction;
  pathspecs: readonly string[];
  targetRef?: string;
  mode?: GitResetCommitMode;
  exitCode?: number;
  stdoutLineCount: number;
  stderrLineCount: number;
};

export type GitResetStagingOrCommitOutput = {
  kind: "agentCore.basicTool.git.resetStagingOrCommit";
  target: GitResetStagingOrCommitTarget;
  runtimeEntry: GitResetStagingOrCommitRuntimeEntry;
  risk: GitResetStagingOrCommitRisk;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  timeoutMs: number;
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  permissionsRequired: readonly GitResetStagingOrCommitPermission[];
  unsafeSideEffects: true;
  resultEnvelope: GitResetStagingOrCommitEnvelope;
};

export type GitResetStagingOrCommitPlan = {
  toolId: "git.resetStagingOrCommit";
  toolKind: "git.resetStagingOrCommit";
  capability: "reset-staging-or-commit";
  runtimeId: string;
  invocationId: string;
  repositoryPath: string;
  action: GitResetStagingOrCommitAction;
  pathspecs: readonly string[];
  targetRef?: string;
  mode?: GitResetCommitMode;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  requiredPermissions: readonly GitResetStagingOrCommitPermission[];
  runtimeEntry: GitResetStagingOrCommitRuntimeEntry;
  risk: GitResetStagingOrCommitRisk;
  dispatch: "dry-run" | "runtime-git-executor";
  dryRun: boolean;
  wouldMutateIndex: true;
  wouldMutateWorkingTree: boolean;
  unsafeSideEffects: true;
  outputEnvelope: { stdoutPreview: ""; stderrPreview: ""; parsed: false };
  audit: {
    guard: "git-reset-runtime-guard";
    event: "basicTool.git.resetStagingOrCommit.planned";
    governanceRequired: true;
    tapCanWrap: true;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type GitResetStagingOrCommitErrorBoundary = "input" | "scope" | "permission" | "governance" | "provider";
export type GitResetStagingOrCommitErrorCode =
  | "MISSING_REPOSITORY_PATH"
  | "MISSING_REQUIRED_FIELD"
  | "MISSING_TARGET_REF"
  | "INVALID_ARGUMENT"
  | "INVALID_CONTEXT"
  | "INVALID_ACTION"
  | "INVALID_MODE"
  | "INVALID_TARGET_REF"
  | "INVALID_PATHSPEC"
  | "PATHSPEC_OUTSIDE_SCOPE"
  | "INVALID_TIMEOUT"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type GitResetStagingOrCommitError = {
  code: GitResetStagingOrCommitErrorCode;
  message: string;
  boundary: GitResetStagingOrCommitErrorBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type GitResetStagingOrCommitAuditEvent = {
  type: string;
  toolId: "git.resetStagingOrCommit";
  invocationId: string;
  dryRun: boolean;
  repositoryPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type GitResetStagingOrCommitResult =
  | {
      ok: true;
      toolId: "git.resetStagingOrCommit";
      output: GitResetStagingOrCommitOutput;
      plan: GitResetStagingOrCommitPlan;
      audit: readonly GitResetStagingOrCommitAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "git.resetStagingOrCommit";
      error: GitResetStagingOrCommitError;
      audit: readonly GitResetStagingOrCommitAuditEvent[];
      events: readonly string[];
    };

export type GitResetStagingOrCommitProviderRequest = {
  repositoryPath: string;
  args: readonly string[];
  timeoutMs?: number;
};

export type GitResetStagingOrCommitProviderResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type GitResetStagingOrCommitProvider = (
  request: GitResetStagingOrCommitProviderRequest,
  context: GitResetStagingOrCommitContext,
) => GitResetStagingOrCommitProviderResult | Promise<GitResetStagingOrCommitProviderResult>;

type NormalizedRequest = {
  target: GitResetStagingOrCommitTarget;
  context: GitResetStagingOrCommitContext;
  timeoutMs?: number;
};

export const gitResetStagingOrCommitDescriptor = {
  toolId: "git.resetStagingOrCommit",
  toolKind: "git.resetStagingOrCommit",
  capability: "reset-staging-or-commit",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.staging",
  defaultDryRun: true,
  defaultDispatch: "dry-run",
  tapOwnsApproval: true,
  requiresTapApproval: true,
  runtimeEntryPort: "BaseToolExecutorPort.git.runGit",
  operationRisk: "workspace-mutation-or-history-mutation",
  permissionsRequired: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
  defaultTimeoutMs: 30_000,
  maxTimeoutMs: 600_000,
  unsafeSideEffects: true,
} as const;

const resetModes = new Set(["soft", "mixed", "hard", "merge", "keep"]);

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

function dryRunEnabled(context: GitResetStagingOrCommitContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: GitResetStagingOrCommitContext | undefined): string {
  return stringValue(context?.invocationId)?.trim() || "git.resetStagingOrCommit:dry-run";
}

function runtimeId(context: GitResetStagingOrCommitContext | undefined): string {
  return stringValue(context?.runtimeId)?.trim() || "runtime.unspecified";
}

function auditEvent(
  type: string,
  context: GitResetStagingOrCommitContext | undefined,
  repositoryPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): GitResetStagingOrCommitAuditEvent {
  return {
    type,
    toolId: gitResetStagingOrCommitDescriptor.toolId,
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
  code: GitResetStagingOrCommitErrorCode,
  message: string,
  boundary: GitResetStagingOrCommitErrorBoundary,
  context: GitResetStagingOrCommitContext | undefined,
  repositoryPath?: string,
): GitResetStagingOrCommitResult {
  return {
    ok: false,
    toolId: gitResetStagingOrCommitDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.git.resetStagingOrCommit.rejected", context, repositoryPath, { code })],
    events: ["basicTool.git.resetStagingOrCommit.rejected"],
  };
}

function normalizeContext(
  rawContext: unknown,
  legacyRequest: Record<string, unknown>,
): GitResetStagingOrCommitContext | GitResetStagingOrCommitResult {
  const contextRecord = rawContext === undefined ? {} : rawContext;
  if (!isRecord(contextRecord)) {
    return failure("INVALID_CONTEXT", "git.resetStagingOrCommit context must be an object", "input", undefined);
  }
  const guard = contextRecord.guard;
  if (guard !== undefined && !isRecord(guard)) {
    return failure("INVALID_CONTEXT", "git.resetStagingOrCommit context.guard must be an object", "input", undefined);
  }
  const allowedRepositoryRoots = stringArrayValue(contextRecord.allowedRepositoryRoots);
  if (contextRecord.allowedRepositoryRoots !== undefined && allowedRepositoryRoots === undefined) {
    return failure("INVALID_CONTEXT", "git.resetStagingOrCommit context.allowedRepositoryRoots must be a string array", "input", undefined);
  }
  const grantedPermissions = stringArrayValue(contextRecord.grantedPermissions);
  if (contextRecord.grantedPermissions !== undefined && grantedPermissions === undefined) {
    return failure("INVALID_CONTEXT", "git.resetStagingOrCommit context.grantedPermissions must be a string array", "input", undefined);
  }
  const auditMetadata = isRecord(contextRecord.auditMetadata) ? contextRecord.auditMetadata : undefined;
  if (contextRecord.auditMetadata !== undefined && auditMetadata === undefined) {
    return failure("INVALID_CONTEXT", "git.resetStagingOrCommit context.auditMetadata must be an object", "input", undefined);
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
    grantedPermissions: grantedPermissions as readonly GitResetStagingOrCommitPermission[] | undefined,
    auditMetadata,
  };
}

function normalizeRepositoryPath(
  value: unknown,
  context: GitResetStagingOrCommitContext | undefined,
): string | GitResetStagingOrCommitResult {
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_REPOSITORY_PATH", "git.resetStagingOrCommit requires target.repositoryPath", "input", context);
  }
  if (normalized.includes("\0")) {
    return failure("INVALID_ARGUMENT", "git.resetStagingOrCommit repositoryPath cannot contain NUL bytes", "input", context, normalized);
  }
  return normalized;
}

function normalizeAction(
  value: unknown,
  context: GitResetStagingOrCommitContext,
  repositoryPath: string,
): GitResetStagingOrCommitAction | GitResetStagingOrCommitResult {
  const action = stringValue(value);
  if (action === undefined || action.trim().length === 0) {
    return failure("MISSING_REQUIRED_FIELD", "git.resetStagingOrCommit requires target.action", "input", context, repositoryPath);
  }
  if (action === "staging" || action === "commit") return action;
  return failure(
    "INVALID_ACTION",
    "git.resetStagingOrCommit target.action must be staging or commit",
    "input",
    context,
    repositoryPath,
  );
}

function normalizePathspec(
  value: string,
  context: GitResetStagingOrCommitContext,
  repositoryPath: string,
): string | GitResetStagingOrCommitResult {
  const normalized = value.trim().replaceAll("\\", "/");
  if (normalized.length === 0) return "";
  if (normalized.includes("\0") || normalized.startsWith("/") || /^[A-Za-z]:\//u.test(normalized)) {
    return failure(
      "PATHSPEC_OUTSIDE_SCOPE",
      "git.resetStagingOrCommit target.pathspecs must be repository-relative paths",
      "scope",
      context,
      repositoryPath,
    );
  }
  const parts = normalized.split("/").filter(Boolean);
  if (parts.includes("..")) {
    return failure(
      "PATHSPEC_OUTSIDE_SCOPE",
      "git.resetStagingOrCommit target.pathspecs must stay inside the repository",
      "scope",
      context,
      repositoryPath,
    );
  }
  return normalized.replace(/\/+$/u, "");
}

function normalizePathspecs(
  value: unknown,
  context: GitResetStagingOrCommitContext,
  repositoryPath: string,
): readonly string[] | GitResetStagingOrCommitResult {
  const raw = stringArrayValue(value);
  if (value !== undefined && raw === undefined) {
    return failure("INVALID_PATHSPEC", "git.resetStagingOrCommit target.pathspecs must be a string array", "input", context, repositoryPath);
  }
  const normalized: string[] = [];
  for (const item of cleanList(raw)) {
    const pathspec = normalizePathspec(item, context, repositoryPath);
    if (typeof pathspec !== "string") return pathspec;
    if (pathspec.length > 0) normalized.push(pathspec);
  }
  return [...new Set(normalized)];
}

function normalizeTargetRef(
  value: unknown,
  context: GitResetStagingOrCommitContext,
  repositoryPath: string,
): string | undefined | GitResetStagingOrCommitResult {
  if (value === undefined) return undefined;
  const ref = stringValue(value)?.trim() ?? "";
  if (ref.length === 0) return undefined;
  if (ref.includes("\0") || /\s/u.test(ref) || ref.startsWith("-")) {
    return failure("INVALID_TARGET_REF", "git.resetStagingOrCommit target.targetRef must be a safe git revision", "input", context, repositoryPath);
  }
  return ref;
}

function normalizeMode(
  value: unknown,
  context: GitResetStagingOrCommitContext,
  repositoryPath: string,
): GitResetCommitMode | GitResetStagingOrCommitResult {
  if (value === undefined) return "mixed";
  const mode = stringValue(value);
  if (mode !== undefined && resetModes.has(mode)) return mode as GitResetCommitMode;
  return failure("INVALID_MODE", "git.resetStagingOrCommit target.mode is not supported", "input", context, repositoryPath);
}

function normalizeTimeout(
  value: unknown,
  context: GitResetStagingOrCommitContext,
  repositoryPath: string,
): number | undefined | GitResetStagingOrCommitResult {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > gitResetStagingOrCommitDescriptor.maxTimeoutMs) {
    return failure(
      "INVALID_TIMEOUT",
      `git.resetStagingOrCommit timeoutMs must be an integer from 1 to ${gitResetStagingOrCommitDescriptor.maxTimeoutMs}`,
      "input",
      context,
      repositoryPath,
    );
  }
  return value;
}

function normalizeRequest(request: unknown): NormalizedRequest | GitResetStagingOrCommitResult {
  if (request !== undefined && !isRecord(request)) {
    return failure("INVALID_ARGUMENT", "git.resetStagingOrCommit request must be an object", "input", undefined);
  }
  const requestRecord = isRecord(request) ? request : {};
  const context = normalizeContext(requestRecord.context, requestRecord);
  if ("ok" in context) return context;
  const targetRecord = isRecord(requestRecord.target) ? requestRecord.target : requestRecord;
  if (requestRecord.target !== undefined && !isRecord(requestRecord.target)) {
    return failure("INVALID_ARGUMENT", "git.resetStagingOrCommit target must be an object", "input", context);
  }
  const repositoryPath = normalizeRepositoryPath(targetRecord.repositoryPath, context);
  if (typeof repositoryPath !== "string") return repositoryPath;
  const action = normalizeAction(targetRecord.action, context, repositoryPath);
  if (typeof action !== "string") return action;
  const pathspecs = normalizePathspecs(targetRecord.pathspecs, context, repositoryPath);
  if ("ok" in pathspecs) return pathspecs;
  const targetRef = normalizeTargetRef(targetRecord.targetRef, context, repositoryPath);
  if (targetRef !== undefined && typeof targetRef !== "string") return targetRef;
  if (action === "commit" && targetRef === undefined) {
    return failure("MISSING_TARGET_REF", "git.resetStagingOrCommit action commit requires target.targetRef", "input", context, repositoryPath);
  }
  const mode = action === "commit" ? normalizeMode(targetRecord.mode, context, repositoryPath) : undefined;
  if (mode !== undefined && typeof mode !== "string") return mode;
  const timeoutMs = normalizeTimeout(requestRecord.timeoutMs, context, repositoryPath);
  if (timeoutMs !== undefined && typeof timeoutMs !== "number") return timeoutMs;
  return {
    target: {
      repositoryPath,
      action,
      pathspecs,
      targetRef,
      mode,
    },
    context,
    timeoutMs,
  };
}

function normalizeAllowedRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/u, "");
}

function ensureScope(repositoryPath: string, context: GitResetStagingOrCommitContext | undefined): GitResetStagingOrCommitResult | undefined {
  const allowedRoots = cleanList(context?.allowedRepositoryRoots).map(normalizeAllowedRoot);
  if (allowedRoots.length === 0) return undefined;
  const allowed = allowedRoots.some((root) => repositoryPath === root || repositoryPath.startsWith(`${root}/`));
  return allowed
    ? undefined
    : failure("SCOPE_REJECTED", "git.resetStagingOrCommit target repository is outside the allowed repository roots", "scope", context, repositoryPath);
}

function ensurePermissions(repositoryPath: string, context: GitResetStagingOrCommitContext | undefined): GitResetStagingOrCommitResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) return undefined;
  const missing = gitResetStagingOrCommitDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  return missing.length === 0
    ? undefined
    : failure("PERMISSION_DENIED", `git.resetStagingOrCommit is missing permissions: ${missing.join(", ")}`, "permission", context, repositoryPath);
}

function ensureGovernance(repositoryPath: string, context: GitResetStagingOrCommitContext): GitResetStagingOrCommitResult | undefined {
  if (dryRunEnabled(context)) return undefined;
  if (context.guard?.allowed === true || context.guard?.accepted === true) return undefined;
  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "git.resetStagingOrCommit requires an affirmative runtime guard for real execution",
    "governance",
    context,
    repositoryPath,
  );
}

function providerArgs(target: GitResetStagingOrCommitTarget): readonly string[] {
  if (target.action === "staging") {
    return ["reset", ...(target.pathspecs.length === 0 ? [] : ["--", ...target.pathspecs])];
  }
  return ["reset", `--${target.mode ?? "mixed"}`, target.targetRef ?? ""];
}

function commandPreview(target: GitResetStagingOrCommitTarget): readonly string[] {
  return ["git", "-C", target.repositoryPath, ...providerArgs(target)];
}

const runtimeEntry: GitResetStagingOrCommitRuntimeEntry = {
  owner: "runtime",
  port: "BaseToolExecutorPort.git.runGit",
  method: "runGit",
  binary: "git",
  argvMode: "fixed-reset-staging-or-commit-mutation",
  allowedSubcommand: "reset",
};

function riskFor(target: GitResetStagingOrCommitTarget): GitResetStagingOrCommitRisk {
  const hardCommitReset = target.action === "commit" && target.mode === "hard";
  return {
    category: hardCommitReset ? "destructive" : target.action === "commit" ? "history-mutation" : "workspace-mutation",
    riskLevel: hardCommitReset ? "dangerous" : "risky",
    mutatesRepository: true,
    mutatesWorkingTree: target.action === "commit" && (target.mode === "hard" || target.mode === "merge" || target.mode === "keep"),
    mutatesIndex: true,
    spawnsProcess: true,
    requiresTapApproval: true,
    runtimeOwnsExecution: true,
  };
}

function plan(
  normalized: NormalizedRequest,
  dispatch: GitResetStagingOrCommitPlan["dispatch"],
  dryRun: boolean,
): GitResetStagingOrCommitPlan {
  const risk = riskFor(normalized.target);
  return {
    toolId: "git.resetStagingOrCommit",
    toolKind: "git.resetStagingOrCommit",
    capability: "reset-staging-or-commit",
    runtimeId: runtimeId(normalized.context),
    invocationId: invocationId(normalized.context),
    repositoryPath: normalized.target.repositoryPath,
    action: normalized.target.action,
    pathspecs: normalized.target.pathspecs,
    targetRef: normalized.target.targetRef,
    mode: normalized.target.mode,
    gitArgs: providerArgs(normalized.target),
    commandPreview: commandPreview(normalized.target),
    requiredPermissions: gitResetStagingOrCommitDescriptor.permissionsRequired,
    runtimeEntry,
    risk,
    dispatch,
    dryRun,
    wouldMutateIndex: true,
    wouldMutateWorkingTree: risk.mutatesWorkingTree,
    unsafeSideEffects: true,
    outputEnvelope: { stdoutPreview: "", stderrPreview: "", parsed: false },
    audit: {
      guard: "git-reset-runtime-guard",
      event: "basicTool.git.resetStagingOrCommit.planned",
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

export function parseGitResetStagingOrCommitResult(
  providerResult: GitResetStagingOrCommitProviderResult | undefined,
  target: GitResetStagingOrCommitTarget,
): GitResetStagingOrCommitEnvelope {
  return {
    parser: "git-reset-exit-v1",
    action: target.action,
    pathspecs: target.pathspecs,
    targetRef: target.targetRef,
    mode: target.mode,
    exitCode: providerResult?.exitCode,
    stdoutLineCount: lineCount(providerResult?.stdout ?? ""),
    stderrLineCount: lineCount(providerResult?.stderr ?? ""),
  };
}

function success(
  normalized: NormalizedRequest,
  dryRun: boolean,
  providerResult?: GitResetStagingOrCommitProviderResult,
): GitResetStagingOrCommitResult {
  const executionPlan = plan(normalized, dryRun ? "dry-run" : "runtime-git-executor", dryRun);
  return {
    ok: true,
    toolId: "git.resetStagingOrCommit",
    plan: executionPlan,
    output: {
      kind: "agentCore.basicTool.git.resetStagingOrCommit",
      target: normalized.target,
      runtimeEntry,
      risk: executionPlan.risk,
      gitArgs: executionPlan.gitArgs,
      commandPreview: executionPlan.commandPreview,
      timeoutMs: normalized.timeoutMs ?? gitResetStagingOrCommitDescriptor.defaultTimeoutMs,
      dryRun,
      executionBlocked: dryRun,
      providerCalled: providerResult !== undefined,
      exitCode: providerResult?.exitCode,
      stdout: providerResult?.stdout,
      stderr: providerResult?.stderr,
      permissionsRequired: gitResetStagingOrCommitDescriptor.permissionsRequired,
      unsafeSideEffects: true,
      resultEnvelope: parseGitResetStagingOrCommitResult(providerResult, normalized.target),
    },
    audit: [
      auditEvent(
        dryRun ? "agentCore.basicTool.git.resetStagingOrCommit.dryRun" : "agentCore.basicTool.git.resetStagingOrCommit.executed",
        normalized.context,
        normalized.target.repositoryPath,
        {
          action: normalized.target.action,
          pathspecCount: normalized.target.pathspecs.length,
          targetRef: normalized.target.targetRef,
          mode: normalized.target.mode,
          exitCode: providerResult?.exitCode,
        },
      ),
    ],
    events: [dryRun ? "basicTool.git.resetStagingOrCommit.dryRun" : "basicTool.git.resetStagingOrCommit.executed"],
  };
}

export function planGitStagingOrCommitReset(request: GitResetStagingOrCommitRequest = {}): GitResetStagingOrCommitResult {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const scopeFailure = ensureScope(normalized.target.repositoryPath, normalized.context);
  if (scopeFailure !== undefined) return scopeFailure;
  const permissionFailure = ensurePermissions(normalized.target.repositoryPath, normalized.context);
  if (permissionFailure !== undefined) return permissionFailure;
  return success(normalized, true);
}

export async function executeGitStagingOrCommitReset(
  request: GitResetStagingOrCommitRequest = {},
): Promise<GitResetStagingOrCommitResult> {
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
      "git.resetStagingOrCommit requires runtime.execEngine.git.runGit for real execution",
      "provider",
      normalized.context,
      normalized.target.repositoryPath,
    );
  }
  try {
    const providerResult = await request.provider(
      {
        repositoryPath: normalized.target.repositoryPath,
        args: providerArgs(normalized.target),
        timeoutMs: normalized.timeoutMs,
      },
      normalized.context,
    );
    return success(normalized, false, providerResult);
  } catch {
    return failure(
      "PROVIDER_REJECTED",
      "git.resetStagingOrCommit provider rejected the request or failed safely",
      "provider",
      normalized.context,
      normalized.target.repositoryPath,
    );
  }
}
