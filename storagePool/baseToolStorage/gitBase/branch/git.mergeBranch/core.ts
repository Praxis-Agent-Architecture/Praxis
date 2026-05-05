/*
 * git.mergeBranch storage core.
 * Owns the fixed git-merge branch contract and delegates host execution to BaseToolExecutorPort.git.runGit.
 */

export type GitMergeBranchPermission = "git:read" | "git:write" | "filesystem:read" | "filesystem:write";
export type GitMergeBranchMode = "default" | "ff-only" | "no-ff" | "squash";

export type GitMergeBranchGuard = {
  allowed?: boolean;
  accepted?: boolean;
  reason?: string;
};

export type GitMergeBranchContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: GitMergeBranchGuard;
  allowedRepositoryRoots?: readonly string[];
  grantedPermissions?: readonly GitMergeBranchPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type GitMergeBranchTarget = {
  repositoryPath: string;
  sourceBranch: string;
  mode: GitMergeBranchMode;
  commitMessage?: string;
  noCommit: boolean;
  allowUnrelatedHistories: boolean;
};

export type GitMergeBranchRequest = {
  target?: Partial<GitMergeBranchTarget>;
  context?: GitMergeBranchContext;
  provider?: GitMergeBranchProvider;
  timeoutMs?: number;
  metadata?: Readonly<Record<string, unknown>>;
  runtimeId?: string;
  invocationId?: string;
  repositoryPath?: string;
  sourceBranch?: string;
  branchName?: string;
  ref?: string;
  mode?: GitMergeBranchMode;
  commitMessage?: string;
  message?: string;
  noCommit?: boolean;
  allowUnrelatedHistories?: boolean;
  dryRun?: boolean;
};

export type GitMergeBranchRuntimeEntry = {
  owner: "runtime";
  port: "BaseToolExecutorPort.git.runGit";
  method: "runGit";
  binary: "git";
  argvMode: "fixed-merge-branch-history-mutation";
  allowedSubcommand: "merge";
};

export type GitMergeBranchRisk = {
  category: "history-mutation";
  riskLevel: "risky";
  mutatesRepository: true;
  mutatesWorkingTree: true;
  mutatesIndex: true;
  mayCreateCommit: boolean;
  mayCreateConflicts: true;
  spawnsProcess: true;
  requiresTapApproval: true;
  runtimeOwnsExecution: true;
};

export type GitMergeBranchEnvelope = {
  parser: "git-merge-output-v1";
  sourceBranch: string;
  mode: GitMergeBranchMode;
  noCommit: boolean;
  allowUnrelatedHistories: boolean;
  exitCode?: number;
  stdoutLineCount: number;
  stderrLineCount: number;
  mergeHint?: string;
  fastForward: boolean;
  conflictDetected: boolean;
  mergeCommitCreated: boolean;
};

export type GitMergeBranchOutput = {
  kind: "agentCore.basicTool.git.mergeBranch";
  target: GitMergeBranchTarget;
  runtimeEntry: GitMergeBranchRuntimeEntry;
  risk: GitMergeBranchRisk;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  timeoutMs: number;
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  permissionsRequired: readonly GitMergeBranchPermission[];
  unsafeSideEffects: true;
  mergesBranch: true;
  resultEnvelope: GitMergeBranchEnvelope;
};

