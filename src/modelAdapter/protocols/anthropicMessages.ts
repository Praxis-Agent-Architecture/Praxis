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
} from "../route/index.js";

type AnthropicToolState = { id: string; name?: string; inputText: string };
type AnthropicMessagesState = RaxProtocolStreamState & {
  toolCalls: Record<number, AnthropicToolState>;
  usage?: RaxUsage;
  finishReason?: string;
};

export const anthropicMessagesProtocol: RaxModelProtocol = {
  id: "anthropic.messages",
  prepare(request, context) {
    return Effect.try({
      try: () => prepareAnthropicMessagesBody(request, context),
      catch: (error) => raxModelError("request_invalid", "Failed to prepare Anthropic Messages request", {}, error),
    });
  },
  initialState() {
    return { toolCalls: {} } satisfies AnthropicMessagesState;
  },
  decodeFrame(frame, state, prepared) {
    return Effect.try({
      try: () => decodeAnthropicMessagesFrame(frame, state as AnthropicMessagesState, prepared),
      catch: (error) => raxModelError("decode_error", "Failed to decode Anthropic Messages frame", { frame }, error),
    });
  },
  finalize(state, prepared) {
    return Effect.sync(() => {
      const messageState = state as AnthropicMessagesState;
      const events = flushToolCalls(messageState, prepared.id);
      events.push({
        type: "response.finish",
        id: prepared.id,
        finishReason: messageState.finishReason,
        usage: messageState.usage,
      });
      return events;
    });
  },
};

function prepareAnthropicMessagesBody(
  request: RaxModelRequest,
  context: RaxProtocolPrepareContext,
): RaxProtocolPrepareResult {
  const body: Record<string, unknown> = {
    model: context.modelId,
    messages: lowerAnthropicMessages(request.messages),
    stream: true,
    max_tokens: request.generation?.maxOutputTokens ?? 4096,
  };
  const systemText = (request.system ?? []).map((part) => part.text).join("\n\n");
  if (systemText) body.system = systemText;
  if (request.generation?.temperature !== undefined) body.temperature = request.generation.temperature;
  if (request.generation?.topP !== undefined) body.top_p = request.generation.topP;
  if (request.generation?.stop?.length) body.stop_sequences = request.generation.stop;
  if (request.generation?.reasoningEffort) body.thinking = { type: "enabled", budget_tokens: reasoningBudget(request.generation.reasoningEffort) };

  const toolNameMap = new Map<string, string>();
  const tools = lowerAnthropicTools(request.tools ?? [], toolNameMap);
  if (tools.length) {
    body.tools = tools;
    body.tool_choice = lowerAnthropicToolChoice(request.toolChoice, toolNameMap);
  }
  return { body, metadata: { toolNameMap: Object.fromEntries(toolNameMap.entries()) } };
}

function lowerAnthropicMessages(messages: RaxModelMessage[]): unknown[] {
  return messages.map((message) => {
    if (message.role === "tool") {
      const content = Array.isArray(message.content)
        ? message.content.filter((part): part is Extract<RaxContentPart, { type: "tool_result" }> => part.type === "tool_result")
        : [];
      return {
        role: "user",
        content: content.length
          ? content.map((part) => ({ type: "tool_result", tool_use_id: part.toolCallId, content: textFromContent(part.content) }))
          : [{ type: "text", text: textFromContent(message.content) }],
      };
    }
    if (message.role === "assistant" && Array.isArray(message.content)) {
      const blocks: unknown[] = [];
      const text = textFromContent(message.content);
      if (text) blocks.push({ type: "text", text });
      for (const part of message.content) {
        if (part.type === "tool_call") {
          blocks.push({ type: "tool_use", id: part.call.id, name: part.call.providerName ?? toProviderToolName(part.call.name), input: part.call.input ?? {} });
        }
      }
      return { role: "assistant", content: blocks.length ? blocks : [{ type: "text", text: "" }] };
    }
    return { role: message.role, content: [{ type: "text", text: textFromContent(message.content) }] };
  });
}

function lowerAnthropicTools(tools: RaxToolDefinition[], toolNameMap: Map<string, string>): unknown[] {
  const lowered: unknown[] = [];
  for (const tool of tools) {
    if (tool.kind === "native") {
      if (tool.provider === "anthropic") lowered.push(tool.payload);
      continue;
    }
    const providerName = toProviderToolName(tool.name);
    toolNameMap.set(providerName, tool.name);
    lowered.push({ name: providerName, description: tool.description ?? "", input_schema: tool.inputSchema });
  }
  return lowered;
}

