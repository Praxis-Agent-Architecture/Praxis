/*
 * git.revertCommit storage core.
 * Owns the fixed git revert contract and delegates host execution to BaseToolExecutorPort.git.runGit.
 */

export type GitRevertCommitPermission = "git:read" | "git:write" | "filesystem:read" | "filesystem:write";
export type GitRevertCommitRiskCategory = "history-mutation";

export type GitRevertCommitGuard = { allowed?: boolean; accepted?: boolean; reason?: string };

export type GitRevertCommitContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: GitRevertCommitGuard;
  allowedRepositoryRoots?: readonly string[];
  grantedPermissions?: readonly GitRevertCommitPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type GitRevertCommitTarget = {
  repositoryPath: string;
  commitRef: string;
  noCommit: boolean;
  mainlineParent?: number;
};

export type GitRevertCommitRequest = {
  target?: Partial<GitRevertCommitTarget>;
  context?: GitRevertCommitContext;
  provider?: GitRevertCommitProvider;
  timeoutMs?: number;
  metadata?: Readonly<Record<string, unknown>>;
  runtimeId?: string;
  invocationId?: string;
  repositoryPath?: string;
  commitRef?: string;
  ref?: string;
  revision?: string;
  noCommit?: boolean;
  mainlineParent?: number;
  dryRun?: boolean;
};

export type GitRevertCommitRuntimeEntry = {
  owner: "runtime";
  port: "BaseToolExecutorPort.git.runGit";
  method: "runGit";
  binary: "git";
  argvMode: "fixed-revert-commit";
  allowedSubcommand: "revert";
};

export type GitRevertCommitRisk = {
  category: GitRevertCommitRiskCategory;
  riskLevel: "risky";
  mutatesRepository: true;
  mutatesWorkingTree: true;
  mutatesIndex: true;
  mayCreateCommit: boolean;
  revertsCommit: true;
  mayCreateConflicts: true;
  spawnsProcess: true;
  requiresTapApproval: true;
  runtimeOwnsExecution: true;
};

export type GitRevertCommitEnvelope = {
  parser: "git-revert-output-v1";
  commitRef: string;
  noCommit: boolean;
  mainlineParent?: number;
  exitCode?: number;
  stdoutLineCount: number;
  stderrLineCount: number;
  operationHint?: string;
  branchName?: string;
  commitHash?: string;
  subject?: string;
  filesChanged?: number;
  revertCompleted: boolean;
};

export type GitRevertCommitOutput = {
  kind: "agentCore.basicTool.git.revertCommit";
  target: GitRevertCommitTarget;
  runtimeEntry: GitRevertCommitRuntimeEntry;
  risk: GitRevertCommitRisk;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  timeoutMs: number;
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  permissionsRequired: readonly GitRevertCommitPermission[];
  unsafeSideEffects: true;
  revertsCommit: true;
  resultEnvelope: GitRevertCommitEnvelope;
};

