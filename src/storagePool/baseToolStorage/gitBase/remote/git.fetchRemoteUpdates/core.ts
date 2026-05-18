/*
 * git.fetchRemoteUpdates storage core.
 * Owns the fixed git fetch contract and delegates host execution to BaseToolExecutorPort.git.runGit.
 */

export type GitFetchRemoteTagsMode = "default" | "tags" | "no-tags";
export type GitFetchRemoteUpdatesPermission = "git:read" | "git:write" | "filesystem:write" | "network:egress";
export type GitFetchRemoteUpdatesRiskCategory = "remote-network";

export type GitFetchRemoteUpdatesGuard = { allowed?: boolean; accepted?: boolean; reason?: string };

export type GitFetchRemoteUpdatesContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: GitFetchRemoteUpdatesGuard;
  allowedRepositoryRoots?: readonly string[];
  grantedPermissions?: readonly GitFetchRemoteUpdatesPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type GitFetchRemoteUpdatesTarget = {
  repositoryPath: string;
  remoteName?: string;
  refspecs: readonly string[];
  prune: boolean;
  tagsMode: GitFetchRemoteTagsMode;
};

export type GitFetchRemoteUpdatesRequest = {
  target?: Partial<GitFetchRemoteUpdatesTarget>;
  context?: GitFetchRemoteUpdatesContext;
  provider?: GitFetchRemoteUpdatesProvider;
  timeoutMs?: number;
  metadata?: Readonly<Record<string, unknown>>;
  runtimeId?: string;
  invocationId?: string;
  repositoryPath?: string;
  cwd?: string;
  remoteName?: string;
  remote?: string;
  refspecs?: readonly string[];
  prune?: boolean;
  tagsMode?: GitFetchRemoteTagsMode;
  dryRun?: boolean;
};

export type GitFetchRemoteUpdatesRuntimeEntry = {
  owner: "runtime";
  port: "BaseToolExecutorPort.git.runGit";
  method: "runGit";
  binary: "git";
  argvMode: "fixed-fetch-remote-updates";
  allowedSubcommand: "fetch";
};

export type GitFetchRemoteUpdatesRisk = {
  category: GitFetchRemoteUpdatesRiskCategory;
  riskLevel: "risky";
  mutatesRepository: true;
  mutatesWorkingTree: false;
  updatesRemoteTrackingRefs: true;
  mayUseNetwork: true;
  spawnsProcess: true;
  requiresTapApproval: true;
  runtimeOwnsExecution: true;
};

export type GitFetchRemoteUpdateEntry = {
  raw: string;
  operation?: "new" | "update" | "delete" | "tag" | "other";
  source?: string;
  destination?: string;
};

export type GitFetchRemoteUpdatesEnvelope = {
  parser: "git-fetch-output-v1";
  remoteName?: string;
  refspecs: readonly string[];
  prune: boolean;
  tagsMode: GitFetchRemoteTagsMode;
  exitCode?: number;
  stdoutLineCount: number;
  stderrLineCount: number;
  operationHint?: string;
  updateLines: readonly GitFetchRemoteUpdateEntry[];
  fetched: boolean;
};

export type GitFetchRemoteUpdatesOutput = {
  kind: "agentCore.basicTool.git.fetchRemoteUpdates";
  target: GitFetchRemoteUpdatesTarget;
  runtimeEntry: GitFetchRemoteUpdatesRuntimeEntry;
  risk: GitFetchRemoteUpdatesRisk;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  timeoutMs: number;
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  permissionsRequired: readonly GitFetchRemoteUpdatesPermission[];
  unsafeSideEffects: true;
  mayUseNetwork: true;
  resultEnvelope: GitFetchRemoteUpdatesEnvelope;
};

