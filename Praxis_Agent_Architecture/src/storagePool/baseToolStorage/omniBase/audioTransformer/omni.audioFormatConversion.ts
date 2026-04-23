/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 多模态基础工具 / 音频转换工具。
 * 核心目的：提供 多模态基础工具 / 音频转换工具 中的“转换音频格式”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type AudioTransformerPermission =
  | "omni:audio:read"
  | "omni:audio:write"
  | "omni:audio:generate"
  | "provider:audio:invoke";

export type AudioTransformerBoundary = "input" | "scope" | "permission" | "contract" | "environment" | "provider";

export type AudioTransformerContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedInputRoots?: readonly string[];
  allowedOutputRoots?: readonly string[];
  grantedPermissions?: readonly AudioTransformerPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type AudioTransformerAuditEvent = {
  type: string;
  toolId: string;
  invocationId: string;
  dryRun: boolean;
  targetPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type AudioTransformerErrorCode =
  | "MISSING_SOURCE_PATH"
  | "MISSING_OUTPUT_PATH"
  | "MISSING_TARGET_FORMAT"
  | "MISSING_PROMPT"
  | "MISSING_LYRIC_BRIEF"
  | "UNSUPPORTED_AUDIO_FORMAT"
  | "INVALID_BITRATE"
  | "INVALID_SAMPLE_RATE"
  | "INVALID_CHANNEL_COUNT"
  | "INVALID_DURATION"
  | "INVALID_LINE_COUNT"
  | "INVALID_MAX_SIZE"
  | "INVALID_QUALITY"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type AudioTransformerError = {
  code: AudioTransformerErrorCode;
  message: string;
  boundary: AudioTransformerBoundary;
  publicSafe: true;
};

export type AudioTransformerResult<Output> =
  | {
      ok: true;
      toolId: string;
      output: Output;
      audit: readonly AudioTransformerAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: string;
      error: AudioTransformerError;
      audit: readonly AudioTransformerAuditEvent[];
      events: readonly string[];
    };

export type AudioTransformerFormat = "wav" | "mp3" | "flac" | "aac" | "ogg" | "m4a" | "opus";

export type AudioFormatConversionTarget = {
  sourcePath: string;
  outputPath: string;
  targetFormat: AudioTransformerFormat;
  sourceFormat?: AudioTransformerFormat;
  sampleRateHz?: number;
  channels?: number;
  bitrateKbps?: number;
  preserveMetadata?: boolean;
};

export type AudioFormatConversionRequest = {
  target?: Partial<AudioFormatConversionTarget>;
  context?: AudioTransformerContext;
};

export type AudioFormatConversionOutput = {
  kind: "agentCore.basicTool.omni.audioFormatConversion";
  target: AudioFormatConversionTarget;
  operationPlan: {
    action: "convert-audio-format";
    sourcePath: string;
    outputPath: string;
    targetFormat: AudioTransformerFormat;
    sourceFormat?: AudioTransformerFormat;
    transforms: readonly string[];
  };
  commandPreview: readonly string[];
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly AudioTransformerPermission[];
  unsafeSideEffects: true;
  resultEnvelope: {
    outputPath: string;
    targetFormat: AudioTransformerFormat;
    produced: false;
  };
};

export const supportedAudioTransformerFormats = ["wav", "mp3", "flac", "aac", "ogg", "m4a", "opus"] as const;

export const audioFormatConversionDescriptor = {
  toolId: "omni.audioFormatConversion",
  capability: "convert-audio-format",
  route: "agent_executionEngine.basic_toolLayer.baseTools.omniBase.audioTransformer",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["omni:audio:read", "omni:audio:write"],
  unsafeSideEffects: true,
} as const;

export function cleanAudioTransformerList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

export function isBlankAudioTransformerValue(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

export function audioTransformerDryRunEnabled(context: AudioTransformerContext | undefined): boolean {
  return context?.dryRun !== false;
}

export function audioTransformerInvocationId(toolId: string, context: AudioTransformerContext | undefined): string {
  return context?.invocationId?.trim() || `${toolId}:dry-run`;
}

export function createAudioTransformerAuditEvent(
  toolId: string,
  type: string,
  context: AudioTransformerContext | undefined,
  targetPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): AudioTransformerAuditEvent {
  return {
    type,
    toolId,
    invocationId: audioTransformerInvocationId(toolId, context),
    dryRun: audioTransformerDryRunEnabled(context),
    targetPath,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

export function createAudioTransformerFailure<Output>(
  toolId: string,
  code: AudioTransformerErrorCode,
  message: string,
  boundary: AudioTransformerBoundary,
  context: AudioTransformerContext | undefined,
  targetPath?: string,
): AudioTransformerResult<Output> {
  return {
    ok: false,
    toolId,
    error: { code, message, boundary, publicSafe: true },
    audit: [createAudioTransformerAuditEvent(toolId, "agentCore.basicTool.omni.audioTransformer.rejected", context, targetPath, { code })],
    events: ["basicTool.omni.audioTransformer.rejected"],
  };
}

export function normalizeRequiredAudioPath(
  toolId: string,
  value: string | undefined,
  code: Extract<AudioTransformerErrorCode, "MISSING_SOURCE_PATH" | "MISSING_OUTPUT_PATH">,
  label: string,
  context: AudioTransformerContext | undefined,
): string | AudioTransformerResult<never> {
  const normalized = value?.trim() ?? "";
  if (isBlankAudioTransformerValue(normalized)) {
    return createAudioTransformerFailure(toolId, code, `${toolId} requires target.${label}`, "input", context, value);
  }

  return normalized;
}

export function normalizeAudioTransformerFormat(
  toolId: string,
  value: string | undefined,
  context: AudioTransformerContext | undefined,
  targetPath?: string,
): AudioTransformerFormat | AudioTransformerResult<never> {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (isBlankAudioTransformerValue(normalized)) {
    return createAudioTransformerFailure(
      toolId,
      "MISSING_TARGET_FORMAT",
      `${toolId} requires target.targetFormat`,
      "input",
      context,
      targetPath,
    );
  }

  if (supportedAudioTransformerFormats.includes(normalized as AudioTransformerFormat)) {
    return normalized as AudioTransformerFormat;
  }

  return createAudioTransformerFailure(
    toolId,
    "UNSUPPORTED_AUDIO_FORMAT",
    `${toolId} target.targetFormat must be one of: ${supportedAudioTransformerFormats.join(", ")}`,
    "input",
    context,
    targetPath,
  );
}

function normalizeAudioRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/, "");
}

export function ensureAudioTransformerPathScope<Output>(
  toolId: string,
  targetPath: string,
  context: AudioTransformerContext | undefined,
  direction: "input" | "output",
): AudioTransformerResult<Output> | undefined {
  const rawRoots = direction === "input" ? context?.allowedInputRoots : context?.allowedOutputRoots;
  const allowedRoots = cleanAudioTransformerList(rawRoots).map(normalizeAudioRoot);
  if (allowedRoots.length === 0) {
    return undefined;
  }

  const allowed = allowedRoots.some((root) => targetPath === root || targetPath.startsWith(`${root}/`));
  if (allowed) {
    return undefined;
  }

  return createAudioTransformerFailure(
    toolId,
    "SCOPE_REJECTED",
    `${toolId} ${direction} path is outside the allowed audio transformer roots`,
    "scope",
    context,
    targetPath,
  );
}

export function ensureAudioTransformerPermissions<Output>(
  toolId: string,
  permissionsRequired: readonly AudioTransformerPermission[],
  context: AudioTransformerContext | undefined,
  targetPath?: string,
): AudioTransformerResult<Output> | undefined {
  const granted = cleanAudioTransformerList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return createAudioTransformerFailure(
    toolId,
    "PERMISSION_DENIED",
    `${toolId} is missing permissions: ${missing.join(", ")}`,
    "permission",
    context,
    targetPath,
  );
}

export function blockRealAudioTransformerExecution<Output>(
  toolId: string,
  context: AudioTransformerContext | undefined,
  targetPath?: string,
): AudioTransformerResult<Output> | undefined {
  if (audioTransformerDryRunEnabled(context)) {
    return undefined;
  }

  return createAudioTransformerFailure(
    toolId,
    "REAL_EXECUTION_BLOCKED",
    `${toolId} only returns a guarded dry-run plan in the first implementation`,
    "contract",
    context,
    targetPath,
  );
}

function positiveInteger(
  toolId: string,
  value: number | undefined,
  code: Extract<AudioTransformerErrorCode, "INVALID_SAMPLE_RATE" | "INVALID_CHANNEL_COUNT" | "INVALID_BITRATE">,
  label: string,
  context: AudioTransformerContext | undefined,
  targetPath: string,
): number | undefined | AudioTransformerResult<never> {
  if (value === undefined) {
    return undefined;
  }

  if (Number.isInteger(value) && value > 0) {
    return value;
  }

  return createAudioTransformerFailure(toolId, code, `${toolId} target.${label} must be a positive integer`, "input", context, targetPath);
}

function normalizeFormatConversionTarget(
  target: Partial<AudioFormatConversionTarget> | undefined,
  context: AudioTransformerContext | undefined,
): AudioFormatConversionTarget | AudioTransformerResult<AudioFormatConversionOutput> {
  const toolId = audioFormatConversionDescriptor.toolId;
  const sourcePath = normalizeRequiredAudioPath(toolId, target?.sourcePath, "MISSING_SOURCE_PATH", "sourcePath", context);
  if (typeof sourcePath !== "string") {
    return sourcePath;
  }

  const outputPath = normalizeRequiredAudioPath(toolId, target?.outputPath, "MISSING_OUTPUT_PATH", "outputPath", context);
  if (typeof outputPath !== "string") {
    return outputPath;
  }

  const targetFormat = normalizeAudioTransformerFormat(toolId, target?.targetFormat, context, outputPath);
  if (typeof targetFormat !== "string") {
    return targetFormat;
  }

  const sourceFormat =
    target?.sourceFormat === undefined
      ? undefined
      : normalizeAudioTransformerFormat(toolId, target.sourceFormat, context, sourcePath);
  if (sourceFormat !== undefined && typeof sourceFormat !== "string") {
    return sourceFormat;
  }

  const sampleRateHz = positiveInteger(toolId, target?.sampleRateHz, "INVALID_SAMPLE_RATE", "sampleRateHz", context, outputPath);
  if (typeof sampleRateHz === "object") {
    return sampleRateHz;
  }

  const channels = positiveInteger(toolId, target?.channels, "INVALID_CHANNEL_COUNT", "channels", context, outputPath);
  if (typeof channels === "object") {
    return channels;
  }

  const bitrateKbps = positiveInteger(toolId, target?.bitrateKbps, "INVALID_BITRATE", "bitrateKbps", context, outputPath);
  if (typeof bitrateKbps === "object") {
    return bitrateKbps;
  }

  return {
    sourcePath,
    outputPath,
    targetFormat,
    sourceFormat,
    sampleRateHz,
    channels,
    bitrateKbps,
    preserveMetadata: target?.preserveMetadata === true,
  };
}

function formatConversionTransforms(target: AudioFormatConversionTarget): readonly string[] {
  return [
    "decode-source-audio",
    `encode-${target.targetFormat}`,
    ...(target.sampleRateHz === undefined ? [] : [`resample-${target.sampleRateHz}hz`]),
    ...(target.channels === undefined ? [] : [`channels-${target.channels}`]),
    ...(target.bitrateKbps === undefined ? [] : [`bitrate-${target.bitrateKbps}kbps`]),
    ...(target.preserveMetadata ? ["preserve-metadata"] : ["strip-unsafe-runtime-state"]),
  ];
}

function formatConversionCommandPreview(target: AudioFormatConversionTarget): readonly string[] {
  return [
    "omni-audio-format-conversion",
    "--input",
    target.sourcePath,
    "--output",
    target.outputPath,
    "--target-format",
    target.targetFormat,
    ...(target.sourceFormat === undefined ? [] : ["--source-format", target.sourceFormat]),
    ...(target.sampleRateHz === undefined ? [] : ["--sample-rate-hz", String(target.sampleRateHz)]),
    ...(target.channels === undefined ? [] : ["--channels", String(target.channels)]),
    ...(target.bitrateKbps === undefined ? [] : ["--bitrate-kbps", String(target.bitrateKbps)]),
  ];
}

export function planAudioFormatConversion(request: AudioFormatConversionRequest = {}): AudioTransformerResult<AudioFormatConversionOutput> {
  const toolId = audioFormatConversionDescriptor.toolId;
  const target = normalizeFormatConversionTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const inputScopeFailure = ensureAudioTransformerPathScope<AudioFormatConversionOutput>(
    toolId,
    target.sourcePath,
    request.context,
    "input",
  );
  if (inputScopeFailure !== undefined) {
    return inputScopeFailure;
  }

  const outputScopeFailure = ensureAudioTransformerPathScope<AudioFormatConversionOutput>(
    toolId,
    target.outputPath,
    request.context,
    "output",
  );
  if (outputScopeFailure !== undefined) {
    return outputScopeFailure;
  }

  const permissionFailure = ensureAudioTransformerPermissions<AudioFormatConversionOutput>(
    toolId,
    audioFormatConversionDescriptor.permissionsRequired,
    request.context,
    target.outputPath,
  );
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = blockRealAudioTransformerExecution<AudioFormatConversionOutput>(
    toolId,
    request.context,
    target.outputPath,
  );
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  const transforms = formatConversionTransforms(target);

  return {
    ok: true,
    toolId,
    output: {
      kind: "agentCore.basicTool.omni.audioFormatConversion",
      target,
      operationPlan: {
        action: "convert-audio-format",
        sourcePath: target.sourcePath,
        outputPath: target.outputPath,
        targetFormat: target.targetFormat,
        sourceFormat: target.sourceFormat,
        transforms,
      },
      commandPreview: formatConversionCommandPreview(target),
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: audioFormatConversionDescriptor.permissionsRequired,
      unsafeSideEffects: true,
      resultEnvelope: {
        outputPath: target.outputPath,
        targetFormat: target.targetFormat,
        produced: false,
      },
    },
    audit: [
      createAudioTransformerAuditEvent(toolId, "agentCore.basicTool.omni.audioFormatConversion.dryRun", request.context, target.outputPath, {
        sourcePath: target.sourcePath,
        targetFormat: target.targetFormat,
        transforms,
      }),
    ],
    events: ["basicTool.omni.audioFormatConversion.dryRun"],
  };
}
