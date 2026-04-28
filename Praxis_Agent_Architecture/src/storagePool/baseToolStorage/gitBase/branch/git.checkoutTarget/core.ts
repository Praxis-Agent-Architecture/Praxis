/*
 * git.checkoutTarget storage core.
 * Owns the fixed git-checkout target mutation contract and delegates host execution to BaseToolExecutorPort.git.runGit.
 */

export type GitCheckoutTargetPermission = "git:read" | "git:write" | "filesystem:read" | "filesystem:write";

export type GitCheckoutTargetGuard = {
  allowed?: boolean;
  accepted?: boolean;
  reason?: string;
};

export type GitCheckoutTargetContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: GitCheckoutTargetGuard;
  allowedRepositoryRoots?: readonly string[];
  grantedPermissions?: readonly GitCheckoutTargetPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type GitCheckoutTarget = {
  repositoryPath: string;
  targetRef: string;
  newBranchName?: string;
  detach: boolean;
  force: boolean;
};

export type GitCheckoutTargetRequest = {
  target?: Partial<GitCheckoutTarget>;
  context?: GitCheckoutTargetContext;
  provider?: GitCheckoutTargetProvider;
  timeoutMs?: number;
  metadata?: Readonly<Record<string, unknown>>;
  runtimeId?: string;
  invocationId?: string;
  repositoryPath?: string;
  targetRef?: string;
  ref?: string;
  revision?: string;
  newBranchName?: string;
  branchName?: string;
  detach?: boolean;
  force?: boolean;
  dryRun?: boolean;
};

export type GitCheckoutTargetRuntimeEntry = {
  owner: "runtime";
  port: "BaseToolExecutorPort.git.runGit";
  method: "runGit";
  binary: "git";
  argvMode: "fixed-checkout-target-workspace-mutation";
  allowedSubcommand: "checkout";
};

export type GitCheckoutTargetRisk = {
  category: "workspace-mutation";
  riskLevel: "risky";
  mutatesRepository: true;
  mutatesWorkingTree: true;
  mutatesIndex: true;
  checksOutTarget: true;
  createsBranch: boolean;
  detachesHead: boolean;
  forceCheckout: boolean;
  spawnsProcess: true;
  requiresTapApproval: true;
  runtimeOwnsExecution: true;
};

export type GitCheckoutTargetEnvelope = {
  parser: "git-checkout-output-v1";
  targetRef: string;
  newBranchName?: string;
  detach: boolean;
  force: boolean;
  exitCode?: number;
  stdoutLineCount: number;
  stderrLineCount: number;
  checkoutHint?: string;
  createdBranch: boolean;
};

export type GitCheckoutTargetOutput = {
  kind: "agentCore.basicTool.git.checkoutTarget";
  target: GitCheckoutTarget;
  runtimeEntry: GitCheckoutTargetRuntimeEntry;
  risk: GitCheckoutTargetRisk;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  timeoutMs: number;
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  permissionsRequired: readonly GitCheckoutTargetPermission[];
  unsafeSideEffects: true;
  checksOutTarget: true;
  resultEnvelope: GitCheckoutTargetEnvelope;
};

