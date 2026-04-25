/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Shell 基础工具 / Shell 探测。
 * 核心目的：提供 Shell 基础工具 / Shell 探测 中的“检查执行环境”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type ShellEnvironmentInspectionPermission = "shell:environment:inspect" | "filesystem:read";

export type ShellEnvironmentInspectionBoundary = "input" | "scope" | "permission" | "contract" | "governance" | "provider";

export type ShellEnvironmentInspectionContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: {
    allowed?: boolean;
    accepted?: boolean;
    reason?: string;
  };
  allowedWorkingDirectories?: readonly string[];
  grantedPermissions?: readonly ShellEnvironmentInspectionPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type ShellEnvironmentSnapshot = Readonly<Record<string, string | undefined>>;

export type ShellEnvironmentInspectionTarget = {
  workingDirectory: string;
  shellExecutable?: string;
  environment?: ShellEnvironmentSnapshot;
  variablesToInspect?: readonly string[];
};

export type ShellEnvironmentInspectionRequest = {
  target?: Partial<ShellEnvironmentInspectionTarget>;
  context?: ShellEnvironmentInspectionContext;
  provider?: ShellEnvironmentInspectionProvider;
};

export type ShellEnvironmentInspectionErrorCode =
  | "MISSING_WORKING_DIRECTORY"
  | "INVALID_SHELL_EXECUTABLE"
  | "INVALID_ENVIRONMENT"
  | "INVALID_VARIABLE_NAME"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "REAL_INSPECTION_BLOCKED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type ShellEnvironmentInspectionError = {
  code: ShellEnvironmentInspectionErrorCode;
  message: string;
  boundary: ShellEnvironmentInspectionBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type ShellEnvironmentInspectionAuditEvent = {
  type: string;
  toolId: "shell.environmentInspection";
  invocationId: string;
  dryRun: boolean;
  workingDirectory?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type ShellEnvironmentVariableReport = {
  name: string;
  present: boolean;
  redacted: boolean;
  valuePreview?: string;
};

export type ShellEnvironmentInspectionOutput = {
  kind: "agentCore.basicTool.shell.environmentInspection";
  target: Pick<ShellEnvironmentInspectionTarget, "workingDirectory" | "shellExecutable">;
  variables: readonly ShellEnvironmentVariableReport[];
  pathEntries: readonly string[];
  permissionsRequired: readonly ShellEnvironmentInspectionPermission[];
  dryRun: boolean;
  executionBlocked: boolean;
  unsafeSideEffects: false;
  inspectionEnvelope: {
    operation: "inspect-shell-environment";
    source: "provided-snapshot";
    realProcessReadRequired: boolean;
  };
};

export type ShellEnvironmentInspectionProviderRequest = {
  target: ShellEnvironmentInspectionTarget;
  context?: ShellEnvironmentInspectionContext;
};

export type ShellEnvironmentInspectionProvider = (
  request: ShellEnvironmentInspectionProviderRequest,
) => ShellEnvironmentInspectionOutput | Promise<ShellEnvironmentInspectionOutput>;

export type ShellEnvironmentInspectionResult =
  | {
      ok: true;
      toolId: "shell.environmentInspection";
      output: ShellEnvironmentInspectionOutput;
      audit: readonly ShellEnvironmentInspectionAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "shell.environmentInspection";
      error: ShellEnvironmentInspectionError;
      audit: readonly ShellEnvironmentInspectionAuditEvent[];
      events: readonly string[];
    };

export const shellEnvironmentInspectionDescriptor = {
  toolId: "shell.environmentInspection",
  capability: "inspect-shell-environment",
  route: "agent_executionEngine.basic_toolLayer.baseTools.shellBase.shellDetection",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["shell:environment:inspect"],
  unsafeSideEffects: false,
} as const;

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function publicReason(value: unknown, fallback: string): string {
  const reason = stringValue(value)?.trim();
  return reason !== undefined && reason.length > 0 ? reason : fallback;
}

function recordValue(value: unknown): Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}

function requestValue(value: unknown): ShellEnvironmentInspectionRequest {
  return recordValue(value) as ShellEnvironmentInspectionRequest;
}

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return [...new Set(values.map((value) => stringValue(value)?.trim() ?? "").filter(Boolean) as T[])];
}

