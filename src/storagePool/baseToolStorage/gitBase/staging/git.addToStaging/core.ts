/*
 * git.addToStaging storage core.
 * Owns the fixed git-add contract and delegates host execution to BaseToolExecutorPort.git.runGit.
 */

export type GitAddToStagingPermission = "git:read" | "git:write" | "filesystem:read" | "filesystem:write";

export type GitAddToStagingGuard = {
  allowed?: boolean;
  accepted?: boolean;
  reason?: string;
};

export type GitAddToStagingContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: GitAddToStagingGuard;
  allowedRepositoryRoots?: readonly string[];
  grantedPermissions?: readonly GitAddToStagingPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type GitAddToStagingTarget = {
  repositoryPath: string;
  pathspecs: readonly string[];
  all: boolean;
  update: boolean;
  intentToAdd: boolean;
  patch: boolean;
  force: boolean;
};

export type GitAddToStagingRequest = {
  target?: Partial<GitAddToStagingTarget>;
  context?: GitAddToStagingContext;
  provider?: GitAddToStagingProvider;
  timeoutMs?: number;
  metadata?: Readonly<Record<string, unknown>>;
  runtimeId?: string;
  invocationId?: string;
  repositoryPath?: string;
  pathspecs?: readonly string[];
  all?: boolean;
  update?: boolean;
  intentToAdd?: boolean;
  patch?: boolean;
  force?: boolean;
  dryRun?: boolean;
};

export type GitAddToStagingRuntimeEntry = {
  owner: "runtime";
  port: "BaseToolExecutorPort.git.runGit";
  method: "runGit";
  binary: "git";
  argvMode: "fixed-add-workspace-mutation";
  allowedSubcommand: "add";
};

export type GitAddToStagingRisk = {
  category: "workspace-mutation";
  riskLevel: "risky";
  mutatesRepository: true;
  mutatesWorkingTree: false;
  mutatesIndex: true;
  spawnsProcess: true;
  requiresTapApproval: true;
  runtimeOwnsExecution: true;
};

export type GitAddToStagingEnvelope = {
  parser: "git-add-exit-v1";
  pathspecs: readonly string[];
  all: boolean;
  update: boolean;
  intentToAdd: boolean;
  force: boolean;
  exitCode?: number;
  stdoutLineCount: number;
  stderrLineCount: number;
};

export type GitAddToStagingOutput = {
  kind: "agentCore.basicTool.git.addToStaging";
  target: GitAddToStagingTarget;
  runtimeEntry: GitAddToStagingRuntimeEntry;
  risk: GitAddToStagingRisk;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  timeoutMs: number;
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  permissionsRequired: readonly GitAddToStagingPermission[];
  unsafeSideEffects: true;
  resultEnvelope: GitAddToStagingEnvelope;
};

