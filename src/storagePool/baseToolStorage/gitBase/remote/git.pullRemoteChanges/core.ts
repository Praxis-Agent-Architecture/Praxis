/*
 * git.pullRemoteChanges storage core.
 * Owns the fixed git pull contract and delegates host execution to BaseToolExecutorPort.git.runGit.
 */

export type GitPullIntegrationMode = "merge" | "rebase" | "ff-only";
export type GitPullRemoteChangesPermission = "git:read" | "git:write" | "filesystem:write" | "network:egress";
export type GitPullRemoteChangesRiskCategory = "remote-network";

export type GitPullRemoteChangesGuard = { allowed?: boolean; accepted?: boolean; reason?: string };

export type GitPullRemoteChangesContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: GitPullRemoteChangesGuard;
  allowedRepositoryRoots?: readonly string[];
  grantedPermissions?: readonly GitPullRemoteChangesPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type GitPullRemoteChangesTarget = {
  repositoryPath: string;
  remoteName?: string;
  branchName?: string;
  integrationMode: GitPullIntegrationMode;
  autostash: boolean;
  prune: boolean;
};

export type GitPullRemoteChangesRequest = {
  target?: Partial<GitPullRemoteChangesTarget>;
  context?: GitPullRemoteChangesContext;
  provider?: GitPullRemoteChangesProvider;
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
  integrationMode?: GitPullIntegrationMode;
  autostash?: boolean;
  prune?: boolean;
  dryRun?: boolean;
};

export type GitPullRemoteChangesRuntimeEntry = {
  owner: "runtime";
  port: "BaseToolExecutorPort.git.runGit";
  method: "runGit";
  binary: "git";
  argvMode: "fixed-pull-remote-changes";
  allowedSubcommand: "pull";
};

export type GitPullRemoteChangesRisk = {
  category: GitPullRemoteChangesRiskCategory;
  riskLevel: "risky";
  mutatesRepository: true;
  mutatesWorkingTree: true;
  updatesRemoteTrackingRefs: true;
  integratesRemoteChanges: true;
  mayCreateConflicts: true;
  mayUseNetwork: true;
  spawnsProcess: true;
  requiresTapApproval: true;
  runtimeOwnsExecution: true;
};

export type GitPullRemoteUpdateEntry = {
  raw: string;
  operation?: "new" | "update" | "delete" | "tag" | "other";
  source?: string;
  destination?: string;
};

export type GitPullRemoteChangesEnvelope = {
  parser: "git-pull-output-v1";
  remoteName?: string;
  branchName?: string;
  integrationMode: GitPullIntegrationMode;
  autostash: boolean;
  prune: boolean;
  exitCode?: number;
  stdoutLineCount: number;
  stderrLineCount: number;
  operationHint?: string;
  updateLines: readonly GitPullRemoteUpdateEntry[];
  conflictHints: readonly string[];
  pulled: boolean;
};

export type GitPullRemoteChangesOutput = {
  kind: "agentCore.basicTool.git.pullRemoteChanges";
  target: GitPullRemoteChangesTarget;
  runtimeEntry: GitPullRemoteChangesRuntimeEntry;
  risk: GitPullRemoteChangesRisk;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  timeoutMs: number;
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  permissionsRequired: readonly GitPullRemoteChangesPermission[];
  unsafeSideEffects: true;
  mayUseNetwork: true;
  resultEnvelope: GitPullRemoteChangesEnvelope;
};

