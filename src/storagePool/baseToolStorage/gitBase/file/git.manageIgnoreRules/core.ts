/*
 * git.manageIgnoreRules storage core.
 * Owns .gitignore rule semantics and delegates host file IO to BaseToolExecutorPort.filesystem.
 */

import path from "node:path";

export type GitManageIgnoreRulesPermission = "git:read" | "filesystem:read" | "filesystem:write";

export type GitManageIgnoreRulesAction = "inspect" | "add" | "remove" | "replace";

export type GitManageIgnoreRulesGuard = {
  allowed?: boolean;
  accepted?: boolean;
  reason?: string;
};

export type GitManageIgnoreRulesContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: GitManageIgnoreRulesGuard;
  allowedRepositoryRoots?: readonly string[];
  grantedPermissions?: readonly GitManageIgnoreRulesPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type GitManageIgnoreRulesTarget = {
  repositoryPath: string;
  action: GitManageIgnoreRulesAction;
  ignoreFilePath: string;
  rules: readonly string[];
};

export type GitManageIgnoreRulesRequest = {
  target?: Partial<GitManageIgnoreRulesTarget>;
  context?: GitManageIgnoreRulesContext;
  provider?: GitManageIgnoreRulesProvider;
  timeoutMs?: number;
  metadata?: Readonly<Record<string, unknown>>;
  runtimeId?: string;
  invocationId?: string;
  repositoryPath?: string;
  action?: string;
  ignoreFilePath?: string;
  rules?: readonly string[];
  dryRun?: boolean;
};

export type GitManageIgnoreRulesRuntimeEntry = {
  owner: "runtime";
  port: "BaseToolExecutorPort.filesystem.readText/writeText";
  methods: readonly ("readText" | "writeText")[];
  argvMode: "fixed-ignore-rules-file-mutation";
  fileKind: "gitignore";
};

export type GitManageIgnoreRulesRisk = {
  category: "read-only-inspection" | "workspace-mutation";
  riskLevel: "normal" | "risky";
  mutatesRepository: boolean;
  mutatesWorkingTree: boolean;
  mutatesIndex: false;
  mutatesIgnoreRules: boolean;
  spawnsProcess: false;
  requiresTapApproval: boolean;
  runtimeOwnsExecution: true;
};

export type GitManageIgnoreRulesEnvelope = {
  parser: "gitignore-rules-v1";
  action: GitManageIgnoreRulesAction;
  ignoreFilePath: string;
  absoluteIgnoreFilePath: string;
  beforeRuleCount: number;
  afterRuleCount: number;
  addedRules: readonly string[];
  removedRules: readonly string[];
  unchangedRules: readonly string[];
  contentChanged: boolean;
  bytesWritten?: number;
  fileMissing?: boolean;
};

export type GitManageIgnoreRulesOutput = {
  kind: "agentCore.basicTool.git.manageIgnoreRules";
  target: GitManageIgnoreRulesTarget;
  runtimeEntry: GitManageIgnoreRulesRuntimeEntry;
  risk: GitManageIgnoreRulesRisk;
  operationPlan: readonly string[];
  filePath: string;
  timeoutMs: number;
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  permissionsRequired: readonly GitManageIgnoreRulesPermission[];
  unsafeSideEffects: boolean;
  stdout?: string;
  resultEnvelope: GitManageIgnoreRulesEnvelope;
};

