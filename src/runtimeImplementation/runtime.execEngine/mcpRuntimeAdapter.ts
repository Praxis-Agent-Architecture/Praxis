import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

import type { BaseToolExecutorPort, BaseToolExecutorResult } from "../../basetool/types.js";

type JsonObject = Record<string, unknown>;

export type McpRuntimeTransportKind = "stdio" | "http" | "sse";

export type McpRuntimeServerProfile =
  | {
      serverId: string;
      transport: "stdio";
      command: string;
      args?: readonly string[];
      cwd?: string;
      env?: Readonly<Record<string, string | undefined>>;
      timeoutMs?: number;
      framing?: "content-length" | "line-json";
    }
  | {
      serverId: string;
      transport: "http" | "sse";
      url: string;
      sseUrl?: string;
      headers?: Readonly<Record<string, string>>;
      timeoutMs?: number;
    };

export type McpRuntimeRoot = {
  uri: string;
  name?: string;
  _meta?: Readonly<Record<string, unknown>>;
};

export type McpRuntimeHostRequest = {
  serverId: string;
  connectionId: string;
  method: string;
  requestId?: string | number | null;
  params: JsonObject;
};

export type McpRuntimeHostNotification = {
  serverId: string;
  connectionId: string;
  method: string;
  params: JsonObject;
};

export type McpRuntimeHostHooks = {
  listRoots?: (request: McpRuntimeHostRequest) => Promise<readonly McpRuntimeRoot[]> | readonly McpRuntimeRoot[];
  createSamplingMessage?: (request: McpRuntimeHostRequest) => Promise<unknown> | unknown;
  elicit?: (request: McpRuntimeHostRequest) => Promise<unknown> | unknown;
  onNotification?: (notification: McpRuntimeHostNotification) => Promise<void> | void;
};

export type McpRuntimeAdapterOptions = {
  servers: readonly McpRuntimeServerProfile[];
  host?: McpRuntimeHostHooks;
};

type JsonRpcMessage = {
  id?: string | number | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: {
    code?: number | string;
    message?: string;
    data?: unknown;
  };
};

type McpConnection = {
  profile: McpRuntimeServerProfile;
  connectionId: string;
  child?: ChildProcessWithoutNullStreams;
  sessionId?: string;
  nextId: number;
  pending: Map<string | number, { resolve: (value: JsonRpcMessage) => void; reject: (reason: Error) => void; timeout: NodeJS.Timeout }>;
  buffer: string;
  notifications: McpRuntimeHostNotification[];
};

const MCP_PROTOCOL_VERSION = "2025-06-18";
const MCP_SESSION_ID_HEADER = "mcp-session-id";

function success<Output>(
  output: Output,
  metadata?: Readonly<Record<string, unknown>>,
): BaseToolExecutorResult<Output> {
  return { ok: true, output, metadata };
}

function failure<Output>(code: string, message: string): BaseToolExecutorResult<Output> {
  return { ok: false, error: { code, message, publicSafe: true } };
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resultObject(value: unknown): JsonObject {
  return isObject(value) ? value : {};
}

function textFromUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value) ?? "";
}

function contentLengthFrame(payload: JsonObject): string {
  const body = JSON.stringify(payload);
  return `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`;
}

function writeStdioPayload(connection: McpConnection, payload: JsonObject): void {
  const framing = connection.profile.transport === "stdio" ? connection.profile.framing ?? "line-json" : undefined;
  connection.child?.stdin.write(framing === "line-json" ? `${JSON.stringify(payload)}\n` : contentLengthFrame(payload));
}

function extractContentLengthFrames(buffer: string): { messages: JsonRpcMessage[]; rest: string } {
  const messages: JsonRpcMessage[] = [];
  let rest = buffer;
  while (true) {
    const headerEnd = rest.indexOf("\r\n\r\n");
    if (headerEnd < 0) break;
    const header = rest.slice(0, headerEnd);
    const match = /^Content-Length:\s*(\d+)$/im.exec(header);
    if (match?.[1] === undefined) {
      rest = rest.slice(headerEnd + 4);
      continue;
    }
    const length = Number.parseInt(match[1], 10);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + length;
    if (rest.length < bodyEnd) break;
    const raw = rest.slice(bodyStart, bodyEnd);
    rest = rest.slice(bodyEnd);
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (isObject(parsed)) messages.push(parsed as JsonRpcMessage);
    } catch {
      // Drop malformed provider frames. The pending call will time out with a public-safe error.
    }
  }
  return { messages, rest };
}

function extractLineJsonFrames(buffer: string): { messages: JsonRpcMessage[]; rest: string } {
  const messages: JsonRpcMessage[] = [];
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (isObject(parsed)) messages.push(parsed as JsonRpcMessage);
    } catch {
      // Drop malformed provider frames. The pending call will time out with a public-safe error.
    }
  }
  return { messages, rest };
}

function jsonRpcMessagesFromUnknown(value: unknown): JsonRpcMessage[] {
  if (Array.isArray(value)) return value.filter(isObject) as JsonRpcMessage[];
  return isObject(value) ? [value as JsonRpcMessage] : [];
}

