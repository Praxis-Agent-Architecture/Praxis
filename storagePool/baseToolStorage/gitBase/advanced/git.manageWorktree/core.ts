/*
 * git.manageWorktree storage core.
 * Owns the fixed git worktree contract and delegates host execution to BaseToolExecutorPort.git.runGit.
 */

export type GitManageWorktreeAction = "list" | "add" | "remove" | "prune";
export type GitManageWorktreePermission = "git:read" | "git:write" | "filesystem:read" | "filesystem:write";
export type GitManageWorktreeRiskCategory = "read-only-inspection" | "workspace-mutation" | "destructive";

export type GitManageWorktreeGuard = { allowed?: boolean; accepted?: boolean; reason?: string };

export type GitManageWorktreeContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: GitManageWorktreeGuard;
  allowedRepositoryRoots?: readonly string[];
  grantedPermissions?: readonly GitManageWorktreePermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type GitManageWorktreeTarget = {
  repositoryPath: string;
  action: GitManageWorktreeAction;
  worktreePath?: string;
  targetRef?: string;
  branchName?: string;
  detach: boolean;
  force: boolean;
};

export type GitManageWorktreeRequest = {
  target?: Partial<GitManageWorktreeTarget>;
  context?: GitManageWorktreeContext;
  provider?: GitManageWorktreeProvider;
  timeoutMs?: number;
  metadata?: Readonly<Record<string, unknown>>;
  runtimeId?: string;
  invocationId?: string;
  repositoryPath?: string;
  cwd?: string;
  action?: GitManageWorktreeAction;
  worktreePath?: string;
  targetPath?: string;
  path?: string;
  targetRef?: string;
  ref?: string;
  branchName?: string;
  branch?: string;
  detach?: boolean;
  force?: boolean;
  dryRun?: boolean;
};

export type GitManageWorktreeRuntimeEntry = {
  owner: "runtime";
  port: "BaseToolExecutorPort.git.runGit";
  method: "runGit";
  binary: "git";
  argvMode: "fixed-manage-worktree";
  allowedSubcommand: "worktree";
};

export type GitManageWorktreeRisk = {
  category: GitManageWorktreeRiskCategory;
  riskLevel: "normal" | "risky" | "destructive";
  mutatesRepository: boolean;
  mutatesWorkingTree: boolean;
  mutatesFilesystem: boolean;
  managesWorktree: true;
  mayUseNetwork: false;
  spawnsProcess: true;
  requiresTapApproval: boolean;
  runtimeOwnsExecution: true;
};

export type GitWorktreeEntry = {
  path: string;
  head?: string;
  branch?: string;
  detached?: boolean;
  bare?: boolean;
  prunable?: boolean;
};

export type GitManageWorktreeEnvelope = {
  parser: "git-worktree-output-v1";
  action: GitManageWorktreeAction;
  worktreePath?: string;
  targetRef?: string;
  branchName?: string;
  exitCode?: number;
  stdoutLineCount: number;
  stderrLineCount: number;
  operationHint?: string;
  worktrees: readonly GitWorktreeEntry[];
  worktreeChanged: boolean;
};

export type GitManageWorktreeOutput = {
  kind: "agentCore.basicTool.git.manageWorktree";
  target: GitManageWorktreeTarget;
  runtimeEntry: GitManageWorktreeRuntimeEntry;
  risk: GitManageWorktreeRisk;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  timeoutMs: number;
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  permissionsRequired: readonly GitManageWorktreePermission[];
  unsafeSideEffects: boolean;
  resultEnvelope: GitManageWorktreeEnvelope;
};

