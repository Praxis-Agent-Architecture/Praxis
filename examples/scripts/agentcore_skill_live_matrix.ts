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
const maxOutputTokens = Number(process.env.OPENAI_AGENTCORE_MAX_OUTPUT_TOKENS ?? "640");
const useModel = !argSet.has("--no-model");
const dialogueMode = argSet.has("--dialogue");

type SkillBaseToolId =
  | "skill.generate"
  | "skill.iterate"
  | "skill.management"
  | "skill.remove"
  | "skill.ripgrep"
  | "skill.summarize";

type SkillBaseToolCall = {
  tool: SkillBaseToolId;
  arguments: Readonly<Record<string, unknown>>;
};

type SkillBaseCase = {
  toolId: SkillBaseToolId;
  userPrompt: string;
  input: Readonly<Record<string, unknown>>;
  expectedCalls: readonly string[];
  outputNeedle: string;
};

const registryRoot = "/workspace/.agents/skills";
const skillRoot = `${registryRoot}/repo-auditor`;
const skillPath = `${skillRoot}/SKILL.md`;
const skillMarkdown = "---\nname: repo-auditor\ndescription: Audit repositories and summarize repository risks\n---\n# Repo Auditor\n\nUse this skill when auditing repository structure, ownership, tests, and risks.\n";

const skillBaseCases: readonly SkillBaseCase[] = [
  {
    toolId: "skill.generate",
    userPrompt: "帮我创建一个 repo-auditor skill，用来审计仓库结构和风险，先放到本地 skills 目录。",
    input: {
      target: {
        skillName: "repo-auditor",
        purpose: "Audit repository structure, ownership, tests, and risks.",
        destinationRoot: registryRoot,
        tags: ["repository", "audit"],
      },
      context: governedContext(["skill:write", "filesystem:write"]),
    },
    expectedCalls: [`writeText:${skillPath}`],
    outputNeedle: "generationEnvelope",
  },
  {
    toolId: "skill.iterate",
    userPrompt: "把 repo-auditor 这个 skill 迭代一下，在 SKILL.md 末尾加一条检查测试覆盖率的规则。",
    input: {
      target: {
        skillPath: skillRoot,
        changeIntent: "Add a test coverage review rule.",
        operations: [
          {
            kind: "append",
            relativePath: "SKILL.md",
            summary: "append coverage rule",
            content: "\n- Check whether changed code has focused test coverage.\n",
          },
        ],
      },
      context: governedContext(["skill:read", "skill:write", "filesystem:read", "filesystem:write"]),
    },
    expectedCalls: [`readText:${skillPath}`, `writeText:${skillPath}`],
    outputNeedle: "iterationEnvelope",
  },
  {
    toolId: "skill.management",
    userPrompt: "加载 repo-auditor 这个 skill，让 agent 真正拿到完整 SKILL.md 正文和资源索引。",
    input: {
      target: { action: "load", skillId: "repo-auditor", registryRoot },
      context: governedContext(["skill:read", "filesystem:read"]),
    },
    expectedCalls: [`readText:${skillPath}`, `list:${skillRoot}`],
    outputNeedle: "modelInstructionEnvelope",
  },
  {
    toolId: "skill.remove",
    userPrompt: "把 repo-auditor skill 做一次 purge 删除，必须走删除语义而不是插件卸载。",
    input: {
      target: { skillId: "repo-auditor", registryRoot, mode: "purge" },
      context: governedContext(["skill:write", "filesystem:write"]),
    },
    expectedCalls: [`deletePath:${skillRoot}`],
    outputNeedle: "removalEnvelope",
  },
  {
    toolId: "skill.ripgrep",
    userPrompt: "在 repo-auditor skill 里搜索 allowed-tools 这个词，看看说明里有没有提到。",
    input: {
      target: { query: "allowed-tools", registryRoot, skillId: "repo-auditor", maxResults: 5 },
      context: governedContext(["skill:read", "filesystem:read"]),
    },
    expectedCalls: [`ripgrep:allowed-tools:${skillRoot}`],
    outputNeedle: "ripgrepEnvelope",
  },
  {
    toolId: "skill.summarize",
    userPrompt: "给 repo-auditor skill 生成一个模型可见的短摘要，先只读 SKILL.md。",
    input: {
      target: { skillId: "repo-auditor", skillPath, maxBullets: 3 },
      context: governedContext(["skill:read"]),
    },
    expectedCalls: [`readText:${skillPath}`],
    outputNeedle: "summaryEnvelope",
  },
] as const;

