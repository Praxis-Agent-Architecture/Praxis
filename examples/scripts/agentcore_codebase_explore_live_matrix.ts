import { readFileSync } from "node:fs";
import path from "node:path";

import type { BaseToolExecutorPort } from "../../src/basetool/types.js";
import { createBaseToolRegistry } from "../../src/basetool/registry.js";
import { adaptRuntimeToolInvocation } from "../../src/basetool/invocationAdapter.js";
import { invokeChatGPTCodexResponses } from "../../src/modelAdapter/actualInvocationLayer/openai/chatgpt_codex_responses.js";
import { resolveAuthEnvelope } from "../../src/modelAdapter/authProfileLayer/authResolver.js";
import { createCredentialRef } from "../../src/modelAdapter/authProfileLayer/credentialRef.js";
import { createProviderCaller } from "../../src/modelAdapter/providerAccessLayer/providerCaller.js";
import { createChatGPTCodexResponsesCarrier } from "../../src/modelAdapter/providerAccessLayer/providerCarrier.js";
import { fetchProviderTransport } from "../../src/modelAdapter/providerAccessLayer/transportCaller.js";
import { bridgeExecEngineInvocation } from "../../src/runtimeImplementation/runtime.execEngine/execEngineInvocationBridge.js";

const args = process.argv.slice(2);
const argSet = new Set(args);
const codexAuthPath = process.env.AGENTCORE_CODEX_AUTH_FILE
  ?? path.join(process.env.CODEX_HOME ?? path.join(process.env.HOME ?? "", ".codex"), "auth.json");
const chatgptCodexClientVersion = process.env.AGENTCORE_CODEX_CLIENT_VERSION ?? "0.118.0";
const model = process.env.AGENTCORE_CODEX_MODEL ?? process.env.OPENAI_SMOKE_MODEL ?? "gpt-5.5";
const reasoningEffort =
  process.env.AGENTCORE_CODEX_REASONING_EFFORT ??
  process.env.OPENAI_AGENTCORE_REASONING_EFFORT ??
  process.env.OPENAI_REASONING_EFFORT ??
  "low";
const maxOutputTokens = Number(process.env.OPENAI_AGENTCORE_MAX_OUTPUT_TOKENS ?? "512");
const useModel = !argSet.has("--no-model");
const dialogueMode = argSet.has("--dialogue");

type CodeBaseExploreToolCall = {
  tool: string;
  arguments: Readonly<Record<string, unknown>>;
};

type CodeBaseExploreCase = {
  toolId: string;
  userPrompt: string;
  input: Readonly<Record<string, unknown>>;
  expectedCall: string;
};