export type GitManageWorktreePlan = {
  toolId: "git.manageWorktree";
  toolKind: "git.manageWorktree";
  capability: "manage-worktree";
  runtimeId: string;
  invocationId: string;
  repositoryPath: string;
  action: GitManageWorktreeAction;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  requiredPermissions: readonly GitManageWorktreePermission[];
  runtimeEntry: GitManageWorktreeRuntimeEntry;
  risk: GitManageWorktreeRisk;
  dispatch: "dry-run" | "runtime-git-executor";
  dryRun: boolean;
  wouldMutateRepository: boolean;
  wouldMutateFilesystem: boolean;
  unsafeSideEffects: boolean;
  outputEnvelope: { stdoutPreview: ""; stderrPreview: ""; parsed: false };
  audit: {
    guard: "git-worktree-runtime-guard";
    event: "basicTool.git.manageWorktree.planned";
    governanceRequired: boolean;
    tapCanWrap: true;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type GitManageWorktreeErrorBoundary = "input" | "scope" | "permission" | "governance" | "provider";
export type GitManageWorktreeErrorCode =
  | "MISSING_REPOSITORY_PATH"
  | "MISSING_TARGET_PATH"
  | "MISSING_TARGET_REF"
  | "INVALID_ACTION"
  | "INVALID_ARGUMENT"
  | "INVALID_CONTEXT"
  | "INVALID_TIMEOUT"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type GitManageWorktreeError = {
  code: GitManageWorktreeErrorCode;
  message: string;
  boundary: GitManageWorktreeErrorBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type GitManageWorktreeAuditEvent = {
  type: string;
  toolId: "git.manageWorktree";
  invocationId: string;
  dryRun: boolean;
  repositoryPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type GitManageWorktreeResult =
  | {
      ok: true;
      toolId: "git.manageWorktree";
      output: GitManageWorktreeOutput;
      plan: GitManageWorktreePlan;
      audit: readonly GitManageWorktreeAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "git.manageWorktree";
      error: GitManageWorktreeError;
      audit: readonly GitManageWorktreeAuditEvent[];
      events: readonly string[];
    };

export type GitManageWorktreeProviderRequest = { repositoryPath: string; args: readonly string[]; timeoutMs?: number };
export type GitManageWorktreeProviderResult = { exitCode: number; stdout: string; stderr: string };
export type GitManageWorktreeProvider = (
  request: GitManageWorktreeProviderRequest,
  context: GitManageWorktreeContext,
) => GitManageWorktreeProviderResult | Promise<GitManageWorktreeProviderResult>;

type NormalizedRequest = { target: GitManageWorktreeTarget; context: GitManageWorktreeContext; timeoutMs?: number };

export const gitManageWorktreeDescriptor = {
  toolId: "git.manageWorktree",
  toolKind: "git.manageWorktree",
  capability: "manage-worktree",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.advanced",
  defaultDryRun: true,
  defaultDispatch: "dry-run",
  tapOwnsApproval: true,
  requiresTapApproval: true,
  runtimeEntryPort: "BaseToolExecutorPort.git.runGit",
  operationRisk: "worktree-management",
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

function dryRunEnabled(context: GitManageWorktreeContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: GitManageWorktreeContext | undefined): string {
  return stringValue(context?.invocationId)?.trim() || "git.manageWorktree:dry-run";
}

function runtimeId(context: GitManageWorktreeContext | undefined): string {
  return stringValue(context?.runtimeId)?.trim() || "runtime.unspecified";
}

function auditEvent(
  type: string,
  context: GitManageWorktreeContext | undefined,
  repositoryPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): GitManageWorktreeAuditEvent {
  return {
    type,
    toolId: gitManageWorktreeDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    repositoryPath,
    metadata: { ...(context?.auditMetadata ?? {}), ...(metadata ?? {}) },
  };
}

function failure(
  code: GitManageWorktreeErrorCode,
  message: string,
  boundary: GitManageWorktreeErrorBoundary,
  context: GitManageWorktreeContext | undefined,
  repositoryPath?: string,
): GitManageWorktreeResult {
  return {
    ok: false,
    toolId: gitManageWorktreeDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.git.manageWorktree.rejected", context, repositoryPath, { code })],
    events: ["basicTool.git.manageWorktree.rejected"],
  };
}

function normalizeContext(rawContext: unknown, legacyRequest: Record<string, unknown>): GitManageWorktreeContext | GitManageWorktreeResult {
  const contextRecord = rawContext === undefined ? {} : rawContext;
  if (!isRecord(contextRecord)) return failure("INVALID_CONTEXT", "git.manageWorktree context must be an object", "input", undefined);
  const guard = contextRecord.guard;
  if (guard !== undefined && !isRecord(guard)) {
    return failure("INVALID_CONTEXT", "git.manageWorktree context.guard must be an object", "input", undefined);
  }
  const allowedRepositoryRoots = stringArrayValue(contextRecord.allowedRepositoryRoots);
  if (contextRecord.allowedRepositoryRoots !== undefined && allowedRepositoryRoots === undefined) {
    return failure("INVALID_CONTEXT", "git.manageWorktree context.allowedRepositoryRoots must be a string array", "input", undefined);
  }
  const grantedPermissions = stringArrayValue(contextRecord.grantedPermissions);
  if (contextRecord.grantedPermissions !== undefined && grantedPermissions === undefined) {
    return failure("INVALID_CONTEXT", "git.manageWorktree context.grantedPermissions must be a string array", "input", undefined);
  }
  const auditMetadata = isRecord(contextRecord.auditMetadata) ? contextRecord.auditMetadata : undefined;
  if (contextRecord.auditMetadata !== undefined && auditMetadata === undefined) {
    return failure("INVALID_CONTEXT", "git.manageWorktree context.auditMetadata must be an object", "input", undefined);
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
    grantedPermissions: grantedPermissions as readonly GitManageWorktreePermission[] | undefined,
    auditMetadata,
  };
}

function normalizeRequiredPath(
  value: unknown,
  field: string,
  context: GitManageWorktreeContext | undefined,
): string | GitManageWorktreeResult {
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) {
    return failure(field === "target.repositoryPath" ? "MISSING_REPOSITORY_PATH" : "MISSING_TARGET_PATH", `git.manageWorktree requires ${field}`, "input", context);
  }
  if (normalized.includes("\0")) {
    return failure("INVALID_ARGUMENT", `git.manageWorktree ${field} cannot contain NUL bytes`, "input", context, normalized);
  }
  return normalized;
}

function safeGitAtom(
  value: unknown,
  field: string,
  context: GitManageWorktreeContext,
  repositoryPath: string,
): string | undefined | GitManageWorktreeResult {
  if (value === undefined) return undefined;
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) return undefined;
  if (normalized.includes("\0") || /\s/u.test(normalized) || normalized.startsWith("-")) {
    return failure("INVALID_ARGUMENT", `git.manageWorktree ${field} must be a safe Git atom`, "input", context, repositoryPath);
  }
  return normalized;
}

function normalizeAction(value: unknown, context: GitManageWorktreeContext, repositoryPath: string): GitManageWorktreeAction | GitManageWorktreeResult {
  if (value === undefined || value === "list") return "list";
  if (value === "add" || value === "remove" || value === "prune") return value;
  return failure("INVALID_ACTION", "git.manageWorktree target.action must be list, add, remove, or prune", "input", context, repositoryPath);
}

function booleanFlag(
  targetRecord: Record<string, unknown>,
  requestRecord: Record<string, unknown>,
  field: keyof GitManageWorktreeTarget,
  context: GitManageWorktreeContext,
  repositoryPath: string,
): boolean | GitManageWorktreeResult {
  const value = targetRecord[field] ?? requestRecord[field];
  if (value === undefined) return false;
  const bool = booleanValue(value);
  if (bool === undefined) {
    return failure("INVALID_ARGUMENT", `git.manageWorktree target.${String(field)} must be a boolean`, "input", context, repositoryPath);
  }
  return bool;
}

function normalizeTimeout(value: unknown, context: GitManageWorktreeContext, repositoryPath: string): number | undefined | GitManageWorktreeResult {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > gitManageWorktreeDescriptor.maxTimeoutMs) {
    return failure(
      "INVALID_TIMEOUT",
      `git.manageWorktree timeoutMs must be an integer from 1 to ${gitManageWorktreeDescriptor.maxTimeoutMs}`,
      "input",
      context,
      repositoryPath,
    );
  }
  return value;
}

function normalizeRequest(request: unknown): NormalizedRequest | GitManageWorktreeResult {
  if (request !== undefined && !isRecord(request)) {
    return failure("INVALID_ARGUMENT", "git.manageWorktree request must be an object", "input", undefined);
  }
  const requestRecord = isRecord(request) ? request : {};
  const context = normalizeContext(requestRecord.context, requestRecord);
  if ("ok" in context) return context;
  const targetRecord = isRecord(requestRecord.target) ? requestRecord.target : requestRecord;
  if (requestRecord.target !== undefined && !isRecord(requestRecord.target)) {
    return failure("INVALID_ARGUMENT", "git.manageWorktree target must be an object", "input", context);
  }
  const repositoryPath = normalizeRequiredPath(targetRecord.repositoryPath ?? requestRecord.repositoryPath ?? requestRecord.cwd, "target.repositoryPath", context);
  if (typeof repositoryPath !== "string") return repositoryPath;
  const action = normalizeAction(targetRecord.action ?? requestRecord.action, context, repositoryPath);
  if (typeof action !== "string") return action;
  const rawWorktreePath = targetRecord.worktreePath ?? targetRecord.targetPath ?? targetRecord.path ?? requestRecord.worktreePath ?? requestRecord.targetPath ?? requestRecord.path;
  let worktreePath: string | undefined;
  if (action === "add" || action === "remove") {
    const normalizedWorktreePath = normalizeRequiredPath(rawWorktreePath, "target.worktreePath", context);
    if (typeof normalizedWorktreePath !== "string") return normalizedWorktreePath;
    worktreePath = normalizedWorktreePath;
  } else if (rawWorktreePath !== undefined) {
    const normalizedWorktreePath = normalizeRequiredPath(rawWorktreePath, "target.worktreePath", context);
    if (typeof normalizedWorktreePath !== "string") return normalizedWorktreePath;
    worktreePath = normalizedWorktreePath;
  }
  const targetRef = safeGitAtom(targetRecord.targetRef ?? targetRecord.ref ?? requestRecord.targetRef ?? requestRecord.ref, "target.targetRef", context, repositoryPath);
  if (targetRef !== undefined && typeof targetRef !== "string") return targetRef;
  const branchName = safeGitAtom(targetRecord.branchName ?? targetRecord.branch ?? requestRecord.branchName ?? requestRecord.branch, "target.branchName", context, repositoryPath);
  if (branchName !== undefined && typeof branchName !== "string") return branchName;
  if (action === "add" && targetRef === undefined && branchName === undefined) {
    return failure("MISSING_TARGET_REF", "git.manageWorktree action add requires target.targetRef or target.branchName", "input", context, repositoryPath);
  }
  const detach = booleanFlag(targetRecord, requestRecord, "detach", context, repositoryPath);
  if (typeof detach !== "boolean") return detach;
  const force = booleanFlag(targetRecord, requestRecord, "force", context, repositoryPath);
  if (typeof force !== "boolean") return force;
  const timeoutMs = normalizeTimeout(requestRecord.timeoutMs, context, repositoryPath);
  if (timeoutMs !== undefined && typeof timeoutMs !== "number") return timeoutMs;
  return {
    target: { repositoryPath, action, worktreePath, targetRef, branchName, detach, force },
    context,
    timeoutMs,
  };
}

function normalizeAllowedRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/u, "");
}

