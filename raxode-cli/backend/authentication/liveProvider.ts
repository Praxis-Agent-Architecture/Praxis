/*
 * 文件定位：raxode-cli / backend authentication live provider。
 * 核心目的：把 Raxode live-run 接到本机 Codex ChatGPT 登录态，而不污染 framework applicationLayer。
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import type { AgentManifest } from "../../../src/agentCore/index.js";
import type { OpenAIV1ResponsesProviderCaller } from "../../../src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_responses.js";
import type { AuthEnvelope } from "../../../src/agentCore/agent_modelAdapter/authProfileLayer/authEnvelope.js";
import { resolveAuthEnvelope } from "../../../src/agentCore/agent_modelAdapter/authProfileLayer/authResolver.js";
import { createCredentialRef } from "../../../src/agentCore/agent_modelAdapter/authProfileLayer/credentialRef.js";
import { createProviderCaller } from "../../../src/agentCore/agent_modelAdapter/providerAccessLayer/providerCaller.js";
import { createChatGPTCodexResponsesCarrier } from "../../../src/agentCore/agent_modelAdapter/providerAccessLayer/providerCarrier.js";
import {
  fetchProviderTransport,
  type ProviderTransport,
  type ProviderTransportRequest,
  type ProviderTransportResponse,
} from "../../../src/agentCore/agent_modelAdapter/providerAccessLayer/transportCaller.js";

export type RaxodeLiveProvider = {
  auth: AuthEnvelope;
  providerCaller: OpenAIV1ResponsesProviderCaller;
  authSource: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function appendQuery(url: string, query: Readonly<Record<string, string>> | undefined): string {
  const entries = Object.entries(query ?? {}).filter(([key, value]) => key.trim().length > 0 && value.trim().length > 0);
  if (entries.length === 0) return url;
  const target = new URL(url);
  for (const [key, value] of entries) {
    target.searchParams.set(key, value);
  }
  return target.toString();
}

function readSseTextDelta(payload: string): string {
  if (payload.length === 0 || payload === "[DONE]") return "";
  try {
    const parsed = JSON.parse(payload) as unknown;
    if (!isRecord(parsed)) return "";
    const type = typeof parsed.type === "string" ? parsed.type : "";
    const delta = parsed.delta;
    if (typeof delta === "string" && type.includes("output_text")) {
      return delta;
    }
  } catch {
    return "";
  }
  return "";
}

function extractAndPublishSseDeltas(buffer: string, onTextDelta?: (delta: string) => void): string {
  if (!onTextDelta) return buffer;
  const normalized = buffer.replace(/\r\n/gu, "\n");
  const frames = normalized.split("\n\n");
  const remainder = frames.pop() ?? "";
  for (const frame of frames) {
    const payload = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim())
      .join("\n");
    const delta = readSseTextDelta(payload);
    if (delta) {
      onTextDelta(delta);
    }
  }
  return remainder;
}

function createStreamingProviderTransport(onTextDelta?: (delta: string) => void): ProviderTransport {
  if (!onTextDelta) return fetchProviderTransport;
  return async (request: ProviderTransportRequest): Promise<ProviderTransportResponse> => {
    const controller = new AbortController();
    const timeout =
      request.timeoutMs === undefined
        ? undefined
        : setTimeout(() => controller.abort(), request.timeoutMs);
    const signal = request.signal ?? controller.signal;

    try {
      const response = await fetch(appendQuery(request.url, request.query), {
        method: request.method,
        headers: request.headers,
        body:
          request.body === undefined
            ? undefined
            : typeof request.body === "string" || request.body instanceof FormData
              ? request.body
              : JSON.stringify(request.body),
        signal,
      });
      const headers = Object.fromEntries(response.headers.entries());
      const contentType = response.headers.get("content-type") ?? "";
      const reader = response.body?.getReader();
      if (!reader) {
        return await fetchProviderTransport(request);
      }

      const decoder = new TextDecoder();
      let raw = "";
      let pendingSse = "";
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        const text = decoder.decode(chunk.value, { stream: true });
        raw += text;
        if (contentType.includes("text/event-stream")) {
          pendingSse = extractAndPublishSseDeltas(`${pendingSse}${text}`, onTextDelta);
        }
      }
      const tail = decoder.decode();
      if (tail) {
        raw += tail;
        if (contentType.includes("text/event-stream")) {
          pendingSse = extractAndPublishSseDeltas(`${pendingSse}${tail}`, onTextDelta);
        }
      }
      if (contentType.includes("text/event-stream") && pendingSse.trim().length > 0) {
        extractAndPublishSseDeltas(`${pendingSse}\n\n`, onTextDelta);
      }

      let body: unknown = raw;
      if (contentType.includes("application/json")) {
        try {
          body = raw.length > 0 ? JSON.parse(raw) : {};
        } catch {
          body = { rawText: raw };
        }
      }
      return {
        status: response.status,
        headers,
        body,
      };
    } finally {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
    }
  };
}

export function createRaxodeLiveProvider(manifest: AgentManifest, options: {
  codexAuthPath?: string;
  timeoutMs?: number;
  onTextDelta?: (delta: string) => void;
} = {}): RaxodeLiveProvider {
  const codexAuthPath = options.codexAuthPath ?? path.join(process.env.HOME ?? "", ".codex", "auth.json");
  const credentialRef = createCredentialRef({
    id: `raxode:${manifest.identity.id}:chatgpt-codex`,
    provider: "openai",
    credentialType: "chatgpt_codex_oauth",
    source: { kind: "codex-auth-file", filePath: codexAuthPath },
  });
  if (!credentialRef.ok) {
    throw new Error(`credentialRef failed: ${JSON.stringify(credentialRef.error)}`);
  }

  const auth = resolveAuthEnvelope({
    credentialRef: credentialRef.credentialRef,
    readFile: (filePath) => readFileSync(filePath, "utf8"),
  });
  if (!auth.ok) {
    throw new Error(`auth failed: ${JSON.stringify(auth.error)}`);
  }

  const carrier = createChatGPTCodexResponsesCarrier({
    carrierId: manifest.model.carrierId,
    model: manifest.model.model,
    reasoning: { effort: manifest.model.reasoning?.effort },
    credentialRef: credentialRef.credentialRef,
    clientName: manifest.model.clientName ?? "praxis-raxode",
    clientVersion: manifest.model.clientVersion ?? "0.1.0",
  });
  if (!carrier.ok) {
    throw new Error(`carrier failed: ${JSON.stringify(carrier.error)}`);
  }

  return {
    auth: auth.resolved.envelope,
    providerCaller: createProviderCaller({
      transport: createStreamingProviderTransport(options.onTextDelta),
      authMaterial: auth.resolved.privateMaterial,
      timeoutMs: options.timeoutMs ?? 60_000,
    }),
    authSource: codexAuthPath,
  };
}