export type GitRevertCommitPlan = {
  toolId: "git.revertCommit";
  toolKind: "git.revertCommit";
  capability: "revert-commit";
  runtimeId: string;
  invocationId: string;
  repositoryPath: string;
  commitRef: string;
  noCommit: boolean;
  mainlineParent?: number;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  requiredPermissions: readonly GitRevertCommitPermission[];
  runtimeEntry: GitRevertCommitRuntimeEntry;
  risk: GitRevertCommitRisk;
  dispatch: "dry-run" | "runtime-git-executor";
  dryRun: boolean;
  wouldMutateRepository: true;
  unsafeSideEffects: true;
  outputEnvelope: { stdoutPreview: ""; stderrPreview: ""; parsed: false };
  audit: {
    guard: "git-history-mutation-runtime-guard";
    event: "basicTool.git.revertCommit.planned";
    governanceRequired: true;
    tapCanWrap: true;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type GitRevertCommitErrorBoundary = "input" | "scope" | "permission" | "governance" | "provider";
export type GitRevertCommitErrorCode =
  | "MISSING_REPOSITORY_PATH"
  | "MISSING_TARGET_REF"
  | "INVALID_ARGUMENT"
  | "INVALID_CONTEXT"
  | "INVALID_TIMEOUT"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type GitRevertCommitError = {
  code: GitRevertCommitErrorCode;
  message: string;
  boundary: GitRevertCommitErrorBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type GitRevertCommitAuditEvent = {
  type: string;
  toolId: "git.revertCommit";
  invocationId: string;
  dryRun: boolean;
  repositoryPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type GitRevertCommitResult =
  | {
      ok: true;
      toolId: "git.revertCommit";
      output: GitRevertCommitOutput;
      plan: GitRevertCommitPlan;
      audit: readonly GitRevertCommitAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "git.revertCommit";
      error: GitRevertCommitError;
      audit: readonly GitRevertCommitAuditEvent[];
      events: readonly string[];
    };

export type GitRevertCommitProviderRequest = { repositoryPath: string; args: readonly string[]; timeoutMs?: number };
export type GitRevertCommitProviderResult = { exitCode: number; stdout: string; stderr: string };
export type GitRevertCommitProvider = (
  request: GitRevertCommitProviderRequest,
  context: GitRevertCommitContext,
) => GitRevertCommitProviderResult | Promise<GitRevertCommitProviderResult>;

type NormalizedRequest = { target: GitRevertCommitTarget; context: GitRevertCommitContext; timeoutMs?: number };

export const gitRevertCommitDescriptor = {
  toolId: "git.revertCommit",
  toolKind: "git.revertCommit",
  capability: "revert-commit",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.commit",
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

function dryRunEnabled(context: GitRevertCommitContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: GitRevertCommitContext | undefined): string {
  return stringValue(context?.invocationId)?.trim() || "git.revertCommit:dry-run";
}

function runtimeId(context: GitRevertCommitContext | undefined): string {
  return stringValue(context?.runtimeId)?.trim() || "runtime.unspecified";
}

function auditEvent(
  type: string,
  context: GitRevertCommitContext | undefined,
  repositoryPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): GitRevertCommitAuditEvent {
  return {
    type,
    toolId: gitRevertCommitDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    repositoryPath,
    metadata: { ...(context?.auditMetadata ?? {}), ...(metadata ?? {}) },
  };
}

function failure(
  code: GitRevertCommitErrorCode,
  message: string,
  boundary: GitRevertCommitErrorBoundary,
  context: GitRevertCommitContext | undefined,
  repositoryPath?: string,
): GitRevertCommitResult {
  return {
    ok: false,
    toolId: gitRevertCommitDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.git.revertCommit.rejected", context, repositoryPath, { code })],
    events: ["basicTool.git.revertCommit.rejected"],
  };
}

function normalizeContext(rawContext: unknown, legacyRequest: Record<string, unknown>): GitRevertCommitContext | GitRevertCommitResult {
  const contextRecord = rawContext === undefined ? {} : rawContext;
  if (!isRecord(contextRecord)) return failure("INVALID_CONTEXT", "git.revertCommit context must be an object", "input", undefined);
  const guard = contextRecord.guard;
  if (guard !== undefined && !isRecord(guard)) return failure("INVALID_CONTEXT", "git.revertCommit context.guard must be an object", "input", undefined);
  const allowedRepositoryRoots = stringArrayValue(contextRecord.allowedRepositoryRoots);
  if (contextRecord.allowedRepositoryRoots !== undefined && allowedRepositoryRoots === undefined) {
    return failure("INVALID_CONTEXT", "git.revertCommit context.allowedRepositoryRoots must be a string array", "input", undefined);
  }
  const grantedPermissions = stringArrayValue(contextRecord.grantedPermissions);
  if (contextRecord.grantedPermissions !== undefined && grantedPermissions === undefined) {
    return failure("INVALID_CONTEXT", "git.revertCommit context.grantedPermissions must be a string array", "input", undefined);
  }
  const auditMetadata = isRecord(contextRecord.auditMetadata) ? contextRecord.auditMetadata : undefined;
  if (contextRecord.auditMetadata !== undefined && auditMetadata === undefined) {
    return failure("INVALID_CONTEXT", "git.revertCommit context.auditMetadata must be an object", "input", undefined);
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
    grantedPermissions: grantedPermissions as readonly GitRevertCommitPermission[] | undefined,
    auditMetadata,
  };
}

function normalizeRepositoryPath(value: unknown, context: GitRevertCommitContext | undefined): string | GitRevertCommitResult {
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) return failure("MISSING_REPOSITORY_PATH", "git.revertCommit requires target.repositoryPath", "input", context);
  if (normalized.includes("\0")) return failure("INVALID_ARGUMENT", "git.revertCommit repositoryPath cannot contain NUL bytes", "input", context, normalized);
  return normalized;
}

function validateRef(value: string, context: GitRevertCommitContext, repositoryPath: string): string | GitRevertCommitResult {
  const normalized = value.trim();
  if (normalized.length === 0) return failure("MISSING_TARGET_REF", "git.revertCommit requires target.commitRef", "input", context, repositoryPath);
  if (normalized.includes("\0") || /\s/u.test(normalized) || normalized.startsWith("-")) {
    return failure("INVALID_ARGUMENT", "git.revertCommit target.commitRef must be a safe ref", "input", context, repositoryPath);
  }
  return normalized;
}

function normalizeMainlineParent(
  value: unknown,
  context: GitRevertCommitContext,
  repositoryPath: string,
): number | undefined | GitRevertCommitResult {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return failure("INVALID_ARGUMENT", "git.revertCommit target.mainlineParent must be a positive integer", "input", context, repositoryPath);
  }
  return value;
}

function normalizeTimeout(
  value: unknown,
  context: GitRevertCommitContext,
  repositoryPath: string,
): number | undefined | GitRevertCommitResult {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > gitRevertCommitDescriptor.maxTimeoutMs) {
    return failure(
      "INVALID_TIMEOUT",
      `git.revertCommit timeoutMs must be an integer from 1 to ${gitRevertCommitDescriptor.maxTimeoutMs}`,
      "input",
      context,
      repositoryPath,
    );
  }
  return value;
}

function normalizeRequest(request: unknown): NormalizedRequest | GitRevertCommitResult {
  if (request !== undefined && !isRecord(request)) return failure("INVALID_ARGUMENT", "git.revertCommit request must be an object", "input", undefined);
  const requestRecord = isRecord(request) ? request : {};
  const context = normalizeContext(requestRecord.context, requestRecord);
  if ("ok" in context) return context;
  const targetRecord = isRecord(requestRecord.target) ? requestRecord.target : requestRecord;
  if (requestRecord.target !== undefined && !isRecord(requestRecord.target)) {
    return failure("INVALID_ARGUMENT", "git.revertCommit target must be an object", "input", context);
  }
  const repositoryPath = normalizeRepositoryPath(targetRecord.repositoryPath, context);
  if (typeof repositoryPath !== "string") return repositoryPath;
  const commitRef = validateRef(
    stringValue(targetRecord.commitRef) ?? stringValue(targetRecord.ref) ?? stringValue(targetRecord.revision) ?? "",
    context,
    repositoryPath,
  );
  if (typeof commitRef !== "string") return commitRef;
  const mainlineParent = normalizeMainlineParent(targetRecord.mainlineParent, context, repositoryPath);
  if (mainlineParent !== undefined && typeof mainlineParent !== "number") return mainlineParent;
  const timeoutMs = normalizeTimeout(requestRecord.timeoutMs, context, repositoryPath);
  if (timeoutMs !== undefined && typeof timeoutMs !== "number") return timeoutMs;
  return { target: { repositoryPath, commitRef, noCommit: booleanValue(targetRecord.noCommit) ?? false, mainlineParent }, context, timeoutMs };
}

function normalizeAllowedRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/u, "");
}

