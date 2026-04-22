/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Shell 基础工具 / Shell 探测。
 * 核心目的：提供 Shell 基础工具 / Shell 探测 中的“探测 Shell 能力”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type ShellCapabilityDetectionPermission = "shell:detect" | "shell:probe";

export type ShellCapabilityDetectionBoundary = "input" | "scope" | "permission" | "contract";

export type ShellCapabilityName =
  | "command-execution"
  | "script-execution"
  | "pipeline"
  | "environment-expansion"
  | "interactive-session"
  | "job-control"
  | "posix-signals";

export type ShellCapabilityStatus = "supported" | "unsupported" | "unknown";

export type ShellCapabilityDetectionContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedShellExecutables?: readonly string[];
  grantedPermissions?: readonly ShellCapabilityDetectionPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type ShellCapabilityDetectionTarget = {
  shellExecutable: string;
  shellKind?: string;
  reportedVersion?: string;
  requestedCapabilities?: readonly ShellCapabilityName[];
};

export type ShellCapabilityDetectionRequest = {
  target?: Partial<ShellCapabilityDetectionTarget>;
  context?: ShellCapabilityDetectionContext;
};

export type ShellCapabilityDetectionErrorCode =
  | "MISSING_SHELL_EXECUTABLE"
  | "INVALID_SHELL_KIND"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "REAL_PROBE_BLOCKED";

export type ShellCapabilityDetectionError = {
  code: ShellCapabilityDetectionErrorCode;
  message: string;
  boundary: ShellCapabilityDetectionBoundary;
  publicSafe: true;
  internalDetailExposed: false;
};

export type ShellCapabilityDetectionAuditEvent = {
  type: string;
  toolId: "shell.capabilityDetection";
  invocationId: string;
  dryRun: boolean;
  shellExecutable?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type ShellCapabilityFinding = {
  capability: ShellCapabilityName;
  status: ShellCapabilityStatus;
  confidence: "inferred" | "unverified";
  evidence: string;
};

export type ShellCapabilityDetectionOutput = {
  kind: "agentCore.basicTool.shell.capabilityDetection";
  target: Required<Pick<ShellCapabilityDetectionTarget, "shellExecutable">> &
    Pick<ShellCapabilityDetectionTarget, "shellKind" | "reportedVersion">;
  requestedCapabilities: readonly ShellCapabilityName[];
  findings: readonly ShellCapabilityFinding[];
  permissionsRequired: readonly ShellCapabilityDetectionPermission[];
  dryRun: true;
  executionBlocked: true;
  unsafeSideEffects: false;
  probePlan: {
    operation: "detect-shell-capabilities";
    realProbeRequired: boolean;
    shellExecutable: string;
  };
};

export type ShellCapabilityDetectionResult =
  | {
      ok: true;
      toolId: "shell.capabilityDetection";
      output: ShellCapabilityDetectionOutput;
      audit: readonly ShellCapabilityDetectionAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "shell.capabilityDetection";
      error: ShellCapabilityDetectionError;
      audit: readonly ShellCapabilityDetectionAuditEvent[];
      events: readonly string[];
    };

export const shellCapabilityDetectionDescriptor = {
  toolId: "shell.capabilityDetection",
  capability: "detect-shell-capabilities",
  route: "agent_executionEngine.basic_toolLayer.baseTools.shellBase.shellDetection",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["shell:detect"],
  unsafeSideEffects: false,
} as const;

const knownCapabilities: readonly ShellCapabilityName[] = [
  "command-execution",
  "script-execution",
  "pipeline",
  "environment-expansion",
  "interactive-session",
  "job-control",
  "posix-signals",
];

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: ShellCapabilityDetectionContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: ShellCapabilityDetectionContext | undefined): string {
  return context?.invocationId?.trim() || "shell.capabilityDetection:dry-run";
}

