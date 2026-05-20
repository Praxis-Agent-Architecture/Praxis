import {
  createAuditEvent,
  ensurePermissions,
  failure,
  integerValue,
  isAllowedSkillId,
  isInsideAllowedRoots,
  isRecord,
  isSafeSkillName,
  joinPath,
  stringValue,
  booleanValue,
  type SkillBaseContext,
  type SkillBasePermission,
  type SkillRipgrepProvider,
} from "../_shared/skillCore.js";
import type { SkillToolResult } from "../_shared/baseToolAdapter.js";

export type SkillRipgrepTarget = {
  query: string;
  registryRoot: string;
  skillId?: string;
  fileGlob?: string;
  maxResults: number;
  literal: boolean;
  caseSensitive: boolean;
  includeHidden: boolean;
  multiline: boolean;
  contextLines: number;
};

export type SkillRipgrepRequest = {
  target?: unknown;
  context?: SkillBaseContext;
  provider?: SkillRipgrepProvider;
};

export type SkillRipgrepErrorCode =
  | "MISSING_QUERY"
  | "MISSING_REGISTRY_ROOT"
  | "INVALID_SKILL_ID"
  | "INVALID_MAX_RESULTS"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type SkillRipgrepOutput = {
  kind: "agentCore.basicTool.skill.ripgrep.output";
  target: SkillRipgrepTarget;
  runtimeEntry: {
    port: "BaseToolExecutorPort.search.ripgrep";
    runtimeOwnsSearch: true;
  };
  ripgrepEnvelope: {
    commandPreview: readonly string[];
    searchRoot: string;
    matches: readonly { path: string; line: number; column?: number; text: string }[];
    exitCode?: number;
    stderr?: string;
  };
  dryRun: boolean;
  executionBlocked: boolean;
  permissionsRequired: readonly SkillBasePermission[];
  unsafeSideEffects: false;
};

export type SkillRipgrepResult = SkillToolResult<SkillRipgrepOutput, SkillRipgrepErrorCode>;

export const skillRipgrepDescriptor = {
  toolId: "skill.ripgrep",
  capability: "ripgrep-skill-registry",
  defaultDryRun: true,
  permissionsRequired: ["skill:read", "filesystem:read"] as const,
  maxResultLimit: 500,
} as const;

function normalizeTarget(target: unknown, context: SkillBaseContext | undefined): SkillRipgrepTarget | SkillRipgrepResult {
  if (!isRecord(target)) return failure("skill.ripgrep", "MISSING_QUERY", "skill.ripgrep requires target.query", "input", context);
  const query = stringValue(target.query);
  if (query === undefined) return failure("skill.ripgrep", "MISSING_QUERY", "skill.ripgrep requires target.query", "input", context);
  const rawRegistryRoot = stringValue(target.registryRoot) ?? stringValue(target.directoryPath) ?? stringValue(target.skillRoot);
  if (rawRegistryRoot === undefined) return failure("skill.ripgrep", "MISSING_REGISTRY_ROOT", "skill.ripgrep requires target.registryRoot", "input", context);
  const registryRoot = rawRegistryRoot.startsWith("/") || context?.workspaceRoot === undefined
    ? rawRegistryRoot
    : joinPath(context.workspaceRoot, rawRegistryRoot);
  if (!isInsideAllowedRoots(registryRoot, context?.allowedRoots)) {
    return failure("skill.ripgrep", "SCOPE_REJECTED", "skill.ripgrep registryRoot is outside allowed roots", "scope", context, registryRoot);
  }
  const skillId = stringValue(target.skillId);
  if (skillId !== undefined && !isSafeSkillName(skillId)) {
    return failure("skill.ripgrep", "INVALID_SKILL_ID", "skill.ripgrep skillId must be a safe skill identifier", "input", context, skillId);
  }
  if (!isAllowedSkillId(skillId, context?.allowedSkillIds)) {
    return failure("skill.ripgrep", "SCOPE_REJECTED", "skill.ripgrep skillId is outside allowed skill ids", "scope", context, skillId);
  }
  const maxResults = integerValue(target.maxResults) ?? 50;
  if (maxResults < 1 || maxResults > skillRipgrepDescriptor.maxResultLimit) {
    return failure("skill.ripgrep", "INVALID_MAX_RESULTS", `skill.ripgrep maxResults must be 1-${skillRipgrepDescriptor.maxResultLimit}`, "resource", context, skillId ?? registryRoot);
  }
  return {
    query,
    registryRoot,
    skillId,
    fileGlob: stringValue(target.fileGlob),
    maxResults,
    literal: booleanValue(target.literal) ?? false,
    caseSensitive: booleanValue(target.caseSensitive) ?? false,
    includeHidden: booleanValue(target.includeHidden) ?? false,
    multiline: booleanValue(target.multiline) ?? false,
    contextLines: integerValue(target.contextLines) ?? 0,
  };
}