function ensureScope(repositoryPath: string, context: GitRevertCommitContext | undefined): GitRevertCommitResult | undefined {
  const allowedRoots = cleanList(context?.allowedRepositoryRoots).map(normalizeAllowedRoot);
  if (allowedRoots.length === 0) return undefined;
  const allowed = allowedRoots.some((root) => repositoryPath === root || repositoryPath.startsWith(`${root}/`));
  return allowed ? undefined : failure("SCOPE_REJECTED", "git.revertCommit target repository is outside the allowed repository roots", "scope", context, repositoryPath);
}

function permissionsForTarget(_target: GitRevertCommitTarget): readonly GitRevertCommitPermission[] {
  return gitRevertCommitDescriptor.permissionsRequired;
}

function ensurePermissions(target: GitRevertCommitTarget, context: GitRevertCommitContext | undefined): GitRevertCommitResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) return undefined;
  const missing = permissionsForTarget(target).filter((permission) => !granted.includes(permission));
  return missing.length === 0
    ? undefined
    : failure("PERMISSION_DENIED", `git.revertCommit is missing permissions: ${missing.join(", ")}`, "permission", context, target.repositoryPath);
}

function ensureGovernance(target: GitRevertCommitTarget, context: GitRevertCommitContext): GitRevertCommitResult | undefined {
  if (dryRunEnabled(context)) return undefined;
  if (context.guard?.allowed === true || context.guard?.accepted === true) return undefined;
  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "git.revertCommit requires an affirmative runtime guard for real revert",
    "governance",
    context,
    target.repositoryPath,
  );
}

