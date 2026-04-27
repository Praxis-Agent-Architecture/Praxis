import { readFileSync } from "node:fs";
import path from "node:path";

import type { BaseToolExecutorPort } from "../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import { adaptRuntimeToolInvocation } from "../../src/agentCore/agent_executionEngine/basic_toolLayer/invocationAdapter.js";
import { invokeChatGPTCodexResponses } from "../../src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/chatgpt_codex_responses.js";
import { resolveAuthEnvelope } from "../../src/agentCore/agent_modelAdapter/authProfileLayer/authResolver.js";
import { createCredentialRef } from "../../src/agentCore/agent_modelAdapter/authProfileLayer/credentialRef.js";
import { createProviderCaller } from "../../src/agentCore/agent_modelAdapter/providerAccessLayer/providerCaller.js";
import { createChatGPTCodexResponsesCarrier } from "../../src/agentCore/agent_modelAdapter/providerAccessLayer/providerCarrier.js";
import { fetchProviderTransport } from "../../src/agentCore/agent_modelAdapter/providerAccessLayer/transportCaller.js";
import { bridgeExecEngineInvocation } from "../../src/agentCore/agent_runtimeImplementation/runtime.execEngine/execEngineInvocationBridge.js";

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
] as const;

function argValue(name: string): string | undefined {
  const prefix = `${name}=`;
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function createCodeBaseExploreExecutor(calls: string[]): BaseToolExecutorPort {
  return {
    filesystem: {
      async readText(request) {
        calls.push(`readText:${request.path}`);
        return { ok: true, output: { content: `content:${request.path}`, truncated: false } };
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
  return calls.includes(expectedCall);
}

function truncateText(value: unknown, maxChars = 500): string {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
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
        "这是普通用户话术，用户不会自己写工具参数。你要像 agent 一样自己选择最合适的 codeBase explore 工具。",
        "可用工具只有：code.read, code.scan, code.search_Ripgrep。不要选择 shell，也不要输出解释。",
        "参数字段提示：code.read 用 targetPath/range；code.scan 用 directoryPath/depth/maxEntries；code.search_Ripgrep 用 query/directoryPath/fileGlob/maxMatches。",
        `期望的任务类别是 ${testCase.toolId}，但你仍然需要根据用户请求组织参数。`,
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
  process.exitCode = 1;
});
