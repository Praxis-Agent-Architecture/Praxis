/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 多模态基础工具 / 音频转换工具。
 * 核心目的：提供 多模态基础工具 / 音频转换工具 中的“压缩音频”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  blockRealAudioTransformerExecution,
  createAudioTransformerAuditEvent,
  createAudioTransformerFailure,
  ensureAudioTransformerPathScope,
  ensureAudioTransformerPermissions,
  normalizeRequiredAudioPath,
  type AudioTransformerContext,
  type AudioTransformerPermission,
  type AudioTransformerResult,
} from "./omni.audioFormatConversion.js";

export type AudioCompressionProfile = "speech" | "music" | "archive" | "preview";

export type AudioCompressionTarget = {
  sourcePath: string;
  outputPath: string;
  profile?: AudioCompressionProfile;
  codec?: string;
  bitrateKbps?: number;
  quality?: number;
  maxSizeBytes?: number;
  preserveMetadata?: boolean;
};

export type AudioCompressionRequest = {
  target?: Partial<AudioCompressionTarget>;
  context?: AudioTransformerContext;
};

export type AudioCompressionOutput = {
  kind: "agentCore.basicTool.omni.audioCompressor";
  target: AudioCompressionTarget;
  operationPlan: {
    action: "compress-audio";
    sourcePath: string;
    outputPath: string;
    profile: AudioCompressionProfile;
    constraints: readonly string[];
  };
  commandPreview: readonly string[];
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly AudioTransformerPermission[];
  unsafeSideEffects: true;
  resultEnvelope: {
    outputPath: string;
    compressed: false;
    estimatedOnly: true;
  };
};

export const audioCompressorDescriptor = {
  toolId: "omni.audioCompressor",
  capability: "compress-audio",
  route: "agent_executionEngine.basic_toolLayer.baseTools.omniBase.audioTransformer",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["omni:audio:read", "omni:audio:write"],
  unsafeSideEffects: true,
} as const;

function normalizeCompressionProfile(profile: string | undefined): AudioCompressionProfile {
  if (profile === "music" || profile === "archive" || profile === "preview") {
    return profile;
  }

  return "speech";
}

function positiveInteger(
  value: number | undefined,
  code: "INVALID_BITRATE" | "INVALID_MAX_SIZE",
  label: string,
  context: AudioTransformerContext | undefined,
  outputPath: string,
): number | undefined | AudioTransformerResult<never> {
  if (value === undefined) {
    return undefined;
  }

  if (Number.isInteger(value) && value > 0) {
    return value;
  }

  return createAudioTransformerFailure(
    audioCompressorDescriptor.toolId,
    code,
    `${audioCompressorDescriptor.toolId} target.${label} must be a positive integer`,
    "input",
    context,
    outputPath,
  );
}

function normalizeQuality(
  quality: number | undefined,
  context: AudioTransformerContext | undefined,
  outputPath: string,
): number | undefined | AudioTransformerResult<never> {
  if (quality === undefined) {
    return undefined;
  }

  if (Number.isFinite(quality) && quality >= 0 && quality <= 1) {
    return quality;
  }

  return createAudioTransformerFailure(
    audioCompressorDescriptor.toolId,
    "INVALID_QUALITY",
    `${audioCompressorDescriptor.toolId} target.quality must be between 0 and 1`,
    "input",
    context,
    outputPath,
  );
}

function normalizeCompressionTarget(
  target: Partial<AudioCompressionTarget> | undefined,
  context: AudioTransformerContext | undefined,
): AudioCompressionTarget | AudioTransformerResult<AudioCompressionOutput> {
  const toolId = audioCompressorDescriptor.toolId;
  const sourcePath = normalizeRequiredAudioPath(toolId, target?.sourcePath, "MISSING_SOURCE_PATH", "sourcePath", context);
  if (typeof sourcePath !== "string") {
    return sourcePath;
  }

  const outputPath = normalizeRequiredAudioPath(toolId, target?.outputPath, "MISSING_OUTPUT_PATH", "outputPath", context);
  if (typeof outputPath !== "string") {
    return outputPath;
  }

  const bitrateKbps = positiveInteger(target?.bitrateKbps, "INVALID_BITRATE", "bitrateKbps", context, outputPath);
  if (typeof bitrateKbps === "object") {
    return bitrateKbps;
  }

  const maxSizeBytes = positiveInteger(target?.maxSizeBytes, "INVALID_MAX_SIZE", "maxSizeBytes", context, outputPath);
  if (typeof maxSizeBytes === "object") {
    return maxSizeBytes;
  }

  const quality = normalizeQuality(target?.quality, context, outputPath);
  if (typeof quality === "object") {
    return quality;
  }

  return {
    sourcePath,
    outputPath,
    profile: normalizeCompressionProfile(target?.profile),
    codec: target?.codec?.trim() || undefined,
    bitrateKbps,
    quality,
    maxSizeBytes,
    preserveMetadata: target?.preserveMetadata === true,
  };
}