export type GitManageIgnoreRulesPlan = {
  toolId: "git.manageIgnoreRules";
  toolKind: "git.manageIgnoreRules";
  capability: "manage-ignore-rules";
  runtimeId: string;
  invocationId: string;
  repositoryPath: string;
  ignoreFilePath: string;
  absoluteIgnoreFilePath: string;
  action: GitManageIgnoreRulesAction;
  rules: readonly string[];
  operationPlan: readonly string[];
  requiredPermissions: readonly GitManageIgnoreRulesPermission[];
  runtimeEntry: GitManageIgnoreRulesRuntimeEntry;
  risk: GitManageIgnoreRulesRisk;
  dispatch: "dry-run" | "runtime-filesystem";
  dryRun: boolean;
  unsafeSideEffects: boolean;
  audit: {
    guard: "git-ignore-runtime-guard";
    event: "basicTool.git.manageIgnoreRules.planned";
    governanceRequired: boolean;
    tapCanWrap: true;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type GitManageIgnoreRulesErrorBoundary = "input" | "scope" | "permission" | "governance" | "provider";
export type GitManageIgnoreRulesErrorCode =
  | "MISSING_REPOSITORY_PATH"
  | "MISSING_RULES"
  | "INVALID_ARGUMENT"
  | "INVALID_CONTEXT"
  | "INVALID_ACTION"
  | "UNSAFE_IGNORE_FILE_PATH"
  | "INVALID_TIMEOUT"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type GitManageIgnoreRulesError = {
  code: GitManageIgnoreRulesErrorCode;
  message: string;
  boundary: GitManageIgnoreRulesErrorBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type GitManageIgnoreRulesAuditEvent = {
  type: string;
  toolId: "git.manageIgnoreRules";
  invocationId: string;
  dryRun: boolean;
  repositoryPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type GitManageIgnoreRulesResult =
  | {
      ok: true;
      toolId: "git.manageIgnoreRules";
      output: GitManageIgnoreRulesOutput;
      plan: GitManageIgnoreRulesPlan;
      audit: readonly GitManageIgnoreRulesAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "git.manageIgnoreRules";
      error: GitManageIgnoreRulesError;
      audit: readonly GitManageIgnoreRulesAuditEvent[];
      events: readonly string[];
    };

export type GitManageIgnoreRulesProviderReadResult = {
  content: string;
  truncated?: boolean;
  missing?: boolean;
};

export type GitManageIgnoreRulesProviderWriteResult = {
  bytesWritten: number;
};

export type GitManageIgnoreRulesProvider = {
  readText(request: { path: string; maxBytes?: number }): Promise<GitManageIgnoreRulesProviderReadResult> | GitManageIgnoreRulesProviderReadResult;
  writeText?(request: { path: string; content: string }): Promise<GitManageIgnoreRulesProviderWriteResult> | GitManageIgnoreRulesProviderWriteResult;
};

type NormalizedRequest = {
  target: GitManageIgnoreRulesTarget;
  context: GitManageIgnoreRulesContext;
  absoluteIgnoreFilePath: string;
  timeoutMs?: number;
};

export const gitManageIgnoreRulesDescriptor = {
  toolId: "git.manageIgnoreRules",
  toolKind: "git.manageIgnoreRules",
  capability: "manage-ignore-rules",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.file",
  defaultDryRun: true,
  defaultDispatch: "dry-run",
  tapOwnsApproval: true,
  requiresTapApproval: true,
  runtimeEntryPort: "BaseToolExecutorPort.filesystem.readText/writeText",
  operationRisk: "workspace-mutation",
  permissionsRequired: ["git:read", "filesystem:read", "filesystem:write"],
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

function dryRunEnabled(context: GitManageIgnoreRulesContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: GitManageIgnoreRulesContext | undefined): string {
  return stringValue(context?.invocationId)?.trim() || "git.manageIgnoreRules:dry-run";
}

function runtimeId(context: GitManageIgnoreRulesContext | undefined): string {
  return stringValue(context?.runtimeId)?.trim() || "runtime.unspecified";
}

function auditEvent(
  type: string,
  context: GitManageIgnoreRulesContext | undefined,
  repositoryPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): GitManageIgnoreRulesAuditEvent {
  return {
    type,
    toolId: "git.manageIgnoreRules",
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
  code: GitManageIgnoreRulesErrorCode,
  message: string,
  boundary: GitManageIgnoreRulesErrorBoundary,
  context: GitManageIgnoreRulesContext | undefined,
  repositoryPath?: string,
): GitManageIgnoreRulesResult {
  return {
    ok: false,
    toolId: "git.manageIgnoreRules",
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.git.manageIgnoreRules.rejected", context, repositoryPath, { code })],
    events: ["basicTool.git.manageIgnoreRules.rejected"],
  };
}

function normalizeContext(rawContext: unknown, legacyRequest: Record<string, unknown>): GitManageIgnoreRulesContext | GitManageIgnoreRulesResult {
  const contextRecord = rawContext === undefined ? {} : rawContext;
  if (!isRecord(contextRecord)) {
    return failure("INVALID_CONTEXT", "git.manageIgnoreRules context must be an object", "input", undefined);
  }
  const guard = contextRecord.guard;
  if (guard !== undefined && !isRecord(guard)) {
    return failure("INVALID_CONTEXT", "git.manageIgnoreRules context.guard must be an object", "input", undefined);
  }
  const allowedRepositoryRoots = stringArrayValue(contextRecord.allowedRepositoryRoots);
  if (contextRecord.allowedRepositoryRoots !== undefined && allowedRepositoryRoots === undefined) {
    return failure("INVALID_CONTEXT", "git.manageIgnoreRules context.allowedRepositoryRoots must be a string array", "input", undefined);
  }
  const grantedPermissions = stringArrayValue(contextRecord.grantedPermissions);
  if (contextRecord.grantedPermissions !== undefined && grantedPermissions === undefined) {
    return failure("INVALID_CONTEXT", "git.manageIgnoreRules context.grantedPermissions must be a string array", "input", undefined);
  }
  const auditMetadata = isRecord(contextRecord.auditMetadata) ? contextRecord.auditMetadata : undefined;
  if (contextRecord.auditMetadata !== undefined && auditMetadata === undefined) {
    return failure("INVALID_CONTEXT", "git.manageIgnoreRules context.auditMetadata must be an object", "input", undefined);
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
    grantedPermissions: grantedPermissions as readonly GitManageIgnoreRulesPermission[] | undefined,
    auditMetadata,
  };
}

function normalizeRepositoryPath(value: unknown, context: GitManageIgnoreRulesContext | undefined): string | GitManageIgnoreRulesResult {
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_REPOSITORY_PATH", "git.manageIgnoreRules requires target.repositoryPath", "input", context);
  }
  if (normalized.includes("\0")) {
    return failure("INVALID_ARGUMENT", "git.manageIgnoreRules repositoryPath cannot contain NUL bytes", "input", context, normalized);
  }
  return normalized;
}

function normalizeAction(value: unknown, context: GitManageIgnoreRulesContext, repositoryPath: string): GitManageIgnoreRulesAction | GitManageIgnoreRulesResult {
  if (value === undefined) return "inspect";
  if (value === "inspect" || value === "add" || value === "remove" || value === "replace") return value;
  return failure("INVALID_ACTION", "git.manageIgnoreRules target.action must be inspect, add, remove, or replace", "input", context, repositoryPath);
}

function normalizeIgnoreFilePath(value: unknown, context: GitManageIgnoreRulesContext, repositoryPath: string): string | GitManageIgnoreRulesResult {
  const normalized = stringValue(value)?.trim().replaceAll("\\", "/") || ".gitignore";
  if (normalized.includes("\0") || normalized.startsWith("/") || /^[A-Za-z]:\//u.test(normalized)) {
    return failure("UNSAFE_IGNORE_FILE_PATH", "git.manageIgnoreRules target.ignoreFilePath must be repository-relative", "scope", context, repositoryPath);
  }
  const parts = normalized.split("/").filter(Boolean);
  if (parts.includes("..")) {
    return failure("UNSAFE_IGNORE_FILE_PATH", "git.manageIgnoreRules target.ignoreFilePath must stay inside the repository", "scope", context, repositoryPath);
  }
  return normalized.replace(/\/+$/u, "");
}

function normalizeRules(value: unknown, action: GitManageIgnoreRulesAction, context: GitManageIgnoreRulesContext, repositoryPath: string): readonly string[] | GitManageIgnoreRulesResult {
  if (value === undefined) {
    return action === "inspect"
      ? []
      : failure("MISSING_RULES", `git.manageIgnoreRules action ${action} requires target.rules`, "input", context, repositoryPath);
  }
  const rawRules = stringArrayValue(value);
  if (rawRules === undefined) {
    return failure("INVALID_ARGUMENT", "git.manageIgnoreRules target.rules must be a string array", "input", context, repositoryPath);
  }
  const rules = cleanList(rawRules).filter((rule) => !rule.includes("\0"));
  if (action !== "inspect" && rules.length === 0) {
    return failure("MISSING_RULES", `git.manageIgnoreRules action ${action} requires non-empty target.rules`, "input", context, repositoryPath);
  }
  return rules;
}

function normalizeTimeout(
  value: unknown,
  context: GitManageIgnoreRulesContext,
  repositoryPath: string,
): number | undefined | GitManageIgnoreRulesResult {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > gitManageIgnoreRulesDescriptor.maxTimeoutMs) {
    return failure(
      "INVALID_TIMEOUT",
      `git.manageIgnoreRules timeoutMs must be an integer from 1 to ${gitManageIgnoreRulesDescriptor.maxTimeoutMs}`,
      "input",
      context,
      repositoryPath,
    );
  }
  return value;
}

function absoluteIgnoreFilePath(repositoryPath: string, ignoreFilePath: string): string {
  return path.join(repositoryPath, ignoreFilePath);
}

function normalizeRequest(request: unknown): NormalizedRequest | GitManageIgnoreRulesResult {
  if (request !== undefined && !isRecord(request)) {
    return failure("INVALID_ARGUMENT", "git.manageIgnoreRules request must be an object", "input", undefined);
  }
  const requestRecord = isRecord(request) ? request : {};
  const context = normalizeContext(requestRecord.context, requestRecord);
  if ("ok" in context) return context;
  const targetRecord = isRecord(requestRecord.target) ? requestRecord.target : requestRecord;
  if (requestRecord.target !== undefined && !isRecord(requestRecord.target)) {
    return failure("INVALID_ARGUMENT", "git.manageIgnoreRules target must be an object", "input", context);
  }
  const repositoryPath = normalizeRepositoryPath(targetRecord.repositoryPath, context);
  if (typeof repositoryPath !== "string") return repositoryPath;
  const action = normalizeAction(targetRecord.action, context, repositoryPath);
  if (typeof action !== "string") return action;
  const ignoreFilePath = normalizeIgnoreFilePath(targetRecord.ignoreFilePath, context, repositoryPath);
  if (typeof ignoreFilePath !== "string") return ignoreFilePath;
  const rules = normalizeRules(targetRecord.rules, action, context, repositoryPath);
  if ("ok" in rules) return rules;
  const timeoutMs = normalizeTimeout(requestRecord.timeoutMs, context, repositoryPath);
  if (timeoutMs !== undefined && typeof timeoutMs !== "number") return timeoutMs;
  return {
    target: { repositoryPath, action, ignoreFilePath, rules },
    context,
    absoluteIgnoreFilePath: absoluteIgnoreFilePath(repositoryPath, ignoreFilePath),
    timeoutMs,
  };
}

function normalizeAllowedRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/u, "");
}

function ensureScope(repositoryPath: string, context: GitManageIgnoreRulesContext | undefined): GitManageIgnoreRulesResult | undefined {
  const allowedRoots = cleanList(context?.allowedRepositoryRoots).map(normalizeAllowedRoot);
  if (allowedRoots.length === 0) return undefined;
  const allowed = allowedRoots.some((root) => repositoryPath === root || repositoryPath.startsWith(`${root}/`));
  return allowed
    ? undefined
    : failure("SCOPE_REJECTED", "git.manageIgnoreRules target repository is outside the allowed repository roots", "scope", context, repositoryPath);
}

function permissionsForTarget(target: GitManageIgnoreRulesTarget): readonly GitManageIgnoreRulesPermission[] {
  return target.action === "inspect" ? ["git:read", "filesystem:read"] : ["git:read", "filesystem:read", "filesystem:write"];
}

function ensurePermissions(
  target: GitManageIgnoreRulesTarget,
  context: GitManageIgnoreRulesContext | undefined,
): GitManageIgnoreRulesResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) return undefined;
  const missing = permissionsForTarget(target).filter((permission) => !granted.includes(permission));
  return missing.length === 0
    ? undefined
    : failure("PERMISSION_DENIED", `git.manageIgnoreRules is missing permissions: ${missing.join(", ")}`, "permission", context, target.repositoryPath);
}