const codeBaseExploreCases: readonly CodeBaseExploreCase[] = [
  {
    toolId: "code.read",
    userPrompt: "你先帮我看一下 src/index.ts 开头大概在做什么，前二十行就够。",
    input: { targetPath: "src/index.ts", range: { startLine: 1, endLine: 20 }, context: { dryRun: false, guard: { allowed: true } } },
    expectedCall: "readText:src/index.ts",
  },
  {
    toolId: "code.scan",
    userPrompt: "我想先摸一下这个项目的 src 结构，你帮我扫一眼目录。",
    input: { directoryPath: "src", depth: 2, maxEntries: 20, context: { dryRun: false, guard: { allowed: true } } },
    expectedCall: "list:src",
  },
  {
    toolId: "code.search_Ripgrep",
    userPrompt: "帮我找找 createBaseToolRegistry 在 src 里面哪里出现过。",
    input: { query: "createBaseToolRegistry", directoryPath: "src", fileGlob: "**/*.ts", context: { dryRun: false, guard: { allowed: true } } },
    expectedCall: "ripgrep:createBaseToolRegistry:src",
  },
  {
    toolId: "code.replaceFile",
    userPrompt: "在临时工作区里整体替换一个文件内容。",
    input: { targetPath: "tmp/matrix-replace.txt", newContent: "replace-file-ok\n", context: { dryRun: false, guard: { allowed: true, accepted: true } } },
    expectedCall: "writeText:tmp/matrix-replace.txt",
  },
  {
    toolId: "code.overwrite",
    userPrompt: "覆盖写入一个临时文件。",
    input: { workspaceRoot: ".", targetPath: "tmp/matrix-overwrite.txt", content: "overwrite-ok\n", context: { dryRun: false, guard: { allowed: true, accepted: true } } },
    expectedCall: "writeText:tmp/matrix-overwrite.txt",
  },
  {
    toolId: "code.modify",
    userPrompt: "把临时文件里的 old 改成 new。",
    input: { workspaceRoot: ".", targetPath: "tmp/matrix-modify.txt", searchText: "old", replacementText: "new", context: { dryRun: false, guard: { allowed: true, accepted: true } } },
    expectedCall: "writeText:tmp/matrix-modify.txt",
  },
  {
    toolId: "code.delete",
    userPrompt: "删除一个临时文件。",
    input: { workspaceRoot: ".", targetPath: "tmp/matrix-delete.txt", deleteKind: "file", context: { dryRun: false, guard: { allowed: true, accepted: true } } },
    expectedCall: "deletePath:tmp/matrix-delete.txt",
  },
  {
    toolId: "code.format",
    userPrompt: "预览格式化一个 TypeScript 文件。",
    input: { workspaceRoot: ".", targetPath: "src/index.ts", languageHint: "typescript", context: { dryRun: false, guard: { allowed: true, accepted: true } } },
    expectedCall: "lsp.formatDocumentPreview:src/index.ts",
  },
  {
    toolId: "code.testCode",
    userPrompt: "运行一个 node:test 测试目标。",
    input: { workspaceRoot: ".", testTarget: "test/sample.test.ts", testFramework: "node:test", command: ["node", "--version"], context: { dryRun: false, guard: { allowed: true, accepted: true } } },
    expectedCall: "process.run:test",
  },
  {
    toolId: "code.benchmark",
    userPrompt: "跑一个轻量 benchmark。",
    input: { workspaceRoot: ".", benchmarkTarget: "matrix-benchmark", iterations: 1, command: ["node", "-e", "console.log('benchmark-ok')"], context: { dryRun: false, guard: { allowed: true, accepted: true } } },
    expectedCall: "process.run:benchmark",
  },
  {
    toolId: "code.debugCollectLogs",
    userPrompt: "收集一次 debug 日志。",
    input: { sources: [{ kind: "debug-console", id: "matrix" }], maxEntries: 5, context: { dryRun: false, guard: { allowed: true, accepted: true } } },
    expectedCall: "debug.collectLogs",
  },
  {
    toolId: "code.debugCaptureState",
    userPrompt: "抓取一次 debug 状态。",
    input: { target: { kind: "debug-session", id: "matrix" }, capture: { includeStack: true, includeVariables: true }, context: { dryRun: false, guard: { allowed: true, accepted: true } } },
    expectedCall: "debug.captureState",
  },
  {
    toolId: "code.debugRun",
    userPrompt: "启动一次 debug run。",
    input: { target: { kind: "test", label: "matrix-debug", command: ["node", "-e", "console.log('debug-ok')"] }, context: { dryRun: false, guard: { allowed: true, accepted: true } } },
    expectedCall: "debug.launch",
  },
  ...[
    ["code.lsp_applyCodeAction", "lsp.applyCodeActionPreview"],
    ["code.lsp_assistSignature", "lsp.assistSignature"],
    ["code.lsp_completeCode", "lsp.completeCode"],
    ["code.lsp_explainSymbol", "lsp.explainSymbol"],
    ["code.lsp_formatDocument", "lsp.formatDocumentPreview"],
    ["code.lsp_formatRange", "lsp.formatRangePreview"],
    ["code.lsp_inspectDiagnostics", "lsp.inspectDiagnostics"],
    ["code.lsp_inspectSymbol", "lsp.inspectSymbol"],
    ["code.lsp_locateDefinition", "lsp.locateDefinition"],
    ["code.lsp_locateTypeDefinition", "lsp.locateTypeDefinition"],
    ["code.lsp_renameSymbol", "lsp.renameSymbolPreview"],
    ["code.lsp_scanDocumentSymbols", "lsp.scanDocumentSymbols"],
    ["code.lsp_searchWorkspaceSymbols", "lsp.searchWorkspaceSymbols"],
    ["code.lsp_suggestCodeActions", "lsp.suggestCodeActions"],
    ["code.lsp_traceImplementations", "lsp.traceImplementations"],
    ["code.lsp_traceReferences", "lsp.traceReferences"],
  ].map(([toolId, expectedCall]) => ({
    toolId,
    userPrompt: `对 src/index.ts 执行 ${toolId} 语义能力。`,
    input: {
      target: {
        filePath: "src/index.ts",
        line: 0,
        character: 0,
        languageId: "typescript",
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
      },
      documentUri: "src/index.ts",
      workspaceRoot: ".",
      preferredProvider: "anthropic",
      actionTitle: "Fix",
      dryRun: false,
      position: { line: 0, character: 0 },
      query: "Praxis",
      newName: "PraxisRenamed",
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
      context: { dryRun: false, guard: { allowed: true, accepted: true } },
    },
    expectedCall,
  })),
] as const;