export type GitFetchRemoteUpdatesPlan = {
  toolId: "git.fetchRemoteUpdates";
  toolKind: "git.fetchRemoteUpdates";
  capability: "fetch-remote-updates";
  runtimeId: string;
  invocationId: string;
  repositoryPath: string;
  remoteName?: string;
  refspecs: readonly string[];
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  requiredPermissions: readonly GitFetchRemoteUpdatesPermission[];
  runtimeEntry: GitFetchRemoteUpdatesRuntimeEntry;
  risk: GitFetchRemoteUpdatesRisk;
  dispatch: "dry-run" | "runtime-git-executor";
  dryRun: boolean;
  wouldContactRemote: true;
  wouldUpdateRemoteTrackingRefs: true;
  unsafeSideEffects: true;
  outputEnvelope: { stdoutPreview: ""; stderrPreview: ""; parsed: false };
  audit: {
    guard: "git-remote-network-runtime-guard";
    event: "basicTool.git.fetchRemoteUpdates.planned";
    governanceRequired: true;
    tapCanWrap: true;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type GitFetchRemoteUpdatesErrorBoundary = "input" | "scope" | "permission" | "governance" | "provider";
export type GitFetchRemoteUpdatesErrorCode =
  | "MISSING_REPOSITORY_PATH"
  | "INVALID_ARGUMENT"
  | "INVALID_CONTEXT"
  | "INVALID_TIMEOUT"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type GitFetchRemoteUpdatesError = {
  code: GitFetchRemoteUpdatesErrorCode;
  message: string;
  boundary: GitFetchRemoteUpdatesErrorBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type GitFetchRemoteUpdatesAuditEvent = {
  type: string;
  toolId: "git.fetchRemoteUpdates";
  invocationId: string;
  dryRun: boolean;
  repositoryPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type GitFetchRemoteUpdatesResult =
  | {
      ok: true;
      toolId: "git.fetchRemoteUpdates";
      output: GitFetchRemoteUpdatesOutput;
      plan: GitFetchRemoteUpdatesPlan;
      audit: readonly GitFetchRemoteUpdatesAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "git.fetchRemoteUpdates";
      error: GitFetchRemoteUpdatesError;
      audit: readonly GitFetchRemoteUpdatesAuditEvent[];
      events: readonly string[];
    };

export type GitFetchRemoteUpdatesProviderRequest = { repositoryPath: string; args: readonly string[]; timeoutMs?: number };
export type GitFetchRemoteUpdatesProviderResult = { exitCode: number; stdout: string; stderr: string };
export type GitFetchRemoteUpdatesProvider = (
  request: GitFetchRemoteUpdatesProviderRequest,
  context: GitFetchRemoteUpdatesContext,
) => GitFetchRemoteUpdatesProviderResult | Promise<GitFetchRemoteUpdatesProviderResult>;

type NormalizedRequest = { target: GitFetchRemoteUpdatesTarget; context: GitFetchRemoteUpdatesContext; timeoutMs?: number };

export const gitFetchRemoteUpdatesDescriptor = {
  toolId: "git.fetchRemoteUpdates",
  toolKind: "git.fetchRemoteUpdates",
  capability: "fetch-remote-updates",
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

function dryRunEnabled(context: GitFetchRemoteUpdatesContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: GitFetchRemoteUpdatesContext | undefined): string {
  return stringValue(context?.invocationId)?.trim() || "git.fetchRemoteUpdates:dry-run";
}

function runtimeId(context: GitFetchRemoteUpdatesContext | undefined): string {
  return stringValue(context?.runtimeId)?.trim() || "runtime.unspecified";
}

function auditEvent(
  type: string,
  context: GitFetchRemoteUpdatesContext | undefined,
  repositoryPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): GitFetchRemoteUpdatesAuditEvent {
  return {
    type,
    toolId: gitFetchRemoteUpdatesDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    repositoryPath,
    metadata: { ...(context?.auditMetadata ?? {}), ...(metadata ?? {}) },
  };
}

function failure(
  code: GitFetchRemoteUpdatesErrorCode,
  message: string,
  boundary: GitFetchRemoteUpdatesErrorBoundary,
  context: GitFetchRemoteUpdatesContext | undefined,
  repositoryPath?: string,
): GitFetchRemoteUpdatesResult {
  return {
    ok: false,
    toolId: gitFetchRemoteUpdatesDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.git.fetchRemoteUpdates.rejected", context, repositoryPath, { code })],
    events: ["basicTool.git.fetchRemoteUpdates.rejected"],
  };
}

function normalizeContext(rawContext: unknown, legacyRequest: Record<string, unknown>): GitFetchRemoteUpdatesContext | GitFetchRemoteUpdatesResult {
  const contextRecord = rawContext === undefined ? {} : rawContext;
  if (!isRecord(contextRecord)) return failure("INVALID_CONTEXT", "git.fetchRemoteUpdates context must be an object", "input", undefined);
  const guard = contextRecord.guard;
  if (guard !== undefined && !isRecord(guard)) {
    return failure("INVALID_CONTEXT", "git.fetchRemoteUpdates context.guard must be an object", "input", undefined);
  }
  const allowedRepositoryRoots = stringArrayValue(contextRecord.allowedRepositoryRoots);
  if (contextRecord.allowedRepositoryRoots !== undefined && allowedRepositoryRoots === undefined) {
    return failure("INVALID_CONTEXT", "git.fetchRemoteUpdates context.allowedRepositoryRoots must be a string array", "input", undefined);
  }
  const grantedPermissions = stringArrayValue(contextRecord.grantedPermissions);
  if (contextRecord.grantedPermissions !== undefined && grantedPermissions === undefined) {
    return failure("INVALID_CONTEXT", "git.fetchRemoteUpdates context.grantedPermissions must be a string array", "input", undefined);
  }
  const auditMetadata = isRecord(contextRecord.auditMetadata) ? contextRecord.auditMetadata : undefined;
  if (contextRecord.auditMetadata !== undefined && auditMetadata === undefined) {
    return failure("INVALID_CONTEXT", "git.fetchRemoteUpdates context.auditMetadata must be an object", "input", undefined);
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
    grantedPermissions: grantedPermissions as readonly GitFetchRemoteUpdatesPermission[] | undefined,
    auditMetadata,
  };
}

function normalizeRepositoryPath(value: unknown, context: GitFetchRemoteUpdatesContext | undefined): string | GitFetchRemoteUpdatesResult {
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) return failure("MISSING_REPOSITORY_PATH", "git.fetchRemoteUpdates requires target.repositoryPath", "input", context);
  if (normalized.includes("\0")) return failure("INVALID_ARGUMENT", "git.fetchRemoteUpdates repositoryPath cannot contain NUL bytes", "input", context, normalized);
  return normalized;
}

function safeRemote(value: unknown, context: GitFetchRemoteUpdatesContext, repositoryPath: string): string | undefined | GitFetchRemoteUpdatesResult {
  if (value === undefined) return undefined;
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) return undefined;
  if (normalized.includes("\0") || /\s/u.test(normalized) || normalized.startsWith("-")) {
    return failure("INVALID_ARGUMENT", "git.fetchRemoteUpdates target.remoteName must be a safe remote name or URL", "input", context, repositoryPath);
  }
  return normalized;
}

function safeRefspecs(value: unknown, context: GitFetchRemoteUpdatesContext, repositoryPath: string): readonly string[] | GitFetchRemoteUpdatesResult {
  const refspecs = stringArrayValue(value);
  if (value !== undefined && refspecs === undefined) {
    return failure("INVALID_ARGUMENT", "git.fetchRemoteUpdates target.refspecs must be a string array", "input", context, repositoryPath);
  }
  const normalized: string[] = [];
  for (const refspec of cleanList(refspecs)) {
    if (refspec.includes("\0") || /\s/u.test(refspec) || refspec.startsWith("-")) {
      return failure("INVALID_ARGUMENT", "git.fetchRemoteUpdates target.refspecs must be safe refspec strings", "input", context, repositoryPath);
    }
    normalized.push(refspec);
  }
  return normalized;
}

function normalizeTagsMode(value: unknown, context: GitFetchRemoteUpdatesContext, repositoryPath: string): GitFetchRemoteTagsMode | GitFetchRemoteUpdatesResult {
  if (value === undefined || value === "default") return "default";
  if (value === "tags" || value === "no-tags") return value;
  return failure("INVALID_ARGUMENT", "git.fetchRemoteUpdates target.tagsMode must be default, tags, or no-tags", "input", context, repositoryPath);
}

function normalizeTimeout(value: unknown, context: GitFetchRemoteUpdatesContext, repositoryPath: string): number | undefined | GitFetchRemoteUpdatesResult {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > gitFetchRemoteUpdatesDescriptor.maxTimeoutMs) {
    return failure(
      "INVALID_TIMEOUT",
      `git.fetchRemoteUpdates timeoutMs must be an integer from 1 to ${gitFetchRemoteUpdatesDescriptor.maxTimeoutMs}`,
      "input",
      context,
      repositoryPath,
    );
  }
  return value;
}

function normalizeRequest(request: unknown): NormalizedRequest | GitFetchRemoteUpdatesResult {
  if (request !== undefined && !isRecord(request)) {
    return failure("INVALID_ARGUMENT", "git.fetchRemoteUpdates request must be an object", "input", undefined);
  }
  const requestRecord = isRecord(request) ? request : {};
  const context = normalizeContext(requestRecord.context, requestRecord);
  if ("ok" in context) return context;
  const targetRecord = isRecord(requestRecord.target) ? requestRecord.target : requestRecord;
  if (requestRecord.target !== undefined && !isRecord(requestRecord.target)) {
    return failure("INVALID_ARGUMENT", "git.fetchRemoteUpdates target must be an object", "input", context);
  }
  const repositoryPath = normalizeRepositoryPath(targetRecord.repositoryPath ?? requestRecord.repositoryPath ?? requestRecord.cwd, context);
  if (typeof repositoryPath !== "string") return repositoryPath;
  const remoteName = safeRemote(targetRecord.remoteName ?? targetRecord.remote ?? requestRecord.remoteName ?? requestRecord.remote, context, repositoryPath);
  if (remoteName !== undefined && typeof remoteName !== "string") return remoteName;
  const refspecs = safeRefspecs(targetRecord.refspecs ?? requestRecord.refspecs, context, repositoryPath);
  if ("ok" in refspecs) return refspecs;
  const tagsMode = normalizeTagsMode(targetRecord.tagsMode ?? requestRecord.tagsMode, context, repositoryPath);
  if (typeof tagsMode !== "string") return tagsMode;
  const timeoutMs = normalizeTimeout(requestRecord.timeoutMs, context, repositoryPath);
  if (timeoutMs !== undefined && typeof timeoutMs !== "number") return timeoutMs;
  return {
    target: {
      repositoryPath,
      remoteName,
      refspecs,
      prune: booleanValue(targetRecord.prune) ?? booleanValue(requestRecord.prune) ?? false,
      tagsMode,
    },
    context,
    timeoutMs,
  };
}

function normalizeAllowedRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/u, "");
}

