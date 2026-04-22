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

export type ShellEnvironmentInspectionBoundary = "input" | "scope" | "permission" | "contract";

export type ShellEnvironmentInspectionContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
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
};

export type ShellEnvironmentInspectionErrorCode =
  | "MISSING_WORKING_DIRECTORY"
  | "INVALID_VARIABLE_NAME"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "REAL_INSPECTION_BLOCKED";

export type ShellEnvironmentInspectionError = {
  code: ShellEnvironmentInspectionErrorCode;
  message: string;
  boundary: ShellEnvironmentInspectionBoundary;
  publicSafe: true;
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
  dryRun: true;
  executionBlocked: true;
  unsafeSideEffects: false;
  inspectionEnvelope: {
    operation: "inspect-shell-environment";
    source: "provided-snapshot";
    realProcessReadRequired: boolean;
  };
};

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

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: ShellEnvironmentInspectionContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: ShellEnvironmentInspectionContext | undefined): string {
  return context?.invocationId?.trim() || "shell.environmentInspection:dry-run";
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
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
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
    error: { code, message, boundary, publicSafe: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.shell.environmentInspection.rejected", context, workingDirectory, { code })],
    events: ["basicTool.shell.environmentInspection.rejected"],
  };
}

function normalizeTarget(
  target: Partial<ShellEnvironmentInspectionTarget> | undefined,
  context: ShellEnvironmentInspectionContext | undefined,
): ShellEnvironmentInspectionTarget | ShellEnvironmentInspectionResult {
  const workingDirectory = target?.workingDirectory?.trim() ?? "";
  if (workingDirectory.length === 0) {
    return failure(
      "MISSING_WORKING_DIRECTORY",
      "shell.environmentInspection requires target.workingDirectory",
      "input",
      context,
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

  return {
    workingDirectory: normalizeDirectory(workingDirectory),
    shellExecutable: target?.shellExecutable?.trim() || undefined,
    environment: target?.environment ?? {},
    variablesToInspect,
  };
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

function shouldRedact(variableName: string): boolean {
  return /(TOKEN|SECRET|PASSWORD|PASS|KEY|CREDENTIAL|AUTH)/i.test(variableName);
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
    const redacted = present && shouldRedact(name);

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

export function inspectShellEnvironment(
  request: ShellEnvironmentInspectionRequest = {},
): ShellEnvironmentInspectionResult {
  const target = normalizeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureDirectoryScope(target, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensurePermissions(target, request.context);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realInspectionFailure = ensureDryRunOnly(target, request.context);
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
        realProcessReadRequired: true,
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.shell.environmentInspection.dryRun", request.context, target.workingDirectory, {
        variablesInspected: target.variablesToInspect?.length ?? Object.keys(target.environment ?? {}).length,
      }),
    ],
    events: ["basicTool.shell.environmentInspection.dryRun"],
  };
}