const codeBaseExploreToolIds = [...new Set(codeBaseExploreCases.map((testCase) => testCase.toolId))].join(", ");

function argValue(name: string): string | undefined {
  const prefix = `${name}=`;
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function createCodeBaseExploreExecutor(calls: string[]): BaseToolExecutorPort {
  const emptyRange = { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } };
  const location = { filePath: "src/index.ts", range: emptyRange, symbolName: "Praxis" };
  return {
    filesystem: {
      async readText(request) {
        calls.push(`readText:${request.path}`);
        return { ok: true, output: { content: `content:${request.path}\nold\n`, truncated: false } };
      },
      async writeText(request) {
        calls.push(`writeText:${request.path}`);
        return { ok: true, output: { bytesWritten: Buffer.byteLength(request.content) } };
      },
      async deletePath(request) {
        calls.push(`deletePath:${request.path}`);
        return { ok: true, output: { deleted: true } };
      },
      async list(request) {
        calls.push(`list:${request.path}`);
        return { ok: true, output: { entries: [`${request.path}/a.ts`, `${request.path}/b.ts`] } };
      },
    },
    search: {
      async ripgrep(request) {
        calls.push(`ripgrep:${request.query}:${request.directoryPath}`);
        return {
          ok: true,
          output: {
            exitCode: 0,
            matches: [{ path: `${request.directoryPath}/registry.ts`, line: 1, text: request.query }],
          },
        };
      },
    },
    process: {
      async run(request) {
        calls.push(`process.run:${request.intent ?? "generic"}`);
        return { ok: true, output: { exitCode: 0, stdout: "process-ok", stderr: "", durationMs: 1 } };
      },
    },
    debug: {
      async collectLogs() {
        calls.push("debug.collectLogs");
        return { ok: true, output: { entries: [{ source: "matrix", level: "info", message: "debug log" }], truncated: false } };
      },
      async captureState() {
        calls.push("debug.captureState");
        return { ok: true, output: { state: "paused", stack: [{ name: "main", filePath: "src/index.ts", line: 1 }], variables: [{ name: "value", valuePreview: "1" }] } };
      },
      async launch() {
        calls.push("debug.launch");
        return { ok: true, output: { debugSessionId: "matrix-debug", state: "launched", breakpointsAccepted: 0 } };
      },
    },
    lsp: {
      async locateDefinition(request) {
        calls.push(`lsp.locateDefinition:${request.target.filePath}`);
        return { ok: true, output: { locations: [location] } };
      },
      async locateTypeDefinition(request) {
        calls.push(`lsp.locateTypeDefinition:${request.target.filePath}`);
        return { ok: true, output: { locations: [location] } };
      },
      async traceReferences(request) {
        calls.push(`lsp.traceReferences:${request.target.filePath}`);
        return { ok: true, output: { locations: [location] } };
      },
      async traceImplementations(request) {
        calls.push(`lsp.traceImplementations:${request.target.filePath}`);
        return { ok: true, output: { locations: [location] } };
      },
      async scanDocumentSymbols(request) {
        calls.push(`lsp.scanDocumentSymbols:${request.target.filePath}`);
        return { ok: true, output: { symbols: [{ name: "Praxis", kind: "Class", range: emptyRange }] } };
      },
      async searchWorkspaceSymbols() {
        calls.push("lsp.searchWorkspaceSymbols");
        return { ok: true, output: { symbols: [{ name: "Praxis", kind: "Class", location }] } };
      },
      async suggestCodeActions(request) {
        calls.push(`lsp.suggestCodeActions:${request.target.filePath}`);
        return { ok: true, output: { actions: [{ title: "Fix", diagnostics: [], editAvailable: true, commandAvailable: false }] } };
      },
      async applyCodeActionPreview(request) {
        calls.push(`lsp.applyCodeActionPreview:${request.target.filePath}`);
        return { ok: true, output: { actions: [{ title: "Fix", diagnostics: [], editAvailable: true, commandAvailable: false }] } };
      },
      async renameSymbolPreview(request) {
        calls.push(`lsp.renameSymbolPreview:${request.target.filePath}`);
        return { ok: true, output: { edits: [{ filePath: request.target.filePath, edits: [{ range: emptyRange, newText: request.newName }] }] } };
      },
      async completeCode(request) {
        calls.push(`lsp.completeCode:${request.target.filePath}`);
        return { ok: true, output: { items: [{ label: "Praxis", kind: "Class" }] } };
      },
      async assistSignature(request) {
        calls.push(`lsp.assistSignature:${request.target.filePath}`);
        return { ok: true, output: { signatureHelp: { signatures: [{ label: "fn()", parameters: [] }] } } };
      },
      async explainSymbol(request) {
        calls.push(`lsp.explainSymbol:${request.target.filePath}`);
        return { ok: true, output: { hover: { contents: "Praxis symbol", range: emptyRange }, definitions: [location], references: [location] } };
      },
      async inspectSymbol(request) {
        calls.push(`lsp.inspectSymbol:${request.target.filePath}`);
        return { ok: true, output: { symbols: [{ name: "Praxis", kind: "Class", range: emptyRange }] } };
      },
      async inspectDiagnostics(request) {
        calls.push(`lsp.inspectDiagnostics:${request.target.filePath}`);
        return { ok: true, output: { diagnostics: [] } };
      },
      async formatDocumentPreview(request) {
        calls.push(`lsp.formatDocumentPreview:${request.target.filePath}`);
        return { ok: true, output: { edits: [{ range: emptyRange, newText: "formatted" }] } };
      },
      async formatRangePreview(request) {
        calls.push(`lsp.formatRangePreview:${request.target.filePath}`);
        return { ok: true, output: { edits: [{ range: request.target.range, newText: "formatted-range" }] } };
      },
    },
  };
}

