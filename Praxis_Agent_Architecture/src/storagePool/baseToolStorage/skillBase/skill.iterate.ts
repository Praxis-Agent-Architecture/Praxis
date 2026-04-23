/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Skill 基础工具。
 * 核心目的：提供 基础工具集合 / Skill 基础工具 中的“迭代 Skill”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type SkillIteratePermission = "skill:iterate" | "filesystem:read" | "filesystem:write";

export type SkillIterateBoundary = "input" | "scope" | "permission" | "governance" | "contract" | "resource";

export type SkillIterateContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedSkillRoots?: readonly string[];
  grantedPermissions?: readonly SkillIteratePermission[];
  guard?: {
    accepted: boolean;
    reason?: string;
  };
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type SkillIterationKind = "revise-instructions" | "add-example" | "update-script" | "retire-file";

export type SkillIterationOperation = {
  kind: SkillIterationKind;
  relativePath: string;
  summary: string;
};

export type SkillIterateTarget = {
  skillPath: string;
  changeIntent: string;
  operations: readonly SkillIterationOperation[];
  reason?: string;
};

export type SkillIterateRequest = {
  target?: Partial<Omit<SkillIterateTarget, "operations">> & {
    operations?: readonly Partial<SkillIterationOperation>[];
  };
  context?: SkillIterateContext;
};

export type SkillIterateErrorCode =
  | "MISSING_SKILL_PATH"
  | "UNSAFE_SKILL_PATH"
  | "MISSING_CHANGE_INTENT"
  | "MISSING_OPERATIONS"
  | "INVALID_ITERATION_OPERATION"
  | "TOO_MANY_OPERATIONS"
  | "SKILL_PATH_OUTSIDE_SCOPE"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "REAL_EXECUTION_BLOCKED";

export type SkillIterateError = {
  code: SkillIterateErrorCode;
  message: string;
  boundary: SkillIterateBoundary;
  publicSafe: true;
  internalDetailExposed: false;
};

export type SkillIterateAuditEvent = {
  type: string;
  toolId: "skill.iterate";
  invocationId: string;
  dryRun: boolean;
  skillPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type SkillIterateOutput = {
  kind: "agentCore.basicTool.skill.iterate";
  target: SkillIterateTarget;
  permissionsRequired: readonly SkillIteratePermission[];
  dryRun: true;
  executionBlocked: true;
  unsafeSideEffects: true;
  iterationEnvelope: {
    patchModel: "skill-iteration-patch-v1";
    operationCount: number;
    affectedFiles: readonly string[];
    requiresReview: true;
  };
};

export type SkillIterateResult =
  | {
      ok: true;
      toolId: "skill.iterate";
      output: SkillIterateOutput;
      audit: readonly SkillIterateAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "skill.iterate";
      error: SkillIterateError;
      audit: readonly SkillIterateAuditEvent[];
      events: readonly string[];
    };

export const skillIterateDescriptor = {
  toolId: "skill.iterate",
  capability: "iterate-skill",
  route: "agent_executionEngine.basic_toolLayer.baseTools.skillBase",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["skill:iterate", "filesystem:read", "filesystem:write"] as const,
  maxOperations: 32,
} as const;

const supportedIterationKinds = ["revise-instructions", "add-example", "update-script", "retire-file"] as const;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: SkillIterateContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: SkillIterateContext | undefined): string {
  return context?.invocationId?.trim() || "skill.iterate:dry-run";
}

function auditEvent(
  type: string,
  context: SkillIterateContext | undefined,
  skillPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): SkillIterateAuditEvent {
  return {
    type,
    toolId: skillIterateDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    skillPath,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: SkillIterateErrorCode,
  message: string,
  boundary: SkillIterateBoundary,
  context: SkillIterateContext | undefined,
  skillPath?: string,
): SkillIterateResult {
  return {
    ok: false,
    toolId: skillIterateDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.skill.iterate.rejected", context, skillPath, { code })],
    events: ["basicTool.skill.iterate.rejected"],
  };
}

function normalizeRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/, "");
}

function unsafePath(value: string): boolean {
  return value.includes("\0") || value.split("/").some((segment) => segment === "..");
}

function normalizeSkillPath(skillPath: string | undefined, context: SkillIterateContext | undefined): string | SkillIterateResult {
  const normalized = skillPath?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_SKILL_PATH", "skill.iterate requires target.skillPath", "input", context);
  }

  if (unsafePath(normalized)) {
    return failure(
      "UNSAFE_SKILL_PATH",
      "skill.iterate skillPath must not contain traversal or NUL segments",
      "scope",
      context,
      normalized,
    );
  }

  return normalizeRoot(normalized);
}

