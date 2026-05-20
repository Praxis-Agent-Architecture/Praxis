/*
 * git.rebaseBranch storage core.
 * Owns the fixed git-rebase branch contract and delegates host execution to BaseToolExecutorPort.git.runGit.
 */

export type GitRebaseBranchPermission = "git:read" | "git:write" | "filesystem:read" | "filesystem:write";

export type GitRebaseBranchGuard = {
  allowed?: boolean;
  accepted?: boolean;
  reason?: string;
};

export type GitRebaseBranchContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: GitRebaseBranchGuard;
  allowedRepositoryRoots?: readonly string[];
  grantedPermissions?: readonly GitRebaseBranchPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type GitRebaseBranchTarget = {
  repositoryPath: string;
  upstreamRef: string;
  branchName?: string;
  ontoRef?: string;
  keepBase: boolean;
  autosquash: boolean;
  interactive: boolean;
};

export type GitRebaseBranchRequest = {
  target?: Partial<GitRebaseBranchTarget>;
  context?: GitRebaseBranchContext;
  provider?: GitRebaseBranchProvider;
  timeoutMs?: number;
  metadata?: Readonly<Record<string, unknown>>;
  runtimeId?: string;
  invocationId?: string;
  repositoryPath?: string;
  upstreamRef?: string;
  upstream?: string;
  branchName?: string;
  branch?: string;
  ref?: string;
  ontoRef?: string;
  onto?: string;
  keepBase?: boolean;
  autosquash?: boolean;
  interactive?: boolean;
  dryRun?: boolean;
};

export type GitRebaseBranchRuntimeEntry = {
  owner: "runtime";
  port: "BaseToolExecutorPort.git.runGit";
  method: "runGit";
  binary: "git";
  argvMode: "fixed-rebase-branch-history-mutation";
  allowedSubcommand: "rebase";
};

export type GitRebaseBranchRisk = {
  category: "history-mutation";
  riskLevel: "risky";
  mutatesRepository: true;
  mutatesWorkingTree: true;
  mutatesIndex: true;
  rewritesHistory: true;
  mayCreateConflicts: true;
  spawnsProcess: true;
  requiresTapApproval: true;
  runtimeOwnsExecution: true;
};

export type GitRebaseBranchEnvelope = {
  parser: "git-rebase-output-v1";
  upstreamRef: string;
  branchName?: string;
  ontoRef?: string;
  keepBase: boolean;
  autosquash: boolean;
  interactive: boolean;
  exitCode?: number;
  stdoutLineCount: number;
  stderrLineCount: number;
  rebaseHint?: string;
  rebaseCompleted: boolean;
  conflictDetected: boolean;
  rebaseStopped: boolean;
};

export type GitRebaseBranchOutput = {
  kind: "agentCore.basicTool.git.rebaseBranch";
  target: GitRebaseBranchTarget;
  runtimeEntry: GitRebaseBranchRuntimeEntry;
  risk: GitRebaseBranchRisk;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  timeoutMs: number;
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  permissionsRequired: readonly GitRebaseBranchPermission[];
  unsafeSideEffects: true;
  rebasesBranch: true;
  resultEnvelope: GitRebaseBranchEnvelope;
};