function ensureScope(repositoryPath: string, context: GitFetchRemoteUpdatesContext | undefined): GitFetchRemoteUpdatesResult | undefined {
  const allowedRoots = cleanList(context?.allowedRepositoryRoots).map(normalizeAllowedRoot);
  if (allowedRoots.length === 0) return undefined;
  const allowed = allowedRoots.some((root) => repositoryPath === root || repositoryPath.startsWith(`${root}/`));
  return allowed
    ? undefined
    : failure("SCOPE_REJECTED", "git.fetchRemoteUpdates target repository is outside the allowed repository roots", "scope", context, repositoryPath);
}

function permissionsForTarget(): readonly GitFetchRemoteUpdatesPermission[] {
  return ["git:read", "git:write", "filesystem:write", "network:egress"];
}

function ensurePermissions(target: GitFetchRemoteUpdatesTarget, context: GitFetchRemoteUpdatesContext | undefined): GitFetchRemoteUpdatesResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) return undefined;
  const missing = permissionsForTarget().filter((permission) => !granted.includes(permission));
  return missing.length === 0
    ? undefined
    : failure("PERMISSION_DENIED", `git.fetchRemoteUpdates is missing permissions: ${missing.join(", ")}`, "permission", context, target.repositoryPath);
}

function ensureGovernance(target: GitFetchRemoteUpdatesTarget, context: GitFetchRemoteUpdatesContext): GitFetchRemoteUpdatesResult | undefined {
  if (dryRunEnabled(context)) return undefined;
  if (context.guard?.allowed === true || context.guard?.accepted === true) return undefined;
  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "git.fetchRemoteUpdates requires an affirmative runtime guard for remote network execution",
    "governance",
    context,
    target.repositoryPath,
  );
}

