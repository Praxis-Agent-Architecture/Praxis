/*
 * git.manageTag storage core.
 * Owns the fixed git-tag contract and delegates host execution to BaseToolExecutorPort.git.runGit.
 */

export type GitManageTagPermission = "git:read" | "git:write" | "filesystem:read" | "filesystem:write";
export type GitManageTagAction = "list" | "create" | "delete" | "annotate";
export type GitManageTagRiskCategory = "read-only-inspection" | "history-mutation" | "destructive";

export type GitManageTagGuard = {
  allowed?: boolean;
  accepted?: boolean;
  reason?: string;
};

export type GitManageTagContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: GitManageTagGuard;
  allowedRepositoryRoots?: readonly string[];
  grantedPermissions?: readonly GitManageTagPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type GitManageTagTarget = {
  repositoryPath: string;
  action: GitManageTagAction;
  tagName?: string;
  targetRef?: string;
  message?: string;
  force: boolean;
};

export type GitManageTagRequest = {
  target?: Partial<GitManageTagTarget>;
  context?: GitManageTagContext;
  provider?: GitManageTagProvider;
  timeoutMs?: number;
  metadata?: Readonly<Record<string, unknown>>;
  runtimeId?: string;
  invocationId?: string;
  repositoryPath?: string;
  action?: GitManageTagAction;
  tagName?: string;
  tag?: string;
  name?: string;
  targetRef?: string;
  ref?: string;
  revision?: string;
  message?: string;
  force?: boolean;
  dryRun?: boolean;
};

export type GitManageTagRuntimeEntry = {
  owner: "runtime";
  port: "BaseToolExecutorPort.git.runGit";
  method: "runGit";
  binary: "git";
  argvMode: "fixed-manage-tag";
  allowedSubcommand: "tag";
};

export type GitManageTagRisk = {
  category: GitManageTagRiskCategory;
  riskLevel: "normal" | "risky";
  mutatesRepository: boolean;
  mutatesWorkingTree: false;
  mutatesIndex: false;
  createsTag: boolean;
  deletesTag: boolean;
  spawnsProcess: true;
  requiresTapApproval: boolean;
  runtimeOwnsExecution: true;
};

export type GitManageTagEnvelope = {
  parser: "git-tag-output-v1";
  action: GitManageTagAction;
  tagName?: string;
  targetRef?: string;
  force: boolean;
  exitCode?: number;
  stdoutLineCount: number;
  stderrLineCount: number;
  tagNames: readonly string[];
  operationHint?: string;
  tagCreated: boolean;
  tagDeleted: boolean;
};

export type GitManageTagOutput = {
  kind: "agentCore.basicTool.git.manageTag";
  target: GitManageTagTarget;
  runtimeEntry: GitManageTagRuntimeEntry;
  risk: GitManageTagRisk;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  timeoutMs: number;
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  permissionsRequired: readonly GitManageTagPermission[];
  unsafeSideEffects: boolean;
  managesTag: true;
  resultEnvelope: GitManageTagEnvelope;
};

