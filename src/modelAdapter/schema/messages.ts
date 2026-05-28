import type { RaxToolCall } from "./tools.js";

export type RaxTextPart = {
  type: "text";
  text: string;
  cache?: "ephemeral" | "long";
};

export type RaxImagePart = {
  type: "image";
  mimeType?: string;
  url?: string;
  data?: string;
};

export type RaxToolCallPart = {
  type: "tool_call";
  call: RaxToolCall;
};

export type RaxToolResultPart = {
  type: "tool_result";
  toolCallId: string;
  name?: string;
  content: string | Array<RaxTextPart | RaxImagePart>;
  isError?: boolean;
};

export type RaxReasoningPart = {
  type: "reasoning";
  text: string;
  encrypted?: string;
};

export type RaxContentPart = RaxTextPart | RaxImagePart | RaxToolCallPart | RaxToolResultPart | RaxReasoningPart;

export type RaxSystemPart = RaxTextPart;

export type RaxModelMessage = {
  role: "user" | "assistant" | "tool";
  content: string | RaxContentPart[];
  name?: string;
  metadata?: Record<string, unknown>;
};

export function textFromContent(content: string | RaxContentPart[]): string {
  if (typeof content === "string") return content;
  return content
    .filter((part): part is RaxTextPart | RaxReasoningPart => part.type === "text" || part.type === "reasoning")
    .map((part) => part.text)
    .join("");
}
