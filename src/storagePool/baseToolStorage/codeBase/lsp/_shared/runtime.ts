/*
 * 文件定位：storagePool / baseToolStorage / code.lsp_locateDefinition / LSP runtime。
 * 核心目的：提供一个最小真实可用的 stdio LSP runtime，用于 textDocument/definition。
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { LspWorkspaceFacts } from "../../../../../agentCore_executionEngine/basic_toolLayer/toolDependency/lspDependencyResolver.js";
import { resolveLspDependency } from "../../../../../agentCore_executionEngine/basic_toolLayer/toolDependency/lspDependencyResolver.js";
import { ensureDependencyAvailable } from "../../../../../agentCore_executionEngine/basic_toolLayer/toolDependency/dependencyInstaller.js";
import type { LspLocation, LspRange, LspTextDocumentPosition } from "../code.lsp_locateDefinition/core.js";

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

type JsonRpcNotification = {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
};

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
  workspaceLanguageId?: string;
  workspaceFilePathHint?: string;
  timeoutMs?: number;
  maxFileBytes?: number;
};

export type LspRuntimeRequestOptions = LspLocateDefinitionRuntimeOptions & {
  method: string;
  params?: Readonly<Record<string, unknown>>;
};

export type LspRuntimeDocumentSymbol = {
  name: string;
  kind: string;
  range: LspRange;
  selectionRange?: LspRange;
  detail?: string;
  children?: readonly LspRuntimeDocumentSymbol[];
};

export type LspRuntimeWorkspaceSymbol = {
  name: string;
  kind: string;
  location?: LspLocation;
  containerName?: string;
  detail?: string;
};

export type LspRuntimeTextEdit = {
  range: LspRange;
  newText: string;
};

export type LspRuntimeCompletionItem = {
  label: string;
  kind?: string;
  detail?: string;
  documentation?: string;
  sortText?: string;
  filterText?: string;
  insertText?: string;
  textEdit?: LspRuntimeTextEdit;
};

export type LspRuntimeSignatureHelp = {
  signatures: readonly {
    label: string;
    documentation?: string;
    parameters: readonly {
      label: string;
      documentation?: string;
    }[];
  }[];
  activeSignature?: number;
  activeParameter?: number;
};

export type LspRuntimeHover = {
  contents: string;
  range?: LspRange;
};

export type LspRuntimeDiagnostic = {
  range: LspRange;
  message: string;
  severity?: "error" | "warning" | "information" | "hint";
  code?: string;
  source?: string;
};

export type LspRuntimeCodeAction = {
  title: string;
  kind?: string;
  diagnostics: readonly LspRuntimeDiagnostic[];
  isPreferred?: boolean;
  editAvailable: boolean;
  commandAvailable: boolean;
  raw: unknown;
};

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_FILE_BYTES = 10_000_000;

function resolveWorkspaceRoot(workspaceRoot: string | undefined): string {
  return path.resolve(workspaceRoot?.trim() || process.cwd());
}

function resolveTargetPath(target: LspTextDocumentPosition, workspaceRoot: string): string {
  return path.isAbsolute(target.filePath) ? target.filePath : path.resolve(workspaceRoot, target.filePath);
}

async function collectWorkspaceFacts(workspaceRoot: string): Promise<LspWorkspaceFacts> {
  const markerFiles: string[] = [];
  const fileContentSampleChunks: string[] = [];

  try {
    const entries = await readdir(workspaceRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        markerFiles.push(entry.name);
        if (fileContentSampleChunks.length === 0 && entry.name.startsWith(".")) {
          try {
            fileContentSampleChunks.push(await readFile(path.join(workspaceRoot, entry.name), "utf8"));
          } catch {
            // best-effort only
          }
        }
      }

      if (entry.isDirectory() && entry.name === ".github") {
        try {
          const nested = await readdir(path.join(workspaceRoot, ".github"), { withFileTypes: true });
          for (const nestedEntry of nested) {
            markerFiles.push(path.posix.join(".github", nestedEntry.name));
          }
        } catch {
          // best-effort only
        }
      }
    }
  } catch {
    // best-effort only
  }

  return {
    markerFiles,
    fileContentSample: fileContentSampleChunks.join("\n"),
  };
}

async function selectServer(
  target: LspTextDocumentPosition,
  targetPath: string | undefined,
  options: LspLocateDefinitionRuntimeOptions,
): Promise<LspRuntimeServerConfig> {
  if (options.server !== undefined) {
    return {
      ...options.server,
      languageId: target.languageId ?? options.server.languageId,
    };
  }

  const extension = targetPath === undefined ? "" : path.extname(targetPath).toLowerCase();
  const configuredServer =
    extension.length === 0
      ? undefined
      : options.servers?.find((candidate) => (candidate.fileExtensions as readonly string[]).includes(extension));

  if (configuredServer !== undefined) {
    return {
      ...configuredServer,
      languageId: target.languageId ?? configuredServer.languageId,
    };
  }

  const workspaceFacts = options.workspaceFacts ?? (await collectWorkspaceFacts(resolveWorkspaceRoot(options.workspaceRoot)));
  const resolved = resolveLspDependency({
    target: {
      filePath: targetPath ?? options.workspaceFilePathHint ?? target.filePath,
      languageId: target.languageId ?? options.workspaceLanguageId,
    },
    workspaceRoot: options.workspaceRoot,
    workspaceFacts,
  });

  if (!resolved.ok) {
    throw new Error(resolved.error.message);
  }

  const availability = await ensureDependencyAvailable({
    dependencyId: resolved.profile.dependencyId,
  });
  if (!availability.ok) {
    throw new Error(availability.error.message);
  }

  return {
    command: options.resolvedServerPath?.trim() || availability.availability.resolvedPath || resolved.profile.serverCommand,
    args: resolved.profile.serverArgs,
    languageId: target.languageId ?? options.workspaceLanguageId ?? resolved.profile.languageId,
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

function normalizeDocumentSymbolKind(kind: unknown): string {
  return typeof kind === "string" ? kind : typeof kind === "number" ? String(kind) : "unknown";
}

function normalizeDocumentSymbols(result: unknown): readonly LspRuntimeDocumentSymbol[] {
  if (!Array.isArray(result)) {
    return [];
  }

  const symbols: LspRuntimeDocumentSymbol[] = [];
  for (const item of result) {
    if (typeof item !== "object" || item === null) {
      continue;
    }

    const symbol = item as {
      name?: unknown;
      kind?: unknown;
      range?: unknown;
      selectionRange?: unknown;
      location?: { range?: unknown };
      detail?: unknown;
      children?: unknown;
    };
    const range = toLspRange(symbol.range) ?? toLspRange(symbol.location?.range);
    if (typeof symbol.name !== "string" || range === undefined) {
      continue;
    }

    symbols.push({
      name: symbol.name,
      kind: normalizeDocumentSymbolKind(symbol.kind),
      range,
      selectionRange: toLspRange(symbol.selectionRange),
      detail: typeof symbol.detail === "string" ? symbol.detail : undefined,
      children: normalizeDocumentSymbols(symbol.children),
    });
  }

  return symbols;
}

function normalizeWorkspaceSymbols(result: unknown): readonly LspRuntimeWorkspaceSymbol[] {
  if (!Array.isArray(result)) {
    return [];
  }

  const symbols: LspRuntimeWorkspaceSymbol[] = [];
  for (const item of result) {
    if (typeof item !== "object" || item === null) {
      continue;
    }

    const symbol = item as {
      name?: unknown;
      kind?: unknown;
      location?: { uri?: unknown; range?: unknown };
      containerName?: unknown;
      detail?: unknown;
    };
    if (typeof symbol.name !== "string") {
      continue;
    }

    const uri = typeof symbol.location?.uri === "string" ? symbol.location.uri : undefined;
    const range = toLspRange(symbol.location?.range);
    symbols.push({
      name: symbol.name,
      kind: normalizeDocumentSymbolKind(symbol.kind),
      location:
        uri !== undefined && range !== undefined
          ? {
              filePath: uriToFilePath(uri),
              uri,
              range,
              source: "provider",
            }
          : undefined,
      containerName: typeof symbol.containerName === "string" ? symbol.containerName : undefined,
      detail: typeof symbol.detail === "string" ? symbol.detail : undefined,
    });
  }

  return symbols;
}

function stringifyMarkupContent(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => stringifyMarkupContent(item)).filter((item): item is string => item !== undefined).join("\n\n");
  }

  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const content = value as { value?: unknown; language?: unknown };
  if (typeof content.value === "string") {
    return content.value;
  }

  return undefined;
}

function normalizeTextEdit(value: unknown): LspRuntimeTextEdit | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const edit = value as { range?: unknown; newText?: unknown };
  const range = toLspRange(edit.range);
  if (range === undefined || typeof edit.newText !== "string") {
    return undefined;
  }

  return { range, newText: edit.newText };
}

function normalizeTextEdits(result: unknown): readonly LspRuntimeTextEdit[] {
  if (!Array.isArray(result)) {
    return [];
  }

  return result.map((item) => normalizeTextEdit(item)).filter((item): item is LspRuntimeTextEdit => item !== undefined);
}

function normalizeCompletionResult(result: unknown, maxItems = 100): readonly LspRuntimeCompletionItem[] {
  const items =
    typeof result === "object" && result !== null && Array.isArray((result as { items?: unknown }).items)
      ? (result as { items: unknown[] }).items
      : Array.isArray(result)
        ? result
        : [];

  return items
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .filter((item) => typeof item.label === "string" && item.label.trim().length > 0)
    .slice(0, maxItems)
    .map((item) => ({
      label: String(item.label),
      kind: typeof item.kind === "number" || typeof item.kind === "string" ? String(item.kind) : undefined,
      detail: typeof item.detail === "string" ? item.detail : undefined,
      documentation: stringifyMarkupContent(item.documentation),
      sortText: typeof item.sortText === "string" ? item.sortText : undefined,
      filterText: typeof item.filterText === "string" ? item.filterText : undefined,
      insertText: typeof item.insertText === "string" ? item.insertText : undefined,
      textEdit: normalizeTextEdit(item.textEdit),
    }));
}

function normalizeSignatureHelp(result: unknown): LspRuntimeSignatureHelp {
  if (typeof result !== "object" || result === null) {
    return { signatures: [] };
  }

  const help = result as { signatures?: unknown; activeSignature?: unknown; activeParameter?: unknown };
  const signatures = Array.isArray(help.signatures) ? help.signatures : [];

  return {
    signatures: signatures
      .filter((signature): signature is Record<string, unknown> => typeof signature === "object" && signature !== null)
      .filter((signature) => typeof signature.label === "string")
      .map((signature) => ({
        label: String(signature.label),
        documentation: stringifyMarkupContent(signature.documentation),
        parameters: (Array.isArray(signature.parameters) ? signature.parameters : [])
          .filter((parameter): parameter is Record<string, unknown> => typeof parameter === "object" && parameter !== null)
          .map((parameter) => ({
            label: Array.isArray(parameter.label) ? parameter.label.join(",") : String(parameter.label ?? ""),
            documentation: stringifyMarkupContent(parameter.documentation),
          }))
          .filter((parameter) => parameter.label.trim().length > 0),
      })),
    activeSignature: typeof help.activeSignature === "number" ? help.activeSignature : undefined,
    activeParameter: typeof help.activeParameter === "number" ? help.activeParameter : undefined,
  };
}

function normalizeHover(result: unknown): LspRuntimeHover | undefined {
  if (typeof result !== "object" || result === null) {
    return undefined;
  }

  const hover = result as { contents?: unknown; range?: unknown };
  const contents = stringifyMarkupContent(hover.contents)?.trim();
  if (contents === undefined || contents.length === 0) {
    return undefined;
  }

  return {
    contents,
    range: toLspRange(hover.range),
  };
}

function normalizeSeverity(value: unknown): LspRuntimeDiagnostic["severity"] {
  if (value === 1) return "error";
  if (value === 2) return "warning";
  if (value === 3) return "information";
  if (value === 4) return "hint";
  if (value === "error" || value === "warning" || value === "information" || value === "hint") return value;
  return undefined;
}

function normalizeDiagnostic(value: unknown): LspRuntimeDiagnostic | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const diagnostic = value as { range?: unknown; message?: unknown; severity?: unknown; code?: unknown; source?: unknown };
  const range = toLspRange(diagnostic.range);
  if (range === undefined || typeof diagnostic.message !== "string" || diagnostic.message.trim().length === 0) {
    return undefined;
  }

  return {
    range,
    message: diagnostic.message.trim(),
    severity: normalizeSeverity(diagnostic.severity),
    code:
      typeof diagnostic.code === "string" || typeof diagnostic.code === "number" ? String(diagnostic.code) : undefined,
    source: typeof diagnostic.source === "string" ? diagnostic.source : undefined,
  };
}

function normalizeDiagnostics(value: unknown): readonly LspRuntimeDiagnostic[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => normalizeDiagnostic(item)).filter((item): item is LspRuntimeDiagnostic => item !== undefined);
}

function normalizeCodeActions(result: unknown): readonly LspRuntimeCodeAction[] {
  if (!Array.isArray(result)) {
    return [];
  }

  return result
    .filter((action): action is Record<string, unknown> => typeof action === "object" && action !== null)
    .filter((action) => typeof action.title === "string" && action.title.trim().length > 0)
    .map((action) => ({
      title: String(action.title),
      kind: typeof action.kind === "string" ? action.kind : undefined,
      diagnostics: normalizeDiagnostics(action.diagnostics),
      isPreferred: typeof action.isPreferred === "boolean" ? action.isPreferred : undefined,
      editAvailable: action.edit !== undefined,
      commandAvailable: action.command !== undefined,
      raw: action,
    }));
}

class StdioLspJsonRpcClient {
  readonly #process: ChildProcessWithoutNullStreams;
  readonly #timeoutMs: number;
  #nextId = 1;
  #buffer = Buffer.alloc(0);
  readonly #pending = new Map<JsonRpcId, PendingRequest>();
  readonly #stderrChunks: string[] = [];
  readonly #notifications: JsonRpcNotification[] = [];

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

  notifications(method?: string): readonly JsonRpcNotification[] {
    return method === undefined
      ? [...this.#notifications]
      : this.#notifications.filter((notification) => notification.method === method);
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
      this.#handleMessage(JSON.parse(body) as JsonRpcResponse | JsonRpcNotification);
    }
  }

  #handleMessage(message: JsonRpcResponse | JsonRpcNotification): void {
    if (!("id" in message)) {
      if ("method" in message) {
        this.#notifications.push(message);
      }
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
  const result = await requestTextDocumentWithLspRuntime(target, {
    ...options,
    method: "textDocument/definition",
    params: {
      position: {
        line: target.line,
        character: target.character,
      },
    },
  });

  return normalizeDefinitionResult(result);
}

export async function requestTextDocumentWithLspRuntime(
  target: LspTextDocumentPosition,
  options: LspRuntimeRequestOptions,
): Promise<unknown> {
  const workspaceRoot = resolveWorkspaceRoot(options.workspaceRoot);
  const targetPath = resolveTargetPath(target, workspaceRoot);
  const fileStat = await stat(targetPath);
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;

  if (fileStat.size > maxFileBytes) {
    throw new Error(`File too large for LSP definition lookup: ${fileStat.size} bytes exceeds ${maxFileBytes} bytes`);
  }

  const server = await selectServer(target, targetPath, options);
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

    return await client.request(options.method, {
      textDocument: { uri },
      ...(options.params ?? {}),
    });
  } catch (error) {
    const stderr = client.stderr();
    const message = error instanceof Error ? error.message : "LSP runtime failed";
    throw new Error(stderr.length > 0 ? `${message}; stderr: ${stderr}` : message);
  } finally {
    await client.stop();
  }
}

export async function requestWorkspaceWithLspRuntime(
  options: LspLocateDefinitionRuntimeOptions & {
    method: string;
    params?: Readonly<Record<string, unknown>>;
  },
): Promise<unknown> {
  const workspaceRoot = resolveWorkspaceRoot(options.workspaceRoot);
  const server = await selectServer(
    {
      filePath: options.workspaceFilePathHint ?? path.join(workspaceRoot, "__workspace__"),
      line: 0,
      character: 0,
      languageId: options.workspaceLanguageId,
    },
    options.workspaceFilePathHint,
    options,
  );

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const client = new StdioLspJsonRpcClient(server, timeoutMs, workspaceRoot);

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
        workspace: {
          symbol: {
            dynamicRegistration: false,
          },
        },
      },
      initializationOptions: server.initializationOptions,
    });

    client.notify("initialized", {});

    return await client.request(options.method, options.params ?? {});
  } catch (error) {
    const stderr = client.stderr();
    const message = error instanceof Error ? error.message : "LSP runtime failed";
    throw new Error(stderr.length > 0 ? `${message}; stderr: ${stderr}` : message);
  } finally {
    await client.stop();
  }
}

export async function locateTypeDefinitionWithLspRuntime(
  target: LspTextDocumentPosition,
  options: LspLocateDefinitionRuntimeOptions = {},
): Promise<readonly LspLocation[]> {
  const result = await requestTextDocumentWithLspRuntime(target, {
    ...options,
    method: "textDocument/typeDefinition",
    params: {
      position: {
        line: target.line,
        character: target.character,
      },
    },
  });

  return normalizeDefinitionResult(result);
}

export async function traceReferencesWithLspRuntime(
  target: LspTextDocumentPosition,
  includeDeclaration: boolean,
  options: LspLocateDefinitionRuntimeOptions = {},
): Promise<readonly LspLocation[]> {
  const result = await requestTextDocumentWithLspRuntime(target, {
    ...options,
    method: "textDocument/references",
    params: {
      position: {
        line: target.line,
        character: target.character,
      },
      context: { includeDeclaration },
    },
  });

  return normalizeDefinitionResult(result);
}

export async function traceImplementationsWithLspRuntime(
  target: LspTextDocumentPosition,
  options: LspLocateDefinitionRuntimeOptions = {},
): Promise<readonly LspLocation[]> {
  const result = await requestTextDocumentWithLspRuntime(target, {
    ...options,
    method: "textDocument/implementation",
    params: {
      position: {
        line: target.line,
        character: target.character,
      },
    },
  });

  return normalizeDefinitionResult(result);
}

export async function scanDocumentSymbolsWithLspRuntime(
  target: Pick<LspTextDocumentPosition, "filePath" | "languageId">,
  options: LspLocateDefinitionRuntimeOptions = {},
): Promise<readonly LspRuntimeDocumentSymbol[]> {
  const result = await requestTextDocumentWithLspRuntime(
    {
      filePath: target.filePath,
      line: 0,
      character: 0,
      languageId: target.languageId,
    },
    {
      ...options,
      method: "textDocument/documentSymbol",
    },
  );

  return normalizeDocumentSymbols(result);
}

export async function searchWorkspaceSymbolsWithLspRuntime(
  query: string,
  options: LspLocateDefinitionRuntimeOptions = {},
): Promise<readonly LspRuntimeWorkspaceSymbol[]> {
  const result = await requestWorkspaceWithLspRuntime({
    ...options,
    method: "workspace/symbol",
    params: { query },
  });

  return normalizeWorkspaceSymbols(result);
}

export async function completeWithLspRuntime(
  target: LspTextDocumentPosition,
  options: LspLocateDefinitionRuntimeOptions & {
    triggerCharacter?: string;
    maxItems?: number;
  } = {},
): Promise<readonly LspRuntimeCompletionItem[]> {
  const result = await requestTextDocumentWithLspRuntime(target, {
    ...options,
    method: "textDocument/completion",
    params: {
      position: {
        line: target.line,
        character: target.character,
      },
      context:
        options.triggerCharacter === undefined
          ? undefined
          : {
              triggerKind: 2,
              triggerCharacter: options.triggerCharacter,
            },
    },
  });

  return normalizeCompletionResult(result, options.maxItems);
}

export async function signatureHelpWithLspRuntime(
  target: LspTextDocumentPosition,
  options: LspLocateDefinitionRuntimeOptions & {
    triggerCharacter?: string;
  } = {},
): Promise<LspRuntimeSignatureHelp> {
  const result = await requestTextDocumentWithLspRuntime(target, {
    ...options,
    method: "textDocument/signatureHelp",
    params: {
      position: {
        line: target.line,
        character: target.character,
      },
      context:
        options.triggerCharacter === undefined
          ? undefined
          : {
              triggerKind: 2,
              triggerCharacter: options.triggerCharacter,
            },
    },
  });

  return normalizeSignatureHelp(result);
}

export async function hoverWithLspRuntime(
  target: LspTextDocumentPosition,
  options: LspLocateDefinitionRuntimeOptions = {},
): Promise<LspRuntimeHover | undefined> {
  const result = await requestTextDocumentWithLspRuntime(target, {
    ...options,
    method: "textDocument/hover",
    params: {
      position: {
        line: target.line,
        character: target.character,
      },
    },
  });

  return normalizeHover(result);
}

export async function formatDocumentWithLspRuntime(
  target: Pick<LspTextDocumentPosition, "filePath" | "languageId">,
  formattingOptions: { tabSize: number; insertSpaces: boolean },
  options: LspLocateDefinitionRuntimeOptions = {},
): Promise<readonly LspRuntimeTextEdit[]> {
  const result = await requestTextDocumentWithLspRuntime(
    {
      filePath: target.filePath,
      line: 0,
      character: 0,
      languageId: target.languageId,
    },
    {
      ...options,
      method: "textDocument/formatting",
      params: {
        options: formattingOptions,
      },
    },
  );

  return normalizeTextEdits(result);
}

export async function formatRangeWithLspRuntime(
  target: Pick<LspTextDocumentPosition, "filePath" | "languageId">,
  range: LspRange,
  formattingOptions: { tabSize: number; insertSpaces: boolean },
  options: LspLocateDefinitionRuntimeOptions = {},
): Promise<readonly LspRuntimeTextEdit[]> {
  const result = await requestTextDocumentWithLspRuntime(
    {
      filePath: target.filePath,
      line: range.start.line,
      character: range.start.character,
      languageId: target.languageId,
    },
    {
      ...options,
      method: "textDocument/rangeFormatting",
      params: {
        range,
        options: formattingOptions,
      },
    },
  );

  return normalizeTextEdits(result);
}

export async function codeActionsWithLspRuntime(
  target: Pick<LspTextDocumentPosition, "filePath" | "languageId"> & { range: LspRange },
  options: LspLocateDefinitionRuntimeOptions & {
    diagnostics?: readonly LspRuntimeDiagnostic[];
    only?: readonly string[];
  } = {},
): Promise<readonly LspRuntimeCodeAction[]> {
  const result = await requestTextDocumentWithLspRuntime(
    {
      filePath: target.filePath,
      line: target.range.start.line,
      character: target.range.start.character,
      languageId: target.languageId,
    },
    {
      ...options,
      method: "textDocument/codeAction",
      params: {
        range: target.range,
        context: {
          diagnostics: options.diagnostics ?? [],
          only: options.only ?? [],
        },
      },
    },
  );

  return normalizeCodeActions(result);
}

export async function inspectDiagnosticsWithLspRuntime(
  target: Pick<LspTextDocumentPosition, "filePath" | "languageId">,
  options: LspLocateDefinitionRuntimeOptions & {
    waitMs?: number;
  } = {},
): Promise<readonly LspRuntimeDiagnostic[]> {
  const workspaceRoot = resolveWorkspaceRoot(options.workspaceRoot);
  const targetPath = resolveTargetPath({ filePath: target.filePath, line: 0, character: 0, languageId: target.languageId }, workspaceRoot);
  const fileStat = await stat(targetPath);
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;

  if (fileStat.size > maxFileBytes) {
    throw new Error(`File too large for LSP diagnostics lookup: ${fileStat.size} bytes exceeds ${maxFileBytes} bytes`);
  }

  const server = await selectServer(
    { filePath: target.filePath, line: 0, character: 0, languageId: target.languageId },
    targetPath,
    options,
  );
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
          publishDiagnostics: {
            relatedInformation: true,
            versionSupport: false,
            codeDescriptionSupport: true,
            dataSupport: true,
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

    await new Promise((resolve) => setTimeout(resolve, options.waitMs ?? 200));
    const diagnostics = client
      .notifications("textDocument/publishDiagnostics")
      .flatMap((notification) => {
        const params = notification.params as { uri?: unknown; diagnostics?: unknown } | undefined;
        return params?.uri === uri ? normalizeDiagnostics(params.diagnostics) : [];
      });

    return diagnostics;
  } catch (error) {
    const stderr = client.stderr();
    const message = error instanceof Error ? error.message : "LSP runtime failed";
    throw new Error(stderr.length > 0 ? `${message}; stderr: ${stderr}` : message);
  } finally {
    await client.stop();
  }
}
