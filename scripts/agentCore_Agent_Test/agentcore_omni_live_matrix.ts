import { readFileSync } from "node:fs";
import path from "node:path";

import type { BaseToolExecutorPort } from "../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import { adaptRuntimeToolInvocation } from "../../src/agentCore/agent_executionEngine/basic_toolLayer/invocationAdapter.js";
import { invokeChatGPTCodexResponses } from "../../src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/chatgpt_codex_responses.js";
import { resolveAuthEnvelope } from "../../src/agentCore/agent_modelAdapter/authProfileLayer/authResolver.js";
import { createCredentialRef } from "../../src/agentCore/agent_modelAdapter/authProfileLayer/credentialRef.js";
import { createProviderCaller } from "../../src/agentCore/agent_modelAdapter/providerAccessLayer/providerCaller.js";
import { createChatGPTCodexResponsesCarrier } from "../../src/agentCore/agent_modelAdapter/providerAccessLayer/providerCarrier.js";
import { fetchProviderTransport } from "../../src/agentCore/agent_modelAdapter/providerAccessLayer/transportCaller.js";
import { bridgeExecEngineInvocation } from "../../src/agentCore/agent_runtimeImplementation/runtime.execEngine/execEngineInvocationBridge.js";

const args = process.argv.slice(2);
const argSet = new Set(args);
const codexAuthPath = process.env.AGENTCORE_CODEX_AUTH_FILE
  ?? path.join(process.env.CODEX_HOME ?? path.join(process.env.HOME ?? "", ".codex"), "auth.json");
const chatgptCodexClientVersion = process.env.AGENTCORE_CODEX_CLIENT_VERSION ?? "0.118.0";
const model = process.env.AGENTCORE_CODEX_MODEL
  ?? process.env.OPENAI_AGENTCORE_MODEL
  ?? process.env.OPENAI_SMOKE_MODEL
  ?? "gpt-5.5";
const reasoningEffort =
  process.env.AGENTCORE_CODEX_REASONING_EFFORT ??
  process.env.OPENAI_AGENTCORE_REASONING_EFFORT ??
  process.env.OPENAI_REASONING_EFFORT ??
  "low";
const maxOutputTokens = Number(process.env.OPENAI_AGENTCORE_MAX_OUTPUT_TOKENS ?? "768");
const useModel = !argSet.has("--no-model");
const dialogueMode = argSet.has("--dialogue");

type OmniToolCall = {
  tool: string;
  arguments: Readonly<Record<string, unknown>>;
};

type OmniLiveCase = {
  toolId: string;
  userPrompt: string;
  input: Readonly<Record<string, unknown>>;
  expectedOperation: string;
};