export type GitRebaseBranchPlan = {
  toolId: "git.rebaseBranch";
  toolKind: "git.rebaseBranch";
  capability: "rebase-branch";
  runtimeId: string;
  invocationId: string;
  repositoryPath: string;
  upstreamRef: string;
  branchName?: string;
  ontoRef?: string;
  keepBase: boolean;
  autosquash: boolean;
  interactive: boolean;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  requiredPermissions: readonly GitRebaseBranchPermission[];
  runtimeEntry: GitRebaseBranchRuntimeEntry;
  risk: GitRebaseBranchRisk;
  dispatch: "dry-run" | "runtime-git-executor";
  dryRun: boolean;
  wouldMutateWorkingTree: true;
  wouldMutateIndex: true;
  wouldRewriteHistory: true;
  unsafeSideEffects: true;
  outputEnvelope: { stdoutPreview: ""; stderrPreview: ""; parsed: false };
  audit: {
    guard: "git-rebase-runtime-guard";
    event: "basicTool.git.rebaseBranch.planned";
    governanceRequired: true;
    tapCanWrap: true;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type GitRebaseBranchErrorBoundary = "input" | "scope" | "permission" | "governance" | "provider";
export type GitRebaseBranchErrorCode =
  | "MISSING_REPOSITORY_PATH"
  | "MISSING_UPSTREAM_REF"
  | "INVALID_ARGUMENT"
  | "INVALID_CONTEXT"
  | "UNSAFE_REF"
  | "INVALID_TIMEOUT"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type GitRebaseBranchError = {
  code: GitRebaseBranchErrorCode;
  message: string;
  boundary: GitRebaseBranchErrorBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type GitRebaseBranchAuditEvent = {
  type: string;
  toolId: "git.rebaseBranch";
  invocationId: string;
  dryRun: boolean;
  repositoryPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type GitRebaseBranchResult =
  | {
      ok: true;
      toolId: "git.rebaseBranch";
      output: GitRebaseBranchOutput;
      plan: GitRebaseBranchPlan;
      audit: readonly GitRebaseBranchAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "git.rebaseBranch";
      error: GitRebaseBranchError;
      audit: readonly GitRebaseBranchAuditEvent[];
      events: readonly string[];
    };

export type GitRebaseBranchProviderRequest = {
  repositoryPath: string;
  args: readonly string[];
  timeoutMs?: number;
};

export type GitRebaseBranchProviderResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type GitRebaseBranchProvider = (
  request: GitRebaseBranchProviderRequest,
  context: GitRebaseBranchContext,
) => GitRebaseBranchProviderResult | Promise<GitRebaseBranchProviderResult>;

type NormalizedRequest = {
  target: GitRebaseBranchTarget;
  context: GitRebaseBranchContext;
  timeoutMs?: number;
};

export const gitRebaseBranchDescriptor = {
  toolId: "git.rebaseBranch",
  toolKind: "git.rebaseBranch",
  capability: "rebase-branch",
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

function dryRunEnabled(context: GitRebaseBranchContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: GitRebaseBranchContext | undefined): string {
  return stringValue(context?.invocationId)?.trim() || "git.rebaseBranch:dry-run";
}

function runtimeId(context: GitRebaseBranchContext | undefined): string {
  return stringValue(context?.runtimeId)?.trim() || "runtime.unspecified";
}

function auditEvent(
  type: string,
  context: GitRebaseBranchContext | undefined,
  repositoryPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): GitRebaseBranchAuditEvent {
  return {
    type,
    toolId: gitRebaseBranchDescriptor.toolId,
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
  code: GitRebaseBranchErrorCode,
  message: string,
  boundary: GitRebaseBranchErrorBoundary,
  context: GitRebaseBranchContext | undefined,
  repositoryPath?: string,
): GitRebaseBranchResult {
  return {
    ok: false,
    toolId: gitRebaseBranchDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.git.rebaseBranch.rejected", context, repositoryPath, { code })],
    events: ["basicTool.git.rebaseBranch.rejected"],
  };
}

function normalizeContext(rawContext: unknown, legacyRequest: Record<string, unknown>): GitRebaseBranchContext | GitRebaseBranchResult {
  const contextRecord = rawContext === undefined ? {} : rawContext;
  if (!isRecord(contextRecord)) {
    return failure("INVALID_CONTEXT", "git.rebaseBranch context must be an object", "input", undefined);
  }
  const guard = contextRecord.guard;
  if (guard !== undefined && !isRecord(guard)) {
    return failure("INVALID_CONTEXT", "git.rebaseBranch context.guard must be an object", "input", undefined);
  }
  const allowedRepositoryRoots = stringArrayValue(contextRecord.allowedRepositoryRoots);
  if (contextRecord.allowedRepositoryRoots !== undefined && allowedRepositoryRoots === undefined) {
    return failure("INVALID_CONTEXT", "git.rebaseBranch context.allowedRepositoryRoots must be a string array", "input", undefined);
  }
  const grantedPermissions = stringArrayValue(contextRecord.grantedPermissions);
  if (contextRecord.grantedPermissions !== undefined && grantedPermissions === undefined) {
    return failure("INVALID_CONTEXT", "git.rebaseBranch context.grantedPermissions must be a string array", "input", undefined);
  }
  const auditMetadata = isRecord(contextRecord.auditMetadata) ? contextRecord.auditMetadata : undefined;
  if (contextRecord.auditMetadata !== undefined && auditMetadata === undefined) {
    return failure("INVALID_CONTEXT", "git.rebaseBranch context.auditMetadata must be an object", "input", undefined);
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
    grantedPermissions: grantedPermissions as readonly GitRebaseBranchPermission[] | undefined,
    auditMetadata,
  };
}

function normalizeRepositoryPath(value: unknown, context: GitRebaseBranchContext | undefined): string | GitRebaseBranchResult {
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_REPOSITORY_PATH", "git.rebaseBranch requires target.repositoryPath", "input", context);
  }
  if (normalized.includes("\0")) {
    return failure("INVALID_ARGUMENT", "git.rebaseBranch repositoryPath cannot contain NUL bytes", "input", context, normalized);
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

function normalizeUpstreamRef(
  value: unknown,
  context: GitRebaseBranchContext,
  repositoryPath: string,
): string | GitRebaseBranchResult {
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_UPSTREAM_REF", "git.rebaseBranch requires target.upstreamRef", "input", context, repositoryPath);
  }
  if (isUnsafeRef(normalized)) {
    return failure("UNSAFE_REF", "git.rebaseBranch target.upstreamRef must be a safe ref", "input", context, repositoryPath);
  }
  return normalized;
}

function normalizeOptionalRef(
  fieldName: "branchName" | "ontoRef",
  value: unknown,
  context: GitRebaseBranchContext,
  repositoryPath: string,
): string | undefined | GitRebaseBranchResult {
  if (value === undefined) return undefined;
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) return undefined;
  if (isUnsafeRef(normalized)) {
    return failure("UNSAFE_REF", `git.rebaseBranch target.${fieldName} must be a safe ref`, "input", context, repositoryPath);
  }
  return normalized;
}

function normalizeTimeout(
  value: unknown,
  context: GitRebaseBranchContext,
  repositoryPath: string,
): number | undefined | GitRebaseBranchResult {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > gitRebaseBranchDescriptor.maxTimeoutMs) {
    return failure(
      "INVALID_TIMEOUT",
      `git.rebaseBranch timeoutMs must be an integer from 1 to ${gitRebaseBranchDescriptor.maxTimeoutMs}`,
      "input",
      context,
      repositoryPath,
    );
  }
  return value;
}

function normalizeRequest(request: unknown): NormalizedRequest | GitRebaseBranchResult {
  if (request !== undefined && !isRecord(request)) {
    return failure("INVALID_ARGUMENT", "git.rebaseBranch request must be an object", "input", undefined);
  }
  const requestRecord = isRecord(request) ? request : {};
  const context = normalizeContext(requestRecord.context, requestRecord);
  if ("ok" in context) return context;
  const targetRecord = isRecord(requestRecord.target) ? requestRecord.target : requestRecord;
  if (requestRecord.target !== undefined && !isRecord(requestRecord.target)) {
    return failure("INVALID_ARGUMENT", "git.rebaseBranch target must be an object", "input", context);
  }
  const repositoryPath = normalizeRepositoryPath(targetRecord.repositoryPath, context);
  if (typeof repositoryPath !== "string") return repositoryPath;
  const upstreamRef = normalizeUpstreamRef(
    targetRecord.upstreamRef ?? targetRecord.upstream ?? targetRecord.ref,
    context,
    repositoryPath,
  );
  if (typeof upstreamRef !== "string") return upstreamRef;
  const branchName = normalizeOptionalRef(
    "branchName",
    targetRecord.branchName ?? targetRecord.branch,
    context,
    repositoryPath,
  );
  if (branchName !== undefined && typeof branchName !== "string") return branchName;
  const ontoRef = normalizeOptionalRef("ontoRef", targetRecord.ontoRef ?? targetRecord.onto, context, repositoryPath);
  if (ontoRef !== undefined && typeof ontoRef !== "string") return ontoRef;
  const timeoutMs = normalizeTimeout(requestRecord.timeoutMs, context, repositoryPath);
  if (timeoutMs !== undefined && typeof timeoutMs !== "number") return timeoutMs;
  return {
    target: {
      repositoryPath,
      upstreamRef,
      branchName,
      ontoRef,
      keepBase: targetRecord.keepBase === true,
      autosquash: targetRecord.autosquash === true,
      interactive: targetRecord.interactive === true,
    },
    context,
    timeoutMs,
  };
}

function normalizeAllowedRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/u, "");
}

function ensureScope(repositoryPath: string, context: GitRebaseBranchContext | undefined): GitRebaseBranchResult | undefined {
  const allowedRoots = cleanList(context?.allowedRepositoryRoots).map(normalizeAllowedRoot);
  if (allowedRoots.length === 0) return undefined;
  const allowed = allowedRoots.some((root) => repositoryPath === root || repositoryPath.startsWith(`${root}/`));
  return allowed
    ? undefined
    : failure("SCOPE_REJECTED", "git.rebaseBranch target repository is outside the allowed repository roots", "scope", context, repositoryPath);
}

function permissionsForTarget(): readonly GitRebaseBranchPermission[] {
  return ["git:read", "git:write", "filesystem:read", "filesystem:write"];
}

function ensurePermissions(target: GitRebaseBranchTarget, context: GitRebaseBranchContext | undefined): GitRebaseBranchResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) return undefined;
  const missing = permissionsForTarget().filter((permission) => !granted.includes(permission));
  return missing.length === 0
    ? undefined
    : failure("PERMISSION_DENIED", `git.rebaseBranch is missing permissions: ${missing.join(", ")}`, "permission", context, target.repositoryPath);
}