function providerArgs(target: GitRevertCommitTarget): readonly string[] {
  return [
    "revert",
    ...(target.noCommit ? ["--no-commit"] : []),
    ...(target.mainlineParent === undefined ? [] : ["--mainline", String(target.mainlineParent)]),
    target.commitRef,
  ];
}

function commandPreview(target: GitRevertCommitTarget): readonly string[] {
  return ["git", "-C", target.repositoryPath, ...providerArgs(target)];
}

const runtimeEntry: GitRevertCommitRuntimeEntry = {
  owner: "runtime",
  port: "BaseToolExecutorPort.git.runGit",
  method: "runGit",
  binary: "git",
  argvMode: "fixed-revert-commit",
  allowedSubcommand: "revert",
};

function riskForTarget(target: GitRevertCommitTarget): GitRevertCommitRisk {
  return {
    category: "history-mutation",
    riskLevel: "risky",
    mutatesRepository: true,
    mutatesWorkingTree: true,
    mutatesIndex: true,
    mayCreateCommit: !target.noCommit,
    revertsCommit: true,
    mayCreateConflicts: true,
    spawnsProcess: true,
    requiresTapApproval: true,
    runtimeOwnsExecution: true,
  };
}

function plan(normalized: NormalizedRequest, dispatch: GitRevertCommitPlan["dispatch"], dryRun: boolean): GitRevertCommitPlan {
  const risk = riskForTarget(normalized.target);
  return {
    toolId: "git.revertCommit",
    toolKind: "git.revertCommit",
    capability: "revert-commit",
    runtimeId: runtimeId(normalized.context),
    invocationId: invocationId(normalized.context),
    repositoryPath: normalized.target.repositoryPath,
    commitRef: normalized.target.commitRef,
    noCommit: normalized.target.noCommit,
    mainlineParent: normalized.target.mainlineParent,
    gitArgs: providerArgs(normalized.target),
    commandPreview: commandPreview(normalized.target),
    requiredPermissions: permissionsForTarget(normalized.target),
    runtimeEntry,
    risk,
    dispatch,
    dryRun,
    wouldMutateRepository: true,
    unsafeSideEffects: true,
    outputEnvelope: { stdoutPreview: "", stderrPreview: "", parsed: false },
    audit: {
      guard: "git-history-mutation-runtime-guard",
      event: "basicTool.git.revertCommit.planned",
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
  return `${stdout}\n${stderr}`.split(/\r?\n/u).map((line) => line.trim()).find(Boolean);
}

function parseCommitSummaryLine(line: string | undefined): { branchName?: string; commitHash?: string; subject?: string } {
  if (line === undefined) return {};
  const match = line.match(/^\[([^\s\]]+)\s+([0-9a-fA-F]+)\]\s*(.*)$/u);
  if (match === null) return {};
  return { branchName: match[1], commitHash: match[2], subject: match[3]?.trim() || undefined };
}

function parseFilesChanged(stdout: string): number | undefined {
  const match = stdout.match(/^\s*(\d+)\s+files?\s+changed\b/mu);
  return match === null ? undefined : Number.parseInt(match[1], 10);
}

export function parseGitRevertCommitResult(
  providerResult: GitRevertCommitProviderResult | undefined,
  target: GitRevertCommitTarget,
): GitRevertCommitEnvelope {
  const hint = providerResult === undefined ? undefined : firstOutputLine(providerResult.stdout, providerResult.stderr);
  const parsedSummary = parseCommitSummaryLine(hint);
  return {
    parser: "git-revert-output-v1",
    commitRef: target.commitRef,
    noCommit: target.noCommit,
    mainlineParent: target.mainlineParent,
    exitCode: providerResult?.exitCode,
    stdoutLineCount: lineCount(providerResult?.stdout ?? ""),
    stderrLineCount: lineCount(providerResult?.stderr ?? ""),
    operationHint: hint,
    branchName: parsedSummary.branchName,
    commitHash: parsedSummary.commitHash,
    subject: parsedSummary.subject,
    filesChanged: providerResult === undefined ? undefined : parseFilesChanged(providerResult.stdout),
    revertCompleted: providerResult?.exitCode === 0,
  };
}

function success(normalized: NormalizedRequest, dryRun: boolean, providerResult?: GitRevertCommitProviderResult): GitRevertCommitResult {
  const executionPlan = plan(normalized, dryRun ? "dry-run" : "runtime-git-executor", dryRun);
  return {
    ok: true,
    toolId: "git.revertCommit",
    plan: executionPlan,
    output: {
      kind: "agentCore.basicTool.git.revertCommit",
      target: normalized.target,
      runtimeEntry,
      risk: riskForTarget(normalized.target),
      gitArgs: executionPlan.gitArgs,
      commandPreview: executionPlan.commandPreview,
      timeoutMs: normalized.timeoutMs ?? gitRevertCommitDescriptor.defaultTimeoutMs,
      dryRun,
      executionBlocked: dryRun,
      providerCalled: providerResult !== undefined,
      exitCode: providerResult?.exitCode,
      stdout: providerResult?.stdout,
      stderr: providerResult?.stderr,
      permissionsRequired: permissionsForTarget(normalized.target),
      unsafeSideEffects: true,
      revertsCommit: true,
      resultEnvelope: parseGitRevertCommitResult(providerResult, normalized.target),
    },
    audit: [
      auditEvent(
        dryRun ? "agentCore.basicTool.git.revertCommit.dryRun" : "agentCore.basicTool.git.revertCommit.executed",
        normalized.context,
        normalized.target.repositoryPath,
        {
          commitRef: normalized.target.commitRef,
          noCommit: normalized.target.noCommit,
          mainlineParent: normalized.target.mainlineParent,
          exitCode: providerResult?.exitCode,
        },
      ),
    ],
    events: [dryRun ? "basicTool.git.revertCommit.dryRun" : "basicTool.git.revertCommit.executed"],
  };
}

export function planGitCommitRevert(request: GitRevertCommitRequest = {}): GitRevertCommitResult {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const scopeFailure = ensureScope(normalized.target.repositoryPath, normalized.context);
  if (scopeFailure !== undefined) return scopeFailure;
  const permissionFailure = ensurePermissions(normalized.target, normalized.context);
  if (permissionFailure !== undefined) return permissionFailure;
  return success(normalized, true);
}

export const planGitRevertCommit = planGitCommitRevert;

export async function executeGitRevertCommit(request: GitRevertCommitRequest = {}): Promise<GitRevertCommitResult> {
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
    return failure(
      "PROVIDER_UNAVAILABLE",
      "git.revertCommit requires runtime.execEngine.git.runGit for real execution",
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
      "git.revertCommit provider rejected the request or failed safely",
      "provider",
      normalized.context,
      normalized.target.repositoryPath,
    );
  }
}
