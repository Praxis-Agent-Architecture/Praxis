/*
 * 文件定位：Agent 模型适配层 / 真实上游调用层 / ChatGPT Codex 产品调用面。
 * 核心目的：承接 ChatGPT/Codex OAuth carrier 的 responses 类调用面。
 * 能力要求1：把 Codex/ChatGPT 登录态和 OpenAI API key 明确分开，不伪装成普通 API key。
 * 能力要求2：复用 OpenAI responses endpoint 的 request envelope、provider caller 和错误边界。
 * 能力要求3：默认使用 Codex 产品 backend baseURL，但只在显式 carrier/auth/caller 传入时执行 live 调用。
 * 边界：不读取 Codex auth 文件，不刷新 OAuth token，不暴露 raw access token。
 * 对接：authResolver 负责生成 chatgpt_codex_oauth envelope，providerCaller 负责真实 transport。
 * 实现提示：保持薄适配层，把产品通道差异留在 carrier/baseURL/headerPlan 中。
 */

import type { AuthEnvelope } from "../../authProfileLayer/authEnvelope.js";
import { CHATGPT_CODEX_DEFAULT_BASE_URL } from "../../providerAccessLayer/providerCarrier.js";
import {
  invokeOpenAIV1Responses,
  type OpenAIV1ResponsesInvocationRequest,
  type OpenAIV1ResponsesResult,
} from "./v1_responses.js";

export const CHATGPT_CODEX_RESPONSES_BASE_URL = CHATGPT_CODEX_DEFAULT_BASE_URL;

export type ChatGPTCodexResponsesInvocationRequest = Omit<OpenAIV1ResponsesInvocationRequest, "auth" | "baseUrl"> & {
  auth?: AuthEnvelope;
  baseUrl?: string;
  chatgptAccountId?: string;
  clientName?: string;
  clientVersion?: string;
};

function withClientMetadata(
  body: unknown,
  clientName: string | undefined,
  clientVersion: string | undefined,
): unknown {
  if (clientName === undefined && clientVersion === undefined) {
    return body;
  }

  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return body;
  }

  const record = body as Record<string, unknown>;
  const currentMetadata =
    record.client_metadata !== null && typeof record.client_metadata === "object" && !Array.isArray(record.client_metadata)
      ? record.client_metadata as Record<string, unknown>
      : {};

  return {
    ...record,
    client_metadata: {
      ...currentMetadata,
      ...(clientName ? { client_name: clientName } : {}),
      ...(clientVersion ? { client_version: clientVersion } : {}),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readContentText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((block) => {
      if (!isRecord(block)) {
        return "";
      }
      const text = block.text ?? block.input_text;
      return typeof text === "string" ? text : "";
    })
    .filter(Boolean)
    .join("\n");
}

function normalizeContentBlock(block: unknown): Record<string, unknown> | undefined {
  if (!isRecord(block)) {
    return undefined;
  }

  const type = typeof block.type === "string" ? block.type : undefined;
  const text = block.text ?? block.input_text;
  if (typeof text === "string") {
    return {
      ...block,
      type: "input_text",
      text,
    };
  }

  if (type === "input_image") {
    const imageUrl = block.image_url;
    const fileId = block.file_id;
    if (typeof imageUrl !== "string" && typeof fileId !== "string") {
      return undefined;
    }
    return block;
  }

  return block;
}

function normalizeInputItem(item: unknown): Record<string, unknown> | undefined {
  if (!isRecord(item)) {
    return undefined;
  }

  const role = typeof item.role === "string" ? item.role : "user";
  if (typeof item.content === "string") {
    return {
      ...item,
      role,
      content: [{ type: "input_text", text: item.content }],
    };
  }

  if (!Array.isArray(item.content)) {
    return item;
  }

  const content = item.content
    .map(normalizeContentBlock)
    .filter((block): block is Record<string, unknown> => block !== undefined);
  if (content.length === 0) return item;

  return {
    ...item,
    role,
    content,
  };
}

function normalizeCodexBackendBody(body: unknown): unknown {
  if (!isRecord(body)) {
    return body;
  }

  const { max_output_tokens: _maxOutputTokens, ...rest } = body;
  const rawInput = rest.input;
  const inputItems = typeof rawInput === "string"
    ? [{ role: "user", content: [{ type: "input_text", text: rawInput }] }]
    : Array.isArray(rawInput)
      ? rawInput.map(normalizeInputItem).filter((item): item is Record<string, unknown> => item !== undefined)
      : [];
  const instructionParts = inputItems
    .filter((item) => item.role === "developer" || item.role === "system")
    .map((item) => readContentText(item.content))
    .filter((text) => text.trim().length > 0);
  const userInputItems = inputItems.filter((item) => item.role !== "developer" && item.role !== "system");
  const instructions = typeof rest.instructions === "string" && rest.instructions.trim().length > 0
    ? rest.instructions
    : instructionParts.join("\n\n").trim() || "You are Praxis agentCore. Return concise, task-focused answers.";

  return {
    ...rest,
    instructions,
    input: userInputItems.length > 0
      ? userInputItems
      : [{ role: "user", content: [{ type: "input_text", text: instructions }] }],
    store: false,
    stream: true,
  };
}

export function invokeChatGPTCodexResponses(
  request: ChatGPTCodexResponsesInvocationRequest = {},
): Promise<OpenAIV1ResponsesResult> {
  const headers = {
    ...(request.headers ?? {}),
    ...(request.chatgptAccountId ? { "chatgpt-account-id": "[redacted]" } : {}),
  };

  return invokeOpenAIV1Responses({
    ...request,
    baseUrl: request.baseUrl ?? CHATGPT_CODEX_RESPONSES_BASE_URL,
    endpointPath: request.endpointPath ?? "/responses",
    auth: request.auth,
    headers,
    query: {
      ...(request.query ?? {}),
      ...(request.clientVersion ? { client_version: request.clientVersion } : {}),
    },
    body: withClientMetadata(normalizeCodexBackendBody(request.body), request.clientName, request.clientVersion),
  });
}
