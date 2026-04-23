/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Skill 基础工具。
 * 核心目的：提供 基础工具集合 / Skill 基础工具 中的“移除 Skill”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  blockSkillBaseRealExecution,
  createSkillBaseAuditEvent,
  createSkillBaseFailure,
  ensureSkillBaseGuard,
  ensureSkillBasePermissions,
  ensureSkillIdScope,
  ensureSkillRootScope,
  isSafeSkillId,
  normalizeSkillBaseRoot,
  normalizeSkillId,
  type SkillBaseContext,
  type SkillBasePermission,
  type SkillBaseResult,
} from "./skill.management.js";

export type SkillRemoveMode = "unlink" | "disable" | "purge";

export type SkillRemoveTarget = {
  skillId: string;
  registryRoot: string;
  mode: SkillRemoveMode;
  keepBackup: boolean;
};

export type SkillRemoveRequest = {
  target?: Partial<SkillRemoveTarget>;
  context?: SkillBaseContext;
};

export type SkillRemoveErrorCode =
  | "MISSING_SKILL_ID"
  | "INVALID_SKILL_ID"
  | "MISSING_REGISTRY_ROOT"
  | "INVALID_REMOVE_MODE"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "REAL_EXECUTION_BLOCKED";

export type SkillRemoveOutput = {
  kind: "agentCore.basicTool.skill.remove";
  target: SkillRemoveTarget;
  removePlan: {
    skillId: string;
    mode: SkillRemoveMode;
    registryRoot: string;
    backupPlanned: boolean;
    commandPreview: readonly string[];
  };
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly SkillBasePermission[];
  unsafeSideEffects: true;
};

export type SkillRemoveResult = SkillBaseResult<"skill.remove", SkillRemoveOutput, SkillRemoveErrorCode>;

export const skillRemoveDescriptor = {
  toolId: "skill.remove",
  capability: "remove-skill",
  route: "agent_executionEngine.basic_toolLayer.baseTools.skillBase",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["skill:write", "filesystem:write"],
  unsafeSideEffects: true,
} as const;

function normalizeRemoveMode(mode: string | undefined): SkillRemoveMode | undefined {
  const normalized = mode?.trim() || "disable";
  if (normalized === "unlink" || normalized === "disable" || normalized === "purge") {
    return normalized;
  }

  return undefined;
}

function normalizeRemoveTarget(
  target: SkillRemoveRequest["target"],
  context: SkillBaseContext | undefined,
): SkillRemoveTarget | SkillRemoveResult {
  const skillId = normalizeSkillId(target?.skillId);
  if (skillId === undefined) {
    return createSkillBaseFailure(
      skillRemoveDescriptor.toolId,
      "MISSING_SKILL_ID",
      "skill.remove requires target.skillId",
      "input",
      context,
    );
  }

  if (!isSafeSkillId(skillId)) {
    return createSkillBaseFailure(
      skillRemoveDescriptor.toolId,
      "INVALID_SKILL_ID",
      "skill.remove skillId must be a simple registry identifier for the first implementation",
      "input",
      context,
      skillId,
    );
  }

  const registryRoot = target?.registryRoot?.trim();
  if (registryRoot === undefined || registryRoot.length === 0) {
    return createSkillBaseFailure(
      skillRemoveDescriptor.toolId,
      "MISSING_REGISTRY_ROOT",
      "skill.remove requires target.registryRoot for scope and audit",
      "input",
      context,
      skillId,
    );
  }

  const mode = normalizeRemoveMode(target?.mode);
  if (mode === undefined) {
    return createSkillBaseFailure(
      skillRemoveDescriptor.toolId,
      "INVALID_REMOVE_MODE",
      "skill.remove mode must be unlink, disable, or purge",
      "input",
      context,
      skillId,
    );
  }

  return {
    skillId,
    registryRoot: normalizeSkillBaseRoot(registryRoot),
    mode,
    keepBackup: target?.keepBackup !== false,
  };
}

function commandPreview(target: SkillRemoveTarget): readonly string[] {
  return [
    "skill-registry",
    "remove",
    target.skillId,
    "--registry-root",
    target.registryRoot,
    "--mode",
    target.mode,
    ...(target.keepBackup ? ["--keep-backup"] : ["--no-backup"]),
    "--dry-run",
  ];
}

export function planSkillRemove(request: SkillRemoveRequest = {}): SkillRemoveResult {
  const toolId = skillRemoveDescriptor.toolId;
  const target = normalizeRemoveTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const guardFailure = ensureSkillBaseGuard<typeof toolId, SkillRemoveOutput, SkillRemoveErrorCode>(
    toolId,
    request.context,
    "GOVERNANCE_REJECTED",
    target.skillId,
  );
  if (guardFailure !== undefined) {
    return guardFailure;
  }

  const skillScopeFailure = ensureSkillIdScope<typeof toolId, SkillRemoveOutput, SkillRemoveErrorCode>(
    toolId,
    target.skillId,
    request.context,
    "SCOPE_REJECTED",
  );
  if (skillScopeFailure !== undefined) {
    return skillScopeFailure;
  }

  const rootScopeFailure = ensureSkillRootScope<typeof toolId, SkillRemoveOutput, SkillRemoveErrorCode>(
    toolId,
    target.registryRoot,
    request.context,
    "SCOPE_REJECTED",
  );
  if (rootScopeFailure !== undefined) {
    return rootScopeFailure;
  }

  const permissionFailure = ensureSkillBasePermissions<typeof toolId, SkillRemoveOutput, SkillRemoveErrorCode>(
    toolId,
    skillRemoveDescriptor.permissionsRequired,
    request.context,
    "PERMISSION_DENIED",
    target.skillId,
  );
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = blockSkillBaseRealExecution<typeof toolId, SkillRemoveOutput, SkillRemoveErrorCode>(
    toolId,
    request.context,
    "REAL_EXECUTION_BLOCKED",
    "skill.remove only returns a guarded dry-run removal plan in the first implementation",
    target.skillId,
  );
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  return {
    ok: true,
    toolId,
    output: {
      kind: "agentCore.basicTool.skill.remove",
      target,
      removePlan: {
        skillId: target.skillId,
        mode: target.mode,
        registryRoot: target.registryRoot,
        backupPlanned: target.keepBackup,
        commandPreview: commandPreview(target),
      },
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: skillRemoveDescriptor.permissionsRequired,
      unsafeSideEffects: true,
    },
    audit: [
      createSkillBaseAuditEvent(toolId, "agentCore.basicTool.skill.remove.dryRun", request.context, target.skillId, {
        mode: target.mode,
        registryRoot: target.registryRoot,
        keepBackup: target.keepBackup,
      }),
    ],
    events: ["basicTool.skill.remove.dryRun"],
  };
}