function pathInAllowedRoots(pathValue: string, allowedRoots: readonly string[]): boolean {
  return allowedRoots.some((root) => pathValue === root || pathValue.startsWith(`${root}/`));
}

function ensureScope(target: GitManageWorktreeTarget, context: GitManageWorktreeContext | undefined): GitManageWorktreeResult | undefined {
  const allowedRoots = cleanList(context?.allowedRepositoryRoots).map(normalizeAllowedRoot);
  if (allowedRoots.length === 0) return undefined;
  if (!pathInAllowedRoots(target.repositoryPath, allowedRoots)) {
    return failure("SCOPE_REJECTED", "git.manageWorktree target repository is outside the allowed repository roots", "scope", context, target.repositoryPath);
  }
  if (target.worktreePath !== undefined && !pathInAllowedRoots(target.worktreePath, allowedRoots)) {
    return failure("SCOPE_REJECTED", "git.manageWorktree target worktree path is outside the allowed repository roots", "scope", context, target.repositoryPath);
  }
  return undefined;
}

function permissionsForTarget(target: GitManageWorktreeTarget): readonly GitManageWorktreePermission[] {
  if (target.action === "list") return ["git:read", "filesystem:read"];
  return ["git:read", "git:write", "filesystem:read", "filesystem:write"];
}