function providerArgs(target: GitFetchRemoteUpdatesTarget): readonly string[] {
  return [
    "fetch",
    ...(target.prune ? ["--prune"] : []),
    ...(target.tagsMode === "tags" ? ["--tags"] : []),
    ...(target.tagsMode === "no-tags" ? ["--no-tags"] : []),
    ...(target.remoteName === undefined ? [] : [target.remoteName]),
    ...target.refspecs,
  ];
}

function commandPreview(target: GitFetchRemoteUpdatesTarget): readonly string[] {
  return ["git", "-C", target.repositoryPath, ...providerArgs(target)];
}

const runtimeEntry: GitFetchRemoteUpdatesRuntimeEntry = {
  owner: "runtime",
  port: "BaseToolExecutorPort.git.runGit",
  method: "runGit",
  binary: "git",
  argvMode: "fixed-fetch-remote-updates",
  allowedSubcommand: "fetch",
};

function riskForTarget(): GitFetchRemoteUpdatesRisk {
  return {
    category: "remote-network",
    riskLevel: "risky",
    mutatesRepository: true,
    mutatesWorkingTree: false,
    updatesRemoteTrackingRefs: true,
    mayUseNetwork: true,
    spawnsProcess: true,
    requiresTapApproval: true,
    runtimeOwnsExecution: true,
  };
}

