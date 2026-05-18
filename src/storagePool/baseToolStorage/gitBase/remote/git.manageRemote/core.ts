/*
 * git.manageRemote storage core.
 * Owns the fixed git remote contract and delegates host execution to BaseToolExecutorPort.git.runGit.
 */

export type GitManageRemoteAction = "list" | "show" | "add" | "remove" | "rename" | "set-url";
export type GitRemoteUrlMode = "fetch" | "push";
export type GitManageRemotePermission = "git:read" | "git:write" | "filesystem:read" | "filesystem:write";
export type GitManageRemoteRiskCategory = "read-only-inspection" | "workspace-mutation";

export type GitManageRemoteGuard = { allowed?: boolean; accepted?: boolean; reason?: string };

export type GitManageRemoteContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: GitManageRemoteGuard;
  allowedRepositoryRoots?: readonly string[];
  grantedPermissions?: readonly GitManageRemotePermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type GitManageRemoteTarget = {
  repositoryPath: string;
  action: GitManageRemoteAction;
  remoteName?: string;
  newRemoteName?: string;
  remoteUrl?: string;
  urlMode: GitRemoteUrlMode;
};

export type GitManageRemoteRequest = {
  target?: Partial<GitManageRemoteTarget>;
  context?: GitManageRemoteContext;
  provider?: GitManageRemoteProvider;
  timeoutMs?: number;
  metadata?: Readonly<Record<string, unknown>>;
  runtimeId?: string;
  invocationId?: string;
  repositoryPath?: string;
  action?: GitManageRemoteAction;
  remoteName?: string;
  newRemoteName?: string;
  remoteUrl?: string;
  urlMode?: GitRemoteUrlMode;
  dryRun?: boolean;
};

export type GitManageRemoteRuntimeEntry = {
  owner: "runtime";
  port: "BaseToolExecutorPort.git.runGit";
  method: "runGit";
  binary: "git";
  argvMode: "fixed-manage-remote";
  allowedSubcommand: "remote";
};

export type GitManageRemoteRisk = {
  category: GitManageRemoteRiskCategory;
  riskLevel: "normal" | "risky";
  mutatesRepository: boolean;
  mutatesWorkingTree: boolean;
  mutatesRemoteConfig: boolean;
  mayUseNetwork: false;
  spawnsProcess: true;
  requiresTapApproval: boolean;
  runtimeOwnsExecution: true;
};

export type GitRemoteEntry = {
  name: string;
  url: string;
  mode?: "fetch" | "push";
};

export type GitManageRemoteEnvelope = {
  parser: "git-remote-output-v1";
  action: GitManageRemoteAction;
  remoteName?: string;
  newRemoteName?: string;
  remoteUrl?: string;
  urlMode: GitRemoteUrlMode;
  exitCode?: number;
  stdoutLineCount: number;
  stderrLineCount: number;
  operationHint?: string;
  remotes: readonly GitRemoteEntry[];
  remoteChanged: boolean;
};

export type GitManageRemoteOutput = {
  kind: "agentCore.basicTool.git.manageRemote";
  target: GitManageRemoteTarget;
  runtimeEntry: GitManageRemoteRuntimeEntry;
  risk: GitManageRemoteRisk;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  timeoutMs: number;
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  permissionsRequired: readonly GitManageRemotePermission[];
  unsafeSideEffects: boolean;
  resultEnvelope: GitManageRemoteEnvelope;
};

