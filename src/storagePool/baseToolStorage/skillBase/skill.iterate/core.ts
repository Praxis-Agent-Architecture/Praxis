import {
  createAuditEvent,
  ensurePermissions,
  ensureRealExecutionAllowed,
  failure,
  isInsideAllowedRoots,
  isRecord,
  joinPath,
  relativeSkillPath,
  stringValue,
  type SkillBaseContext,
  type SkillBasePermission,
  type SkillFilesystemProvider,
} from "../_shared/skillCore.js";
import type { SkillToolResult } from "../_shared/baseToolAdapter.js";

export type SkillIterationOperationKind = "replace-file" | "append" | "prepend" | "replace-text";

export type SkillIterationOperation = {
  kind: SkillIterationOperationKind;
  relativePath: string;
  summary: string;
  content?: string;
  search?: string;
  replace?: string;
};

export type SkillIterateTarget = {
  skillPath: string;
  changeIntent: string;
  operations: readonly SkillIterationOperation[];
};

export type SkillIterateRequest = {
  target?: unknown;
  context?: SkillBaseContext;
  provider?: SkillFilesystemProvider;
};

export type SkillIterateErrorCode =
  | "MISSING_SKILL_PATH"
  | "UNSAFE_SKILL_PATH"
  | "SKILL_ROOT_OUTSIDE_SCOPE"
  | "MISSING_CHANGE_INTENT"
  | "MISSING_OPERATIONS"
  | "TOO_MANY_OPERATIONS"
  | "INVALID_OPERATION"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type SkillIterateOutput = {
  kind: "agentCore.basicTool.skill.iterate.output";
  target: SkillIterateTarget;
  runtimeEntry: {
    port: "BaseToolExecutorPort.filesystem.readText/writeText";
    runtimeOwnsFilesystem: true;
  };
  iterationEnvelope: {
    patchModel: "skill-iteration-patch-v1";
    affectedFiles: readonly string[];
    appliedFiles?: readonly string[];
  };
  dryRun: boolean;
  executionBlocked: boolean;
  permissionsRequired: readonly SkillBasePermission[];
  unsafeSideEffects: true;
};

export type SkillIterateResult = SkillToolResult<SkillIterateOutput, SkillIterateErrorCode>;

export const skillIterateDescriptor = {
  toolId: "skill.iterate",
  capability: "iterate-skill",
  defaultDryRun: true,
  permissionsRequired: ["skill:read", "skill:write", "filesystem:read", "filesystem:write"] as const,
  maxOperations: 24,
} as const;

const supportedKinds = new Set(["replace-file", "append", "prepend", "replace-text"]);

function normalizeOperationKind(value: unknown): SkillIterationOperationKind | undefined {
  const kind = stringValue(value);
  if (kind === undefined) return undefined;
  if (kind === "replace" || kind === "replaceText") return "replace-text";
  if (kind === "overwrite" || kind === "write" || kind === "replaceFile") return "replace-file";
  return supportedKinds.has(kind) ? kind as SkillIterationOperationKind : undefined;
}

function normalizeOperationPath(value: unknown, skillPath: string): string | undefined {
  const rawPath = stringValue(value) ?? "SKILL.md";
  const skillDirName = skillPath.split("/").filter((segment) => segment.length > 0).at(-1);
  const withoutDotPrefix = rawPath.startsWith("./") ? rawPath.slice(2) : rawPath;
  if (skillDirName !== undefined && withoutDotPrefix.startsWith(`${skillDirName}/`)) {
    return withoutDotPrefix.slice(skillDirName.length + 1);
  }
  return withoutDotPrefix;
}

function normalizeOperation(value: unknown, defaultSummary: string, skillPath: string): SkillIterationOperation | undefined {
  if (!isRecord(value)) return undefined;
  const kind = normalizeOperationKind(value.kind ?? value.type ?? value.action);
  const relativePath = normalizeOperationPath(value.relativePath ?? value.path ?? value.file, skillPath);
  const summary = stringValue(value.summary) ?? defaultSummary;
  if (kind === undefined || relativePath === undefined || !relativeSkillPath(relativePath)) {
    return undefined;
  }
  return {
    kind,
    relativePath,
    summary,
    content: typeof value.content === "string" ? value.content : undefined,
    search: typeof value.search === "string" ? value.search : undefined,
    replace: typeof value.replace === "string" ? value.replace : undefined,
  };
}

