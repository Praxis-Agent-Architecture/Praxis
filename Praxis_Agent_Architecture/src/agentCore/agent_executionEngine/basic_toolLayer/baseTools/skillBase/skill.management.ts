/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Skill 基础工具。
 * 核心目的：提供 基础工具集合 / Skill 基础工具 中的“管理 Skill”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type SkillBasePermission = "skill:read" | "skill:write" | "filesystem:read" | "filesystem:write";

export type SkillBaseErrorBoundary = "input" | "scope" | "permission" | "governance" | "contract" | "resource";

export type SkillBaseGuard = {
  accepted: boolean;
  reason?: string;
};

export type SkillBaseContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: SkillBaseGuard;
  allowedSkillIds?: readonly string[];
  allowedRoots?: readonly string[];
  grantedPermissions?: readonly SkillBasePermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type SkillBaseError<Code extends string> = {
  code: Code;
  message: string;
  boundary: SkillBaseErrorBoundary;
  publicSafe: true;
  internalDetailExposed: false;
};

export type SkillBaseAuditEvent<ToolId extends string> = {
  type: string;
  toolId: ToolId;
  invocationId: string;
  dryRun: boolean;
  targetRef?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type SkillBaseResult<ToolId extends string, Output, Code extends string> =
  | {
      ok: true;
      toolId: ToolId;
      output: Output;
      audit: readonly SkillBaseAuditEvent<ToolId>[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: ToolId;
      error: SkillBaseError<Code>;
      audit: readonly SkillBaseAuditEvent<ToolId>[];
      events: readonly string[];
    };

export type SkillManagementAction = "list" | "inspect" | "enable" | "disable";

export type SkillManagementTarget = {
  action: SkillManagementAction;
  skillId?: string;
  registryRoot?: string;
  metadataPatch?: Readonly<Record<string, unknown>>;
};

export type SkillManagementRequest = {
  target?: Partial<SkillManagementTarget>;
  context?: SkillBaseContext;
};

export type SkillManagementErrorCode =
  | "MISSING_ACTION"
  | "INVALID_ACTION"
  | "MISSING_SKILL_ID"
  | "INVALID_SKILL_ID"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "REAL_EXECUTION_BLOCKED";

export type SkillManagementOutput = {
  kind: "agentCore.basicTool.skill.management";
  target: SkillManagementTarget;
  managementPlan: {
    action: SkillManagementAction;
    affectedSkillIds: readonly string[];
    registryRoot?: string;
    metadataKeys: readonly string[];
  };
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly SkillBasePermission[];
  unsafeSideEffects: boolean;
};

export type SkillManagementResult = SkillBaseResult<
  "skill.management",
  SkillManagementOutput,
  SkillManagementErrorCode
>;

export const skillManagementDescriptor = {
  toolId: "skill.management",
  capability: "manage-skill",
  route: "agent_executionEngine.basic_toolLayer.baseTools.skillBase",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsByAction: {
    list: ["skill:read"],
    inspect: ["skill:read"],
    enable: ["skill:read", "skill:write"],
    disable: ["skill:read", "skill:write"],
  },
} as const;

const skillIdPattern = /^[A-Za-z0-9_.:-]+$/;

export function dryRunEnabled(context: SkillBaseContext | undefined): boolean {
  return context?.dryRun !== false;
}

export function normalizeSkillBaseRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/, "");
}

export function cleanSkillBaseList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

export function normalizeSkillId(skillId: string | undefined): string | undefined {
  const normalized = skillId?.trim();
  if (normalized === undefined || normalized.length === 0) {
    return undefined;
  }

  return normalized;
}

export function isSafeSkillId(skillId: string): boolean {
  return skillIdPattern.test(skillId);
}