export type GitMergeBranchPlan = {
  toolId: "git.mergeBranch";
  toolKind: "git.mergeBranch";
  capability: "merge-branch";
  runtimeId: string;
  invocationId: string;
  repositoryPath: string;
  sourceBranch: string;
  mode: GitMergeBranchMode;
  commitMessage?: string;
  noCommit: boolean;
  allowUnrelatedHistories: boolean;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  requiredPermissions: readonly GitMergeBranchPermission[];
  runtimeEntry: GitMergeBranchRuntimeEntry;
  risk: GitMergeBranchRisk;
  dispatch: "dry-run" | "runtime-git-executor";
  dryRun: boolean;
  wouldMutateWorkingTree: true;
  wouldMutateIndex: true;
  unsafeSideEffects: true;
  outputEnvelope: { stdoutPreview: ""; stderrPreview: ""; parsed: false };
  audit: {
    guard: "git-merge-runtime-guard";
    event: "basicTool.git.mergeBranch.planned";
    governanceRequired: true;
    tapCanWrap: true;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type GitMergeBranchErrorBoundary = "input" | "scope" | "permission" | "governance" | "provider";
export type GitMergeBranchErrorCode =
  | "MISSING_REPOSITORY_PATH"
  | "MISSING_BRANCH_NAME"
  | "INVALID_ARGUMENT"
  | "INVALID_CONTEXT"
  | "UNSAFE_BRANCH_REF"
  | "INVALID_TIMEOUT"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type GitMergeBranchError = {
  code: GitMergeBranchErrorCode;
  message: string;
  boundary: GitMergeBranchErrorBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type GitMergeBranchAuditEvent = {
  type: string;
  toolId: "git.mergeBranch";
  invocationId: string;
  dryRun: boolean;
  repositoryPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type GitMergeBranchResult =
  | {
      ok: true;
      toolId: "git.mergeBranch";
      output: GitMergeBranchOutput;
      plan: GitMergeBranchPlan;
      audit: readonly GitMergeBranchAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "git.mergeBranch";
      error: GitMergeBranchError;
      audit: readonly GitMergeBranchAuditEvent[];
      events: readonly string[];
    };

export type GitMergeBranchProviderRequest = {
  repositoryPath: string;
  args: readonly string[];
  timeoutMs?: number;
};

export type GitMergeBranchProviderResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type GitMergeBranchProvider = (
  request: GitMergeBranchProviderRequest,
  context: GitMergeBranchContext,
) => GitMergeBranchProviderResult | Promise<GitMergeBranchProviderResult>;

type NormalizedRequest = {
  target: GitMergeBranchTarget;
  context: GitMergeBranchContext;
  timeoutMs?: number;
};

export const gitMergeBranchDescriptor = {
  toolId: "git.mergeBranch",
  toolKind: "git.mergeBranch",
  capability: "merge-branch",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.branch",
  defaultDryRun: true,
  defaultDispatch: "dry-run",
  tapOwnsApproval: true,
  requiresTapApproval: true,
  runtimeEntryPort: "BaseToolExecutorPort.git.runGit",
  operationRisk: "history-mutation",
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

function dryRunEnabled(context: GitMergeBranchContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: GitMergeBranchContext | undefined): string {
  return stringValue(context?.invocationId)?.trim() || "git.mergeBranch:dry-run";
}

function runtimeId(context: GitMergeBranchContext | undefined): string {
  return stringValue(context?.runtimeId)?.trim() || "runtime.unspecified";
}

function auditEvent(
  type: string,
  context: GitMergeBranchContext | undefined,
  repositoryPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): GitMergeBranchAuditEvent {
  return {
    type,
    toolId: gitMergeBranchDescriptor.toolId,
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
  code: GitMergeBranchErrorCode,
  message: string,
  boundary: GitMergeBranchErrorBoundary,
  context: GitMergeBranchContext | undefined,
  repositoryPath?: string,
): GitMergeBranchResult {
  return {
    ok: false,
    toolId: gitMergeBranchDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.git.mergeBranch.rejected", context, repositoryPath, { code })],
    events: ["basicTool.git.mergeBranch.rejected"],
  };
}

function normalizeContext(rawContext: unknown, legacyRequest: Record<string, unknown>): GitMergeBranchContext | GitMergeBranchResult {
  const contextRecord = rawContext === undefined ? {} : rawContext;
  if (!isRecord(contextRecord)) {
    return failure("INVALID_CONTEXT", "git.mergeBranch context must be an object", "input", undefined);
  }
  const guard = contextRecord.guard;
  if (guard !== undefined && !isRecord(guard)) {
    return failure("INVALID_CONTEXT", "git.mergeBranch context.guard must be an object", "input", undefined);
  }
  const allowedRepositoryRoots = stringArrayValue(contextRecord.allowedRepositoryRoots);
  if (contextRecord.allowedRepositoryRoots !== undefined && allowedRepositoryRoots === undefined) {
    return failure("INVALID_CONTEXT", "git.mergeBranch context.allowedRepositoryRoots must be a string array", "input", undefined);
  }
  const grantedPermissions = stringArrayValue(contextRecord.grantedPermissions);
  if (contextRecord.grantedPermissions !== undefined && grantedPermissions === undefined) {
    return failure("INVALID_CONTEXT", "git.mergeBranch context.grantedPermissions must be a string array", "input", undefined);
  }
  const auditMetadata = isRecord(contextRecord.auditMetadata) ? contextRecord.auditMetadata : undefined;
  if (contextRecord.auditMetadata !== undefined && auditMetadata === undefined) {
    return failure("INVALID_CONTEXT", "git.mergeBranch context.auditMetadata must be an object", "input", undefined);
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
    grantedPermissions: grantedPermissions as readonly GitMergeBranchPermission[] | undefined,
    auditMetadata,
  };
}

function normalizeRepositoryPath(value: unknown, context: GitMergeBranchContext | undefined): string | GitMergeBranchResult {
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_REPOSITORY_PATH", "git.mergeBranch requires target.repositoryPath", "input", context);
  }
  if (normalized.includes("\0")) {
    return failure("INVALID_ARGUMENT", "git.mergeBranch repositoryPath cannot contain NUL bytes", "input", context, normalized);
  }
  return normalized;
}

function isUnsafeRef(value: string): boolean {
  return (
    value.length === 0 ||
    value.includes("\0") ||
    /\s/u.test(value) ||
    value.startsWith("-") ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.includes("..") ||
    value.includes("@{") ||
    value.includes("\\") ||
    value.includes("//") ||
    value.endsWith(".lock") ||
    value.includes(":")
  );
}

function normalizeSourceBranch(
  value: unknown,
  context: GitMergeBranchContext,
  repositoryPath: string,
): string | GitMergeBranchResult {
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_BRANCH_NAME", "git.mergeBranch requires target.sourceBranch", "input", context, repositoryPath);
  }
  if (isUnsafeRef(normalized)) {
    return failure("UNSAFE_BRANCH_REF", "git.mergeBranch target.sourceBranch must be a safe branch ref", "input", context, repositoryPath);
  }
  return normalized;
}

function normalizeMode(value: unknown): GitMergeBranchMode {
  return value === "ff-only" || value === "no-ff" || value === "squash" ? value : "default";
}

function normalizeCommitMessage(
  value: unknown,
  context: GitMergeBranchContext,
  repositoryPath: string,
): string | undefined | GitMergeBranchResult {
  if (value === undefined) return undefined;
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) return undefined;
  if (normalized.includes("\0")) {
    return failure("INVALID_ARGUMENT", "git.mergeBranch target.commitMessage cannot contain NUL bytes", "input", context, repositoryPath);
  }
  return normalized;
}

function normalizeTimeout(
  value: unknown,
  context: GitMergeBranchContext,
  repositoryPath: string,
): number | undefined | GitMergeBranchResult {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > gitMergeBranchDescriptor.maxTimeoutMs) {
    return failure(
      "INVALID_TIMEOUT",
      `git.mergeBranch timeoutMs must be an integer from 1 to ${gitMergeBranchDescriptor.maxTimeoutMs}`,
      "input",
      context,
      repositoryPath,
    );
  }
  return value;
}

function normalizeRequest(request: unknown): NormalizedRequest | GitMergeBranchResult {
  if (request !== undefined && !isRecord(request)) {
    return failure("INVALID_ARGUMENT", "git.mergeBranch request must be an object", "input", undefined);
  }
  const requestRecord = isRecord(request) ? request : {};
  const context = normalizeContext(requestRecord.context, requestRecord);
  if ("ok" in context) return context;
  const targetRecord = isRecord(requestRecord.target) ? requestRecord.target : requestRecord;
  if (requestRecord.target !== undefined && !isRecord(requestRecord.target)) {
    return failure("INVALID_ARGUMENT", "git.mergeBranch target must be an object", "input", context);
  }
  const repositoryPath = normalizeRepositoryPath(targetRecord.repositoryPath, context);
  if (typeof repositoryPath !== "string") return repositoryPath;
  const sourceBranch = normalizeSourceBranch(
    targetRecord.sourceBranch ?? targetRecord.branchName ?? targetRecord.ref,
    context,
    repositoryPath,
  );
  if (typeof sourceBranch !== "string") return sourceBranch;
  const commitMessage = normalizeCommitMessage(targetRecord.commitMessage ?? targetRecord.message, context, repositoryPath);
  if (commitMessage !== undefined && typeof commitMessage !== "string") return commitMessage;
  const timeoutMs = normalizeTimeout(requestRecord.timeoutMs, context, repositoryPath);
  if (timeoutMs !== undefined && typeof timeoutMs !== "number") return timeoutMs;
  return {
    target: {
      repositoryPath,
      sourceBranch,
      mode: normalizeMode(targetRecord.mode),
      commitMessage,
      noCommit: targetRecord.noCommit === true,
      allowUnrelatedHistories: targetRecord.allowUnrelatedHistories === true,
    },
    context,
    timeoutMs,
  };
}

function normalizeAllowedRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/u, "");
}