function normalizeTarget(target: unknown, context: SkillBaseContext | undefined): SkillIterateTarget | SkillIterateResult {
  if (!isRecord(target)) return failure("skill.iterate", "MISSING_SKILL_PATH", "skill.iterate requires target.skillPath", "input", context);
  const skillPath = stringValue(target.skillPath);
  if (skillPath === undefined) return failure("skill.iterate", "MISSING_SKILL_PATH", "skill.iterate requires target.skillPath", "input", context);
  if (skillPath.includes("\0") || skillPath.split("/").includes("..")) {
    return failure("skill.iterate", "UNSAFE_SKILL_PATH", "skill.iterate skillPath must not contain traversal or NUL", "scope", context, skillPath);
  }
  if (!isInsideAllowedRoots(skillPath, context?.allowedRoots)) {
    return failure("skill.iterate", "SKILL_ROOT_OUTSIDE_SCOPE", "skill.iterate skillPath is outside allowed roots", "scope", context, skillPath);
  }
  const changeIntent = stringValue(target.changeIntent);
  if (changeIntent === undefined) return failure("skill.iterate", "MISSING_CHANGE_INTENT", "skill.iterate requires target.changeIntent", "input", context, skillPath);
  const rawOperations = Array.isArray(target.operations) ? target.operations : [];
  if (rawOperations.length === 0) return failure("skill.iterate", "MISSING_OPERATIONS", "skill.iterate requires target.operations", "input", context, skillPath);
  if (rawOperations.length > skillIterateDescriptor.maxOperations) {
    return failure("skill.iterate", "TOO_MANY_OPERATIONS", "skill.iterate requested too many operations", "resource", context, skillPath);
  }
  const operations = rawOperations.map((operation) => normalizeOperation(operation, changeIntent, skillPath));
  if (operations.some((operation) => operation === undefined)) {
    return failure("skill.iterate", "INVALID_OPERATION", "skill.iterate operations must use supported kind, safe relativePath, and summary", "input", context, skillPath);
  }
  return { skillPath, changeIntent, operations: operations as SkillIterationOperation[] };
}

function applyOperation(current: string, operation: SkillIterationOperation): string {
  if (operation.kind === "replace-file") return operation.content ?? "";
  if (operation.kind === "append") return `${current}${operation.content ?? ""}`;
  if (operation.kind === "prepend") return `${operation.content ?? ""}${current}`;
  if (operation.search === undefined) return current;
  return current.replace(operation.search, operation.replace ?? "");
}

export async function executeSkillIterate(request: SkillIterateRequest = {}): Promise<SkillIterateResult> {
  const context = request.context;
  const target = normalizeTarget(request.target, context);
  if (!("skillPath" in target)) return target;
  const affectedFiles = target.operations.map((operation) => joinPath(target.skillPath, operation.relativePath));

  const realExecutionFailure = ensureRealExecutionAllowed<SkillIterateOutput, SkillIterateErrorCode>("skill.iterate", context, target.skillPath);
  if (realExecutionFailure !== undefined) return realExecutionFailure;
  const permissionFailure = ensurePermissions<SkillIterateOutput, SkillIterateErrorCode>("skill.iterate", skillIterateDescriptor.permissionsRequired, context, target.skillPath);
  if (permissionFailure !== undefined) return permissionFailure;

  if (context?.dryRun !== false) {
    return {
      ok: true,
      toolId: "skill.iterate",
      output: {
        kind: "agentCore.basicTool.skill.iterate.output",
        target,
        runtimeEntry: { port: "BaseToolExecutorPort.filesystem.readText/writeText", runtimeOwnsFilesystem: true },
        iterationEnvelope: { patchModel: "skill-iteration-patch-v1", affectedFiles },
        dryRun: true,
        executionBlocked: true,
        permissionsRequired: skillIterateDescriptor.permissionsRequired,
        unsafeSideEffects: true,
      },
      audit: [createAuditEvent("skill.iterate", "agentCore.basicTool.skill.iterate.dryRun", context, target.skillPath)],
      events: ["basicTool.skill.iterate.dryRun"],
    };
  }

  if (request.provider?.readText === undefined || request.provider.writeText === undefined) {
    return failure("skill.iterate", "PROVIDER_UNAVAILABLE", "skill.iterate requires runtime filesystem.readText/writeText", "provider", context, target.skillPath);
  }
  try {
    const appliedFiles: string[] = [];
    for (const operation of target.operations) {
      const targetPath = joinPath(target.skillPath, operation.relativePath);
      const current = operation.kind === "replace-file" ? { content: "", truncated: false } : await request.provider.readText({ path: targetPath, encoding: "utf8" });
      await request.provider.writeText({ path: targetPath, content: applyOperation(current.content, operation), encoding: "utf8" });
      appliedFiles.push(targetPath);
    }
    return {
      ok: true,
      toolId: "skill.iterate",
      output: {
        kind: "agentCore.basicTool.skill.iterate.output",
        target,
        runtimeEntry: { port: "BaseToolExecutorPort.filesystem.readText/writeText", runtimeOwnsFilesystem: true },
        iterationEnvelope: { patchModel: "skill-iteration-patch-v1", affectedFiles, appliedFiles },
        dryRun: false,
        executionBlocked: false,
        permissionsRequired: skillIterateDescriptor.permissionsRequired,
        unsafeSideEffects: true,
      },
      audit: [createAuditEvent("skill.iterate", "agentCore.basicTool.skill.iterate.executed", context, target.skillPath, { appliedFiles })],
      events: ["basicTool.skill.iterate.executed"],
    };
  } catch (error) {
    const reason = error instanceof Error && error.message.trim().length > 0 ? `: ${error.message}` : "";
    return failure("skill.iterate", "PROVIDER_REJECTED", `skill.iterate provider failed while applying operations${reason}`, "provider", context, target.skillPath);
  }
}

export const planSkillIteration = executeSkillIterate;