function ensurePermissions(target: GitManageWorktreeTarget, context: GitManageWorktreeContext | undefined): GitManageWorktreeResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) return undefined;
  const missing = permissionsForTarget(target).filter((permission) => !granted.includes(permission));
  return missing.length === 0
    ? undefined
    : failure("PERMISSION_DENIED", `git.manageWorktree is missing permissions: ${missing.join(", ")}`, "permission", context, target.repositoryPath);
}

function ensureGovernance(target: GitManageWorktreeTarget, context: GitManageWorktreeContext): GitManageWorktreeResult | undefined {
  if (dryRunEnabled(context)) return undefined;
  if (target.action === "list") return undefined;
  if (context.guard?.allowed === true || context.guard?.accepted === true) return undefined;
  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "git.manageWorktree requires an affirmative runtime guard for worktree mutations",
    "governance",
    context,
    target.repositoryPath,
  );
}

function providerArgs(target: GitManageWorktreeTarget): readonly string[] {
  if (target.action === "list") return ["worktree", "list", "--porcelain"];
  if (target.action === "remove") return ["worktree", "remove", ...(target.force ? ["--force"] : []), target.worktreePath ?? ""];
  if (target.action === "prune") return ["worktree", "prune", ...(target.force ? ["--force"] : [])];
  return [
    "worktree",
    "add",
    ...(target.force ? ["--force"] : []),
    ...(target.detach ? ["--detach"] : []),
    ...(target.branchName === undefined ? [] : ["-b", target.branchName]),
    target.worktreePath ?? "",
    ...(target.targetRef === undefined ? [] : [target.targetRef]),
  ];
}