export type GitManageRemotePlan = {
  toolId: "git.manageRemote";
  toolKind: "git.manageRemote";
  capability: "manage-remote";
  runtimeId: string;
  invocationId: string;
  repositoryPath: string;
  action: GitManageRemoteAction;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  requiredPermissions: readonly GitManageRemotePermission[];
  runtimeEntry: GitManageRemoteRuntimeEntry;
  risk: GitManageRemoteRisk;
  dispatch: "dry-run" | "runtime-git-executor";
  dryRun: boolean;
  wouldMutateRepository: boolean;
  unsafeSideEffects: boolean;
  outputEnvelope: { stdoutPreview: ""; stderrPreview: ""; parsed: false };
  audit: {
    guard: "git-remote-config-runtime-guard";
    event: "basicTool.git.manageRemote.planned";
    governanceRequired: boolean;
    tapCanWrap: true;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type GitManageRemoteErrorBoundary = "input" | "scope" | "permission" | "governance" | "provider";
export type GitManageRemoteErrorCode =
  | "MISSING_REPOSITORY_PATH"
  | "MISSING_REQUIRED_FIELD"
  | "INVALID_ACTION"
  | "INVALID_ARGUMENT"
  | "INVALID_CONTEXT"
  | "INVALID_TIMEOUT"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type GitManageRemoteError = {
  code: GitManageRemoteErrorCode;
  message: string;
  boundary: GitManageRemoteErrorBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type GitManageRemoteAuditEvent = {
  type: string;
  toolId: "git.manageRemote";
  invocationId: string;
  dryRun: boolean;
  repositoryPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type GitManageRemoteResult =
  | {
      ok: true;
      toolId: "git.manageRemote";
      output: GitManageRemoteOutput;
      plan: GitManageRemotePlan;
      audit: readonly GitManageRemoteAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "git.manageRemote";
      error: GitManageRemoteError;
      audit: readonly GitManageRemoteAuditEvent[];
      events: readonly string[];
    };

export type GitManageRemoteProviderRequest = { repositoryPath: string; args: readonly string[]; timeoutMs?: number };
export type GitManageRemoteProviderResult = { exitCode: number; stdout: string; stderr: string };
export type GitManageRemoteProvider = (
  request: GitManageRemoteProviderRequest,
  context: GitManageRemoteContext,
) => GitManageRemoteProviderResult | Promise<GitManageRemoteProviderResult>;

type NormalizedRequest = { target: GitManageRemoteTarget; context: GitManageRemoteContext; timeoutMs?: number };

export const gitManageRemoteDescriptor = {
  toolId: "git.manageRemote",
  toolKind: "git.manageRemote",
  capability: "manage-remote",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.remote",
  defaultDryRun: true,
  defaultDispatch: "dry-run",
  tapOwnsApproval: true,
  requiresTapApproval: true,
  runtimeEntryPort: "BaseToolExecutorPort.git.runGit",
  operationRisk: "remote-config-management",
  permissionsRequired: ["git:read", "filesystem:read"],
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

function dryRunEnabled(context: GitManageRemoteContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: GitManageRemoteContext | undefined): string {
  return stringValue(context?.invocationId)?.trim() || "git.manageRemote:dry-run";
}

function runtimeId(context: GitManageRemoteContext | undefined): string {
  return stringValue(context?.runtimeId)?.trim() || "runtime.unspecified";
}

function auditEvent(
  type: string,
  context: GitManageRemoteContext | undefined,
  repositoryPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): GitManageRemoteAuditEvent {
  return {
    type,
    toolId: gitManageRemoteDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    repositoryPath,
    metadata: { ...(context?.auditMetadata ?? {}), ...(metadata ?? {}) },
  };
}

function failure(
  code: GitManageRemoteErrorCode,
  message: string,
  boundary: GitManageRemoteErrorBoundary,
  context: GitManageRemoteContext | undefined,
  repositoryPath?: string,
): GitManageRemoteResult {
  return {
    ok: false,
    toolId: gitManageRemoteDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.git.manageRemote.rejected", context, repositoryPath, { code })],
    events: ["basicTool.git.manageRemote.rejected"],
  };
}

function normalizeContext(rawContext: unknown, legacyRequest: Record<string, unknown>): GitManageRemoteContext | GitManageRemoteResult {
  const contextRecord = rawContext === undefined ? {} : rawContext;
  if (!isRecord(contextRecord)) return failure("INVALID_CONTEXT", "git.manageRemote context must be an object", "input", undefined);
  const guard = contextRecord.guard;
  if (guard !== undefined && !isRecord(guard)) {
    return failure("INVALID_CONTEXT", "git.manageRemote context.guard must be an object", "input", undefined);
  }
  const allowedRepositoryRoots = stringArrayValue(contextRecord.allowedRepositoryRoots);
  if (contextRecord.allowedRepositoryRoots !== undefined && allowedRepositoryRoots === undefined) {
    return failure("INVALID_CONTEXT", "git.manageRemote context.allowedRepositoryRoots must be a string array", "input", undefined);
  }
  const grantedPermissions = stringArrayValue(contextRecord.grantedPermissions);
  if (contextRecord.grantedPermissions !== undefined && grantedPermissions === undefined) {
    return failure("INVALID_CONTEXT", "git.manageRemote context.grantedPermissions must be a string array", "input", undefined);
  }
  const auditMetadata = isRecord(contextRecord.auditMetadata) ? contextRecord.auditMetadata : undefined;
  if (contextRecord.auditMetadata !== undefined && auditMetadata === undefined) {
    return failure("INVALID_CONTEXT", "git.manageRemote context.auditMetadata must be an object", "input", undefined);
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
    grantedPermissions: grantedPermissions as readonly GitManageRemotePermission[] | undefined,
    auditMetadata,
  };
}

function normalizeAction(value: unknown, context: GitManageRemoteContext): GitManageRemoteAction | GitManageRemoteResult {
  const action = stringValue(value)?.trim() || "list";
  if (
    action === "list" ||
    action === "show" ||
    action === "add" ||
    action === "remove" ||
    action === "rename" ||
    action === "set-url"
  ) {
    return action;
  }
  return failure("INVALID_ACTION", "git.manageRemote target.action must be list, show, add, remove, rename, or set-url", "input", context);
}

function normalizeRepositoryPath(value: unknown, context: GitManageRemoteContext | undefined): string | GitManageRemoteResult {
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) return failure("MISSING_REPOSITORY_PATH", "git.manageRemote requires target.repositoryPath", "input", context);
  if (normalized.includes("\0")) return failure("INVALID_ARGUMENT", "git.manageRemote repositoryPath cannot contain NUL bytes", "input", context, normalized);
  return normalized;
}

function safeAtom(
  value: unknown,
  field: string,
  context: GitManageRemoteContext,
  repositoryPath: string,
  required: boolean,
): string | undefined | GitManageRemoteResult {
  if (value === undefined) {
    return required ? failure("MISSING_REQUIRED_FIELD", `git.manageRemote requires ${field}`, "input", context, repositoryPath) : undefined;
  }
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) {
    return required ? failure("MISSING_REQUIRED_FIELD", `git.manageRemote requires ${field}`, "input", context, repositoryPath) : undefined;
  }
  if (normalized.includes("\0") || /\s/u.test(normalized) || normalized.startsWith("-")) {
    return failure("INVALID_ARGUMENT", `git.manageRemote ${field} must be a safe remote name`, "input", context, repositoryPath);
  }
  return normalized;
}

function safeRemoteUrl(
  value: unknown,
  context: GitManageRemoteContext,
  repositoryPath: string,
  required: boolean,
): string | undefined | GitManageRemoteResult {
  if (value === undefined) {
    return required ? failure("MISSING_REQUIRED_FIELD", "git.manageRemote requires target.remoteUrl", "input", context, repositoryPath) : undefined;
  }
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) {
    return required ? failure("MISSING_REQUIRED_FIELD", "git.manageRemote requires target.remoteUrl", "input", context, repositoryPath) : undefined;
  }
  if (normalized.includes("\0") || /\s/u.test(normalized) || normalized.startsWith("-")) {
    return failure("INVALID_ARGUMENT", "git.manageRemote target.remoteUrl must be a safe URL or path", "input", context, repositoryPath);
  }
  return normalized;
}

function normalizeUrlMode(value: unknown): GitRemoteUrlMode {
  return value === "push" ? "push" : "fetch";
}

function normalizeTimeout(value: unknown, context: GitManageRemoteContext, repositoryPath: string): number | undefined | GitManageRemoteResult {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > gitManageRemoteDescriptor.maxTimeoutMs) {
    return failure(
      "INVALID_TIMEOUT",
      `git.manageRemote timeoutMs must be an integer from 1 to ${gitManageRemoteDescriptor.maxTimeoutMs}`,
      "input",
      context,
      repositoryPath,
    );
  }
  return value;
}

function normalizeRequest(request: unknown): NormalizedRequest | GitManageRemoteResult {
  if (request !== undefined && !isRecord(request)) {
    return failure("INVALID_ARGUMENT", "git.manageRemote request must be an object", "input", undefined);
  }
  const requestRecord = isRecord(request) ? request : {};
  const context = normalizeContext(requestRecord.context, requestRecord);
  if ("ok" in context) return context;
  const targetRecord = isRecord(requestRecord.target) ? requestRecord.target : requestRecord;
  if (requestRecord.target !== undefined && !isRecord(requestRecord.target)) {
    return failure("INVALID_ARGUMENT", "git.manageRemote target must be an object", "input", context);
  }
  const repositoryPath = normalizeRepositoryPath(targetRecord.repositoryPath, context);
  if (typeof repositoryPath !== "string") return repositoryPath;
  const action = normalizeAction(targetRecord.action, context);
  if (typeof action !== "string") return action;
  const remoteName = safeAtom(targetRecord.remoteName, "target.remoteName", context, repositoryPath, action !== "list");
  if (remoteName !== undefined && typeof remoteName !== "string") return remoteName;
  const newRemoteName = safeAtom(targetRecord.newRemoteName, "target.newRemoteName", context, repositoryPath, action === "rename");
  if (newRemoteName !== undefined && typeof newRemoteName !== "string") return newRemoteName;
  const remoteUrl = safeRemoteUrl(targetRecord.remoteUrl, context, repositoryPath, action === "add" || action === "set-url");
  if (remoteUrl !== undefined && typeof remoteUrl !== "string") return remoteUrl;
  const timeoutMs = normalizeTimeout(requestRecord.timeoutMs, context, repositoryPath);
  if (timeoutMs !== undefined && typeof timeoutMs !== "number") return timeoutMs;
  return {
    target: { repositoryPath, action, remoteName, newRemoteName, remoteUrl, urlMode: normalizeUrlMode(targetRecord.urlMode) },
    context,
    timeoutMs,
  };
}

function normalizeAllowedRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/u, "");
}

