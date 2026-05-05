/*
 * git.switchBranch storage core.
 * Owns the fixed git-switch branch mutation contract and delegates host execution to BaseToolExecutorPort.git.runGit.
 */

export type GitSwitchBranchPermission = "git:read" | "git:write" | "filesystem:read" | "filesystem:write";

export type GitSwitchBranchGuard = {
  allowed?: boolean;
  accepted?: boolean;
  reason?: string;
};

export type GitSwitchBranchContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: GitSwitchBranchGuard;
  allowedRepositoryRoots?: readonly string[];
  grantedPermissions?: readonly GitSwitchBranchPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type GitSwitchBranchTarget = {
  repositoryPath: string;
  branchName: string;
  create: boolean;
  startPoint?: string;
  track: boolean;
  discardChanges: boolean;
};

export type GitSwitchBranchRequest = {
  target?: Partial<GitSwitchBranchTarget>;
  context?: GitSwitchBranchContext;
  provider?: GitSwitchBranchProvider;
  timeoutMs?: number;
  metadata?: Readonly<Record<string, unknown>>;
  runtimeId?: string;
  invocationId?: string;
  repositoryPath?: string;
  branchName?: string;
  branch?: string;
  ref?: string;
  create?: boolean;
  startPoint?: string;
  track?: boolean;
  discardChanges?: boolean;
  dryRun?: boolean;
};

export type GitSwitchBranchRuntimeEntry = {
  owner: "runtime";
  port: "BaseToolExecutorPort.git.runGit";
  method: "runGit";
  binary: "git";
  argvMode: "fixed-switch-branch-workspace-mutation";
  allowedSubcommand: "switch";
};

export type GitSwitchBranchRisk = {
  category: "workspace-mutation";
  riskLevel: "risky";
  mutatesRepository: true;
  mutatesWorkingTree: true;
  mutatesIndex: true;
  switchesBranch: true;
  createsBranch: boolean;
  discardsChanges: boolean;
  spawnsProcess: true;
  requiresTapApproval: true;
  runtimeOwnsExecution: true;
};

export type GitSwitchBranchEnvelope = {
  parser: "git-switch-output-v1";
  branchName: string;
  create: boolean;
  startPoint?: string;
  track: boolean;
  discardChanges: boolean;
  exitCode?: number;
  stdoutLineCount: number;
  stderrLineCount: number;
  switchedBranchHint?: string;
  createdBranch: boolean;
  discardedChanges: boolean;
};

export type GitSwitchBranchOutput = {
  kind: "agentCore.basicTool.git.switchBranch";
  target: GitSwitchBranchTarget;
  runtimeEntry: GitSwitchBranchRuntimeEntry;
  risk: GitSwitchBranchRisk;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  timeoutMs: number;
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  permissionsRequired: readonly GitSwitchBranchPermission[];
  unsafeSideEffects: true;
  switchesBranch: true;
  resultEnvelope: GitSwitchBranchEnvelope;
};