function lowerAnthropicToolChoice(choice: RaxModelRequest["toolChoice"], toolNameMap: Map<string, string>): unknown {
  if (!choice || choice === "auto") return { type: "auto" };
  if (choice === "none") return { type: "none" };
  if (choice === "required") return { type: "any" };
  const name = [...toolNameMap.entries()].find(([, original]) => original === choice.name)?.[0] ?? toProviderToolName(choice.name);
  return { type: "tool", name };
}

function decodeAnthropicMessagesFrame(
  frame: unknown,
  state: AnthropicMessagesState,
  prepared: RaxPreparedModelRequest,
): RaxProtocolDecodeResult {
  const events: RaxProtocolDecodeResult["events"] = [];
  if (!frame || typeof frame !== "object") return { state, events };
  const value = frame as Record<string, unknown>;
  if (value.type === "content_block_delta") {
    const delta = value.delta && typeof value.delta === "object" ? value.delta as Record<string, unknown> : {};
    if (typeof delta.text === "string" && delta.text) events.push({ type: "text.delta", id: prepared.id, text: delta.text });
    if (typeof delta.thinking === "string" && delta.thinking) events.push({ type: "reasoning.delta", id: prepared.id, text: delta.thinking });
    if (typeof delta.partial_json === "string") {
      const index = typeof value.index === "number" ? value.index : 0;
      const existing = state.toolCalls[index] ?? { id: `tool_${index}`, inputText: "" };
      existing.inputText += delta.partial_json;
      state.toolCalls[index] = existing;
      events.push({ type: "tool.input.delta", id: prepared.id, toolCallId: existing.id, delta: delta.partial_json, index });
    }
  }
  if (value.type === "content_block_start") {
    const index = typeof value.index === "number" ? value.index : 0;
    const block = value.content_block && typeof value.content_block === "object" ? value.content_block as Record<string, unknown> : {};
    if (block.type === "tool_use") {
      const toolState = { id: String(block.id ?? `tool_${index}`), name: typeof block.name === "string" ? block.name : undefined, inputText: "" };
      state.toolCalls[index] = toolState;
      events.push({ type: "tool.input.start", id: prepared.id, toolCallId: toolState.id, name: toolState.name, index });
    }
  }
  if (value.type === "message_delta") {
    const delta = value.delta && typeof value.delta === "object" ? value.delta as Record<string, unknown> : {};
    if (typeof delta.stop_reason === "string") state.finishReason = delta.stop_reason;
    const usage = lowerAnthropicUsage(value.usage);
    if (usage) {
      state.usage = { ...state.usage, ...usage };
      events.push({ type: "usage", id: prepared.id, usage: state.usage });
    }
  }
  if (value.type === "message_start") {
    const message = value.message && typeof value.message === "object" ? value.message as Record<string, unknown> : {};
    const usage = lowerAnthropicUsage(message.usage);
    if (usage) state.usage = usage;
  }
  return { state, events };
}

function flushToolCalls(state: AnthropicMessagesState, responseId: string): RaxProtocolDecodeResult["events"] {
  const events: RaxProtocolDecodeResult["events"] = [];
  for (const [indexText, toolState] of Object.entries(state.toolCalls)) {
    const index = Number(indexText);
    events.push({ type: "tool.input.end", id: responseId, toolCallId: toolState.id, input: toolState.inputText, index });
    const call: RaxToolCall = { id: toolState.id, name: toolState.name ?? "unknown_tool", input: parseJson(toolState.inputText), providerName: toolState.name };
    events.push({ type: "tool.call", id: responseId, call, index });
  }
  state.toolCalls = {};
  return events;
}

function lowerAnthropicUsage(usage: unknown): RaxUsage | undefined {
  if (!usage || typeof usage !== "object") return undefined;
  const value = usage as Record<string, unknown>;
  return {
    inputTokens: numberValue(value.input_tokens),
    outputTokens: numberValue(value.output_tokens),
    cacheReadInputTokens: numberValue(value.cache_read_input_tokens),
    cacheWriteInputTokens: numberValue(value.cache_creation_input_tokens),
    raw: usage,
  };
}

function parseJson(text: string): unknown {
  if (!text.trim()) return {};
  try { return JSON.parse(text); } catch { return text; }
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function reasoningBudget(effort: string): number {
  if (effort === "minimal") return 1024;
  if (effort === "low") return 2048;
  if (effort === "high") return 8192;
  if (effort === "xhigh") return 16384;
  return 4096;
}
