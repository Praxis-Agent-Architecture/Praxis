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
  listSkillResources,
  parseSkillFrontmatter,
  stringValue,
  type SkillBaseContext,
  type SkillBasePermission,
  type SkillFilesystemProvider,
  type SkillResourceIndex,
} from "../_shared/skillCore.js";
import type { SkillToolResult } from "../_shared/baseToolAdapter.js";

export type SkillManagementAction =
  | "list"
  | "inspect"
  | "activate"
  | "load"
  | "enable"
  | "disable"
  | "install"
  | "link"
  | "reload";

export type SkillManagementTarget = {
  action: SkillManagementAction;
  skillId?: string;
  registryRoot?: string;
  sourcePath?: string;
  metadataPatch?: Readonly<Record<string, unknown>>;
};

export type SkillManagementRequest = {
  target?: unknown;
  context?: SkillBaseContext;
  provider?: SkillFilesystemProvider;
};

export type SkillManagementErrorCode =
  | "MISSING_ACTION"
  | "INVALID_ACTION"
  | "MISSING_SKILL_ID"
  | "INVALID_SKILL_ID"
  | "MISSING_REGISTRY_ROOT"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type SkillManagementOutput = {
  kind: "agentCore.basicTool.skill.management.output";
  target: SkillManagementTarget;
  runtimeEntry: {
    port: "BaseToolExecutorPort.filesystem.readText/list/writeText";
    runtimeOwnsFilesystem: true;
  };
  managementEnvelope: {
    action: SkillManagementAction;
    affectedSkillIds: readonly string[];
    registryRoot?: string;
    skillRoot?: string;
    metadataKeys: readonly string[];
    skill?: {
      name: string;
      description: string;
      skillPath: string;
      body?: string;
      resourceIndex?: SkillResourceIndex;
      modelInstructionEnvelope?: string;
    };
    registryEntries?: readonly string[];
  };
  dryRun: boolean;
  executionBlocked: boolean;
  permissionsRequired: readonly SkillBasePermission[];
  unsafeSideEffects: boolean;
};

export type SkillManagementResult = SkillToolResult<SkillManagementOutput, SkillManagementErrorCode>;

export const skillManagementDescriptor = {
  toolId: "skill.management",
  capability: "manage-skill",
  defaultDryRun: true,
  permissionsByAction: {
    list: ["skill:read", "filesystem:read"],
    inspect: ["skill:read", "filesystem:read"],
    activate: ["skill:read", "filesystem:read"],
    load: ["skill:read", "filesystem:read"],
    enable: ["skill:read", "skill:write", "filesystem:write"],
    disable: ["skill:read", "skill:write", "filesystem:write"],
    install: ["skill:read", "skill:write", "filesystem:write"],
    link: ["skill:read", "skill:write", "filesystem:write"],
    reload: ["skill:read", "filesystem:read"],
  } satisfies Record<SkillManagementAction, readonly SkillBasePermission[]>,
} as const;

const actions = new Set<SkillManagementAction>(["list", "inspect", "activate", "load", "enable", "disable", "install", "link", "reload"]);
const skillIdActions = new Set<SkillManagementAction>(["inspect", "activate", "load", "enable", "disable", "install", "link"]);
const writeActions = new Set<SkillManagementAction>(["enable", "disable", "install", "link"]);

function permissionsForAction(action: SkillManagementAction): readonly SkillBasePermission[] {
  return skillManagementDescriptor.permissionsByAction[action];
}

function normalizeTarget(target: unknown, context: SkillBaseContext | undefined): SkillManagementTarget | SkillManagementResult {
  if (!isRecord(target)) return failure("skill.management", "MISSING_ACTION", "skill.management requires target.action", "input", context);
  const action = stringValue(target.action) as SkillManagementAction | undefined;
  if (action === undefined) return failure("skill.management", "MISSING_ACTION", "skill.management requires target.action", "input", context);
  if (!actions.has(action)) {
    return failure("skill.management", "INVALID_ACTION", "skill.management action must be list, inspect, activate, load, enable, disable, install, link, or reload", "input", context);
  }
  const skillId = stringValue(target.skillId);
  if (skillIdActions.has(action) && skillId === undefined) {
    return failure("skill.management", "MISSING_SKILL_ID", `skill.management action ${action} requires target.skillId`, "input", context);
  }
  if (skillId !== undefined && !isSafeSkillName(skillId)) {
    return failure("skill.management", "INVALID_SKILL_ID", "skill.management skillId must be a safe skill identifier", "input", context, skillId);
  }
  if (!isAllowedSkillId(skillId, context?.allowedSkillIds)) {
    return failure("skill.management", "SCOPE_REJECTED", "skill.management skillId is outside allowed skill ids", "scope", context, skillId);
  }
  const registryRoot = stringValue(target.registryRoot);
  if (registryRoot === undefined) {
    return failure("skill.management", "MISSING_REGISTRY_ROOT", "skill.management requires target.registryRoot", "input", context, skillId);
  }
  if (!isInsideAllowedRoots(registryRoot, context?.allowedRoots)) {
    return failure("skill.management", "SCOPE_REJECTED", "skill.management registryRoot is outside allowed roots", "scope", context, skillId ?? registryRoot);
  }
  return {
    action,
    skillId,
    registryRoot,
    sourcePath: stringValue(target.sourcePath),
    metadataPatch: isRecord(target.metadataPatch) ? target.metadataPatch : undefined,
  };
}

function skillRoot(target: SkillManagementTarget): string | undefined {
  return target.skillId === undefined || target.registryRoot === undefined ? undefined : joinPath(target.registryRoot, target.skillId);
}