export type GitManageTagPlan = {
  toolId: "git.manageTag";
  toolKind: "git.manageTag";
  capability: "manage-tag";
  runtimeId: string;
  invocationId: string;
  repositoryPath: string;
  action: GitManageTagAction;
  tagName?: string;
  targetRef?: string;
  force: boolean;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  requiredPermissions: readonly GitManageTagPermission[];
  runtimeEntry: GitManageTagRuntimeEntry;
  risk: GitManageTagRisk;
  dispatch: "dry-run" | "runtime-git-executor";
  dryRun: boolean;
  wouldMutateRepository: boolean;
  unsafeSideEffects: boolean;
  outputEnvelope: { stdoutPreview: ""; stderrPreview: ""; parsed: false };
  audit: {
    guard: "git-tag-runtime-guard";
    event: "basicTool.git.manageTag.planned";
    governanceRequired: boolean;
    tapCanWrap: true;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type GitManageTagErrorBoundary = "input" | "scope" | "permission" | "governance" | "provider";
export type GitManageTagErrorCode =
  | "MISSING_REPOSITORY_PATH"
  | "MISSING_TAG_NAME"
  | "MISSING_MESSAGE"
  | "INVALID_ARGUMENT"
  | "INVALID_CONTEXT"
  | "INVALID_ACTION"
  | "UNSAFE_REF"
  | "INVALID_TIMEOUT"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type GitManageTagError = {
  code: GitManageTagErrorCode;
  message: string;
  boundary: GitManageTagErrorBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type GitManageTagAuditEvent = {
  type: string;
  toolId: "git.manageTag";
  invocationId: string;
  dryRun: boolean;
  repositoryPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type GitManageTagResult =
  | {
      ok: true;
      toolId: "git.manageTag";
      output: GitManageTagOutput;
      plan: GitManageTagPlan;
      audit: readonly GitManageTagAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "git.manageTag";
      error: GitManageTagError;
      audit: readonly GitManageTagAuditEvent[];
      events: readonly string[];
    };

export type GitManageTagProviderRequest = {
  repositoryPath: string;
  args: readonly string[];
  timeoutMs?: number;
};

export type GitManageTagProviderResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type GitManageTagProvider = (
  request: GitManageTagProviderRequest,
  context: GitManageTagContext,
) => GitManageTagProviderResult | Promise<GitManageTagProviderResult>;

type NormalizedRequest = {
  target: GitManageTagTarget;
  context: GitManageTagContext;
  timeoutMs?: number;
};

export const gitManageTagDescriptor = {
  toolId: "git.manageTag",
  toolKind: "git.manageTag",
  capability: "manage-tag",
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

function dryRunEnabled(context: GitManageTagContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: GitManageTagContext | undefined): string {
  return stringValue(context?.invocationId)?.trim() || "git.manageTag:dry-run";
}

function runtimeId(context: GitManageTagContext | undefined): string {
  return stringValue(context?.runtimeId)?.trim() || "runtime.unspecified";
}

function auditEvent(
  type: string,
  context: GitManageTagContext | undefined,
  repositoryPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): GitManageTagAuditEvent {
  return {
    type,
    toolId: gitManageTagDescriptor.toolId,
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
  code: GitManageTagErrorCode,
  message: string,
  boundary: GitManageTagErrorBoundary,
  context: GitManageTagContext | undefined,
  repositoryPath?: string,
): GitManageTagResult {
  return {
    ok: false,
    toolId: gitManageTagDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.git.manageTag.rejected", context, repositoryPath, { code })],
    events: ["basicTool.git.manageTag.rejected"],
  };
}

function normalizeContext(rawContext: unknown, legacyRequest: Record<string, unknown>): GitManageTagContext | GitManageTagResult {
  const contextRecord = rawContext === undefined ? {} : rawContext;
  if (!isRecord(contextRecord)) {
    return failure("INVALID_CONTEXT", "git.manageTag context must be an object", "input", undefined);
  }
  const guard = contextRecord.guard;
  if (guard !== undefined && !isRecord(guard)) {
    return failure("INVALID_CONTEXT", "git.manageTag context.guard must be an object", "input", undefined);
  }
  const allowedRepositoryRoots = stringArrayValue(contextRecord.allowedRepositoryRoots);
  if (contextRecord.allowedRepositoryRoots !== undefined && allowedRepositoryRoots === undefined) {
    return failure("INVALID_CONTEXT", "git.manageTag context.allowedRepositoryRoots must be a string array", "input", undefined);
  }
  const grantedPermissions = stringArrayValue(contextRecord.grantedPermissions);
  if (contextRecord.grantedPermissions !== undefined && grantedPermissions === undefined) {
    return failure("INVALID_CONTEXT", "git.manageTag context.grantedPermissions must be a string array", "input", undefined);
  }
  const auditMetadata = isRecord(contextRecord.auditMetadata) ? contextRecord.auditMetadata : undefined;
  if (contextRecord.auditMetadata !== undefined && auditMetadata === undefined) {
    return failure("INVALID_CONTEXT", "git.manageTag context.auditMetadata must be an object", "input", undefined);
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
    grantedPermissions: grantedPermissions as readonly GitManageTagPermission[] | undefined,
    auditMetadata,
  };
}

function normalizeRepositoryPath(value: unknown, context: GitManageTagContext | undefined): string | GitManageTagResult {
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_REPOSITORY_PATH", "git.manageTag requires target.repositoryPath", "input", context);
  }
  if (normalized.includes("\0")) {
    return failure("INVALID_ARGUMENT", "git.manageTag repositoryPath cannot contain NUL bytes", "input", context, normalized);
  }
  return normalized;
}

function normalizeAction(value: unknown): GitManageTagAction | GitManageTagResult {
  if (value === undefined) return "list";
  if (value === "list" || value === "create" || value === "delete" || value === "annotate") return value;
  return failure("INVALID_ACTION", "git.manageTag target.action must be list, create, annotate, or delete", "input", undefined);
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

function normalizeRequiredTagName(
  value: unknown,
  action: GitManageTagAction,
  context: GitManageTagContext,
  repositoryPath: string,
): string | undefined | GitManageTagResult {
  if (action === "list") return undefined;
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_TAG_NAME", `git.manageTag action ${action} requires target.tagName`, "input", context, repositoryPath);
  }
  if (isUnsafeRef(normalized)) {
    return failure("UNSAFE_REF", "git.manageTag target.tagName must be a safe ref", "input", context, repositoryPath);
  }
  return normalized;
}

function normalizeOptionalTargetRef(
  value: unknown,
  context: GitManageTagContext,
  repositoryPath: string,
): string | undefined | GitManageTagResult {
  if (value === undefined) return undefined;
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) return undefined;
  if (isUnsafeRef(normalized)) {
    return failure("UNSAFE_REF", "git.manageTag target.targetRef must be a safe ref", "input", context, repositoryPath);
  }
  return normalized;
}

function normalizeMessage(
  value: unknown,
  action: GitManageTagAction,
  context: GitManageTagContext,
  repositoryPath: string,
): string | undefined | GitManageTagResult {
  if (value === undefined) {
    return action === "annotate"
      ? failure("MISSING_MESSAGE", "git.manageTag action annotate requires target.message", "input", context, repositoryPath)
      : undefined;
  }
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) {
    return action === "annotate"
      ? failure("MISSING_MESSAGE", "git.manageTag action annotate requires target.message", "input", context, repositoryPath)
      : undefined;
  }
  if (normalized.includes("\0")) {
    return failure("INVALID_ARGUMENT", "git.manageTag target.message cannot contain NUL bytes", "input", context, repositoryPath);
  }
  return normalized;
}

function normalizeTimeout(
  value: unknown,
  context: GitManageTagContext,
  repositoryPath: string,
): number | undefined | GitManageTagResult {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > gitManageTagDescriptor.maxTimeoutMs) {
    return failure(
      "INVALID_TIMEOUT",
      `git.manageTag timeoutMs must be an integer from 1 to ${gitManageTagDescriptor.maxTimeoutMs}`,
      "input",
      context,
      repositoryPath,
    );
  }
  return value;
}

function normalizeRequest(request: unknown): NormalizedRequest | GitManageTagResult {
  if (request !== undefined && !isRecord(request)) {
    return failure("INVALID_ARGUMENT", "git.manageTag request must be an object", "input", undefined);
  }
  const requestRecord = isRecord(request) ? request : {};
  const context = normalizeContext(requestRecord.context, requestRecord);
  if ("ok" in context) return context;
  const targetRecord = isRecord(requestRecord.target) ? requestRecord.target : requestRecord;
  if (requestRecord.target !== undefined && !isRecord(requestRecord.target)) {
    return failure("INVALID_ARGUMENT", "git.manageTag target must be an object", "input", context);
  }
  const repositoryPath = normalizeRepositoryPath(targetRecord.repositoryPath, context);
  if (typeof repositoryPath !== "string") return repositoryPath;
  const action = normalizeAction(targetRecord.action);
  if (typeof action !== "string") return action;
  const tagName = normalizeRequiredTagName(
    targetRecord.tagName ?? targetRecord.tag ?? targetRecord.name,
    action,
    context,
    repositoryPath,
  );
  if (tagName !== undefined && typeof tagName !== "string") return tagName;
  const targetRef = normalizeOptionalTargetRef(targetRecord.targetRef ?? targetRecord.ref ?? targetRecord.revision, context, repositoryPath);
  if (targetRef !== undefined && typeof targetRef !== "string") return targetRef;
  const message = normalizeMessage(targetRecord.message, action, context, repositoryPath);
  if (message !== undefined && typeof message !== "string") return message;
  const timeoutMs = normalizeTimeout(requestRecord.timeoutMs, context, repositoryPath);
  if (timeoutMs !== undefined && typeof timeoutMs !== "number") return timeoutMs;
  return {
    target: {
      repositoryPath,
      action,
      tagName,
      targetRef,
      message,
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

function ensureScope(repositoryPath: string, context: GitManageTagContext | undefined): GitManageTagResult | undefined {
  const allowedRoots = cleanList(context?.allowedRepositoryRoots).map(normalizeAllowedRoot);
  if (allowedRoots.length === 0) return undefined;
  const allowed = allowedRoots.some((root) => repositoryPath === root || repositoryPath.startsWith(`${root}/`));
  return allowed
    ? undefined
    : failure("SCOPE_REJECTED", "git.manageTag target repository is outside the allowed repository roots", "scope", context, repositoryPath);
}

function permissionsForTarget(target: GitManageTagTarget): readonly GitManageTagPermission[] {
  return target.action === "list"
    ? ["git:read", "filesystem:read"]
    : ["git:read", "git:write", "filesystem:read", "filesystem:write"];
}

function ensurePermissions(target: GitManageTagTarget, context: GitManageTagContext | undefined): GitManageTagResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) return undefined;
  const missing = permissionsForTarget(target).filter((permission) => !granted.includes(permission));
  return missing.length === 0
    ? undefined
    : failure("PERMISSION_DENIED", `git.manageTag is missing permissions: ${missing.join(", ")}`, "permission", context, target.repositoryPath);
}

function ensureGovernance(target: GitManageTagTarget, context: GitManageTagContext): GitManageTagResult | undefined {
  if (dryRunEnabled(context)) return undefined;
  if (target.action === "list") return undefined;
  if (context.guard?.allowed === true || context.guard?.accepted === true) return undefined;
  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "git.manageTag requires an affirmative runtime guard for real tag mutation",
    "governance",
    context,
    target.repositoryPath,
  );
}

function providerArgs(target: GitManageTagTarget): readonly string[] {
  if (target.action === "list") {
    return ["tag", "--list"];
  }
  if (target.action === "create") {
    return ["tag", ...(target.force ? ["--force"] : []), target.tagName ?? "", target.targetRef ?? "HEAD"];
  }
  if (target.action === "delete") {
    return ["tag", "-d", target.tagName ?? ""];
  }
  return [
    "tag",
    "-a",
    ...(target.force ? ["--force"] : []),
    target.tagName ?? "",
    target.targetRef ?? "HEAD",
    "-m",
    target.message ?? "",
  ];
}

function commandPreview(target: GitManageTagTarget): readonly string[] {
  return ["git", "-C", target.repositoryPath, ...providerArgs(target)];
}

const runtimeEntry: GitManageTagRuntimeEntry = {
  owner: "runtime",
  port: "BaseToolExecutorPort.git.runGit",
  method: "runGit",
  binary: "git",
  argvMode: "fixed-manage-tag",
  allowedSubcommand: "tag",
};

function riskForTarget(target: GitManageTagTarget): GitManageTagRisk {
  const category: GitManageTagRiskCategory =
    target.action === "list" ? "read-only-inspection" : target.action === "delete" ? "destructive" : "history-mutation";
  return {
    category,
    riskLevel: target.action === "list" ? "normal" : "risky",
    mutatesRepository: target.action !== "list",
    mutatesWorkingTree: false,
    mutatesIndex: false,
    createsTag: target.action === "create" || target.action === "annotate",
    deletesTag: target.action === "delete",
    spawnsProcess: true,
    requiresTapApproval: target.action !== "list",
    runtimeOwnsExecution: true,
  };
}

function plan(normalized: NormalizedRequest, dispatch: GitManageTagPlan["dispatch"], dryRun: boolean): GitManageTagPlan {
  const risk = riskForTarget(normalized.target);
  return {
    toolId: "git.manageTag",
    toolKind: "git.manageTag",
    capability: "manage-tag",
    runtimeId: runtimeId(normalized.context),
    invocationId: invocationId(normalized.context),
    repositoryPath: normalized.target.repositoryPath,
    action: normalized.target.action,
    tagName: normalized.target.tagName,
    targetRef: normalized.target.targetRef,
    force: normalized.target.force,
    gitArgs: providerArgs(normalized.target),
    commandPreview: commandPreview(normalized.target),
    requiredPermissions: permissionsForTarget(normalized.target),
    runtimeEntry,
    risk,
    dispatch,
    dryRun,
    wouldMutateRepository: normalized.target.action !== "list",
    unsafeSideEffects: normalized.target.action !== "list",
    outputEnvelope: { stdoutPreview: "", stderrPreview: "", parsed: false },
    audit: {
      guard: "git-tag-runtime-guard",
      event: "basicTool.git.manageTag.planned",
      governanceRequired: normalized.target.action !== "list",
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

function parseListedTags(stdout: string): readonly string[] {
  return stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function parseGitManageTagResult(
  providerResult: GitManageTagProviderResult | undefined,
  target: GitManageTagTarget,
): GitManageTagEnvelope {
  return {
    parser: "git-tag-output-v1",
    action: target.action,
    tagName: target.tagName,
    targetRef: target.targetRef,
    force: target.force,
    exitCode: providerResult?.exitCode,
    stdoutLineCount: lineCount(providerResult?.stdout ?? ""),
    stderrLineCount: lineCount(providerResult?.stderr ?? ""),
    tagNames: target.action === "list" && providerResult !== undefined ? parseListedTags(providerResult.stdout) : [],
    operationHint: providerResult === undefined ? undefined : firstOutputLine(providerResult.stdout, providerResult.stderr),
    tagCreated: providerResult?.exitCode === 0 && (target.action === "create" || target.action === "annotate"),
    tagDeleted: providerResult?.exitCode === 0 && target.action === "delete",
  };
}

function success(normalized: NormalizedRequest, dryRun: boolean, providerResult?: GitManageTagProviderResult): GitManageTagResult {
  const executionPlan = plan(normalized, dryRun ? "dry-run" : "runtime-git-executor", dryRun);
  const risk = riskForTarget(normalized.target);
  return {
    ok: true,
    toolId: "git.manageTag",
    plan: executionPlan,
    output: {
      kind: "agentCore.basicTool.git.manageTag",
      target: normalized.target,
      runtimeEntry,
      risk,
      gitArgs: executionPlan.gitArgs,
      commandPreview: executionPlan.commandPreview,
      timeoutMs: normalized.timeoutMs ?? gitManageTagDescriptor.defaultTimeoutMs,
      dryRun,
      executionBlocked: dryRun,
      providerCalled: providerResult !== undefined,
      exitCode: providerResult?.exitCode,
      stdout: providerResult?.stdout,
      stderr: providerResult?.stderr,
      permissionsRequired: permissionsForTarget(normalized.target),
      unsafeSideEffects: normalized.target.action !== "list",
      managesTag: true,
      resultEnvelope: parseGitManageTagResult(providerResult, normalized.target),
    },
    audit: [
      auditEvent(
        dryRun ? "agentCore.basicTool.git.manageTag.dryRun" : "agentCore.basicTool.git.manageTag.executed",
        normalized.context,
        normalized.target.repositoryPath,
        {
          action: normalized.target.action,
          tagName: normalized.target.tagName,
          targetRef: normalized.target.targetRef,
          exitCode: providerResult?.exitCode,
        },
      ),
    ],
    events: [dryRun ? "basicTool.git.manageTag.dryRun" : "basicTool.git.manageTag.executed"],
  };
}

export function planGitTagManagement(request: GitManageTagRequest = {}): GitManageTagResult {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const scopeFailure = ensureScope(normalized.target.repositoryPath, normalized.context);
  if (scopeFailure !== undefined) return scopeFailure;
  const permissionFailure = ensurePermissions(normalized.target, normalized.context);
  if (permissionFailure !== undefined) return permissionFailure;
  return success(normalized, true);
}

export const planGitManageTag = planGitTagManagement;

export async function executeGitManageTag(request: GitManageTagRequest = {}): Promise<GitManageTagResult> {
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
      "git.manageTag requires runtime.execEngine.git.runGit for real execution",
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
      "git.manageTag provider rejected the request or failed safely",
      "provider",
      normalized.context,
      normalized.target.repositoryPath,
    );
  }
}
