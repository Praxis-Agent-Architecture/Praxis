import { Effect } from "effect";
import {
  raxModelError,
  textFromContent,
  toProviderToolName,
  type RaxContentPart,
  type RaxGenerationOptions,
  type RaxModelRequest,
  type RaxPreparedModelRequest,
  type RaxToolCall,
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
      parts: lowerGoogleParts(message.content),
    })),
  };
  const systemInstruction = (request.system ?? []).map((part) => part.text).join("\n\n");
  if (systemInstruction) body.system_instruction = { parts: [{ text: systemInstruction }] };
  const generationConfig: Record<string, unknown> = {};
  if (request.generation?.temperature !== undefined) generationConfig.temperature = request.generation.temperature;
  if (request.generation?.topP !== undefined) generationConfig.topP = request.generation.topP;
  if (request.generation?.maxOutputTokens !== undefined) generationConfig.maxOutputTokens = request.generation.maxOutputTokens;
  if (request.generation?.stop?.length) generationConfig.stopSequences = request.generation.stop;
  const responseFormat = lowerGoogleResponseFormat(request.generation?.responseFormat);
  if (responseFormat !== undefined) Object.assign(generationConfig, responseFormat);
  if (Object.keys(generationConfig).length) body.generationConfig = generationConfig;
  const tools = lowerGoogleTools(request.tools ?? []);
  if (tools.length) body.tools = tools;
  return { body };
}

function lowerGoogleResponseFormat(format: RaxGenerationOptions["responseFormat"] | undefined): Record<string, unknown> | undefined {
  if (format === undefined || format === "text") return undefined;
  if (format === "json") return { responseMimeType: "application/json" };
  if (typeof format === "object" && "schema" in format && format.schema !== undefined) {
    return {
      responseMimeType: "application/json",
      responseSchema: format.schema,
    };
  }
  return undefined;
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

function lowerGoogleParts(content: RaxModelRequest["messages"][number]["content"]): unknown[] {
  if (typeof content === "string") return [{ text: content }];
  const parts = content.flatMap((part) => lowerGooglePart(part));
  return parts.length ? parts : [{ text: textFromContent(content) }];
}

function lowerGooglePart(part: RaxContentPart): unknown[] {
  if (part.type === "text") return [{ text: part.text }];
  if (part.type === "reasoning") return [{ text: part.text }];
  if (part.type === "image" && part.data) {
    return [{ inlineData: { mimeType: part.mimeType ?? "application/octet-stream", data: part.data } }];
  }
  if (part.type === "image" && part.url) {
    return [{ fileData: { mimeType: part.mimeType ?? "application/octet-stream", fileUri: part.url } }];
  }
  if (part.type === "tool_call") {
    return [{ functionCall: { name: part.call.providerName ?? toProviderToolName(part.call.name), args: part.call.input ?? {} } }];
  }
  if (part.type === "tool_result") {
    return [{ functionResponse: { name: part.name ?? "tool", response: { content: typeof part.content === "string" ? part.content : textFromContent(part.content) } } }];
  }
  return [];
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
      const functionCall = (part as Record<string, unknown>).functionCall;
      if (functionCall && typeof functionCall === "object") {
        const call = lowerGoogleFunctionCall(functionCall);
        if (call) events.push({ type: "tool.call", id: prepared.id, call, index: events.length });
      }
    }
  }
  const usage = lowerGoogleUsage(value.usageMetadata);
  if (usage) {
    state.usage = usage;
    events.push({ type: "usage", id: prepared.id, usage });
  }
  return { state, events };
}

function lowerGoogleFunctionCall(value: unknown): RaxToolCall | undefined {
  if (!value || typeof value !== "object") return undefined;
  const call = value as Record<string, unknown>;
  const name = typeof call.name === "string" ? call.name : "unknown_tool";
  return {
    id: `google_${name}`,
    name,
    providerName: name,
    input: call.args ?? {},
  };
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