export type GitSwitchBranchPlan = {
  toolId: "git.switchBranch";
  toolKind: "git.switchBranch";
  capability: "switch-branch";
  runtimeId: string;
  invocationId: string;
  repositoryPath: string;
  branchName: string;
  create: boolean;
  startPoint?: string;
  track: boolean;
  discardChanges: boolean;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  requiredPermissions: readonly GitSwitchBranchPermission[];
  runtimeEntry: GitSwitchBranchRuntimeEntry;
  risk: GitSwitchBranchRisk;
  dispatch: "dry-run" | "runtime-git-executor";
  dryRun: boolean;
  wouldMutateWorkingTree: true;
  wouldMutateIndex: true;
  unsafeSideEffects: true;
  outputEnvelope: { stdoutPreview: ""; stderrPreview: ""; parsed: false };
  audit: {
    guard: "git-switch-runtime-guard";
    event: "basicTool.git.switchBranch.planned";
    governanceRequired: true;
    tapCanWrap: true;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type GitSwitchBranchErrorBoundary = "input" | "scope" | "permission" | "governance" | "provider";
export type GitSwitchBranchErrorCode =
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

export type GitSwitchBranchError = {
  code: GitSwitchBranchErrorCode;
  message: string;
  boundary: GitSwitchBranchErrorBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type GitSwitchBranchAuditEvent = {
  type: string;
  toolId: "git.switchBranch";
  invocationId: string;
  dryRun: boolean;
  repositoryPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type GitSwitchBranchResult =
  | {
      ok: true;
      toolId: "git.switchBranch";
      output: GitSwitchBranchOutput;
      plan: GitSwitchBranchPlan;
      audit: readonly GitSwitchBranchAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "git.switchBranch";
      error: GitSwitchBranchError;
      audit: readonly GitSwitchBranchAuditEvent[];
      events: readonly string[];
    };

export type GitSwitchBranchProviderRequest = {
  repositoryPath: string;
  args: readonly string[];
  timeoutMs?: number;
};

export type GitSwitchBranchProviderResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type GitSwitchBranchProvider = (
  request: GitSwitchBranchProviderRequest,
  context: GitSwitchBranchContext,
) => GitSwitchBranchProviderResult | Promise<GitSwitchBranchProviderResult>;

type NormalizedRequest = {
  target: GitSwitchBranchTarget;
  context: GitSwitchBranchContext;
  timeoutMs?: number;
};

export const gitSwitchBranchDescriptor = {
  toolId: "git.switchBranch",
  toolKind: "git.switchBranch",
  capability: "switch-branch",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.branch",
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

function dryRunEnabled(context: GitSwitchBranchContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: GitSwitchBranchContext | undefined): string {
  return stringValue(context?.invocationId)?.trim() || "git.switchBranch:dry-run";
}

function runtimeId(context: GitSwitchBranchContext | undefined): string {
  return stringValue(context?.runtimeId)?.trim() || "runtime.unspecified";
}

function auditEvent(
  type: string,
  context: GitSwitchBranchContext | undefined,
  repositoryPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): GitSwitchBranchAuditEvent {
  return {
    type,
    toolId: gitSwitchBranchDescriptor.toolId,
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
  code: GitSwitchBranchErrorCode,
  message: string,
  boundary: GitSwitchBranchErrorBoundary,
  context: GitSwitchBranchContext | undefined,
  repositoryPath?: string,
): GitSwitchBranchResult {
  return {
    ok: false,
    toolId: gitSwitchBranchDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.git.switchBranch.rejected", context, repositoryPath, { code })],
    events: ["basicTool.git.switchBranch.rejected"],
  };
}

function normalizeContext(rawContext: unknown, legacyRequest: Record<string, unknown>): GitSwitchBranchContext | GitSwitchBranchResult {
  const contextRecord = rawContext === undefined ? {} : rawContext;
  if (!isRecord(contextRecord)) {
    return failure("INVALID_CONTEXT", "git.switchBranch context must be an object", "input", undefined);
  }
  const guard = contextRecord.guard;
  if (guard !== undefined && !isRecord(guard)) {
    return failure("INVALID_CONTEXT", "git.switchBranch context.guard must be an object", "input", undefined);
  }
  const allowedRepositoryRoots = stringArrayValue(contextRecord.allowedRepositoryRoots);
  if (contextRecord.allowedRepositoryRoots !== undefined && allowedRepositoryRoots === undefined) {
    return failure("INVALID_CONTEXT", "git.switchBranch context.allowedRepositoryRoots must be a string array", "input", undefined);
  }
  const grantedPermissions = stringArrayValue(contextRecord.grantedPermissions);
  if (contextRecord.grantedPermissions !== undefined && grantedPermissions === undefined) {
    return failure("INVALID_CONTEXT", "git.switchBranch context.grantedPermissions must be a string array", "input", undefined);
  }
  const auditMetadata = isRecord(contextRecord.auditMetadata) ? contextRecord.auditMetadata : undefined;
  if (contextRecord.auditMetadata !== undefined && auditMetadata === undefined) {
    return failure("INVALID_CONTEXT", "git.switchBranch context.auditMetadata must be an object", "input", undefined);
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
    grantedPermissions: grantedPermissions as readonly GitSwitchBranchPermission[] | undefined,
    auditMetadata,
  };
}

function normalizeRepositoryPath(value: unknown, context: GitSwitchBranchContext | undefined): string | GitSwitchBranchResult {
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_REPOSITORY_PATH", "git.switchBranch requires target.repositoryPath", "input", context);
  }
  if (normalized.includes("\0")) {
    return failure("INVALID_ARGUMENT", "git.switchBranch repositoryPath cannot contain NUL bytes", "input", context, normalized);
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

function normalizeBranchName(
  value: unknown,
  context: GitSwitchBranchContext,
  repositoryPath: string,
): string | GitSwitchBranchResult {
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_BRANCH_NAME", "git.switchBranch requires target.branchName", "input", context, repositoryPath);
  }
  if (isUnsafeRef(normalized)) {
    return failure("UNSAFE_BRANCH_REF", "git.switchBranch target.branchName must be a safe branch ref", "input", context, repositoryPath);
  }
  return normalized;
}

function normalizeStartPoint(
  value: unknown,
  context: GitSwitchBranchContext,
  repositoryPath: string,
): string | undefined | GitSwitchBranchResult {
  if (value === undefined) return undefined;
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) return undefined;
  if (isUnsafeRef(normalized)) {
    return failure("UNSAFE_BRANCH_REF", "git.switchBranch target.startPoint must be a safe ref", "input", context, repositoryPath);
  }
  return normalized;
}

function normalizeTimeout(
  value: unknown,
  context: GitSwitchBranchContext,
  repositoryPath: string,
): number | undefined | GitSwitchBranchResult {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > gitSwitchBranchDescriptor.maxTimeoutMs) {
    return failure(
      "INVALID_TIMEOUT",
      `git.switchBranch timeoutMs must be an integer from 1 to ${gitSwitchBranchDescriptor.maxTimeoutMs}`,
      "input",
      context,
      repositoryPath,
    );
  }
  return value;
}

function normalizeRequest(request: unknown): NormalizedRequest | GitSwitchBranchResult {
  if (request !== undefined && !isRecord(request)) {
    return failure("INVALID_ARGUMENT", "git.switchBranch request must be an object", "input", undefined);
  }
  const requestRecord = isRecord(request) ? request : {};
  const context = normalizeContext(requestRecord.context, requestRecord);
  if ("ok" in context) return context;
  const targetRecord = isRecord(requestRecord.target) ? requestRecord.target : requestRecord;
  if (requestRecord.target !== undefined && !isRecord(requestRecord.target)) {
    return failure("INVALID_ARGUMENT", "git.switchBranch target must be an object", "input", context);
  }
  const repositoryPath = normalizeRepositoryPath(targetRecord.repositoryPath, context);
  if (typeof repositoryPath !== "string") return repositoryPath;
  const branchName = normalizeBranchName(
    targetRecord.branchName ?? targetRecord.branch ?? targetRecord.ref,
    context,
    repositoryPath,
  );
  if (typeof branchName !== "string") return branchName;
  const startPoint = normalizeStartPoint(targetRecord.startPoint, context, repositoryPath);
  if (startPoint !== undefined && typeof startPoint !== "string") return startPoint;
  const timeoutMs = normalizeTimeout(requestRecord.timeoutMs, context, repositoryPath);
  if (timeoutMs !== undefined && typeof timeoutMs !== "number") return timeoutMs;
  return {
    target: {
      repositoryPath,
      branchName,
      create: targetRecord.create === true,
      startPoint,
      track: targetRecord.track === true,
      discardChanges: targetRecord.discardChanges === true,
    },
    context,
    timeoutMs,
  };
}

function normalizeAllowedRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/u, "");
}

function ensureScope(repositoryPath: string, context: GitSwitchBranchContext | undefined): GitSwitchBranchResult | undefined {
  const allowedRoots = cleanList(context?.allowedRepositoryRoots).map(normalizeAllowedRoot);
  if (allowedRoots.length === 0) return undefined;
  const allowed = allowedRoots.some((root) => repositoryPath === root || repositoryPath.startsWith(`${root}/`));
  return allowed
    ? undefined
    : failure("SCOPE_REJECTED", "git.switchBranch target repository is outside the allowed repository roots", "scope", context, repositoryPath);
}

function permissionsForTarget(): readonly GitSwitchBranchPermission[] {
  return ["git:read", "git:write", "filesystem:read", "filesystem:write"];
}

function ensurePermissions(
  target: GitSwitchBranchTarget,
  context: GitSwitchBranchContext | undefined,
): GitSwitchBranchResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) return undefined;
  const missing = permissionsForTarget().filter((permission) => !granted.includes(permission));
  return missing.length === 0
    ? undefined
    : failure("PERMISSION_DENIED", `git.switchBranch is missing permissions: ${missing.join(", ")}`, "permission", context, target.repositoryPath);
}