export type GitCheckoutTargetPlan = {
  toolId: "git.checkoutTarget";
  toolKind: "git.checkoutTarget";
  capability: "checkout-target";
  runtimeId: string;
  invocationId: string;
  repositoryPath: string;
  targetRef: string;
  newBranchName?: string;
  detach: boolean;
  force: boolean;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  requiredPermissions: readonly GitCheckoutTargetPermission[];
  runtimeEntry: GitCheckoutTargetRuntimeEntry;
  risk: GitCheckoutTargetRisk;
  dispatch: "dry-run" | "runtime-git-executor";
  dryRun: boolean;
  wouldMutateWorkingTree: true;
  wouldMutateIndex: true;
  unsafeSideEffects: true;
  outputEnvelope: { stdoutPreview: ""; stderrPreview: ""; parsed: false };
  audit: {
    guard: "git-checkout-runtime-guard";
    event: "basicTool.git.checkoutTarget.planned";
    governanceRequired: true;
    tapCanWrap: true;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type GitCheckoutTargetErrorBoundary = "input" | "scope" | "permission" | "governance" | "provider";
export type GitCheckoutTargetErrorCode =
  | "MISSING_REPOSITORY_PATH"
  | "MISSING_TARGET_REF"
  | "INVALID_ARGUMENT"
  | "INVALID_CONTEXT"
  | "UNSAFE_REF"
  | "INVALID_TIMEOUT"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type GitCheckoutTargetError = {
  code: GitCheckoutTargetErrorCode;
  message: string;
  boundary: GitCheckoutTargetErrorBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type GitCheckoutTargetAuditEvent = {
  type: string;
  toolId: "git.checkoutTarget";
  invocationId: string;
  dryRun: boolean;
  repositoryPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type GitCheckoutTargetResult =
  | {
      ok: true;
      toolId: "git.checkoutTarget";
      output: GitCheckoutTargetOutput;
      plan: GitCheckoutTargetPlan;
      audit: readonly GitCheckoutTargetAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "git.checkoutTarget";
      error: GitCheckoutTargetError;
      audit: readonly GitCheckoutTargetAuditEvent[];
      events: readonly string[];
    };

export type GitCheckoutTargetProviderRequest = {
  repositoryPath: string;
  args: readonly string[];
  timeoutMs?: number;
};

export type GitCheckoutTargetProviderResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type GitCheckoutTargetProvider = (
  request: GitCheckoutTargetProviderRequest,
  context: GitCheckoutTargetContext,
) => GitCheckoutTargetProviderResult | Promise<GitCheckoutTargetProviderResult>;

type NormalizedRequest = {
  target: GitCheckoutTarget;
  context: GitCheckoutTargetContext;
  timeoutMs?: number;
};

export const gitCheckoutTargetDescriptor = {
  toolId: "git.checkoutTarget",
  toolKind: "git.checkoutTarget",
  capability: "checkout-target",
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

function dryRunEnabled(context: GitCheckoutTargetContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: GitCheckoutTargetContext | undefined): string {
  return stringValue(context?.invocationId)?.trim() || "git.checkoutTarget:dry-run";
}

function runtimeId(context: GitCheckoutTargetContext | undefined): string {
  return stringValue(context?.runtimeId)?.trim() || "runtime.unspecified";
}

function auditEvent(
  type: string,
  context: GitCheckoutTargetContext | undefined,
  repositoryPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): GitCheckoutTargetAuditEvent {
  return {
    type,
    toolId: gitCheckoutTargetDescriptor.toolId,
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
  code: GitCheckoutTargetErrorCode,
  message: string,
  boundary: GitCheckoutTargetErrorBoundary,
  context: GitCheckoutTargetContext | undefined,
  repositoryPath?: string,
): GitCheckoutTargetResult {
  return {
    ok: false,
    toolId: gitCheckoutTargetDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.git.checkoutTarget.rejected", context, repositoryPath, { code })],
    events: ["basicTool.git.checkoutTarget.rejected"],
  };
}

function normalizeContext(rawContext: unknown, legacyRequest: Record<string, unknown>): GitCheckoutTargetContext | GitCheckoutTargetResult {
  const contextRecord = rawContext === undefined ? {} : rawContext;
  if (!isRecord(contextRecord)) {
    return failure("INVALID_CONTEXT", "git.checkoutTarget context must be an object", "input", undefined);
  }
  const guard = contextRecord.guard;
  if (guard !== undefined && !isRecord(guard)) {
    return failure("INVALID_CONTEXT", "git.checkoutTarget context.guard must be an object", "input", undefined);
  }
  const allowedRepositoryRoots = stringArrayValue(contextRecord.allowedRepositoryRoots);
  if (contextRecord.allowedRepositoryRoots !== undefined && allowedRepositoryRoots === undefined) {
    return failure("INVALID_CONTEXT", "git.checkoutTarget context.allowedRepositoryRoots must be a string array", "input", undefined);
  }
  const grantedPermissions = stringArrayValue(contextRecord.grantedPermissions);
  if (contextRecord.grantedPermissions !== undefined && grantedPermissions === undefined) {
    return failure("INVALID_CONTEXT", "git.checkoutTarget context.grantedPermissions must be a string array", "input", undefined);
  }
  const auditMetadata = isRecord(contextRecord.auditMetadata) ? contextRecord.auditMetadata : undefined;
  if (contextRecord.auditMetadata !== undefined && auditMetadata === undefined) {
    return failure("INVALID_CONTEXT", "git.checkoutTarget context.auditMetadata must be an object", "input", undefined);
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
    grantedPermissions: grantedPermissions as readonly GitCheckoutTargetPermission[] | undefined,
    auditMetadata,
  };
}

function normalizeRepositoryPath(value: unknown, context: GitCheckoutTargetContext | undefined): string | GitCheckoutTargetResult {
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_REPOSITORY_PATH", "git.checkoutTarget requires target.repositoryPath", "input", context);
  }
  if (normalized.includes("\0")) {
    return failure("INVALID_ARGUMENT", "git.checkoutTarget repositoryPath cannot contain NUL bytes", "input", context, normalized);
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

function normalizeTargetRef(
  value: unknown,
  context: GitCheckoutTargetContext,
  repositoryPath: string,
): string | GitCheckoutTargetResult {
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_TARGET_REF", "git.checkoutTarget requires target.targetRef", "input", context, repositoryPath);
  }
  if (isUnsafeRef(normalized)) {
    return failure("UNSAFE_REF", "git.checkoutTarget target.targetRef must be a safe ref", "input", context, repositoryPath);
  }
  return normalized;
}

function normalizeOptionalRef(
  value: unknown,
  fieldName: "newBranchName",
  context: GitCheckoutTargetContext,
  repositoryPath: string,
): string | undefined | GitCheckoutTargetResult {
  if (value === undefined) return undefined;
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) return undefined;
  if (isUnsafeRef(normalized)) {
    return failure("UNSAFE_REF", `git.checkoutTarget target.${fieldName} must be a safe ref`, "input", context, repositoryPath);
  }
  return normalized;
}

function normalizeTimeout(
  value: unknown,
  context: GitCheckoutTargetContext,
  repositoryPath: string,
): number | undefined | GitCheckoutTargetResult {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > gitCheckoutTargetDescriptor.maxTimeoutMs) {
    return failure(
      "INVALID_TIMEOUT",
      `git.checkoutTarget timeoutMs must be an integer from 1 to ${gitCheckoutTargetDescriptor.maxTimeoutMs}`,
      "input",
      context,
      repositoryPath,
    );
  }
  return value;
}

function normalizeRequest(request: unknown): NormalizedRequest | GitCheckoutTargetResult {
  if (request !== undefined && !isRecord(request)) {
    return failure("INVALID_ARGUMENT", "git.checkoutTarget request must be an object", "input", undefined);
  }
  const requestRecord = isRecord(request) ? request : {};
  const context = normalizeContext(requestRecord.context, requestRecord);
  if ("ok" in context) return context;
  const targetRecord = isRecord(requestRecord.target) ? requestRecord.target : requestRecord;
  if (requestRecord.target !== undefined && !isRecord(requestRecord.target)) {
    return failure("INVALID_ARGUMENT", "git.checkoutTarget target must be an object", "input", context);
  }
  const repositoryPath = normalizeRepositoryPath(targetRecord.repositoryPath, context);
  if (typeof repositoryPath !== "string") return repositoryPath;
  const targetRef = normalizeTargetRef(targetRecord.targetRef ?? targetRecord.ref ?? targetRecord.revision, context, repositoryPath);
  if (typeof targetRef !== "string") return targetRef;
  const newBranchName = normalizeOptionalRef(
    targetRecord.newBranchName ?? targetRecord.branchName,
    "newBranchName",
    context,
    repositoryPath,
  );
  if (newBranchName !== undefined && typeof newBranchName !== "string") return newBranchName;
  const timeoutMs = normalizeTimeout(requestRecord.timeoutMs, context, repositoryPath);
  if (timeoutMs !== undefined && typeof timeoutMs !== "number") return timeoutMs;
  return {
    target: {
      repositoryPath,
      targetRef,
      newBranchName,
      detach: targetRecord.detach === true,
      force: targetRecord.force === true,
    },
    context,
    timeoutMs,
  };
}

function normalizeAllowedRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/u, "");
}

function ensureScope(repositoryPath: string, context: GitCheckoutTargetContext | undefined): GitCheckoutTargetResult | undefined {
  const allowedRoots = cleanList(context?.allowedRepositoryRoots).map(normalizeAllowedRoot);
  if (allowedRoots.length === 0) return undefined;
  const allowed = allowedRoots.some((root) => repositoryPath === root || repositoryPath.startsWith(`${root}/`));
  return allowed
    ? undefined
    : failure("SCOPE_REJECTED", "git.checkoutTarget target repository is outside the allowed repository roots", "scope", context, repositoryPath);
}

function permissionsForTarget(): readonly GitCheckoutTargetPermission[] {
  return ["git:read", "git:write", "filesystem:read", "filesystem:write"];
}

function ensurePermissions(
  target: GitCheckoutTarget,
  context: GitCheckoutTargetContext | undefined,
): GitCheckoutTargetResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) return undefined;
  const missing = permissionsForTarget().filter((permission) => !granted.includes(permission));
  return missing.length === 0
    ? undefined
    : failure("PERMISSION_DENIED", `git.checkoutTarget is missing permissions: ${missing.join(", ")}`, "permission", context, target.repositoryPath);
}

