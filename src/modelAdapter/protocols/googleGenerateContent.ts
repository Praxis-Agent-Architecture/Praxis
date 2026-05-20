import { Effect } from "effect";
import {
  raxModelError,
  textFromContent,
  toProviderToolName,
  type RaxModelRequest,
  type RaxPreparedModelRequest,
  type RaxToolDefinition,
  type RaxUsage,
} from "../schema/index.js";
import type {
  RaxModelProtocol,
  RaxProtocolDecodeResult,
  RaxProtocolPrepareContext,
  RaxProtocolPrepareResult,
  RaxProtocolStreamState,
} from "../route/index.js";

type GoogleGenerateContentState = RaxProtocolStreamState & {
  usage?: RaxUsage;
  finishReason?: string;
};

export const googleGenerateContentProtocol: RaxModelProtocol = {
  id: "google.generate_content",
  prepare(request, context) {
    return Effect.try({
      try: () => prepareGoogleGenerateContentBody(request, context),
      catch: (error) => raxModelError("request_invalid", "Failed to prepare Google GenerateContent request", {}, error),
    });
  },
  initialState() {
    return {} satisfies GoogleGenerateContentState;
  },
  decodeFrame(frame, state, prepared) {
    return Effect.try({
      try: () => decodeGoogleGenerateContentFrame(frame, state as GoogleGenerateContentState, prepared),
      catch: (error) => raxModelError("decode_error", "Failed to decode Google GenerateContent frame", { frame }, error),
    });
  },
  finalize(state, prepared) {
    return Effect.sync(() => {
      const googleState = state as GoogleGenerateContentState;
      return [{ type: "response.finish", id: prepared.id, finishReason: googleState.finishReason, usage: googleState.usage }];
    });
  },
};

function prepareGoogleGenerateContentBody(
  request: RaxModelRequest,
  _context: RaxProtocolPrepareContext,
): RaxProtocolPrepareResult {
  const body: Record<string, unknown> = {
    contents: request.messages.map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: textFromContent(message.content) }],
    })),
  };
  const systemInstruction = (request.system ?? []).map((part) => part.text).join("\n\n");
  if (systemInstruction) body.system_instruction = { parts: [{ text: systemInstruction }] };
  const generationConfig: Record<string, unknown> = {};
  if (request.generation?.temperature !== undefined) generationConfig.temperature = request.generation.temperature;
  if (request.generation?.topP !== undefined) generationConfig.topP = request.generation.topP;
  if (request.generation?.maxOutputTokens !== undefined) generationConfig.maxOutputTokens = request.generation.maxOutputTokens;
  if (request.generation?.stop?.length) generationConfig.stopSequences = request.generation.stop;
  if (Object.keys(generationConfig).length) body.generationConfig = generationConfig;
  const tools = lowerGoogleTools(request.tools ?? []);
  if (tools.length) body.tools = tools;
  return { body };
}

function lowerGoogleTools(tools: RaxToolDefinition[]): unknown[] {
  const functionDeclarations: unknown[] = [];
  const nativeTools: unknown[] = [];
  for (const tool of tools) {
    if (tool.kind === "function") {
      functionDeclarations.push({
        name: toProviderToolName(tool.name),
        description: tool.description ?? "",
        parameters: tool.inputSchema,
      });
    }
    if (tool.kind === "native" && tool.provider === "google") nativeTools.push(tool.payload);
  }
  return [
    ...(functionDeclarations.length ? [{ functionDeclarations }] : []),
    ...nativeTools,
  ];
}

function decodeGoogleGenerateContentFrame(
  frame: unknown,
  state: GoogleGenerateContentState,
  prepared: RaxPreparedModelRequest,
): RaxProtocolDecodeResult {
  const events: RaxProtocolDecodeResult["events"] = [];
  if (!frame || typeof frame !== "object") return { state, events };
  const value = frame as Record<string, unknown>;
  const candidates = Array.isArray(value.candidates) ? value.candidates : [];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const candidateObj = candidate as Record<string, unknown>;
    if (typeof candidateObj.finishReason === "string") state.finishReason = candidateObj.finishReason;
    const content = candidateObj.content && typeof candidateObj.content === "object" ? candidateObj.content as Record<string, unknown> : {};
    const parts = Array.isArray(content.parts) ? content.parts : [];
    for (const part of parts) {
      if (!part || typeof part !== "object") continue;
      const text = (part as Record<string, unknown>).text;
      if (typeof text === "string" && text) events.push({ type: "text.delta", id: prepared.id, text });
    }
  }
  const usage = lowerGoogleUsage(value.usageMetadata);
  if (usage) {
    state.usage = usage;
    events.push({ type: "usage", id: prepared.id, usage });
  }
  return { state, events };
}

function lowerGoogleUsage(usage: unknown): RaxUsage | undefined {
  if (!usage || typeof usage !== "object") return undefined;
  const value = usage as Record<string, unknown>;
  return {
    inputTokens: numberValue(value.promptTokenCount),
    outputTokens: numberValue(value.candidatesTokenCount),
    totalTokens: numberValue(value.totalTokenCount),
    raw: usage,
  };
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}
