/*
 * git.stashChanges storage core.
 * Owns the fixed git-stash push workspace mutation contract and delegates host execution to BaseToolExecutorPort.git.runGit.
 */

export type GitStashChangesPermission = "git:read" | "git:write" | "filesystem:read" | "filesystem:write";

export type GitStashChangesGuard = {
  allowed?: boolean;
  accepted?: boolean;
  reason?: string;
};

export type GitStashChangesContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: GitStashChangesGuard;
  allowedRepositoryRoots?: readonly string[];
  grantedPermissions?: readonly GitStashChangesPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type GitStashChangesTarget = {
  repositoryPath: string;
  message?: string;
  includeUntracked: boolean;
  keepIndex: boolean;
  pathspecs: readonly string[];
};

export type GitStashChangesRequest = {
  target?: Partial<GitStashChangesTarget>;
  context?: GitStashChangesContext;
  provider?: GitStashChangesProvider;
  timeoutMs?: number;
  metadata?: Readonly<Record<string, unknown>>;
  runtimeId?: string;
  invocationId?: string;
  repositoryPath?: string;
  message?: string;
  includeUntracked?: boolean;
  keepIndex?: boolean;
  pathspecs?: readonly string[];
  dryRun?: boolean;
};

export type GitStashChangesRuntimeEntry = {
  owner: "runtime";
  port: "BaseToolExecutorPort.git.runGit";
  method: "runGit";
  binary: "git";
  argvMode: "fixed-stash-push-workspace-mutation";
  allowedSubcommand: "stash";
};

export type GitStashChangesRisk = {
  category: "workspace-mutation";
  riskLevel: "risky";
  mutatesRepository: true;
  mutatesWorkingTree: true;
  mutatesIndex: boolean;
  createsStashEntry: true;
  spawnsProcess: true;
  requiresTapApproval: true;
  runtimeOwnsExecution: true;
};

export type GitStashChangesEnvelope = {
  parser: "git-stash-push-exit-v1";
  message?: string;
  includeUntracked: boolean;
  keepIndex: boolean;
  pathspecs: readonly string[];
  exitCode?: number;
  stdoutLineCount: number;
  stderrLineCount: number;
  createdStashHint?: string;
};

export type GitStashChangesOutput = {
  kind: "agentCore.basicTool.git.stashChanges";
  target: GitStashChangesTarget;
  runtimeEntry: GitStashChangesRuntimeEntry;
  risk: GitStashChangesRisk;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  timeoutMs: number;
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  permissionsRequired: readonly GitStashChangesPermission[];
  unsafeSideEffects: true;
  createsStashEntry: true;
  resultEnvelope: GitStashChangesEnvelope;
};

