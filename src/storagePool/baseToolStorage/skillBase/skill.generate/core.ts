import {
  buildSkillMarkdown,
  createAuditEvent,
  ensurePermissions,
  ensureRealExecutionAllowed,
  failure,
  isInsideAllowedRoots,
  isRecord,
  isSafeSkillDirectoryName,
  joinPath,
  relativeSkillPath,
  stringArrayValue,
  stringValue,
  type SkillBaseContext,
  type SkillBasePermission,
  type SkillFilesystemProvider,
} from "../_shared/skillCore.js";
import type { SkillToolResult } from "../_shared/baseToolAdapter.js";

export type SkillGenerateFileKind = "instruction" | "script" | "template" | "example" | "metadata" | "reference" | "asset";

export type SkillGenerateRequestedFile = {
  path: string;
  kind: SkillGenerateFileKind;
  purpose?: string;
  content?: string;
};

export type SkillGenerateTarget = {
  skillName: string;
  purpose: string;
  destinationRoot: string;
  description?: string;
  files: readonly SkillGenerateRequestedFile[];
  tags: readonly string[];
};

export type SkillGenerateRequest = {
  target?: unknown;
  context?: SkillBaseContext;
  provider?: SkillFilesystemProvider;
};

export type SkillGenerateErrorCode =
  | "MISSING_SKILL_NAME"
  | "INVALID_SKILL_NAME"
  | "MISSING_PURPOSE"
  | "MISSING_DESTINATION_ROOT"
  | "UNSAFE_SKILL_PATH"
  | "SKILL_ROOT_OUTSIDE_SCOPE"
  | "INVALID_REQUESTED_FILE"
  | "TOO_MANY_FILES"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type SkillGenerateOutput = {
  kind: "agentCore.basicTool.skill.generate.output";
  target: SkillGenerateTarget;
  runtimeEntry: {
    port: "BaseToolExecutorPort.filesystem.writeText";
    runtimeOwnsFilesystem: true;
  };
  generationEnvelope: {
    scaffoldVersion: "skill-scaffold-v1";
    skillDirectory: string;
    fileCount: number;
    wouldWriteFiles: readonly string[];
    writtenFiles?: readonly string[];
  };
  dryRun: boolean;
  executionBlocked: boolean;
  permissionsRequired: readonly SkillBasePermission[];
  unsafeSideEffects: true;
};

export type SkillGenerateResult = SkillToolResult<SkillGenerateOutput, SkillGenerateErrorCode>;

export const skillGenerateDescriptor = {
  toolId: "skill.generate",
  capability: "generate-skill",
  defaultDryRun: true,
  permissionsRequired: ["skill:write", "filesystem:write"] as const,
  defaultFiles: [{ path: "SKILL.md", kind: "instruction" as const }],
  maxRequestedFiles: 32,
} as const;

const supportedFileKinds = new Set(["instruction", "script", "template", "example", "metadata", "reference", "asset"]);

function normalizeFile(value: unknown): SkillGenerateRequestedFile | undefined {
  if (!isRecord(value)) return undefined;
  const filePath = stringValue(value.path);
  const kind = stringValue(value.kind) ?? "instruction";
  if (filePath === undefined || !relativeSkillPath(filePath) || !supportedFileKinds.has(kind)) return undefined;
  return {
    path: filePath,
    kind: kind as SkillGenerateFileKind,
    purpose: stringValue(value.purpose),
    content: typeof value.content === "string" ? value.content : undefined,
  };
}

function normalizeTarget(target: unknown, context: SkillBaseContext | undefined): SkillGenerateTarget | SkillGenerateResult {
  if (!isRecord(target)) return failure("skill.generate", "MISSING_SKILL_NAME", "skill.generate requires target.skillName", "input", context);
  const skillName = stringValue(target.skillName);
  if (skillName === undefined) return failure("skill.generate", "MISSING_SKILL_NAME", "skill.generate requires target.skillName", "input", context);
  if (!isSafeSkillDirectoryName(skillName)) {
    return failure("skill.generate", "INVALID_SKILL_NAME", "skill.generate target.skillName must be a safe lowercase skill directory name", "input", context, skillName);
  }
  const purpose = stringValue(target.purpose);
  if (purpose === undefined) return failure("skill.generate", "MISSING_PURPOSE", "skill.generate requires target.purpose", "input", context, skillName);
  const destinationRoot = stringValue(target.destinationRoot);
  if (destinationRoot === undefined) return failure("skill.generate", "MISSING_DESTINATION_ROOT", "skill.generate requires target.destinationRoot", "input", context, skillName);
  if (!isInsideAllowedRoots(destinationRoot, context?.allowedRoots)) {
    return failure("skill.generate", "SKILL_ROOT_OUTSIDE_SCOPE", "skill.generate destinationRoot is outside allowed roots", "scope", context, skillName);
  }
  const rawFiles = Array.isArray(target.files) ? target.files : skillGenerateDescriptor.defaultFiles;
  if (rawFiles.length > skillGenerateDescriptor.maxRequestedFiles) {
    return failure("skill.generate", "TOO_MANY_FILES", "skill.generate requested too many files", "resource", context, skillName);
  }
  const files = rawFiles.map(normalizeFile);
  if (files.some((file) => file === undefined)) {
    return failure("skill.generate", "INVALID_REQUESTED_FILE", "skill.generate files must use safe relative paths and supported kinds", "input", context, skillName);
  }
  const normalizedFiles = files as SkillGenerateRequestedFile[];
  if (!normalizedFiles.some((file) => file.path === "SKILL.md")) {
    normalizedFiles.unshift({ path: "SKILL.md", kind: "instruction", purpose: "entrypoint" });
  }
  return {
    skillName,
    purpose,
    destinationRoot,
    description: stringValue(target.description),
    files: normalizedFiles,
    tags: stringArrayValue(target.tags) ?? [],
  };
}