function ensureGovernance(repositoryPath: string, context: GitRebaseBranchContext): GitRebaseBranchResult | undefined {
  if (dryRunEnabled(context)) return undefined;
  if (context.guard?.allowed === true || context.guard?.accepted === true) return undefined;
  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "git.rebaseBranch requires an affirmative runtime guard for real execution",
    "governance",
    context,
    repositoryPath,
  );
}

function providerArgs(target: GitRebaseBranchTarget): readonly string[] {
  return [
    "rebase",
    ...(target.interactive ? ["--interactive"] : []),
    ...(target.autosquash ? ["--autosquash"] : []),
    ...(target.keepBase ? ["--keep-base"] : []),
    ...(target.ontoRef === undefined ? [] : ["--onto", target.ontoRef]),
    target.upstreamRef,
    ...(target.branchName === undefined ? [] : [target.branchName]),
  ];
}

function commandPreview(target: GitRebaseBranchTarget): readonly string[] {
  return ["git", "-C", target.repositoryPath, ...providerArgs(target)];
}

const runtimeEntry: GitRebaseBranchRuntimeEntry = {
  owner: "runtime",
  port: "BaseToolExecutorPort.git.runGit",
  method: "runGit",
  binary: "git",
  argvMode: "fixed-rebase-branch-history-mutation",
  allowedSubcommand: "rebase",
};