export type GitStashChangesPlan = {
  toolId: "git.stashChanges";
  toolKind: "git.stashChanges";
  capability: "stash-changes";
  runtimeId: string;
  invocationId: string;
  repositoryPath: string;
  message?: string;
  includeUntracked: boolean;
  keepIndex: boolean;
  pathspecs: readonly string[];
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  requiredPermissions: readonly GitStashChangesPermission[];
  runtimeEntry: GitStashChangesRuntimeEntry;
  risk: GitStashChangesRisk;
  dispatch: "dry-run" | "runtime-git-executor";
  dryRun: boolean;
  wouldMutateWorkingTree: true;
  wouldMutateIndex: boolean;
  unsafeSideEffects: true;
  outputEnvelope: { stdoutPreview: ""; stderrPreview: ""; parsed: false };
  audit: {
    guard: "git-stash-runtime-guard";
    event: "basicTool.git.stashChanges.planned";
    governanceRequired: true;
    tapCanWrap: true;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type GitStashChangesErrorBoundary = "input" | "scope" | "permission" | "governance" | "provider";
export type GitStashChangesErrorCode =
  | "MISSING_REPOSITORY_PATH"
  | "INVALID_ARGUMENT"
  | "INVALID_CONTEXT"
  | "INVALID_MESSAGE"
  | "INVALID_PATHSPEC"
  | "PATHSPEC_OUTSIDE_SCOPE"
  | "INVALID_TIMEOUT"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type GitStashChangesError = {
  code: GitStashChangesErrorCode;
  message: string;
  boundary: GitStashChangesErrorBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type GitStashChangesAuditEvent = {
  type: string;
  toolId: "git.stashChanges";
  invocationId: string;
  dryRun: boolean;
  repositoryPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type GitStashChangesResult =
  | {
      ok: true;
      toolId: "git.stashChanges";
      output: GitStashChangesOutput;
      plan: GitStashChangesPlan;
      audit: readonly GitStashChangesAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "git.stashChanges";
      error: GitStashChangesError;
      audit: readonly GitStashChangesAuditEvent[];
      events: readonly string[];
    };

export type GitStashChangesProviderRequest = {
  repositoryPath: string;
  args: readonly string[];
  timeoutMs?: number;
};

export type GitStashChangesProviderResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type GitStashChangesProvider = (
  request: GitStashChangesProviderRequest,
  context: GitStashChangesContext,
) => GitStashChangesProviderResult | Promise<GitStashChangesProviderResult>;

type NormalizedRequest = {
  target: GitStashChangesTarget;
  context: GitStashChangesContext;
  timeoutMs?: number;
};

export const gitStashChangesDescriptor = {
  toolId: "git.stashChanges",
  toolKind: "git.stashChanges",
  capability: "stash-changes",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.stash",
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

function dryRunEnabled(context: GitStashChangesContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: GitStashChangesContext | undefined): string {
  return stringValue(context?.invocationId)?.trim() || "git.stashChanges:dry-run";
}

function runtimeId(context: GitStashChangesContext | undefined): string {
  return stringValue(context?.runtimeId)?.trim() || "runtime.unspecified";
}

function auditEvent(
  type: string,
  context: GitStashChangesContext | undefined,
  repositoryPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): GitStashChangesAuditEvent {
  return {
    type,
    toolId: gitStashChangesDescriptor.toolId,
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
  code: GitStashChangesErrorCode,
  message: string,
  boundary: GitStashChangesErrorBoundary,
  context: GitStashChangesContext | undefined,
  repositoryPath?: string,
): GitStashChangesResult {
  return {
    ok: false,
    toolId: gitStashChangesDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.git.stashChanges.rejected", context, repositoryPath, { code })],
    events: ["basicTool.git.stashChanges.rejected"],
  };
}

function normalizeContext(rawContext: unknown, legacyRequest: Record<string, unknown>): GitStashChangesContext | GitStashChangesResult {
  const contextRecord = rawContext === undefined ? {} : rawContext;
  if (!isRecord(contextRecord)) {
    return failure("INVALID_CONTEXT", "git.stashChanges context must be an object", "input", undefined);
  }
  const guard = contextRecord.guard;
  if (guard !== undefined && !isRecord(guard)) {
    return failure("INVALID_CONTEXT", "git.stashChanges context.guard must be an object", "input", undefined);
  }
  const allowedRepositoryRoots = stringArrayValue(contextRecord.allowedRepositoryRoots);
  if (contextRecord.allowedRepositoryRoots !== undefined && allowedRepositoryRoots === undefined) {
    return failure("INVALID_CONTEXT", "git.stashChanges context.allowedRepositoryRoots must be a string array", "input", undefined);
  }
  const grantedPermissions = stringArrayValue(contextRecord.grantedPermissions);
  if (contextRecord.grantedPermissions !== undefined && grantedPermissions === undefined) {
    return failure("INVALID_CONTEXT", "git.stashChanges context.grantedPermissions must be a string array", "input", undefined);
  }
  const auditMetadata = isRecord(contextRecord.auditMetadata) ? contextRecord.auditMetadata : undefined;
  if (contextRecord.auditMetadata !== undefined && auditMetadata === undefined) {
    return failure("INVALID_CONTEXT", "git.stashChanges context.auditMetadata must be an object", "input", undefined);
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
    grantedPermissions: grantedPermissions as readonly GitStashChangesPermission[] | undefined,
    auditMetadata,
  };
}

function normalizeRepositoryPath(value: unknown, context: GitStashChangesContext | undefined): string | GitStashChangesResult {
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_REPOSITORY_PATH", "git.stashChanges requires target.repositoryPath", "input", context);
  }
  if (normalized.includes("\0")) {
    return failure("INVALID_ARGUMENT", "git.stashChanges repositoryPath cannot contain NUL bytes", "input", context, normalized);
  }
  return normalized;
}

function normalizeMessage(value: unknown, context: GitStashChangesContext, repositoryPath: string): string | undefined | GitStashChangesResult {
  if (value === undefined) return undefined;
  const message = stringValue(value)?.trim() ?? "";
  if (message.length === 0) return undefined;
  if (message.includes("\0")) {
    return failure("INVALID_MESSAGE", "git.stashChanges target.message cannot contain NUL bytes", "input", context, repositoryPath);
  }
  return message;
}

function normalizePathspec(value: string, context: GitStashChangesContext, repositoryPath: string): string | GitStashChangesResult {
  const normalized = value.trim().replaceAll("\\", "/");
  if (normalized.length === 0) return "";
  if (normalized.includes("\0") || normalized.startsWith("/") || /^[A-Za-z]:\//u.test(normalized)) {
    return failure("PATHSPEC_OUTSIDE_SCOPE", "git.stashChanges target.pathspecs must be repository-relative paths", "scope", context, repositoryPath);
  }
  const parts = normalized.split("/").filter(Boolean);
  if (parts.includes("..")) {
    return failure("PATHSPEC_OUTSIDE_SCOPE", "git.stashChanges target.pathspecs must stay inside the repository", "scope", context, repositoryPath);
  }
  return normalized.replace(/\/+$/u, "");
}

function normalizePathspecs(
  value: unknown,
  context: GitStashChangesContext,
  repositoryPath: string,
): readonly string[] | GitStashChangesResult {
  const raw = stringArrayValue(value);
  if (value !== undefined && raw === undefined) {
    return failure("INVALID_PATHSPEC", "git.stashChanges target.pathspecs must be a string array", "input", context, repositoryPath);
  }
  const normalized: string[] = [];
  for (const item of cleanList(raw)) {
    const pathspec = normalizePathspec(item, context, repositoryPath);
    if (typeof pathspec !== "string") return pathspec;
    if (pathspec.length > 0) normalized.push(pathspec);
  }
  return [...new Set(normalized)];
}

function normalizeTimeout(value: unknown, context: GitStashChangesContext, repositoryPath: string): number | undefined | GitStashChangesResult {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > gitStashChangesDescriptor.maxTimeoutMs) {
    return failure(
      "INVALID_TIMEOUT",
      `git.stashChanges timeoutMs must be an integer from 1 to ${gitStashChangesDescriptor.maxTimeoutMs}`,
      "input",
      context,
      repositoryPath,
    );
  }
  return value;
}

function normalizeRequest(request: unknown): NormalizedRequest | GitStashChangesResult {
  if (request !== undefined && !isRecord(request)) {
    return failure("INVALID_ARGUMENT", "git.stashChanges request must be an object", "input", undefined);
  }
  const requestRecord = isRecord(request) ? request : {};
  const context = normalizeContext(requestRecord.context, requestRecord);
  if ("ok" in context) return context;
  const targetRecord = isRecord(requestRecord.target) ? requestRecord.target : requestRecord;
  if (requestRecord.target !== undefined && !isRecord(requestRecord.target)) {
    return failure("INVALID_ARGUMENT", "git.stashChanges target must be an object", "input", context);
  }
  const repositoryPath = normalizeRepositoryPath(targetRecord.repositoryPath, context);
  if (typeof repositoryPath !== "string") return repositoryPath;
  const message = normalizeMessage(targetRecord.message, context, repositoryPath);
  if (message !== undefined && typeof message !== "string") return message;
  const pathspecs = normalizePathspecs(targetRecord.pathspecs, context, repositoryPath);
  if ("ok" in pathspecs) return pathspecs;
  const timeoutMs = normalizeTimeout(requestRecord.timeoutMs, context, repositoryPath);
  if (timeoutMs !== undefined && typeof timeoutMs !== "number") return timeoutMs;
  return {
    target: {
      repositoryPath,
      message,
      includeUntracked: targetRecord.includeUntracked === true,
      keepIndex: targetRecord.keepIndex === true,
      pathspecs,
    },
    context,
    timeoutMs,
  };
}

function normalizeAllowedRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/u, "");
}

function ensureScope(repositoryPath: string, context: GitStashChangesContext | undefined): GitStashChangesResult | undefined {
  const allowedRoots = cleanList(context?.allowedRepositoryRoots).map(normalizeAllowedRoot);
  if (allowedRoots.length === 0) return undefined;
  const allowed = allowedRoots.some((root) => repositoryPath === root || repositoryPath.startsWith(`${root}/`));
  return allowed
    ? undefined
    : failure("SCOPE_REJECTED", "git.stashChanges target repository is outside the allowed repository roots", "scope", context, repositoryPath);
}

function ensurePermissions(repositoryPath: string, context: GitStashChangesContext | undefined): GitStashChangesResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) return undefined;
  const missing = gitStashChangesDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  return missing.length === 0
    ? undefined
    : failure("PERMISSION_DENIED", `git.stashChanges is missing permissions: ${missing.join(", ")}`, "permission", context, repositoryPath);
}

