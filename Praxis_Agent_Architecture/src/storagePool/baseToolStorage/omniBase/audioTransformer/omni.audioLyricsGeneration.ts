/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 多模态基础工具 / 音频转换工具。
 * 核心目的：提供 多模态基础工具 / 音频转换工具 中的“生成歌词”基础能力原语。
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
  type AudioTransformerContext,
  type AudioTransformerPermission,
  type AudioTransformerResult,
} from "./omni.audioFormatConversion.js";

export type AudioLyricsSection = "verse" | "chorus" | "bridge" | "hook" | "intro" | "outro";

export type AudioLyricsGenerationTarget = {
  brief: string;
  language?: string;
  styleHint?: string;
  sections?: readonly AudioLyricsSection[];
  lineCount?: number;
  audioReferencePath?: string;
  outputTextPath?: string;
  avoidCopyrightedLyrics?: boolean;
};

export type AudioLyricsGenerationRequest = {
  target?: Partial<AudioLyricsGenerationTarget>;
  context?: AudioTransformerContext;
};

export type AudioLyricsGenerationOutput = {
  kind: "agentCore.basicTool.omni.audioLyricsGeneration";
  target: AudioLyricsGenerationTarget;
  operationPlan: {
    action: "generate-lyrics";
    brief: string;
    sections: readonly AudioLyricsSection[];
    usesAudioReference: boolean;
    outputTextPath?: string;
  };
  promptEnvelope: {
    brief: string;
    language?: string;
    styleHint?: string;
    lineCount?: number;
    avoidCopyrightedLyrics: true;
  };
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly AudioTransformerPermission[];
  unsafeSideEffects: boolean;
  resultEnvelope: {
    lyricsGenerated: false;
    outputTextPath?: string;
  };
};

export const audioLyricsGenerationDescriptor = {
  toolId: "omni.audioLyricsGeneration",
  capability: "generate-audio-lyrics",
  route: "agent_executionEngine.basic_toolLayer.baseTools.omniBase.audioTransformer",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["omni:audio:generate", "provider:audio:invoke"],
} as const;

function normalizeSections(sections: readonly AudioLyricsSection[] | undefined): readonly AudioLyricsSection[] {
  const allowed: readonly AudioLyricsSection[] = ["verse", "chorus", "bridge", "hook", "intro", "outro"];
  const normalized = [...new Set((sections ?? ["verse", "chorus"]).filter((section) => allowed.includes(section)))];
  return normalized.length === 0 ? ["verse", "chorus"] : normalized;
}

function normalizeLineCount(
  lineCount: number | undefined,
  context: AudioTransformerContext | undefined,
): number | undefined | AudioTransformerResult<never> {
  if (lineCount === undefined) {
    return undefined;
  }

  if (Number.isInteger(lineCount) && lineCount > 0 && lineCount <= 200) {
    return lineCount;
  }

  return createAudioTransformerFailure(
    audioLyricsGenerationDescriptor.toolId,
    "INVALID_LINE_COUNT",
    `${audioLyricsGenerationDescriptor.toolId} target.lineCount must be an integer from 1 to 200`,
    "input",
    context,
  );
}

function normalizeLyricsTarget(
  target: Partial<AudioLyricsGenerationTarget> | undefined,
  context: AudioTransformerContext | undefined,
): AudioLyricsGenerationTarget | AudioTransformerResult<AudioLyricsGenerationOutput> {
  const toolId = audioLyricsGenerationDescriptor.toolId;
  const brief = target?.brief?.trim() ?? "";
  if (isBlankAudioTransformerValue(brief)) {
    return createAudioTransformerFailure(toolId, "MISSING_LYRIC_BRIEF", `${toolId} requires target.brief`, "input", context);
  }

  const lineCount = normalizeLineCount(target?.lineCount, context);
  if (typeof lineCount === "object") {
    return lineCount;
  }

  return {
    brief,
    language: target?.language?.trim() || undefined,
    styleHint: target?.styleHint?.trim() || undefined,
    sections: normalizeSections(target?.sections),
    lineCount,
    audioReferencePath: target?.audioReferencePath?.trim() || undefined,
    outputTextPath: target?.outputTextPath?.trim() || undefined,
    avoidCopyrightedLyrics: true,
  };
}

function lyricsPermissions(target: AudioLyricsGenerationTarget): readonly AudioTransformerPermission[] {
  return target.outputTextPath === undefined
    ? audioLyricsGenerationDescriptor.permissionsRequired
    : [...audioLyricsGenerationDescriptor.permissionsRequired, "omni:audio:write"];
}

export function planAudioLyricsGeneration(
  request: AudioLyricsGenerationRequest = {},
): AudioTransformerResult<AudioLyricsGenerationOutput> {
  const toolId = audioLyricsGenerationDescriptor.toolId;
  const target = normalizeLyricsTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  if (target.audioReferencePath !== undefined) {
    const inputScopeFailure = ensureAudioTransformerPathScope<AudioLyricsGenerationOutput>(
      toolId,
      target.audioReferencePath,
      request.context,
      "input",
    );
    if (inputScopeFailure !== undefined) {
      return inputScopeFailure;
    }
  }

  if (target.outputTextPath !== undefined) {
    const outputScopeFailure = ensureAudioTransformerPathScope<AudioLyricsGenerationOutput>(
      toolId,
      target.outputTextPath,
      request.context,
      "output",
    );
    if (outputScopeFailure !== undefined) {
      return outputScopeFailure;
    }
  }

  const permissionsRequired = lyricsPermissions(target);
  const permissionFailure = ensureAudioTransformerPermissions<AudioLyricsGenerationOutput>(
    toolId,
    permissionsRequired,
    request.context,
    target.outputTextPath ?? target.audioReferencePath,
  );
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = blockRealAudioTransformerExecution<AudioLyricsGenerationOutput>(
    toolId,
    request.context,
    target.outputTextPath ?? target.audioReferencePath,
  );
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  return {
    ok: true,
    toolId,
    output: {
      kind: "agentCore.basicTool.omni.audioLyricsGeneration",
      target,
      operationPlan: {
        action: "generate-lyrics",
        brief: target.brief,
        sections: target.sections ?? ["verse", "chorus"],
        usesAudioReference: target.audioReferencePath !== undefined,
        outputTextPath: target.outputTextPath,
      },
      promptEnvelope: {
        brief: target.brief,
        language: target.language,
        styleHint: target.styleHint,
        lineCount: target.lineCount,
        avoidCopyrightedLyrics: true,
      },
      dryRun: true,
      executionBlocked: true,
      permissionsRequired,
      unsafeSideEffects: target.outputTextPath !== undefined,
      resultEnvelope: {
        lyricsGenerated: false,
        outputTextPath: target.outputTextPath,
      },
    },
    audit: [
      createAudioTransformerAuditEvent(
        toolId,
        "agentCore.basicTool.omni.audioLyricsGeneration.dryRun",
        request.context,
        target.outputTextPath ?? target.audioReferencePath,
        {
          sections: target.sections,
          usesAudioReference: target.audioReferencePath !== undefined,
          writesOutput: target.outputTextPath !== undefined,
        },
      ),
    ],
    events: ["basicTool.omni.audioLyricsGeneration.dryRun"],
  };
}