function ensureGovernance(repositoryPath: string, context: GitCheckoutTargetContext): GitCheckoutTargetResult | undefined {
  if (dryRunEnabled(context)) return undefined;
  if (context.guard?.allowed === true || context.guard?.accepted === true) return undefined;
  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "git.checkoutTarget requires an affirmative runtime guard for real execution",
    "governance",
    context,
    repositoryPath,
  );
}

function providerArgs(target: GitCheckoutTarget): readonly string[] {
  return [
    "checkout",
    ...(target.force ? ["--force"] : []),
    ...(target.detach ? ["--detach"] : []),
    ...(target.newBranchName === undefined ? [] : ["-b", target.newBranchName]),
    target.targetRef,
  ];
}

function commandPreview(target: GitCheckoutTarget): readonly string[] {
  return ["git", "-C", target.repositoryPath, ...providerArgs(target)];
}

const runtimeEntry: GitCheckoutTargetRuntimeEntry = {
  owner: "runtime",
  port: "BaseToolExecutorPort.git.runGit",
  method: "runGit",
  binary: "git",
  argvMode: "fixed-checkout-target-workspace-mutation",
  allowedSubcommand: "checkout",
};

function riskForTarget(target: GitCheckoutTarget): GitCheckoutTargetRisk {
  return {
    category: "workspace-mutation",
    riskLevel: "risky",
    mutatesRepository: true,
    mutatesWorkingTree: true,
    mutatesIndex: true,
    checksOutTarget: true,
    createsBranch: target.newBranchName !== undefined,
    detachesHead: target.detach,
    forceCheckout: target.force,
    spawnsProcess: true,
    requiresTapApproval: true,
    runtimeOwnsExecution: true,
  };
}