function ensureGovernance(repositoryPath: string, context: GitStashChangesContext): GitStashChangesResult | undefined {
  if (dryRunEnabled(context)) return undefined;
  if (context.guard?.allowed === true || context.guard?.accepted === true) return undefined;
  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "git.stashChanges requires an affirmative runtime guard for real execution",
    "governance",
    context,
    repositoryPath,
  );
}

function providerArgs(target: GitStashChangesTarget): readonly string[] {
  return [
    "stash",
    "push",
    ...(target.includeUntracked ? ["--include-untracked"] : []),
    ...(target.keepIndex ? ["--keep-index"] : []),
    ...(target.message === undefined ? [] : ["-m", target.message]),
    ...(target.pathspecs.length === 0 ? [] : ["--", ...target.pathspecs]),
  ];
}

function commandPreview(target: GitStashChangesTarget): readonly string[] {
  return ["git", "-C", target.repositoryPath, ...providerArgs(target)];
}

const runtimeEntry: GitStashChangesRuntimeEntry = {
  owner: "runtime",
  port: "BaseToolExecutorPort.git.runGit",
  method: "runGit",
  binary: "git",
  argvMode: "fixed-stash-push-workspace-mutation",
  allowedSubcommand: "stash",
};

function riskFor(target: GitStashChangesTarget): GitStashChangesRisk {
  return {
    category: "workspace-mutation",
    riskLevel: "risky",
    mutatesRepository: true,
    mutatesWorkingTree: true,
    mutatesIndex: target.keepIndex !== true,
    createsStashEntry: true,
    spawnsProcess: true,
    requiresTapApproval: true,
    runtimeOwnsExecution: true,
  };
}