const omniLiveCases: readonly OmniLiveCase[] = [
  {
    toolId: "omni.viewImage",
    userPrompt: "请把 /workspace/media/source.png 这张图交给 runtime 查看，细节用 high。",
    input: {
      target: { imagePath: "/workspace/media/source.png", mediaType: "image/png", detail: "high" },
      context: { dryRun: false, guard: { allowed: true, accepted: true }, grantedPermissions: ["filesystem:read", "omni:image:view"] },
    },
    expectedOperation: "omni.viewImage.prepareImageInput",
  },
  {
    toolId: "omni.generateImage",
    userPrompt: "帮我生成一张干净的产品预览图，结果放到 /workspace/output/product.png。",
    input: {
      target: { prompt: "A clean product preview on a white desk.", outputPath: "/workspace/output/product.png", targetFormat: "png" },
      context: { dryRun: false, guard: { allowed: true, accepted: true }, grantedPermissions: ["provider:invoke", "omni:image:generate", "omni:image:write"] },
    },
    expectedOperation: "omni.generateImage.generateimage",
  },
  {
    toolId: "omni.imageCompressor",
    userPrompt: "把 /workspace/media/source.png 压缩成 webp，输出 /workspace/output/source.webp。",
    input: {
      target: { inputPath: "/workspace/media/source.png", outputPath: "/workspace/output/source.webp", targetFormat: "webp", maxBytes: 600000 },
      context: { dryRun: false, guard: { allowed: true, accepted: true }, grantedPermissions: ["omni:image:read", "omni:image:write"] },
    },
    expectedOperation: "omni.imageCompressor.compressimage",
  },
  {
    toolId: "omni.listenAudio",
    userPrompt: "请听一下 /workspace/media/meeting.wav 并交给 runtime 做音频理解。",
    input: {
      target: { inputPath: "/workspace/media/meeting.wav", targetFormat: "text" },
      context: { dryRun: false, guard: { allowed: true, accepted: true }, grantedPermissions: ["omni:audio:read", "provider:invoke"] },
    },
    expectedOperation: "omni.listenAudio.listenaudio",
  },
  {
    toolId: "omni.audioLyricsGeneration",
    userPrompt: "从 /workspace/media/song.wav 生成歌词或转写文本。",
    input: {
      target: { inputPath: "/workspace/media/song.wav", targetFormat: "text" },
      context: { dryRun: false, guard: { allowed: true, accepted: true }, grantedPermissions: ["omni:audio:read", "provider:invoke"] },
    },
    expectedOperation: "omni.audioLyricsGeneration.generateaudiolyrics",
  },
  {
    toolId: "omni.generateAudio",
    userPrompt: "生成一个两秒钟的提示音，保存到 /workspace/output/chime.wav。",
    input: {
      target: { prompt: "Create a short two second confirmation chime.", outputPath: "/workspace/output/chime.wav", targetFormat: "wav", durationSeconds: 2 },
      context: { dryRun: false, guard: { allowed: true, accepted: true }, grantedPermissions: ["provider:invoke", "omni:audio:generate", "omni:audio:write"] },
    },
    expectedOperation: "omni.generateAudio.generateaudio",
  },
  {
    toolId: "omni.audioCompressor",
    userPrompt: "把 /workspace/media/source.wav 压缩一下，输出到 /workspace/output/source.wav。",
    input: {
      target: { inputPath: "/workspace/media/source.wav", outputPath: "/workspace/output/source.wav", targetFormat: "wav", maxBytes: 5000000 },
      context: { dryRun: false, guard: { allowed: true, accepted: true }, grantedPermissions: ["omni:audio:read", "omni:audio:write"] },
    },
    expectedOperation: "omni.audioCompressor.compressaudio",
  },
  {
    toolId: "omni.audioFormatConversion",
    userPrompt: "把 /workspace/media/source.wav 转成 mp3，结果放 /workspace/output/source.mp3。",
    input: {
      target: { inputPath: "/workspace/media/source.wav", outputPath: "/workspace/output/source.mp3", targetFormat: "mp3" },
      context: { dryRun: false, guard: { allowed: true, accepted: true }, grantedPermissions: ["omni:audio:read", "omni:audio:write"] },
    },
    expectedOperation: "omni.audioFormatConversion.convertaudioformat",
  },
  {
    toolId: "omni.viewVideo",
    userPrompt: "把 /workspace/media/source.mp4 交给 runtime 做视频理解。",
    input: {
      target: { inputPath: "/workspace/media/source.mp4", targetFormat: "summary" },
      context: { dryRun: false, guard: { allowed: true, accepted: true }, grantedPermissions: ["omni:video:read", "provider:invoke"] },
    },
    expectedOperation: "omni.viewVideo.viewvideo",
  },
  {
    toolId: "omni.videoSubtitleGeneration",
    userPrompt: "给 /workspace/media/talk.mp4 生成 srt 字幕。",
    input: {
      target: { inputPath: "/workspace/media/talk.mp4", targetFormat: "srt" },
      context: { dryRun: false, guard: { allowed: true, accepted: true }, grantedPermissions: ["omni:video:read", "provider:invoke"] },
    },
    expectedOperation: "omni.videoSubtitleGeneration.generatevideosubtitles",
  },
  {
    toolId: "omni.videoCompressor",
    userPrompt: "把 /workspace/media/source.mp4 压缩后输出 /workspace/output/source.mp4。",
    input: {
      target: { inputPath: "/workspace/media/source.mp4", outputPath: "/workspace/output/source.mp4", targetFormat: "mp4", maxBytes: 12000000 },
      context: { dryRun: false, guard: { allowed: true, accepted: true }, grantedPermissions: ["omni:video:read", "omni:video:write"] },
    },
    expectedOperation: "omni.videoCompressor.compressvideo",
  },
  {
    toolId: "omni.videoFormatConversion",
    userPrompt: "把 /workspace/media/source.mov 转成 mp4，输出 /workspace/output/source.mp4。",
    input: {
      target: { inputPath: "/workspace/media/source.mov", outputPath: "/workspace/output/source.mp4", targetFormat: "mp4" },
      context: { dryRun: false, guard: { allowed: true, accepted: true }, grantedPermissions: ["omni:video:read", "omni:video:write"] },
    },
    expectedOperation: "omni.videoFormatConversion.convertvideoformat",
  },
  {
    toolId: "omni.generateVideo",
    userPrompt: "生成一个五秒短视频，保存到 /workspace/output/clip.mp4。",
    input: {
      target: { prompt: "Generate a five second product turntable video.", outputPath: "/workspace/output/clip.mp4", targetFormat: "mp4", durationSeconds: 5 },
      context: { dryRun: false, guard: { allowed: true, accepted: true }, grantedPermissions: ["provider:invoke", "omni:video:generate", "omni:video:write"] },
    },
    expectedOperation: "omni.generateVideo.generatevideo",
  },
  {
    toolId: "omni.imageFormatConversion",
    userPrompt: "把 /workspace/media/source.png 转成 jpg，输出 /workspace/output/source.jpg。",
    input: {
      target: { inputPath: "/workspace/media/source.png", outputPath: "/workspace/output/source.jpg", targetFormat: "jpg" },
      context: { dryRun: false, guard: { allowed: true, accepted: true }, grantedPermissions: ["omni:image:read", "omni:image:write"] },
    },
    expectedOperation: "omni.imageFormatConversion.convertimageformat",
  },
] as const;

