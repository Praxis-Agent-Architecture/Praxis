/*
 * git.applyStashChanges storage core.
 * Owns the fixed git-stash apply workspace mutation contract and delegates host execution to BaseToolExecutorPort.git.runGit.
 */

export type GitApplyStashChangesPermission = "git:read" | "git:write" | "filesystem:read" | "filesystem:write";

export type GitApplyStashChangesGuard = {
  allowed?: boolean;
  accepted?: boolean;
  reason?: string;
};

export type GitApplyStashChangesContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: GitApplyStashChangesGuard;
  allowedRepositoryRoots?: readonly string[];
  grantedPermissions?: readonly GitApplyStashChangesPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type GitApplyStashChangesTarget = {
  repositoryPath: string;
  stashRef: string;
  reinstateIndex: boolean;
};

export type GitApplyStashChangesRequest = {
  target?: Partial<GitApplyStashChangesTarget>;
  context?: GitApplyStashChangesContext;
  provider?: GitApplyStashChangesProvider;
  timeoutMs?: number;
  metadata?: Readonly<Record<string, unknown>>;
  runtimeId?: string;
  invocationId?: string;
  repositoryPath?: string;
  stashRef?: string;
  reinstateIndex?: boolean;
  dryRun?: boolean;
};

export type GitApplyStashChangesRuntimeEntry = {
  owner: "runtime";
  port: "BaseToolExecutorPort.git.runGit";
  method: "runGit";
  binary: "git";
  argvMode: "fixed-stash-apply-workspace-mutation";
  allowedSubcommand: "stash";
};

export type GitApplyStashChangesRisk = {
  category: "workspace-mutation";
  riskLevel: "risky";
  mutatesRepository: true;
  mutatesWorkingTree: true;
  mutatesIndex: boolean;
  dropsStashOnSuccess: false;
  spawnsProcess: true;
  requiresTapApproval: true;
  runtimeOwnsExecution: true;
};

export type GitApplyStashChangesEnvelope = {
  parser: "git-stash-apply-exit-v1";
  stashRef: string;
  reinstateIndex: boolean;
  exitCode?: number;
  stdoutLineCount: number;
  stderrLineCount: number;
  appliedHint?: string;
};

export type GitApplyStashChangesOutput = {
  kind: "agentCore.basicTool.git.applyStashChanges";
  target: GitApplyStashChangesTarget;
  runtimeEntry: GitApplyStashChangesRuntimeEntry;
  risk: GitApplyStashChangesRisk;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  timeoutMs: number;
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  permissionsRequired: readonly GitApplyStashChangesPermission[];
  unsafeSideEffects: true;
  dropsStashOnSuccess: false;
  resultEnvelope: GitApplyStashChangesEnvelope;
};

