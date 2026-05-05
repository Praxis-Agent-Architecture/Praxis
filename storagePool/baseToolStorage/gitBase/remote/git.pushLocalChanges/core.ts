/*
 * git.pushLocalChanges storage core.
 * Owns the fixed git push contract and delegates host execution to BaseToolExecutorPort.git.runGit.
 */

export type GitPushLocalChangesPermission = "git:read" | "git:write" | "filesystem:read" | "network:egress";
export type GitPushLocalChangesRiskCategory = "remote-network" | "destructive";

export type GitPushLocalChangesGuard = { allowed?: boolean; accepted?: boolean; reason?: string };

export type GitPushLocalChangesContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: GitPushLocalChangesGuard;
  allowedRepositoryRoots?: readonly string[];
  grantedPermissions?: readonly GitPushLocalChangesPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type GitPushLocalChangesTarget = {
  repositoryPath: string;
  remoteName: string;
  branchName?: string;
  setUpstream: boolean;
  forceWithLease: boolean;
  pushTags: boolean;
  deleteRemoteBranch: boolean;
};

export type GitPushLocalChangesRequest = {
  target?: Partial<GitPushLocalChangesTarget>;
  context?: GitPushLocalChangesContext;
  provider?: GitPushLocalChangesProvider;
  timeoutMs?: number;
  metadata?: Readonly<Record<string, unknown>>;
  runtimeId?: string;
  invocationId?: string;
  repositoryPath?: string;
  cwd?: string;
  remoteName?: string;
  remote?: string;
  branchName?: string;
  branch?: string;
  setUpstream?: boolean;
  forceWithLease?: boolean;
  pushTags?: boolean;
  deleteRemoteBranch?: boolean;
  dryRun?: boolean;
};

export type GitPushLocalChangesRuntimeEntry = {
  owner: "runtime";
  port: "BaseToolExecutorPort.git.runGit";
  method: "runGit";
  binary: "git";
  argvMode: "fixed-push-local-changes";
  allowedSubcommand: "push";
};

export type GitPushLocalChangesRisk = {
  category: GitPushLocalChangesRiskCategory;
  riskLevel: "risky" | "destructive";
  mutatesRepository: false;
  mutatesWorkingTree: false;
  mutatesRemote: true;
  pushesTags: boolean;
  deletesRemoteBranch: boolean;
  forceWithLease: boolean;
  mayUseNetwork: true;
  spawnsProcess: true;
  requiresTapApproval: true;
  runtimeOwnsExecution: true;
};

export type GitPushLocalChangesLine = {
  raw: string;
  operation?: "new" | "update" | "delete" | "tag" | "forced" | "rejected" | "other";
  source?: string;
  destination?: string;
};

export type GitPushLocalChangesEnvelope = {
  parser: "git-push-output-v1";
  remoteName: string;
  branchName?: string;
  setUpstream: boolean;
  forceWithLease: boolean;
  pushTags: boolean;
  deleteRemoteBranch: boolean;
  exitCode?: number;
  stdoutLineCount: number;
  stderrLineCount: number;
  operationHint?: string;
  pushLines: readonly GitPushLocalChangesLine[];
  rejectedHints: readonly string[];
  pushed: boolean;
};

export type GitPushLocalChangesOutput = {
  kind: "agentCore.basicTool.git.pushLocalChanges";
  target: GitPushLocalChangesTarget;
  runtimeEntry: GitPushLocalChangesRuntimeEntry;
  risk: GitPushLocalChangesRisk;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  timeoutMs: number;
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  permissionsRequired: readonly GitPushLocalChangesPermission[];
  unsafeSideEffects: true;
  mayUseNetwork: true;
  resultEnvelope: GitPushLocalChangesEnvelope;
};