export type GitPullRemoteChangesPlan = {
  toolId: "git.pullRemoteChanges";
  toolKind: "git.pullRemoteChanges";
  capability: "pull-remote-changes";
  runtimeId: string;
  invocationId: string;
  repositoryPath: string;
  remoteName?: string;
  branchName?: string;
  integrationMode: GitPullIntegrationMode;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  requiredPermissions: readonly GitPullRemoteChangesPermission[];
  runtimeEntry: GitPullRemoteChangesRuntimeEntry;
  risk: GitPullRemoteChangesRisk;
  dispatch: "dry-run" | "runtime-git-executor";
  dryRun: boolean;
  wouldContactRemote: true;
  wouldUpdateRemoteTrackingRefs: true;
  wouldMutateWorkingTree: true;
  unsafeSideEffects: true;
  outputEnvelope: { stdoutPreview: ""; stderrPreview: ""; parsed: false };
  audit: {
    guard: "git-remote-network-runtime-guard";
    event: "basicTool.git.pullRemoteChanges.planned";
    governanceRequired: true;
    tapCanWrap: true;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type GitPullRemoteChangesErrorBoundary = "input" | "scope" | "permission" | "governance" | "provider";
export type GitPullRemoteChangesErrorCode =
  | "MISSING_REPOSITORY_PATH"
  | "INVALID_ARGUMENT"
  | "INVALID_CONTEXT"
  | "INVALID_TIMEOUT"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type GitPullRemoteChangesError = {
  code: GitPullRemoteChangesErrorCode;
  message: string;
  boundary: GitPullRemoteChangesErrorBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type GitPullRemoteChangesAuditEvent = {
  type: string;
  toolId: "git.pullRemoteChanges";
  invocationId: string;
  dryRun: boolean;
  repositoryPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type GitPullRemoteChangesResult =
  | {
      ok: true;
      toolId: "git.pullRemoteChanges";
      output: GitPullRemoteChangesOutput;
      plan: GitPullRemoteChangesPlan;
      audit: readonly GitPullRemoteChangesAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "git.pullRemoteChanges";
      error: GitPullRemoteChangesError;
      audit: readonly GitPullRemoteChangesAuditEvent[];
      events: readonly string[];
    };

export type GitPullRemoteChangesProviderRequest = { repositoryPath: string; args: readonly string[]; timeoutMs?: number };
export type GitPullRemoteChangesProviderResult = { exitCode: number; stdout: string; stderr: string };
export type GitPullRemoteChangesProvider = (
  request: GitPullRemoteChangesProviderRequest,
  context: GitPullRemoteChangesContext,
) => GitPullRemoteChangesProviderResult | Promise<GitPullRemoteChangesProviderResult>;

type NormalizedRequest = { target: GitPullRemoteChangesTarget; context: GitPullRemoteChangesContext; timeoutMs?: number };

export const gitPullRemoteChangesDescriptor = {
  toolId: "git.pullRemoteChanges",
  toolKind: "git.pullRemoteChanges",
  capability: "pull-remote-changes",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.remote",
  defaultDryRun: true,
  defaultDispatch: "dry-run",
  tapOwnsApproval: true,
  requiresTapApproval: true,
  runtimeEntryPort: "BaseToolExecutorPort.git.runGit",
  operationRisk: "remote-network",
  permissionsRequired: ["git:read", "git:write", "filesystem:write", "network:egress"],
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

function dryRunEnabled(context: GitPullRemoteChangesContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: GitPullRemoteChangesContext | undefined): string {
  return stringValue(context?.invocationId)?.trim() || "git.pullRemoteChanges:dry-run";
}

function runtimeId(context: GitPullRemoteChangesContext | undefined): string {
  return stringValue(context?.runtimeId)?.trim() || "runtime.unspecified";
}

function auditEvent(
  type: string,
  context: GitPullRemoteChangesContext | undefined,
  repositoryPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): GitPullRemoteChangesAuditEvent {
  return {
    type,
    toolId: gitPullRemoteChangesDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    repositoryPath,
    metadata: { ...(context?.auditMetadata ?? {}), ...(metadata ?? {}) },
  };
}

function failure(
  code: GitPullRemoteChangesErrorCode,
  message: string,
  boundary: GitPullRemoteChangesErrorBoundary,
  context: GitPullRemoteChangesContext | undefined,
  repositoryPath?: string,
): GitPullRemoteChangesResult {
  return {
    ok: false,
    toolId: gitPullRemoteChangesDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.git.pullRemoteChanges.rejected", context, repositoryPath, { code })],
    events: ["basicTool.git.pullRemoteChanges.rejected"],
  };
}

function normalizeContext(rawContext: unknown, legacyRequest: Record<string, unknown>): GitPullRemoteChangesContext | GitPullRemoteChangesResult {
  const contextRecord = rawContext === undefined ? {} : rawContext;
  if (!isRecord(contextRecord)) return failure("INVALID_CONTEXT", "git.pullRemoteChanges context must be an object", "input", undefined);
  const guard = contextRecord.guard;
  if (guard !== undefined && !isRecord(guard)) {
    return failure("INVALID_CONTEXT", "git.pullRemoteChanges context.guard must be an object", "input", undefined);
  }
  const allowedRepositoryRoots = stringArrayValue(contextRecord.allowedRepositoryRoots);
  if (contextRecord.allowedRepositoryRoots !== undefined && allowedRepositoryRoots === undefined) {
    return failure("INVALID_CONTEXT", "git.pullRemoteChanges context.allowedRepositoryRoots must be a string array", "input", undefined);
  }
  const grantedPermissions = stringArrayValue(contextRecord.grantedPermissions);
  if (contextRecord.grantedPermissions !== undefined && grantedPermissions === undefined) {
    return failure("INVALID_CONTEXT", "git.pullRemoteChanges context.grantedPermissions must be a string array", "input", undefined);
  }
  const auditMetadata = isRecord(contextRecord.auditMetadata) ? contextRecord.auditMetadata : undefined;
  if (contextRecord.auditMetadata !== undefined && auditMetadata === undefined) {
    return failure("INVALID_CONTEXT", "git.pullRemoteChanges context.auditMetadata must be an object", "input", undefined);
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
    grantedPermissions: grantedPermissions as readonly GitPullRemoteChangesPermission[] | undefined,
    auditMetadata,
  };
}

function normalizeRepositoryPath(value: unknown, context: GitPullRemoteChangesContext | undefined): string | GitPullRemoteChangesResult {
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) return failure("MISSING_REPOSITORY_PATH", "git.pullRemoteChanges requires target.repositoryPath", "input", context);
  if (normalized.includes("\0")) return failure("INVALID_ARGUMENT", "git.pullRemoteChanges repositoryPath cannot contain NUL bytes", "input", context, normalized);
  return normalized;
}

function safeAtom(
  value: unknown,
  field: string,
  context: GitPullRemoteChangesContext,
  repositoryPath: string,
): string | undefined | GitPullRemoteChangesResult {
  if (value === undefined) return undefined;
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) return undefined;
  if (normalized.includes("\0") || /\s/u.test(normalized) || normalized.startsWith("-")) {
    return failure("INVALID_ARGUMENT", `git.pullRemoteChanges ${field} must be a safe Git atom`, "input", context, repositoryPath);
  }
  return normalized;
}

function normalizeIntegrationMode(value: unknown, context: GitPullRemoteChangesContext, repositoryPath: string): GitPullIntegrationMode | GitPullRemoteChangesResult {
  if (value === undefined || value === "merge") return "merge";
  if (value === "rebase" || value === "ff-only") return value;
  return failure("INVALID_ARGUMENT", "git.pullRemoteChanges target.integrationMode must be merge, rebase, or ff-only", "input", context, repositoryPath);
}

function normalizeTimeout(value: unknown, context: GitPullRemoteChangesContext, repositoryPath: string): number | undefined | GitPullRemoteChangesResult {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > gitPullRemoteChangesDescriptor.maxTimeoutMs) {
    return failure(
      "INVALID_TIMEOUT",
      `git.pullRemoteChanges timeoutMs must be an integer from 1 to ${gitPullRemoteChangesDescriptor.maxTimeoutMs}`,
      "input",
      context,
      repositoryPath,
    );
  }
  return value;
}

function normalizeRequest(request: unknown): NormalizedRequest | GitPullRemoteChangesResult {
  if (request !== undefined && !isRecord(request)) {
    return failure("INVALID_ARGUMENT", "git.pullRemoteChanges request must be an object", "input", undefined);
  }
  const requestRecord = isRecord(request) ? request : {};
  const context = normalizeContext(requestRecord.context, requestRecord);
  if ("ok" in context) return context;
  const targetRecord = isRecord(requestRecord.target) ? requestRecord.target : requestRecord;
  if (requestRecord.target !== undefined && !isRecord(requestRecord.target)) {
    return failure("INVALID_ARGUMENT", "git.pullRemoteChanges target must be an object", "input", context);
  }
  const repositoryPath = normalizeRepositoryPath(targetRecord.repositoryPath ?? requestRecord.repositoryPath ?? requestRecord.cwd, context);
  if (typeof repositoryPath !== "string") return repositoryPath;
  const remoteName = safeAtom(targetRecord.remoteName ?? targetRecord.remote ?? requestRecord.remoteName ?? requestRecord.remote, "target.remoteName", context, repositoryPath);
  if (remoteName !== undefined && typeof remoteName !== "string") return remoteName;
  const branchName = safeAtom(targetRecord.branchName ?? targetRecord.branch ?? requestRecord.branchName ?? requestRecord.branch, "target.branchName", context, repositoryPath);
  if (branchName !== undefined && typeof branchName !== "string") return branchName;
  if ((remoteName === undefined) !== (branchName === undefined)) {
    return failure(
      "INVALID_ARGUMENT",
      "git.pullRemoteChanges requires target.remoteName and target.branchName to be provided together",
      "input",
      context,
      repositoryPath,
    );
  }
  const integrationMode = normalizeIntegrationMode(targetRecord.integrationMode ?? requestRecord.integrationMode, context, repositoryPath);
  if (typeof integrationMode !== "string") return integrationMode;
  const timeoutMs = normalizeTimeout(requestRecord.timeoutMs, context, repositoryPath);
  if (timeoutMs !== undefined && typeof timeoutMs !== "number") return timeoutMs;
  return {
    target: {
      repositoryPath,
      remoteName,
      branchName,
      integrationMode,
      autostash: booleanValue(targetRecord.autostash) ?? booleanValue(requestRecord.autostash) ?? false,
      prune: booleanValue(targetRecord.prune) ?? booleanValue(requestRecord.prune) ?? false,
    },
    context,
    timeoutMs,
  };
}

function normalizeAllowedRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/u, "");
}