export type GitApplyStashChangesPlan = {
  toolId: "git.applyStashChanges";
  toolKind: "git.applyStashChanges";
  capability: "apply-stash-changes";
  runtimeId: string;
  invocationId: string;
  repositoryPath: string;
  stashRef: string;
  reinstateIndex: boolean;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  requiredPermissions: readonly GitApplyStashChangesPermission[];
  runtimeEntry: GitApplyStashChangesRuntimeEntry;
  risk: GitApplyStashChangesRisk;
  dispatch: "dry-run" | "runtime-git-executor";
  dryRun: boolean;
  wouldMutateWorkingTree: true;
  wouldMutateIndex: boolean;
  unsafeSideEffects: true;
  outputEnvelope: { stdoutPreview: ""; stderrPreview: ""; parsed: false };
  audit: {
    guard: "git-apply-stash-runtime-guard";
    event: "basicTool.git.applyStashChanges.planned";
    governanceRequired: true;
    tapCanWrap: true;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type GitApplyStashChangesErrorBoundary = "input" | "scope" | "permission" | "governance" | "provider";
export type GitApplyStashChangesErrorCode =
  | "MISSING_REPOSITORY_PATH"
  | "INVALID_ARGUMENT"
  | "INVALID_CONTEXT"
  | "INVALID_STASH_REF"
  | "INVALID_TIMEOUT"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type GitApplyStashChangesError = {
  code: GitApplyStashChangesErrorCode;
  message: string;
  boundary: GitApplyStashChangesErrorBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type GitApplyStashChangesAuditEvent = {
  type: string;
  toolId: "git.applyStashChanges";
  invocationId: string;
  dryRun: boolean;
  repositoryPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type GitApplyStashChangesResult =
  | {
      ok: true;
      toolId: "git.applyStashChanges";
      output: GitApplyStashChangesOutput;
      plan: GitApplyStashChangesPlan;
      audit: readonly GitApplyStashChangesAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "git.applyStashChanges";
      error: GitApplyStashChangesError;
      audit: readonly GitApplyStashChangesAuditEvent[];
      events: readonly string[];
    };

export type GitApplyStashChangesProviderRequest = {
  repositoryPath: string;
  args: readonly string[];
  timeoutMs?: number;
};

export type GitApplyStashChangesProviderResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type GitApplyStashChangesProvider = (
  request: GitApplyStashChangesProviderRequest,
  context: GitApplyStashChangesContext,
) => GitApplyStashChangesProviderResult | Promise<GitApplyStashChangesProviderResult>;

type NormalizedRequest = {
  target: GitApplyStashChangesTarget;
  context: GitApplyStashChangesContext;
  timeoutMs?: number;
};

export const gitApplyStashChangesDescriptor = {
  toolId: "git.applyStashChanges",
  toolKind: "git.applyStashChanges",
  capability: "apply-stash-changes",
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

function dryRunEnabled(context: GitApplyStashChangesContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: GitApplyStashChangesContext | undefined): string {
  return stringValue(context?.invocationId)?.trim() || "git.applyStashChanges:dry-run";
}

function runtimeId(context: GitApplyStashChangesContext | undefined): string {
  return stringValue(context?.runtimeId)?.trim() || "runtime.unspecified";
}

function auditEvent(
  type: string,
  context: GitApplyStashChangesContext | undefined,
  repositoryPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): GitApplyStashChangesAuditEvent {
  return {
    type,
    toolId: gitApplyStashChangesDescriptor.toolId,
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
  code: GitApplyStashChangesErrorCode,
  message: string,
  boundary: GitApplyStashChangesErrorBoundary,
  context: GitApplyStashChangesContext | undefined,
  repositoryPath?: string,
): GitApplyStashChangesResult {
  return {
    ok: false,
    toolId: gitApplyStashChangesDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.git.applyStashChanges.rejected", context, repositoryPath, { code })],
    events: ["basicTool.git.applyStashChanges.rejected"],
  };
}

function normalizeContext(rawContext: unknown, legacyRequest: Record<string, unknown>): GitApplyStashChangesContext | GitApplyStashChangesResult {
  const contextRecord = rawContext === undefined ? {} : rawContext;
  if (!isRecord(contextRecord)) {
    return failure("INVALID_CONTEXT", "git.applyStashChanges context must be an object", "input", undefined);
  }
  const guard = contextRecord.guard;
  if (guard !== undefined && !isRecord(guard)) {
    return failure("INVALID_CONTEXT", "git.applyStashChanges context.guard must be an object", "input", undefined);
  }
  const allowedRepositoryRoots = stringArrayValue(contextRecord.allowedRepositoryRoots);
  if (contextRecord.allowedRepositoryRoots !== undefined && allowedRepositoryRoots === undefined) {
    return failure("INVALID_CONTEXT", "git.applyStashChanges context.allowedRepositoryRoots must be a string array", "input", undefined);
  }
  const grantedPermissions = stringArrayValue(contextRecord.grantedPermissions);
  if (contextRecord.grantedPermissions !== undefined && grantedPermissions === undefined) {
    return failure("INVALID_CONTEXT", "git.applyStashChanges context.grantedPermissions must be a string array", "input", undefined);
  }
  const auditMetadata = isRecord(contextRecord.auditMetadata) ? contextRecord.auditMetadata : undefined;
  if (contextRecord.auditMetadata !== undefined && auditMetadata === undefined) {
    return failure("INVALID_CONTEXT", "git.applyStashChanges context.auditMetadata must be an object", "input", undefined);
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
    grantedPermissions: grantedPermissions as readonly GitApplyStashChangesPermission[] | undefined,
    auditMetadata,
  };
}

function normalizeRepositoryPath(value: unknown, context: GitApplyStashChangesContext | undefined): string | GitApplyStashChangesResult {
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_REPOSITORY_PATH", "git.applyStashChanges requires target.repositoryPath", "input", context);
  }
  if (normalized.includes("\0")) {
    return failure("INVALID_ARGUMENT", "git.applyStashChanges repositoryPath cannot contain NUL bytes", "input", context, normalized);
  }
  return normalized;
}

function normalizeStashRef(value: unknown, context: GitApplyStashChangesContext, repositoryPath: string): string | GitApplyStashChangesResult {
  const normalized = stringValue(value)?.trim() || "stash@{0}";
  if (normalized.includes("\0") || normalized.startsWith("-") || /\s/u.test(normalized)) {
    return failure("INVALID_STASH_REF", "git.applyStashChanges target.stashRef must be a safe ref token", "input", context, repositoryPath);
  }
  return normalized;
}

function normalizeTimeout(
  value: unknown,
  context: GitApplyStashChangesContext,
  repositoryPath: string,
): number | undefined | GitApplyStashChangesResult {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > gitApplyStashChangesDescriptor.maxTimeoutMs) {
    return failure(
      "INVALID_TIMEOUT",
      `git.applyStashChanges timeoutMs must be an integer from 1 to ${gitApplyStashChangesDescriptor.maxTimeoutMs}`,
      "input",
      context,
      repositoryPath,
    );
  }
  return value;
}

function normalizeRequest(request: unknown): NormalizedRequest | GitApplyStashChangesResult {
  if (request !== undefined && !isRecord(request)) {
    return failure("INVALID_ARGUMENT", "git.applyStashChanges request must be an object", "input", undefined);
  }
  const requestRecord = isRecord(request) ? request : {};
  const context = normalizeContext(requestRecord.context, requestRecord);
  if ("ok" in context) return context;
  const targetRecord = isRecord(requestRecord.target) ? requestRecord.target : requestRecord;
  if (requestRecord.target !== undefined && !isRecord(requestRecord.target)) {
    return failure("INVALID_ARGUMENT", "git.applyStashChanges target must be an object", "input", context);
  }
  const repositoryPath = normalizeRepositoryPath(targetRecord.repositoryPath, context);
  if (typeof repositoryPath !== "string") return repositoryPath;
  const stashRef = normalizeStashRef(targetRecord.stashRef, context, repositoryPath);
  if (typeof stashRef !== "string") return stashRef;
  const timeoutMs = normalizeTimeout(requestRecord.timeoutMs, context, repositoryPath);
  if (timeoutMs !== undefined && typeof timeoutMs !== "number") return timeoutMs;
  return {
    target: {
      repositoryPath,
      stashRef,
      reinstateIndex: targetRecord.reinstateIndex === true,
    },
    context,
    timeoutMs,
  };
}

function normalizeAllowedRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/u, "");
}

function ensureScope(repositoryPath: string, context: GitApplyStashChangesContext | undefined): GitApplyStashChangesResult | undefined {
  const allowedRoots = cleanList(context?.allowedRepositoryRoots).map(normalizeAllowedRoot);
  if (allowedRoots.length === 0) return undefined;
  const allowed = allowedRoots.some((root) => repositoryPath === root || repositoryPath.startsWith(`${root}/`));
  return allowed
    ? undefined
    : failure("SCOPE_REJECTED", "git.applyStashChanges target repository is outside the allowed repository roots", "scope", context, repositoryPath);
}

function ensurePermissions(repositoryPath: string, context: GitApplyStashChangesContext | undefined): GitApplyStashChangesResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) return undefined;
  const missing = gitApplyStashChangesDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  return missing.length === 0
    ? undefined
    : failure("PERMISSION_DENIED", `git.applyStashChanges is missing permissions: ${missing.join(", ")}`, "permission", context, repositoryPath);
}