function extractSseText(text: string): string {
  const deltas: string[] = [];
  const completed: string[] = [];
  for (const line of text.split(/\r?\n/u)) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice("data:".length).trim();
    if (payload.length === 0 || payload === "[DONE]") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload) as unknown;
    } catch {
      continue;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) continue;
    const record = parsed as Record<string, unknown>;
    if (typeof record.delta === "string") deltas.push(record.delta);
    if (record.type === "response.completed" && record.response !== undefined) {
      const responseText = extractResponseText(record.response);
      if (responseText.trim().length > 0) completed.push(responseText);
    }
  }
  return deltas.join("").trim() || completed.join("\n").trim();
}

function extractResponseText(response: unknown): string {
  if (typeof response === "string") return extractSseText(response) || response;
  if (typeof response !== "object" || response === null) return String(response);
  const record = response as Record<string, unknown>;
  if (typeof record.output_text === "string" && record.output_text.trim().length > 0) return record.output_text.trim();
  const outputValue = record.output;
  if (Array.isArray(outputValue)) {
    const parts: string[] = [];
    for (const item of outputValue) {
      if (typeof item !== "object" || item === null) continue;
      const contentValue = (item as Record<string, unknown>).content;
      if (!Array.isArray(contentValue)) continue;
      for (const content of contentValue) {
        if (typeof content !== "object" || content === null) continue;
        const text = (content as Record<string, unknown>).text ?? (content as Record<string, unknown>).output_text;
        if (typeof text === "string" && text.trim().length > 0) parts.push(text.trim());
      }
    }
    if (parts.length > 0) return parts.join("\n");
  }
  return JSON.stringify(response, null, 2);
}

function parseJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/iu.exec(trimmed);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    const firstBrace = candidate.indexOf("{");
    const lastBrace = candidate.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) return JSON.parse(candidate.slice(firstBrace, lastBrace + 1)) as unknown;
    throw new Error(`model did not return JSON: ${text.slice(0, 400)}`);
  }
}

function normalizeCodeBaseExploreToolCall(value: unknown): CodeBaseExploreToolCall | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const toolCalls = record.tool_calls ?? record.toolCalls;
  const first = Array.isArray(toolCalls) ? toolCalls[0] : record;
  if (typeof first !== "object" || first === null || Array.isArray(first)) return undefined;
  const toolRecord = first as Record<string, unknown>;
  const tool = toolRecord.tool ?? toolRecord.name;
  const toolArguments = toolRecord.arguments;
  if (typeof tool !== "string" || !tool.startsWith("code.")) return undefined;
  if (typeof toolArguments !== "object" || toolArguments === null || Array.isArray(toolArguments)) return undefined;
  return { tool, arguments: toolArguments as Readonly<Record<string, unknown>> };
}

async function callResponsesApi(prompt: string, instructions: string): Promise<string> {
  const credentialRef = createCredentialRef({
    id: "agentcore-codebase-explore-live-matrix-chatgpt-codex",
    provider: "openai",
    credentialType: "chatgpt_codex_oauth",
    source: { kind: "codex-auth-file", filePath: codexAuthPath },
  });
  if (!credentialRef.ok) throw new Error(JSON.stringify(credentialRef.error));

  const auth = resolveAuthEnvelope({
    credentialRef: credentialRef.credentialRef,
    readFile: (filePath) => readFileSync(filePath, "utf8"),
  });
  if (!auth.ok) throw new Error(JSON.stringify(auth.error));

  const carrier = createChatGPTCodexResponsesCarrier({
    carrierId: "chatgpt-codex.responses.agentcore-codebase-explore-live-matrix",
    model,
    reasoning: { effort: reasoningEffort },
    credentialRef: credentialRef.credentialRef,
    clientName: "praxis-agentcore-codebase-explore-live-matrix",
    clientVersion: chatgptCodexClientVersion,
  });
  if (!carrier.ok) throw new Error(JSON.stringify(carrier.error));

  const caller = createProviderCaller({ transport: fetchProviderTransport, authMaterial: auth.resolved.privateMaterial, timeoutMs: 60_000 });
  const result = await invokeChatGPTCodexResponses({
    operation: "create",
    baseUrl: carrier.carrier.baseURL,
    auth: auth.resolved.envelope,
    runtime: {
      runtimeId: "agentcore-codebase-explore-live-matrix-runtime",
      invocationId: `agentcore-codebase-explore-live-matrix-${Date.now()}`,
      callerId: "agentcore-codebase-explore-live-matrix",
    },
    governance: { accepted: true },
    dryRun: false,
    caller,
    headers: { "content-type": "application/json" },
    clientName: "praxis-agentcore-codebase-explore-live-matrix",
    clientVersion: chatgptCodexClientVersion,
    expectResponseObject: false,
    body: { model, instructions, input: prompt, reasoning: { effort: reasoningEffort }, max_output_tokens: maxOutputTokens },
  });
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return extractResponseText(result.response.raw);
}

async function invokeCodeBaseExploreToolThroughRuntimeChain(
  toolCall: CodeBaseExploreToolCall,
  executor: BaseToolExecutorPort,
): Promise<{ ok: boolean; toolId: string; output?: unknown; error?: { code: string; publicSafe: true } }> {
  const toolCallId = `${toolCall.tool}:live-matrix`;
  const runtimeId = "agentcore-codebase-explore-live-matrix-runtime";
  const sessionId = "agentcore-codebase-explore-live-matrix-session";
  const adapted = adaptRuntimeToolInvocation({
    context: { runtimeId, sessionId, invocationId: toolCallId },
    toolId: toolCall.tool,
    operation: toolCall.tool,
    arguments: toolCall.arguments,
    resourceLimits: { timeoutMs: 1000, maxOutputBytes: 8000 },
  });
  if (!adapted.ok) return { ok: false, toolId: toolCall.tool, error: adapted.error };
  const bridged = bridgeExecEngineInvocation({
    runtimeId,
    caller: { kind: "application", id: "agentcore-codebase-explore-live-matrix", sessionId },
    invocation: { invocationId: toolCallId, kind: "tool", target: toolCall.tool, payload: adapted.invocation, auditRef: adapted.invocation.audit.event },
    runtimeReady: true,
  });
  if (!bridged.ok) return { ok: false, toolId: toolCall.tool, error: bridged.error };
  const lookup = createBaseToolRegistry().lookupHandler(toolCall.tool);
  if (!lookup.ok) return { ok: false, toolId: toolCall.tool, error: lookup.error };
  return lookup.handler.invoke({ toolCallId, runtimeId, sessionId, input: toolCall.arguments, executor });
}