function dryRunEnabled(context: ShellEnvironmentInspectionContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: ShellEnvironmentInspectionContext | undefined): string {
  return stringValue(context?.invocationId)?.trim() || "shell.environmentInspection:dry-run";
}

function normalizeDirectory(directory: string): string {
  const trimmed = directory.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/, "");
}

function auditEvent(
  type: string,
  context: ShellEnvironmentInspectionContext | undefined,
  workingDirectory?: string,
  metadata?: Readonly<Record<string, unknown>>,
): ShellEnvironmentInspectionAuditEvent {
  return {
    type,
    toolId: shellEnvironmentInspectionDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    workingDirectory,
    metadata: {
      ...recordValue(context?.auditMetadata),
      ...recordValue(metadata),
    },
  };
}

function failure(
  code: ShellEnvironmentInspectionErrorCode,
  message: string,
  boundary: ShellEnvironmentInspectionBoundary,
  context: ShellEnvironmentInspectionContext | undefined,
  workingDirectory?: string,
): ShellEnvironmentInspectionResult {
  return {
    ok: false,
    toolId: shellEnvironmentInspectionDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.shell.environmentInspection.rejected", context, workingDirectory, { code })],
    events: ["basicTool.shell.environmentInspection.rejected"],
  };
}

function normalizeTarget(
  target: Partial<ShellEnvironmentInspectionTarget> | undefined,
  context: ShellEnvironmentInspectionContext | undefined,
): ShellEnvironmentInspectionTarget | ShellEnvironmentInspectionResult {
  const workingDirectory = stringValue(target?.workingDirectory)?.trim() ?? "";
  if (workingDirectory.length === 0) {
    return failure(
      "MISSING_WORKING_DIRECTORY",
      "shell.environmentInspection requires target.workingDirectory",
      "input",
      context,
    );
  }

  if (target?.environment !== undefined && !isEnvironmentSnapshot(target.environment)) {
    return failure(
      "INVALID_ENVIRONMENT",
      "shell.environmentInspection target.environment must be an object of string values",
      "input",
      context,
      normalizeDirectory(workingDirectory),
    );
  }

  if (
    target?.variablesToInspect !== undefined &&
    (!Array.isArray(target.variablesToInspect) ||
      target.variablesToInspect.some((name) => typeof name !== "string" || name.trim().length === 0))
  ) {
    return failure(
      "INVALID_VARIABLE_NAME",
      "shell.environmentInspection variablesToInspect must contain shell-style environment variable names",
      "input",
      context,
      normalizeDirectory(workingDirectory),
    );
  }

  const variablesToInspect = cleanList(target?.variablesToInspect);
  const invalidVariable = variablesToInspect.find((name) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name));
  if (invalidVariable !== undefined) {
    return failure(
      "INVALID_VARIABLE_NAME",
      "shell.environmentInspection variablesToInspect must contain shell-style environment variable names",
      "input",
      context,
      normalizeDirectory(workingDirectory),
    );
  }

  const shellExecutable = stringValue(target?.shellExecutable)?.trim();
  if (shellExecutable !== undefined && shellExecutable.length > 0 && /[\u0000-\u001F\u007F]/u.test(shellExecutable)) {
    return failure(
      "INVALID_SHELL_EXECUTABLE",
      "shell.environmentInspection target.shellExecutable must be a safe shell executable token",
      "input",
      context,
      normalizeDirectory(workingDirectory),
    );
  }

  return {
    workingDirectory: normalizeDirectory(workingDirectory),
    shellExecutable: shellExecutable || undefined,
    environment: target?.environment ?? {},
    variablesToInspect,
  };
}

