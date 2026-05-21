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

export type McpRuntimeAdapterOptions = {
  servers: readonly McpRuntimeServerProfile[];
};

type JsonRpcResponse = {
  id?: string | number | null;
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
  nextId: number;
  pending: Map<string | number, { resolve: (value: JsonRpcResponse) => void; reject: (reason: Error) => void; timeout: NodeJS.Timeout }>;
  buffer: string;
};

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

function extractContentLengthFrames(buffer: string): { messages: JsonRpcResponse[]; rest: string } {
  const messages: JsonRpcResponse[] = [];
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
      if (isObject(parsed)) messages.push(parsed as JsonRpcResponse);
    } catch {
      // Drop malformed provider frames. The pending call will time out with a public-safe error.
    }
  }
  return { messages, rest };
}

function extractLineJsonFrames(buffer: string): { messages: JsonRpcResponse[]; rest: string } {
  const messages: JsonRpcResponse[] = [];
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (isObject(parsed)) messages.push(parsed as JsonRpcResponse);
    } catch {
      // Drop malformed provider frames. The pending call will time out with a public-safe error.
    }
  }
  return { messages, rest };
}

export function createMcpRuntimeAdapter(options: McpRuntimeAdapterOptions): NonNullable<BaseToolExecutorPort["mcp"]> {
  const profiles = new Map(options.servers.map((profile) => [profile.serverId, profile]));
  const connections = new Map<string, McpConnection>();

  const metadata = (profile: McpRuntimeServerProfile, extra: Readonly<Record<string, unknown>> = {}) => ({
    serverId: profile.serverId,
    transport: profile.transport,
    runtimeEntry: "runtime.execEngine.mcpRuntimeAdapter",
    ...extra,
  });

  const getProfile = (serverId: string): McpRuntimeServerProfile | undefined => profiles.get(serverId);

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
    return requestHttp(connection.profile, method, params);
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
      const connection: McpConnection = { profile, connectionId, child, nextId: 1, pending: new Map(), buffer: "" };
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        const extracted = profile.framing === "line-json"
          ? extractLineJsonFrames(connection.buffer + chunk)
          : extractContentLengthFrames(connection.buffer + chunk);
        connection.buffer = extracted.rest;
        for (const message of extracted.messages) {
          if (message.id === undefined || message.id === null) continue;
          const pending = connection.pending.get(message.id);
          if (pending === undefined) continue;
          clearTimeout(pending.timeout);
          connection.pending.delete(message.id);
          pending.resolve(message);
        }
      });
      child.on("exit", () => {
        for (const [id, pending] of connection.pending) {
          clearTimeout(pending.timeout);
          pending.reject(new Error(`MCP stdio server exited before response ${String(id)}.`));
        }
        connection.pending.clear();
      });
      const initialized = await requestStdio(connection, "initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "praxis-agentcore", version: "0.1.0" },
      });
      if (!initialized.ok) {
        child.kill();
        return initialized;
      }
      return success(connection, metadata(profile, { connectionId, initialized: true }));
    }

    if (profile.transport === "sse" && profile.sseUrl !== undefined) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), profile.timeoutMs ?? 2_000);
      try {
        const response = await fetch(profile.sseUrl, { headers: profile.headers, signal: controller.signal });
        if (!response.ok) return failure("MCP_SSE_CONNECT_FAILED", `MCP SSE endpoint returned HTTP ${response.status}.`);
      } catch (error) {
        return failure("MCP_SSE_CONNECT_FAILED", textFromUnknown((error as Error).message ?? error));
      } finally {
        clearTimeout(timeout);
      }
    }

    const connection: McpConnection = { profile, connectionId, nextId: 1, pending: new Map(), buffer: "" };
    const initialized = await requestHttp(profile, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "praxis-agentcore", version: "0.1.0" },
    });
    if (!initialized.ok) return initialized;
    return success(connection, metadata(profile, { connectionId, initialized: true }));
  };

  return {
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
      connection.child?.kill();
      connections.delete(id);
      return success({ connectionId: id, status: "disconnected", serverId: requestInput.serverId, providerMetadata: metadata(profile, { connectionId: id }) });
    },
    async subscribe(requestInput) {
      const connected = await getConnection(requestInput.serverId, requestInput.connectionId);
      if (!connected.ok) return connected;
      return success({ subscriptionId: `${requestInput.serverId}:subscription:${requestInput.subjectType}:${requestInput.subject}`, status: "subscribed", serverId: requestInput.serverId, connectionId: connected.output.connectionId, providerMetadata: metadata(connected.output.profile, { eventKinds: requestInput.eventKinds ?? [] }) });
    },
    async unsubscribe(requestInput) {
      const profile = getProfile(requestInput.serverId);
      if (profile === undefined) return failure("MCP_SERVER_NOT_CONFIGURED", `MCP server '${requestInput.serverId}' is not configured.`);
      return success({ subscriptionId: requestInput.subscriptionId, status: "unsubscribed", serverId: requestInput.serverId, providerMetadata: metadata(profile) });
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
      const profile = getProfile(requestInput.serverId);
      if (profile === undefined) return failure("MCP_SERVER_NOT_CONFIGURED", `MCP server '${requestInput.serverId}' is not configured.`);
      return success({ executionId: requestInput.executionId, status: "cancelled", serverId: requestInput.serverId, providerMetadata: metadata(profile) });
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
      const listed = await request(connected.output, "tools/list", {});
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
      return success({ tools, providerMetadata: metadata(connected.output.profile, { method: "tools/list" }), raw: listed.output });
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
      const listed = await request(connected.output, "resources/list", {});
      if (!listed.ok) return listed;
      const raw = resultObject(listed.output);
      const resources = Array.isArray(raw.resources) ? raw.resources.filter(isObject).map((resource) => ({
        uri: String(resource.uri ?? ""),
        name: typeof resource.name === "string" ? resource.name : undefined,
        mimeType: typeof resource.mimeType === "string" ? resource.mimeType : typeof resource.mime_type === "string" ? resource.mime_type : undefined,
        raw: resource,
      })).filter((resource) => resource.uri.length > 0 && (requestInput.uriPrefix === undefined || resource.uri.startsWith(requestInput.uriPrefix))) : [];
      return success({ resources, exhausted: true, providerMetadata: metadata(connected.output.profile, { method: "resources/list" }), raw: listed.output });
    },
    async readResource(requestInput) {
      const connected = await getConnection(requestInput.serverId);
      if (!connected.ok) return connected;
      const read = await request(connected.output, "resources/read", { uri: requestInput.resourceUri });
      if (!read.ok) return read;
      const raw = resultObject(read.output);
      const contents = Array.isArray(raw.contents) ? raw.contents.filter(isObject).map((content) => ({
        mimeType: typeof content.mimeType === "string" ? content.mimeType : typeof content.mime_type === "string" ? content.mime_type : undefined,
        text: typeof content.text === "string" ? content.text : undefined,
        bytesBase64: typeof content.blob === "string" ? content.blob : undefined,
        raw: content,
      })) : [];
      return success({ uri: requestInput.resourceUri, contents, truncated: false, providerMetadata: metadata(connected.output.profile, { method: "resources/read" }), raw: read.output });
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
  const response = new Promise<JsonRpcResponse>((resolve, reject) => {
    const timeout = setTimeout(() => {
      connection.pending.delete(id);
      reject(new Error(`MCP stdio request '${method}' timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
    connection.pending.set(id, { resolve, reject, timeout });
  });
  const framing = connection.profile.transport === "stdio" ? connection.profile.framing : undefined;
  connection.child.stdin.write(framing === "line-json" ? `${JSON.stringify(payload)}\n` : contentLengthFrame(payload));
  try {
    return normalizeJsonRpcResponse(await response);
  } catch (error) {
    return failure("MCP_STDIO_REQUEST_FAILED", textFromUnknown((error as Error).message ?? error));
  }
}

async function requestHttp(profile: Extract<McpRuntimeServerProfile, { transport: "http" | "sse" }>, method: string, params: JsonObject): Promise<BaseToolExecutorResult<unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), profile.timeoutMs ?? 5_000);
  try {
    const response = await fetch(profile.url, {
      method: "POST",
      headers: { "content-type": "application/json", ...(profile.headers ?? {}) },
      body: JSON.stringify({ jsonrpc: "2.0", id: `${Date.now()}:${Math.random()}`, method, params }),
      signal: controller.signal,
    });
    if (!response.ok) return failure("MCP_HTTP_REQUEST_FAILED", `MCP HTTP endpoint returned HTTP ${response.status}.`);
    const json = await response.json() as unknown;
    if (!isObject(json)) return failure("MCP_HTTP_RESPONSE_INVALID", "MCP HTTP response was not a JSON object.");
    return normalizeJsonRpcResponse(json as JsonRpcResponse);
  } catch (error) {
    return failure("MCP_HTTP_REQUEST_FAILED", textFromUnknown((error as Error).message ?? error));
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeJsonRpcResponse(response: JsonRpcResponse): BaseToolExecutorResult<unknown> {
  if (response.error !== undefined) {
    return failure("MCP_JSONRPC_ERROR", response.error.message ?? `MCP JSON-RPC error ${String(response.error.code ?? "unknown")}.`);
  }
  return success(response.result ?? {});
}
