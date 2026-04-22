/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 多模态基础工具 / 视频转换工具。
 * 核心目的：提供 多模态基础工具 / 视频转换工具 中的“转换视频格式”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type OmniVideoFormatConversionPermission = "filesystem:read" | "filesystem:write" | "omni:video:transform";

export type OmniVideoFormatConversionBoundary = "input" | "scope" | "permission" | "contract" | "governance";

export type OmniVideoFormatConversionGate = {
  accepted: boolean;
  reason?: string;
};

export type OmniVideoTargetFormat = "mp4" | "webm" | "mov" | "mkv";

export type OmniVideoFormatConversionTarget = {
  inputPath: string;
  outputPath: string;
  targetFormat: OmniVideoTargetFormat;
  codecHint?: string;
  preserveMetadata?: boolean;
};

export type OmniVideoFormatConversionContext = {
  invocationId?: string;
  dryRun?: boolean;
  allowedVideoRoots?: readonly string[];
  grantedPermissions?: readonly OmniVideoFormatConversionPermission[];
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: OmniVideoFormatConversionGate;
  governance?: OmniVideoFormatConversionGate;
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type OmniVideoFormatConversionRequest = {
  target?: Partial<OmniVideoFormatConversionTarget>;
  context?: OmniVideoFormatConversionContext;
};

export type OmniVideoFormatConversionErrorCode =
  | "MISSING_INPUT_PATH"
  | "MISSING_OUTPUT_PATH"
  | "MISSING_TARGET_FORMAT"
  | "VIDEO_PATH_OUT_OF_SCOPE"
  | "INVALID_TARGET_FORMAT"
  | "PERMISSION_DENIED"
  | "SCOPE_DENIED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "REAL_EXECUTION_BLOCKED";

export type OmniVideoFormatConversionError = {
  code: OmniVideoFormatConversionErrorCode;
  message: string;
  boundary: OmniVideoFormatConversionBoundary;
  publicSafe: true;
  internalDetailExposed: false;
};

export type OmniVideoFormatConversionAuditEvent = {
  type: string;
  toolId: "omni.videoFormatConversion";
  invocationId: string;
  dryRun: true;
  inputPath?: string;
  outputPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type OmniVideoFormatConversionOutput = {
  kind: "agentCore.basicTool.omni.videoFormatConversion";
  target: OmniVideoFormatConversionTarget;
  dryRun: true;
  executionBlocked: true;
  unsafeSideEffects: false;
  permissionsRequired: readonly OmniVideoFormatConversionPermission[];
  requiresTapApproval: true;
  conversionEnvelope: {
    inputRead: false;
    outputWritten: false;
    plannedAsset: "video";
  };
};

export type OmniVideoFormatConversionResult =
  | {
      ok: true;
      toolId: "omni.videoFormatConversion";
      output: OmniVideoFormatConversionOutput;
      audit: readonly OmniVideoFormatConversionAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "omni.videoFormatConversion";
      error: OmniVideoFormatConversionError;
      audit: readonly OmniVideoFormatConversionAuditEvent[];
      events: readonly string[];
    };

export const omniVideoFormatConversionDescriptor = {
  toolId: "omni.videoFormatConversion",
  capability: "convert-video-format",
  route: "agent_executionEngine.basic_toolLayer.baseTools.omniBase.videoTransformer",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["filesystem:read", "filesystem:write", "omni:video:transform"],
} as const;

function cleanList<T extends string>(values: readonly T[] | undefined): T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function invocationId(context: OmniVideoFormatConversionContext | undefined): string {
  return context?.invocationId?.trim() || "omni.videoFormatConversion:dry-run";
}

function auditEvent(
  type: string,
  context: OmniVideoFormatConversionContext | undefined,
  inputPath?: string,
  outputPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): OmniVideoFormatConversionAuditEvent {
  return {
    type,
    toolId: omniVideoFormatConversionDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: true,
    inputPath,
    outputPath,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: OmniVideoFormatConversionErrorCode,
  message: string,
  boundary: OmniVideoFormatConversionBoundary,
  context: OmniVideoFormatConversionContext | undefined,
  inputPath?: string,
  outputPath?: string,
): OmniVideoFormatConversionResult {
  return {
    ok: false,
    toolId: omniVideoFormatConversionDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.omni.videoFormatConversion.rejected", context, inputPath, outputPath, { code })],
    events: ["basicTool.omni.videoFormatConversion.rejected"],
  };
}

function normalizePath(value: string | undefined): string | undefined {
  const raw = value?.trim() ?? "";
  if (raw.length === 0 || raw.includes("\0")) {
    return undefined;
  }

  const absolute = raw.startsWith("/") || /^[A-Za-z]:[\\/]/.test(raw);
  const normalized = raw.replaceAll("\\", "/").replace(/\/+/g, "/");
  const parts = normalized.split("/").filter((part) => part.length > 0 && part !== ".");
  if (parts.some((part) => part === "..")) {
    return undefined;
  }

  return `${absolute ? "/" : ""}${parts.join("/")}`;
}

function normalizeRoot(root: string): string {
  const normalized = normalizePath(root) ?? root.trim().replaceAll("\\", "/");
  return normalized === "/" ? normalized : normalized.replace(/\/+$/, "");
}

function ensurePathInRoots(
  inputPath: string,
  outputPath: string,
  context: OmniVideoFormatConversionContext | undefined,
): OmniVideoFormatConversionResult | undefined {
  const roots = cleanList(context?.allowedVideoRoots).map(normalizeRoot);
  if (roots.length === 0) {
    return undefined;
  }

  const allowed = [inputPath, outputPath].every((pathValue) =>
    roots.some((root) => pathValue === root || pathValue.startsWith(`${root}/`)),
  );
  if (allowed) {
    return undefined;
  }

  return failure(
    "VIDEO_PATH_OUT_OF_SCOPE",
    "omni.videoFormatConversion inputPath and outputPath must stay inside the declared video roots",
    "scope",
    context,
    inputPath,
    outputPath,
  );
}

function ensurePermissions(
  inputPath: string,
  outputPath: string,
  context: OmniVideoFormatConversionContext | undefined,
): OmniVideoFormatConversionResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = omniVideoFormatConversionDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    `omni.videoFormatConversion is missing permission: ${missing[0]}`,
    "permission",
    context,
    inputPath,
    outputPath,
  );
}

function ensureScopes(
  inputPath: string,
  outputPath: string,
  context: OmniVideoFormatConversionContext | undefined,
): OmniVideoFormatConversionResult | undefined {
  const requested = cleanList(context?.requestedScopes);
  const allowed = cleanList(context?.allowedScopes);
  const denied = requested.filter((scope) => !allowed.includes(scope));

  if (requested.length === 0 || denied.length === 0) {
    return undefined;
  }

  return failure(
    "SCOPE_DENIED",
    `omni.videoFormatConversion scope ${denied[0]} is outside runtime governance`,
    "scope",
    context,
    inputPath,
    outputPath,
  );
}

function normalizeTargetFormat(
  value: string | undefined,
  context: OmniVideoFormatConversionContext | undefined,
  inputPath: string,
  outputPath: string,
): OmniVideoTargetFormat | OmniVideoFormatConversionResult {
  if (value === undefined || value.trim() === "") {
    return failure("MISSING_TARGET_FORMAT", "omni.videoFormatConversion requires target.targetFormat", "input", context, inputPath, outputPath);
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "mp4" || normalized === "webm" || normalized === "mov" || normalized === "mkv") {
    return normalized;
  }

  return failure("INVALID_TARGET_FORMAT", "omni.videoFormatConversion targetFormat is not supported", "input", context, inputPath, outputPath);
}

function ensureGates(
  inputPath: string,
  outputPath: string,
  context: OmniVideoFormatConversionContext | undefined,
): OmniVideoFormatConversionResult | undefined {
  if (context?.dryRun === false) {
    return failure(
      "REAL_EXECUTION_BLOCKED",
      "first-round omni.videoFormatConversion does not read or write video files",
      "contract",
      context,
      inputPath,
      outputPath,
    );
  }

  if (context?.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      context.contract.reason ?? "omni.videoFormatConversion was rejected by runtime contract surface",
      "contract",
      context,
      inputPath,
      outputPath,
    );
  }

  if (context?.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      context.governance.reason ?? "omni.videoFormatConversion was rejected by runtime governance",
      "governance",
      context,
      inputPath,
      outputPath,
    );
  }

  return undefined;
}

