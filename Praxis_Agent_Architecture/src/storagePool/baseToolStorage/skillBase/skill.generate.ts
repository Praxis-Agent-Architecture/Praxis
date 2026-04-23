/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Skill 基础工具。
 * 核心目的：提供 基础工具集合 / Skill 基础工具 中的“生成 Skill”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type SkillGeneratePermission = "skill:generate" | "filesystem:write" | "filesystem:read";

export type SkillGenerateBoundary = "input" | "scope" | "permission" | "governance" | "contract" | "resource";

export type SkillGenerateContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedSkillRoots?: readonly string[];
  grantedPermissions?: readonly SkillGeneratePermission[];
  guard?: {
    accepted: boolean;
    reason?: string;
  };
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type SkillGenerateFileKind = "instruction" | "script" | "template" | "example" | "metadata";

export type SkillGenerateRequestedFile = {
  path: string;
  kind: SkillGenerateFileKind;
  purpose?: string;
};

export type SkillGenerateTarget = {
  skillName: string;
  purpose: string;
  destinationRoot: string;
  files: readonly SkillGenerateRequestedFile[];
  tags: readonly string[];
};

export type SkillGenerateRequest = {
  target?: Partial<Omit<SkillGenerateTarget, "files" | "tags">> & {
    files?: readonly Partial<SkillGenerateRequestedFile>[];
    tags?: readonly string[];
  };
  context?: SkillGenerateContext;
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
  | "REAL_EXECUTION_BLOCKED";

export type SkillGenerateError = {
  code: SkillGenerateErrorCode;
  message: string;
  boundary: SkillGenerateBoundary;
  publicSafe: true;
  internalDetailExposed: false;
};

export type SkillGenerateAuditEvent = {
  type: string;
  toolId: "skill.generate";
  invocationId: string;
  dryRun: boolean;
  skillName?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type SkillGenerateOutput = {
  kind: "agentCore.basicTool.skill.generate";
  target: SkillGenerateTarget;
  permissionsRequired: readonly SkillGeneratePermission[];
  dryRun: true;
  executionBlocked: true;
  unsafeSideEffects: true;
  generationEnvelope: {
    scaffoldVersion: "skill-scaffold-v1";
    skillDirectory: string;
    fileCount: number;
    wouldWriteFiles: readonly string[];
  };
};

export type SkillGenerateResult =
  | {
      ok: true;
      toolId: "skill.generate";
      output: SkillGenerateOutput;
      audit: readonly SkillGenerateAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "skill.generate";
      error: SkillGenerateError;
      audit: readonly SkillGenerateAuditEvent[];
      events: readonly string[];
    };

export const skillGenerateDescriptor = {
  toolId: "skill.generate",
  capability: "generate-skill",
  route: "agent_executionEngine.basic_toolLayer.baseTools.skillBase",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["skill:generate", "filesystem:write"] as const,
  defaultFiles: [{ path: "SKILL.md", kind: "instruction" }] as const,
  maxRequestedFiles: 24,
} as const;

const supportedFileKinds = ["instruction", "script", "template", "example", "metadata"] as const;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: SkillGenerateContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: SkillGenerateContext | undefined): string {
  return context?.invocationId?.trim() || "skill.generate:dry-run";
}

function auditEvent(
  type: string,
  context: SkillGenerateContext | undefined,
  skillName?: string,
  metadata?: Readonly<Record<string, unknown>>,
): SkillGenerateAuditEvent {
  return {
    type,
    toolId: skillGenerateDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    skillName,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: SkillGenerateErrorCode,
  message: string,
  boundary: SkillGenerateBoundary,
  context: SkillGenerateContext | undefined,
  skillName?: string,
): SkillGenerateResult {
  return {
    ok: false,
    toolId: skillGenerateDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.skill.generate.rejected", context, skillName, { code })],
    events: ["basicTool.skill.generate.rejected"],
  };
}

function normalizeRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/, "");
}

function unsafePath(value: string): boolean {
  return value.includes("\0") || value.split("/").some((segment) => segment === "..");
}

function normalizeSkillName(
  skillName: string | undefined,
  context: SkillGenerateContext | undefined,
): string | SkillGenerateResult {
  const normalized = skillName?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_SKILL_NAME", "skill.generate requires target.skillName", "input", context);
  }

  if (!/^[a-z0-9][a-z0-9_-]{1,63}$/u.test(normalized)) {
    return failure(
      "INVALID_SKILL_NAME",
      "skill.generate target.skillName must be a safe lowercase skill directory name",
      "input",
      context,
      normalized,
    );
  }

  return normalized;
}

function normalizeDestinationRoot(
  destinationRoot: string | undefined,
  context: SkillGenerateContext | undefined,
  skillName?: string,
): string | SkillGenerateResult {
  const normalized = destinationRoot?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_DESTINATION_ROOT", "skill.generate requires target.destinationRoot", "input", context, skillName);
  }

  if (unsafePath(normalized)) {
    return failure(
      "UNSAFE_SKILL_PATH",
      "skill.generate destinationRoot must not contain traversal or NUL segments",
      "scope",
      context,
      skillName,
    );
  }

  return normalizeRoot(normalized);
}

