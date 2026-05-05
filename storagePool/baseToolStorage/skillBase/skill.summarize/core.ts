import {
  createAuditEvent,
  ensurePermissions,
  failure,
  isAllowedSkillId,
  isRecord,
  isSafeSkillName,
  parseSkillFrontmatter,
  sourcePreview,
  stringValue,
  integerValue,
  type SkillBaseContext,
  type SkillBasePermission,
  type SkillFilesystemProvider,
} from "../_shared/skillCore.js";
import type { SkillToolResult } from "../_shared/baseToolAdapter.js";

export type SkillSummarySource = {
  path?: string;
  heading?: string;
  content: string;
};

export type SkillSummarizeTarget = {
  skillId: string;
  skillPath?: string;
  title?: string;
  description?: string;
  sourceExcerpts: readonly SkillSummarySource[];
  maxBullets: number;
  metadataBudgetCharacters: number;
};

export type SkillSummarizeRequest = {
  target?: unknown;
  context?: SkillBaseContext;
  provider?: SkillFilesystemProvider;
};

export type SkillSummarizeErrorCode =
  | "MISSING_SKILL_ID"
  | "INVALID_SKILL_ID"
  | "INVALID_MAX_BULLETS"
  | "SOURCE_TOO_LARGE"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type SkillSummarizeOutput = {
  kind: "agentCore.basicTool.skill.summarize.output";
  target: SkillSummarizeTarget;
  runtimeEntry: {
    port: "BaseToolExecutorPort.filesystem.readText";
    runtimeOwnsFilesystem: true;
  };
  summaryEnvelope: {
    skillId: string;
    modelVisibleLine: string;
    summary: string;
    bullets: readonly string[];
    sourceCount: number;
    truncated: boolean;
  };
  dryRun: boolean;
  executionBlocked: boolean;
  permissionsRequired: readonly SkillBasePermission[];
  unsafeSideEffects: false;
};

export type SkillSummarizeResult = SkillToolResult<SkillSummarizeOutput, SkillSummarizeErrorCode>;

export const skillSummarizeDescriptor = {
  toolId: "skill.summarize",
  capability: "summarize-skill",
  defaultDryRun: true,
  permissionsRequired: ["skill:read"] as const,
  maxSourceCharacters: 24_000,
} as const;

function normalizeSource(value: unknown): SkillSummarySource | undefined {
  if (!isRecord(value)) return undefined;
  const content = typeof value.content === "string" ? value.content.trim() : undefined;
  if (content === undefined || content.length === 0) return undefined;
  return { path: stringValue(value.path), heading: stringValue(value.heading), content };
}

function normalizeTarget(target: unknown, context: SkillBaseContext | undefined): SkillSummarizeTarget | SkillSummarizeResult {
  if (!isRecord(target)) return failure("skill.summarize", "MISSING_SKILL_ID", "skill.summarize requires target.skillId", "input", context);
  const skillId = stringValue(target.skillId);
  if (skillId === undefined) return failure("skill.summarize", "MISSING_SKILL_ID", "skill.summarize requires target.skillId", "input", context);
  if (!isSafeSkillName(skillId)) return failure("skill.summarize", "INVALID_SKILL_ID", "skill.summarize skillId must be safe", "input", context, skillId);
  if (!isAllowedSkillId(skillId, context?.allowedSkillIds)) {
    return failure("skill.summarize", "SCOPE_REJECTED", "skill.summarize skillId is outside allowed skill ids", "scope", context, skillId);
  }
  const maxBullets = integerValue(target.maxBullets) ?? 5;
  if (maxBullets < 1 || maxBullets > 12) {
    return failure("skill.summarize", "INVALID_MAX_BULLETS", "skill.summarize maxBullets must be 1-12", "resource", context, skillId);
  }
  const sourceExcerpts = (Array.isArray(target.sourceExcerpts) ? target.sourceExcerpts : []).map(normalizeSource).filter((source): source is SkillSummarySource => source !== undefined);
  const totalSourceCharacters = sourceExcerpts.reduce((total, source) => total + source.content.length, 0);
  if (totalSourceCharacters > skillSummarizeDescriptor.maxSourceCharacters) {
    return failure("skill.summarize", "SOURCE_TOO_LARGE", `skill.summarize sourceExcerpts must stay within ${skillSummarizeDescriptor.maxSourceCharacters} characters`, "resource", context, skillId);
  }
  return {
    skillId,
    skillPath: stringValue(target.skillPath),
    title: stringValue(target.title),
    description: stringValue(target.description),
    sourceExcerpts,
    maxBullets,
    metadataBudgetCharacters: integerValue(target.metadataBudgetCharacters) ?? 8_000,
  };
}