function argValue(name: string): string | undefined {
  const prefix = `${name}=`;
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function extractSseText(text: string): string {
  const deltas: string[] = [];
  const completed: string[] = [];
  for (const line of text.split(/\r?\n/u)) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice("data:".length).trim();
    if (payload.length === 0 || payload === "[DONE]") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload) as unknown;
    } catch {
      continue;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) continue;
    const record = parsed as Record<string, unknown>;
    if (typeof record.delta === "string") deltas.push(record.delta);
    if (record.type === "response.completed" && record.response !== undefined) {
      const responseText = extractResponseText(record.response);
      if (responseText.trim().length > 0) completed.push(responseText);
    }
  }
  return deltas.join("").trim() || completed.join("\n").trim();
}

function extractResponseText(response: unknown): string {
  if (typeof response === "string") return extractSseText(response) || response;
  if (typeof response !== "object" || response === null) return String(response);
  const record = response as Record<string, unknown>;
  if (typeof record.output_text === "string" && record.output_text.trim().length > 0) return record.output_text.trim();
  const outputValue = record.output;
  if (Array.isArray(outputValue)) {
    const parts: string[] = [];
    for (const item of outputValue) {
      if (typeof item !== "object" || item === null) continue;
      const contentValue = (item as Record<string, unknown>).content;
      if (!Array.isArray(contentValue)) continue;
      for (const content of contentValue) {
        if (typeof content !== "object" || content === null) continue;
        const text = (content as Record<string, unknown>).text ?? (content as Record<string, unknown>).output_text;
        if (typeof text === "string" && text.trim().length > 0) parts.push(text.trim());
      }
    }
    if (parts.length > 0) return parts.join("\n");
  }
  return JSON.stringify(response, null, 2);
}

function parseJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/iu.exec(trimmed);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    const firstBrace = candidate.indexOf("{");
    const lastBrace = candidate.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) return JSON.parse(candidate.slice(firstBrace, lastBrace + 1)) as unknown;
    throw new Error(`model did not return JSON: ${text.slice(0, 400)}`);
  }
}

function normalizeOmniToolCall(value: unknown): OmniToolCall | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const toolCalls = record.tool_calls ?? record.toolCalls;
  const first = Array.isArray(toolCalls) ? toolCalls[0] : record;
  if (typeof first !== "object" || first === null || Array.isArray(first)) return undefined;
  const toolRecord = first as Record<string, unknown>;
  const tool = toolRecord.tool ?? toolRecord.name;
  const toolArguments = toolRecord.arguments;
  if (typeof tool !== "string" || !tool.startsWith("omni.")) return undefined;
  if (typeof toolArguments !== "object" || toolArguments === null || Array.isArray(toolArguments)) return undefined;
  return { tool, arguments: toolArguments as Readonly<Record<string, unknown>> };
}