function ensureScope(repositoryPath: string, context: GitMergeBranchContext | undefined): GitMergeBranchResult | undefined {
  const allowedRoots = cleanList(context?.allowedRepositoryRoots).map(normalizeAllowedRoot);
  if (allowedRoots.length === 0) return undefined;
  const allowed = allowedRoots.some((root) => repositoryPath === root || repositoryPath.startsWith(`${root}/`));
  return allowed
    ? undefined
    : failure("SCOPE_REJECTED", "git.mergeBranch target repository is outside the allowed repository roots", "scope", context, repositoryPath);
}

function permissionsForTarget(): readonly GitMergeBranchPermission[] {
  return ["git:read", "git:write", "filesystem:read", "filesystem:write"];
}

function ensurePermissions(target: GitMergeBranchTarget, context: GitMergeBranchContext | undefined): GitMergeBranchResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) return undefined;
  const missing = permissionsForTarget().filter((permission) => !granted.includes(permission));
  return missing.length === 0
    ? undefined
    : failure("PERMISSION_DENIED", `git.mergeBranch is missing permissions: ${missing.join(", ")}`, "permission", context, target.repositoryPath);
}

function ensureGovernance(repositoryPath: string, context: GitMergeBranchContext): GitMergeBranchResult | undefined {
  if (dryRunEnabled(context)) return undefined;
  if (context.guard?.allowed === true || context.guard?.accepted === true) return undefined;
  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "git.mergeBranch requires an affirmative runtime guard for real execution",
    "governance",
    context,
    repositoryPath,
  );
}

