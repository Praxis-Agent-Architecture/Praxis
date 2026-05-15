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

export type RaxodeCodexRoutingOptions = {
  sessionId?: string;
  runtimeId?: string;
  turnId?: string;
  installationId?: string;
  windowId?: string;
};

export type RaxodeProviderStreamEvent = {
  channel: "tool_call_preview";
  phase: "started" | "delta" | "done";
  itemId?: string;
  outputIndex?: number;
  callId?: string;
  providerToolName?: string;
  argumentsDelta?: string;
  arguments?: string;
  rawType?: string;
};

export type RaxodeToolCallPreviewState = Map<string, {
  itemId?: string;
  outputIndex?: number;
  callId?: string;
  providerToolName?: string;
}>;

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

function cleanHeaderValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && /^[\x20-\x7e]+$/u.test(trimmed) ? trimmed : undefined;
}

function headerValue(headers: Readonly<Record<string, string>>, name: string): string | undefined {
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName) {
      return cleanHeaderValue(value);
    }
  }
  return undefined;
}

function readCodexInstallationId(codexAuthPath: string): string | undefined {
  const installationPath = path.join(path.dirname(codexAuthPath), "installation_id");
  try {
    return cleanHeaderValue(readFileSync(installationPath, "utf8"));
  } catch {
    return undefined;
  }
}

function codexTurnMetadata(options: RaxodeCodexRoutingOptions): string | undefined {
  const turnId = cleanHeaderValue(options.turnId);
  const sessionId = cleanHeaderValue(options.sessionId);
  const runtimeId = cleanHeaderValue(options.runtimeId);
  if (turnId === undefined && sessionId === undefined && runtimeId === undefined) return undefined;
  return JSON.stringify({
    ...(sessionId ? { session_id: sessionId } : {}),
    ...(turnId ? { turn_id: turnId } : {}),
    ...(runtimeId ? { runtime_id: runtimeId } : {}),
    source: "raxode",
  });
}

function withCodexClientMetadata(body: unknown, options: RaxodeCodexRoutingOptions): unknown {
  if (body === null || typeof body !== "object" || Array.isArray(body) || body instanceof FormData) {
    return body;
  }
  const record = body as Record<string, unknown>;
  const currentMetadata =
    record.client_metadata !== null && typeof record.client_metadata === "object" && !Array.isArray(record.client_metadata)
      ? record.client_metadata as Record<string, unknown>
      : {};
  const installationId = cleanHeaderValue(options.installationId);
  const windowId = cleanHeaderValue(options.windowId ?? options.runtimeId);
  return {
    ...record,
    client_metadata: {
      ...currentMetadata,
      ...(installationId ? { "x-codex-installation-id": installationId } : {}),
      ...(windowId ? { "x-codex-window-id": windowId } : {}),
    },
  };
}

export function createCodexRoutingTransport(
  baseTransport: ProviderTransport,
  options: RaxodeCodexRoutingOptions = {},
): ProviderTransport {
  let turnState: string | undefined;
  return async (request: ProviderTransportRequest): Promise<ProviderTransportResponse> => {
    const sessionId = cleanHeaderValue(options.sessionId);
    const requestId = sessionId;
    const metadata = codexTurnMetadata(options);
    const installationId = cleanHeaderValue(options.installationId);
    const windowId = cleanHeaderValue(options.windowId ?? options.runtimeId);
    const headers: Record<string, string> = {
      ...(request.headers ?? {}),
      ...(requestId ? { "x-client-request-id": requestId, session_id: requestId } : {}),
      ...(metadata ? { "x-codex-turn-metadata": metadata } : {}),
      ...(turnState ? { "x-codex-turn-state": turnState } : {}),
      ...(installationId ? { "x-codex-installation-id": installationId } : {}),
      ...(windowId ? { "x-codex-window-id": windowId } : {}),
    };
    const response = await baseTransport({
      ...request,
      headers,
      body: withCodexClientMetadata(request.body, { ...options, installationId, windowId }),
    });
    turnState = headerValue(response.headers, "x-codex-turn-state") ?? turnState;
    return response;
  };
}