function isEnvironmentSnapshot(value: unknown): value is ShellEnvironmentSnapshot {
  if (value === undefined) {
    return true;
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((entry) => entry === undefined || typeof entry === "string");
}

function ensureRealExecutionGuard(
  target: ShellEnvironmentInspectionTarget,
  context: ShellEnvironmentInspectionContext | undefined,
): ShellEnvironmentInspectionResult | undefined {
  if (context?.guard?.allowed === true || context?.guard?.accepted === true) {
    return undefined;
  }

  return failure(
    "GOVERNANCE_REJECTED",
    publicReason(context?.guard?.reason, "shell.environmentInspection requires an affirmative runtime guard for real inspection"),
    "governance",
    context,
    target.workingDirectory,
  );
}

function ensureDirectoryScope(
  target: ShellEnvironmentInspectionTarget,
  context: ShellEnvironmentInspectionContext | undefined,
): ShellEnvironmentInspectionResult | undefined {
  const allowedDirectories = cleanList(context?.allowedWorkingDirectories).map(normalizeDirectory);
  if (allowedDirectories.length === 0) {
    return undefined;
  }

  const allowed = allowedDirectories.some(
    (directory) => target.workingDirectory === directory || target.workingDirectory.startsWith(`${directory}/`),
  );
  if (allowed) {
    return undefined;
  }

  return failure(
    "SCOPE_REJECTED",
    "shell.environmentInspection workingDirectory is outside allowed execution scope",
    "scope",
    context,
    target.workingDirectory,
  );
}

function ensurePermissions(
  target: ShellEnvironmentInspectionTarget,
  context: ShellEnvironmentInspectionContext | undefined,
): ShellEnvironmentInspectionResult | undefined {
  const grantedPermissions = cleanList(context?.grantedPermissions);
  if (grantedPermissions.length === 0) {
    return undefined;
  }

  const missing = shellEnvironmentInspectionDescriptor.permissionsRequired.filter(
    (permission) => !grantedPermissions.includes(permission),
  );
  if (missing.length === 0) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    `shell.environmentInspection is missing permissions: ${missing.join(", ")}`,
    "permission",
    context,
    target.workingDirectory,
  );
}

function ensureDryRunOnly(
  target: ShellEnvironmentInspectionTarget,
  context: ShellEnvironmentInspectionContext | undefined,
): ShellEnvironmentInspectionResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_INSPECTION_BLOCKED",
    "shell.environmentInspection only evaluates a provided dry-run environment snapshot in the first implementation",
    "contract",
    context,
    target.workingDirectory,
  );
}

function shouldRedact(variableName: string, value?: string): boolean {
  if (
    /(^|_)(TOKEN|SECRET|PASSWORD|PASS|KEY|CREDENTIAL|AUTH|COOKIE|SESSION|PRIVATE|PAT|DSN|DATABASE_URL|DB_URL|REDIS_URL|POSTGRES_URL|MYSQL_URL|MONGO_URL|MONGODB_URI)(_|$)/iu.test(
      variableName,
    )
  ) {
    return true;
  }

  if (value === undefined) {
    return false;
  }

  return /^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/u.test(value) || /(?:password|token|secret|api[_-]?key)=/iu.test(value);
}

function previewValue(value: string): string {
  return value.length <= 16 ? value : `${value.slice(0, 16)}...`;
}

function buildVariableReports(target: ShellEnvironmentInspectionTarget): readonly ShellEnvironmentVariableReport[] {
  const environment = target.environment ?? {};
  const variables = target.variablesToInspect?.length ? target.variablesToInspect : Object.keys(environment).sort();

  return variables.map((name) => {
    const value = environment[name];
    const present = value !== undefined;
    const redacted = present && shouldRedact(name, value);

    return {
      name,
      present,
      redacted,
      valuePreview: present && !redacted ? previewValue(value) : undefined,
    };
  });
}

function buildPathEntries(environment: ShellEnvironmentSnapshot | undefined): readonly string[] {
  const pathValue = environment?.PATH;
  if (pathValue === undefined || pathValue.trim().length === 0) {
    return [];
  }

  return pathValue.split(":").map((entry) => entry.trim()).filter(Boolean);
}

function cleanPathEntries(entries: unknown): readonly string[] {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries.map((entry) => stringValue(entry)?.trim() ?? "").filter(Boolean);
}

function sanitizeProviderVariableReport(value: unknown): ShellEnvironmentVariableReport | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const report = value as Readonly<Record<string, unknown>>;
  const name = stringValue(report.name)?.trim();
  if (name === undefined || name.length === 0 || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    return undefined;
  }

  const present = typeof report.present === "boolean" ? report.present : report.valuePreview !== undefined;
  const providerPreview = stringValue(report.valuePreview);
  const redacted = present && (report.redacted === true || shouldRedact(name, providerPreview));

  return {
    name,
    present,
    redacted,
    valuePreview: present && !redacted && providerPreview !== undefined ? previewValue(providerPreview) : undefined,
  };
}