async function callResponsesApi(prompt: string, instructions: string): Promise<string> {
  const credentialRef = createCredentialRef({
    id: "agentcore-omni-live-matrix-chatgpt-codex",
    provider: "openai",
    credentialType: "chatgpt_codex_oauth",
    source: { kind: "codex-auth-file", filePath: codexAuthPath },
  });
  if (!credentialRef.ok) throw new Error(JSON.stringify(credentialRef.error));

  const auth = resolveAuthEnvelope({
    credentialRef: credentialRef.credentialRef,
    readFile: (filePath) => readFileSync(filePath, "utf8"),
  });
  if (!auth.ok) throw new Error(JSON.stringify(auth.error));

  const carrier = createChatGPTCodexResponsesCarrier({
    carrierId: "chatgpt-codex.responses.agentcore-omni-live-matrix",
    model,
    reasoning: { effort: reasoningEffort },
    credentialRef: credentialRef.credentialRef,
    clientName: "praxis-agentcore-omni-live-matrix",
    clientVersion: chatgptCodexClientVersion,
  });
  if (!carrier.ok) throw new Error(JSON.stringify(carrier.error));

  const caller = createProviderCaller({ transport: fetchProviderTransport, authMaterial: auth.resolved.privateMaterial, timeoutMs: 60_000 });
  const result = await invokeChatGPTCodexResponses({
    operation: "create",
    baseUrl: carrier.carrier.baseURL,
    auth: auth.resolved.envelope,
    runtime: {
      runtimeId: "agentcore-omni-live-matrix-runtime",
      invocationId: `agentcore-omni-live-matrix-${Date.now()}`,
      callerId: "agentcore-omni-live-matrix",
    },
    governance: { accepted: true },
    dryRun: false,
    caller,
    headers: { "content-type": "application/json" },
    clientName: "praxis-agentcore-omni-live-matrix",
    clientVersion: chatgptCodexClientVersion,
    expectResponseObject: false,
    body: { model, instructions, input: prompt, reasoning: { effort: reasoningEffort }, max_output_tokens: maxOutputTokens },
  });
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return extractResponseText(result.response.raw);
}

function createOmniExecutor(calls: string[]): BaseToolExecutorPort {
  return {
    omni: {
      async transformMedia(request) {
        calls.push(`transform:${request.operation}`);
        return {
          ok: true,
          output: {
            artifactId: `artifact:omni-live:${request.operation}`,
            mimeType: typeof request.parameters?.targetFormat === "string"
              ? `application/x-${request.parameters.targetFormat}`
              : typeof request.parameters?.mediaType === "string"
                ? request.parameters.mediaType
                : "application/octet-stream",
          },
          metadata: {
            runtimeEntry: "BaseToolExecutorPort.omni.transformMedia",
            operation: request.operation,
            inputArtifactId: request.inputArtifactId,
            labMode: "deterministic-omni-live-matrix",
          },
        };
      },
    },
  };
}

async function invokeOmniToolThroughRuntimeChain(
  toolCall: OmniToolCall,
  executor: BaseToolExecutorPort,
): Promise<{ ok: boolean; toolId: string; output?: unknown; error?: { code: string; publicSafe: true } }> {
  const toolCallId = `${toolCall.tool}:omni-live-matrix`;
  const runtimeId = "agentcore-omni-live-matrix-runtime";
  const sessionId = "agentcore-omni-live-matrix-session";
  const adapted = adaptRuntimeToolInvocation({
    context: { runtimeId, sessionId, invocationId: toolCallId },
    toolId: toolCall.tool,
    operation: toolCall.tool,
    arguments: toolCall.arguments,
    resourceLimits: { timeoutMs: 1000, maxOutputBytes: 8000 },
  });
  if (!adapted.ok) return { ok: false, toolId: toolCall.tool, error: adapted.error };
  const bridged = bridgeExecEngineInvocation({
    runtimeId,
    caller: { kind: "application", id: "agentcore-omni-live-matrix", sessionId },
    invocation: { invocationId: toolCallId, kind: "tool", target: toolCall.tool, payload: adapted.invocation, auditRef: adapted.invocation.audit.event },
    runtimeReady: true,
  });
  if (!bridged.ok) return { ok: false, toolId: toolCall.tool, error: bridged.error };
  const lookup = createBaseToolRegistry().lookupHandler(toolCall.tool);
  if (!lookup.ok) return { ok: false, toolId: toolCall.tool, error: lookup.error };
  return lookup.handler.invoke({ toolCallId, runtimeId, sessionId, input: toolCall.arguments, executor });
}