function ensureScope(repositoryPath: string, context: GitPullRemoteChangesContext | undefined): GitPullRemoteChangesResult | undefined {
  const allowedRoots = cleanList(context?.allowedRepositoryRoots).map(normalizeAllowedRoot);
  if (allowedRoots.length === 0) return undefined;
  const allowed = allowedRoots.some((root) => repositoryPath === root || repositoryPath.startsWith(`${root}/`));
  return allowed
    ? undefined
    : failure("SCOPE_REJECTED", "git.pullRemoteChanges target repository is outside the allowed repository roots", "scope", context, repositoryPath);
}

function permissionsForTarget(): readonly GitPullRemoteChangesPermission[] {
  return ["git:read", "git:write", "filesystem:write", "network:egress"];
}

function ensurePermissions(target: GitPullRemoteChangesTarget, context: GitPullRemoteChangesContext | undefined): GitPullRemoteChangesResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) return undefined;
  const missing = permissionsForTarget().filter((permission) => !granted.includes(permission));
  return missing.length === 0
    ? undefined
    : failure("PERMISSION_DENIED", `git.pullRemoteChanges is missing permissions: ${missing.join(", ")}`, "permission", context, target.repositoryPath);
}

function ensureGovernance(target: GitPullRemoteChangesTarget, context: GitPullRemoteChangesContext): GitPullRemoteChangesResult | undefined {
  if (dryRunEnabled(context)) return undefined;
  if (context.guard?.allowed === true || context.guard?.accepted === true) return undefined;
  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "git.pullRemoteChanges requires an affirmative runtime guard for remote network execution",
    "governance",
    context,
    target.repositoryPath,
  );
}