function ensureGovernance(repositoryPath: string, context: GitManageIgnoreRulesContext): GitManageIgnoreRulesResult | undefined {
  if (dryRunEnabled(context)) return undefined;
  if (context.guard?.allowed === true || context.guard?.accepted === true) return undefined;
  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "git.manageIgnoreRules requires an affirmative runtime guard for real execution",
    "governance",
    context,
    repositoryPath,
  );
}

const runtimeEntry: GitManageIgnoreRulesRuntimeEntry = {
  owner: "runtime",
  port: "BaseToolExecutorPort.filesystem.readText/writeText",
  methods: ["readText", "writeText"],
  argvMode: "fixed-ignore-rules-file-mutation",
  fileKind: "gitignore",
};

function riskFor(target: GitManageIgnoreRulesTarget): GitManageIgnoreRulesRisk {
  const mutation = target.action !== "inspect";
  return {
    category: mutation ? "workspace-mutation" : "read-only-inspection",
    riskLevel: mutation ? "risky" : "normal",
    mutatesRepository: mutation,
    mutatesWorkingTree: mutation,
    mutatesIndex: false,
    mutatesIgnoreRules: mutation,
    spawnsProcess: false,
    requiresTapApproval: mutation,
    runtimeOwnsExecution: true,
  };
}

