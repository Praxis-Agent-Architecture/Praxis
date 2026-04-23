/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 办公文档基础工具 / 演示文稿工具。
 * 核心目的：提供 办公文档基础工具 / 演示文稿工具 中的“读取演示文稿”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type OfficeSlidesReadPermission = "filesystem:read" | "office:slides:read";

export type OfficeSlidesReadErrorBoundary = "input" | "scope" | "permission" | "contract";

export type OfficeSlidesReadContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedPresentationRoots?: readonly string[];
  grantedPermissions?: readonly OfficeSlidesReadPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type OfficeSlidesReadTarget = {
  presentationPath: string;
  includeSpeakerNotes: boolean;
  includeHiddenSlides: boolean;
  maxSlides?: number;
};

export type OfficeSlidesReadRequest = {
  target?: Partial<OfficeSlidesReadTarget>;
  context?: OfficeSlidesReadContext;
};

export type OfficeSlidesReadErrorCode =
  | "MISSING_PRESENTATION_PATH"
  | "INVALID_MAX_SLIDES"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type OfficeSlidesReadError = {
  code: OfficeSlidesReadErrorCode;
  message: string;
  boundary: OfficeSlidesReadErrorBoundary;
  publicSafe: true;
};

export type OfficeSlidesReadAuditEvent = {
  type: string;
  toolId: "office.slidesRead";
  invocationId: string;
  dryRun: boolean;
  presentationPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type OfficeSlidesReadOutput = {
  kind: "agentCore.basicTool.office.slidesRead";
  target: OfficeSlidesReadTarget;
  actionPreview: readonly string[];
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly OfficeSlidesReadPermission[];
  unsafeSideEffects: false;
  resultEnvelope: {
    slides: readonly {
      slideNumber: number;
      title?: string;
      text: readonly string[];
      notes?: readonly string[];
    }[];
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type OfficeSlidesReadResult =
  | {
      ok: true;
      toolId: "office.slidesRead";
      output: OfficeSlidesReadOutput;
      audit: readonly OfficeSlidesReadAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "office.slidesRead";
      error: OfficeSlidesReadError;
      audit: readonly OfficeSlidesReadAuditEvent[];
      events: readonly string[];
    };

export const officeSlidesReadDescriptor = {
  toolId: "office.slidesRead",
  capability: "read-presentation",
  route: "agent_executionEngine.basic_toolLayer.baseTools.officeBase.presentations",
  defaultDryRun: true,
  tapOwnsApproval: true,
  unsafeSideEffects: false,
  permissionsRequired: ["filesystem:read", "office:slides:read"],
} as const;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: OfficeSlidesReadContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: OfficeSlidesReadContext | undefined): string {
  return context?.invocationId?.trim() || "office.slidesRead:dry-run";
}

function normalizeRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/, "");
}

function hasPathTraversal(presentationPath: string): boolean {
  return presentationPath.split(/[\\/]+/).some((segment) => segment === "..");
}

function auditEvent(
  type: string,
  context: OfficeSlidesReadContext | undefined,
  presentationPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): OfficeSlidesReadAuditEvent {
  return {
    type,
    toolId: officeSlidesReadDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    presentationPath,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: OfficeSlidesReadErrorCode,
  message: string,
  boundary: OfficeSlidesReadErrorBoundary,
  context: OfficeSlidesReadContext | undefined,
  presentationPath?: string,
): OfficeSlidesReadResult {
  return {
    ok: false,
    toolId: officeSlidesReadDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true },
    audit: [auditEvent("agentCore.basicTool.office.slidesRead.rejected", context, presentationPath, { code })],
    events: ["basicTool.office.slidesRead.rejected"],
  };
}

function normalizePresentationPath(
  presentationPath: string | undefined,
  context: OfficeSlidesReadContext | undefined,
): string | OfficeSlidesReadResult {
  const normalized = presentationPath?.trim() ?? "";
  if (normalized.length === 0) {
    return failure(
      "MISSING_PRESENTATION_PATH",
      "office.slidesRead requires target.presentationPath",
      "input",
      context,
      presentationPath,
    );
  }

  if (hasPathTraversal(normalized)) {
    return failure(
      "SCOPE_REJECTED",
      "office.slidesRead target.presentationPath must not escape its presentation scope",
      "scope",
      context,
      normalized,
    );
  }

  return normalized;
}