function providerArgs(target: GitPullRemoteChangesTarget): readonly string[] {
  return [
    "pull",
    ...(target.prune ? ["--prune"] : []),
    ...(target.autostash ? ["--autostash"] : []),
    ...(target.integrationMode === "rebase" ? ["--rebase"] : []),
    ...(target.integrationMode === "ff-only" ? ["--ff-only"] : []),
    ...(target.remoteName === undefined ? [] : [target.remoteName]),
    ...(target.branchName === undefined ? [] : [target.branchName]),
  ];
}

function commandPreview(target: GitPullRemoteChangesTarget): readonly string[] {
  return ["git", "-C", target.repositoryPath, ...providerArgs(target)];
}

const runtimeEntry: GitPullRemoteChangesRuntimeEntry = {
  owner: "runtime",
  port: "BaseToolExecutorPort.git.runGit",
  method: "runGit",
  binary: "git",
  argvMode: "fixed-pull-remote-changes",
  allowedSubcommand: "pull",
};

function riskForTarget(): GitPullRemoteChangesRisk {
  return {
    category: "remote-network",
    riskLevel: "risky",
    mutatesRepository: true,
    mutatesWorkingTree: true,
    updatesRemoteTrackingRefs: true,
    integratesRemoteChanges: true,
    mayCreateConflicts: true,
    mayUseNetwork: true,
    spawnsProcess: true,
    requiresTapApproval: true,
    runtimeOwnsExecution: true,
  };
}