function normalizeOperations(
  operations: readonly Partial<SkillIterationOperation>[] | undefined,
  context: SkillIterateContext | undefined,
  skillPath: string,
): readonly SkillIterationOperation[] | SkillIterateResult {
  if (operations === undefined || operations.length === 0) {
    return failure("MISSING_OPERATIONS", "skill.iterate requires at least one target.operation", "input", context, skillPath);
  }

  if (operations.length > skillIterateDescriptor.maxOperations) {
    return failure("TOO_MANY_OPERATIONS", "skill.iterate requested too many operations for first-round planning", "resource", context, skillPath);
  }

  const normalized: SkillIterationOperation[] = [];
  for (const operation of operations) {
    const kind = operation.kind;
    const relativePath = operation.relativePath?.trim() ?? "";
    const summary = operation.summary?.trim() ?? "";

    if (
      kind === undefined ||
      !supportedIterationKinds.includes(kind) ||
      relativePath.length === 0 ||
      relativePath.startsWith("/") ||
      unsafePath(relativePath) ||
      summary.length === 0 ||
      summary.includes("\0")
    ) {
      return failure(
        "INVALID_ITERATION_OPERATION",
        "skill.iterate operations must name a supported kind, relative file path, and safe summary",
        "input",
        context,
        skillPath,
      );
    }

    normalized.push({ kind, relativePath, summary });
  }

  return normalized;
}

function normalizeTarget(
  target: SkillIterateRequest["target"] | undefined,
  context: SkillIterateContext | undefined,
): SkillIterateTarget | SkillIterateResult {
  const skillPath = normalizeSkillPath(target?.skillPath, context);
  if (typeof skillPath !== "string") {
    return skillPath;
  }

  const changeIntent = target?.changeIntent?.trim() ?? "";
  if (changeIntent.length === 0) {
    return failure("MISSING_CHANGE_INTENT", "skill.iterate requires target.changeIntent", "input", context, skillPath);
  }

  const operations = normalizeOperations(target?.operations, context, skillPath);
  if ("ok" in operations) {
    return operations;
  }

  const reason = target?.reason?.trim();
  return {
    skillPath,
    changeIntent,
    operations,
    reason: reason || undefined,
  };
}

function ensureScope(target: SkillIterateTarget, context: SkillIterateContext | undefined): SkillIterateResult | undefined {
  const allowedRoots = cleanList(context?.allowedSkillRoots).map(normalizeRoot);
  if (allowedRoots.length === 0) {
    return undefined;
  }

  const insideScope = allowedRoots.some((root) => target.skillPath === root || target.skillPath.startsWith(`${root}/`));
  if (insideScope) {
    return undefined;
  }

  return failure(
    "SKILL_PATH_OUTSIDE_SCOPE",
    "skill.iterate skillPath is outside the allowed skill roots",
    "scope",
    context,
    target.skillPath,
  );
}

function ensurePermissions(target: SkillIterateTarget, context: SkillIterateContext | undefined): SkillIterateResult | undefined {
  const grantedPermissions = cleanList(context?.grantedPermissions);
  if (grantedPermissions.length === 0) {
    return undefined;
  }

  const missing = skillIterateDescriptor.permissionsRequired.filter((permission) => !grantedPermissions.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    `skill.iterate is missing permissions: ${missing.join(", ")}`,
    "permission",
    context,
    target.skillPath,
  );
}

function ensureGovernance(context: SkillIterateContext | undefined): SkillIterateResult | undefined {
  if (context?.guard?.accepted !== false) {
    return undefined;
  }

  return failure(
    "GOVERNANCE_REJECTED",
    context.guard.reason ?? "skill.iterate was rejected by runtime governance",
    "governance",
    context,
  );
}

function ensureDryRunOnly(target: SkillIterateTarget, context: SkillIterateContext | undefined): SkillIterateResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "skill.iterate only returns a guarded dry-run skill iteration envelope in the first implementation",
    "contract",
    context,
    target.skillPath,
  );
}

export function planSkillIteration(request: SkillIterateRequest = {}): SkillIterateResult {
  const target = normalizeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const governanceFailure = ensureGovernance(request.context);
  if (governanceFailure !== undefined) {
    return governanceFailure;
  }

  const scopeFailure = ensureScope(target, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensurePermissions(target, request.context);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = ensureDryRunOnly(target, request.context);
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  return {
    ok: true,
    toolId: skillIterateDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.skill.iterate",
      target,
      permissionsRequired: skillIterateDescriptor.permissionsRequired,
      dryRun: true,
      executionBlocked: true,
      unsafeSideEffects: true,
      iterationEnvelope: {
        patchModel: "skill-iteration-patch-v1",
        operationCount: target.operations.length,
        affectedFiles: target.operations.map((operation) => `${target.skillPath}/${operation.relativePath}`),
        requiresReview: true,
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.skill.iterate.dryRun", request.context, target.skillPath, {
        operationCount: target.operations.length,
        changeIntent: target.changeIntent,
      }),
    ],
    events: ["basicTool.skill.iterate.dryRun"],
  };
}