function toolCallFromCase(testCase: OmniLiveCase): OmniToolCall {
  return { tool: testCase.toolId, arguments: testCase.input };
}

function withRuntimeGovernance(tool: string, toolArguments: Readonly<Record<string, unknown>>, userPrompt?: string): Readonly<Record<string, unknown>> {
  const input: Record<string, unknown> = { ...toolArguments };
  const targetText = typeof input.target === "string" && input.target.trim().length > 0 ? input.target.trim() : undefined;
  const targetTextLooksOutput = targetText?.startsWith("/workspace/output/") === true;
  const target = typeof input.target === "object" && input.target !== null && !Array.isArray(input.target)
    ? { ...(input.target as Record<string, unknown>) }
    : {};
  const context = typeof input.context === "object" && input.context !== null && !Array.isArray(input.context)
    ? input.context as Record<string, unknown>
    : {};

  if (tool === "omni.viewImage") {
    target.imagePath ??= target.inputPath ?? target.imagePath ?? target.input ?? target.source ?? input.imagePath ?? input.input ?? input.source ?? input.path ?? targetText ?? "/workspace/media/source.png";
    target.mediaType ??= input.mediaType ?? "image/png";
    target.detail ??= input.detail ?? context.detail ?? "high";
  } else if (tool.startsWith("omni.generate")) {
    target.prompt ??= input.prompt ?? target.prompt ?? userPrompt ?? "Tool matrix generated media.";
    target.outputPath ??= target.output ?? target.path ?? input.outputPath ?? input.output ?? targetText ?? (tool.endsWith("Image") ? "/workspace/output/result.png" : tool.endsWith("Audio") ? "/workspace/output/result.wav" : "/workspace/output/result.mp4");
    target.targetFormat ??= target.format ?? target.outputFormat ?? input.targetFormat ?? input.format ?? input.outputFormat ?? (tool.endsWith("Image") ? "png" : tool.endsWith("Audio") ? "wav" : "mp4");
    target.durationSeconds ??= target.duration ?? input.durationSeconds ?? input.duration;
  } else {
    const mediaHint = tool.includes("Audio") || tool.startsWith("omni.audio") || tool === "omni.listenAudio"
      ? "audio"
      : tool.includes("Image") || tool.startsWith("omni.image")
        ? "image"
        : "video";
    target.inputPath ??= target.input ?? target.source ?? target.path ?? input.inputPath ?? input.input ?? input.source ?? input.path ?? (targetTextLooksOutput ? undefined : targetText) ?? (mediaHint === "audio" ? "/workspace/media/source.wav" : mediaHint === "image" ? "/workspace/media/source.png" : "/workspace/media/source.mp4");
    target.targetFormat ??= target.format ?? target.outputFormat ?? input.targetFormat ?? input.format ?? input.outputFormat ?? (mediaHint === "audio" ? "wav" : mediaHint === "image" ? "png" : "mp4");
    if (tool.includes("Compressor") || tool.includes("FormatConversion")) {
      target.outputPath ??= target.output ?? input.outputPath ?? input.output ?? (targetTextLooksOutput ? targetText : undefined) ?? (mediaHint === "audio" ? "/workspace/output/result.wav" : mediaHint === "image" ? "/workspace/output/result.png" : "/workspace/output/result.mp4");
    }
  }

  const media = tool.includes("Audio") || tool.startsWith("omni.audio") || tool === "omni.listenAudio"
    ? "audio"
    : tool.includes("Image") || tool.startsWith("omni.image") || tool === "omni.viewImage"
      ? "image"
      : "video";
  const defaultPermissions = tool === "omni.viewImage"
    ? ["filesystem:read", "omni:image:view"]
    : tool.startsWith("omni.generate")
      ? ["provider:invoke", `omni:${media}:generate`, `omni:${media}:write`]
      : tool.includes("Compressor") || tool.includes("FormatConversion")
        ? [`omni:${media}:read`, `omni:${media}:write`]
        : [`omni:${media}:read`, "provider:invoke"];

  return {
    ...input,
    target,
    context: {
      ...context,
      dryRun: false,
      guard: {
        ...(typeof context.guard === "object" && context.guard !== null && !Array.isArray(context.guard)
          ? context.guard as Record<string, unknown>
          : {}),
        allowed: true,
        accepted: true,
      },
      allowedImageRoots: Array.isArray(context.allowedImageRoots) ? context.allowedImageRoots : ["/workspace/media"],
      allowedInputRoots: Array.isArray(context.allowedInputRoots) ? context.allowedInputRoots : ["/workspace/media"],
      allowedOutputRoots: Array.isArray(context.allowedOutputRoots) ? context.allowedOutputRoots : ["/workspace/output"],
      grantedPermissions: Array.isArray(context.grantedPermissions) ? context.grantedPermissions : defaultPermissions,
      requestedScopes: Array.isArray(context.requestedScopes) ? context.requestedScopes : [`tool.${tool}`],
      allowedScopes: Array.isArray(context.allowedScopes) ? context.allowedScopes : [`tool.${tool}`],
    },
  };
}