function plan(normalized: NormalizedRequest, dispatch: GitPullRemoteChangesPlan["dispatch"], dryRun: boolean): GitPullRemoteChangesPlan {
  return {
    toolId: "git.pullRemoteChanges",
    toolKind: "git.pullRemoteChanges",
    capability: "pull-remote-changes",
    runtimeId: runtimeId(normalized.context),
    invocationId: invocationId(normalized.context),
    repositoryPath: normalized.target.repositoryPath,
    remoteName: normalized.target.remoteName,
    branchName: normalized.target.branchName,
    integrationMode: normalized.target.integrationMode,
    gitArgs: providerArgs(normalized.target),
    commandPreview: commandPreview(normalized.target),
    requiredPermissions: permissionsForTarget(),
    runtimeEntry,
    risk: riskForTarget(),
    dispatch,
    dryRun,
    wouldContactRemote: true,
    wouldUpdateRemoteTrackingRefs: true,
    wouldMutateWorkingTree: true,
    unsafeSideEffects: true,
    outputEnvelope: { stdoutPreview: "", stderrPreview: "", parsed: false },
    audit: {
      guard: "git-remote-network-runtime-guard",
      event: "basicTool.git.pullRemoteChanges.planned",
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

function parsePullUpdateLine(line: string): GitPullRemoteUpdateEntry | undefined {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.startsWith("From ")) return undefined;
  if (/^(Already up to date|Updating |Fast-forward|Merge made by|Successfully rebased)/u.test(trimmed)) {
    return { raw: trimmed, operation: "update" };
  }
  const match = trimmed.match(/^(?:[*+-]\s+)?(?:\[(new branch|new tag|deleted)\]\s+)?(\S+)?(?:\s+->\s+(\S+))?/u);
  if (match === null) return { raw: trimmed, operation: "other" };
  const marker = match[1];
  const operation = marker === "new branch" ? "new" : marker === "new tag" ? "tag" : marker === "deleted" ? "delete" : "update";
  return { raw: trimmed, operation, source: match[2], destination: match[3] };
}

function collectConflictHints(stdout: string, stderr: string): readonly string[] {
  return `${stdout}\n${stderr}`
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => /conflict|CONFLICT|Automatic merge failed|rebase in progress/u.test(line));
}

export function parseGitPullRemoteChangesResult(
  providerResult: GitPullRemoteChangesProviderResult | undefined,
  target: GitPullRemoteChangesTarget,
): GitPullRemoteChangesEnvelope {
  const updateLines = providerResult === undefined
    ? []
    : `${providerResult.stdout}\n${providerResult.stderr}`
        .split(/\r?\n/u)
        .map(parsePullUpdateLine)
        .filter((entry): entry is GitPullRemoteUpdateEntry => entry !== undefined);
  return {
    parser: "git-pull-output-v1",
    remoteName: target.remoteName,
    branchName: target.branchName,
    integrationMode: target.integrationMode,
    autostash: target.autostash,
    prune: target.prune,
    exitCode: providerResult?.exitCode,
    stdoutLineCount: lineCount(providerResult?.stdout ?? ""),
    stderrLineCount: lineCount(providerResult?.stderr ?? ""),
    operationHint: providerResult === undefined ? undefined : firstOutputLine(providerResult.stdout, providerResult.stderr),
    updateLines,
    conflictHints: collectConflictHints(providerResult?.stdout ?? "", providerResult?.stderr ?? ""),
    pulled: providerResult?.exitCode === 0,
  };
}

function success(normalized: NormalizedRequest, dryRun: boolean, providerResult?: GitPullRemoteChangesProviderResult): GitPullRemoteChangesResult {
  const executionPlan = plan(normalized, dryRun ? "dry-run" : "runtime-git-executor", dryRun);
  return {
    ok: true,
    toolId: "git.pullRemoteChanges",
    plan: executionPlan,
    output: {
      kind: "agentCore.basicTool.git.pullRemoteChanges",
      target: normalized.target,
      runtimeEntry,
      risk: riskForTarget(),
      gitArgs: executionPlan.gitArgs,
      commandPreview: executionPlan.commandPreview,
      timeoutMs: normalized.timeoutMs ?? gitPullRemoteChangesDescriptor.defaultTimeoutMs,
      dryRun,
      executionBlocked: dryRun,
      providerCalled: providerResult !== undefined,
      exitCode: providerResult?.exitCode,
      stdout: providerResult?.stdout,
      stderr: providerResult?.stderr,
      permissionsRequired: permissionsForTarget(),
      unsafeSideEffects: true,
      mayUseNetwork: true,
      resultEnvelope: parseGitPullRemoteChangesResult(providerResult, normalized.target),
    },
    audit: [
      auditEvent(
        dryRun ? "agentCore.basicTool.git.pullRemoteChanges.dryRun" : "agentCore.basicTool.git.pullRemoteChanges.executed",
        normalized.context,
        normalized.target.repositoryPath,
        { remoteName: normalized.target.remoteName, exitCode: providerResult?.exitCode },
      ),
    ],
    events: [dryRun ? "basicTool.git.pullRemoteChanges.dryRun" : "basicTool.git.pullRemoteChanges.executed"],
  };
}

export function planGitRemotePull(request: GitPullRemoteChangesRequest = {}): GitPullRemoteChangesResult {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const scopeFailure = ensureScope(normalized.target.repositoryPath, normalized.context);
  if (scopeFailure !== undefined) return scopeFailure;
  const permissionFailure = ensurePermissions(normalized.target, normalized.context);
  if (permissionFailure !== undefined) return permissionFailure;
  return success(normalized, true);
}

export const planPullRemoteChanges = planGitRemotePull;
export const planGitPullRemoteChanges = planGitRemotePull;

export async function executeGitPullRemoteChanges(request: GitPullRemoteChangesRequest = {}): Promise<GitPullRemoteChangesResult> {
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
    return failure("PROVIDER_UNAVAILABLE", "git.pullRemoteChanges requires runtime.execEngine.git.runGit for real execution", "provider", normalized.context, normalized.target.repositoryPath);
  }
  try {
    const providerResult = await request.provider(
      { repositoryPath: normalized.target.repositoryPath, args: providerArgs(normalized.target), timeoutMs: normalized.timeoutMs },
      normalized.context,
    );
    return success(normalized, false, providerResult);
  } catch {
    return failure("PROVIDER_REJECTED", "git.pullRemoteChanges provider rejected the request or failed safely", "provider", normalized.context, normalized.target.repositoryPath);
  }
}