function commandPreview(target: SkillRipgrepTarget, searchRoot: string): readonly string[] {
  return ["rg", "--json", "--max-count", String(target.maxResults), target.caseSensitive ? "--case-sensitive" : "--ignore-case", target.query, searchRoot];
}

export async function executeSkillRipgrep(request: SkillRipgrepRequest = {}): Promise<SkillRipgrepResult> {
  const context = request.context;
  const target = normalizeTarget(request.target, context);
  if (!("query" in target)) return target;
  const targetRef = target.skillId ?? target.registryRoot;
  const searchRoot = target.skillId === undefined ? target.registryRoot : joinPath(target.registryRoot, target.skillId);
  const permissionFailure = ensurePermissions<SkillRipgrepOutput, SkillRipgrepErrorCode>("skill.ripgrep", skillRipgrepDescriptor.permissionsRequired, context, targetRef);
  if (permissionFailure !== undefined) return permissionFailure;
  const command = commandPreview(target, searchRoot);

  if (context?.dryRun !== false) {
    return {
      ok: true,
      toolId: "skill.ripgrep",
      output: {
        kind: "agentCore.basicTool.skill.ripgrep.output",
        target,
        runtimeEntry: { port: "BaseToolExecutorPort.search.ripgrep", runtimeOwnsSearch: true },
        ripgrepEnvelope: { commandPreview: command, searchRoot, matches: [] },
        dryRun: true,
        executionBlocked: true,
        permissionsRequired: skillRipgrepDescriptor.permissionsRequired,
        unsafeSideEffects: false,
      },
      audit: [createAuditEvent("skill.ripgrep", "agentCore.basicTool.skill.ripgrep.dryRun", context, targetRef)],
      events: ["basicTool.skill.ripgrep.dryRun"],
    };
  }

  if (request.provider?.ripgrep === undefined) {
    return failure("skill.ripgrep", "PROVIDER_UNAVAILABLE", "skill.ripgrep requires runtime search.ripgrep for real execution", "provider", context, targetRef);
  }
  try {
    const result = await request.provider.ripgrep({
      command,
      query: target.query,
      directoryPath: searchRoot,
      fileGlob: target.fileGlob,
      maxMatches: target.maxResults,
      literal: target.literal,
      caseSensitive: target.caseSensitive,
      includeHidden: target.includeHidden,
      multiline: target.multiline,
      contextLines: target.contextLines,
      context: context?.auditMetadata,
    });
    return {
      ok: true,
      toolId: "skill.ripgrep",
      output: {
        kind: "agentCore.basicTool.skill.ripgrep.output",
        target,
        runtimeEntry: { port: "BaseToolExecutorPort.search.ripgrep", runtimeOwnsSearch: true },
        ripgrepEnvelope: { commandPreview: command, searchRoot, matches: result.matches, exitCode: result.exitCode, stderr: result.stderr },
        dryRun: false,
        executionBlocked: false,
        permissionsRequired: skillRipgrepDescriptor.permissionsRequired,
        unsafeSideEffects: false,
      },
      audit: [createAuditEvent("skill.ripgrep", "agentCore.basicTool.skill.ripgrep.executed", context, targetRef)],
      events: ["basicTool.skill.ripgrep.executed"],
    };
  } catch {
    return failure("skill.ripgrep", "PROVIDER_REJECTED", "skill.ripgrep provider failed while searching skills", "provider", context, targetRef);
  }
}

export const planSkillRipgrep = executeSkillRipgrep;