function providerArgs(target: GitMergeBranchTarget): readonly string[] {
  return [
    "merge",
    ...(target.mode === "ff-only" ? ["--ff-only"] : []),
    ...(target.mode === "no-ff" ? ["--no-ff"] : []),
    ...(target.mode === "squash" ? ["--squash"] : []),
    ...(target.noCommit ? ["--no-commit"] : []),
    ...(target.allowUnrelatedHistories ? ["--allow-unrelated-histories"] : []),
    ...(target.commitMessage === undefined ? [] : ["-m", target.commitMessage]),
    target.sourceBranch,
  ];
}

function commandPreview(target: GitMergeBranchTarget): readonly string[] {
  return ["git", "-C", target.repositoryPath, ...providerArgs(target)];
}

const runtimeEntry: GitMergeBranchRuntimeEntry = {
  owner: "runtime",
  port: "BaseToolExecutorPort.git.runGit",
  method: "runGit",
  binary: "git",
  argvMode: "fixed-merge-branch-history-mutation",
  allowedSubcommand: "merge",
};

function mayCreateCommit(target: GitMergeBranchTarget): boolean {
  return target.mode !== "squash" && !target.noCommit;
}

function riskForTarget(target: GitMergeBranchTarget): GitMergeBranchRisk {
  return {
    category: "history-mutation",
    riskLevel: "risky",
    mutatesRepository: true,
    mutatesWorkingTree: true,
    mutatesIndex: true,
    mayCreateCommit: mayCreateCommit(target),
    mayCreateConflicts: true,
    spawnsProcess: true,
    requiresTapApproval: true,
    runtimeOwnsExecution: true,
  };
}

