/*
 * 文件定位：ToolabilityPool / TAP 高级工具系统 / Office 工具集合 / 演示文稿工具。
 * 核心目的：提供 办公文档基础工具 / 演示文稿工具 中的“编码演示文稿”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些 Office 能力由 TAP 高级工具系统承接，不再作为 baseTool 完成目标。
 * 能力要求3：TAP 负责 Office 能力的治理、审批、组合和专业能力库承接。
 * 边界：承接 Office 高级工具能力，不回写到 agentCore baseTools。
 * 对接：通过 TAP 复用转交与 runtime 官方模块桥接接通，并保留治理、审批和审计边界。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type OfficeSlidesEncodePermission = "filesystem:write" | "office:slides:write";

export type OfficeSlidesEncodeErrorBoundary = "input" | "scope" | "permission" | "contract";

export type OfficeSlidesEncodeContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedPresentationRoots?: readonly string[];
  grantedPermissions?: readonly OfficeSlidesEncodePermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type OfficeSlidesEncodeFormat = "pptx" | "odp" | "pdf-preview";

export type OfficeSlidesEncodeSource = {
  title?: string;
  slideCount: number;
  sourceKind: "structured-outline" | "html-deck" | "markdown-deck";
};

export type OfficeSlidesEncodeTarget = {
  outputPath: string;
  format: OfficeSlidesEncodeFormat;
  overwrite: boolean;
  source: OfficeSlidesEncodeSource;
};

export type OfficeSlidesEncodeRequest = {
  target?: Partial<Omit<OfficeSlidesEncodeTarget, "source">> & {
    source?: Partial<OfficeSlidesEncodeSource>;
  };
  context?: OfficeSlidesEncodeContext;
};

export type OfficeSlidesEncodeErrorCode =
  | "MISSING_OUTPUT_PATH"
  | "MISSING_SOURCE"
  | "INVALID_SOURCE_KIND"
  | "INVALID_SLIDE_COUNT"
  | "INVALID_FORMAT"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type OfficeSlidesEncodeError = {
  code: OfficeSlidesEncodeErrorCode;
  message: string;
  boundary: OfficeSlidesEncodeErrorBoundary;
  publicSafe: true;
};

export type OfficeSlidesEncodeAuditEvent = {
  type: string;
  toolId: "office.slidesEncode";
  invocationId: string;
  dryRun: boolean;
  outputPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type OfficeSlidesEncodeOutput = {
  kind: "agentCore.basicTool.office.slidesEncode";
  target: OfficeSlidesEncodeTarget;
  actionPreview: readonly string[];
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly OfficeSlidesEncodePermission[];
  unsafeSideEffects: true;
  resultEnvelope: {
    producedPath?: string;
    encodedBytes?: number;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type OfficeSlidesEncodeResult =
  | {
      ok: true;
      toolId: "office.slidesEncode";
      output: OfficeSlidesEncodeOutput;
      audit: readonly OfficeSlidesEncodeAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "office.slidesEncode";
      error: OfficeSlidesEncodeError;
      audit: readonly OfficeSlidesEncodeAuditEvent[];
      events: readonly string[];
    };

export const officeSlidesEncodeDescriptor = {
  toolId: "office.slidesEncode",
  capability: "encode-presentation",
  route: "toolabilityPool.officeBase.presentations",
  defaultDryRun: true,
  tapOwnsApproval: true,
  unsafeSideEffects: true,
  permissionsRequired: ["filesystem:write", "office:slides:write"],
} as const;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: OfficeSlidesEncodeContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: OfficeSlidesEncodeContext | undefined): string {
  return context?.invocationId?.trim() || "office.slidesEncode:dry-run";
}

function normalizeRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/, "");
}

function hasPathTraversal(outputPath: string): boolean {
  return outputPath.split(/[\\/]+/).some((segment) => segment === "..");
}

function auditEvent(
  type: string,
  context: OfficeSlidesEncodeContext | undefined,
  outputPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): OfficeSlidesEncodeAuditEvent {
  return {
    type,
    toolId: officeSlidesEncodeDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    outputPath,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: OfficeSlidesEncodeErrorCode,
  message: string,
  boundary: OfficeSlidesEncodeErrorBoundary,
  context: OfficeSlidesEncodeContext | undefined,
  outputPath?: string,
): OfficeSlidesEncodeResult {
  return {
    ok: false,
    toolId: officeSlidesEncodeDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true },
    audit: [auditEvent("agentCore.basicTool.office.slidesEncode.rejected", context, outputPath, { code })],
    events: ["basicTool.office.slidesEncode.rejected"],
  };
}

function normalizeOutputPath(
  outputPath: string | undefined,
  context: OfficeSlidesEncodeContext | undefined,
): string | OfficeSlidesEncodeResult {
  const normalized = outputPath?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_OUTPUT_PATH", "office.slidesEncode requires target.outputPath", "input", context, outputPath);
  }

  if (hasPathTraversal(normalized)) {
    return failure(
      "SCOPE_REJECTED",
      "office.slidesEncode target.outputPath must not escape its presentation scope",
      "scope",
      context,
      normalized,
    );
  }

  return normalized;
}

function normalizeFormat(
  format: OfficeSlidesEncodeFormat | undefined,
  context: OfficeSlidesEncodeContext | undefined,
  outputPath: string,
): OfficeSlidesEncodeFormat | OfficeSlidesEncodeResult {
  if (format === undefined) {
    return "pptx";
  }

  if (format === "pptx" || format === "odp" || format === "pdf-preview") {
    return format;
  }

  return failure("INVALID_FORMAT", "office.slidesEncode target.format is not supported", "input", context, outputPath);
}

function normalizeSource(
  source: Partial<OfficeSlidesEncodeSource> | undefined,
  context: OfficeSlidesEncodeContext | undefined,
  outputPath: string,
): OfficeSlidesEncodeSource | OfficeSlidesEncodeResult {
  if (source === undefined) {
    return failure("MISSING_SOURCE", "office.slidesEncode requires target.source", "input", context, outputPath);
  }

  if (
    source.sourceKind !== "structured-outline" &&
    source.sourceKind !== "html-deck" &&
    source.sourceKind !== "markdown-deck"
  ) {
    return failure(
      "INVALID_SOURCE_KIND",
      "office.slidesEncode target.source.sourceKind must be structured-outline, html-deck, or markdown-deck",
      "input",
      context,
      outputPath,
    );
  }

  if (!Number.isInteger(source.slideCount) || source.slideCount === undefined || source.slideCount <= 0) {
    return failure(
      "INVALID_SLIDE_COUNT",
      "office.slidesEncode target.source.slideCount must be a positive integer",
      "input",
      context,
      outputPath,
    );
  }

  return {
    title: source.title?.trim() || undefined,
    slideCount: source.slideCount,
    sourceKind: source.sourceKind,
  };
}

function normalizeTarget(
  target: OfficeSlidesEncodeRequest["target"] | undefined,
  context: OfficeSlidesEncodeContext | undefined,
): OfficeSlidesEncodeTarget | OfficeSlidesEncodeResult {
  const outputPath = normalizeOutputPath(target?.outputPath, context);
  if (typeof outputPath !== "string") {
    return outputPath;
  }

  const format = normalizeFormat(target?.format, context, outputPath);
  if (typeof format !== "string") {
    return format;
  }

  const source = normalizeSource(target?.source, context, outputPath);
  if ("ok" in source) {
    return source;
  }

  return {
    outputPath,
    format,
    overwrite: target?.overwrite === true,
    source,
  };
}

function ensureScope(
  target: OfficeSlidesEncodeTarget,
  context: OfficeSlidesEncodeContext | undefined,
): OfficeSlidesEncodeResult | undefined {
  const allowedRoots = cleanList(context?.allowedPresentationRoots).map(normalizeRoot);
  if (allowedRoots.length === 0) {
    return undefined;
  }

  const allowed = allowedRoots.some((root) => target.outputPath === root || target.outputPath.startsWith(`${root}/`));
  if (allowed) {
    return undefined;
  }

  return failure(
    "SCOPE_REJECTED",
    "office.slidesEncode target output is outside the allowed presentation roots",
    "scope",
    context,
    target.outputPath,
  );
}

function ensurePermissions(
  target: OfficeSlidesEncodeTarget,
  context: OfficeSlidesEncodeContext | undefined,
): OfficeSlidesEncodeResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = officeSlidesEncodeDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    `office.slidesEncode is missing permissions: ${missing.join(", ")}`,
    "permission",
    context,
    target.outputPath,
  );
}

function blockRealExecution(
  target: OfficeSlidesEncodeTarget,
  context: OfficeSlidesEncodeContext | undefined,
): OfficeSlidesEncodeResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "office.slidesEncode only returns a guarded dry-run plan in the first implementation",
    "contract",
    context,
    target.outputPath,
  );
}

function actionPreview(target: OfficeSlidesEncodeTarget): readonly string[] {
  return [
    "office.slidesEncode",
    "--output",
    target.outputPath,
    "--format",
    target.format,
    "--source-kind",
    target.source.sourceKind,
    "--slides",
    String(target.source.slideCount),
    target.overwrite ? "--overwrite" : "--no-overwrite",
  ];
}

export function planOfficeSlidesEncode(request: OfficeSlidesEncodeRequest = {}): OfficeSlidesEncodeResult {
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
    toolId: officeSlidesEncodeDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.office.slidesEncode",
      target,
      actionPreview: actionPreview(target),
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: officeSlidesEncodeDescriptor.permissionsRequired,
      unsafeSideEffects: true,
      resultEnvelope: {
        metadata: {
          encoding: "not-executed",
          formatFamily: "presentation",
        },
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.office.slidesEncode.dryRun", request.context, target.outputPath, {
        format: target.format,
        overwrite: target.overwrite,
        sourceKind: target.source.sourceKind,
        slideCount: target.source.slideCount,
      }),
    ],
    events: ["basicTool.office.slidesEncode.dryRun"],
  };
}