function normalizeFiles(
  files: readonly Partial<SkillGenerateRequestedFile>[] | undefined,
  context: SkillGenerateContext | undefined,
  skillName: string,
): readonly SkillGenerateRequestedFile[] | SkillGenerateResult {
  const requested: readonly Partial<SkillGenerateRequestedFile>[] = files?.length
    ? files
    : skillGenerateDescriptor.defaultFiles;
  if (requested.length > skillGenerateDescriptor.maxRequestedFiles) {
    return failure("TOO_MANY_FILES", "skill.generate requested too many files for first-round planning", "resource", context, skillName);
  }

  const normalized: SkillGenerateRequestedFile[] = [];
  for (const file of requested) {
    const path = file.path?.trim() ?? "";
    const kind = file.kind;
    const purpose = file.purpose?.trim();

    if (
      path.length === 0 ||
      path.startsWith("/") ||
      unsafePath(path) ||
      kind === undefined ||
      !supportedFileKinds.includes(kind)
    ) {
      return failure(
        "INVALID_REQUESTED_FILE",
        "skill.generate files must stay relative to the generated skill and use a supported kind",
        "input",
        context,
        skillName,
      );
    }

    normalized.push({ path, kind, purpose: purpose || undefined });
  }

  return normalized;
}

function normalizeTarget(
  target: SkillGenerateRequest["target"] | undefined,
  context: SkillGenerateContext | undefined,
): SkillGenerateTarget | SkillGenerateResult {
  const skillName = normalizeSkillName(target?.skillName, context);
  if (typeof skillName !== "string") {
    return skillName;
  }

  const purpose = target?.purpose?.trim() ?? "";
  if (purpose.length === 0) {
    return failure("MISSING_PURPOSE", "skill.generate requires target.purpose", "input", context, skillName);
  }

  const destinationRoot = normalizeDestinationRoot(target?.destinationRoot, context, skillName);
  if (typeof destinationRoot !== "string") {
    return destinationRoot;
  }

  const files = normalizeFiles(target?.files, context, skillName);
  if ("ok" in files) {
    return files;
  }

  return {
    skillName,
    purpose,
    destinationRoot,
    files,
    tags: cleanList(target?.tags),
  };
}

function ensureScope(target: SkillGenerateTarget, context: SkillGenerateContext | undefined): SkillGenerateResult | undefined {
  const allowedRoots = cleanList(context?.allowedSkillRoots).map(normalizeRoot);
  if (allowedRoots.length === 0) {
    return undefined;
  }

  const insideScope = allowedRoots.some(
    (root) => target.destinationRoot === root || target.destinationRoot.startsWith(`${root}/`),
  );
  if (insideScope) {
    return undefined;
  }

  return failure(
    "SKILL_ROOT_OUTSIDE_SCOPE",
    "skill.generate destinationRoot is outside the allowed skill roots",
    "scope",
    context,
    target.skillName,
  );
}

function ensurePermissions(target: SkillGenerateTarget, context: SkillGenerateContext | undefined): SkillGenerateResult | undefined {
  const grantedPermissions = cleanList(context?.grantedPermissions);
  if (grantedPermissions.length === 0) {
    return undefined;
  }

  const missing = skillGenerateDescriptor.permissionsRequired.filter((permission) => !grantedPermissions.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    `skill.generate is missing permissions: ${missing.join(", ")}`,
    "permission",
    context,
    target.skillName,
  );
}

function ensureGovernance(context: SkillGenerateContext | undefined): SkillGenerateResult | undefined {
  if (context?.guard?.accepted !== false) {
    return undefined;
  }

  return failure(
    "GOVERNANCE_REJECTED",
    context.guard.reason ?? "skill.generate was rejected by runtime governance",
    "governance",
    context,
  );
}

function ensureDryRunOnly(target: SkillGenerateTarget, context: SkillGenerateContext | undefined): SkillGenerateResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "skill.generate only returns a guarded dry-run skill generation envelope in the first implementation",
    "contract",
    context,
    target.skillName,
  );
}

function skillDirectory(target: SkillGenerateTarget): string {
  return `${target.destinationRoot}/${target.skillName}`;
}

export function planSkillGeneration(request: SkillGenerateRequest = {}): SkillGenerateResult {
  const target = normalizeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const governanceFailure = ensureGovernance(request.context);
  if (governanceFailure !== undefined) {
    return governanceFailure;
  }

  const scopeFailure = ensureScope(target, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensurePermissions(target, request.context);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = ensureDryRunOnly(target, request.context);
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  const directory = skillDirectory(target);

  return {
    ok: true,
    toolId: skillGenerateDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.skill.generate",
      target,
      permissionsRequired: skillGenerateDescriptor.permissionsRequired,
      dryRun: true,
      executionBlocked: true,
      unsafeSideEffects: true,
      generationEnvelope: {
        scaffoldVersion: "skill-scaffold-v1",
        skillDirectory: directory,
        fileCount: target.files.length,
        wouldWriteFiles: target.files.map((file) => `${directory}/${file.path}`),
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.skill.generate.dryRun", request.context, target.skillName, {
        destinationRoot: target.destinationRoot,
        fileCount: target.files.length,
      }),
    ],
    events: ["basicTool.skill.generate.dryRun"],
  };
}
