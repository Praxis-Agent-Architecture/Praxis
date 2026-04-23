/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Skill 基础工具。
 * 核心目的：提供 基础工具集合 / Skill 基础工具 中的“检索 Skill”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  blockSkillBaseRealExecution,
  cleanSkillBaseList,
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

export type SkillRipgrepTarget = {
  query: string;
  registryRoot: string;
  skillId?: string;
  includeHidden: boolean;
  maxResults: number;
  fileGlobs: readonly string[];
};

export type SkillRipgrepRequest = {
  target?: Partial<SkillRipgrepTarget>;
  context?: SkillBaseContext;
};

export type SkillRipgrepErrorCode =
  | "MISSING_QUERY"
  | "MISSING_REGISTRY_ROOT"
  | "INVALID_SKILL_ID"
  | "INVALID_MAX_RESULTS"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "REAL_EXECUTION_BLOCKED";

export type SkillRipgrepOutput = {
  kind: "agentCore.basicTool.skill.ripgrep";
  target: SkillRipgrepTarget;
  commandPreview: readonly string[];
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly SkillBasePermission[];
  unsafeSideEffects: false;
  resultEnvelope: {
    query: string;
    matches: readonly {
      skillId?: string;
      path: string;
      line?: number;
      preview?: string;
    }[];
  };
};

export type SkillRipgrepResult = SkillBaseResult<"skill.ripgrep", SkillRipgrepOutput, SkillRipgrepErrorCode>;

export const skillRipgrepDescriptor = {
  toolId: "skill.ripgrep",
  capability: "ripgrep-skill-registry",
  route: "agent_executionEngine.basic_toolLayer.baseTools.skillBase",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["skill:read", "filesystem:read"],
  unsafeSideEffects: false,
} as const;

const defaultMaxResults = 50;
const maxResultLimit = 1000;

function normalizeRipgrepTarget(
  target: SkillRipgrepRequest["target"],
  context: SkillBaseContext | undefined,
): SkillRipgrepTarget | SkillRipgrepResult {
  const query = target?.query?.trim() ?? "";
  if (query.length === 0) {
    return createSkillBaseFailure(
      skillRipgrepDescriptor.toolId,
      "MISSING_QUERY",
      "skill.ripgrep requires target.query",
      "input",
      context,
    );
  }

  const registryRoot = target?.registryRoot?.trim();
  if (registryRoot === undefined || registryRoot.length === 0) {
    return createSkillBaseFailure(
      skillRipgrepDescriptor.toolId,
      "MISSING_REGISTRY_ROOT",
      "skill.ripgrep requires target.registryRoot",
      "input",
      context,
    );
  }

  const skillId = normalizeSkillId(target?.skillId);
  if (skillId !== undefined && !isSafeSkillId(skillId)) {
    return createSkillBaseFailure(
      skillRipgrepDescriptor.toolId,
      "INVALID_SKILL_ID",
      "skill.ripgrep skillId must be a simple registry identifier for the first implementation",
      "input",
      context,
      skillId,
    );
  }

  const maxResults = target?.maxResults ?? defaultMaxResults;
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > maxResultLimit) {
    return createSkillBaseFailure(
      skillRipgrepDescriptor.toolId,
      "INVALID_MAX_RESULTS",
      `skill.ripgrep maxResults must be an integer between 1 and ${maxResultLimit}`,
      "resource",
      context,
      skillId ?? registryRoot,
    );
  }

  return {
    query,
    registryRoot: normalizeSkillBaseRoot(registryRoot),
    skillId,
    includeHidden: target?.includeHidden === true,
    maxResults,
    fileGlobs: cleanSkillBaseList(target?.fileGlobs),
  };
}

function searchRoot(target: SkillRipgrepTarget): string {
  if (target.skillId === undefined) {
    return target.registryRoot;
  }

  return `${target.registryRoot}/${target.skillId}`;
}

function commandPreview(target: SkillRipgrepTarget): readonly string[] {
  return [
    "rg",
    "--line-number",
    "--max-count",
    String(target.maxResults),
    ...(target.includeHidden ? ["--hidden"] : []),
    ...target.fileGlobs.flatMap((glob) => ["--glob", glob]),
    target.query,
    searchRoot(target),
  ];
}

export function planSkillRipgrep(request: SkillRipgrepRequest = {}): SkillRipgrepResult {
  const toolId = skillRipgrepDescriptor.toolId;
  const target = normalizeRipgrepTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const targetRef = target.skillId ?? target.registryRoot;
  const guardFailure = ensureSkillBaseGuard<typeof toolId, SkillRipgrepOutput, SkillRipgrepErrorCode>(
    toolId,
    request.context,
    "GOVERNANCE_REJECTED",
    targetRef,
  );
  if (guardFailure !== undefined) {
    return guardFailure;
  }

  const skillScopeFailure = ensureSkillIdScope<typeof toolId, SkillRipgrepOutput, SkillRipgrepErrorCode>(
    toolId,
    target.skillId,
    request.context,
    "SCOPE_REJECTED",
  );
  if (skillScopeFailure !== undefined) {
    return skillScopeFailure;
  }

  const rootScopeFailure = ensureSkillRootScope<typeof toolId, SkillRipgrepOutput, SkillRipgrepErrorCode>(
    toolId,
    target.registryRoot,
    request.context,
    "SCOPE_REJECTED",
  );
  if (rootScopeFailure !== undefined) {
    return rootScopeFailure;
  }

  const permissionFailure = ensureSkillBasePermissions<typeof toolId, SkillRipgrepOutput, SkillRipgrepErrorCode>(
    toolId,
    skillRipgrepDescriptor.permissionsRequired,
    request.context,
    "PERMISSION_DENIED",
    targetRef,
  );
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = blockSkillBaseRealExecution<typeof toolId, SkillRipgrepOutput, SkillRipgrepErrorCode>(
    toolId,
    request.context,
    "REAL_EXECUTION_BLOCKED",
    "skill.ripgrep only returns a guarded dry-run ripgrep plan in the first implementation",
    targetRef,
  );
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  return {
    ok: true,
    toolId,
    output: {
      kind: "agentCore.basicTool.skill.ripgrep",
      target,
      commandPreview: commandPreview(target),
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: skillRipgrepDescriptor.permissionsRequired,
      unsafeSideEffects: false,
      resultEnvelope: {
        query: target.query,
        matches: [],
      },
    },
    audit: [
      createSkillBaseAuditEvent(toolId, "agentCore.basicTool.skill.ripgrep.dryRun", request.context, targetRef, {
        registryRoot: target.registryRoot,
        includeHidden: target.includeHidden,
        maxResults: target.maxResults,
        fileGlobs: target.fileGlobs,
      }),
    ],
    events: ["basicTool.skill.ripgrep.dryRun"],
  };
}
