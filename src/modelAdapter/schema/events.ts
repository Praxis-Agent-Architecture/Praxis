import type { RaxToolCall } from "./tools.js";

export type RaxUsage = {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  thinkingTokens?: number;
  cachedInputTokens?: number;
  cacheReadInputTokens?: number;
  cacheWriteInputTokens?: number;
  totalTokens?: number;
  source?: string;
  estimated?: boolean;
  raw?: unknown;
};

export type RaxModelEvent =
  | { type: "response.start"; id: string; provider: string; model: string; routeId: string; protocolId: string; createdAt: string }
  | { type: "text.delta"; id: string; text: string; index?: number }
  | { type: "reasoning.delta"; id: string; text: string; index?: number; encrypted?: string }
  | { type: "tool.input.start"; id: string; toolCallId: string; name?: string; index?: number }
  | { type: "tool.input.delta"; id: string; toolCallId: string; delta: string; index?: number }
  | { type: "tool.input.end"; id: string; toolCallId: string; input: string; index?: number }
  | { type: "tool.call"; id: string; call: RaxToolCall; index?: number }
  | { type: "usage"; id: string; usage: RaxUsage }
  | { type: "response.finish"; id: string; finishReason?: string; usage?: RaxUsage; raw?: unknown }
  | { type: "error"; id: string; code: string; message: string; raw?: unknown };

export type RaxModelResponse = {
  id: string;
  text: string;
  toolCalls: RaxToolCall[];
  usage?: RaxUsage;
  finishReason?: string;
  events: RaxModelEvent[];
};

export function foldRaxModelEvents(events: RaxModelEvent[]): RaxModelResponse {
  const id = events.find((event) => "id" in event)?.id ?? `rax-response-${Date.now()}`;
  let text = "";
  const toolCalls: RaxToolCall[] = [];
  let usage: RaxUsage | undefined;
  let finishReason: string | undefined;

  for (const event of events) {
    if (event.type === "text.delta") text += event.text;
    if (event.type === "tool.call") toolCalls.push(event.call);
    if (event.type === "usage") usage = { ...usage, ...event.usage };
    if (event.type === "response.finish") {
      finishReason = event.finishReason;
      if (event.usage) usage = { ...usage, ...event.usage };
    }
  }

  return { id, text, toolCalls, usage, finishReason, events };
}