function commandPreview(target: GitManageWorktreeTarget): readonly string[] {
  return ["git", "-C", target.repositoryPath, ...providerArgs(target)];
}

const runtimeEntry: GitManageWorktreeRuntimeEntry = {
  owner: "runtime",
  port: "BaseToolExecutorPort.git.runGit",
  method: "runGit",
  binary: "git",
  argvMode: "fixed-manage-worktree",
  allowedSubcommand: "worktree",
};

function riskForTarget(target: GitManageWorktreeTarget): GitManageWorktreeRisk {
  const mutates = target.action !== "list";
  const destructive = target.action === "remove" || (target.action === "prune" && target.force);
  return {
    category: !mutates ? "read-only-inspection" : destructive ? "destructive" : "workspace-mutation",
    riskLevel: !mutates ? "normal" : destructive ? "destructive" : "risky",
    mutatesRepository: mutates,
    mutatesWorkingTree: false,
    mutatesFilesystem: mutates,
    managesWorktree: true,
    mayUseNetwork: false,
    spawnsProcess: true,
    requiresTapApproval: mutates,
    runtimeOwnsExecution: true,
  };
}

function plan(normalized: NormalizedRequest, dispatch: GitManageWorktreePlan["dispatch"], dryRun: boolean): GitManageWorktreePlan {
  return {
    toolId: "git.manageWorktree",
    toolKind: "git.manageWorktree",
    capability: "manage-worktree",
    runtimeId: runtimeId(normalized.context),
    invocationId: invocationId(normalized.context),
    repositoryPath: normalized.target.repositoryPath,
    action: normalized.target.action,
    gitArgs: providerArgs(normalized.target),
    commandPreview: commandPreview(normalized.target),
    requiredPermissions: permissionsForTarget(normalized.target),
    runtimeEntry,
    risk: riskForTarget(normalized.target),
    dispatch,
    dryRun,
    wouldMutateRepository: normalized.target.action !== "list",
    wouldMutateFilesystem: normalized.target.action !== "list",
    unsafeSideEffects: normalized.target.action !== "list",
    outputEnvelope: { stdoutPreview: "", stderrPreview: "", parsed: false },
    audit: {
      guard: "git-worktree-runtime-guard",
      event: "basicTool.git.manageWorktree.planned",
      governanceRequired: normalized.target.action !== "list",
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

function parseWorktreePorcelain(stdout: string): readonly GitWorktreeEntry[] {
  const entries: GitWorktreeEntry[] = [];
  let current: GitWorktreeEntry | undefined;
  for (const rawLine of stdout.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line.length === 0) {
      if (current !== undefined) entries.push(current);
      current = undefined;
      continue;
    }
    const [key, ...rest] = line.split(" ");
    const value = rest.join(" ");
    if (key === "worktree") {
      if (current !== undefined) entries.push(current);
      current = { path: value };
    } else if (current !== undefined && key === "HEAD") {
      current.head = value;
    } else if (current !== undefined && key === "branch") {
      current.branch = value;
    } else if (current !== undefined && key === "detached") {
      current.detached = true;
    } else if (current !== undefined && key === "bare") {
      current.bare = true;
    } else if (current !== undefined && key === "prunable") {
      current.prunable = true;
    }
  }
  if (current !== undefined) entries.push(current);
  return entries;
}

export function parseGitManageWorktreeResult(
  providerResult: GitManageWorktreeProviderResult | undefined,
  target: GitManageWorktreeTarget,
): GitManageWorktreeEnvelope {
  return {
    parser: "git-worktree-output-v1",
    action: target.action,
    worktreePath: target.worktreePath,
    targetRef: target.targetRef,
    branchName: target.branchName,
    exitCode: providerResult?.exitCode,
    stdoutLineCount: lineCount(providerResult?.stdout ?? ""),
    stderrLineCount: lineCount(providerResult?.stderr ?? ""),
    operationHint: providerResult === undefined ? undefined : firstOutputLine(providerResult.stdout, providerResult.stderr),
    worktrees: target.action === "list" ? parseWorktreePorcelain(providerResult?.stdout ?? "") : [],
    worktreeChanged: providerResult?.exitCode === 0 && target.action !== "list",
  };
}

function success(normalized: NormalizedRequest, dryRun: boolean, providerResult?: GitManageWorktreeProviderResult): GitManageWorktreeResult {
  const executionPlan = plan(normalized, dryRun ? "dry-run" : "runtime-git-executor", dryRun);
  return {
    ok: true,
    toolId: "git.manageWorktree",
    plan: executionPlan,
    output: {
      kind: "agentCore.basicTool.git.manageWorktree",
      target: normalized.target,
      runtimeEntry,
      risk: riskForTarget(normalized.target),
      gitArgs: executionPlan.gitArgs,
      commandPreview: executionPlan.commandPreview,
      timeoutMs: normalized.timeoutMs ?? gitManageWorktreeDescriptor.defaultTimeoutMs,
      dryRun,
      executionBlocked: dryRun,
      providerCalled: providerResult !== undefined,
      exitCode: providerResult?.exitCode,
      stdout: providerResult?.stdout,
      stderr: providerResult?.stderr,
      permissionsRequired: permissionsForTarget(normalized.target),
      unsafeSideEffects: normalized.target.action !== "list",
      resultEnvelope: parseGitManageWorktreeResult(providerResult, normalized.target),
    },
    audit: [
      auditEvent(
        dryRun ? "agentCore.basicTool.git.manageWorktree.dryRun" : "agentCore.basicTool.git.manageWorktree.executed",
        normalized.context,
        normalized.target.repositoryPath,
        { action: normalized.target.action, worktreePath: normalized.target.worktreePath, exitCode: providerResult?.exitCode },
      ),
    ],
    events: [dryRun ? "basicTool.git.manageWorktree.dryRun" : "basicTool.git.manageWorktree.executed"],
  };
}

export function planGitWorktreeManagement(request: GitManageWorktreeRequest = {}): GitManageWorktreeResult {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const scopeFailure = ensureScope(normalized.target, normalized.context);
  if (scopeFailure !== undefined) return scopeFailure;
  const permissionFailure = ensurePermissions(normalized.target, normalized.context);
  if (permissionFailure !== undefined) return permissionFailure;
  return success(normalized, true);
}

export const planManageWorktree = planGitWorktreeManagement;
export const planGitManageWorktree = planGitWorktreeManagement;

export async function executeGitManageWorktree(request: GitManageWorktreeRequest = {}): Promise<GitManageWorktreeResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const scopeFailure = ensureScope(normalized.target, normalized.context);
  if (scopeFailure !== undefined) return scopeFailure;
  const permissionFailure = ensurePermissions(normalized.target, normalized.context);
  if (permissionFailure !== undefined) return permissionFailure;
  const governanceFailure = ensureGovernance(normalized.target, normalized.context);
  if (governanceFailure !== undefined) return governanceFailure;
  if (dryRunEnabled(normalized.context)) return success(normalized, true);
  if (request.provider === undefined) {
    return failure("PROVIDER_UNAVAILABLE", "git.manageWorktree requires runtime.execEngine.git.runGit for real execution", "provider", normalized.context, normalized.target.repositoryPath);
  }
  try {
    const providerResult = await request.provider(
      { repositoryPath: normalized.target.repositoryPath, args: providerArgs(normalized.target), timeoutMs: normalized.timeoutMs },
      normalized.context,
    );
    return success(normalized, false, providerResult);
  } catch {
    return failure("PROVIDER_REJECTED", "git.manageWorktree provider rejected the request or failed safely", "provider", normalized.context, normalized.target.repositoryPath);
  }
}