function toolCallFromCase(testCase: CodeBaseExploreCase): CodeBaseExploreToolCall {
  return { tool: testCase.toolId, arguments: testCase.input };
}

function withRuntimeGovernance(tool: string, toolArguments: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const input: Record<string, unknown> = { ...toolArguments };
  const context = typeof input.context === "object" && input.context !== null && !Array.isArray(input.context)
    ? input.context as Record<string, unknown>
    : {};
  input.dryRun ??= false;

  if (tool === "code.read") {
    input.targetPath ??= input.path ?? input.file;
    if (typeof input.range === "object" && input.range !== null && !Array.isArray(input.range)) {
      const range = input.range as Record<string, unknown>;
      input.range = {
        ...range,
        startLine: range.startLine ?? range.start,
        endLine: range.endLine ?? range.end,
      };
    }
    if (input.range === undefined && (input.startLine !== undefined || input.endLine !== undefined)) {
      input.range = { startLine: input.startLine, endLine: input.endLine };
    }
  }

  if (tool === "code.scan") {
    input.directoryPath ??= input.directory ?? input.path ?? ".";
    input.maxEntries ??= input.limit;
  }

  if (tool === "code.search_Ripgrep") {
    input.query ??= input.pattern;
    input.directoryPath ??= input.directory ?? input.path ?? input.cwd ?? ".";
    input.fileGlob ??= input.glob;
  }

  input.context = {
    ...context,
    dryRun: false,
    guard: {
      ...(typeof context.guard === "object" && context.guard !== null && !Array.isArray(context.guard)
        ? context.guard as Record<string, unknown>
        : {}),
      allowed: true,
      accepted: true,
    },
    requestedScopes: Array.isArray(context.requestedScopes) ? context.requestedScopes : ["filesystem:read"],
    allowedScopes: Array.isArray(context.allowedScopes) ? context.allowedScopes : ["filesystem:read"],
  };

  return input;
}

function expectedCallSeen(expectedCall: string, calls: readonly string[]): boolean {
  return calls.some((call) => call === expectedCall || call.startsWith(`${expectedCall}:`));
}

function truncateText(value: unknown, maxChars = 500): string {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2) ?? String(value);
  return text.length > maxChars ? `${text.slice(0, maxChars)}...<truncated>` : text;
}