function ensureGovernance(repositoryPath: string, context: GitSwitchBranchContext): GitSwitchBranchResult | undefined {
  if (dryRunEnabled(context)) return undefined;
  if (context.guard?.allowed === true || context.guard?.accepted === true) return undefined;
  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "git.switchBranch requires an affirmative runtime guard for real execution",
    "governance",
    context,
    repositoryPath,
  );
}

function providerArgs(target: GitSwitchBranchTarget): readonly string[] {
  return [
    "switch",
    ...(target.discardChanges ? ["--discard-changes"] : []),
    ...(target.track ? ["--track"] : []),
    ...(target.create ? ["-c", target.branchName] : [target.branchName]),
    ...(target.create && target.startPoint !== undefined ? [target.startPoint] : []),
  ];
}

function commandPreview(target: GitSwitchBranchTarget): readonly string[] {
  return ["git", "-C", target.repositoryPath, ...providerArgs(target)];
}

const runtimeEntry: GitSwitchBranchRuntimeEntry = {
  owner: "runtime",
  port: "BaseToolExecutorPort.git.runGit",
  method: "runGit",
  binary: "git",
  argvMode: "fixed-switch-branch-workspace-mutation",
  allowedSubcommand: "switch",
};

function riskForTarget(target: GitSwitchBranchTarget): GitSwitchBranchRisk {
  return {
    category: "workspace-mutation",
    riskLevel: "risky",
    mutatesRepository: true,
    mutatesWorkingTree: true,
    mutatesIndex: true,
    switchesBranch: true,
    createsBranch: target.create,
    discardsChanges: target.discardChanges,
    spawnsProcess: true,
    requiresTapApproval: true,
    runtimeOwnsExecution: true,
  };
}