async function readSkill(target: SkillManagementTarget, provider: SkillFilesystemProvider | undefined): Promise<SkillManagementOutput["managementEnvelope"]["skill"] | undefined> {
  const root = skillRoot(target);
  if (root === undefined || target.skillId === undefined || provider?.readText === undefined) return undefined;
  const skillPath = joinPath(root, "SKILL.md");
  const read = await provider.readText({ path: skillPath, encoding: "utf8", maxBytes: 250_000 });
  const frontmatter = parseSkillFrontmatter(read.content, target.skillId);
  const resourceIndex = await listSkillResources(provider, root);
  const modelInstructionEnvelope = `<activated_skill>\n<name>${frontmatter.name}</name>\n<path>${skillPath}</path>\n<content>\n${read.content}\n</content>\n</activated_skill>`;
  return {
    name: frontmatter.name,
    description: frontmatter.description,
    skillPath,
    body: read.content,
    resourceIndex,
    modelInstructionEnvelope: target.action === "activate" || target.action === "load" ? modelInstructionEnvelope : undefined,
  };
}

export async function executeSkillManagement(request: SkillManagementRequest = {}): Promise<SkillManagementResult> {
  const context = request.context;
  const target = normalizeTarget(request.target, context);
  if (!("action" in target)) return target;
  const targetRef = target.skillId ?? target.registryRoot;
  const requiredPermissions = permissionsForAction(target.action);

  const realExecutionFailure = ensureRealExecutionAllowed<SkillManagementOutput, SkillManagementErrorCode>("skill.management", context, targetRef);
  if (realExecutionFailure !== undefined) return realExecutionFailure;
  const permissionFailure = ensurePermissions<SkillManagementOutput, SkillManagementErrorCode>("skill.management", requiredPermissions, context, targetRef);
  if (permissionFailure !== undefined) return permissionFailure;

  const skillRootPath = skillRoot(target);
  if (context?.dryRun !== false) {
    return {
      ok: true,
      toolId: "skill.management",
      output: {
        kind: "agentCore.basicTool.skill.management.output",
        target,
        runtimeEntry: { port: "BaseToolExecutorPort.filesystem.readText/list/writeText", runtimeOwnsFilesystem: true },
        managementEnvelope: {
          action: target.action,
          affectedSkillIds: target.skillId === undefined ? [] : [target.skillId],
          registryRoot: target.registryRoot,
          skillRoot: skillRootPath,
          metadataKeys: Object.keys(target.metadataPatch ?? {}),
        },
        dryRun: true,
        executionBlocked: true,
        permissionsRequired: requiredPermissions,
        unsafeSideEffects: writeActions.has(target.action),
      },
      audit: [createAuditEvent("skill.management", "agentCore.basicTool.skill.management.dryRun", context, targetRef)],
      events: ["basicTool.skill.management.dryRun"],
    };
  }

  try {
    let skill: SkillManagementOutput["managementEnvelope"]["skill"];
    let registryEntries: readonly string[] | undefined;
    if (target.action === "list" || target.action === "reload") {
      if (request.provider?.list === undefined) {
        return failure("skill.management", "PROVIDER_UNAVAILABLE", "skill.management requires runtime filesystem.list for list/reload", "provider", context, targetRef);
      }
      registryEntries = (await request.provider.list({ path: target.registryRoot!, depth: 2, maxEntries: 500, includeGlobs: ["*/SKILL.md", "SKILL.md"] })).entries;
    } else if (target.action === "inspect" || target.action === "activate" || target.action === "load") {
      if (request.provider?.readText === undefined) {
        return failure("skill.management", "PROVIDER_UNAVAILABLE", "skill.management requires runtime filesystem.readText for inspect/activate/load", "provider", context, targetRef);
      }
      skill = await readSkill(target, request.provider);
    } else {
      if (request.provider?.writeText === undefined) {
        return failure("skill.management", "PROVIDER_UNAVAILABLE", "skill.management requires runtime filesystem.writeText for write actions", "provider", context, targetRef);
      }
      const recordPath = joinPath(target.registryRoot!, ".skill-state", `${target.skillId}.${target.action}.json`);
      await request.provider.writeText({
        path: recordPath,
        encoding: "utf8",
        content: JSON.stringify({ action: target.action, skillId: target.skillId, sourcePath: target.sourcePath, metadataPatch: target.metadataPatch ?? {} }, null, 2),
      });
    }
    return {
      ok: true,
      toolId: "skill.management",
      output: {
        kind: "agentCore.basicTool.skill.management.output",
        target,
        runtimeEntry: { port: "BaseToolExecutorPort.filesystem.readText/list/writeText", runtimeOwnsFilesystem: true },
        managementEnvelope: {
          action: target.action,
          affectedSkillIds: target.skillId === undefined ? [] : [target.skillId],
          registryRoot: target.registryRoot,
          skillRoot: skillRootPath,
          metadataKeys: Object.keys(target.metadataPatch ?? {}),
          skill,
          registryEntries,
        },
        dryRun: false,
        executionBlocked: false,
        permissionsRequired: requiredPermissions,
        unsafeSideEffects: writeActions.has(target.action),
      },
      audit: [createAuditEvent("skill.management", "agentCore.basicTool.skill.management.executed", context, targetRef)],
      events: ["basicTool.skill.management.executed"],
    };
  } catch {
    return failure("skill.management", "PROVIDER_REJECTED", "skill.management provider failed while executing action", "provider", context, targetRef);
  }
}

export const planSkillManagement = executeSkillManagement;