export type GitPushLocalChangesPlan = {
  toolId: "git.pushLocalChanges";
  toolKind: "git.pushLocalChanges";
  capability: "push-local-changes";
  runtimeId: string;
  invocationId: string;
  repositoryPath: string;
  remoteName: string;
  branchName?: string;
  setUpstream: boolean;
  forceWithLease: boolean;
  pushTags: boolean;
  deleteRemoteBranch: boolean;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  requiredPermissions: readonly GitPushLocalChangesPermission[];
  runtimeEntry: GitPushLocalChangesRuntimeEntry;
  risk: GitPushLocalChangesRisk;
  dispatch: "dry-run" | "runtime-git-executor";
  dryRun: boolean;
  wouldContactRemote: true;
  wouldMutateRemote: true;
  unsafeSideEffects: true;
  outputEnvelope: { stdoutPreview: ""; stderrPreview: ""; parsed: false };
  audit: {
    guard: "git-remote-push-runtime-guard";
    event: "basicTool.git.pushLocalChanges.planned";
    governanceRequired: true;
    tapCanWrap: true;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type GitPushLocalChangesErrorBoundary = "input" | "scope" | "permission" | "governance" | "provider";
export type GitPushLocalChangesErrorCode =
  | "MISSING_REPOSITORY_PATH"
  | "INVALID_ARGUMENT"
  | "INVALID_CONTEXT"
  | "INVALID_TIMEOUT"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type GitPushLocalChangesError = {
  code: GitPushLocalChangesErrorCode;
  message: string;
  boundary: GitPushLocalChangesErrorBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type GitPushLocalChangesAuditEvent = {
  type: string;
  toolId: "git.pushLocalChanges";
  invocationId: string;
  dryRun: boolean;
  repositoryPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type GitPushLocalChangesResult =
  | {
      ok: true;
      toolId: "git.pushLocalChanges";
      output: GitPushLocalChangesOutput;
      plan: GitPushLocalChangesPlan;
      audit: readonly GitPushLocalChangesAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "git.pushLocalChanges";
      error: GitPushLocalChangesError;
      audit: readonly GitPushLocalChangesAuditEvent[];
      events: readonly string[];
    };

export type GitPushLocalChangesProviderRequest = { repositoryPath: string; args: readonly string[]; timeoutMs?: number };
export type GitPushLocalChangesProviderResult = { exitCode: number; stdout: string; stderr: string };
export type GitPushLocalChangesProvider = (
  request: GitPushLocalChangesProviderRequest,
  context: GitPushLocalChangesContext,
) => GitPushLocalChangesProviderResult | Promise<GitPushLocalChangesProviderResult>;

type NormalizedRequest = { target: GitPushLocalChangesTarget; context: GitPushLocalChangesContext; timeoutMs?: number };

export const gitPushLocalChangesDescriptor = {
  toolId: "git.pushLocalChanges",
  toolKind: "git.pushLocalChanges",
  capability: "push-local-changes",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.remote",
  defaultDryRun: true,
  defaultDispatch: "dry-run",
  tapOwnsApproval: true,
  requiresTapApproval: true,
  runtimeEntryPort: "BaseToolExecutorPort.git.runGit",
  operationRisk: "remote-network",
  permissionsRequired: ["git:read", "git:write", "filesystem:read", "network:egress"],
  defaultTimeoutMs: 120_000,
  maxTimeoutMs: 900_000,
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

function dryRunEnabled(context: GitPushLocalChangesContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: GitPushLocalChangesContext | undefined): string {
  return stringValue(context?.invocationId)?.trim() || "git.pushLocalChanges:dry-run";
}

function runtimeId(context: GitPushLocalChangesContext | undefined): string {
  return stringValue(context?.runtimeId)?.trim() || "runtime.unspecified";
}

function auditEvent(
  type: string,
  context: GitPushLocalChangesContext | undefined,
  repositoryPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): GitPushLocalChangesAuditEvent {
  return {
    type,
    toolId: gitPushLocalChangesDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    repositoryPath,
    metadata: { ...(context?.auditMetadata ?? {}), ...(metadata ?? {}) },
  };
}

function failure(
  code: GitPushLocalChangesErrorCode,
  message: string,
  boundary: GitPushLocalChangesErrorBoundary,
  context: GitPushLocalChangesContext | undefined,
  repositoryPath?: string,
): GitPushLocalChangesResult {
  return {
    ok: false,
    toolId: gitPushLocalChangesDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.git.pushLocalChanges.rejected", context, repositoryPath, { code })],
    events: ["basicTool.git.pushLocalChanges.rejected"],
  };
}

function normalizeContext(rawContext: unknown, legacyRequest: Record<string, unknown>): GitPushLocalChangesContext | GitPushLocalChangesResult {
  const contextRecord = rawContext === undefined ? {} : rawContext;
  if (!isRecord(contextRecord)) return failure("INVALID_CONTEXT", "git.pushLocalChanges context must be an object", "input", undefined);
  const guard = contextRecord.guard;
  if (guard !== undefined && !isRecord(guard)) {
    return failure("INVALID_CONTEXT", "git.pushLocalChanges context.guard must be an object", "input", undefined);
  }
  const allowedRepositoryRoots = stringArrayValue(contextRecord.allowedRepositoryRoots);
  if (contextRecord.allowedRepositoryRoots !== undefined && allowedRepositoryRoots === undefined) {
    return failure("INVALID_CONTEXT", "git.pushLocalChanges context.allowedRepositoryRoots must be a string array", "input", undefined);
  }
  const grantedPermissions = stringArrayValue(contextRecord.grantedPermissions);
  if (contextRecord.grantedPermissions !== undefined && grantedPermissions === undefined) {
    return failure("INVALID_CONTEXT", "git.pushLocalChanges context.grantedPermissions must be a string array", "input", undefined);
  }
  const auditMetadata = isRecord(contextRecord.auditMetadata) ? contextRecord.auditMetadata : undefined;
  if (contextRecord.auditMetadata !== undefined && auditMetadata === undefined) {
    return failure("INVALID_CONTEXT", "git.pushLocalChanges context.auditMetadata must be an object", "input", undefined);
  }
  return {
    runtimeId: stringValue(contextRecord.runtimeId) ?? stringValue(legacyRequest.runtimeId),
    sessionId: stringValue(contextRecord.sessionId),
    invocationId: stringValue(contextRecord.invocationId) ?? stringValue(legacyRequest.invocationId),
    dryRun: booleanValue(contextRecord.dryRun) ?? booleanValue(legacyRequest.dryRun),
    guard:
      guard === undefined
        ? undefined
        : { allowed: booleanValue(guard.allowed), accepted: booleanValue(guard.accepted), reason: stringValue(guard.reason) },
    allowedRepositoryRoots,
    grantedPermissions: grantedPermissions as readonly GitPushLocalChangesPermission[] | undefined,
    auditMetadata,
  };
}

function normalizeRepositoryPath(value: unknown, context: GitPushLocalChangesContext | undefined): string | GitPushLocalChangesResult {
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) return failure("MISSING_REPOSITORY_PATH", "git.pushLocalChanges requires target.repositoryPath", "input", context);
  if (normalized.includes("\0")) return failure("INVALID_ARGUMENT", "git.pushLocalChanges repositoryPath cannot contain NUL bytes", "input", context, normalized);
  return normalized;
}

function safeGitAtom(
  value: unknown,
  field: string,
  context: GitPushLocalChangesContext,
  repositoryPath: string,
  required: boolean,
): string | undefined | GitPushLocalChangesResult {
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) {
    return required ? failure("INVALID_ARGUMENT", `git.pushLocalChanges requires ${field}`, "input", context, repositoryPath) : undefined;
  }
  if (normalized.includes("\0") || /\s/u.test(normalized) || normalized.startsWith("-")) {
    return failure("INVALID_ARGUMENT", `git.pushLocalChanges ${field} must be a safe Git atom`, "input", context, repositoryPath);
  }
  return normalized;
}

function booleanFlag(
  targetRecord: Record<string, unknown>,
  requestRecord: Record<string, unknown>,
  field: keyof GitPushLocalChangesTarget,
  context: GitPushLocalChangesContext,
  repositoryPath: string,
): boolean | GitPushLocalChangesResult {
  const value = targetRecord[field] ?? requestRecord[field];
  if (value === undefined) return false;
  const bool = booleanValue(value);
  if (bool === undefined) {
    return failure("INVALID_ARGUMENT", `git.pushLocalChanges target.${String(field)} must be a boolean`, "input", context, repositoryPath);
  }
  return bool;
}

function normalizeTimeout(value: unknown, context: GitPushLocalChangesContext, repositoryPath: string): number | undefined | GitPushLocalChangesResult {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > gitPushLocalChangesDescriptor.maxTimeoutMs) {
    return failure(
      "INVALID_TIMEOUT",
      `git.pushLocalChanges timeoutMs must be an integer from 1 to ${gitPushLocalChangesDescriptor.maxTimeoutMs}`,
      "input",
      context,
      repositoryPath,
    );
  }
  return value;
}

function normalizeRequest(request: unknown): NormalizedRequest | GitPushLocalChangesResult {
  if (request !== undefined && !isRecord(request)) {
    return failure("INVALID_ARGUMENT", "git.pushLocalChanges request must be an object", "input", undefined);
  }
  const requestRecord = isRecord(request) ? request : {};
  const context = normalizeContext(requestRecord.context, requestRecord);
  if ("ok" in context) return context;
  const targetRecord = isRecord(requestRecord.target) ? requestRecord.target : requestRecord;
  if (requestRecord.target !== undefined && !isRecord(requestRecord.target)) {
    return failure("INVALID_ARGUMENT", "git.pushLocalChanges target must be an object", "input", context);
  }
  const repositoryPath = normalizeRepositoryPath(targetRecord.repositoryPath ?? requestRecord.repositoryPath ?? requestRecord.cwd, context);
  if (typeof repositoryPath !== "string") return repositoryPath;
  const remoteName = safeGitAtom(targetRecord.remoteName ?? targetRecord.remote ?? requestRecord.remoteName ?? requestRecord.remote, "target.remoteName", context, repositoryPath, true);
  if (remoteName === undefined) return failure("INVALID_ARGUMENT", "git.pushLocalChanges requires target.remoteName", "input", context, repositoryPath);
  if (typeof remoteName !== "string") return remoteName;
  const branchName = safeGitAtom(targetRecord.branchName ?? targetRecord.branch ?? requestRecord.branchName ?? requestRecord.branch, "target.branchName", context, repositoryPath, false);
  if (branchName !== undefined && typeof branchName !== "string") return branchName;
  const setUpstream = booleanFlag(targetRecord, requestRecord, "setUpstream", context, repositoryPath);
  if (typeof setUpstream !== "boolean") return setUpstream;
  const forceWithLease = booleanFlag(targetRecord, requestRecord, "forceWithLease", context, repositoryPath);
  if (typeof forceWithLease !== "boolean") return forceWithLease;
  const pushTags = booleanFlag(targetRecord, requestRecord, "pushTags", context, repositoryPath);
  if (typeof pushTags !== "boolean") return pushTags;
  const deleteRemoteBranch = booleanFlag(targetRecord, requestRecord, "deleteRemoteBranch", context, repositoryPath);
  if (typeof deleteRemoteBranch !== "boolean") return deleteRemoteBranch;
  if (!pushTags && branchName === undefined) {
    return failure("INVALID_ARGUMENT", "git.pushLocalChanges requires target.branchName unless target.pushTags is true", "input", context, repositoryPath);
  }
  if (deleteRemoteBranch && branchName === undefined) {
    return failure("INVALID_ARGUMENT", "git.pushLocalChanges target.deleteRemoteBranch requires target.branchName", "input", context, repositoryPath);
  }
  const timeoutMs = normalizeTimeout(requestRecord.timeoutMs, context, repositoryPath);
  if (timeoutMs !== undefined && typeof timeoutMs !== "number") return timeoutMs;
  return {
    target: {
      repositoryPath,
      remoteName,
      branchName,
      setUpstream,
      forceWithLease,
      pushTags,
      deleteRemoteBranch,
    },
    context,
    timeoutMs,
  };
}

function normalizeAllowedRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/u, "");
}