function parseServerSentEventMessages(text: string): JsonRpcMessage[] {
  const messages: JsonRpcMessage[] = [];
  for (const event of text.split(/\r?\n\r?\n/u)) {
    const dataLines: string[] = [];
    for (const line of event.split(/\r?\n/u)) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice("data:".length);
      dataLines.push(data.startsWith(" ") ? data.slice(1) : data);
    }
    if (dataLines.length === 0) continue;
    try {
      messages.push(...jsonRpcMessagesFromUnknown(JSON.parse(dataLines.join("\n"))));
    } catch {
      // Ignore malformed SSE data frames; the caller will fail if no response frame is present.
    }
  }
  return messages;
}

function parseHttpJsonRpcMessages(contentType: string | null, text: string): JsonRpcMessage[] | undefined {
  if (contentType?.toLowerCase().includes("text/event-stream") === true) {
    return parseServerSentEventMessages(text);
  }
  try {
    return jsonRpcMessagesFromUnknown(JSON.parse(text) as unknown);
  } catch {
    return undefined;
  }
}

export function createMcpRuntimeAdapter(options: McpRuntimeAdapterOptions): NonNullable<BaseToolExecutorPort["mcp"]> {
  const profiles = new Map(options.servers.map((profile) => [profile.serverId, profile]));
  const connections = new Map<string, McpConnection>();
  const rootsByServerId = new Map<string, readonly McpRuntimeRoot[]>();

  const metadata = (profile: McpRuntimeServerProfile, extra: Readonly<Record<string, unknown>> = {}) => ({
    serverId: profile.serverId,
    transport: profile.transport,
    runtimeEntry: "runtime.execEngine.mcpRuntimeAdapter",
    ...extra,
  });

  const getProfile = (serverId: string): McpRuntimeServerProfile | undefined => profiles.get(serverId);

  const subscriptionResourceUri = (requestInput: JsonObject): string | undefined => {
    if (typeof requestInput.uri === "string" && requestInput.uri.trim().length > 0) return requestInput.uri;
    if (typeof requestInput.subject === "string" && requestInput.subject.trim().length > 0) return requestInput.subject;
    if (typeof requestInput.subscriptionId !== "string") return undefined;
    const marker = ":subscription:resource:";
    const markerIndex = requestInput.subscriptionId.indexOf(marker);
    if (markerIndex < 0) return undefined;
    const uri = requestInput.subscriptionId.slice(markerIndex + marker.length);
    return uri.trim().length > 0 ? uri : undefined;
  };

  const getConnection = async (
    serverId: string,
    connectionId?: string,
  ): Promise<BaseToolExecutorResult<McpConnection>> => {
    const profile = getProfile(serverId);
    if (profile === undefined) return failure("MCP_SERVER_NOT_CONFIGURED", `MCP server '${serverId}' is not configured.`);
    const id = connectionId ?? `${serverId}:${profile.transport}:connection`;
    const existing = connections.get(id);
    if (existing !== undefined) return success(existing, metadata(profile, { connectionId: id, reused: true }));
    const created = await connectProfile(profile, id);
    if (!created.ok) return created;
    connections.set(id, created.output);
    return created;
  };

  const request = async (connection: McpConnection, method: string, params: JsonObject = {}): Promise<BaseToolExecutorResult<unknown>> => {
    if (connection.profile.transport === "stdio") {
      return requestStdio(connection, method, params);
    }
    const requested = await requestHttp(connection.profile, method, params, connection.sessionId, (message) => {
      recordNotification(connection, message);
    });
    if (requested.ok && typeof requested.metadata?.mcpSessionId === "string") {
      connection.sessionId = requested.metadata.mcpSessionId;
    }
    return requested;
  };

  const notify = async (connection: McpConnection, method: string, params: JsonObject = {}): Promise<BaseToolExecutorResult<{ status: "notified" }>> => {
    if (connection.profile.transport === "stdio") {
      return notifyStdio(connection, method, params);
    }
    return notifyHttp(connection.profile, method, params, connection.sessionId);
  };

  const closeConnection = (connection: McpConnection): void => {
    for (const [, pending] of connection.pending) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(`MCP connection '${connection.connectionId}' was closed.`));
    }
    connection.pending.clear();
    connection.child?.kill();
  };

  const stdioClientCapabilities = (): JsonObject => ({
    roots: { listChanged: true },
    ...(options.host?.createSamplingMessage === undefined ? {} : { sampling: {} }),
    ...(options.host?.elicit === undefined ? {} : { elicitation: { form: {}, url: {} } }),
  });

  const writeStdioResult = (connection: McpConnection, id: string | number | null | undefined, result: unknown): void => {
    if (id === undefined || id === null) return;
    writeStdioPayload(connection, { jsonrpc: "2.0", id, result });
  };

  const writeStdioError = (
    connection: McpConnection,
    id: string | number | null | undefined,
    code: number,
    message: string,
    data?: unknown,
  ): void => {
    if (id === undefined || id === null) return;
    writeStdioPayload(connection, {
      jsonrpc: "2.0",
      id,
      error: { code, message, ...(data === undefined ? {} : { data }) },
    });
  };

  const hostRequest = (connection: McpConnection, message: JsonRpcMessage): McpRuntimeHostRequest => ({
    serverId: connection.profile.serverId,
    connectionId: connection.connectionId,
    method: message.method ?? "",
    requestId: message.id,
    params: resultObject(message.params),
  });

  const recordNotification = (connection: McpConnection, message: JsonRpcMessage): void => {
    if (typeof message.method !== "string") return;
    const notification = {
      serverId: connection.profile.serverId,
      connectionId: connection.connectionId,
      method: message.method,
      params: resultObject(message.params),
    };
    connection.notifications.push(notification);
    if (connection.notifications.length > 100) connection.notifications.splice(0, connection.notifications.length - 100);
    const notified = options.host?.onNotification?.(notification);
    if (notified !== undefined) void Promise.resolve(notified).catch(() => undefined);
  };

  const handleStdioRequest = async (connection: McpConnection, message: JsonRpcMessage): Promise<void> => {
    if (typeof message.method !== "string") {
      writeStdioError(connection, message.id, -32600, "Invalid MCP JSON-RPC request.");
      return;
    }
    try {
      if (message.method === "ping") {
        writeStdioResult(connection, message.id, {});
        return;
      }
      if (message.method === "roots/list") {
        const requestInput = hostRequest(connection, message);
        const roots = options.host?.listRoots === undefined
          ? rootsByServerId.get(connection.profile.serverId) ?? []
          : await options.host.listRoots(requestInput);
        writeStdioResult(connection, message.id, { roots });
        return;
      }
      if (message.method === "sampling/createMessage") {
        if (options.host?.createSamplingMessage === undefined) {
          writeStdioError(connection, message.id, -32601, "MCP sampling is not configured for this Praxis runtime.");
          return;
        }
        writeStdioResult(connection, message.id, await options.host.createSamplingMessage(hostRequest(connection, message)));
        return;
      }
      if (message.method === "elicitation/create") {
        if (options.host?.elicit === undefined) {
          writeStdioError(connection, message.id, -32601, "MCP elicitation is not configured for this Praxis runtime.");
          return;
        }
        writeStdioResult(connection, message.id, await options.host.elicit(hostRequest(connection, message)));
        return;
      }
      writeStdioError(connection, message.id, -32601, `MCP client method '${message.method}' is not supported by this Praxis runtime.`);
    } catch (error) {
      writeStdioError(connection, message.id, -32603, textFromUnknown((error as Error).message ?? error));
    }
  };

  const handleStdioMessage = (connection: McpConnection, message: JsonRpcMessage): void => {
    if (typeof message.method === "string" && message.id !== undefined && message.id !== null) {
      void handleStdioRequest(connection, message);
      return;
    }
    if (typeof message.method === "string") {
      recordNotification(connection, message);
      return;
    }
    if (message.id === undefined || message.id === null) return;
    const pending = connection.pending.get(message.id);
    if (pending === undefined) return;
    clearTimeout(pending.timeout);
    connection.pending.delete(message.id);
    pending.resolve(message);
  };

  const connectProfile = async (
    profile: McpRuntimeServerProfile,
    connectionId: string,
  ): Promise<BaseToolExecutorResult<McpConnection>> => {
    if (profile.transport === "stdio") {
      const child = spawn(profile.command, [...(profile.args ?? [])], {
        cwd: profile.cwd,
        env: { ...process.env, ...(profile.env ?? {}) },
        stdio: ["pipe", "pipe", "pipe"],
      });
      const connection: McpConnection = { profile, connectionId, child, nextId: 1, pending: new Map(), buffer: "", notifications: [] };
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        const extracted = (profile.framing ?? "line-json") === "line-json"
          ? extractLineJsonFrames(connection.buffer + chunk)
          : extractContentLengthFrames(connection.buffer + chunk);
        connection.buffer = extracted.rest;
        for (const message of extracted.messages) {
          handleStdioMessage(connection, message);
        }
      });
      child.on("error", (error) => {
        connections.delete(connectionId);
        for (const [id, pending] of connection.pending) {
          clearTimeout(pending.timeout);
          pending.reject(new Error(`MCP stdio server error before response ${String(id)}: ${textFromUnknown(error.message)}`));
        }
        connection.pending.clear();
      });
      child.on("exit", () => {
        connections.delete(connectionId);
        for (const [id, pending] of connection.pending) {
          clearTimeout(pending.timeout);
          pending.reject(new Error(`MCP stdio server exited before response ${String(id)}.`));
        }
        connection.pending.clear();
      });
      const initialized = await requestStdio(connection, "initialize", {
        protocolVersion: "2025-06-18",
        capabilities: stdioClientCapabilities(),
        clientInfo: { name: "praxis-agentcore", version: "0.1.0" },
      });
      if (!initialized.ok) {
        child.kill();
        return initialized;
      }
      writeStdioPayload(connection, { jsonrpc: "2.0", method: "notifications/initialized", params: {} });
      return success(connection, metadata(profile, { connectionId, initialized: true }));
    }

    if (profile.transport === "sse" && profile.sseUrl !== undefined) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), profile.timeoutMs ?? 2_000);
      try {
        const response = await fetch(profile.sseUrl, { headers: httpHeaders(profile), signal: controller.signal });
        if (!response.ok) return failure("MCP_SSE_CONNECT_FAILED", `MCP SSE endpoint returned HTTP ${response.status}.`);
      } catch (error) {
        return failure("MCP_SSE_CONNECT_FAILED", textFromUnknown((error as Error).message ?? error));
      } finally {
        clearTimeout(timeout);
      }
    }

    const connection: McpConnection = { profile, connectionId, nextId: 1, pending: new Map(), buffer: "", notifications: [] };
    const initialized = await requestHttp(profile, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "praxis-agentcore", version: "0.1.0" },
    }, undefined, (message) => {
      recordNotification(connection, message);
    });
    if (!initialized.ok) return initialized;
    const sessionId = typeof initialized.metadata?.mcpSessionId === "string" ? initialized.metadata.mcpSessionId : undefined;
    const notified = await notifyHttp(profile, "notifications/initialized", {}, sessionId);
    if (!notified.ok) return notified;
    connection.sessionId = sessionId;
    return success(connection, metadata(profile, { connectionId, initialized: true, sessionId }));
  };

  return {
    async shutdown() {
      const closedConnections = connections.size;
      for (const [, connection] of connections) {
        closeConnection(connection);
      }
      connections.clear();
      return success({
        status: "shutdown",
        closedConnections,
        serverIds: [...profiles.keys()],
      });
    },
    async authenticate(requestInput) {
      const profile = getProfile(requestInput.serverId);
      if (profile === undefined) return failure("MCP_SERVER_NOT_CONFIGURED", `MCP server '${requestInput.serverId}' is not configured.`);
      return success({ status: "authenticated", serverId: requestInput.serverId, authSessionId: `${requestInput.serverId}:runtime-profile`, scopesGranted: requestInput.requestedScopes ?? [], providerMetadata: metadata(profile) });
    },
    async authorize(requestInput) {
      const profile = getProfile(requestInput.serverId);
      if (profile === undefined) return failure("MCP_SERVER_NOT_CONFIGURED", `MCP server '${requestInput.serverId}' is not configured.`);
      return success({ decision: "allowed", reason: "MCP runtime adapter profile is configured.", scopesGranted: requestInput.requestedScopes ?? [], providerMetadata: metadata(profile) });
    },
    async cache(requestInput) {
      const profile = getProfile(requestInput.serverId);
      if (profile === undefined) return failure("MCP_SERVER_NOT_CONFIGURED", `MCP server '${requestInput.serverId}' is not configured.`);
      return success({ cacheKey: requestInput.cacheKey, status: "cached", providerMetadata: metadata(profile) });
    },
    async invalidateCache(requestInput) {
      const profile = getProfile(requestInput.serverId);
      if (profile === undefined) return failure("MCP_SERVER_NOT_CONFIGURED", `MCP server '${requestInput.serverId}' is not configured.`);
      return success({ scope: requestInput.scope, cacheKey: requestInput.cacheKey, status: "invalidated", invalidatedCount: 1, providerMetadata: metadata(profile) });
    },
    async connect(requestInput) {
      const connected = await getConnection(requestInput.serverId, requestInput.connectionId);
      if (!connected.ok) return connected;
      return success({ connectionId: connected.output.connectionId, status: "connected", serverId: requestInput.serverId, providerMetadata: metadata(connected.output.profile, { connectionId: connected.output.connectionId }) });
    },
    async disconnect(requestInput) {
      const profile = getProfile(requestInput.serverId);
      if (profile === undefined) return failure("MCP_SERVER_NOT_CONFIGURED", `MCP server '${requestInput.serverId}' is not configured.`);
      const id = requestInput.connectionId ?? `${requestInput.serverId}:${profile.transport}:connection`;
      const connection = connections.get(id);
      if (connection === undefined) return success({ connectionId: id, status: "not_found", serverId: requestInput.serverId, providerMetadata: metadata(profile, { connectionId: id }) });
      closeConnection(connection);
      connections.delete(id);
      return success({ connectionId: id, status: "disconnected", serverId: requestInput.serverId, providerMetadata: metadata(profile, { connectionId: id }) });
    },
    async subscribe(requestInput) {
      const connected = await getConnection(requestInput.serverId, requestInput.connectionId);
      if (!connected.ok) return connected;
      const resourceUri = subscriptionResourceUri(requestInput);
      if ((requestInput.subjectType === undefined || requestInput.subjectType === "resource") && resourceUri !== undefined) {
        const subscribed = await request(connected.output, "resources/subscribe", { uri: resourceUri });
        if (!subscribed.ok) return subscribed;
        return success({
          subscriptionId: `${requestInput.serverId}:subscription:resource:${resourceUri}`,
          status: "subscribed",
          serverId: requestInput.serverId,
          connectionId: connected.output.connectionId,
          uri: resourceUri,
          providerMetadata: metadata(connected.output.profile, {
            method: "resources/subscribe",
            eventKinds: requestInput.eventKinds ?? [],
          }),
          raw: subscribed.output,
        });
      }
      return success({
        subscriptionId: `${requestInput.serverId}:subscription:${requestInput.subjectType}:${requestInput.subject}`,
        status: "subscribed",
        serverId: requestInput.serverId,
        connectionId: connected.output.connectionId,
        providerMetadata: metadata(connected.output.profile, {
          eventKinds: requestInput.eventKinds ?? [],
          hostSemantic: "subscribe",
          localOnly: true,
        }),
      });
    },
    async unsubscribe(requestInput) {
      const connected = await getConnection(requestInput.serverId, requestInput.connectionId);
      if (!connected.ok) return connected;
      const resourceUri = subscriptionResourceUri(requestInput);
      if (resourceUri !== undefined) {
        const unsubscribed = await request(connected.output, "resources/unsubscribe", { uri: resourceUri });
        if (!unsubscribed.ok) return unsubscribed;
        return success({
          subscriptionId: requestInput.subscriptionId ?? `${requestInput.serverId}:subscription:resource:${resourceUri}`,
          status: "unsubscribed",
          serverId: requestInput.serverId,
          connectionId: connected.output.connectionId,
          uri: resourceUri,
          providerMetadata: metadata(connected.output.profile, { method: "resources/unsubscribe" }),
          raw: unsubscribed.output,
        });
      }
      return success({
        subscriptionId: requestInput.subscriptionId,
        status: "unsubscribed",
        serverId: requestInput.serverId,
        connectionId: connected.output.connectionId,
        providerMetadata: metadata(connected.output.profile, { hostSemantic: "unsubscribe", localOnly: true }),
      });
    },
    async callTool(requestInput) {
      const connected = await getConnection(requestInput.serverId);
      if (!connected.ok) return connected;
      const called = await request(connected.output, "tools/call", { name: requestInput.toolName, arguments: requestInput.arguments ?? {} });
      if (!called.ok) return called;
      return success(called.output, metadata(connected.output.profile, { method: "tools/call", toolName: requestInput.toolName }));
    },
    async streamTool(requestInput) {
      const connected = await getConnection(requestInput.serverId);
      if (!connected.ok) return connected;
      const called = await request(connected.output, "tools/call", { name: requestInput.name, arguments: requestInput.arguments ?? {} });
      if (!called.ok) return called;
      return success({ executionId: `${requestInput.serverId}:execution:${requestInput.name}`, streamId: `${requestInput.serverId}:stream:${requestInput.name}`, status: "completed", channel: requestInput.channel ?? "chunks", chunks: [called.output], providerMetadata: metadata(connected.output.profile, { method: "tools/call", toolName: requestInput.name }) });
    },
    async cancelExecution(requestInput) {
      const connected = await getConnection(requestInput.serverId);
      if (!connected.ok) return connected;
      const cancelled = await notify(connected.output, "notifications/cancelled", {
        requestId: requestInput.executionId,
        reason: requestInput.reason,
      });
      if (!cancelled.ok) return cancelled;
      return success({ executionId: requestInput.executionId, status: "cancelled", serverId: requestInput.serverId, providerMetadata: metadata(connected.output.profile, { method: "notifications/cancelled" }) });
    },
    async nativeExecute(requestInput) {
      const connected = await getConnection(requestInput.serverId);
      if (!connected.ok) return connected;
      const executed = await request(connected.output, requestInput.method, requestInput.params ?? {});
      if (!executed.ok) return executed;
      return success({ status: "executed", result: executed.output, providerMetadata: metadata(connected.output.profile, { method: requestInput.method }) });
    },
    async listTools(requestInput) {
      const connected = await getConnection(requestInput.serverId);
      if (!connected.ok) return connected;
      const listed = await request(connected.output, "tools/list", requestInput.cursor === undefined ? {} : { cursor: requestInput.cursor });
      if (!listed.ok) return listed;
      const raw = resultObject(listed.output);
      const tools = Array.isArray(raw.tools) ? raw.tools.filter(isObject).map((tool) => ({
        name: String(tool.name ?? ""),
        title: typeof tool.title === "string" ? tool.title : undefined,
        description: typeof tool.description === "string" ? tool.description : undefined,
        inputSchema: tool.inputSchema ?? tool.input_schema,
        namespace: requestInput.namespace,
        raw: tool,
      })).filter((tool) => tool.name.length > 0) : [];
      return success({
        tools,
        nextCursor: typeof raw.nextCursor === "string" ? raw.nextCursor : undefined,
        providerMetadata: metadata(connected.output.profile, { method: "tools/list" }),
        raw: listed.output,
      });
    },
    async registerTool(requestInput) {
      const profile = getProfile(requestInput.serverId);
      if (profile === undefined) return failure("MCP_SERVER_NOT_CONFIGURED", `MCP server '${requestInput.serverId}' is not configured.`);
      return success({ name: requestInput.tool.name, status: "registered", providerMetadata: metadata(profile, { localRegistryOnly: true }) });
    },
    async updateTool(requestInput) {
      const profile = getProfile(requestInput.serverId);
      if (profile === undefined) return failure("MCP_SERVER_NOT_CONFIGURED", `MCP server '${requestInput.serverId}' is not configured.`);
      return success({ toolName: requestInput.patch.name ?? requestInput.toolName, status: "updated", providerMetadata: metadata(profile, { localRegistryOnly: true }) });
    },
    async unregisterTool(requestInput) {
      const profile = getProfile(requestInput.serverId);
      if (profile === undefined) return failure("MCP_SERVER_NOT_CONFIGURED", `MCP server '${requestInput.serverId}' is not configured.`);
      return success({ toolName: requestInput.toolName, status: "unregistered", providerMetadata: metadata(profile, { localRegistryOnly: true }) });
    },
    async listResources(requestInput) {
      const connected = await getConnection(requestInput.serverId);
      if (!connected.ok) return connected;
      const listed = await request(connected.output, "resources/list", requestInput.cursor === undefined ? {} : { cursor: requestInput.cursor });
      if (!listed.ok) return listed;
      const raw = resultObject(listed.output);
      const resources = Array.isArray(raw.resources) ? raw.resources.filter(isObject).map((resource) => ({
        uri: String(resource.uri ?? ""),
        name: typeof resource.name === "string" ? resource.name : undefined,
        mimeType: typeof resource.mimeType === "string" ? resource.mimeType : typeof resource.mime_type === "string" ? resource.mime_type : undefined,
        raw: resource,
      })).filter((resource) => resource.uri.length > 0 && (requestInput.uriPrefix === undefined || resource.uri.startsWith(requestInput.uriPrefix))) : [];
      const nextCursor = typeof raw.nextCursor === "string" ? raw.nextCursor : undefined;
      return success({
        resources,
        nextCursor,
        exhausted: nextCursor === undefined,
        providerMetadata: metadata(connected.output.profile, { method: "resources/list" }),
        raw: listed.output,
      });
    },
    async listResourceTemplates(requestInput) {
      const connected = await getConnection(requestInput.serverId);
      if (!connected.ok) return connected;
      const listed = await request(connected.output, "resources/templates/list", requestInput.cursor === undefined ? {} : { cursor: requestInput.cursor });
      if (!listed.ok) return listed;
      const raw = resultObject(listed.output);
      const resourceTemplates = Array.isArray(raw.resourceTemplates) ? raw.resourceTemplates.filter(isObject).map((template) => ({
        uriTemplate: String(template.uriTemplate ?? template.uri_template ?? ""),
        name: typeof template.name === "string" ? template.name : undefined,
        title: typeof template.title === "string" ? template.title : undefined,
        description: typeof template.description === "string" ? template.description : undefined,
        mimeType: typeof template.mimeType === "string" ? template.mimeType : typeof template.mime_type === "string" ? template.mime_type : undefined,
        raw: template,
      })).filter((template) => template.uriTemplate.length > 0) : [];
      const nextCursor = typeof raw.nextCursor === "string" ? raw.nextCursor : undefined;
      return success({
        resourceTemplates,
        templates: resourceTemplates,
        nextCursor,
        exhausted: nextCursor === undefined,
        providerMetadata: metadata(connected.output.profile, { method: "resources/templates/list" }),
        raw: listed.output,
      });
    },
    async readResource(requestInput) {
      const connected = await getConnection(requestInput.serverId);
      if (!connected.ok) return connected;
      const uri = typeof requestInput.uri === "string" ? requestInput.uri : requestInput.resourceUri;
      const read = await request(connected.output, "resources/read", { uri });
      if (!read.ok) return read;
      const raw = resultObject(read.output);
      const contents = Array.isArray(raw.contents) ? raw.contents.filter(isObject).map((content) => ({
        mimeType: typeof content.mimeType === "string" ? content.mimeType : typeof content.mime_type === "string" ? content.mime_type : undefined,
        text: typeof content.text === "string" ? content.text : undefined,
        bytesBase64: typeof content.blob === "string" ? content.blob : undefined,
        raw: content,
      })) : [];
      return success({ uri, contents, truncated: false, providerMetadata: metadata(connected.output.profile, { method: "resources/read" }), raw: read.output });
    },
    async listPrompts(requestInput) {
      const connected = await getConnection(requestInput.serverId);
      if (!connected.ok) return connected;
      const listed = await request(connected.output, "prompts/list", requestInput.cursor === undefined ? {} : { cursor: requestInput.cursor });
      if (!listed.ok) return listed;
      const raw = resultObject(listed.output);
      const prompts = Array.isArray(raw.prompts) ? raw.prompts.filter(isObject).map((prompt) => ({
        name: String(prompt.name ?? ""),
        title: typeof prompt.title === "string" ? prompt.title : undefined,
        description: typeof prompt.description === "string" ? prompt.description : undefined,
        arguments: Array.isArray(prompt.arguments) ? prompt.arguments : undefined,
        raw: prompt,
      })).filter((prompt) => prompt.name.length > 0) : [];
      return success({ prompts, nextCursor: typeof raw.nextCursor === "string" ? raw.nextCursor : undefined, providerMetadata: metadata(connected.output.profile, { method: "prompts/list" }), raw: listed.output });
    },
    async getPrompt(requestInput) {
      const connected = await getConnection(requestInput.serverId);
      if (!connected.ok) return connected;
      const read = await request(connected.output, "prompts/get", { name: requestInput.name, arguments: requestInput.arguments ?? {} });
      if (!read.ok) return read;
      return success(read.output, metadata(connected.output.profile, { method: "prompts/get", promptName: requestInput.name }));
    },
    async complete(requestInput) {
      const connected = await getConnection(requestInput.serverId);
      if (!connected.ok) return connected;
      const params = {
        ref: isObject(requestInput.ref) ? requestInput.ref : {},
        argument: isObject(requestInput.argument) ? requestInput.argument : {},
        ...(isObject(requestInput.context) ? { context: requestInput.context } : {}),
      };
      const completed = await request(connected.output, "completion/complete", params);
      if (!completed.ok) return completed;
      const raw = resultObject(completed.output);
      const completion = isObject(raw.completion) ? raw.completion : {};
      return success({
        completion,
        values: Array.isArray(completion.values) ? completion.values.filter((value) => typeof value === "string") : [],
        total: typeof completion.total === "number" ? completion.total : undefined,
        hasMore: typeof completion.hasMore === "boolean" ? completion.hasMore : undefined,
        providerMetadata: metadata(connected.output.profile, { method: "completion/complete" }),
        raw: completed.output,
      });
    },
    async setRoots(requestInput) {
      const profile = getProfile(requestInput.serverId);
      if (profile === undefined) return failure("MCP_SERVER_NOT_CONFIGURED", `MCP server '${requestInput.serverId}' is not configured.`);
      const roots = (Array.isArray(requestInput.roots) ? requestInput.roots.filter(isObject).map((root: JsonObject) => ({
        uri: String(root.uri ?? ""),
        name: typeof root.name === "string" ? root.name : undefined,
        _meta: isObject(root._meta) ? root._meta : undefined,
      })).filter((root: McpRuntimeRoot) => root.uri.length > 0) : []) satisfies readonly McpRuntimeRoot[];
      rootsByServerId.set(requestInput.serverId, roots);
      for (const [, connection] of connections) {
        if (connection.profile.serverId === requestInput.serverId) {
          await notify(connection, "notifications/roots/list_changed", {});
        }
      }
      return success({ serverId: requestInput.serverId, roots, status: "registered", providerMetadata: metadata(profile, { hostSemantic: "roots" }) });
    },
    async reportProgress(requestInput) {
      const profile = getProfile(requestInput.serverId);
      if (profile === undefined) return failure("MCP_SERVER_NOT_CONFIGURED", `MCP server '${requestInput.serverId}' is not configured.`);
      return success({ serverId: requestInput.serverId, progressToken: requestInput.progressToken, progress: requestInput.progress, total: requestInput.total, status: "reported", providerMetadata: metadata(profile, { hostSemantic: "progress" }) });
    },
    async createSamplingMessage(requestInput) {
      const profile = getProfile(requestInput.serverId);
      if (profile === undefined) return failure("MCP_SERVER_NOT_CONFIGURED", `MCP server '${requestInput.serverId}' is not configured.`);
      return success({ serverId: requestInput.serverId, status: "accepted", request: requestInput, providerMetadata: metadata(profile, { hostSemantic: "sampling" }) });
    },
    async elicit(requestInput) {
      const profile = getProfile(requestInput.serverId);
      if (profile === undefined) return failure("MCP_SERVER_NOT_CONFIGURED", `MCP server '${requestInput.serverId}' is not configured.`);
      return success({ serverId: requestInput.serverId, status: "pending", request: requestInput, providerMetadata: metadata(profile, { hostSemantic: "elicitation" }) });
    },
    async setLoggingLevel(requestInput) {
      const connected = await getConnection(requestInput.serverId);
      if (!connected.ok) return connected;
      const level = requestInput.level ?? "info";
      const configured = await request(connected.output, "logging/setLevel", { level });
      if (!configured.ok) return configured;
      return success({ serverId: requestInput.serverId, level, status: "configured", providerMetadata: metadata(connected.output.profile, { method: "logging/setLevel" }), raw: configured.output });
    },
    async createResource(requestInput) {
      const profile = getProfile(requestInput.serverId);
      if (profile === undefined) return failure("MCP_SERVER_NOT_CONFIGURED", `MCP server '${requestInput.serverId}' is not configured.`);
      return success({ uri: requestInput.uri, status: "created", revision: "runtime-local", providerMetadata: metadata(profile, { localResourceMutation: true }) });
    },
    async updateResource(requestInput) {
      const profile = getProfile(requestInput.serverId);
      if (profile === undefined) return failure("MCP_SERVER_NOT_CONFIGURED", `MCP server '${requestInput.serverId}' is not configured.`);
      return success({ uri: requestInput.resourceUri, status: "updated", revision: requestInput.expectedRevision ?? "runtime-local", providerMetadata: metadata(profile, { localResourceMutation: true }) });
    },
    async deleteResource(requestInput) {
      const profile = getProfile(requestInput.serverId);
      if (profile === undefined) return failure("MCP_SERVER_NOT_CONFIGURED", `MCP server '${requestInput.serverId}' is not configured.`);
      return success({ uri: requestInput.uri, status: "deleted", providerMetadata: metadata(profile, { localResourceMutation: true }) });
    },
    async ping(requestInput) {
      const connected = await getConnection(requestInput.serverId, requestInput.connectionId);
      if (!connected.ok) return connected;
      return success({ healthy: true, status: "ok", latencyMs: 0, providerMetadata: metadata(connected.output.profile, { connectionId: connected.output.connectionId }) });
    },
    async checkHealth(requestInput) {
      const connected = await getConnection(requestInput.serverId, requestInput.connectionId);
      if (!connected.ok) return connected;
      const listed = requestInput.includeCapabilities === true ? await request(connected.output, "tools/list", {}) : undefined;
      const capabilities = listed?.ok === true ? ["tools", "resources", "ping"] : ["ping"];
      return success({ status: "healthy", connection: "connected", latencyMs: 0, capabilities, providerMetadata: metadata(connected.output.profile, { connectionId: connected.output.connectionId }) });
    },
  };
}

