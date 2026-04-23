/*
 * 文件定位：storagePool / baseToolStorage / code.lsp_locateDefinition / LSP runtime。
 * 核心目的：提供一个最小真实可用的 stdio LSP runtime，用于 textDocument/definition。
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { LspWorkspaceFacts } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/toolDependency/lspDependencyResolver.js";
import { resolveLspDependency } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/toolDependency/lspDependencyResolver.js";
import type { LspLocation, LspRange, LspTextDocumentPosition } from "../code.lsp_locateDefinition.js";

type JsonRpcId = number;

type JsonRpcSuccess = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
};

type JsonRpcFailure = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
};

type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure;

type PendingRequest = {
  method: string;
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
};

export type LspRuntimeServerConfig = {
  command: string;
  args: readonly string[];
  languageId: string;
  fileExtensions: readonly string[];
  initializationOptions?: unknown;
};

export type LspLocateDefinitionRuntimeOptions = {
  workspaceRoot?: string;
  server?: LspRuntimeServerConfig;
  servers?: readonly LspRuntimeServerConfig[];
  resolvedServerPath?: string;
  workspaceFacts?: LspWorkspaceFacts;
  timeoutMs?: number;
  maxFileBytes?: number;
};

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_FILE_BYTES = 10_000_000;

function resolveWorkspaceRoot(workspaceRoot: string | undefined): string {
  return path.resolve(workspaceRoot?.trim() || process.cwd());
}

function resolveTargetPath(target: LspTextDocumentPosition, workspaceRoot: string): string {
  return path.isAbsolute(target.filePath) ? target.filePath : path.resolve(workspaceRoot, target.filePath);
}

function selectServer(
  target: LspTextDocumentPosition,
  targetPath: string,
  options: LspLocateDefinitionRuntimeOptions,
): LspRuntimeServerConfig {
  if (options.server !== undefined) {
    return {
      ...options.server,
      languageId: target.languageId ?? options.server.languageId,
    };
  }

  const extension = path.extname(targetPath).toLowerCase();
  const configuredServer = options.servers?.find((candidate) =>
    (candidate.fileExtensions as readonly string[]).includes(extension),
  );

  if (configuredServer !== undefined) {
    return {
      ...configuredServer,
      languageId: target.languageId ?? configuredServer.languageId,
    };
  }

  const resolved = resolveLspDependency({
    target: {
      filePath: targetPath,
      languageId: target.languageId,
    },
    workspaceRoot: options.workspaceRoot,
    workspaceFacts: options.workspaceFacts,
  });

  if (!resolved.ok) {
    throw new Error(resolved.error.message);
  }

  return {
    command: options.resolvedServerPath?.trim() || resolved.profile.serverCommand,
    args: resolved.profile.serverArgs,
    languageId: target.languageId ?? resolved.profile.languageId,
    fileExtensions: resolved.profile.fileExtensions,
  };
}

function toLspRange(value: unknown): LspRange | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const range = value as {
    start?: { line?: unknown; character?: unknown };
    end?: { line?: unknown; character?: unknown };
  };

  if (
    typeof range.start?.line !== "number" ||
    typeof range.start.character !== "number" ||
    typeof range.end?.line !== "number" ||
    typeof range.end.character !== "number"
  ) {
    return undefined;
  }

  return {
    start: {
      line: range.start.line,
      character: range.start.character,
    },
    end: {
      line: range.end.line,
      character: range.end.character,
    },
  };
}

function uriToFilePath(uri: string): string {
  if (uri.startsWith("file:")) {
    return fileURLToPath(uri);
  }

  return uri;
}

function normalizeDefinitionResult(result: unknown): readonly LspLocation[] {
  if (result === null || result === undefined) {
    return [];
  }

  const items = Array.isArray(result) ? result : [result];
  const locations: LspLocation[] = [];

  for (const item of items) {
    if (typeof item !== "object" || item === null) {
      continue;
    }

    const location = item as {
      uri?: unknown;
      range?: unknown;
      targetUri?: unknown;
      targetSelectionRange?: unknown;
      targetRange?: unknown;
    };

    const uri = typeof location.uri === "string" ? location.uri : undefined;
    const range = toLspRange(location.range);
    if (uri !== undefined && range !== undefined) {
      locations.push({
        filePath: uriToFilePath(uri),
        uri,
        range,
        source: "provider",
      });
      continue;
    }

    const targetUri = typeof location.targetUri === "string" ? location.targetUri : undefined;
    const targetRange = toLspRange(location.targetSelectionRange) ?? toLspRange(location.targetRange);
    if (targetUri !== undefined && targetRange !== undefined) {
      locations.push({
        filePath: uriToFilePath(targetUri),
        uri: targetUri,
        range: targetRange,
        source: "provider",
      });
    }
  }

  return locations;
}

class StdioLspJsonRpcClient {
  readonly #process: ChildProcessWithoutNullStreams;
  readonly #timeoutMs: number;
  #nextId = 1;
  #buffer = Buffer.alloc(0);
  readonly #pending = new Map<JsonRpcId, PendingRequest>();
  readonly #stderrChunks: string[] = [];

  constructor(server: LspRuntimeServerConfig, timeoutMs: number, cwd: string) {
    this.#timeoutMs = timeoutMs;
    this.#process = spawn(server.command, [...server.args], {
      cwd,
      stdio: "pipe",
    });

    this.#process.stdout.on("data", (chunk: Buffer) => {
      this.#buffer = Buffer.concat([this.#buffer, chunk]);
      this.#drainMessages();
    });

    this.#process.stderr.on("data", (chunk: Buffer) => {
      this.#stderrChunks.push(chunk.toString("utf8"));
    });

    this.#process.on("error", (error) => {
      this.#rejectAll(new Error(`LSP server failed to start: ${error.message}`));
    });

    this.#process.on("exit", (code, signal) => {
      if (this.#pending.size > 0) {
        this.#rejectAll(new Error(`LSP server exited before completing requests: code=${code ?? "null"} signal=${signal ?? "null"}`));
      }
    });
  }

  async request(method: string, params?: unknown): Promise<unknown> {
    const id = this.#nextId++;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`LSP request ${method} timed out after ${this.#timeoutMs}ms`));
      }, this.#timeoutMs);

      this.#pending.set(id, { method, resolve, reject, timer });
      this.#write({ jsonrpc: "2.0", id, method, params });
    });
  }

  notify(method: string, params?: unknown): void {
    this.#write({ jsonrpc: "2.0", method, params });
  }

  async stop(): Promise<void> {
    try {
      await this.request("shutdown");
      this.notify("exit");
    } catch {
      this.#process.kill();
    }
  }

  stderr(): string {
    return this.#stderrChunks.join("").trim();
  }

  #write(message: unknown): void {
    const body = JSON.stringify(message);
    this.#process.stdin.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
  }

  #drainMessages(): void {
    const separator = Buffer.from("\r\n\r\n", "utf8");

    while (true) {
      const headerEnd = this.#buffer.indexOf(separator);
      if (headerEnd === -1) {
        return;
      }

      const header = this.#buffer.subarray(0, headerEnd).toString("utf8");
      const contentLengthMatch = header.match(/Content-Length:\s*(\d+)/iu);
      if (contentLengthMatch === null) {
        throw new Error("Malformed LSP response header: missing Content-Length");
      }

      const contentLength = Number(contentLengthMatch[1]);
      const bodyStart = headerEnd + separator.length;
      const bodyEnd = bodyStart + contentLength;
      if (this.#buffer.length < bodyEnd) {
        return;
      }

      const body = this.#buffer.subarray(bodyStart, bodyEnd).toString("utf8");
      this.#buffer = this.#buffer.subarray(bodyEnd);
      this.#handleMessage(JSON.parse(body) as JsonRpcResponse);
    }
  }

  #handleMessage(message: JsonRpcResponse): void {
    if (!("id" in message)) {
      return;
    }

    const pending = this.#pending.get(message.id);
    if (pending === undefined) {
      return;
    }

    this.#pending.delete(message.id);
    clearTimeout(pending.timer);

    if ("error" in message) {
      pending.reject(new Error(`LSP request ${pending.method} failed: ${message.error.message}`));
      return;
    }

    pending.resolve(message.result);
  }

  #rejectAll(error: Error): void {
    for (const [id, pending] of this.#pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.#pending.delete(id);
    }
  }
}

export async function locateDefinitionWithLspRuntime(
  target: LspTextDocumentPosition,
  options: LspLocateDefinitionRuntimeOptions = {},
): Promise<readonly LspLocation[]> {
  const workspaceRoot = resolveWorkspaceRoot(options.workspaceRoot);
  const targetPath = resolveTargetPath(target, workspaceRoot);
  const fileStat = await stat(targetPath);
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;

  if (fileStat.size > maxFileBytes) {
    throw new Error(`File too large for LSP definition lookup: ${fileStat.size} bytes exceeds ${maxFileBytes} bytes`);
  }

  const server = selectServer(target, targetPath, options);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const client = new StdioLspJsonRpcClient(server, timeoutMs, workspaceRoot);
  const uri = pathToFileURL(targetPath).href;

  try {
    await client.request("initialize", {
      processId: process.pid,
      rootPath: workspaceRoot,
      rootUri: pathToFileURL(workspaceRoot).href,
      workspaceFolders: [
        {
          uri: pathToFileURL(workspaceRoot).href,
          name: path.basename(workspaceRoot),
        },
      ],
      capabilities: {
        textDocument: {
          definition: {
            dynamicRegistration: false,
            linkSupport: true,
          },
        },
      },
      initializationOptions: server.initializationOptions,
    });

    client.notify("initialized", {});

    client.notify("textDocument/didOpen", {
      textDocument: {
        uri,
        languageId: server.languageId,
        version: 1,
        text: await readFile(targetPath, "utf8"),
      },
    });

    const result = await client.request("textDocument/definition", {
      textDocument: { uri },
      position: {
        line: target.line,
        character: target.character,
      },
    });

    return normalizeDefinitionResult(result);
  } catch (error) {
    const stderr = client.stderr();
    const message = error instanceof Error ? error.message : "LSP runtime failed";
    throw new Error(stderr.length > 0 ? `${message}; stderr: ${stderr}` : message);
  } finally {
    await client.stop();
  }
}