function ensureScope(repositoryPath: string, context: GitManageRemoteContext | undefined): GitManageRemoteResult | undefined {
  const allowedRoots = cleanList(context?.allowedRepositoryRoots).map(normalizeAllowedRoot);
  if (allowedRoots.length === 0) return undefined;
  const allowed = allowedRoots.some((root) => repositoryPath === root || repositoryPath.startsWith(`${root}/`));
  return allowed
    ? undefined
    : failure("SCOPE_REJECTED", "git.manageRemote target repository is outside the allowed repository roots", "scope", context, repositoryPath);
}

function mutatesRemoteConfig(target: GitManageRemoteTarget): boolean {
  return target.action !== "list" && target.action !== "show";
}

function permissionsForTarget(target: GitManageRemoteTarget): readonly GitManageRemotePermission[] {
  return mutatesRemoteConfig(target)
    ? ["git:read", "git:write", "filesystem:read", "filesystem:write"]
    : ["git:read", "filesystem:read"];
}

function ensurePermissions(target: GitManageRemoteTarget, context: GitManageRemoteContext | undefined): GitManageRemoteResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) return undefined;
  const missing = permissionsForTarget(target).filter((permission) => !granted.includes(permission));
  return missing.length === 0
    ? undefined
    : failure("PERMISSION_DENIED", `git.manageRemote is missing permissions: ${missing.join(", ")}`, "permission", context, target.repositoryPath);
}