function operationPlan(target: GitManageIgnoreRulesTarget): readonly string[] {
  return [`${target.action}:${target.ignoreFilePath}`, ...target.rules];
}

function plan(normalized: NormalizedRequest, dispatch: GitManageIgnoreRulesPlan["dispatch"], dryRun: boolean): GitManageIgnoreRulesPlan {
  const risk = riskFor(normalized.target);
  return {
    toolId: "git.manageIgnoreRules",
    toolKind: "git.manageIgnoreRules",
    capability: "manage-ignore-rules",
    runtimeId: runtimeId(normalized.context),
    invocationId: invocationId(normalized.context),
    repositoryPath: normalized.target.repositoryPath,
    ignoreFilePath: normalized.target.ignoreFilePath,
    absoluteIgnoreFilePath: normalized.absoluteIgnoreFilePath,
    action: normalized.target.action,
    rules: normalized.target.rules,
    operationPlan: operationPlan(normalized.target),
    requiredPermissions: permissionsForTarget(normalized.target),
    runtimeEntry,
    risk,
    dispatch,
    dryRun,
    unsafeSideEffects: normalized.target.action !== "inspect",
    audit: {
      guard: "git-ignore-runtime-guard",
      event: "basicTool.git.manageIgnoreRules.planned",
      governanceRequired: normalized.target.action !== "inspect",
      tapCanWrap: true,
      metadata: normalized.context.auditMetadata ?? {},
    },
  };
}