function governedContext(grantedPermissions: readonly string[]): Readonly<Record<string, unknown>> {
  return {
    dryRun: false,
    guard: { accepted: true, allowed: true },
    allowedRoots: [registryRoot],
    allowedSkillIds: ["repo-auditor"],
    grantedPermissions,
    auditMetadata: { surface: "agentcore_skill_live_matrix" },
  };
}

function argValue(name: string): string | undefined {
  const prefix = `${name}=`;
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function createSkillBaseExecutor(calls: string[]): BaseToolExecutorPort {
  return {
    filesystem: {
      async readText(request) {
        calls.push(`readText:${request.path}`);
        return { ok: true, output: { content: skillMarkdown, truncated: false } };
      },
      async writeText(request) {
        calls.push(`writeText:${request.path}`);
        return { ok: true, output: { bytesWritten: request.content.length } };
      },
      async deletePath(request) {
        calls.push(`deletePath:${request.path}`);
        return { ok: true, output: { deleted: true } };
      },
      async list(request) {
        calls.push(`list:${request.path}`);
        return { ok: true, output: { entries: ["SKILL.md", "references/checklist.md", "scripts/audit.ts"] } };
      },
    },
    search: {
      async ripgrep(request) {
        calls.push(`ripgrep:${request.query}:${request.directoryPath}`);
        return {
          ok: true,
          output: {
            exitCode: 0,
            matches: [{ path: `${request.directoryPath}/SKILL.md`, line: 7, text: `${request.query}: prefer explicit tool declarations` }],
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

function normalizeSkillBaseToolCall(value: unknown): SkillBaseToolCall | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const toolCalls = record.tool_calls ?? record.toolCalls;
  const first = Array.isArray(toolCalls) ? toolCalls[0] : record;
  if (typeof first !== "object" || first === null || Array.isArray(first)) return undefined;
  const toolRecord = first as Record<string, unknown>;
  const tool = toolRecord.tool ?? toolRecord.name;
  const toolArguments = toolRecord.arguments;
  if (tool !== "skill.generate" && tool !== "skill.iterate" && tool !== "skill.management" && tool !== "skill.remove" && tool !== "skill.ripgrep" && tool !== "skill.summarize") return undefined;
  if (typeof toolArguments !== "object" || toolArguments === null || Array.isArray(toolArguments)) return undefined;
  return { tool, arguments: toolArguments as Readonly<Record<string, unknown>> };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeSkillIterateOperations(target: Record<string, unknown>): void {
  if (!Array.isArray(target.operations)) return;
  const changeIntent = typeof target.changeIntent === "string" ? target.changeIntent : "skill iteration";
  target.operations = target.operations
    .filter(isRecord)
    .map((operation) => {
      const kind = operation.kind ?? operation.type ?? "append";
      const rawPath = operation.relativePath ?? operation.path ?? operation.file ?? "SKILL.md";
      const relativePath = typeof rawPath === "string" && rawPath.startsWith("repo-auditor/")
        ? rawPath.slice("repo-auditor/".length)
        : rawPath;
      const summary = operation.summary ?? changeIntent;
      return { ...operation, kind, relativePath, summary };
    });
}

async function callResponsesApi(prompt: string, instructions: string): Promise<string> {
  const credentialRef = createCredentialRef({
    id: "agentcore-skill-live-matrix-chatgpt-codex",
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
    carrierId: "chatgpt-codex.responses.agentcore-skill-live-matrix",
    model,
    reasoning: { effort: reasoningEffort },
    credentialRef: credentialRef.credentialRef,
    clientName: "praxis-agentcore-skill-live-matrix",
    clientVersion: chatgptCodexClientVersion,
  });
  if (!carrier.ok) throw new Error(JSON.stringify(carrier.error));

  const caller = createProviderCaller({ transport: fetchProviderTransport, authMaterial: auth.resolved.privateMaterial, timeoutMs: 60_000 });
  const result = await invokeChatGPTCodexResponses({
    operation: "create",
    baseUrl: carrier.carrier.baseURL,
    auth: auth.resolved.envelope,
    runtime: {
      runtimeId: "agentcore-skill-live-matrix-runtime",
      invocationId: `agentcore-skill-live-matrix-${Date.now()}`,
      callerId: "agentcore-skill-live-matrix",
    },
    governance: { accepted: true },
    dryRun: false,
    caller,
    headers: { "content-type": "application/json" },
    clientName: "praxis-agentcore-skill-live-matrix",
    clientVersion: chatgptCodexClientVersion,
    expectResponseObject: false,
    body: { model, instructions, input: prompt, reasoning: { effort: reasoningEffort }, max_output_tokens: maxOutputTokens },
  });
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return extractResponseText(result.response.raw);
}

function withRuntimeGovernance(tool: SkillBaseToolId, toolArguments: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const fallback = skillBaseCases.find((testCase) => testCase.toolId === tool)?.input;
  const input: Record<string, unknown> = { ...fallback, ...toolArguments };
  const fallbackTarget = isRecord(fallback?.target) ? fallback.target : {};
  const target = { ...fallbackTarget, ...(isRecord(toolArguments.target) ? toolArguments.target : {}) };
  const context = isRecord(input.context) ? input.context : {};
  const fallbackContext = isRecord(fallback?.context) ? fallback.context : {};

  if (tool === "skill.generate") {
    target.destinationRoot = registryRoot;
    target.skillName ??= "repo-auditor";
  }
  if (tool === "skill.iterate") {
    target.skillPath = skillRoot;
    normalizeSkillIterateOperations(target);
  }
  if (tool === "skill.management") {
    target.registryRoot = registryRoot;
    target.skillId ??= "repo-auditor";
  }
  if (tool === "skill.remove") {
    target.registryRoot = registryRoot;
    target.skillId ??= "repo-auditor";
  }
  if (tool === "skill.ripgrep") {
    target.registryRoot = registryRoot;
    target.skillId ??= "repo-auditor";
  }
  if (tool === "skill.summarize") {
    target.skillId ??= "repo-auditor";
    target.skillPath = skillPath;
  }

  input.target = target;
  input.context = {
    ...fallbackContext,
    ...context,
    dryRun: false,
    guard: {
      ...(isRecord(fallbackContext.guard) ? fallbackContext.guard : {}),
      ...(isRecord(context.guard) ? context.guard : {}),
      accepted: true,
      allowed: true,
    },
  };

  return input;
}

async function invokeSkillBaseToolThroughRuntimeChain(
  toolCall: SkillBaseToolCall,
  executor: BaseToolExecutorPort,
): Promise<{ ok: boolean; toolId: string; output?: unknown; error?: { code: string; publicSafe: true } }> {
  const toolCallId = `${toolCall.tool}:live-matrix`;
  const runtimeId = "agentcore-skill-live-matrix-runtime";
  const sessionId = "agentcore-skill-live-matrix-session";
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
    caller: { kind: "application", id: "agentcore-skill-live-matrix", sessionId },
    invocation: { invocationId: toolCallId, kind: "tool", target: toolCall.tool, payload: adapted.invocation, auditRef: adapted.invocation.audit.event },
    runtimeReady: true,
  });
  if (!bridged.ok) return { ok: false, toolId: toolCall.tool, error: bridged.error };
  const lookup = createBaseToolRegistry().lookupHandler(toolCall.tool);
  if (!lookup.ok) return { ok: false, toolId: toolCall.tool, error: lookup.error };
  return lookup.handler.invoke({ toolCallId, runtimeId, sessionId, input: toolCall.arguments, executor });
}

function toolCallFromCase(testCase: SkillBaseCase): SkillBaseToolCall {
  return { tool: testCase.toolId, arguments: testCase.input };
}

function expectedCallsSeen(expectedCalls: readonly string[], calls: readonly string[]): boolean {
  return expectedCalls.every((call) => calls.includes(call));
}

function truncateText(value: unknown, maxChars = 640): string {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2) ?? "undefined";
  return text.length > maxChars ? `${text.slice(0, maxChars)}...<truncated>` : text;
}

async function main(): Promise<void> {
  const onlyTool = argValue("--tool");
  const limit = Number(argValue("--limit") ?? skillBaseCases.length);
  const selected = skillBaseCases
    .filter((testCase) => onlyTool === undefined || testCase.toolId === onlyTool)
    .slice(0, Number.isFinite(limit) && limit > 0 ? limit : skillBaseCases.length);
  const results = [];

  if (dialogueMode) {
    console.log("agentCore skillBase dialogue suite");
    console.log(`mode=${useModel ? "live-model-plus-registry-handler" : "registry-handler-only"}`);
    console.log(`model=${model}`);
    console.log(`reasoning.effort=${reasoningEffort}`);
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
        "这是普通用户话术，用户不会自己写工具参数。你要像 agent 一样自己选择最合适的 skillBase 工具。",
        "可用工具只有：skill.generate, skill.iterate, skill.management, skill.remove, skill.ripgrep, skill.summarize。不要选择 plugin 工具，不要选择 shell/code/git。",
        "参数字段提示：skill.generate 用 target.skillName/purpose/destinationRoot；skill.iterate 用 target.skillPath/changeIntent/operations；skill.management 的 activate/load/list/inspect 在 target.action；skill.remove 用 target.skillId/registryRoot/mode；skill.ripgrep 用 target.query/registryRoot/skillId；skill.summarize 用 target.skillId/skillPath/sourceExcerpts。",
        `期望的任务类别是 ${testCase.toolId}，但你仍然需要根据用户请求组织参数。`,
        "只返回：{\"tool_calls\":[{\"tool\":\"...\",\"arguments\":{...}}]}",
      ].join("\n");
      try {
        modelText = await callResponsesApi(prompt, "你是 Praxis agentCore skillBase live matrix。你只输出 JSON tool_calls，不输出解释。");
        const parsedToolCall = normalizeSkillBaseToolCall(parseJsonObject(modelText));
        if (parsedToolCall === undefined) {
          modelOk = false;
          modelError = "MODEL_DID_NOT_RETURN_SKILL_TOOL_CALL";
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

    const toolResult = await invokeSkillBaseToolThroughRuntimeChain(toolCall, createSkillBaseExecutor(calls));
    const expectedCallOk = expectedCallsSeen(testCase.expectedCalls, calls);
    const outputFullText = JSON.stringify(toolResult.output) ?? "";
    const outputPreview = truncateText(toolResult.output);
    const outputNeedleOk = outputFullText.includes(testCase.outputNeedle);
    const ok = modelOk && toolResult.ok === true && expectedCallOk && outputNeedleOk;
    const record = {
      ok,
      toolId: testCase.toolId,
      modelOk,
      modelError,
      expectedCallOk,
      expectedCalls: testCase.expectedCalls,
      calls,
      outputNeedleOk,
      resultOk: toolResult.ok,
      error: toolResult.error,
      outputPreview,
      modelPreview: modelText.slice(0, 500),
    };
    results.push(record);
    if (dialogueMode) {
      console.log(`[${results.length}/${selected.length}] user> ${testCase.userPrompt}`);
      console.log(`model tool_call> ${modelOk ? toolCall.tool : `FAILED ${modelError}`}`);
      console.log(`runtime> ok=${toolResult.ok} calls=${calls.join(", ") || "(none)"}`);
      console.log(`agentCore> ${outputPreview}`);
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
  const stack = error instanceof Error ? error.stack : undefined;
  console.error(`agentCore skillBase live matrix fatal> ${stack ?? message}`);
  process.exitCode = 1;
});