function plan(normalized: NormalizedRequest, dispatch: GitCheckoutTargetPlan["dispatch"], dryRun: boolean): GitCheckoutTargetPlan {
  const risk = riskForTarget(normalized.target);
  return {
    toolId: "git.checkoutTarget",
    toolKind: "git.checkoutTarget",
    capability: "checkout-target",
    runtimeId: runtimeId(normalized.context),
    invocationId: invocationId(normalized.context),
    repositoryPath: normalized.target.repositoryPath,
    targetRef: normalized.target.targetRef,
    newBranchName: normalized.target.newBranchName,
    detach: normalized.target.detach,
    force: normalized.target.force,
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
      guard: "git-checkout-runtime-guard",
      event: "basicTool.git.checkoutTarget.planned",
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

export function parseGitCheckoutTargetResult(
  providerResult: GitCheckoutTargetProviderResult | undefined,
  target: GitCheckoutTarget,
): GitCheckoutTargetEnvelope {
  return {
    parser: "git-checkout-output-v1",
    targetRef: target.targetRef,
    newBranchName: target.newBranchName,
    detach: target.detach,
    force: target.force,
    exitCode: providerResult?.exitCode,
    stdoutLineCount: lineCount(providerResult?.stdout ?? ""),
    stderrLineCount: lineCount(providerResult?.stderr ?? ""),
    checkoutHint: providerResult === undefined ? undefined : firstOutputLine(providerResult.stdout, providerResult.stderr),
    createdBranch: target.newBranchName !== undefined && providerResult?.exitCode === 0,
  };
}

function success(normalized: NormalizedRequest, dryRun: boolean, providerResult?: GitCheckoutTargetProviderResult): GitCheckoutTargetResult {
  const executionPlan = plan(normalized, dryRun ? "dry-run" : "runtime-git-executor", dryRun);
  const risk = riskForTarget(normalized.target);
  return {
    ok: true,
    toolId: "git.checkoutTarget",
    plan: executionPlan,
    output: {
      kind: "agentCore.basicTool.git.checkoutTarget",
      target: normalized.target,
      runtimeEntry,
      risk,
      gitArgs: executionPlan.gitArgs,
      commandPreview: executionPlan.commandPreview,
      timeoutMs: normalized.timeoutMs ?? gitCheckoutTargetDescriptor.defaultTimeoutMs,
      dryRun,
      executionBlocked: dryRun,
      providerCalled: providerResult !== undefined,
      exitCode: providerResult?.exitCode,
      stdout: providerResult?.stdout,
      stderr: providerResult?.stderr,
      permissionsRequired: permissionsForTarget(),
      unsafeSideEffects: true,
      checksOutTarget: true,
      resultEnvelope: parseGitCheckoutTargetResult(providerResult, normalized.target),
    },
    audit: [
      auditEvent(
        dryRun ? "agentCore.basicTool.git.checkoutTarget.dryRun" : "agentCore.basicTool.git.checkoutTarget.executed",
        normalized.context,
        normalized.target.repositoryPath,
        {
          targetRef: normalized.target.targetRef,
          newBranchName: normalized.target.newBranchName,
          detach: normalized.target.detach,
          force: normalized.target.force,
          exitCode: providerResult?.exitCode,
        },
      ),
    ],
    events: [dryRun ? "basicTool.git.checkoutTarget.dryRun" : "basicTool.git.checkoutTarget.executed"],
  };
}

export function planGitTargetCheckout(request: GitCheckoutTargetRequest = {}): GitCheckoutTargetResult {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const scopeFailure = ensureScope(normalized.target.repositoryPath, normalized.context);
  if (scopeFailure !== undefined) return scopeFailure;
  const permissionFailure = ensurePermissions(normalized.target, normalized.context);
  if (permissionFailure !== undefined) return permissionFailure;
  return success(normalized, true);
}

export const planGitCheckoutTarget = planGitTargetCheckout;

export async function executeGitCheckoutTarget(request: GitCheckoutTargetRequest = {}): Promise<GitCheckoutTargetResult> {
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
      "git.checkoutTarget requires runtime.execEngine.git.runGit for real execution",
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
      "git.checkoutTarget provider rejected the request or failed safely",
      "provider",
      normalized.context,
      normalized.target.repositoryPath,
    );
  }
}