function expectedCallSeen(expectedOperation: string, calls: readonly string[]): boolean {
  return calls.includes(`transform:${expectedOperation}`);
}

function truncateText(value: unknown, maxChars = 500): string {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2) ?? String(value);
  return text.length > maxChars ? `${text.slice(0, maxChars)}...<truncated>` : text;
}

async function summarizeDialogueTurn(input: {
  userPrompt: string;
  toolId: string;
  toolCall: unknown;
  toolResult: unknown;
  calls: readonly string[];
}): Promise<string> {
  return await callResponsesApi(
    [
      "你正在完成一次 Praxis agentCore omniBase 真实对话工具回合。",
      "请用中文给出最终回答，必须说明工具是否调用成功，以及 runtime 调用了 BaseToolExecutorPort.omni.transformMedia。",
      "不要输出 JSON，不要声称没有工具。",
      `用户请求：${input.userPrompt}`,
      `工具：${input.toolId}`,
      `executor calls：${input.calls.join(", ")}`,
      `工具调用：${truncateText(input.toolCall)}`,
      `工具结果：${truncateText(input.toolResult)}`,
    ].join("\n"),
    "你是 Praxis agentCore 的最终回答层。工具已经执行完毕，请把工具结果解释给用户。",
  );
}

async function main(): Promise<void> {
  const onlyTool = argValue("--tool");
  const limit = Number(argValue("--limit") ?? omniLiveCases.length);
  const selected = omniLiveCases
    .filter((testCase) => onlyTool === undefined || testCase.toolId === onlyTool)
    .slice(0, Number.isFinite(limit) && limit > 0 ? limit : omniLiveCases.length);
  const results = [];

  if (dialogueMode) {
    console.log("agentCore omniBase dialogue suite");
    console.log(`model=${model}`);
    console.log(`reasoning.effort=${reasoningEffort}`);
    console.log(`mode=${useModel ? "live-model-plus-registry-handler-plus-final-answer" : "registry-handler-only"}`);
    console.log("");
  }

  for (const testCase of selected) {
    const calls: string[] = [];
    let modelText = "";
    let toolCall = toolCallFromCase(testCase);
    let modelOk = true;
    let modelError: string | undefined;

    if (useModel) {
      const prompt = [
        "请模拟一次真实 agentCore 对话里的工具选择。",
        `用户请求：${testCase.userPrompt}`,
        "这是普通用户话术，用户不会自己写工具参数。你要像 agent 一样自己选择最合适的 omniBase 工具。",
        "可用工具只有：omni.viewImage, omni.generateImage, omni.imageCompressor, omni.imageFormatConversion, omni.listenAudio, omni.generateAudio, omni.audioCompressor, omni.audioFormatConversion, omni.audioLyricsGeneration, omni.viewVideo, omni.generateVideo, omni.videoCompressor, omni.videoFormatConversion, omni.videoSubtitleGeneration。",
        "不要选择 shell、code 或 provider SDK。omniBase 只负责转交 runtime；参数里必须包含 target 和 context。",
        `测试工作区已经准备好的具体资源和参数锚点：${JSON.stringify(testCase.input)}`,
        "你必须基于这些真实 fixture 参数组织 arguments；target 是对象时要保留为对象，尤其是 outputPath、inputPath、prompt、targetFormat、durationSeconds。",
        "不要把 outputPath 放进 context，也不要把对象 target 改成纯字符串 target。",
        `期望的任务类别是 ${testCase.toolId}，但你仍然需要根据用户请求组织参数。`,
        "context 必须设置 dryRun:false 和 guard:{allowed:true, accepted:true}。",
        "只返回：{\"tool_calls\":[{\"tool\":\"...\",\"arguments\":{...}}]}",
      ].join("\n");
      try {
        modelText = await callResponsesApi(prompt, "你是 Praxis agentCore omniBase live matrix。你只输出 JSON tool_calls，不输出解释。");
        const parsedToolCall = normalizeOmniToolCall(parseJsonObject(modelText));
        if (parsedToolCall === undefined) {
          modelOk = false;
          modelError = "MODEL_DID_NOT_RETURN_OMNI_TOOL_CALL";
        } else if (parsedToolCall.tool !== testCase.toolId) {
          modelOk = false;
          modelError = `MODEL_TOOL_MISMATCH:${parsedToolCall.tool}`;
          toolCall = { tool: parsedToolCall.tool, arguments: withRuntimeGovernance(parsedToolCall.tool, parsedToolCall.arguments, testCase.userPrompt) };
        } else {
          toolCall = { tool: parsedToolCall.tool, arguments: withRuntimeGovernance(parsedToolCall.tool, parsedToolCall.arguments, testCase.userPrompt) };
        }
      } catch (error) {
        modelOk = false;
        modelError = error instanceof Error ? error.message : String(error);
      }
    }

    const toolResult = await invokeOmniToolThroughRuntimeChain(toolCall, createOmniExecutor(calls));
    const expectedCallOk = expectedCallSeen(testCase.expectedOperation, calls);
    const ok = modelOk && toolResult.ok === true && expectedCallOk;
    const record = {
      ok,
      toolId: testCase.toolId,
      modelOk,
      modelError,
      expectedCallOk,
      expectedOperation: testCase.expectedOperation,
      calls,
      resultOk: toolResult.ok,
      error: toolResult.error,
      outputPreview: truncateText(toolResult.output),
      modelPreview: modelText.slice(0, 500),
    };
    results.push(record);

    if (dialogueMode) {
      console.log(`[${results.length}/${selected.length}] user> ${testCase.userPrompt}`);
      console.log(`model tool_call> ${modelOk ? toolCall.tool : `FAILED ${modelError}`}`);
      console.log(`runtime> ok=${toolResult.ok} calls=${calls.join(", ") || "(none)"}`);
      if (useModel && toolResult.ok) {
        try {
          console.log(`agentCore> ${await summarizeDialogueTurn({ userPrompt: testCase.userPrompt, toolId: testCase.toolId, toolCall, toolResult, calls })}`);
        } catch (error) {
          console.log(`agentCore> final answer failed: ${error instanceof Error ? error.message : String(error)}`);
          record.ok = false;
        }
      } else {
        console.log(`agentCore> ${record.outputPreview}`);
      }
      console.log(`result> ${record.ok ? "PASS" : "FAIL"}`);
      console.log("");
    } else {
      console.log(JSON.stringify(record));
    }
  }

  const failed = results.filter((result) => !result.ok);
  const summary = {
    ok: failed.length === 0,
    mode: useModel ? "live-model-plus-registry-handler" : "registry-handler-only",
    model,
    reasoningEffort,
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    failedTools: failed.map((result) => result.toolId),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) process.exitCode = 1;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`agentCore omniBase live matrix fatal> ${message}`);
  process.exitCode = 1;
});