function plan(normalized: NormalizedRequest, dispatch: GitMergeBranchPlan["dispatch"], dryRun: boolean): GitMergeBranchPlan {
  const risk = riskForTarget(normalized.target);
  return {
    toolId: "git.mergeBranch",
    toolKind: "git.mergeBranch",
    capability: "merge-branch",
    runtimeId: runtimeId(normalized.context),
    invocationId: invocationId(normalized.context),
    repositoryPath: normalized.target.repositoryPath,
    sourceBranch: normalized.target.sourceBranch,
    mode: normalized.target.mode,
    commitMessage: normalized.target.commitMessage,
    noCommit: normalized.target.noCommit,
    allowUnrelatedHistories: normalized.target.allowUnrelatedHistories,
    gitArgs: providerArgs(normalized.target),
    commandPreview: commandPreview(normalized.target),
    requiredPermissions: permissionsForTarget(),
    runtimeEntry,
    risk,
    dispatch,
    dryRun,
    wouldMutateWorkingTree: true,
    wouldMutateIndex: true,
    unsafeSideEffects: true,
    outputEnvelope: { stdoutPreview: "", stderrPreview: "", parsed: false },
    audit: {
      guard: "git-merge-runtime-guard",
      event: "basicTool.git.mergeBranch.planned",
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

function firstOutputLine(stdout: string, stderr: string): string | undefined {
  return `${stdout}\n${stderr}`
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find(Boolean);
}

export function parseGitMergeBranchResult(
  providerResult: GitMergeBranchProviderResult | undefined,
  target: GitMergeBranchTarget,
): GitMergeBranchEnvelope {
  const combined = `${providerResult?.stdout ?? ""}\n${providerResult?.stderr ?? ""}`;
  return {
    parser: "git-merge-output-v1",
    sourceBranch: target.sourceBranch,
    mode: target.mode,
    noCommit: target.noCommit,
    allowUnrelatedHistories: target.allowUnrelatedHistories,
    exitCode: providerResult?.exitCode,
    stdoutLineCount: lineCount(providerResult?.stdout ?? ""),
    stderrLineCount: lineCount(providerResult?.stderr ?? ""),
    mergeHint: providerResult === undefined ? undefined : firstOutputLine(providerResult.stdout, providerResult.stderr),
    fastForward: /\bFast-forward\b/u.test(combined),
    conflictDetected: /\bCONFLICT\b/u.test(combined),
    mergeCommitCreated: providerResult?.exitCode === 0 && mayCreateCommit(target) && target.mode !== "ff-only",
  };
}

function success(normalized: NormalizedRequest, dryRun: boolean, providerResult?: GitMergeBranchProviderResult): GitMergeBranchResult {
  const executionPlan = plan(normalized, dryRun ? "dry-run" : "runtime-git-executor", dryRun);
  const risk = riskForTarget(normalized.target);
  return {
    ok: true,
    toolId: "git.mergeBranch",
    plan: executionPlan,
    output: {
      kind: "agentCore.basicTool.git.mergeBranch",
      target: normalized.target,
      runtimeEntry,
      risk,
      gitArgs: executionPlan.gitArgs,
      commandPreview: executionPlan.commandPreview,
      timeoutMs: normalized.timeoutMs ?? gitMergeBranchDescriptor.defaultTimeoutMs,
      dryRun,
      executionBlocked: dryRun,
      providerCalled: providerResult !== undefined,
      exitCode: providerResult?.exitCode,
      stdout: providerResult?.stdout,
      stderr: providerResult?.stderr,
      permissionsRequired: permissionsForTarget(),
      unsafeSideEffects: true,
      mergesBranch: true,
      resultEnvelope: parseGitMergeBranchResult(providerResult, normalized.target),
    },
    audit: [
      auditEvent(
        dryRun ? "agentCore.basicTool.git.mergeBranch.dryRun" : "agentCore.basicTool.git.mergeBranch.executed",
        normalized.context,
        normalized.target.repositoryPath,
        {
          sourceBranch: normalized.target.sourceBranch,
          mode: normalized.target.mode,
          noCommit: normalized.target.noCommit,
          exitCode: providerResult?.exitCode,
        },
      ),
    ],
    events: [dryRun ? "basicTool.git.mergeBranch.dryRun" : "basicTool.git.mergeBranch.executed"],
  };
}

export function planGitBranchMerge(request: GitMergeBranchRequest = {}): GitMergeBranchResult {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const scopeFailure = ensureScope(normalized.target.repositoryPath, normalized.context);
  if (scopeFailure !== undefined) return scopeFailure;
  const permissionFailure = ensurePermissions(normalized.target, normalized.context);
  if (permissionFailure !== undefined) return permissionFailure;
  return success(normalized, true);
}

export const planGitMergeBranch = planGitBranchMerge;

export async function executeGitMergeBranch(request: GitMergeBranchRequest = {}): Promise<GitMergeBranchResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const scopeFailure = ensureScope(normalized.target.repositoryPath, normalized.context);
  if (scopeFailure !== undefined) return scopeFailure;
  const permissionFailure = ensurePermissions(normalized.target, normalized.context);
  if (permissionFailure !== undefined) return permissionFailure;
  const governanceFailure = ensureGovernance(normalized.target.repositoryPath, normalized.context);
  if (governanceFailure !== undefined) return governanceFailure;
  if (dryRunEnabled(normalized.context)) return success(normalized, true);
  if (request.provider === undefined) {
    return failure(
      "PROVIDER_UNAVAILABLE",
      "git.mergeBranch requires runtime.execEngine.git.runGit for real execution",
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
      "git.mergeBranch provider rejected the request or failed safely",
      "provider",
      normalized.context,
      normalized.target.repositoryPath,
    );
  }
}