async function main(): Promise<void> {
  const onlyTool = argValue("--tool");
  const limit = Number(argValue("--limit") ?? codeBaseExploreCases.length);
  const selected = codeBaseExploreCases
    .filter((testCase) => onlyTool === undefined || testCase.toolId === onlyTool)
    .slice(0, Number.isFinite(limit) && limit > 0 ? limit : codeBaseExploreCases.length);
  const results = [];

  if (dialogueMode) {
    console.log("agentCore codeBase explore dialogue suite");
    console.log(`mode=${useModel ? "live-model-plus-registry-handler" : "registry-handler-only"}`);
    console.log("");
  }

  for (const testCase of selected) {
    const calls: string[] = [];
    let modelText = "";
    let toolCall = toolCallFromCase(testCase);
    let modelOk = true;
    let modelError: string | undefined;

    if (useModel) {
      const prompt = [
        "请模拟一次真实 agentCore 对话里的工具选择。",
        `用户请求：${testCase.userPrompt}`,
        "这是普通用户话术，用户不会自己写工具参数。你要像 agent 一样自己选择最合适的 codeBase/code.lsp/debug 工具。",
        `本轮是覆盖率回归测试，正在验证的 capability 是 ${testCase.toolId}。如果用户请求与该 capability 兼容，必须调用这个 exact tool id。`,
        `可用 code 工具全集：${codeBaseExploreToolIds}。不要选择 shell，也不要输出解释。`,
        `测试工作区已经准备好的具体资源和参数锚点：${JSON.stringify(testCase.input)}`,
        "你必须基于这些真实 fixture 参数组织 arguments；字段名和值都要尽量原样保留，尤其是 code.replaceFile 的 newContent、code.overwrite 的 content、command、benchmarkTarget。",
        "不要发明 /tmp/workspace、placeholder、<file path> 或其他不存在的路径，不要把 newContent 改名为 content，也不要把 benchmarkTarget 改名为 target。",
        "参数字段提示：code.read 用 targetPath/range；code.scan 用 directoryPath/depth/maxEntries；code.search_Ripgrep 用 query/directoryPath/fileGlob/maxMatches。",
        "编辑类工具用 workspaceRoot/targetPath/content 或 searchText/replacementText；debug 工具用 target/sources/capture；code.lsp_* 工具用 target/documentUri/workspaceRoot/position/range/query/newName/actionTitle。",
        "只返回：{\"tool_calls\":[{\"tool\":\"...\",\"arguments\":{...}}]}",
      ].join("\n");
      try {
        modelText = await callResponsesApi(prompt, "你是 Praxis agentCore codeBase explore live matrix。你只输出 JSON tool_calls，不输出解释。");
        const parsedToolCall = normalizeCodeBaseExploreToolCall(parseJsonObject(modelText));
        if (parsedToolCall === undefined) {
          modelOk = false;
          modelError = "MODEL_DID_NOT_RETURN_CODE_TOOL_CALL";
        } else if (parsedToolCall.tool !== testCase.toolId) {
          modelOk = false;
          modelError = `MODEL_TOOL_MISMATCH:${parsedToolCall.tool}`;
          toolCall = { tool: parsedToolCall.tool, arguments: withRuntimeGovernance(parsedToolCall.tool, parsedToolCall.arguments) };
        } else {
          toolCall = { tool: parsedToolCall.tool, arguments: withRuntimeGovernance(parsedToolCall.tool, parsedToolCall.arguments) };
        }
      } catch (error) {
        modelOk = false;
        modelError = error instanceof Error ? error.message : String(error);
      }
    }

    const toolResult = await invokeCodeBaseExploreToolThroughRuntimeChain(toolCall, createCodeBaseExploreExecutor(calls));
    const expectedCallOk = expectedCallSeen(testCase.expectedCall, calls);
    const ok = modelOk && toolResult.ok === true && expectedCallOk;
    const record = {
      ok,
      toolId: testCase.toolId,
      modelOk,
      modelError,
      expectedCallOk,
      expectedCall: testCase.expectedCall,
      calls,
      resultOk: toolResult.ok,
      error: toolResult.error,
      outputPreview: truncateText(toolResult.output),
      modelPreview: modelText.slice(0, 500),
    };
    results.push(record);
    if (dialogueMode) {
      console.log(`[${results.length}/${selected.length}] user> ${testCase.userPrompt}`);
      console.log(`model tool_call> ${modelOk ? toolCall.tool : `FAILED ${modelError}`}`);
      console.log(`runtime> ok=${toolResult.ok} calls=${calls.join(", ") || "(none)"}`);
      console.log(`agentCore> ${record.outputPreview}`);
      console.log(`result> ${ok ? "PASS" : "FAIL"}`);
      console.log("");
    } else {
      console.log(JSON.stringify(record));
    }
  }

  const failed = results.filter((result) => !result.ok);
  const summary = {
    ok: failed.length === 0,
    mode: useModel ? "live-model-plus-registry-handler" : "registry-handler-only",
    model,
    reasoningEffort,
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    failedTools: failed.map((result) => result.toolId),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) process.exitCode = 1;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`agentCore codeBase explore live matrix fatal> ${message}`);
  if (error instanceof Error && error.stack !== undefined) {
    console.error(error.stack);
  }
  process.exitCode = 1;
});