function ensureScope(repositoryPath: string, context: GitPushLocalChangesContext | undefined): GitPushLocalChangesResult | undefined {
  const allowedRoots = cleanList(context?.allowedRepositoryRoots).map(normalizeAllowedRoot);
  if (allowedRoots.length === 0) return undefined;
  const allowed = allowedRoots.some((root) => repositoryPath === root || repositoryPath.startsWith(`${root}/`));
  return allowed
    ? undefined
    : failure("SCOPE_REJECTED", "git.pushLocalChanges target repository is outside the allowed repository roots", "scope", context, repositoryPath);
}

function permissionsForTarget(): readonly GitPushLocalChangesPermission[] {
  return ["git:read", "git:write", "filesystem:read", "network:egress"];
}

function ensurePermissions(target: GitPushLocalChangesTarget, context: GitPushLocalChangesContext | undefined): GitPushLocalChangesResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) return undefined;
  const missing = permissionsForTarget().filter((permission) => !granted.includes(permission));
  return missing.length === 0
    ? undefined
    : failure("PERMISSION_DENIED", `git.pushLocalChanges is missing permissions: ${missing.join(", ")}`, "permission", context, target.repositoryPath);
}

function ensureGovernance(target: GitPushLocalChangesTarget, context: GitPushLocalChangesContext): GitPushLocalChangesResult | undefined {
  if (dryRunEnabled(context)) return undefined;
  if (context.guard?.allowed === true || context.guard?.accepted === true) return undefined;
  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "git.pushLocalChanges requires an affirmative runtime guard for remote push execution",
    "governance",
    context,
    target.repositoryPath,
  );
}