export function createSkillBaseAuditEvent<ToolId extends string>(
  toolId: ToolId,
  type: string,
  context: SkillBaseContext | undefined,
  targetRef?: string,
  metadata?: Readonly<Record<string, unknown>>,
): SkillBaseAuditEvent<ToolId> {
  return {
    type,
    toolId,
    invocationId: context?.invocationId?.trim() || `${toolId}:dry-run`,
    dryRun: dryRunEnabled(context),
    targetRef,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

export function createSkillBaseFailure<ToolId extends string, Output, Code extends string>(
  toolId: ToolId,
  code: Code,
  message: string,
  boundary: SkillBaseErrorBoundary,
  context: SkillBaseContext | undefined,
  targetRef?: string,
): SkillBaseResult<ToolId, Output, Code> {
  return {
    ok: false,
    toolId,
    error: { code, message, boundary, publicSafe: true, internalDetailExposed: false },
    audit: [
      createSkillBaseAuditEvent(toolId, `agentCore.basicTool.${toolId}.rejected`, context, targetRef, { code }),
    ],
    events: [`basicTool.${toolId}.rejected`],
  };
}

export function ensureSkillBaseGuard<ToolId extends string, Output, Code extends string>(
  toolId: ToolId,
  context: SkillBaseContext | undefined,
  code: Code,
  targetRef?: string,
): SkillBaseResult<ToolId, Output, Code> | undefined {
  if (context?.guard?.accepted !== false) {
    return undefined;
  }

  return createSkillBaseFailure(
    toolId,
    code,
    context.guard.reason ?? `${toolId} was rejected by runtime governance`,
    "governance",
    context,
    targetRef,
  );
}

export function ensureSkillIdScope<ToolId extends string, Output, Code extends string>(
  toolId: ToolId,
  skillId: string | undefined,
  context: SkillBaseContext | undefined,
  code: Code,
): SkillBaseResult<ToolId, Output, Code> | undefined {
  if (skillId === undefined || context?.allowedSkillIds === undefined) {
    return undefined;
  }

  const allowedSkillIds = cleanSkillBaseList(context.allowedSkillIds);
  if (allowedSkillIds.includes(skillId)) {
    return undefined;
  }

  return createSkillBaseFailure(
    toolId,
    code,
    `${toolId} target skillId is outside the allowed skill scope`,
    "scope",
    context,
    skillId,
  );
}

export function ensureSkillRootScope<ToolId extends string, Output, Code extends string>(
  toolId: ToolId,
  rootPath: string | undefined,
  context: SkillBaseContext | undefined,
  code: Code,
): SkillBaseResult<ToolId, Output, Code> | undefined {
  if (rootPath === undefined || context?.allowedRoots === undefined) {
    return undefined;
  }

  const normalizedRootPath = normalizeSkillBaseRoot(rootPath);
  const allowedRoots = cleanSkillBaseList(context.allowedRoots).map(normalizeSkillBaseRoot);
  const allowed = allowedRoots.some((root) => normalizedRootPath === root || normalizedRootPath.startsWith(`${root}/`));
  if (allowed) {
    return undefined;
  }

  return createSkillBaseFailure(
    toolId,
    code,
    `${toolId} target registryRoot is outside the allowed filesystem roots`,
    "scope",
    context,
    normalizedRootPath,
  );
}

export function ensureSkillBasePermissions<ToolId extends string, Output, Code extends string>(
  toolId: ToolId,
  requiredPermissions: readonly SkillBasePermission[],
  context: SkillBaseContext | undefined,
  code: Code,
  targetRef?: string,
): SkillBaseResult<ToolId, Output, Code> | undefined {
  if (context?.grantedPermissions === undefined) {
    return undefined;
  }

  const granted = cleanSkillBaseList(context.grantedPermissions);
  const missing = requiredPermissions.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return createSkillBaseFailure(
    toolId,
    code,
    `${toolId} is missing permissions: ${missing.join(", ")}`,
    "permission",
    context,
    targetRef,
  );
}

export function blockSkillBaseRealExecution<ToolId extends string, Output, Code extends string>(
  toolId: ToolId,
  context: SkillBaseContext | undefined,
  code: Code,
  message: string,
  targetRef?: string,
): SkillBaseResult<ToolId, Output, Code> | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return createSkillBaseFailure(toolId, code, message, "contract", context, targetRef);
}

function normalizeManagementAction(action: string | undefined): SkillManagementAction | undefined {
  if (action === "list" || action === "inspect" || action === "enable" || action === "disable") {
    return action;
  }

  return undefined;
}

function managementPermissions(action: SkillManagementAction): readonly SkillBasePermission[] {
  return skillManagementDescriptor.permissionsByAction[action];
}

function normalizeManagementTarget(
  target: SkillManagementRequest["target"],
  context: SkillBaseContext | undefined,
): SkillManagementTarget | SkillManagementResult {
  if (target?.action === undefined || target.action.trim().length === 0) {
    return createSkillBaseFailure(
      skillManagementDescriptor.toolId,
      "MISSING_ACTION",
      "skill.management requires target.action",
      "input",
      context,
    );
  }

  const action = normalizeManagementAction(target.action);
  if (action === undefined) {
    return createSkillBaseFailure(
      skillManagementDescriptor.toolId,
      "INVALID_ACTION",
      "skill.management action must be list, inspect, enable, or disable",
      "input",
      context,
      target.skillId,
    );
  }

  const skillId = normalizeSkillId(target.skillId);
  if (action !== "list" && skillId === undefined) {
    return createSkillBaseFailure(
      skillManagementDescriptor.toolId,
      "MISSING_SKILL_ID",
      `skill.management action ${action} requires target.skillId`,
      "input",
      context,
    );
  }

  if (skillId !== undefined && !isSafeSkillId(skillId)) {
    return createSkillBaseFailure(
      skillManagementDescriptor.toolId,
      "INVALID_SKILL_ID",
      "skill.management skillId must be a simple registry identifier for the first implementation",
      "input",
      context,
      skillId,
    );
  }

  return {
    action,
    skillId,
    registryRoot: target.registryRoot === undefined ? undefined : normalizeSkillBaseRoot(target.registryRoot),
    metadataPatch: target.metadataPatch,
  };
}

export function planSkillManagement(request: SkillManagementRequest = {}): SkillManagementResult {
  const toolId = skillManagementDescriptor.toolId;
  const target = normalizeManagementTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const targetRef = target.skillId ?? target.registryRoot ?? target.action;
  const guardFailure = ensureSkillBaseGuard<typeof toolId, SkillManagementOutput, SkillManagementErrorCode>(
    toolId,
    request.context,
    "GOVERNANCE_REJECTED",
    targetRef,
  );
  if (guardFailure !== undefined) {
    return guardFailure;
  }

  const skillScopeFailure = ensureSkillIdScope<typeof toolId, SkillManagementOutput, SkillManagementErrorCode>(
    toolId,
    target.skillId,
    request.context,
    "SCOPE_REJECTED",
  );
  if (skillScopeFailure !== undefined) {
    return skillScopeFailure;
  }

  const rootScopeFailure = ensureSkillRootScope<typeof toolId, SkillManagementOutput, SkillManagementErrorCode>(
    toolId,
    target.registryRoot,
    request.context,
    "SCOPE_REJECTED",
  );
  if (rootScopeFailure !== undefined) {
    return rootScopeFailure;
  }

  const requiredPermissions = managementPermissions(target.action);
  const permissionFailure = ensureSkillBasePermissions<typeof toolId, SkillManagementOutput, SkillManagementErrorCode>(
    toolId,
    requiredPermissions,
    request.context,
    "PERMISSION_DENIED",
    targetRef,
  );
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = blockSkillBaseRealExecution<typeof toolId, SkillManagementOutput, SkillManagementErrorCode>(
    toolId,
    request.context,
    "REAL_EXECUTION_BLOCKED",
    "skill.management only returns a guarded dry-run skill management plan in the first implementation",
    targetRef,
  );
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  const metadataKeys = Object.keys(target.metadataPatch ?? {}).sort();
  return {
    ok: true,
    toolId,
    output: {
      kind: "agentCore.basicTool.skill.management",
      target,
      managementPlan: {
        action: target.action,
        affectedSkillIds: target.skillId === undefined ? [] : [target.skillId],
        registryRoot: target.registryRoot,
        metadataKeys,
      },
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: requiredPermissions,
      unsafeSideEffects: target.action === "enable" || target.action === "disable",
    },
    audit: [
      createSkillBaseAuditEvent(toolId, "agentCore.basicTool.skill.management.dryRun", request.context, targetRef, {
        action: target.action,
        metadataKeys,
      }),
    ],
    events: ["basicTool.skill.management.dryRun"],
  };
}
