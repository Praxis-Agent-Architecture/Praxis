import { Effect } from "effect";
import {
  raxModelError,
  textFromContent,
  toProviderToolName,
  type RaxContentPart,
  type RaxModelMessage,
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
} from "../route/protocol.js";

type OpenAIChatToolState = {
  id: string;
  name?: string;
  argumentsText: string;
  started: boolean;
};

type OpenAIChatState = RaxProtocolStreamState & {
  toolCalls: Record<string, OpenAIChatToolState>;
  usage?: RaxUsage;
  finishReason?: string;
};

export const openAIChatProtocol: RaxModelProtocol = {
  id: "openai.chat",
  prepare(request, context) {
    return Effect.try({
      try: () => prepareOpenAIChatBody(request, context),
      catch: (error) => raxModelError("request_invalid", "Failed to prepare OpenAI chat request", {}, error),
    });
  },
  initialState() {
    return { toolCalls: {} } satisfies OpenAIChatState;
  },
  decodeFrame(frame, state, prepared) {
    return Effect.try({
      try: () => decodeOpenAIChatFrame(frame, state as OpenAIChatState, prepared),
      catch: (error) => raxModelError("decode_error", "Failed to decode OpenAI chat frame", { frame }, error),
    });
  },
  finalize(state, prepared) {
    return Effect.sync(() => {
      const chatState = state as OpenAIChatState;
      const events = flushToolCalls(chatState, prepared.id);
      events.push({ type: "response.finish", id: prepared.id, finishReason: chatState.finishReason, usage: chatState.usage });
      return events;
    });
  },
};

export const openAICompatibleChatProtocol: RaxModelProtocol = {
  ...openAIChatProtocol,
  id: "openai.compatible_chat",
};

function prepareOpenAIChatBody(request: RaxModelRequest, context: RaxProtocolPrepareContext): RaxProtocolPrepareResult {
  const body: Record<string, unknown> = {
    model: context.modelId,
    messages: lowerOpenAIMessages(request.system, request.messages),
    stream: true,
    stream_options: { include_usage: true },
  };

  if (request.generation?.temperature !== undefined) body.temperature = request.generation.temperature;
  if (request.generation?.topP !== undefined) body.top_p = request.generation.topP;
  if (request.generation?.maxOutputTokens !== undefined) body.max_tokens = request.generation.maxOutputTokens;
  if (request.generation?.stop?.length) body.stop = request.generation.stop;
  if (request.generation?.reasoningEffort) body.reasoning_effort = request.generation.reasoningEffort;
  if (request.generation?.responseFormat === "json") body.response_format = { type: "json_object" };

  const toolNameMap = new Map<string, string>();
  const tools = lowerOpenAITools(request.tools ?? [], toolNameMap);
  if (tools.length) {
    body.tools = tools;
    body.tool_choice = lowerOpenAIToolChoice(request.toolChoice, toolNameMap);
  }

  return {
    body,
    metadata: {
      toolNameMap: Object.fromEntries(toolNameMap.entries()),
    },
  };
}

function lowerOpenAIMessages(system: RaxModelRequest["system"], messages: RaxModelMessage[]): unknown[] {
  const lowered: unknown[] = [];
  const systemText = (system ?? []).map((part) => part.text).join("\n\n");
  if (systemText) lowered.push({ role: "system", content: systemText });

  for (const message of messages) {
    if (message.role === "tool") {
      const toolResults = Array.isArray(message.content)
        ? message.content.filter((part): part is Extract<RaxContentPart, { type: "tool_result" }> => part.type === "tool_result")
        : [];
      if (!toolResults.length) {
        lowered.push({ role: "tool", tool_call_id: message.name ?? "tool_call", content: textFromContent(message.content) });
      }
      for (const result of toolResults) {
        lowered.push({
          role: "tool",
          tool_call_id: result.toolCallId,
          content: typeof result.content === "string" ? result.content : textFromContent(result.content),
        });
      }
      continue;
    }

    if (message.role === "assistant" && Array.isArray(message.content)) {
      const toolCalls = message.content.filter((part): part is Extract<RaxContentPart, { type: "tool_call" }> => part.type === "tool_call");
      lowered.push({
        role: "assistant",
        content: textFromContent(message.content) || null,
        ...(toolCalls.length
          ? {
              tool_calls: toolCalls.map((part) => ({
                id: part.call.id,
                type: "function",
                function: { name: part.call.providerName ?? toProviderToolName(part.call.name), arguments: JSON.stringify(part.call.input ?? {}) },
              })),
            }
          : {}),
      });
      continue;
    }

    lowered.push({ role: message.role, content: textFromContent(message.content) });
  }
  return lowered;
}

function lowerOpenAITools(tools: RaxToolDefinition[], toolNameMap: Map<string, string>): unknown[] {
  const lowered: unknown[] = [];
  for (const tool of tools) {
    if (tool.kind === "native") {
      if (tool.provider === "openai") lowered.push(tool.payload);
      continue;
    }
    const providerName = toProviderToolName(tool.name);
    toolNameMap.set(providerName, tool.name);
    lowered.push({
      type: "function",
      function: {
        name: providerName,
        description: tool.description ?? "",
        parameters: tool.inputSchema,
        ...(tool.strict ? { strict: true } : {}),
      },
    });
  }
  return lowered;
}

