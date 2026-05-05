import {
  createAuditEvent,
  ensurePermissions,
  ensureRealExecutionAllowed,
  failure,
  isAllowedSkillId,
  isInsideAllowedRoots,
  isRecord,
  isSafeSkillName,
  joinPath,
  stringValue,
  type SkillBaseContext,
  type SkillBasePermission,
  type SkillFilesystemProvider,
} from "../_shared/skillCore.js";
import type { SkillToolResult } from "../_shared/baseToolAdapter.js";

export type SkillRemoveMode = "disable" | "unlink" | "purge";

export type SkillRemoveTarget = {
  skillId: string;
  registryRoot: string;
  mode: SkillRemoveMode;
  reason?: string;
};

export type SkillRemoveRequest = {
  target?: unknown;
  context?: SkillBaseContext;
  provider?: SkillFilesystemProvider;
};

export type SkillRemoveErrorCode =
  | "MISSING_SKILL_ID"
  | "INVALID_SKILL_ID"
  | "MISSING_REGISTRY_ROOT"
  | "INVALID_MODE"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type SkillRemoveOutput = {
  kind: "agentCore.basicTool.skill.remove.output";
  target: SkillRemoveTarget;
  runtimeEntry: {
    port: "BaseToolExecutorPort.filesystem.writeText/deletePath";
    runtimeOwnsFilesystem: true;
  };
  removalEnvelope: {
    action: SkillRemoveMode;
    skillId: string;
    skillRoot: string;
    plannedPath: string;
    deleted?: boolean;
  };
  dryRun: boolean;
  executionBlocked: boolean;
  permissionsRequired: readonly SkillBasePermission[];
  unsafeSideEffects: true;
};

export type SkillRemoveResult = SkillToolResult<SkillRemoveOutput, SkillRemoveErrorCode>;

export const skillRemoveDescriptor = {
  toolId: "skill.remove",
  capability: "remove-skill",
  defaultDryRun: true,
  permissionsRequired: ["skill:write", "filesystem:write"] as const,
} as const;

const modes = new Set<SkillRemoveMode>(["disable", "unlink", "purge"]);

function normalizeTarget(target: unknown, context: SkillBaseContext | undefined): SkillRemoveTarget | SkillRemoveResult {
  if (!isRecord(target)) return failure("skill.remove", "MISSING_SKILL_ID", "skill.remove requires target.skillId", "input", context);
  const skillId = stringValue(target.skillId);
  if (skillId === undefined) return failure("skill.remove", "MISSING_SKILL_ID", "skill.remove requires target.skillId", "input", context);
  if (!isSafeSkillName(skillId)) return failure("skill.remove", "INVALID_SKILL_ID", "skill.remove skillId must be a safe skill identifier", "input", context, skillId);
  if (!isAllowedSkillId(skillId, context?.allowedSkillIds)) {
    return failure("skill.remove", "SCOPE_REJECTED", "skill.remove skillId is outside allowed skill ids", "scope", context, skillId);
  }
  const registryRoot = stringValue(target.registryRoot);
  if (registryRoot === undefined) return failure("skill.remove", "MISSING_REGISTRY_ROOT", "skill.remove requires target.registryRoot", "input", context, skillId);
  if (!isInsideAllowedRoots(registryRoot, context?.allowedRoots)) {
    return failure("skill.remove", "SCOPE_REJECTED", "skill.remove registryRoot is outside allowed roots", "scope", context, skillId);
  }
  const mode = (stringValue(target.mode) ?? "disable") as SkillRemoveMode;
  if (!modes.has(mode)) return failure("skill.remove", "INVALID_MODE", "skill.remove mode must be disable, unlink, or purge", "input", context, skillId);
  return { skillId, registryRoot, mode, reason: stringValue(target.reason) };
}

export async function executeSkillRemove(request: SkillRemoveRequest = {}): Promise<SkillRemoveResult> {
  const context = request.context;
  const target = normalizeTarget(request.target, context);
  if (!("skillId" in target)) return target;
  const skillRoot = joinPath(target.registryRoot, target.skillId);
  const plannedPath = target.mode === "disable" ? joinPath(target.registryRoot, ".skill-state", `${target.skillId}.disable.json`) : skillRoot;

  const realExecutionFailure = ensureRealExecutionAllowed<SkillRemoveOutput, SkillRemoveErrorCode>("skill.remove", context, target.skillId);
  if (realExecutionFailure !== undefined) return realExecutionFailure;
  const permissionFailure = ensurePermissions<SkillRemoveOutput, SkillRemoveErrorCode>("skill.remove", skillRemoveDescriptor.permissionsRequired, context, target.skillId);
  if (permissionFailure !== undefined) return permissionFailure;

  if (context?.dryRun !== false) {
    return {
      ok: true,
      toolId: "skill.remove",
      output: {
        kind: "agentCore.basicTool.skill.remove.output",
        target,
        runtimeEntry: { port: "BaseToolExecutorPort.filesystem.writeText/deletePath", runtimeOwnsFilesystem: true },
        removalEnvelope: { action: target.mode, skillId: target.skillId, skillRoot, plannedPath },
        dryRun: true,
        executionBlocked: true,
        permissionsRequired: skillRemoveDescriptor.permissionsRequired,
        unsafeSideEffects: true,
      },
      audit: [createAuditEvent("skill.remove", "agentCore.basicTool.skill.remove.dryRun", context, target.skillId)],
      events: ["basicTool.skill.remove.dryRun"],
    };
  }

  try {
    let deleted = false;
    if (target.mode === "disable") {
      if (request.provider?.writeText === undefined) {
        return failure("skill.remove", "PROVIDER_UNAVAILABLE", "skill.remove disable requires runtime filesystem.writeText", "provider", context, target.skillId);
      }
      await request.provider.writeText({ path: plannedPath, encoding: "utf8", content: JSON.stringify({ disabled: true, reason: target.reason ?? "" }, null, 2) });
    } else {
      if (request.provider?.deletePath === undefined) {
        return failure("skill.remove", "PROVIDER_UNAVAILABLE", "skill.remove unlink/purge requires runtime filesystem.deletePath", "provider", context, target.skillId);
      }
      deleted = (await request.provider.deletePath({ path: plannedPath, recursive: target.mode === "purge" })).deleted;
    }
    return {
      ok: true,
      toolId: "skill.remove",
      output: {
        kind: "agentCore.basicTool.skill.remove.output",
        target,
        runtimeEntry: { port: "BaseToolExecutorPort.filesystem.writeText/deletePath", runtimeOwnsFilesystem: true },
        removalEnvelope: { action: target.mode, skillId: target.skillId, skillRoot, plannedPath, deleted },
        dryRun: false,
        executionBlocked: false,
        permissionsRequired: skillRemoveDescriptor.permissionsRequired,
        unsafeSideEffects: true,
      },
      audit: [createAuditEvent("skill.remove", "agentCore.basicTool.skill.remove.executed", context, target.skillId)],
      events: ["basicTool.skill.remove.executed"],
    };
  } catch {
    return failure("skill.remove", "PROVIDER_REJECTED", "skill.remove provider failed while removing skill", "provider", context, target.skillId);
  }
}

export const planSkillRemove = executeSkillRemove;