function contentForFile(target: SkillGenerateTarget, file: SkillGenerateRequestedFile): string {
  if (file.content !== undefined) return file.content;
  if (file.path === "SKILL.md") {
    return buildSkillMarkdown(target.skillName, target.description ?? target.purpose, target.purpose, target.tags);
  }
  return `# ${file.path}\n\n${file.purpose ?? "Generated skill support file."}\n`;
}

export async function executeSkillGenerate(request: SkillGenerateRequest = {}): Promise<SkillGenerateResult> {
  const context = request.context;
  const target = normalizeTarget(request.target, context);
  if (!("skillName" in target)) return target;
  const skillDirectory = joinPath(target.destinationRoot, target.skillName);
  const wouldWriteFiles = target.files.map((file) => joinPath(skillDirectory, file.path));

  const realExecutionFailure = ensureRealExecutionAllowed<SkillGenerateOutput, SkillGenerateErrorCode>("skill.generate", context, target.skillName);
  if (realExecutionFailure !== undefined) return realExecutionFailure;
  const permissionFailure = ensurePermissions<SkillGenerateOutput, SkillGenerateErrorCode>("skill.generate", skillGenerateDescriptor.permissionsRequired, context, target.skillName);
  if (permissionFailure !== undefined) return permissionFailure;

  if (context?.dryRun !== false) {
    return {
      ok: true,
      toolId: "skill.generate",
      output: {
        kind: "agentCore.basicTool.skill.generate.output",
        target,
        runtimeEntry: { port: "BaseToolExecutorPort.filesystem.writeText", runtimeOwnsFilesystem: true },
        generationEnvelope: { scaffoldVersion: "skill-scaffold-v1", skillDirectory, fileCount: target.files.length, wouldWriteFiles },
        dryRun: true,
        executionBlocked: true,
        permissionsRequired: skillGenerateDescriptor.permissionsRequired,
        unsafeSideEffects: true,
      },
      audit: [createAuditEvent("skill.generate", "agentCore.basicTool.skill.generate.dryRun", context, target.skillName)],
      events: ["basicTool.skill.generate.dryRun"],
    };
  }

  if (request.provider?.writeText === undefined) {
    return failure("skill.generate", "PROVIDER_UNAVAILABLE", "skill.generate requires runtime filesystem.writeText for real execution", "provider", context, target.skillName);
  }
  try {
    const writtenFiles: string[] = [];
    for (const file of target.files) {
      const targetPath = joinPath(skillDirectory, file.path);
      await request.provider.writeText({ path: targetPath, content: contentForFile(target, file), encoding: "utf8" });
      writtenFiles.push(targetPath);
    }
    return {
      ok: true,
      toolId: "skill.generate",
      output: {
        kind: "agentCore.basicTool.skill.generate.output",
        target,
        runtimeEntry: { port: "BaseToolExecutorPort.filesystem.writeText", runtimeOwnsFilesystem: true },
        generationEnvelope: { scaffoldVersion: "skill-scaffold-v1", skillDirectory, fileCount: target.files.length, wouldWriteFiles, writtenFiles },
        dryRun: false,
        executionBlocked: false,
        permissionsRequired: skillGenerateDescriptor.permissionsRequired,
        unsafeSideEffects: true,
      },
      audit: [createAuditEvent("skill.generate", "agentCore.basicTool.skill.generate.executed", context, target.skillName, { writtenFiles })],
      events: ["basicTool.skill.generate.executed"],
    };
  } catch (error) {
    const reason = error instanceof Error && error.message.trim().length > 0 ? `: ${error.message}` : "";
    return failure("skill.generate", "PROVIDER_REJECTED", `skill.generate provider failed while writing skill files${reason}`, "provider", context, target.skillName);
  }
}

export const planSkillGeneration = executeSkillGenerate;