function providerArgs(target: GitPushLocalChangesTarget): readonly string[] {
  return [
    "push",
    ...(target.setUpstream ? ["--set-upstream"] : []),
    ...(target.forceWithLease ? ["--force-with-lease"] : []),
    target.remoteName,
    ...(target.pushTags ? ["--tags"] : []),
    ...(target.branchName === undefined ? [] : [target.deleteRemoteBranch ? `:${target.branchName}` : target.branchName]),
  ];
}

function commandPreview(target: GitPushLocalChangesTarget): readonly string[] {
  return ["git", "-C", target.repositoryPath, ...providerArgs(target)];
}

const runtimeEntry: GitPushLocalChangesRuntimeEntry = {
  owner: "runtime",
  port: "BaseToolExecutorPort.git.runGit",
  method: "runGit",
  binary: "git",
  argvMode: "fixed-push-local-changes",
  allowedSubcommand: "push",
};

function riskForTarget(target: GitPushLocalChangesTarget): GitPushLocalChangesRisk {
  const destructive = target.forceWithLease || target.deleteRemoteBranch;
  return {
    category: destructive ? "destructive" : "remote-network",
    riskLevel: destructive ? "destructive" : "risky",
    mutatesRepository: false,
    mutatesWorkingTree: false,
    mutatesRemote: true,
    pushesTags: target.pushTags,
    deletesRemoteBranch: target.deleteRemoteBranch,
    forceWithLease: target.forceWithLease,
    mayUseNetwork: true,
    spawnsProcess: true,
    requiresTapApproval: true,
    runtimeOwnsExecution: true,
  };
}

