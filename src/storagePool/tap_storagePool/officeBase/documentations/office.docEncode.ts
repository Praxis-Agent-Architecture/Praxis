/*
 * 文件定位：ToolabilityPool / TAP 高级工具系统 / Office 工具集合 / 文档工具。
 * 核心目的：提供 办公文档基础工具 / 文档工具 中的“编码文档”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些 Office 能力由 TAP 高级工具系统承接，不再作为 baseTool 完成目标。
 * 能力要求3：TAP 负责 Office 能力的治理、审批、组合和专业能力库承接。
 * 边界：承接 Office 高级工具能力，不回写到 agentCore baseTools。
 * 对接：通过 TAP 复用转交与 runtime 官方模块桥接接通，并保留治理、审批和审计边界。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type OfficeDocEncodePermission = "filesystem:write" | "office:document:encode";

export type OfficeDocEncodeErrorBoundary = "input" | "scope" | "permission" | "contract";

export type OfficeDocEncodeContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedOutputRoots?: readonly string[];
  grantedPermissions?: readonly OfficeDocEncodePermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type OfficeDocEncodeFormat = "docx" | "odt" | "html" | "markdown";

export type OfficeDocEncodeBlock = {
  kind: "paragraph" | "heading" | "listItem";
  text: string;
  level?: number;
};

export type OfficeDocEncodeTarget = {
  outputFormat: OfficeDocEncodeFormat;
  blocks: readonly OfficeDocEncodeBlock[];
  title?: string;
  outputPath?: string;
};

export type OfficeDocEncodeRequest = {
  target?: Partial<Omit<OfficeDocEncodeTarget, "blocks">> & {
    blocks?: readonly Partial<OfficeDocEncodeBlock>[];
  };
  context?: OfficeDocEncodeContext;
};

export type OfficeDocEncodeErrorCode =
  | "MISSING_OUTPUT_FORMAT"
  | "INVALID_OUTPUT_FORMAT"
  | "MISSING_DOCUMENT_BLOCKS"
  | "INVALID_DOCUMENT_BLOCK"
  | "UNSAFE_OUTPUT_PATH"
  | "OUTPUT_PATH_OUTSIDE_SCOPE"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type OfficeDocEncodeError = {
  code: OfficeDocEncodeErrorCode;
  message: string;
  boundary: OfficeDocEncodeErrorBoundary;
  publicSafe: true;
};

export type OfficeDocEncodeAuditEvent = {
  type: string;
  toolId: "office.docEncode";
  invocationId: string;
  dryRun: boolean;
  outputPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type OfficeDocEncodeOutput = {
  kind: "agentCore.basicTool.office.docEncode";
  target: {
    outputFormat: OfficeDocEncodeFormat;
    blocks: readonly OfficeDocEncodeBlock[];
    title?: string;
    outputPath?: string;
  };
  dryRun: true;
  executionBlocked: true;
  unsafeSideEffects: boolean;
  permissionsRequired: readonly OfficeDocEncodePermission[];
  encodePlan: {
    encoder: "office-document-encoder-v1";
    wouldWriteFile: boolean;
    byteEstimate: number;
    artifactEnvelope: {
      producedBytes: 0;
      mimeType: string;
    };
  };
};

export type OfficeDocEncodeResult =
  | {
      ok: true;
      toolId: "office.docEncode";
      output: OfficeDocEncodeOutput;
      audit: readonly OfficeDocEncodeAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "office.docEncode";
      error: OfficeDocEncodeError;
      audit: readonly OfficeDocEncodeAuditEvent[];
      events: readonly string[];
    };

export const officeDocEncodeDescriptor = {
  toolId: "office.docEncode",
  capability: "encode-document",
  route: "toolabilityPool.officeBase.documentations",
  defaultDryRun: true,
  unsafeSideEffects: true,
  tapOwnsApproval: true,
  permissionsRequired: ["office:document:encode"],
  fileWritePermissions: ["filesystem:write", "office:document:encode"],
} as const;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: OfficeDocEncodeContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: OfficeDocEncodeContext | undefined): string {
  return context?.invocationId?.trim() || "office.docEncode:dry-run";
}

function auditEvent(
  type: string,
  context: OfficeDocEncodeContext | undefined,
  outputPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): OfficeDocEncodeAuditEvent {
  return {
    type,
    toolId: officeDocEncodeDescriptor.toolId,
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
  code: OfficeDocEncodeErrorCode,
  message: string,
  boundary: OfficeDocEncodeErrorBoundary,
  context: OfficeDocEncodeContext | undefined,
  outputPath?: string,
): OfficeDocEncodeResult {
  return {
    ok: false,
    toolId: officeDocEncodeDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true },
    audit: [auditEvent("agentCore.basicTool.office.docEncode.rejected", context, outputPath, { code })],
    events: ["basicTool.office.docEncode.rejected"],
  };
}

function normalizeRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/, "");
}

function hasUnsafePathSegments(value: string): boolean {
  return value.includes("\0") || value.split("/").some((segment) => segment === "..");
}

function normalizeOutputFormat(
  outputFormat: string | undefined,
  context: OfficeDocEncodeContext | undefined,
): OfficeDocEncodeFormat | OfficeDocEncodeResult {
  const normalized = outputFormat?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_OUTPUT_FORMAT", "office.docEncode requires target.outputFormat", "input", context);
  }

  if (normalized === "docx" || normalized === "odt" || normalized === "html" || normalized === "markdown") {
    return normalized;
  }

  return failure("INVALID_OUTPUT_FORMAT", "office.docEncode target.outputFormat must be docx, odt, html, or markdown", "input", context);
}

function normalizeOutputPath(
  outputPath: string | undefined,
  context: OfficeDocEncodeContext | undefined,
): string | undefined | OfficeDocEncodeResult {
  const normalized = outputPath?.trim() ?? "";
  if (normalized.length === 0) {
    return undefined;
  }

  if (hasUnsafePathSegments(normalized)) {
    return failure(
      "UNSAFE_OUTPUT_PATH",
      "office.docEncode target.outputPath must not contain traversal or NUL segments",
      "scope",
      context,
      normalized,
    );
  }

  return normalized;
}

function normalizeBlocks(
  blocks: readonly Partial<OfficeDocEncodeBlock>[] | undefined,
  context: OfficeDocEncodeContext | undefined,
  outputPath?: string,
): readonly OfficeDocEncodeBlock[] | OfficeDocEncodeResult {
  if (blocks === undefined || blocks.length === 0) {
    return failure("MISSING_DOCUMENT_BLOCKS", "office.docEncode requires at least one target.blocks entry", "input", context, outputPath);
  }

  const normalized: OfficeDocEncodeBlock[] = [];
  for (const block of blocks) {
    const kind = block.kind ?? "paragraph";
    const text = block.text?.trim() ?? "";
    if ((kind !== "paragraph" && kind !== "heading" && kind !== "listItem") || text.length === 0) {
      return failure(
        "INVALID_DOCUMENT_BLOCK",
        "office.docEncode target.blocks entries require kind paragraph, heading, or listItem and non-empty text",
        "input",
        context,
        outputPath,
      );
    }

    if (kind === "heading") {
      const level = block.level ?? 1;
      if (!Number.isInteger(level) || level < 1 || level > 6) {
        return failure("INVALID_DOCUMENT_BLOCK", "office.docEncode heading blocks require level 1 through 6", "input", context, outputPath);
      }

      normalized.push({ kind, text, level });
      continue;
    }

    normalized.push({ kind, text });
  }

  return normalized;
}

function ensureScope(outputPath: string | undefined, context: OfficeDocEncodeContext | undefined): OfficeDocEncodeResult | undefined {
  if (outputPath === undefined) {
    return undefined;
  }

  const allowedRoots = cleanList(context?.allowedOutputRoots).map(normalizeRoot);
  if (allowedRoots.length === 0) {
    return undefined;
  }

  const allowed = allowedRoots.some((root) => outputPath === root || outputPath.startsWith(`${root}/`));
  if (allowed) {
    return undefined;
  }

  return failure(
    "OUTPUT_PATH_OUTSIDE_SCOPE",
    "office.docEncode target output is outside the allowed output roots",
    "scope",
    context,
    outputPath,
  );
}

function requiredPermissions(outputPath: string | undefined): readonly OfficeDocEncodePermission[] {
  return outputPath === undefined ? officeDocEncodeDescriptor.permissionsRequired : officeDocEncodeDescriptor.fileWritePermissions;
}

function ensurePermissions(
  permissions: readonly OfficeDocEncodePermission[],
  outputPath: string | undefined,
  context: OfficeDocEncodeContext | undefined,
): OfficeDocEncodeResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = permissions.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    `office.docEncode is missing permissions: ${missing.join(", ")}`,
    "permission",
    context,
    outputPath,
  );
}

function ensureDryRunOnly(outputPath: string | undefined, context: OfficeDocEncodeContext | undefined): OfficeDocEncodeResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "office.docEncode only returns a guarded dry-run plan in the first implementation",
    "contract",
    context,
    outputPath,
  );
}

function mimeType(format: OfficeDocEncodeFormat): string {
  if (format === "docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }

  if (format === "odt") {
    return "application/vnd.oasis.opendocument.text";
  }

  if (format === "html") {
    return "text/html";
  }

  return "text/markdown";
}

function byteEstimate(blocks: readonly OfficeDocEncodeBlock[], title: string | undefined): number {
  const textBytes = blocks.reduce((sum, block) => sum + block.text.length, title?.length ?? 0);
  return Math.max(128, textBytes * 2);
}

function normalizeTarget(
  target: OfficeDocEncodeRequest["target"],
  context: OfficeDocEncodeContext | undefined,
): OfficeDocEncodeOutput["target"] | OfficeDocEncodeResult {
  const outputFormat = normalizeOutputFormat(target?.outputFormat, context);
  if (typeof outputFormat !== "string") {
    return outputFormat;
  }

  const outputPath = normalizeOutputPath(target?.outputPath, context);
  if (outputPath !== undefined && typeof outputPath !== "string") {
    return outputPath;
  }

  const blocks = normalizeBlocks(target?.blocks, context, outputPath);
  if ("ok" in blocks) {
    return blocks;
  }

  return {
    outputFormat,
    blocks,
    title: target?.title?.trim() || undefined,
    outputPath,
  };
}

export function planOfficeDocEncode(request: OfficeDocEncodeRequest = {}): OfficeDocEncodeResult {
  const target = normalizeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureScope(target.outputPath, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissions = requiredPermissions(target.outputPath);
  const permissionFailure = ensurePermissions(permissions, target.outputPath, request.context);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = ensureDryRunOnly(target.outputPath, request.context);
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  return {
    ok: true,
    toolId: officeDocEncodeDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.office.docEncode",
      target,
      dryRun: true,
      executionBlocked: true,
      unsafeSideEffects: target.outputPath !== undefined,
      permissionsRequired: permissions,
      encodePlan: {
        encoder: "office-document-encoder-v1",
        wouldWriteFile: target.outputPath !== undefined,
        byteEstimate: byteEstimate(target.blocks, target.title),
        artifactEnvelope: {
          producedBytes: 0,
          mimeType: mimeType(target.outputFormat),
        },
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.office.docEncode.dryRun", request.context, target.outputPath, {
        outputFormat: target.outputFormat,
        blockCount: target.blocks.length,
        wouldWriteFile: target.outputPath !== undefined,
      }),
    ],
    events: ["basicTool.office.docEncode.dryRun"],
  };
}