export function readSseTextDelta(payload: string): string {
  if (payload.length === 0 || payload === "[DONE]") return "";
  try {
    const parsed = JSON.parse(payload) as unknown;
    if (!isRecord(parsed)) return "";
    const type = typeof parsed.type === "string" ? parsed.type : "";
    const delta = parsed.delta;
    if (
      typeof delta === "string"
      && (
        type.includes("output_text")
        || type.includes("summary_text")
        || type.includes("reasoning_summary")
      )
    ) {
      return delta;
    }
  } catch {
    return "";
  }
  return "";
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function readSseToolCallPreviewEvent(payload: string): RaxodeProviderStreamEvent | undefined {
  if (payload.length === 0 || payload === "[DONE]") return undefined;
  try {
    const parsed = JSON.parse(payload) as unknown;
    if (!isRecord(parsed)) return undefined;
    const type = readString(parsed.type);
    const outputIndex = readNumber(parsed.output_index);
    const itemId = readString(parsed.item_id);
    if ((type === "response.output_item.added" || type === "response.output_item.done") && isRecord(parsed.item)) {
      const item = parsed.item;
      if (item.type !== "function_call") return undefined;
      return {
        channel: "tool_call_preview",
        phase: type === "response.output_item.added" ? "started" : "done",
        itemId: readString(item.id) ?? itemId,
        outputIndex,
        callId: readString(item.call_id),
        providerToolName: readString(item.name),
        arguments: readString(item.arguments),
        rawType: type,
      };
    }
    if (type === "response.function_call_arguments.delta") {
      const delta = readString(parsed.delta);
      if (delta === undefined) return undefined;
      return {
        channel: "tool_call_preview",
        phase: "delta",
        itemId,
        outputIndex,
        callId: readString(parsed.call_id),
        argumentsDelta: delta,
        rawType: type,
      };
    }
    if (type === "response.function_call_arguments.done") {
      return {
        channel: "tool_call_preview",
        phase: "done",
        itemId,
        outputIndex,
        callId: readString(parsed.call_id),
        arguments: readString(parsed.arguments),
        rawType: type,
      };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function looksLikeSseChunk(value: string): boolean {
  return /(?:^|\n)(?:event|data):\s*/u.test(value);
}

function previewStateKeys(event: RaxodeProviderStreamEvent): string[] {
  return [
    event.itemId ? `item:${event.itemId}` : undefined,
    event.callId ? `call:${event.callId}` : undefined,
    typeof event.outputIndex === "number" ? `output:${event.outputIndex}` : undefined,
  ].filter((key): key is string => key !== undefined);
}

function rememberToolCallPreviewEvent(
  state: RaxodeToolCallPreviewState,
  event: RaxodeProviderStreamEvent,
): RaxodeProviderStreamEvent {
  const known = previewStateKeys(event)
    .map((key) => state.get(key))
    .find((entry) => entry !== undefined);
  const enriched: RaxodeProviderStreamEvent = {
    ...event,
    itemId: event.itemId ?? known?.itemId,
    outputIndex: event.outputIndex ?? known?.outputIndex,
    callId: event.callId ?? known?.callId,
    providerToolName: event.providerToolName ?? known?.providerToolName,
  };
  const shouldRemember = enriched.itemId !== undefined
    || enriched.callId !== undefined
    || enriched.providerToolName !== undefined;
  if (shouldRemember) {
    const snapshot = {
      itemId: enriched.itemId,
      outputIndex: enriched.outputIndex,
      callId: enriched.callId,
      providerToolName: enriched.providerToolName,
    };
    for (const key of previewStateKeys(enriched)) {
      state.set(key, snapshot);
    }
  }
  return enriched;
}

export function extractAndPublishSseDeltas(
  buffer: string,
  onTextDelta?: (delta: string) => void,
  onProviderStreamEvent?: (event: RaxodeProviderStreamEvent) => void,
  toolCallPreviewState: RaxodeToolCallPreviewState = new Map(),
): string {
  if (!onTextDelta && !onProviderStreamEvent) return buffer;
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
      onTextDelta?.(delta);
    }
    const toolCallPreviewEvent = readSseToolCallPreviewEvent(payload);
    if (toolCallPreviewEvent) {
      onProviderStreamEvent?.(rememberToolCallPreviewEvent(toolCallPreviewState, toolCallPreviewEvent));
    }
  }
  return remainder;
}

function createStreamingProviderTransport(
  onTextDelta?: (delta: string) => void,
  onProviderStreamEvent?: (event: RaxodeProviderStreamEvent) => void,
): ProviderTransport {
  if (!onTextDelta && !onProviderStreamEvent) return fetchProviderTransport;
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
      let shouldParseSse = contentType.includes("text/event-stream");
      const toolCallPreviewState: RaxodeToolCallPreviewState = new Map();
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        const text = decoder.decode(chunk.value, { stream: true });
        raw += text;
        shouldParseSse ||= looksLikeSseChunk(text);
        if (shouldParseSse) {
          pendingSse = extractAndPublishSseDeltas(
            `${pendingSse}${text}`,
            onTextDelta,
            onProviderStreamEvent,
            toolCallPreviewState,
          );
        }
      }
      const tail = decoder.decode();
      if (tail) {
        raw += tail;
        shouldParseSse ||= looksLikeSseChunk(tail);
        if (shouldParseSse) {
          pendingSse = extractAndPublishSseDeltas(
            `${pendingSse}${tail}`,
            onTextDelta,
            onProviderStreamEvent,
            toolCallPreviewState,
          );
        }
      }
      if (shouldParseSse && pendingSse.trim().length > 0) {
        extractAndPublishSseDeltas(
          `${pendingSse}\n\n`,
          onTextDelta,
          onProviderStreamEvent,
          toolCallPreviewState,
        );
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
  sessionId?: string;
  runtimeId?: string;
  turnId?: string;
  onTextDelta?: (delta: string) => void;
  onProviderStreamEvent?: (event: RaxodeProviderStreamEvent) => void;
} = {}): RaxodeLiveProvider {
  const codexAuthPath = options.codexAuthPath ?? path.join(process.env.HOME ?? "", ".codex", "auth.json");
  const installationId = readCodexInstallationId(codexAuthPath);
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
      transport: createCodexRoutingTransport(
        createStreamingProviderTransport(options.onTextDelta, options.onProviderStreamEvent),
        {
          sessionId: options.sessionId,
          runtimeId: options.runtimeId,
          turnId: options.turnId,
          installationId,
          windowId: options.runtimeId,
        },
      ),
      authMaterial: auth.resolved.privateMaterial,
      timeoutMs: options.timeoutMs ?? 600_000,
    }),
    authSource: codexAuthPath,
  };
}