function sanitizeProviderOutput(
  output: ShellEnvironmentInspectionOutput,
  target: ShellEnvironmentInspectionTarget,
): ShellEnvironmentInspectionOutput {
  const variables = Array.isArray(output.variables)
    ? output.variables.map(sanitizeProviderVariableReport).filter((item): item is ShellEnvironmentVariableReport => item !== undefined)
    : [];

  return {
    kind: "agentCore.basicTool.shell.environmentInspection",
    target: {
      workingDirectory: target.workingDirectory,
      shellExecutable: target.shellExecutable,
    },
    variables,
    pathEntries: cleanPathEntries(output.pathEntries),
    permissionsRequired: shellEnvironmentInspectionDescriptor.permissionsRequired,
    dryRun: false,
    executionBlocked: false,
    unsafeSideEffects: false,
    inspectionEnvelope: {
      operation: "inspect-shell-environment",
      source: "provided-snapshot",
      realProcessReadRequired: true,
    },
  };
}

export function inspectShellEnvironment(
  request: ShellEnvironmentInspectionRequest = {},
): ShellEnvironmentInspectionResult {
  const normalizedRequest = requestValue(request);
  const target = normalizeTarget(normalizedRequest.target, normalizedRequest.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureDirectoryScope(target, normalizedRequest.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensurePermissions(target, normalizedRequest.context);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realInspectionFailure = ensureDryRunOnly(target, normalizedRequest.context);
  if (realInspectionFailure !== undefined) {
    return realInspectionFailure;
  }

  return {
    ok: true,
    toolId: shellEnvironmentInspectionDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.shell.environmentInspection",
      target: {
        workingDirectory: target.workingDirectory,
        shellExecutable: target.shellExecutable,
      },
      variables: buildVariableReports(target),
      pathEntries: buildPathEntries(target.environment),
      permissionsRequired: shellEnvironmentInspectionDescriptor.permissionsRequired,
      dryRun: true,
      executionBlocked: true,
      unsafeSideEffects: false,
      inspectionEnvelope: {
        operation: "inspect-shell-environment",
        source: "provided-snapshot",
        realProcessReadRequired: false,
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.shell.environmentInspection.dryRun", normalizedRequest.context, target.workingDirectory, {
        variablesInspected: target.variablesToInspect?.length ?? Object.keys(target.environment ?? {}).length,
      }),
    ],
    events: ["basicTool.shell.environmentInspection.dryRun"],
  };
}

export async function executeShellEnvironmentInspection(
  request: ShellEnvironmentInspectionRequest = {},
): Promise<ShellEnvironmentInspectionResult> {
  const normalizedRequest = requestValue(request);
  if (dryRunEnabled(normalizedRequest.context)) {
    return inspectShellEnvironment(normalizedRequest);
  }

  const target = normalizeTarget(normalizedRequest.target, normalizedRequest.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureDirectoryScope(target, normalizedRequest.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensurePermissions(target, normalizedRequest.context);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const guardFailure = ensureRealExecutionGuard(target, normalizedRequest.context);
  if (guardFailure !== undefined) {
    return guardFailure;
  }

  if (typeof normalizedRequest.provider !== "function") {
    return failure(
      "PROVIDER_UNAVAILABLE",
      "shell.environmentInspection requires a runtime provider for real inspection",
      "provider",
      normalizedRequest.context,
      target.workingDirectory,
    );
  }

  try {
    const output = sanitizeProviderOutput(
      await normalizedRequest.provider({ target, context: normalizedRequest.context }),
      target,
    );
    return {
      ok: true,
      toolId: shellEnvironmentInspectionDescriptor.toolId,
      output,
      audit: [
        auditEvent("agentCore.basicTool.shell.environmentInspection.inspected", normalizedRequest.context, target.workingDirectory, {
          variablesInspected: output.variables.length,
        }),
      ],
      events: ["basicTool.shell.environmentInspection.inspected"],
    };
  } catch (error) {
    return failure(
      "PROVIDER_REJECTED",
      "shell.environmentInspection provider rejected the inspection",
      "provider",
      normalizedRequest.context,
      target.workingDirectory,
    );
  }
}