function splitRules(content: string): readonly string[] {
  return content.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
}

function joinRules(rules: readonly string[]): string {
  return rules.length === 0 ? "" : `${rules.join("\n")}\n`;
}

function applyRules(action: GitManageIgnoreRulesAction, beforeRules: readonly string[], requestedRules: readonly string[]): {
  afterRules: readonly string[];
  addedRules: readonly string[];
  removedRules: readonly string[];
  unchangedRules: readonly string[];
  contentChanged: boolean;
} {
  if (action === "inspect") {
    return { afterRules: beforeRules, addedRules: [], removedRules: [], unchangedRules: beforeRules, contentChanged: false };
  }
  if (action === "replace") {
    const beforeSet = new Set(beforeRules);
    const afterSet = new Set(requestedRules);
    return {
      afterRules: requestedRules,
      addedRules: requestedRules.filter((rule) => !beforeSet.has(rule)),
      removedRules: beforeRules.filter((rule) => !afterSet.has(rule)),
      unchangedRules: requestedRules.filter((rule) => beforeSet.has(rule)),
      contentChanged: joinRules(beforeRules) !== joinRules(requestedRules),
    };
  }
  if (action === "remove") {
    const removeSet = new Set(requestedRules);
    const afterRules = beforeRules.filter((rule) => !removeSet.has(rule));
    return {
      afterRules,
      addedRules: [],
      removedRules: beforeRules.filter((rule) => removeSet.has(rule)),
      unchangedRules: afterRules,
      contentChanged: afterRules.length !== beforeRules.length,
    };
  }
  const beforeSet = new Set(beforeRules);
  const addedRules = requestedRules.filter((rule) => !beforeSet.has(rule));
  const afterRules = [...beforeRules, ...addedRules];
  return {
    afterRules,
    addedRules,
    removedRules: [],
    unchangedRules: requestedRules.filter((rule) => beforeSet.has(rule)),
    contentChanged: addedRules.length > 0,
  };
}

function envelope(
  normalized: NormalizedRequest,
  beforeContent = "",
  writeResult?: GitManageIgnoreRulesProviderWriteResult,
  fileMissing?: boolean,
): GitManageIgnoreRulesEnvelope {
  const beforeRules = splitRules(beforeContent);
  const patch = applyRules(normalized.target.action, beforeRules, normalized.target.rules);
  return {
    parser: "gitignore-rules-v1",
    action: normalized.target.action,
    ignoreFilePath: normalized.target.ignoreFilePath,
    absoluteIgnoreFilePath: normalized.absoluteIgnoreFilePath,
    beforeRuleCount: beforeRules.length,
    afterRuleCount: patch.afterRules.length,
    addedRules: patch.addedRules,
    removedRules: patch.removedRules,
    unchangedRules: patch.unchangedRules,
    contentChanged: patch.contentChanged,
    bytesWritten: writeResult?.bytesWritten,
    fileMissing,
  };
}

