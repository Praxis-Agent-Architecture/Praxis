/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 多模态基础工具 / 音频转换工具。
 * 核心目的：提供 多模态基础工具 / 音频转换工具 中的“生成音频”基础能力原语。
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
  isBlankAudioTransformerValue,
  normalizeAudioTransformerFormat,
  normalizeRequiredAudioPath,
  type AudioTransformerContext,
  type AudioTransformerFormat,
  type AudioTransformerPermission,
  type AudioTransformerResult,
} from "./omni.audioFormatConversion.js";

export type GenerateAudioTarget = {
  prompt: string;
  outputPath: string;
  targetFormat: AudioTransformerFormat;
  voiceHint?: string;
  durationSeconds?: number;
  sampleRateHz?: number;
  seed?: number;
  safetyMode?: "strict" | "standard";
};

export type GenerateAudioRequest = {
  target?: Partial<GenerateAudioTarget>;
  context?: AudioTransformerContext;
};

export type GenerateAudioOutput = {
  kind: "agentCore.basicTool.omni.generateAudio";
  target: GenerateAudioTarget;
  operationPlan: {
    action: "generate-audio";
    outputPath: string;
    targetFormat: AudioTransformerFormat;
    providerInvocationBlocked: true;
  };
  promptEnvelope: {
    prompt: string;
    voiceHint?: string;
    durationSeconds?: number;
    sampleRateHz?: number;
    seed?: number;
    safetyMode: "strict" | "standard";
  };
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly AudioTransformerPermission[];
  unsafeSideEffects: true;
  resultEnvelope: {
    outputPath: string;
    audioGenerated: false;
    targetFormat: AudioTransformerFormat;
  };
};

export const generateAudioDescriptor = {
  toolId: "omni.generateAudio",
  capability: "generate-audio",
  route: "agent_executionEngine.basic_toolLayer.baseTools.omniBase.audioTransformer",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["omni:audio:generate", "provider:audio:invoke", "omni:audio:write"],
  unsafeSideEffects: true,
} as const;

function normalizeDuration(
  durationSeconds: number | undefined,
  context: AudioTransformerContext | undefined,
  outputPath: string,
): number | undefined | AudioTransformerResult<never> {
  if (durationSeconds === undefined) {
    return undefined;
  }

  if (Number.isFinite(durationSeconds) && durationSeconds > 0 && durationSeconds <= 900) {
    return durationSeconds;
  }

  return createAudioTransformerFailure(
    generateAudioDescriptor.toolId,
    "INVALID_DURATION",
    `${generateAudioDescriptor.toolId} target.durationSeconds must be between 0 and 900`,
    "input",
    context,
    outputPath,
  );
}

function normalizeSampleRate(
  sampleRateHz: number | undefined,
  context: AudioTransformerContext | undefined,
  outputPath: string,
): number | undefined | AudioTransformerResult<never> {
  if (sampleRateHz === undefined) {
    return undefined;
  }

  if (Number.isInteger(sampleRateHz) && sampleRateHz > 0) {
    return sampleRateHz;
  }

  return createAudioTransformerFailure(
    generateAudioDescriptor.toolId,
    "INVALID_SAMPLE_RATE",
    `${generateAudioDescriptor.toolId} target.sampleRateHz must be a positive integer`,
    "input",
    context,
    outputPath,
  );
}

function normalizeGenerateAudioTarget(
  target: Partial<GenerateAudioTarget> | undefined,
  context: AudioTransformerContext | undefined,
): GenerateAudioTarget | AudioTransformerResult<GenerateAudioOutput> {
  const toolId = generateAudioDescriptor.toolId;
  const prompt = target?.prompt?.trim() ?? "";
  if (isBlankAudioTransformerValue(prompt)) {
    return createAudioTransformerFailure(toolId, "MISSING_PROMPT", `${toolId} requires target.prompt`, "input", context);
  }

  const outputPath = normalizeRequiredAudioPath(toolId, target?.outputPath, "MISSING_OUTPUT_PATH", "outputPath", context);
  if (typeof outputPath !== "string") {
    return outputPath;
  }

  const targetFormat = normalizeAudioTransformerFormat(toolId, target?.targetFormat, context, outputPath);
  if (typeof targetFormat !== "string") {
    return targetFormat;
  }

  const durationSeconds = normalizeDuration(target?.durationSeconds, context, outputPath);
  if (typeof durationSeconds === "object") {
    return durationSeconds;
  }

  const sampleRateHz = normalizeSampleRate(target?.sampleRateHz, context, outputPath);
  if (typeof sampleRateHz === "object") {
    return sampleRateHz;
  }

  return {
    prompt,
    outputPath,
    targetFormat,
    voiceHint: target?.voiceHint?.trim() || undefined,
    durationSeconds,
    sampleRateHz,
    seed: target?.seed,
    safetyMode: target?.safetyMode === "standard" ? "standard" : "strict",
  };
}

export function planGenerateAudio(request: GenerateAudioRequest = {}): AudioTransformerResult<GenerateAudioOutput> {
  const toolId = generateAudioDescriptor.toolId;
  const target = normalizeGenerateAudioTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const outputScopeFailure = ensureAudioTransformerPathScope<GenerateAudioOutput>(
    toolId,
    target.outputPath,
    request.context,
    "output",
  );
  if (outputScopeFailure !== undefined) {
    return outputScopeFailure;
  }

  const permissionFailure = ensureAudioTransformerPermissions<GenerateAudioOutput>(
    toolId,
    generateAudioDescriptor.permissionsRequired,
    request.context,
    target.outputPath,
  );
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = blockRealAudioTransformerExecution<GenerateAudioOutput>(
    toolId,
    request.context,
    target.outputPath,
  );
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  return {
    ok: true,
    toolId,
    output: {
      kind: "agentCore.basicTool.omni.generateAudio",
      target,
      operationPlan: {
        action: "generate-audio",
        outputPath: target.outputPath,
        targetFormat: target.targetFormat,
        providerInvocationBlocked: true,
      },
      promptEnvelope: {
        prompt: target.prompt,
        voiceHint: target.voiceHint,
        durationSeconds: target.durationSeconds,
        sampleRateHz: target.sampleRateHz,
        seed: target.seed,
        safetyMode: target.safetyMode ?? "strict",
      },
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: generateAudioDescriptor.permissionsRequired,
      unsafeSideEffects: true,
      resultEnvelope: {
        outputPath: target.outputPath,
        audioGenerated: false,
        targetFormat: target.targetFormat,
      },
    },
    audit: [
      createAudioTransformerAuditEvent(toolId, "agentCore.basicTool.omni.generateAudio.dryRun", request.context, target.outputPath, {
        targetFormat: target.targetFormat,
        durationSeconds: target.durationSeconds,
        providerInvocationBlocked: true,
      }),
    ],
    events: ["basicTool.omni.generateAudio.dryRun"],
  };
}