function normalizeMaxSlides(
  maxSlides: number | undefined,
  context: OfficeSlidesReadContext | undefined,
  presentationPath: string,
): number | undefined | OfficeSlidesReadResult {
  if (maxSlides === undefined) {
    return undefined;
  }

  if (Number.isInteger(maxSlides) && maxSlides > 0) {
    return maxSlides;
  }

  return failure(
    "INVALID_MAX_SLIDES",
    "office.slidesRead target.maxSlides must be a positive integer when provided",
    "input",
    context,
    presentationPath,
  );
}

function normalizeTarget(
  target: Partial<OfficeSlidesReadTarget> | undefined,
  context: OfficeSlidesReadContext | undefined,
): OfficeSlidesReadTarget | OfficeSlidesReadResult {
  const presentationPath = normalizePresentationPath(target?.presentationPath, context);
  if (typeof presentationPath !== "string") {
    return presentationPath;
  }

  const maxSlides = normalizeMaxSlides(target?.maxSlides, context, presentationPath);
  if (typeof maxSlides === "object") {
    return maxSlides;
  }

  return {
    presentationPath,
    includeSpeakerNotes: target?.includeSpeakerNotes === true,
    includeHiddenSlides: target?.includeHiddenSlides === true,
    maxSlides,
  };
}

function ensureScope(target: OfficeSlidesReadTarget, context: OfficeSlidesReadContext | undefined): OfficeSlidesReadResult | undefined {
  const allowedRoots = cleanList(context?.allowedPresentationRoots).map(normalizeRoot);
  if (allowedRoots.length === 0) {
    return undefined;
  }

  const allowed = allowedRoots.some(
    (root) => target.presentationPath === root || target.presentationPath.startsWith(`${root}/`),
  );
  if (allowed) {
    return undefined;
  }

  return failure(
    "SCOPE_REJECTED",
    "office.slidesRead target presentation is outside the allowed presentation roots",
    "scope",
    context,
    target.presentationPath,
  );
}

function ensurePermissions(
  target: OfficeSlidesReadTarget,
  context: OfficeSlidesReadContext | undefined,
): OfficeSlidesReadResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = officeSlidesReadDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    `office.slidesRead is missing permissions: ${missing.join(", ")}`,
    "permission",
    context,
    target.presentationPath,
  );
}

function blockRealExecution(
  target: OfficeSlidesReadTarget,
  context: OfficeSlidesReadContext | undefined,
): OfficeSlidesReadResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "office.slidesRead only returns a guarded dry-run plan in the first implementation",
    "contract",
    context,
    target.presentationPath,
  );
}

function actionPreview(target: OfficeSlidesReadTarget): readonly string[] {
  return [
    "office.slidesRead",
    "--input",
    target.presentationPath,
    target.includeSpeakerNotes ? "--include-speaker-notes" : "--no-speaker-notes",
    target.includeHiddenSlides ? "--include-hidden-slides" : "--visible-slides-only",
    ...(target.maxSlides === undefined ? [] : ["--max-slides", String(target.maxSlides)]),
  ];
}

export function planOfficeSlidesRead(request: OfficeSlidesReadRequest = {}): OfficeSlidesReadResult {
  const target = normalizeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureScope(target, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensurePermissions(target, request.context);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = blockRealExecution(target, request.context);
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  return {
    ok: true,
    toolId: officeSlidesReadDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.office.slidesRead",
      target,
      actionPreview: actionPreview(target),
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: officeSlidesReadDescriptor.permissionsRequired,
      unsafeSideEffects: false,
      resultEnvelope: {
        slides: [],
        metadata: {
          formatFamily: "presentation",
          extraction: "not-executed",
        },
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.office.slidesRead.dryRun", request.context, target.presentationPath, {
        includeSpeakerNotes: target.includeSpeakerNotes,
        includeHiddenSlides: target.includeHiddenSlides,
        maxSlides: target.maxSlides,
      }),
    ],
    events: ["basicTool.office.slidesRead.dryRun"],
  };
}