function ensureGovernance(repositoryPath: string, context: GitApplyStashChangesContext): GitApplyStashChangesResult | undefined {
  if (dryRunEnabled(context)) return undefined;
  if (context.guard?.allowed === true || context.guard?.accepted === true) return undefined;
  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "git.applyStashChanges requires an affirmative runtime guard for real execution",
    "governance",
    context,
    repositoryPath,
  );
}

function providerArgs(target: GitApplyStashChangesTarget): readonly string[] {
  return [
    "stash",
    "apply",
    ...(target.reinstateIndex ? ["--index"] : []),
    target.stashRef,
  ];
}

function commandPreview(target: GitApplyStashChangesTarget): readonly string[] {
  return ["git", "-C", target.repositoryPath, ...providerArgs(target)];
}

const runtimeEntry: GitApplyStashChangesRuntimeEntry = {
  owner: "runtime",
  port: "BaseToolExecutorPort.git.runGit",
  method: "runGit",
  binary: "git",
  argvMode: "fixed-stash-apply-workspace-mutation",
  allowedSubcommand: "stash",
};

function riskFor(target: GitApplyStashChangesTarget): GitApplyStashChangesRisk {
  return {
    category: "workspace-mutation",
    riskLevel: "risky",
    mutatesRepository: true,
    mutatesWorkingTree: true,
    mutatesIndex: target.reinstateIndex,
    dropsStashOnSuccess: false,
    spawnsProcess: true,
    requiresTapApproval: true,
    runtimeOwnsExecution: true,
  };
}