const risk: GitRebaseBranchRisk = {
  category: "history-mutation",
  riskLevel: "risky",
  mutatesRepository: true,
  mutatesWorkingTree: true,
  mutatesIndex: true,
  rewritesHistory: true,
  mayCreateConflicts: true,
  spawnsProcess: true,
  requiresTapApproval: true,
  runtimeOwnsExecution: true,
};

function plan(normalized: NormalizedRequest, dispatch: GitRebaseBranchPlan["dispatch"], dryRun: boolean): GitRebaseBranchPlan {
  return {
    toolId: "git.rebaseBranch",
    toolKind: "git.rebaseBranch",
    capability: "rebase-branch",
    runtimeId: runtimeId(normalized.context),
    invocationId: invocationId(normalized.context),
    repositoryPath: normalized.target.repositoryPath,
    upstreamRef: normalized.target.upstreamRef,
    branchName: normalized.target.branchName,
    ontoRef: normalized.target.ontoRef,
    keepBase: normalized.target.keepBase,
    autosquash: normalized.target.autosquash,
    interactive: normalized.target.interactive,
    gitArgs: providerArgs(normalized.target),
    commandPreview: commandPreview(normalized.target),
    requiredPermissions: permissionsForTarget(),
    runtimeEntry,
    risk,
    dispatch,
    dryRun,
    wouldMutateWorkingTree: true,
    wouldMutateIndex: true,
    wouldRewriteHistory: true,
    unsafeSideEffects: true,
    outputEnvelope: { stdoutPreview: "", stderrPreview: "", parsed: false },
    audit: {
      guard: "git-rebase-runtime-guard",
      event: "basicTool.git.rebaseBranch.planned",
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

export function parseGitRebaseBranchResult(
  providerResult: GitRebaseBranchProviderResult | undefined,
  target: GitRebaseBranchTarget,
): GitRebaseBranchEnvelope {
  const combined = `${providerResult?.stdout ?? ""}\n${providerResult?.stderr ?? ""}`;
  const conflictDetected = /\bCONFLICT\b|could not apply|Resolve all conflicts/iu.test(combined);
  return {
    parser: "git-rebase-output-v1",
    upstreamRef: target.upstreamRef,
    branchName: target.branchName,
    ontoRef: target.ontoRef,
    keepBase: target.keepBase,
    autosquash: target.autosquash,
    interactive: target.interactive,
    exitCode: providerResult?.exitCode,
    stdoutLineCount: lineCount(providerResult?.stdout ?? ""),
    stderrLineCount: lineCount(providerResult?.stderr ?? ""),
    rebaseHint: providerResult === undefined ? undefined : firstOutputLine(providerResult.stdout, providerResult.stderr),
    rebaseCompleted: providerResult?.exitCode === 0,
    conflictDetected,
    rebaseStopped: providerResult !== undefined && providerResult.exitCode !== 0 && conflictDetected,
  };
}

function success(normalized: NormalizedRequest, dryRun: boolean, providerResult?: GitRebaseBranchProviderResult): GitRebaseBranchResult {
  const executionPlan = plan(normalized, dryRun ? "dry-run" : "runtime-git-executor", dryRun);
  return {
    ok: true,
    toolId: "git.rebaseBranch",
    plan: executionPlan,
    output: {
      kind: "agentCore.basicTool.git.rebaseBranch",
      target: normalized.target,
      runtimeEntry,
      risk,
      gitArgs: executionPlan.gitArgs,
      commandPreview: executionPlan.commandPreview,
      timeoutMs: normalized.timeoutMs ?? gitRebaseBranchDescriptor.defaultTimeoutMs,
      dryRun,
      executionBlocked: dryRun,
      providerCalled: providerResult !== undefined,
      exitCode: providerResult?.exitCode,
      stdout: providerResult?.stdout,
      stderr: providerResult?.stderr,
      permissionsRequired: permissionsForTarget(),
      unsafeSideEffects: true,
      rebasesBranch: true,
      resultEnvelope: parseGitRebaseBranchResult(providerResult, normalized.target),
    },
    audit: [
      auditEvent(
        dryRun ? "agentCore.basicTool.git.rebaseBranch.dryRun" : "agentCore.basicTool.git.rebaseBranch.executed",
        normalized.context,
        normalized.target.repositoryPath,
        {
          upstreamRef: normalized.target.upstreamRef,
          branchName: normalized.target.branchName,
          ontoRef: normalized.target.ontoRef,
          exitCode: providerResult?.exitCode,
        },
      ),
    ],
    events: [dryRun ? "basicTool.git.rebaseBranch.dryRun" : "basicTool.git.rebaseBranch.executed"],
  };
}

export function planGitBranchRebase(request: GitRebaseBranchRequest = {}): GitRebaseBranchResult {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const scopeFailure = ensureScope(normalized.target.repositoryPath, normalized.context);
  if (scopeFailure !== undefined) return scopeFailure;
  const permissionFailure = ensurePermissions(normalized.target, normalized.context);
  if (permissionFailure !== undefined) return permissionFailure;
  return success(normalized, true);
}

export const planGitRebaseBranch = planGitBranchRebase;

export async function executeGitRebaseBranch(request: GitRebaseBranchRequest = {}): Promise<GitRebaseBranchResult> {
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
      "git.rebaseBranch requires runtime.execEngine.git.runGit for real execution",
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
      "git.rebaseBranch provider rejected the request or failed safely",
      "provider",
      normalized.context,
      normalized.target.repositoryPath,
    );
  }
}