function plan(normalized: NormalizedRequest, dispatch: GitPushLocalChangesPlan["dispatch"], dryRun: boolean): GitPushLocalChangesPlan {
  return {
    toolId: "git.pushLocalChanges",
    toolKind: "git.pushLocalChanges",
    capability: "push-local-changes",
    runtimeId: runtimeId(normalized.context),
    invocationId: invocationId(normalized.context),
    repositoryPath: normalized.target.repositoryPath,
    remoteName: normalized.target.remoteName,
    branchName: normalized.target.branchName,
    setUpstream: normalized.target.setUpstream,
    forceWithLease: normalized.target.forceWithLease,
    pushTags: normalized.target.pushTags,
    deleteRemoteBranch: normalized.target.deleteRemoteBranch,
    gitArgs: providerArgs(normalized.target),
    commandPreview: commandPreview(normalized.target),
    requiredPermissions: permissionsForTarget(),
    runtimeEntry,
    risk: riskForTarget(normalized.target),
    dispatch,
    dryRun,
    wouldContactRemote: true,
    wouldMutateRemote: true,
    unsafeSideEffects: true,
    outputEnvelope: { stdoutPreview: "", stderrPreview: "", parsed: false },
    audit: {
      guard: "git-remote-push-runtime-guard",
      event: "basicTool.git.pushLocalChanges.planned",
      governanceRequired: true,
      tapCanWrap: true,
      metadata: normalized.context.auditMetadata ?? {},
    },
  };
}

