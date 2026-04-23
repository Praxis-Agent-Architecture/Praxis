/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Skill 基础工具。
 * 核心目的：提供 基础工具集合 / Skill 基础工具 中的“总结 Skill”基础能力原语。
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
  isSafeSkillId,
  normalizeSkillId,
  type SkillBaseContext,
  type SkillBasePermission,
  type SkillBaseResult,
} from "./skill.management.js";

export type SkillSummarySource = {
  path?: string;
  heading?: string;
  content: string;
};

export type SkillSummarizeTarget = {
  skillId: string;
  title?: string;
  description?: string;
  sourceExcerpts: readonly SkillSummarySource[];
  maxBullets: number;
};

export type SkillSummarizeRequest = {
  target?: Partial<SkillSummarizeTarget>;
  context?: SkillBaseContext;
};

export type SkillSummarizeErrorCode =
  | "MISSING_SKILL_ID"
  | "INVALID_SKILL_ID"
  | "INVALID_MAX_BULLETS"
  | "SOURCE_TOO_LARGE"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "REAL_EXECUTION_BLOCKED";

export type SkillSummarizeOutput = {
  kind: "agentCore.basicTool.skill.summarize";
  target: SkillSummarizeTarget;
  summaryEnvelope: {
    skillId: string;
    summary: string;
    bullets: readonly string[];
    sourceCount: number;
  };
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly SkillBasePermission[];
  unsafeSideEffects: false;
};

export type SkillSummarizeResult = SkillBaseResult<"skill.summarize", SkillSummarizeOutput, SkillSummarizeErrorCode>;

export const skillSummarizeDescriptor = {
  toolId: "skill.summarize",
  capability: "summarize-skill",
  route: "agent_executionEngine.basic_toolLayer.baseTools.skillBase",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["skill:read"],
  unsafeSideEffects: false,
  maxSourceCharacters: 12000,
} as const;

const defaultMaxBullets = 5;
const maxBulletLimit = 12;

function normalizeSummarySource(source: Partial<SkillSummarySource>): SkillSummarySource | undefined {
  const content = source.content?.trim();
  if (content === undefined || content.length === 0) {
    return undefined;
  }

  return {
    path: source.path?.trim() || undefined,
    heading: source.heading?.trim() || undefined,
    content,
  };
}

function normalizeSummarizeTarget(
  target: SkillSummarizeRequest["target"],
  context: SkillBaseContext | undefined,
): SkillSummarizeTarget | SkillSummarizeResult {
  const skillId = normalizeSkillId(target?.skillId);
  if (skillId === undefined) {
    return createSkillBaseFailure(
      skillSummarizeDescriptor.toolId,
      "MISSING_SKILL_ID",
      "skill.summarize requires target.skillId",
      "input",
      context,
    );
  }

  if (!isSafeSkillId(skillId)) {
    return createSkillBaseFailure(
      skillSummarizeDescriptor.toolId,
      "INVALID_SKILL_ID",
      "skill.summarize skillId must be a simple registry identifier for the first implementation",
      "input",
      context,
      skillId,
    );
  }

  const maxBullets = target?.maxBullets ?? defaultMaxBullets;
  if (!Number.isInteger(maxBullets) || maxBullets < 1 || maxBullets > maxBulletLimit) {
    return createSkillBaseFailure(
      skillSummarizeDescriptor.toolId,
      "INVALID_MAX_BULLETS",
      `skill.summarize maxBullets must be an integer between 1 and ${maxBulletLimit}`,
      "resource",
      context,
      skillId,
    );
  }

  const sourceExcerpts = (target?.sourceExcerpts ?? [])
    .map((source) => normalizeSummarySource(source))
    .filter((source): source is SkillSummarySource => source !== undefined);
  const totalSourceCharacters = sourceExcerpts.reduce((total, source) => total + source.content.length, 0);
  if (totalSourceCharacters > skillSummarizeDescriptor.maxSourceCharacters) {
    return createSkillBaseFailure(
      skillSummarizeDescriptor.toolId,
      "SOURCE_TOO_LARGE",
      `skill.summarize sourceExcerpts must stay within ${skillSummarizeDescriptor.maxSourceCharacters} characters`,
      "resource",
      context,
      skillId,
    );
  }

  return {
    skillId,
    title: target?.title?.trim() || undefined,
    description: target?.description?.trim() || undefined,
    sourceExcerpts,
    maxBullets,
  };
}

function firstSentence(value: string | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (normalized === undefined || normalized.length === 0) {
    return undefined;
  }

  const sentence = normalized.match(/^(.{1,220}?)([.!?。！？]|$)/u)?.[1] ?? normalized.slice(0, 220);
  return sentence.trim();
}

function excerptBullet(source: SkillSummarySource): string {
  const heading = source.heading ?? source.path ?? "skill excerpt";
  const preview = firstSentence(source.content) ?? "";
  return `${heading}: ${preview}`.slice(0, 260);
}

function buildSummary(target: SkillSummarizeTarget): SkillSummarizeOutput["summaryEnvelope"] {
  const fallbackSummary =
    target.sourceExcerpts.length === 0
      ? "No skill content was provided; this dry-run envelope can only summarize metadata."
      : "Skill summary was produced from provided excerpts without calling an external provider.";

  const summary = firstSentence(target.description) ?? target.title ?? fallbackSummary;
  const bullets = target.sourceExcerpts.slice(0, target.maxBullets).map(excerptBullet);

  return {
    skillId: target.skillId,
    summary,
    bullets,
    sourceCount: target.sourceExcerpts.length,
  };
}

export function planSkillSummarize(request: SkillSummarizeRequest = {}): SkillSummarizeResult {
  const toolId = skillSummarizeDescriptor.toolId;
  const target = normalizeSummarizeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const guardFailure = ensureSkillBaseGuard<typeof toolId, SkillSummarizeOutput, SkillSummarizeErrorCode>(
    toolId,
    request.context,
    "GOVERNANCE_REJECTED",
    target.skillId,
  );
  if (guardFailure !== undefined) {
    return guardFailure;
  }

  const skillScopeFailure = ensureSkillIdScope<typeof toolId, SkillSummarizeOutput, SkillSummarizeErrorCode>(
    toolId,
    target.skillId,
    request.context,
    "SCOPE_REJECTED",
  );
  if (skillScopeFailure !== undefined) {
    return skillScopeFailure;
  }

  const permissionFailure = ensureSkillBasePermissions<typeof toolId, SkillSummarizeOutput, SkillSummarizeErrorCode>(
    toolId,
    skillSummarizeDescriptor.permissionsRequired,
    request.context,
    "PERMISSION_DENIED",
    target.skillId,
  );
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = blockSkillBaseRealExecution<typeof toolId, SkillSummarizeOutput, SkillSummarizeErrorCode>(
    toolId,
    request.context,
    "REAL_EXECUTION_BLOCKED",
    "skill.summarize only returns a guarded dry-run summarization envelope in the first implementation",
    target.skillId,
  );
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  return {
    ok: true,
    toolId,
    output: {
      kind: "agentCore.basicTool.skill.summarize",
      target,
      summaryEnvelope: buildSummary(target),
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: skillSummarizeDescriptor.permissionsRequired,
      unsafeSideEffects: false,
    },
    audit: [
      createSkillBaseAuditEvent(toolId, "agentCore.basicTool.skill.summarize.dryRun", request.context, target.skillId, {
        sourceCount: target.sourceExcerpts.length,
        maxBullets: target.maxBullets,
      }),
    ],
    events: ["basicTool.skill.summarize.dryRun"],
  };
}
