/*
 * 文件定位：Praxis framework / applicationLayer 传输形态。
 * 核心目的：让应用层同时具备 local、REST、WebSocket 三种接入合同。
 */

import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Socket } from "node:net";

import type {
  PraxisApplicationCommand,
  PraxisApplicationCommandResult,
  PraxisApplicationEvent,
  PraxisApplicationRuntime,
  PraxisApplicationViewModel,
} from "./applicationContract.js";

export type PraxisApplicationTransportKind = "local" | "rest" | "websocket";

export type PraxisApplicationRestRoute =
  | "GET /application/view"
  | "POST /application/commands"
  | "GET /application/events";

export type PraxisApplicationWebSocketMessage =
  | {
      type: "application.command";
      commandId: string;
      command: PraxisApplicationCommand;
    }
  | {
      type: "application.commandResult";
      commandId: string;
      result: PraxisApplicationCommandResult;
    }
  | {
      type: "application.event";
      event: PraxisApplicationEvent;
    }
  | {
      type: "application.view";
      view: PraxisApplicationViewModel;
    };

export type PraxisApplicationProtocolMessage =
  | {
      type: "application.ready";
      view: PraxisApplicationViewModel;
    }
  | PraxisApplicationWebSocketMessage
  | {
      type: "application.error";
      commandId?: string;
      error: {
        code: string;
        message: string;
      };
      view?: PraxisApplicationViewModel;
    };

export type PraxisApplicationTransportDescriptor = {
  kind: PraxisApplicationTransportKind;
  protocol: "in-process" | "rest-json" | "websocket-json";
  routes?: readonly PraxisApplicationRestRoute[];
  messageTypes?: readonly PraxisApplicationWebSocketMessage["type"][];
};

export type PraxisApplicationTransportClient = {
  readonly descriptor: PraxisApplicationTransportDescriptor;
  getView(): Promise<PraxisApplicationViewModel>;
  dispatch(command: PraxisApplicationCommand): Promise<PraxisApplicationCommandResult>;
  subscribe(listener: (event: PraxisApplicationEvent) => void): () => void;
};

export type PraxisApplicationRestServer = {
  readonly descriptor: PraxisApplicationTransportDescriptor;
  readonly server: Server;
  readonly url: string;
  close(): Promise<void>;
};

export type PraxisApplicationWebSocketServer = {
  readonly descriptor: PraxisApplicationTransportDescriptor;
  readonly server: Server;
  readonly url: string;
  close(): Promise<void>;
};

export function describeApplicationRestTransport(): PraxisApplicationTransportDescriptor {
  return {
    kind: "rest",
    protocol: "rest-json",
    routes: [
      "GET /application/view",
      "POST /application/commands",
      "GET /application/events",
    ],
  };
}

export function describeApplicationWebSocketTransport(): PraxisApplicationTransportDescriptor {
  return {
    kind: "websocket",
    protocol: "websocket-json",
    messageTypes: [
      "application.command",
      "application.commandResult",
      "application.event",
      "application.view",
    ],
  };
}

export function createLocalApplicationTransport(runtime: PraxisApplicationRuntime): PraxisApplicationTransportClient {
  return {
    descriptor: {
      kind: "local",
      protocol: "in-process",
    },
    async getView() {
      return runtime.getView();
    },
    async dispatch(command) {
      return await runtime.dispatch(command);
    },
    subscribe(listener) {
      return runtime.subscribe(listener);
    },
  };
}

export async function createApplicationRestServer(runtime: PraxisApplicationRuntime, options: {
  host?: string;
  port?: number;
} = {}): Promise<PraxisApplicationRestServer> {
  const eventClients = new Set<ServerResponse>();
  const unsubscribe = runtime.subscribe((event) => {
    const payload = `event: application.event\ndata: ${JSON.stringify(event)}\n\n`;
    for (const response of eventClients) response.write(payload);
  });
  const server = createServer((request, response) => {
    void handleApplicationRestRequest(runtime, eventClients, request, response);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, options.host ?? "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : options.port;
  const host = options.host ?? "127.0.0.1";
  return {
    descriptor: describeApplicationRestTransport(),
    server,
    url: `http://${host}:${port}`,
    async close() {
      unsubscribe();
      for (const response of eventClients) response.end();
      eventClients.clear();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    },
  };
}

export async function createApplicationWebSocketServer(runtime: PraxisApplicationRuntime, options: {
  host?: string;
  port?: number;
  path?: string;
} = {}): Promise<PraxisApplicationWebSocketServer> {
  const clients = new Set<Socket>();
  const wsPath = options.path ?? "/application/ws";
  const unsubscribe = runtime.subscribe((event) => {
    const payload: PraxisApplicationProtocolMessage = { type: "application.event", event };
    for (const client of clients) writeWebSocketTextFrame(client, JSON.stringify(payload));
  });
  const server = createServer((_request, response) => {
    writeJson(response, 404, { error: { code: "NOT_FOUND", message: "WebSocket endpoint only" } });
  });
  server.on("upgrade", (request, socket) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== wsPath) {
      socket.end("HTTP/1.1 404 Not Found\r\n\r\n");
      return;
    }
    acceptApplicationWebSocket(runtime, clients, request, socket as Socket);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, options.host ?? "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : options.port;
  const host = options.host ?? "127.0.0.1";
  return {
    descriptor: describeApplicationWebSocketTransport(),
    server,
    url: `ws://${host}:${port}${wsPath}`,
    async close() {
      unsubscribe();
      for (const client of clients) client.end();
      clients.clear();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    },
  };
}

function acceptApplicationWebSocket(
  runtime: PraxisApplicationRuntime,
  clients: Set<Socket>,
  request: IncomingMessage,
  socket: Socket,
): void {
  const key = request.headers["sec-websocket-key"];
  if (typeof key !== "string") {
    socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    return;
  }
  const accept = createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");
  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "\r\n",
  ].join("\r\n"));
  clients.add(socket);
  let buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  writeWebSocketTextFrame(socket, JSON.stringify({ type: "application.ready", view: runtime.getView() }));
  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    const parsed = readWebSocketTextFrames(buffer);
    buffer = parsed.remainder;
    for (const text of parsed.messages) {
      void handleApplicationWebSocketText(runtime, socket, text);
    }
  });
  socket.once("close", () => clients.delete(socket));
  socket.once("error", () => clients.delete(socket));
}