function ensureGovernance(target: GitManageRemoteTarget, context: GitManageRemoteContext): GitManageRemoteResult | undefined {
  if (dryRunEnabled(context) || !mutatesRemoteConfig(target)) return undefined;
  if (context.guard?.allowed === true || context.guard?.accepted === true) return undefined;
  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "git.manageRemote requires an affirmative runtime guard for remote config mutations",
    "governance",
    context,
    target.repositoryPath,
  );
}

function providerArgs(target: GitManageRemoteTarget): readonly string[] {
  if (target.action === "list") return ["remote", "-v"];
  if (target.action === "show") return ["remote", "show", "-n", target.remoteName ?? ""];
  if (target.action === "add") return ["remote", "add", target.remoteName ?? "", target.remoteUrl ?? ""];
  if (target.action === "remove") return ["remote", "remove", target.remoteName ?? ""];
  if (target.action === "rename") return ["remote", "rename", target.remoteName ?? "", target.newRemoteName ?? ""];
  return ["remote", "set-url", ...(target.urlMode === "push" ? ["--push"] : []), target.remoteName ?? "", target.remoteUrl ?? ""];
}

function commandPreview(target: GitManageRemoteTarget): readonly string[] {
  return ["git", "-C", target.repositoryPath, ...providerArgs(target)];
}