export type GitAddToStagingPlan = {
  toolId: "git.addToStaging";
  toolKind: "git.addToStaging";
  capability: "add-to-staging";
  runtimeId: string;
  invocationId: string;
  repositoryPath: string;
  pathspecs: readonly string[];
  all: boolean;
  update: boolean;
  intentToAdd: boolean;
  patch: boolean;
  force: boolean;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  requiredPermissions: readonly GitAddToStagingPermission[];
  runtimeEntry: GitAddToStagingRuntimeEntry;
  risk: GitAddToStagingRisk;
  dispatch: "dry-run" | "runtime-git-executor";
  dryRun: boolean;
  wouldMutateIndex: true;
  unsafeSideEffects: true;
  outputEnvelope: { stdoutPreview: ""; stderrPreview: ""; parsed: false };
  audit: {
    guard: "git-add-runtime-guard";
    event: "basicTool.git.addToStaging.planned";
    governanceRequired: true;
    tapCanWrap: true;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type GitAddToStagingErrorBoundary = "input" | "scope" | "permission" | "governance" | "provider";
export type GitAddToStagingErrorCode =
  | "MISSING_REPOSITORY_PATH"
  | "MISSING_TARGET_PATH"
  | "INVALID_ARGUMENT"
  | "INVALID_CONTEXT"
  | "INVALID_PATHSPEC"
  | "PATHSPEC_OUTSIDE_SCOPE"
  | "INVALID_TIMEOUT"
  | "INTERACTIVE_MODE_UNAVAILABLE"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type GitAddToStagingError = {
  code: GitAddToStagingErrorCode;
  message: string;
  boundary: GitAddToStagingErrorBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type GitAddToStagingAuditEvent = {
  type: string;
  toolId: "git.addToStaging";
  invocationId: string;
  dryRun: boolean;
  repositoryPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type GitAddToStagingResult =
  | {
      ok: true;
      toolId: "git.addToStaging";
      output: GitAddToStagingOutput;
      plan: GitAddToStagingPlan;
      audit: readonly GitAddToStagingAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "git.addToStaging";
      error: GitAddToStagingError;
      audit: readonly GitAddToStagingAuditEvent[];
      events: readonly string[];
    };

export type GitAddToStagingProviderRequest = {
  repositoryPath: string;
  args: readonly string[];
  timeoutMs?: number;
};

export type GitAddToStagingProviderResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type GitAddToStagingProvider = (
  request: GitAddToStagingProviderRequest,
  context: GitAddToStagingContext,
) => GitAddToStagingProviderResult | Promise<GitAddToStagingProviderResult>;

type NormalizedRequest = {
  target: GitAddToStagingTarget;
  context: GitAddToStagingContext;
  timeoutMs?: number;
};

export const gitAddToStagingDescriptor = {
  toolId: "git.addToStaging",
  toolKind: "git.addToStaging",
  capability: "add-to-staging",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.staging",
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

function dryRunEnabled(context: GitAddToStagingContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: GitAddToStagingContext | undefined): string {
  return stringValue(context?.invocationId)?.trim() || "git.addToStaging:dry-run";
}

function runtimeId(context: GitAddToStagingContext | undefined): string {
  return stringValue(context?.runtimeId)?.trim() || "runtime.unspecified";
}

function auditEvent(
  type: string,
  context: GitAddToStagingContext | undefined,
  repositoryPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): GitAddToStagingAuditEvent {
  return {
    type,
    toolId: gitAddToStagingDescriptor.toolId,
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
  code: GitAddToStagingErrorCode,
  message: string,
  boundary: GitAddToStagingErrorBoundary,
  context: GitAddToStagingContext | undefined,
  repositoryPath?: string,
): GitAddToStagingResult {
  return {
    ok: false,
    toolId: gitAddToStagingDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.git.addToStaging.rejected", context, repositoryPath, { code })],
    events: ["basicTool.git.addToStaging.rejected"],
  };
}

function normalizeContext(rawContext: unknown, legacyRequest: Record<string, unknown>): GitAddToStagingContext | GitAddToStagingResult {
  const contextRecord = rawContext === undefined ? {} : rawContext;
  if (!isRecord(contextRecord)) {
    return failure("INVALID_CONTEXT", "git.addToStaging context must be an object", "input", undefined);
  }
  const guard = contextRecord.guard;
  if (guard !== undefined && !isRecord(guard)) {
    return failure("INVALID_CONTEXT", "git.addToStaging context.guard must be an object", "input", undefined);
  }
  const allowedRepositoryRoots = stringArrayValue(contextRecord.allowedRepositoryRoots);
  if (contextRecord.allowedRepositoryRoots !== undefined && allowedRepositoryRoots === undefined) {
    return failure("INVALID_CONTEXT", "git.addToStaging context.allowedRepositoryRoots must be a string array", "input", undefined);
  }
  const grantedPermissions = stringArrayValue(contextRecord.grantedPermissions);
  if (contextRecord.grantedPermissions !== undefined && grantedPermissions === undefined) {
    return failure("INVALID_CONTEXT", "git.addToStaging context.grantedPermissions must be a string array", "input", undefined);
  }
  const auditMetadata = isRecord(contextRecord.auditMetadata) ? contextRecord.auditMetadata : undefined;
  if (contextRecord.auditMetadata !== undefined && auditMetadata === undefined) {
    return failure("INVALID_CONTEXT", "git.addToStaging context.auditMetadata must be an object", "input", undefined);
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
    grantedPermissions: grantedPermissions as readonly GitAddToStagingPermission[] | undefined,
    auditMetadata,
  };
}

function normalizeRepositoryPath(value: unknown, context: GitAddToStagingContext | undefined): string | GitAddToStagingResult {
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_REPOSITORY_PATH", "git.addToStaging requires target.repositoryPath", "input", context);
  }
  if (normalized.includes("\0")) {
    return failure("INVALID_ARGUMENT", "git.addToStaging repositoryPath cannot contain NUL bytes", "input", context, normalized);
  }
  return normalized;
}

function normalizePathspec(value: string, context: GitAddToStagingContext, repositoryPath: string): string | GitAddToStagingResult {
  const normalized = value.trim().replaceAll("\\", "/");
  if (normalized.length === 0) return "";
  if (normalized.includes("\0") || normalized.startsWith("/") || /^[A-Za-z]:\//u.test(normalized)) {
    return failure("PATHSPEC_OUTSIDE_SCOPE", "git.addToStaging target.pathspecs must be repository-relative paths", "scope", context, repositoryPath);
  }
  const parts = normalized.split("/").filter(Boolean);
  if (parts.includes("..")) {
    return failure("PATHSPEC_OUTSIDE_SCOPE", "git.addToStaging target.pathspecs must stay inside the repository", "scope", context, repositoryPath);
  }
  return normalized.replace(/\/+$/u, "");
}

function normalizePathspecs(value: unknown, context: GitAddToStagingContext, repositoryPath: string): readonly string[] | GitAddToStagingResult {
  const raw = stringArrayValue(value);
  if (value !== undefined && raw === undefined) {
    return failure("INVALID_PATHSPEC", "git.addToStaging target.pathspecs must be a string array", "input", context, repositoryPath);
  }
  const normalized: string[] = [];
  for (const item of cleanList(raw)) {
    const pathspec = normalizePathspec(item, context, repositoryPath);
    if (typeof pathspec !== "string") return pathspec;
    if (pathspec.length > 0) normalized.push(pathspec);
  }
  return [...new Set(normalized)];
}

function normalizeTimeout(value: unknown, context: GitAddToStagingContext, repositoryPath: string): number | undefined | GitAddToStagingResult {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > gitAddToStagingDescriptor.maxTimeoutMs) {
    return failure("INVALID_TIMEOUT", `git.addToStaging timeoutMs must be an integer from 1 to ${gitAddToStagingDescriptor.maxTimeoutMs}`, "input", context, repositoryPath);
  }
  return value;
}

function normalizeRequest(request: unknown): NormalizedRequest | GitAddToStagingResult {
  if (request !== undefined && !isRecord(request)) {
    return failure("INVALID_ARGUMENT", "git.addToStaging request must be an object", "input", undefined);
  }
  const requestRecord = isRecord(request) ? request : {};
  const context = normalizeContext(requestRecord.context, requestRecord);
  if ("ok" in context) return context;
  const targetRecord = isRecord(requestRecord.target) ? requestRecord.target : requestRecord;
  if (requestRecord.target !== undefined && !isRecord(requestRecord.target)) {
    return failure("INVALID_ARGUMENT", "git.addToStaging target must be an object", "input", context);
  }
  const repositoryPath = normalizeRepositoryPath(targetRecord.repositoryPath, context);
  if (typeof repositoryPath !== "string") return repositoryPath;
  const pathspecs = normalizePathspecs(targetRecord.pathspecs, context, repositoryPath);
  if ("ok" in pathspecs) return pathspecs;
  const all = booleanValue(targetRecord.all) === true;
  const update = booleanValue(targetRecord.update) === true;
  const intentToAdd = booleanValue(targetRecord.intentToAdd) === true;
  const patch = booleanValue(targetRecord.patch) === true;
  const force = booleanValue(targetRecord.force) === true;
  if (pathspecs.length === 0 && !all && !update) {
    return failure(
      "MISSING_TARGET_PATH",
      "git.addToStaging requires target.pathspecs unless target.all or target.update is true",
      "input",
      context,
      repositoryPath,
    );
  }
  const timeoutMs = normalizeTimeout(requestRecord.timeoutMs, context, repositoryPath);
  if (timeoutMs !== undefined && typeof timeoutMs !== "number") return timeoutMs;
  return { target: { repositoryPath, pathspecs, all, update, intentToAdd, patch, force }, context, timeoutMs };
}

function normalizeAllowedRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/u, "");
}

function ensureScope(repositoryPath: string, context: GitAddToStagingContext | undefined): GitAddToStagingResult | undefined {
  const allowedRoots = cleanList(context?.allowedRepositoryRoots).map(normalizeAllowedRoot);
  if (allowedRoots.length === 0) return undefined;
  const allowed = allowedRoots.some((root) => repositoryPath === root || repositoryPath.startsWith(`${root}/`));
  return allowed
    ? undefined
    : failure("SCOPE_REJECTED", "git.addToStaging target repository is outside the allowed repository roots", "scope", context, repositoryPath);
}

function ensurePermissions(repositoryPath: string, context: GitAddToStagingContext | undefined): GitAddToStagingResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) return undefined;
  const missing = gitAddToStagingDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  return missing.length === 0
    ? undefined
    : failure("PERMISSION_DENIED", `git.addToStaging is missing permissions: ${missing.join(", ")}`, "permission", context, repositoryPath);
}