async function handleApplicationWebSocketText(
  runtime: PraxisApplicationRuntime,
  socket: Socket,
  text: string,
): Promise<void> {
  try {
    const message = JSON.parse(text) as PraxisApplicationProtocolMessage;
    if (message.type !== "application.command") return;
    const result = await runtime.dispatch(message.command);
    writeWebSocketTextFrame(socket, JSON.stringify({
      type: "application.commandResult",
      commandId: message.commandId,
      result,
    }));
  } catch (error) {
    writeWebSocketTextFrame(socket, JSON.stringify({
      type: "application.error",
      error: {
        code: "APPLICATION_WS_COMMAND_FAILED",
        message: error instanceof Error ? error.message : String(error),
      },
      view: runtime.getView(),
    }));
  }
}

function writeWebSocketTextFrame(socket: Socket, text: string): void {
  const payload = Buffer.from(text, "utf8");
  let header: Buffer;
  if (payload.length < 126) {
    header = Buffer.from([0x81, payload.length]);
  } else if (payload.length <= 0xffff) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  socket.write(Buffer.concat([header, payload]));
}

function readWebSocketTextFrames(buffer: Buffer): { messages: string[]; remainder: Buffer } {
  const messages: string[] = [];
  let offset = 0;
  while (offset + 2 <= buffer.length) {
    const first = buffer[offset] ?? 0;
    const second = buffer[offset + 1] ?? 0;
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let headerLength = 2;
    if (length === 126) {
      if (offset + 4 > buffer.length) break;
      length = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (length === 127) {
      if (offset + 10 > buffer.length) break;
      const bigLength = buffer.readBigUInt64BE(offset + 2);
      if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("websocket frame too large");
      length = Number(bigLength);
      headerLength = 10;
    }
    const maskLength = masked ? 4 : 0;
    const frameEnd = offset + headerLength + maskLength + length;
    if (frameEnd > buffer.length) break;
    if (opcode === 0x8) return { messages, remainder: Buffer.alloc(0) };
    if (opcode === 0x1) {
      const mask = masked ? buffer.subarray(offset + headerLength, offset + headerLength + 4) : undefined;
      const payloadStart = offset + headerLength + maskLength;
      const payload = Buffer.from(buffer.subarray(payloadStart, payloadStart + length));
      if (mask) {
        for (let index = 0; index < payload.length; index += 1) {
          payload[index] = (payload[index] ?? 0) ^ (mask[index % 4] ?? 0);
        }
      }
      messages.push(payload.toString("utf8"));
    }
    offset = frameEnd;
  }
  return { messages, remainder: buffer.subarray(offset) };
}

async function handleApplicationRestRequest(
  runtime: PraxisApplicationRuntime,
  eventClients: Set<ServerResponse>,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (request.method === "GET" && url.pathname === "/application/view") {
    writeJson(response, 200, runtime.getView());
    return;
  }
  if (request.method === "POST" && url.pathname === "/application/commands") {
    try {
      const command = JSON.parse(await readRequestBody(request)) as PraxisApplicationCommand;
      writeJson(response, 200, await runtime.dispatch(command));
    } catch (error) {
      writeJson(response, 400, {
        ok: false,
        error: {
          code: "APPLICATION_REST_COMMAND_FAILED",
          message: error instanceof Error ? error.message : String(error),
        },
        view: runtime.getView(),
        events: [],
      });
    }
    return;
  }
  if (request.method === "GET" && url.pathname === "/application/events") {
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    response.write(`event: application.view\ndata: ${JSON.stringify(runtime.getView())}\n\n`);
    eventClients.add(response);
    request.once("close", () => eventClients.delete(response));
    return;
  }
  writeJson(response, 404, { error: { code: "NOT_FOUND", message: `${request.method ?? "GET"} ${url.pathname}` } });
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}