function plan(normalized: NormalizedRequest, dispatch: GitSwitchBranchPlan["dispatch"], dryRun: boolean): GitSwitchBranchPlan {
  const risk = riskForTarget(normalized.target);
  return {
    toolId: "git.switchBranch",
    toolKind: "git.switchBranch",
    capability: "switch-branch",
    runtimeId: runtimeId(normalized.context),
    invocationId: invocationId(normalized.context),
    repositoryPath: normalized.target.repositoryPath,
    branchName: normalized.target.branchName,
    create: normalized.target.create,
    startPoint: normalized.target.startPoint,
    track: normalized.target.track,
    discardChanges: normalized.target.discardChanges,
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
      guard: "git-switch-runtime-guard",
      event: "basicTool.git.switchBranch.planned",
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

export function parseGitSwitchBranchResult(
  providerResult: GitSwitchBranchProviderResult | undefined,
  target: GitSwitchBranchTarget,
): GitSwitchBranchEnvelope {
  return {
    parser: "git-switch-output-v1",
    branchName: target.branchName,
    create: target.create,
    startPoint: target.startPoint,
    track: target.track,
    discardChanges: target.discardChanges,
    exitCode: providerResult?.exitCode,
    stdoutLineCount: lineCount(providerResult?.stdout ?? ""),
    stderrLineCount: lineCount(providerResult?.stderr ?? ""),
    switchedBranchHint: providerResult === undefined ? undefined : firstOutputLine(providerResult.stdout, providerResult.stderr),
    createdBranch: target.create && providerResult?.exitCode === 0,
    discardedChanges: target.discardChanges && providerResult?.exitCode === 0,
  };
}

function success(normalized: NormalizedRequest, dryRun: boolean, providerResult?: GitSwitchBranchProviderResult): GitSwitchBranchResult {
  const executionPlan = plan(normalized, dryRun ? "dry-run" : "runtime-git-executor", dryRun);
  const risk = riskForTarget(normalized.target);
  return {
    ok: true,
    toolId: "git.switchBranch",
    plan: executionPlan,
    output: {
      kind: "agentCore.basicTool.git.switchBranch",
      target: normalized.target,
      runtimeEntry,
      risk,
      gitArgs: executionPlan.gitArgs,
      commandPreview: executionPlan.commandPreview,
      timeoutMs: normalized.timeoutMs ?? gitSwitchBranchDescriptor.defaultTimeoutMs,
      dryRun,
      executionBlocked: dryRun,
      providerCalled: providerResult !== undefined,
      exitCode: providerResult?.exitCode,
      stdout: providerResult?.stdout,
      stderr: providerResult?.stderr,
      permissionsRequired: permissionsForTarget(),
      unsafeSideEffects: true,
      switchesBranch: true,
      resultEnvelope: parseGitSwitchBranchResult(providerResult, normalized.target),
    },
    audit: [
      auditEvent(
        dryRun ? "agentCore.basicTool.git.switchBranch.dryRun" : "agentCore.basicTool.git.switchBranch.executed",
        normalized.context,
        normalized.target.repositoryPath,
        {
          branchName: normalized.target.branchName,
          create: normalized.target.create,
          startPoint: normalized.target.startPoint,
          track: normalized.target.track,
          discardChanges: normalized.target.discardChanges,
          exitCode: providerResult?.exitCode,
        },
      ),
    ],
    events: [dryRun ? "basicTool.git.switchBranch.dryRun" : "basicTool.git.switchBranch.executed"],
  };
}

export function planGitBranchSwitch(request: GitSwitchBranchRequest = {}): GitSwitchBranchResult {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const scopeFailure = ensureScope(normalized.target.repositoryPath, normalized.context);
  if (scopeFailure !== undefined) return scopeFailure;
  const permissionFailure = ensurePermissions(normalized.target, normalized.context);
  if (permissionFailure !== undefined) return permissionFailure;
  return success(normalized, true);
}

export const planGitSwitchBranch = planGitBranchSwitch;

export async function executeGitSwitchBranch(request: GitSwitchBranchRequest = {}): Promise<GitSwitchBranchResult> {
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
      "git.switchBranch requires runtime.execEngine.git.runGit for real execution",
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
      "git.switchBranch provider rejected the request or failed safely",
      "provider",
      normalized.context,
      normalized.target.repositoryPath,
    );
  }
}