function auditEvent(
  type: string,
  context: ShellCapabilityDetectionContext | undefined,
  shellExecutable?: string,
  metadata?: Readonly<Record<string, unknown>>,
): ShellCapabilityDetectionAuditEvent {
  return {
    type,
    toolId: shellCapabilityDetectionDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    shellExecutable,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: ShellCapabilityDetectionErrorCode,
  message: string,
  boundary: ShellCapabilityDetectionBoundary,
  context: ShellCapabilityDetectionContext | undefined,
  shellExecutable?: string,
): ShellCapabilityDetectionResult {
  return {
    ok: false,
    toolId: shellCapabilityDetectionDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.shell.capabilityDetection.rejected", context, shellExecutable, { code })],
    events: ["basicTool.shell.capabilityDetection.rejected"],
  };
}

function inferShellKind(shellExecutable: string, explicitKind: string | undefined): string {
  const explicit = explicitKind?.trim().toLowerCase();
  if (explicit !== undefined && explicit.length > 0) {
    return explicit;
  }

  const basename = shellExecutable.split(/[\\/]/).pop()?.toLowerCase() ?? shellExecutable.toLowerCase();
  if (basename.includes("zsh")) {
    return "zsh";
  }
  if (basename.includes("bash")) {
    return "bash";
  }
  if (basename === "sh" || basename.endsWith("-sh")) {
    return "sh";
  }
  if (basename.includes("fish")) {
    return "fish";
  }
  if (basename.includes("pwsh") || basename.includes("powershell")) {
    return "powershell";
  }
  if (basename.includes("cmd")) {
    return "cmd";
  }
  return "unknown";
}

function normalizeTarget(
  target: Partial<ShellCapabilityDetectionTarget> | undefined,
  context: ShellCapabilityDetectionContext | undefined,
): ShellCapabilityDetectionTarget | ShellCapabilityDetectionResult {
  const shellExecutable = target?.shellExecutable?.trim() ?? "";
  if (shellExecutable.length === 0) {
    return failure(
      "MISSING_SHELL_EXECUTABLE",
      "shell.capabilityDetection requires target.shellExecutable",
      "input",
      context,
    );
  }

  if (target?.shellKind !== undefined && target.shellKind.trim().length === 0) {
    return failure(
      "INVALID_SHELL_KIND",
      "shell.capabilityDetection target.shellKind must not be blank when provided",
      "input",
      context,
      shellExecutable,
    );
  }

  const shellKind = inferShellKind(shellExecutable, target?.shellKind);

  return {
    shellExecutable,
    shellKind,
    reportedVersion: target?.reportedVersion?.trim() || undefined,
    requestedCapabilities: cleanList(target?.requestedCapabilities).filter((capability) =>
      knownCapabilities.includes(capability),
    ),
  };
}

function ensureShellScope(
  target: ShellCapabilityDetectionTarget,
  context: ShellCapabilityDetectionContext | undefined,
): ShellCapabilityDetectionResult | undefined {
  const allowedShellExecutables = cleanList(context?.allowedShellExecutables);
  if (allowedShellExecutables.length === 0 || allowedShellExecutables.includes(target.shellExecutable)) {
    return undefined;
  }

  return failure(
    "SCOPE_REJECTED",
    "shell.capabilityDetection target shell is outside the allowed shell scope",
    "scope",
    context,
    target.shellExecutable,
  );
}

function ensurePermissions(
  target: ShellCapabilityDetectionTarget,
  context: ShellCapabilityDetectionContext | undefined,
): ShellCapabilityDetectionResult | undefined {
  const grantedPermissions = cleanList(context?.grantedPermissions);
  if (grantedPermissions.length === 0) {
    return undefined;
  }

  const missing = shellCapabilityDetectionDescriptor.permissionsRequired.filter(
    (permission) => !grantedPermissions.includes(permission),
  );
  if (missing.length === 0) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    `shell.capabilityDetection is missing permissions: ${missing.join(", ")}`,
    "permission",
    context,
    target.shellExecutable,
  );
}

function ensureDryRunOnly(
  target: ShellCapabilityDetectionTarget,
  context: ShellCapabilityDetectionContext | undefined,
): ShellCapabilityDetectionResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_PROBE_BLOCKED",
    "shell.capabilityDetection only returns a guarded dry-run probe plan in the first implementation",
    "contract",
    context,
    target.shellExecutable,
  );
}

function supportsCapability(shellKind: string | undefined, capability: ShellCapabilityName): ShellCapabilityStatus {
  if (shellKind === "cmd") {
    return capability === "posix-signals" || capability === "job-control" ? "unsupported" : "unknown";
  }

  if (shellKind === "powershell") {
    return capability === "posix-signals" ? "unsupported" : "supported";
  }

  if (shellKind === "bash" || shellKind === "zsh" || shellKind === "fish") {
    return "supported";
  }

  if (shellKind === "sh") {
    return capability === "interactive-session" || capability === "job-control" ? "unknown" : "supported";
  }

  return "unknown";
}

function buildFindings(target: ShellCapabilityDetectionTarget): readonly ShellCapabilityFinding[] {
  const requested = target.requestedCapabilities?.length ? target.requestedCapabilities : knownCapabilities;

  return requested.map((capability) => ({
    capability,
    status: supportsCapability(target.shellKind, capability),
    confidence: "inferred",
    evidence: `dry-run inference from shell kind: ${target.shellKind ?? "unknown"}`,
  }));
}

export function planShellCapabilityDetection(
  request: ShellCapabilityDetectionRequest = {},
): ShellCapabilityDetectionResult {
  const target = normalizeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureShellScope(target, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensurePermissions(target, request.context);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realProbeFailure = ensureDryRunOnly(target, request.context);
  if (realProbeFailure !== undefined) {
    return realProbeFailure;
  }

  const requestedCapabilities = target.requestedCapabilities?.length ? target.requestedCapabilities : knownCapabilities;

  return {
    ok: true,
    toolId: shellCapabilityDetectionDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.shell.capabilityDetection",
      target: {
        shellExecutable: target.shellExecutable,
        shellKind: target.shellKind,
        reportedVersion: target.reportedVersion,
      },
      requestedCapabilities,
      findings: buildFindings(target),
      permissionsRequired: shellCapabilityDetectionDescriptor.permissionsRequired,
      dryRun: true,
      executionBlocked: true,
      unsafeSideEffects: false,
      probePlan: {
        operation: "detect-shell-capabilities",
        realProbeRequired: true,
        shellExecutable: target.shellExecutable,
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.shell.capabilityDetection.dryRun", request.context, target.shellExecutable, {
        shellKind: target.shellKind ?? "unknown",
        requestedCapabilities,
      }),
    ],
    events: ["basicTool.shell.capabilityDetection.dryRun"],
  };
}