function success(
  normalized: NormalizedRequest,
  dryRun: boolean,
  beforeContent = "",
  writeResult?: GitManageIgnoreRulesProviderWriteResult,
  fileMissing?: boolean,
): GitManageIgnoreRulesResult {
  const executionPlan = plan(normalized, dryRun ? "dry-run" : "runtime-filesystem", dryRun);
  return {
    ok: true,
    toolId: "git.manageIgnoreRules",
    plan: executionPlan,
    output: {
      kind: "agentCore.basicTool.git.manageIgnoreRules",
      target: normalized.target,
      runtimeEntry,
      risk: executionPlan.risk,
      operationPlan: executionPlan.operationPlan,
      filePath: normalized.absoluteIgnoreFilePath,
      timeoutMs: normalized.timeoutMs ?? gitManageIgnoreRulesDescriptor.defaultTimeoutMs,
      dryRun,
      executionBlocked: dryRun,
      providerCalled: !dryRun,
      permissionsRequired: permissionsForTarget(normalized.target),
      unsafeSideEffects: normalized.target.action !== "inspect",
      resultEnvelope: envelope(normalized, beforeContent, writeResult, fileMissing),
    },
    audit: [
      auditEvent(
        dryRun ? "agentCore.basicTool.git.manageIgnoreRules.dryRun" : "agentCore.basicTool.git.manageIgnoreRules.executed",
        normalized.context,
        normalized.target.repositoryPath,
        { action: normalized.target.action, ignoreFilePath: normalized.target.ignoreFilePath, ruleCount: normalized.target.rules.length },
      ),
    ],
    events: [dryRun ? "basicTool.git.manageIgnoreRules.dryRun" : "basicTool.git.manageIgnoreRules.executed"],
  };
}

export function planGitIgnoreRuleManagement(request: GitManageIgnoreRulesRequest = {}): GitManageIgnoreRulesResult {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const scopeFailure = ensureScope(normalized.target.repositoryPath, normalized.context);
  if (scopeFailure !== undefined) return scopeFailure;
  const permissionFailure = ensurePermissions(normalized.target, normalized.context);
  if (permissionFailure !== undefined) return permissionFailure;
  return success(normalized, true);
}

export async function executeGitManageIgnoreRules(request: GitManageIgnoreRulesRequest = {}): Promise<GitManageIgnoreRulesResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const scopeFailure = ensureScope(normalized.target.repositoryPath, normalized.context);
  if (scopeFailure !== undefined) return scopeFailure;
  const permissionFailure = ensurePermissions(normalized.target, normalized.context);
  if (permissionFailure !== undefined) return permissionFailure;
  const governanceFailure = ensureGovernance(normalized.target.repositoryPath, normalized.context);
  if (governanceFailure !== undefined) return governanceFailure;
  if (dryRunEnabled(normalized.context)) return success(normalized, true);
  if (request.provider === undefined || request.provider.readText === undefined || (normalized.target.action !== "inspect" && request.provider.writeText === undefined)) {
    return failure(
      "PROVIDER_UNAVAILABLE",
      "git.manageIgnoreRules requires runtime filesystem readText/writeText for real execution",
      "provider",
      normalized.context,
      normalized.target.repositoryPath,
    );
  }
  try {
    const readResult = await request.provider.readText({ path: normalized.absoluteIgnoreFilePath, maxBytes: 1_000_000 });
    const beforeContent = readResult.content;
    if (normalized.target.action === "inspect") {
      return success(normalized, false, beforeContent, undefined, readResult.missing);
    }
    const beforeRules = splitRules(beforeContent);
    const patch = applyRules(normalized.target.action, beforeRules, normalized.target.rules);
    const writeResult = await request.provider.writeText?.({
      path: normalized.absoluteIgnoreFilePath,
      content: joinRules(patch.afterRules),
    });
    return success(normalized, false, beforeContent, writeResult, readResult.missing);
  } catch {
    return failure(
      "PROVIDER_REJECTED",
      "git.manageIgnoreRules provider rejected the request or failed safely",
      "provider",
      normalized.context,
      normalized.target.repositoryPath,
    );
  }
}