export function planOmniVideoFormatConversion(
  request: OmniVideoFormatConversionRequest = {},
): OmniVideoFormatConversionResult {
  const inputPath = normalizePath(request.target?.inputPath);
  if (inputPath === undefined) {
    return failure("MISSING_INPUT_PATH", "omni.videoFormatConversion requires target.inputPath", "input", request.context);
  }

  const outputPath = normalizePath(request.target?.outputPath);
  if (outputPath === undefined) {
    return failure("MISSING_OUTPUT_PATH", "omni.videoFormatConversion requires target.outputPath", "input", request.context, inputPath);
  }

  const targetFormat = normalizeTargetFormat(request.target?.targetFormat, request.context, inputPath, outputPath);
  if (typeof targetFormat !== "string") {
    return targetFormat;
  }

  const scoped = ensurePathInRoots(inputPath, outputPath, request.context);
  if (scoped !== undefined) {
    return scoped;
  }

  const permissions = ensurePermissions(inputPath, outputPath, request.context);
  if (permissions !== undefined) {
    return permissions;
  }

  const scopes = ensureScopes(inputPath, outputPath, request.context);
  if (scopes !== undefined) {
    return scopes;
  }

  const gates = ensureGates(inputPath, outputPath, request.context);
  if (gates !== undefined) {
    return gates;
  }

  const target: OmniVideoFormatConversionTarget = {
    inputPath,
    outputPath,
    targetFormat,
    codecHint: request.target?.codecHint?.trim() || undefined,
    preserveMetadata: request.target?.preserveMetadata ?? true,
  };

  return {
    ok: true,
    toolId: omniVideoFormatConversionDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.omni.videoFormatConversion",
      target,
      dryRun: true,
      executionBlocked: true,
      unsafeSideEffects: false,
      permissionsRequired: omniVideoFormatConversionDescriptor.permissionsRequired,
      requiresTapApproval: true,
      conversionEnvelope: {
        inputRead: false,
        outputWritten: false,
        plannedAsset: "video",
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.omni.videoFormatConversion.dryRun", request.context, inputPath, outputPath, {
        targetFormat,
        codecHint: target.codecHint,
        preserveMetadata: target.preserveMetadata,
      }),
    ],
    events: ["basicTool.omni.videoFormatConversion.dryRun"],
  };
}