function ensureGovernance(repositoryPath: string, context: GitAddToStagingContext): GitAddToStagingResult | undefined {
  if (dryRunEnabled(context)) return undefined;
  if (context.guard?.allowed === true || context.guard?.accepted === true) return undefined;
  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "git.addToStaging requires an affirmative runtime guard for real execution",
    "governance",
    context,
    repositoryPath,
  );
}

function ensureNonInteractive(target: GitAddToStagingTarget, context: GitAddToStagingContext): GitAddToStagingResult | undefined {
  if (dryRunEnabled(context) || !target.patch) return undefined;
  return failure(
    "INTERACTIVE_MODE_UNAVAILABLE",
    "git.addToStaging target.patch is interactive and is not available for runtime execution",
    "governance",
    context,
    target.repositoryPath,
  );
}

function providerArgs(target: GitAddToStagingTarget): readonly string[] {
  return [
    "add",
    ...(target.all ? ["--all"] : []),
    ...(target.update ? ["--update"] : []),
    ...(target.intentToAdd ? ["--intent-to-add"] : []),
    ...(target.patch ? ["--patch"] : []),
    ...(target.force ? ["--force"] : []),
    ...(target.pathspecs.length === 0 ? [] : ["--", ...target.pathspecs]),
  ];
}

function commandPreview(target: GitAddToStagingTarget): readonly string[] {
  return ["git", "-C", target.repositoryPath, ...providerArgs(target)];
}

