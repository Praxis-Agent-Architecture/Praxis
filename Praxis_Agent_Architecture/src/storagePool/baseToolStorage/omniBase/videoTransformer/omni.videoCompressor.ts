/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 多模态基础工具 / 视频转换工具。
 * 核心目的：提供 多模态基础工具 / 视频转换工具 中的“压缩视频”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type OmniVideoCompressorPermission = "filesystem:read" | "filesystem:write" | "omni:video:transform";

export type OmniVideoCompressorBoundary = "input" | "scope" | "permission" | "contract" | "governance";

export type OmniVideoCompressorGate = {
  accepted: boolean;
  reason?: string;
};

export type OmniVideoCompressionPreset = "draft" | "balanced" | "archive";

export type OmniVideoCompressorTarget = {
  inputPath: string;
  outputPath: string;
  targetBitrateKbps?: number;
  qualityPreset?: OmniVideoCompressionPreset;
  maxOutputBytes?: number;
};

export type OmniVideoCompressorContext = {
  invocationId?: string;
  dryRun?: boolean;
  allowedVideoRoots?: readonly string[];
  grantedPermissions?: readonly OmniVideoCompressorPermission[];
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: OmniVideoCompressorGate;
  governance?: OmniVideoCompressorGate;
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type OmniVideoCompressorRequest = {
  target?: Partial<OmniVideoCompressorTarget>;
  context?: OmniVideoCompressorContext;
};

export type OmniVideoCompressorErrorCode =
  | "MISSING_INPUT_PATH"
  | "MISSING_OUTPUT_PATH"
  | "VIDEO_PATH_OUT_OF_SCOPE"
  | "INVALID_QUALITY_PRESET"
  | "INVALID_TARGET_BITRATE"
  | "INVALID_MAX_OUTPUT_BYTES"
  | "PERMISSION_DENIED"
  | "SCOPE_DENIED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "REAL_EXECUTION_BLOCKED";

export type OmniVideoCompressorError = {
  code: OmniVideoCompressorErrorCode;
  message: string;
  boundary: OmniVideoCompressorBoundary;
  publicSafe: true;
  internalDetailExposed: false;
};

export type OmniVideoCompressorAuditEvent = {
  type: string;
  toolId: "omni.videoCompressor";
  invocationId: string;
  dryRun: true;
  inputPath?: string;
  outputPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type OmniVideoCompressorOutput = {
  kind: "agentCore.basicTool.omni.videoCompressor";
  target: OmniVideoCompressorTarget;
  dryRun: true;
  executionBlocked: true;
  unsafeSideEffects: false;
  permissionsRequired: readonly OmniVideoCompressorPermission[];
  requiresTapApproval: true;
  compressionEnvelope: {
    inputRead: false;
    outputWritten: false;
    plannedAsset: "video";
  };
};

export type OmniVideoCompressorResult =
  | {
      ok: true;
      toolId: "omni.videoCompressor";
      output: OmniVideoCompressorOutput;
      audit: readonly OmniVideoCompressorAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "omni.videoCompressor";
      error: OmniVideoCompressorError;
      audit: readonly OmniVideoCompressorAuditEvent[];
      events: readonly string[];
    };

export const omniVideoCompressorDescriptor = {
  toolId: "omni.videoCompressor",
  capability: "compress-video",
  route: "agent_executionEngine.basic_toolLayer.baseTools.omniBase.videoTransformer",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["filesystem:read", "filesystem:write", "omni:video:transform"],
} as const;

function cleanList<T extends string>(values: readonly T[] | undefined): T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function invocationId(context: OmniVideoCompressorContext | undefined): string {
  return context?.invocationId?.trim() || "omni.videoCompressor:dry-run";
}

function auditEvent(
  type: string,
  context: OmniVideoCompressorContext | undefined,
  inputPath?: string,
  outputPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): OmniVideoCompressorAuditEvent {
  return {
    type,
    toolId: omniVideoCompressorDescriptor.toolId,
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
  code: OmniVideoCompressorErrorCode,
  message: string,
  boundary: OmniVideoCompressorBoundary,
  context: OmniVideoCompressorContext | undefined,
  inputPath?: string,
  outputPath?: string,
): OmniVideoCompressorResult {
  return {
    ok: false,
    toolId: omniVideoCompressorDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.omni.videoCompressor.rejected", context, inputPath, outputPath, { code })],
    events: ["basicTool.omni.videoCompressor.rejected"],
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
  context: OmniVideoCompressorContext | undefined,
): OmniVideoCompressorResult | undefined {
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
    "omni.videoCompressor inputPath and outputPath must stay inside the declared video roots",
    "scope",
    context,
    inputPath,
    outputPath,
  );
}

function ensurePermissions(
  inputPath: string,
  outputPath: string,
  context: OmniVideoCompressorContext | undefined,
): OmniVideoCompressorResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = omniVideoCompressorDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure("PERMISSION_DENIED", `omni.videoCompressor is missing permission: ${missing[0]}`, "permission", context, inputPath, outputPath);
}

function ensureScopes(
  inputPath: string,
  outputPath: string,
  context: OmniVideoCompressorContext | undefined,
): OmniVideoCompressorResult | undefined {
  const requested = cleanList(context?.requestedScopes);
  const allowed = cleanList(context?.allowedScopes);
  const denied = requested.filter((scope) => !allowed.includes(scope));

  if (requested.length === 0 || denied.length === 0) {
    return undefined;
  }

  return failure("SCOPE_DENIED", `omni.videoCompressor scope ${denied[0]} is outside runtime governance`, "scope", context, inputPath, outputPath);
}

function normalizePreset(
  preset: string | undefined,
  context: OmniVideoCompressorContext | undefined,
  inputPath: string,
  outputPath: string,
): OmniVideoCompressionPreset | OmniVideoCompressorResult {
  if (preset === undefined || preset.trim() === "") {
    return "balanced";
  }

  if (preset === "draft" || preset === "balanced" || preset === "archive") {
    return preset;
  }

  return failure("INVALID_QUALITY_PRESET", "omni.videoCompressor qualityPreset is not supported", "input", context, inputPath, outputPath);
}

function ensurePositiveInteger(
  value: number | undefined,
  code: "INVALID_TARGET_BITRATE" | "INVALID_MAX_OUTPUT_BYTES",
  message: string,
  context: OmniVideoCompressorContext | undefined,
  inputPath: string,
  outputPath: string,
): number | undefined | OmniVideoCompressorResult {
  if (value === undefined) {
    return undefined;
  }

  if (Number.isInteger(value) && value > 0) {
    return value;
  }

  return failure(code, message, "input", context, inputPath, outputPath);
}

function ensureGates(
  inputPath: string,
  outputPath: string,
  context: OmniVideoCompressorContext | undefined,
): OmniVideoCompressorResult | undefined {
  if (context?.dryRun === false) {
    return failure(
      "REAL_EXECUTION_BLOCKED",
      "first-round omni.videoCompressor does not read or write video files",
      "contract",
      context,
      inputPath,
      outputPath,
    );
  }

  if (context?.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      context.contract.reason ?? "omni.videoCompressor was rejected by runtime contract surface",
      "contract",
      context,
      inputPath,
      outputPath,
    );
  }

  if (context?.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      context.governance.reason ?? "omni.videoCompressor was rejected by runtime governance",
      "governance",
      context,
      inputPath,
      outputPath,
    );
  }

  return undefined;
}