async function requestStdio(connection: McpConnection, method: string, params: JsonObject): Promise<BaseToolExecutorResult<unknown>> {
  if (connection.child === undefined) return failure("MCP_STDIO_NOT_CONNECTED", "MCP stdio child process is not connected.");
  const id = connection.nextId++;
  const payload = { jsonrpc: "2.0", id, method, params };
  const timeoutMs = connection.profile.timeoutMs ?? 5_000;
  const response = new Promise<JsonRpcMessage>((resolve, reject) => {
    const timeout = setTimeout(() => {
      connection.pending.delete(id);
      reject(new Error(`MCP stdio request '${method}' timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
    connection.pending.set(id, { resolve, reject, timeout });
  });
  writeStdioPayload(connection, payload);
  try {
    return normalizeJsonRpcResponse(await response);
  } catch (error) {
    return failure("MCP_STDIO_REQUEST_FAILED", textFromUnknown((error as Error).message ?? error));
  }
}

async function notifyStdio(connection: McpConnection, method: string, params: JsonObject): Promise<BaseToolExecutorResult<{ status: "notified" }>> {
  if (connection.child === undefined) return failure("MCP_STDIO_NOT_CONNECTED", "MCP stdio child process is not connected.");
  writeStdioPayload(connection, { jsonrpc: "2.0", method, params });
  return success({ status: "notified" });
}

function httpHeaders(
  profile: Extract<McpRuntimeServerProfile, { transport: "http" | "sse" }>,
  sessionId?: string,
): Record<string, string> {
  return {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": MCP_PROTOCOL_VERSION,
    ...(profile.headers ?? {}),
    ...(sessionId === undefined ? {} : { [MCP_SESSION_ID_HEADER]: sessionId }),
  };
}

async function requestHttp(
  profile: Extract<McpRuntimeServerProfile, { transport: "http" | "sse" }>,
  method: string,
  params: JsonObject,
  sessionId?: string,
  onNotification?: (message: JsonRpcMessage) => void,
): Promise<BaseToolExecutorResult<unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), profile.timeoutMs ?? 5_000);
  const requestId = `${Date.now()}:${Math.random()}`;
  try {
    const response = await fetch(profile.url, {
      method: "POST",
      headers: httpHeaders(profile, sessionId),
      body: JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }),
      signal: controller.signal,
    });
    if (!response.ok) return failure("MCP_HTTP_REQUEST_FAILED", `MCP HTTP endpoint returned HTTP ${response.status}.`);
    const body = await response.text();
    const messages = parseHttpJsonRpcMessages(response.headers.get("content-type"), body);
    if (messages === undefined) return failure("MCP_HTTP_RESPONSE_INVALID", "MCP HTTP response was not valid JSON or SSE JSON-RPC.");
    for (const message of messages) {
      if (typeof message.method === "string" && (message.id === undefined || message.id === null)) {
        onNotification?.(message);
      }
    }
    const responseMessage = messages.find((message) => message.id === requestId)
      ?? messages.find((message) => message.id !== undefined && message.id !== null && message.method === undefined);
    if (responseMessage === undefined) return failure("MCP_HTTP_RESPONSE_INVALID", "MCP HTTP response did not include a JSON-RPC response for the request.");
    const normalized = normalizeJsonRpcResponse(responseMessage);
    const responseSessionId = response.headers.get(MCP_SESSION_ID_HEADER) ?? undefined;
    if (!normalized.ok || responseSessionId === undefined) return normalized;
    return success(normalized.output, { ...(normalized.metadata ?? {}), mcpSessionId: responseSessionId });
  } catch (error) {
    return failure("MCP_HTTP_REQUEST_FAILED", textFromUnknown((error as Error).message ?? error));
  } finally {
    clearTimeout(timeout);
  }
}

async function notifyHttp(
  profile: Extract<McpRuntimeServerProfile, { transport: "http" | "sse" }>,
  method: string,
  params: JsonObject,
  sessionId?: string,
): Promise<BaseToolExecutorResult<{ status: "notified" }>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), profile.timeoutMs ?? 5_000);
  try {
    const response = await fetch(profile.url, {
      method: "POST",
      headers: httpHeaders(profile, sessionId),
      body: JSON.stringify({ jsonrpc: "2.0", method, params }),
      signal: controller.signal,
    });
    if (!response.ok) return failure("MCP_HTTP_NOTIFICATION_FAILED", `MCP HTTP endpoint returned HTTP ${response.status}.`);
    return success({ status: "notified" });
  } catch (error) {
    return failure("MCP_HTTP_NOTIFICATION_FAILED", textFromUnknown((error as Error).message ?? error));
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeJsonRpcResponse(response: JsonRpcMessage): BaseToolExecutorResult<unknown> {
  if (response.error !== undefined) {
    return failure("MCP_JSONRPC_ERROR", response.error.message ?? `MCP JSON-RPC error ${String(response.error.code ?? "unknown")}.`);
  }
  return success(response.result ?? {});
}