const runtimeEntry: GitManageRemoteRuntimeEntry = {
  owner: "runtime",
  port: "BaseToolExecutorPort.git.runGit",
  method: "runGit",
  binary: "git",
  argvMode: "fixed-manage-remote",
  allowedSubcommand: "remote",
};

function riskForTarget(target: GitManageRemoteTarget): GitManageRemoteRisk {
  const mutation = mutatesRemoteConfig(target);
  return {
    category: mutation ? "workspace-mutation" : "read-only-inspection",
    riskLevel: mutation ? "risky" : "normal",
    mutatesRepository: mutation,
    mutatesWorkingTree: mutation,
    mutatesRemoteConfig: mutation,
    mayUseNetwork: false,
    spawnsProcess: true,
    requiresTapApproval: mutation,
    runtimeOwnsExecution: true,
  };
}

function plan(normalized: NormalizedRequest, dispatch: GitManageRemotePlan["dispatch"], dryRun: boolean): GitManageRemotePlan {
  const risk = riskForTarget(normalized.target);
  const mutation = mutatesRemoteConfig(normalized.target);
  return {
    toolId: "git.manageRemote",
    toolKind: "git.manageRemote",
    capability: "manage-remote",
    runtimeId: runtimeId(normalized.context),
    invocationId: invocationId(normalized.context),
    repositoryPath: normalized.target.repositoryPath,
    action: normalized.target.action,
    gitArgs: providerArgs(normalized.target),
    commandPreview: commandPreview(normalized.target),
    requiredPermissions: permissionsForTarget(normalized.target),
    runtimeEntry,
    risk,
    dispatch,
    dryRun,
    wouldMutateRepository: mutation,
    unsafeSideEffects: mutation,
    outputEnvelope: { stdoutPreview: "", stderrPreview: "", parsed: false },
    audit: {
      guard: "git-remote-config-runtime-guard",
      event: "basicTool.git.manageRemote.planned",
      governanceRequired: mutation,
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

function parseRemoteList(stdout: string): readonly GitRemoteEntry[] {
  const entries: GitRemoteEntry[] = [];
  for (const line of stdout.split(/\r?\n/u)) {
    const match = line.match(/^(\S+)\s+(\S+)(?:\s+\((fetch|push)\))?$/u);
    if (match === null) continue;
    entries.push({ name: match[1] ?? "", url: match[2] ?? "", mode: match[3] as "fetch" | "push" | undefined });
  }
  return entries;
}

export function parseGitManageRemoteResult(
  providerResult: GitManageRemoteProviderResult | undefined,
  target: GitManageRemoteTarget,
): GitManageRemoteEnvelope {
  return {
    parser: "git-remote-output-v1",
    action: target.action,
    remoteName: target.remoteName,
    newRemoteName: target.newRemoteName,
    remoteUrl: target.remoteUrl,
    urlMode: target.urlMode,
    exitCode: providerResult?.exitCode,
    stdoutLineCount: lineCount(providerResult?.stdout ?? ""),
    stderrLineCount: lineCount(providerResult?.stderr ?? ""),
    operationHint: providerResult === undefined ? undefined : firstOutputLine(providerResult.stdout, providerResult.stderr),
    remotes: providerResult === undefined ? [] : parseRemoteList(providerResult.stdout),
    remoteChanged: mutatesRemoteConfig(target) && providerResult?.exitCode === 0,
  };
}

function success(normalized: NormalizedRequest, dryRun: boolean, providerResult?: GitManageRemoteProviderResult): GitManageRemoteResult {
  const executionPlan = plan(normalized, dryRun ? "dry-run" : "runtime-git-executor", dryRun);
  return {
    ok: true,
    toolId: "git.manageRemote",
    plan: executionPlan,
    output: {
      kind: "agentCore.basicTool.git.manageRemote",
      target: normalized.target,
      runtimeEntry,
      risk: riskForTarget(normalized.target),
      gitArgs: executionPlan.gitArgs,
      commandPreview: executionPlan.commandPreview,
      timeoutMs: normalized.timeoutMs ?? gitManageRemoteDescriptor.defaultTimeoutMs,
      dryRun,
      executionBlocked: dryRun,
      providerCalled: providerResult !== undefined,
      exitCode: providerResult?.exitCode,
      stdout: providerResult?.stdout,
      stderr: providerResult?.stderr,
      permissionsRequired: permissionsForTarget(normalized.target),
      unsafeSideEffects: mutatesRemoteConfig(normalized.target),
      resultEnvelope: parseGitManageRemoteResult(providerResult, normalized.target),
    },
    audit: [
      auditEvent(
        dryRun ? "agentCore.basicTool.git.manageRemote.dryRun" : "agentCore.basicTool.git.manageRemote.executed",
        normalized.context,
        normalized.target.repositoryPath,
        { action: normalized.target.action, remoteName: normalized.target.remoteName, exitCode: providerResult?.exitCode },
      ),
    ],
    events: [dryRun ? "basicTool.git.manageRemote.dryRun" : "basicTool.git.manageRemote.executed"],
  };
}

export function planGitRemoteManagement(request: GitManageRemoteRequest = {}): GitManageRemoteResult {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const scopeFailure = ensureScope(normalized.target.repositoryPath, normalized.context);
  if (scopeFailure !== undefined) return scopeFailure;
  const permissionFailure = ensurePermissions(normalized.target, normalized.context);
  if (permissionFailure !== undefined) return permissionFailure;
  return success(normalized, true);
}

export const planGitManageRemote = planGitRemoteManagement;

export async function executeGitManageRemote(request: GitManageRemoteRequest = {}): Promise<GitManageRemoteResult> {
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
    return failure("PROVIDER_UNAVAILABLE", "git.manageRemote requires runtime.execEngine.git.runGit for real execution", "provider", normalized.context, normalized.target.repositoryPath);
  }
  try {
    const providerResult = await request.provider(
      { repositoryPath: normalized.target.repositoryPath, args: providerArgs(normalized.target), timeoutMs: normalized.timeoutMs },
      normalized.context,
    );
    return success(normalized, false, providerResult);
  } catch {
    return failure("PROVIDER_REJECTED", "git.manageRemote provider rejected the request or failed safely", "provider", normalized.context, normalized.target.repositoryPath);
  }
}