function plan(normalized: NormalizedRequest, dispatch: GitFetchRemoteUpdatesPlan["dispatch"], dryRun: boolean): GitFetchRemoteUpdatesPlan {
  return {
    toolId: "git.fetchRemoteUpdates",
    toolKind: "git.fetchRemoteUpdates",
    capability: "fetch-remote-updates",
    runtimeId: runtimeId(normalized.context),
    invocationId: invocationId(normalized.context),
    repositoryPath: normalized.target.repositoryPath,
    remoteName: normalized.target.remoteName,
    refspecs: normalized.target.refspecs,
    gitArgs: providerArgs(normalized.target),
    commandPreview: commandPreview(normalized.target),
    requiredPermissions: permissionsForTarget(),
    runtimeEntry,
    risk: riskForTarget(),
    dispatch,
    dryRun,
    wouldContactRemote: true,
    wouldUpdateRemoteTrackingRefs: true,
    unsafeSideEffects: true,
    outputEnvelope: { stdoutPreview: "", stderrPreview: "", parsed: false },
    audit: {
      guard: "git-remote-network-runtime-guard",
      event: "basicTool.git.fetchRemoteUpdates.planned",
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

function parseFetchUpdateLine(line: string): GitFetchRemoteUpdateEntry | undefined {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.startsWith("From ")) return undefined;
  const match = trimmed.match(/^(?:[*+-]\s+)?(?:\[(new branch|new tag|deleted)\]\s+)?(\S+)?(?:\s+->\s+(\S+))?/u);
  if (match === null) return { raw: trimmed, operation: "other" };
  const marker = match[1];
  const operation = marker === "new branch" ? "new" : marker === "new tag" ? "tag" : marker === "deleted" ? "delete" : "update";
  return { raw: trimmed, operation, source: match[2], destination: match[3] };
}

export function parseGitFetchRemoteUpdatesResult(
  providerResult: GitFetchRemoteUpdatesProviderResult | undefined,
  target: GitFetchRemoteUpdatesTarget,
): GitFetchRemoteUpdatesEnvelope {
  const updateLines = providerResult === undefined
    ? []
    : `${providerResult.stdout}\n${providerResult.stderr}`
        .split(/\r?\n/u)
        .map(parseFetchUpdateLine)
        .filter((entry): entry is GitFetchRemoteUpdateEntry => entry !== undefined);
  return {
    parser: "git-fetch-output-v1",
    remoteName: target.remoteName,
    refspecs: target.refspecs,
    prune: target.prune,
    tagsMode: target.tagsMode,
    exitCode: providerResult?.exitCode,
    stdoutLineCount: lineCount(providerResult?.stdout ?? ""),
    stderrLineCount: lineCount(providerResult?.stderr ?? ""),
    operationHint: providerResult === undefined ? undefined : firstOutputLine(providerResult.stdout, providerResult.stderr),
    updateLines,
    fetched: providerResult?.exitCode === 0,
  };
}

function success(normalized: NormalizedRequest, dryRun: boolean, providerResult?: GitFetchRemoteUpdatesProviderResult): GitFetchRemoteUpdatesResult {
  const executionPlan = plan(normalized, dryRun ? "dry-run" : "runtime-git-executor", dryRun);
  return {
    ok: true,
    toolId: "git.fetchRemoteUpdates",
    plan: executionPlan,
    output: {
      kind: "agentCore.basicTool.git.fetchRemoteUpdates",
      target: normalized.target,
      runtimeEntry,
      risk: riskForTarget(),
      gitArgs: executionPlan.gitArgs,
      commandPreview: executionPlan.commandPreview,
      timeoutMs: normalized.timeoutMs ?? gitFetchRemoteUpdatesDescriptor.defaultTimeoutMs,
      dryRun,
      executionBlocked: dryRun,
      providerCalled: providerResult !== undefined,
      exitCode: providerResult?.exitCode,
      stdout: providerResult?.stdout,
      stderr: providerResult?.stderr,
      permissionsRequired: permissionsForTarget(),
      unsafeSideEffects: true,
      mayUseNetwork: true,
      resultEnvelope: parseGitFetchRemoteUpdatesResult(providerResult, normalized.target),
    },
    audit: [
      auditEvent(
        dryRun ? "agentCore.basicTool.git.fetchRemoteUpdates.dryRun" : "agentCore.basicTool.git.fetchRemoteUpdates.executed",
        normalized.context,
        normalized.target.repositoryPath,
        { remoteName: normalized.target.remoteName, exitCode: providerResult?.exitCode },
      ),
    ],
    events: [dryRun ? "basicTool.git.fetchRemoteUpdates.dryRun" : "basicTool.git.fetchRemoteUpdates.executed"],
  };
}

export function planFetchRemoteUpdates(request: GitFetchRemoteUpdatesRequest = {}): GitFetchRemoteUpdatesResult {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const scopeFailure = ensureScope(normalized.target.repositoryPath, normalized.context);
  if (scopeFailure !== undefined) return scopeFailure;
  const permissionFailure = ensurePermissions(normalized.target, normalized.context);
  if (permissionFailure !== undefined) return permissionFailure;
  return success(normalized, true);
}

export const planGitFetchRemoteUpdates = planFetchRemoteUpdates;

export async function executeGitFetchRemoteUpdates(request: GitFetchRemoteUpdatesRequest = {}): Promise<GitFetchRemoteUpdatesResult> {
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
    return failure("PROVIDER_UNAVAILABLE", "git.fetchRemoteUpdates requires runtime.execEngine.git.runGit for real execution", "provider", normalized.context, normalized.target.repositoryPath);
  }
  try {
    const providerResult = await request.provider(
      { repositoryPath: normalized.target.repositoryPath, args: providerArgs(normalized.target), timeoutMs: normalized.timeoutMs },
      normalized.context,
    );
    return success(normalized, false, providerResult);
  } catch {
    return failure("PROVIDER_REJECTED", "git.fetchRemoteUpdates provider rejected the request or failed safely", "provider", normalized.context, normalized.target.repositoryPath);
  }
}