function plan(normalized: NormalizedRequest, dispatch: GitStashChangesPlan["dispatch"], dryRun: boolean): GitStashChangesPlan {
  const risk = riskFor(normalized.target);
  return {
    toolId: "git.stashChanges",
    toolKind: "git.stashChanges",
    capability: "stash-changes",
    runtimeId: runtimeId(normalized.context),
    invocationId: invocationId(normalized.context),
    repositoryPath: normalized.target.repositoryPath,
    message: normalized.target.message,
    includeUntracked: normalized.target.includeUntracked,
    keepIndex: normalized.target.keepIndex,
    pathspecs: normalized.target.pathspecs,
    gitArgs: providerArgs(normalized.target),
    commandPreview: commandPreview(normalized.target),
    requiredPermissions: gitStashChangesDescriptor.permissionsRequired,
    runtimeEntry,
    risk,
    dispatch,
    dryRun,
    wouldMutateWorkingTree: true,
    wouldMutateIndex: risk.mutatesIndex,
    unsafeSideEffects: true,
    outputEnvelope: { stdoutPreview: "", stderrPreview: "", parsed: false },
    audit: {
      guard: "git-stash-runtime-guard",
      event: "basicTool.git.stashChanges.planned",
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

function stashHint(stdout: string): string | undefined {
  const line = stdout.split(/\r?\n/u).find((item) => item.trim().length > 0);
  return line?.trim();
}

export function parseGitStashChangesResult(
  providerResult: GitStashChangesProviderResult | undefined,
  target: GitStashChangesTarget,
): GitStashChangesEnvelope {
  return {
    parser: "git-stash-push-exit-v1",
    message: target.message,
    includeUntracked: target.includeUntracked,
    keepIndex: target.keepIndex,
    pathspecs: target.pathspecs,
    exitCode: providerResult?.exitCode,
    stdoutLineCount: lineCount(providerResult?.stdout ?? ""),
    stderrLineCount: lineCount(providerResult?.stderr ?? ""),
    createdStashHint: providerResult === undefined ? undefined : stashHint(providerResult.stdout),
  };
}

function success(normalized: NormalizedRequest, dryRun: boolean, providerResult?: GitStashChangesProviderResult): GitStashChangesResult {
  const executionPlan = plan(normalized, dryRun ? "dry-run" : "runtime-git-executor", dryRun);
  return {
    ok: true,
    toolId: "git.stashChanges",
    plan: executionPlan,
    output: {
      kind: "agentCore.basicTool.git.stashChanges",
      target: normalized.target,
      runtimeEntry,
      risk: executionPlan.risk,
      gitArgs: executionPlan.gitArgs,
      commandPreview: executionPlan.commandPreview,
      timeoutMs: normalized.timeoutMs ?? gitStashChangesDescriptor.defaultTimeoutMs,
      dryRun,
      executionBlocked: dryRun,
      providerCalled: providerResult !== undefined,
      exitCode: providerResult?.exitCode,
      stdout: providerResult?.stdout,
      stderr: providerResult?.stderr,
      permissionsRequired: gitStashChangesDescriptor.permissionsRequired,
      unsafeSideEffects: true,
      createsStashEntry: true,
      resultEnvelope: parseGitStashChangesResult(providerResult, normalized.target),
    },
    audit: [
      auditEvent(
        dryRun ? "agentCore.basicTool.git.stashChanges.dryRun" : "agentCore.basicTool.git.stashChanges.executed",
        normalized.context,
        normalized.target.repositoryPath,
        {
          includeUntracked: normalized.target.includeUntracked,
          keepIndex: normalized.target.keepIndex,
          pathspecCount: normalized.target.pathspecs.length,
          exitCode: providerResult?.exitCode,
        },
      ),
    ],
    events: [dryRun ? "basicTool.git.stashChanges.dryRun" : "basicTool.git.stashChanges.executed"],
  };
}

export function planGitStashChanges(request: GitStashChangesRequest = {}): GitStashChangesResult {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const scopeFailure = ensureScope(normalized.target.repositoryPath, normalized.context);
  if (scopeFailure !== undefined) return scopeFailure;
  const permissionFailure = ensurePermissions(normalized.target.repositoryPath, normalized.context);
  if (permissionFailure !== undefined) return permissionFailure;
  return success(normalized, true);
}

export async function executeGitStashChanges(request: GitStashChangesRequest = {}): Promise<GitStashChangesResult> {
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
      "git.stashChanges requires runtime.execEngine.git.runGit for real execution",
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
      "git.stashChanges provider rejected the request or failed safely",
      "provider",
      normalized.context,
      normalized.target.repositoryPath,
    );
  }
}