export function planOmniVideoCompression(request: OmniVideoCompressorRequest = {}): OmniVideoCompressorResult {
  const inputPath = normalizePath(request.target?.inputPath);
  if (inputPath === undefined) {
    return failure("MISSING_INPUT_PATH", "omni.videoCompressor requires target.inputPath", "input", request.context);
  }

  const outputPath = normalizePath(request.target?.outputPath);
  if (outputPath === undefined) {
    return failure("MISSING_OUTPUT_PATH", "omni.videoCompressor requires target.outputPath", "input", request.context, inputPath);
  }

  const qualityPreset = normalizePreset(request.target?.qualityPreset, request.context, inputPath, outputPath);
  if (typeof qualityPreset !== "string") {
    return qualityPreset;
  }

  const targetBitrateKbps = ensurePositiveInteger(
    request.target?.targetBitrateKbps,
    "INVALID_TARGET_BITRATE",
    "omni.videoCompressor targetBitrateKbps must be a positive integer",
    request.context,
    inputPath,
    outputPath,
  );
  if (typeof targetBitrateKbps === "object") {
    return targetBitrateKbps;
  }

  const maxOutputBytes = ensurePositiveInteger(
    request.target?.maxOutputBytes,
    "INVALID_MAX_OUTPUT_BYTES",
    "omni.videoCompressor maxOutputBytes must be a positive integer",
    request.context,
    inputPath,
    outputPath,
  );
  if (typeof maxOutputBytes === "object") {
    return maxOutputBytes;
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

  const target: OmniVideoCompressorTarget = {
    inputPath,
    outputPath,
    targetBitrateKbps,
    qualityPreset,
    maxOutputBytes,
  };

  return {
    ok: true,
    toolId: omniVideoCompressorDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.omni.videoCompressor",
      target,
      dryRun: true,
      executionBlocked: true,
      unsafeSideEffects: false,
      permissionsRequired: omniVideoCompressorDescriptor.permissionsRequired,
      requiresTapApproval: true,
      compressionEnvelope: {
        inputRead: false,
        outputWritten: false,
        plannedAsset: "video",
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.omni.videoCompressor.dryRun", request.context, inputPath, outputPath, {
        qualityPreset,
        targetBitrateKbps,
        maxOutputBytes,
      }),
    ],
    events: ["basicTool.omni.videoCompressor.dryRun"],
  };
}