function lowerOpenAIToolChoice(choice: RaxModelRequest["toolChoice"], toolNameMap: Map<string, string>): unknown {
  if (!choice) return "auto";
  if (choice === "auto" || choice === "none" || choice === "required") return choice;
  const providerName = [...toolNameMap.entries()].find(([, original]) => original === choice.name)?.[0] ?? toProviderToolName(choice.name);
  return { type: "function", function: { name: providerName } };
}

function decodeOpenAIChatFrame(frame: unknown, state: OpenAIChatState, prepared: RaxPreparedModelRequest): RaxProtocolDecodeResult {
  const events: RaxProtocolDecodeResult["events"] = [];
  if (!frame || typeof frame !== "object") return { state, events };
  const chunk = frame as Record<string, unknown>;
  const usage = lowerUsage(chunk.usage);
  if (usage) {
    state.usage = usage;
    events.push({ type: "usage", id: prepared.id, usage });
  }

  const choices = Array.isArray(chunk.choices) ? chunk.choices : [];
  for (const choice of choices) {
    if (!choice || typeof choice !== "object") continue;
    const choiceObj = choice as Record<string, unknown>;
    if (typeof choiceObj.finish_reason === "string") state.finishReason = choiceObj.finish_reason;
    const delta = choiceObj.delta;
    if (!delta || typeof delta !== "object") continue;
    const deltaObj = delta as Record<string, unknown>;
    if (typeof deltaObj.content === "string" && deltaObj.content) {
      events.push({ type: "text.delta", id: prepared.id, text: deltaObj.content });
    }
    const reasoning = deltaObj.reasoning_content ?? deltaObj.reasoning;
    if (typeof reasoning === "string" && reasoning) {
      events.push({ type: "reasoning.delta", id: prepared.id, text: reasoning });
    }
    const toolCalls = Array.isArray(deltaObj.tool_calls) ? deltaObj.tool_calls : [];
    for (const toolCall of toolCalls) {
      const toolEvents = decodeToolDelta(toolCall, state, prepared);
      events.push(...toolEvents);
    }
  }

  return { state, events };
}

function decodeToolDelta(toolCall: unknown, state: OpenAIChatState, prepared: RaxPreparedModelRequest): RaxProtocolDecodeResult["events"] {
  if (!toolCall || typeof toolCall !== "object") return [];
  const value = toolCall as Record<string, unknown>;
  const index = typeof value.index === "number" ? value.index : 0;
  const key = String(index);
  const existing = state.toolCalls[key] ?? { id: typeof value.id === "string" ? value.id : `tool_${key}`, argumentsText: "", started: false };
  if (typeof value.id === "string") existing.id = value.id;
  const fn = value.function && typeof value.function === "object" ? (value.function as Record<string, unknown>) : {};
  if (typeof fn.name === "string") existing.name = fn.name;
  const delta = typeof fn.arguments === "string" ? fn.arguments : "";
  existing.argumentsText += delta;
  state.toolCalls[key] = existing;

  const events: RaxProtocolDecodeResult["events"] = [];
  if (!existing.started) {
    existing.started = true;
    events.push({ type: "tool.input.start", id: prepared.id, toolCallId: existing.id, name: existing.name, index });
  }
  if (delta) {
    events.push({ type: "tool.input.delta", id: prepared.id, toolCallId: existing.id, delta, index });
  }
  return events;
}

function flushToolCalls(state: OpenAIChatState, responseId: string): RaxProtocolDecodeResult["events"] {
  const events: RaxProtocolDecodeResult["events"] = [];
  for (const [indexText, toolState] of Object.entries(state.toolCalls)) {
    const index = Number(indexText);
    events.push({ type: "tool.input.end", id: responseId, toolCallId: toolState.id, input: toolState.argumentsText, index });
    const input = parseToolInput(toolState.argumentsText);
    const call: RaxToolCall = {
      id: toolState.id,
      name: toolState.name ?? "unknown_tool",
      input,
      providerName: toolState.name,
    };
    events.push({ type: "tool.call", id: responseId, call, index });
  }
  state.toolCalls = {};
  return events;
}

function parseToolInput(value: string): unknown {
  if (!value.trim()) return {};
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function lowerUsage(usage: unknown): RaxUsage | undefined {
  if (!usage || typeof usage !== "object") return undefined;
  const value = usage as Record<string, unknown>;
  return {
    inputTokens: numberValue(value.prompt_tokens),
    outputTokens: numberValue(value.completion_tokens),
    totalTokens: numberValue(value.total_tokens),
    reasoningTokens: numberValue((value.completion_tokens_details as Record<string, unknown> | undefined)?.reasoning_tokens),
    cacheReadInputTokens: numberValue((value.prompt_tokens_details as Record<string, unknown> | undefined)?.cached_tokens),
    raw: usage,
  };
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}