function plan(normalized: NormalizedRequest, dispatch: GitApplyStashChangesPlan["dispatch"], dryRun: boolean): GitApplyStashChangesPlan {
  const risk = riskFor(normalized.target);
  return {
    toolId: "git.applyStashChanges",
    toolKind: "git.applyStashChanges",
    capability: "apply-stash-changes",
    runtimeId: runtimeId(normalized.context),
    invocationId: invocationId(normalized.context),
    repositoryPath: normalized.target.repositoryPath,
    stashRef: normalized.target.stashRef,
    reinstateIndex: normalized.target.reinstateIndex,
    gitArgs: providerArgs(normalized.target),
    commandPreview: commandPreview(normalized.target),
    requiredPermissions: gitApplyStashChangesDescriptor.permissionsRequired,
    runtimeEntry,
    risk,
    dispatch,
    dryRun,
    wouldMutateWorkingTree: true,
    wouldMutateIndex: risk.mutatesIndex,
    unsafeSideEffects: true,
    outputEnvelope: { stdoutPreview: "", stderrPreview: "", parsed: false },
    audit: {
      guard: "git-apply-stash-runtime-guard",
      event: "basicTool.git.applyStashChanges.planned",
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

function applyHint(stdout: string, stderr: string): string | undefined {
  const line = `${stdout}\n${stderr}`.split(/\r?\n/u).find((item) => item.trim().length > 0);
  return line?.trim();
}

export function parseGitApplyStashChangesResult(
  providerResult: GitApplyStashChangesProviderResult | undefined,
  target: GitApplyStashChangesTarget,
): GitApplyStashChangesEnvelope {
  return {
    parser: "git-stash-apply-exit-v1",
    stashRef: target.stashRef,
    reinstateIndex: target.reinstateIndex,
    exitCode: providerResult?.exitCode,
    stdoutLineCount: lineCount(providerResult?.stdout ?? ""),
    stderrLineCount: lineCount(providerResult?.stderr ?? ""),
    appliedHint: providerResult === undefined ? undefined : applyHint(providerResult.stdout, providerResult.stderr),
  };
}

function success(normalized: NormalizedRequest, dryRun: boolean, providerResult?: GitApplyStashChangesProviderResult): GitApplyStashChangesResult {
  const executionPlan = plan(normalized, dryRun ? "dry-run" : "runtime-git-executor", dryRun);
  return {
    ok: true,
    toolId: "git.applyStashChanges",
    plan: executionPlan,
    output: {
      kind: "agentCore.basicTool.git.applyStashChanges",
      target: normalized.target,
      runtimeEntry,
      risk: executionPlan.risk,
      gitArgs: executionPlan.gitArgs,
      commandPreview: executionPlan.commandPreview,
      timeoutMs: normalized.timeoutMs ?? gitApplyStashChangesDescriptor.defaultTimeoutMs,
      dryRun,
      executionBlocked: dryRun,
      providerCalled: providerResult !== undefined,
      exitCode: providerResult?.exitCode,
      stdout: providerResult?.stdout,
      stderr: providerResult?.stderr,
      permissionsRequired: gitApplyStashChangesDescriptor.permissionsRequired,
      unsafeSideEffects: true,
      dropsStashOnSuccess: false,
      resultEnvelope: parseGitApplyStashChangesResult(providerResult, normalized.target),
    },
    audit: [
      auditEvent(
        dryRun ? "agentCore.basicTool.git.applyStashChanges.dryRun" : "agentCore.basicTool.git.applyStashChanges.executed",
        normalized.context,
        normalized.target.repositoryPath,
        {
          stashRef: normalized.target.stashRef,
          reinstateIndex: normalized.target.reinstateIndex,
          exitCode: providerResult?.exitCode,
        },
      ),
    ],
    events: [dryRun ? "basicTool.git.applyStashChanges.dryRun" : "basicTool.git.applyStashChanges.executed"],
  };
}

export function planGitApplyStashChanges(request: GitApplyStashChangesRequest = {}): GitApplyStashChangesResult {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const scopeFailure = ensureScope(normalized.target.repositoryPath, normalized.context);
  if (scopeFailure !== undefined) return scopeFailure;
  const permissionFailure = ensurePermissions(normalized.target.repositoryPath, normalized.context);
  if (permissionFailure !== undefined) return permissionFailure;
  return success(normalized, true);
}

export async function executeGitApplyStashChanges(request: GitApplyStashChangesRequest = {}): Promise<GitApplyStashChangesResult> {
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
      "git.applyStashChanges requires runtime.execEngine.git.runGit for real execution",
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
      "git.applyStashChanges provider rejected the request or failed safely",
      "provider",
      normalized.context,
      normalized.target.repositoryPath,
    );
  }
}