function lineCount(text: string): number {
  if (text.length === 0) return 0;
  return text.split(/\r?\n/u).filter((line) => line.length > 0).length;
}

function firstOutputLine(stdout: string, stderr: string): string | undefined {
  return `${stdout}\n${stderr}`.split(/\r?\n/u).map((line) => line.trim()).find(Boolean);
}

function parsePushLine(line: string): GitPushLocalChangesLine | undefined {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.startsWith("To ")) return undefined;
  if (/rejected|failed|non-fast-forward|denied/u.test(trimmed)) {
    return { raw: trimmed, operation: "rejected" };
  }
  if (/branch '.+' set up to track/u.test(trimmed)) {
    return { raw: trimmed, operation: "other" };
  }
  const match = trimmed.match(/^(?:[*=+-]\s+)?(?:\[(new branch|new tag|deleted|forced update|rejected)\]\s+)?(\S+)?(?:\s+->\s+(\S+))?/u);
  if (match === null) return { raw: trimmed, operation: "other" };
  const marker = match[1];
  const operation =
    marker === "new branch" ? "new"
    : marker === "new tag" ? "tag"
    : marker === "deleted" ? "delete"
    : marker === "forced update" ? "forced"
    : marker === "rejected" ? "rejected"
    : "update";
  return { raw: trimmed, operation, source: match[2], destination: match[3] };
}

function collectRejectedHints(stdout: string, stderr: string): readonly string[] {
  return `${stdout}\n${stderr}`
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => /rejected|failed|non-fast-forward|denied|error:/u.test(line));
}

export function parseGitPushLocalChangesResult(
  providerResult: GitPushLocalChangesProviderResult | undefined,
  target: GitPushLocalChangesTarget,
): GitPushLocalChangesEnvelope {
  const pushLines = providerResult === undefined
    ? []
    : `${providerResult.stdout}\n${providerResult.stderr}`
        .split(/\r?\n/u)
        .map(parsePushLine)
        .filter((entry): entry is GitPushLocalChangesLine => entry !== undefined);
  return {
    parser: "git-push-output-v1",
    remoteName: target.remoteName,
    branchName: target.branchName,
    setUpstream: target.setUpstream,
    forceWithLease: target.forceWithLease,
    pushTags: target.pushTags,
    deleteRemoteBranch: target.deleteRemoteBranch,
    exitCode: providerResult?.exitCode,
    stdoutLineCount: lineCount(providerResult?.stdout ?? ""),
    stderrLineCount: lineCount(providerResult?.stderr ?? ""),
    operationHint: providerResult === undefined ? undefined : firstOutputLine(providerResult.stdout, providerResult.stderr),
    pushLines,
    rejectedHints: collectRejectedHints(providerResult?.stdout ?? "", providerResult?.stderr ?? ""),
    pushed: providerResult?.exitCode === 0,
  };
}