const runtimeEntry: GitAddToStagingRuntimeEntry = {
  owner: "runtime",
  port: "BaseToolExecutorPort.git.runGit",
  method: "runGit",
  binary: "git",
  argvMode: "fixed-add-workspace-mutation",
  allowedSubcommand: "add",
};

const risk: GitAddToStagingRisk = {
  category: "workspace-mutation",
  riskLevel: "risky",
  mutatesRepository: true,
  mutatesWorkingTree: false,
  mutatesIndex: true,
  spawnsProcess: true,
  requiresTapApproval: true,
  runtimeOwnsExecution: true,
};

function plan(normalized: NormalizedRequest, dispatch: GitAddToStagingPlan["dispatch"], dryRun: boolean): GitAddToStagingPlan {
  return {
    toolId: "git.addToStaging",
    toolKind: "git.addToStaging",
    capability: "add-to-staging",
    runtimeId: runtimeId(normalized.context),
    invocationId: invocationId(normalized.context),
    repositoryPath: normalized.target.repositoryPath,
    pathspecs: normalized.target.pathspecs,
    all: normalized.target.all,
    update: normalized.target.update,
    intentToAdd: normalized.target.intentToAdd,
    patch: normalized.target.patch,
    force: normalized.target.force,
    gitArgs: providerArgs(normalized.target),
    commandPreview: commandPreview(normalized.target),
    requiredPermissions: gitAddToStagingDescriptor.permissionsRequired,
    runtimeEntry,
    risk,
    dispatch,
    dryRun,
    wouldMutateIndex: true,
    unsafeSideEffects: true,
    outputEnvelope: { stdoutPreview: "", stderrPreview: "", parsed: false },
    audit: {
      guard: "git-add-runtime-guard",
      event: "basicTool.git.addToStaging.planned",
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

export function parseGitAddToStagingResult(
  providerResult: GitAddToStagingProviderResult | undefined,
  target: GitAddToStagingTarget,
): GitAddToStagingEnvelope {
  return {
    parser: "git-add-exit-v1",
    pathspecs: target.pathspecs,
    all: target.all,
    update: target.update,
    intentToAdd: target.intentToAdd,
    force: target.force,
    exitCode: providerResult?.exitCode,
    stdoutLineCount: lineCount(providerResult?.stdout ?? ""),
    stderrLineCount: lineCount(providerResult?.stderr ?? ""),
  };
}

function success(normalized: NormalizedRequest, dryRun: boolean, providerResult?: GitAddToStagingProviderResult): GitAddToStagingResult {
  const executionPlan = plan(normalized, dryRun ? "dry-run" : "runtime-git-executor", dryRun);
  return {
    ok: true,
    toolId: "git.addToStaging",
    plan: executionPlan,
    output: {
      kind: "agentCore.basicTool.git.addToStaging",
      target: normalized.target,
      runtimeEntry,
      risk,
      gitArgs: executionPlan.gitArgs,
      commandPreview: executionPlan.commandPreview,
      timeoutMs: normalized.timeoutMs ?? gitAddToStagingDescriptor.defaultTimeoutMs,
      dryRun,
      executionBlocked: dryRun,
      providerCalled: providerResult !== undefined,
      exitCode: providerResult?.exitCode,
      stdout: providerResult?.stdout,
      stderr: providerResult?.stderr,
      permissionsRequired: gitAddToStagingDescriptor.permissionsRequired,
      unsafeSideEffects: true,
      resultEnvelope: parseGitAddToStagingResult(providerResult, normalized.target),
    },
    audit: [
      auditEvent(
        dryRun ? "agentCore.basicTool.git.addToStaging.dryRun" : "agentCore.basicTool.git.addToStaging.executed",
        normalized.context,
        normalized.target.repositoryPath,
        {
          pathspecCount: normalized.target.pathspecs.length,
          all: normalized.target.all,
          update: normalized.target.update,
          exitCode: providerResult?.exitCode,
        },
      ),
    ],
    events: [dryRun ? "basicTool.git.addToStaging.dryRun" : "basicTool.git.addToStaging.executed"],
  };
}

export function planGitAddToStaging(request: GitAddToStagingRequest = {}): GitAddToStagingResult {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const scopeFailure = ensureScope(normalized.target.repositoryPath, normalized.context);
  if (scopeFailure !== undefined) return scopeFailure;
  const permissionFailure = ensurePermissions(normalized.target.repositoryPath, normalized.context);
  if (permissionFailure !== undefined) return permissionFailure;
  return success(normalized, true);
}

export async function executeGitAddToStaging(request: GitAddToStagingRequest = {}): Promise<GitAddToStagingResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const scopeFailure = ensureScope(normalized.target.repositoryPath, normalized.context);
  if (scopeFailure !== undefined) return scopeFailure;
  const permissionFailure = ensurePermissions(normalized.target.repositoryPath, normalized.context);
  if (permissionFailure !== undefined) return permissionFailure;
  const governanceFailure = ensureGovernance(normalized.target.repositoryPath, normalized.context);
  if (governanceFailure !== undefined) return governanceFailure;
  const interactiveFailure = ensureNonInteractive(normalized.target, normalized.context);
  if (interactiveFailure !== undefined) return interactiveFailure;
  if (dryRunEnabled(normalized.context)) return success(normalized, true);
  if (request.provider === undefined) {
    return failure(
      "PROVIDER_UNAVAILABLE",
      "git.addToStaging requires runtime.execEngine.git.runGit for real execution",
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
    return failure("PROVIDER_REJECTED", "git.addToStaging provider failed", "provider", normalized.context, normalized.target.repositoryPath);
  }
}