function buildSummary(target: SkillSummarizeTarget): SkillSummarizeOutput["summaryEnvelope"] {
  const firstSource = target.sourceExcerpts[0]?.content;
  const parsed = firstSource === undefined ? undefined : parseSkillFrontmatter(firstSource, target.skillId);
  const title = target.title ?? parsed?.name ?? target.skillId;
  const description = target.description ?? parsed?.description ?? "Skill instructions";
  const bullets = target.sourceExcerpts
    .slice(0, target.maxBullets)
    .map((source) => `${source.heading ?? source.path ?? "excerpt"}: ${sourcePreview(source.content, 220)}`);
  const summary = `${title}: ${description}`;
  const fullLine = `- ${target.skillId}: ${description}${target.skillPath ? ` (file: ${target.skillPath})` : ""}`;
  const truncated = fullLine.length > target.metadataBudgetCharacters;
  return {
    skillId: target.skillId,
    modelVisibleLine: truncated ? fullLine.slice(0, Math.max(0, target.metadataBudgetCharacters - 1)) + "..." : fullLine,
    summary,
    bullets,
    sourceCount: target.sourceExcerpts.length,
    truncated,
  };
}

export async function executeSkillSummarize(request: SkillSummarizeRequest = {}): Promise<SkillSummarizeResult> {
  const context = request.context;
  const target = normalizeTarget(request.target, context);
  if (!("skillId" in target)) return target;
  const permissionFailure = ensurePermissions<SkillSummarizeOutput, SkillSummarizeErrorCode>("skill.summarize", skillSummarizeDescriptor.permissionsRequired, context, target.skillId);
  if (permissionFailure !== undefined) return permissionFailure;

  let finalTarget = target;
  if (context?.dryRun === false && target.sourceExcerpts.length === 0 && target.skillPath !== undefined) {
    if (request.provider?.readText === undefined) {
      return failure("skill.summarize", "PROVIDER_UNAVAILABLE", "skill.summarize requires runtime filesystem.readText when sourceExcerpts are omitted", "provider", context, target.skillId);
    }
    try {
      const read = await request.provider.readText({ path: target.skillPath, encoding: "utf8", maxBytes: skillSummarizeDescriptor.maxSourceCharacters });
      finalTarget = { ...target, sourceExcerpts: [{ path: target.skillPath, heading: "SKILL.md", content: read.content }] };
    } catch {
      return failure("skill.summarize", "PROVIDER_REJECTED", "skill.summarize provider failed while reading skill content", "provider", context, target.skillId);
    }
  }

  return {
    ok: true,
    toolId: "skill.summarize",
    output: {
      kind: "agentCore.basicTool.skill.summarize.output",
      target: finalTarget,
      runtimeEntry: { port: "BaseToolExecutorPort.filesystem.readText", runtimeOwnsFilesystem: true },
      summaryEnvelope: buildSummary(finalTarget),
      dryRun: context?.dryRun === false ? false : true,
      executionBlocked: context?.dryRun === false ? false : true,
      permissionsRequired: skillSummarizeDescriptor.permissionsRequired,
      unsafeSideEffects: false,
    },
    audit: [createAuditEvent("skill.summarize", context?.dryRun === false ? "agentCore.basicTool.skill.summarize.executed" : "agentCore.basicTool.skill.summarize.dryRun", context, target.skillId)],
    events: [context?.dryRun === false ? "basicTool.skill.summarize.executed" : "basicTool.skill.summarize.dryRun"],
  };
}

export const planSkillSummarize = executeSkillSummarize;