function success(normalized: NormalizedRequest, dryRun: boolean, providerResult?: GitPushLocalChangesProviderResult): GitPushLocalChangesResult {
  const executionPlan = plan(normalized, dryRun ? "dry-run" : "runtime-git-executor", dryRun);
  return {
    ok: true,
    toolId: "git.pushLocalChanges",
    plan: executionPlan,
    output: {
      kind: "agentCore.basicTool.git.pushLocalChanges",
      target: normalized.target,
      runtimeEntry,
      risk: riskForTarget(normalized.target),
      gitArgs: executionPlan.gitArgs,
      commandPreview: executionPlan.commandPreview,
      timeoutMs: normalized.timeoutMs ?? gitPushLocalChangesDescriptor.defaultTimeoutMs,
      dryRun,
      executionBlocked: dryRun,
      providerCalled: providerResult !== undefined,
      exitCode: providerResult?.exitCode,
      stdout: providerResult?.stdout,
      stderr: providerResult?.stderr,
      permissionsRequired: permissionsForTarget(),
      unsafeSideEffects: true,
      mayUseNetwork: true,
      resultEnvelope: parseGitPushLocalChangesResult(providerResult, normalized.target),
    },
    audit: [
      auditEvent(
        dryRun ? "agentCore.basicTool.git.pushLocalChanges.dryRun" : "agentCore.basicTool.git.pushLocalChanges.executed",
        normalized.context,
        normalized.target.repositoryPath,
        { remoteName: normalized.target.remoteName, branchName: normalized.target.branchName, exitCode: providerResult?.exitCode },
      ),
    ],
    events: [dryRun ? "basicTool.git.pushLocalChanges.dryRun" : "basicTool.git.pushLocalChanges.executed"],
  };
}

export function planGitLocalPush(request: GitPushLocalChangesRequest = {}): GitPushLocalChangesResult {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const scopeFailure = ensureScope(normalized.target.repositoryPath, normalized.context);
  if (scopeFailure !== undefined) return scopeFailure;
  const permissionFailure = ensurePermissions(normalized.target, normalized.context);
  if (permissionFailure !== undefined) return permissionFailure;
  return success(normalized, true);
}

export const planPushLocalChanges = planGitLocalPush;
export const planGitPushLocalChanges = planGitLocalPush;

export async function executeGitPushLocalChanges(request: GitPushLocalChangesRequest = {}): Promise<GitPushLocalChangesResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const scopeFailure = ensureScope(normalized.target.repositoryPath, normalized.context);
  if (scopeFailure !== undefined) return scopeFailure;
  const permissionFailure = ensurePermissions(normalized.target, normalized.context);
  if (permissionFailure !== undefined) return permissionFailure;
  const governanceFailure = ensureGovernance(normalized.target, normalized.context);
  if (governanceFailure !== undefined) return governanceFailure;
  if (dryRunEnabled(normalized.context)) return success(normalized, true);
  if (request.provider === undefined) {
    return failure("PROVIDER_UNAVAILABLE", "git.pushLocalChanges requires runtime.execEngine.git.runGit for real execution", "provider", normalized.context, normalized.target.repositoryPath);
  }
  try {
    const providerResult = await request.provider(
      { repositoryPath: normalized.target.repositoryPath, args: providerArgs(normalized.target), timeoutMs: normalized.timeoutMs },
      normalized.context,
    );
    return success(normalized, false, providerResult);
  } catch {
    return failure("PROVIDER_REJECTED", "git.pushLocalChanges provider rejected the request or failed safely", "provider", normalized.context, normalized.target.repositoryPath);
  }
}