function compressionConstraints(target: AudioCompressionTarget): readonly string[] {
  return [
    `profile-${target.profile ?? "speech"}`,
    ...(target.codec === undefined ? [] : [`codec-${target.codec}`]),
    ...(target.bitrateKbps === undefined ? [] : [`bitrate-${target.bitrateKbps}kbps`]),
    ...(target.quality === undefined ? [] : [`quality-${target.quality}`]),
    ...(target.maxSizeBytes === undefined ? [] : [`max-size-${target.maxSizeBytes}bytes`]),
    ...(target.preserveMetadata ? ["preserve-metadata"] : ["metadata-not-guaranteed"]),
  ];
}

function compressionCommandPreview(target: AudioCompressionTarget): readonly string[] {
  return [
    "omni-audio-compressor",
    "--input",
    target.sourcePath,
    "--output",
    target.outputPath,
    "--profile",
    target.profile ?? "speech",
    ...(target.codec === undefined ? [] : ["--codec", target.codec]),
    ...(target.bitrateKbps === undefined ? [] : ["--bitrate-kbps", String(target.bitrateKbps)]),
    ...(target.quality === undefined ? [] : ["--quality", String(target.quality)]),
    ...(target.maxSizeBytes === undefined ? [] : ["--max-size-bytes", String(target.maxSizeBytes)]),
  ];
}

export function planAudioCompression(request: AudioCompressionRequest = {}): AudioTransformerResult<AudioCompressionOutput> {
  const toolId = audioCompressorDescriptor.toolId;
  const target = normalizeCompressionTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const inputScopeFailure = ensureAudioTransformerPathScope<AudioCompressionOutput>(
    toolId,
    target.sourcePath,
    request.context,
    "input",
  );
  if (inputScopeFailure !== undefined) {
    return inputScopeFailure;
  }

  const outputScopeFailure = ensureAudioTransformerPathScope<AudioCompressionOutput>(
    toolId,
    target.outputPath,
    request.context,
    "output",
  );
  if (outputScopeFailure !== undefined) {
    return outputScopeFailure;
  }

  const permissionFailure = ensureAudioTransformerPermissions<AudioCompressionOutput>(
    toolId,
    audioCompressorDescriptor.permissionsRequired,
    request.context,
    target.outputPath,
  );
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = blockRealAudioTransformerExecution<AudioCompressionOutput>(
    toolId,
    request.context,
    target.outputPath,
  );
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  const constraints = compressionConstraints(target);

  return {
    ok: true,
    toolId,
    output: {
      kind: "agentCore.basicTool.omni.audioCompressor",
      target,
      operationPlan: {
        action: "compress-audio",
        sourcePath: target.sourcePath,
        outputPath: target.outputPath,
        profile: target.profile ?? "speech",
        constraints,
      },
      commandPreview: compressionCommandPreview(target),
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: audioCompressorDescriptor.permissionsRequired,
      unsafeSideEffects: true,
      resultEnvelope: {
        outputPath: target.outputPath,
        compressed: false,
        estimatedOnly: true,
      },
    },
    audit: [
      createAudioTransformerAuditEvent(toolId, "agentCore.basicTool.omni.audioCompressor.dryRun", request.context, target.outputPath, {
        sourcePath: target.sourcePath,
        profile: target.profile,
        constraints,
      }),
    ],
    events: ["basicTool.omni.audioCompressor.dryRun"],
  };
}
