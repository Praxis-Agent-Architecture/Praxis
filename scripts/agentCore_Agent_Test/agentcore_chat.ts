import { readFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { OpenAIV1ResponsesProviderCaller } from "../../src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_responses.js";
import { invokeChatGPTCodexResponses } from "../../src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/chatgpt_codex_responses.js";
import type { AuthEnvelope } from "../../src/agentCore/agent_modelAdapter/authProfileLayer/authEnvelope.js";
import { resolveAuthEnvelope } from "../../src/agentCore/agent_modelAdapter/authProfileLayer/authResolver.js";
import { createCredentialRef } from "../../src/agentCore/agent_modelAdapter/authProfileLayer/credentialRef.js";
import { createProviderCaller } from "../../src/agentCore/agent_modelAdapter/providerAccessLayer/providerCaller.js";
import { createChatGPTCodexResponsesCarrier } from "../../src/agentCore/agent_modelAdapter/providerAccessLayer/providerCarrier.js";
import { fetchProviderTransport } from "../../src/agentCore/agent_modelAdapter/providerAccessLayer/transportCaller.js";
import {
  createFullShellExecutor,
  invokeShellToolThroughRuntimeChain,
  normalizeShellLiveToolCall,
  shellLiveToolCases,
  shellLiveToolIds,
} from "./shellFullCapabilities.js";
import { providePromptPackInput } from "../../src/agentCore/agent_executionEngine/promptPack/promptProvider.js";
import { mountAgentApplication } from "../../src/agentCore/agent_runtimeImplementation/runtime.applicationSurface/agentApplicationMount.js";
import { createAgentApplicationRuntime } from "../../src/agentCore/agent_runtimeImplementation/runtime.applicationSurface/agentApplicationRuntime.js";
import { createAgentRuntimeClient } from "../../src/agentCore/agent_runtimeImplementation/runtime.applicationSurface/agentRuntimeClient.js";
import { createAgentRuntime } from "../../src/agentCore/agent_runtimeImplementation/runtime.applicationSurface/agentRuntimeFactory.js";
import { bindPromptPack } from "../../src/agentCore/agent_runtimeImplementation/runtime.execEngine/bindPromptPack.js";
import { createAgentInvocationEntrypoint } from "../../src/agentCore/agent_runtimeImplementation/runtime.invocationMethod/agentInvocationEntrypoint.js";
import { createInvocationResultSurface } from "../../src/agentCore/agent_runtimeImplementation/runtime.invocationMethod/invocationResultSurface.js";
import { openModelInvocationEntrypoint } from "../../src/agentCore/agent_runtimeImplementation/runtime.invocationMethod/modelInvocationEntrypoint.js";
import { planModelInvocation } from "../../src/agentCore/agent_runtimeImplementation/runtime.modelAdapter/modelInvocationRuntime.js";
import { lowerPromptForModelAdapter } from "../../src/agentCore/agent_runtimeImplementation/runtime.modelAdapter/promptLoweringRuntime.js";
import { createRuntimeBaseToolExecutorPort } from "../../src/agentCore/agent_runtimeImplementation/runtime.execEngine/baseToolExecutorPortFactory.js";
import { invokeMountedBaseTool } from "../../src/agentCore/agent_runtimeImplementation/runtime.execEngine/baseToolRuntimeMount.js";
import { praxis, type AgentManifest } from "../../src/agentCore/index.js";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type RuntimeContext = {
  runtimeId: string;
  applicationId: string;
  sessionId: string;
};

type LiveToolCall = {
  tool: string;
  arguments: Readonly<Record<string, unknown>>;
};

type FallbackToolCall = {
  toolId: string;
  arguments: Readonly<Record<string, unknown>>;
};

const argv = process.argv.slice(2);
const args = new Set(argv);
const verbose = args.has("--verbose");
const exposeProviderTools = !args.has("--no-provider-tools");
const scriptPath = fileURLToPath(import.meta.url);
const architectureRoot = path.resolve(path.dirname(scriptPath), "../..");
const codexAuthPath = process.env.AGENTCORE_CODEX_AUTH_FILE
  ?? path.join(process.env.CODEX_HOME ?? path.join(process.env.HOME ?? "", ".codex"), "auth.json");
const chatgptCodexClientVersion = process.env.AGENTCORE_CODEX_CLIENT_VERSION ?? "0.118.0";
const model = process.env.AGENTCORE_CODEX_MODEL ?? process.env.OPENAI_SMOKE_MODEL ?? "gpt-5.5";
const maxOutputTokens = Number(process.env.OPENAI_AGENTCORE_MAX_OUTPUT_TOKENS ?? "768");
const reasoningEffort =
  process.env.AGENTCORE_CODEX_REASONING_EFFORT ??
  process.env.OPENAI_AGENTCORE_REASONING_EFFORT ??
  process.env.OPENAI_REASONING_EFFORT ??
  "low";
const modelProfile = `${model}-${reasoningEffort}`;

type RaxProjectDescriptor = {
  entry?: string;
  export?: string;
};

type CompiledChatAgent = {
  manifest: AgentManifest;
  agentPath: string;
  projectRoot?: string;
};

type RealtestLiveProvider = {
  auth: AuthEnvelope;
  providerCaller: OpenAIV1ResponsesProviderCaller;
  authSource: string;
};

function argValue(name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index < 0) return undefined;
  return argv[index + 1];
}

function resolveAgentTarget(): string | undefined {
  const explicit = argValue("--agent") ?? argValue("--project") ?? argValue("--realtest");
  if (explicit !== undefined && explicit.trim().length > 0) {
    return explicit.trim();
  }

  const positional = argv.find((value) => !value.startsWith("-"));
  if (positional === "minimal" || positional === "fullstack") {
    return `realtest/${positional}`;
  }
  return undefined;
}

function realtestAgentOptions(): Readonly<Record<string, unknown>> {
  return {
    mode: args.has("--deep") || args.has("--all-testable") ? "deep" : "quick",
    policyProfile: argValue("--policy") ?? (args.has("--all-testable") ? "permissive" : "standard"),
    sandboxProfile: argValue("--sandbox") ?? "hostObserved",
    persistence: args.has("--sqlite") ? "sqlite" : "memory",
    includeShell: args.has("--shell") || args.has("--all-testable"),
    includeSkillAuthoring: args.has("--skill-authoring") || args.has("--all-testable"),
    includeOmni: args.has("--omni") || args.has("--all-testable"),
    includeComputerUse: args.has("--computeruse") || args.has("--all-testable"),
    includeAllTestable: args.has("--all-testable"),
  };
}

async function pathExists(pathname: string): Promise<boolean> {
  try {
    await stat(pathname);
    return true;
  } catch {
    return false;
  }
}

async function resolveAgentEntry(inputPath: string): Promise<{ agentPath: string; exportName?: string; projectRoot?: string }> {
  const normalized = inputPath === "minimal" || inputPath === "fullstack" ? `realtest/${inputPath}` : inputPath;
  const absolute = path.resolve(architectureRoot, normalized);
  const info = await stat(absolute);
  if (!info.isDirectory()) {
    return { agentPath: absolute };
  }

  const descriptorPath = path.join(absolute, "rax.project.json");
  if (await pathExists(descriptorPath)) {
    const descriptor = JSON.parse(await readFile(descriptorPath, "utf8")) as RaxProjectDescriptor;
    if (typeof descriptor.entry === "string" && descriptor.entry.trim().length > 0) {
      return {
        agentPath: path.resolve(absolute, descriptor.entry),
        exportName: descriptor.export,
        projectRoot: absolute,
      };
    }
  }

  for (const entry of ["praxis.agent.ts", "agents/mainAgent.ts", "agents/repoInspectorAgent.ts"]) {
    const candidate = path.join(absolute, entry);
    if (await pathExists(candidate)) {
      return { agentPath: candidate, projectRoot: absolute };
    }
  }

  throw new Error(`no Praxis agent entry found in ${normalized}`);
}

async function compileRealtestAgent(target: string): Promise<CompiledChatAgent> {
  const entry = await resolveAgentEntry(target);
  const module = await import(pathToFileURL(entry.agentPath).href) as Record<string, unknown>;
  const candidate = entry.exportName !== undefined && entry.exportName.trim().length > 0
    ? module[entry.exportName]
    : module.default;
  const agentInput = entry.projectRoot?.endsWith(path.join("realtest", "fullstack")) === true && typeof candidate === "function"
    ? new (candidate as new (options: Readonly<Record<string, unknown>>) => unknown)(realtestAgentOptions())
    : candidate;
  const compiled = praxis.compileAgent(agentInput as never);
  if (!compiled.ok) {
    throw new Error(`compile ${target} failed: ${compiled.error.message}`);
  }
  return { manifest: compiled.manifest, agentPath: entry.agentPath, projectRoot: entry.projectRoot };
}

function createRealtestLiveProvider(manifest: AgentManifest): RealtestLiveProvider {
  const credentialRef = createCredentialRef({
    id: `agentcore-chat:${manifest.identity.id}:chatgpt-codex`,
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
    reasoning: { effort: reasoningEffort },
    credentialRef: credentialRef.credentialRef,
    clientName: manifest.model.clientName ?? "praxis-agentcore-realtest-chat",
    clientVersion: manifest.model.clientVersion ?? chatgptCodexClientVersion,
  });
  if (!carrier.ok) {
    throw new Error(`carrier failed: ${JSON.stringify(carrier.error)}`);
  }

  return {
    auth: auth.resolved.envelope,
    providerCaller: createProviderCaller({
      transport: fetchProviderTransport,
      authMaterial: auth.resolved.privateMaterial,
      timeoutMs: 60_000,
    }),
    authSource: codexAuthPath,
  };
}

function assertOk<T extends { ok: boolean }>(label: string, result: T): Extract<T, { ok: true }> {
  if (result.ok) {
    return result as Extract<T, { ok: true }>;
  }

  throw new Error(`${label} failed: ${JSON.stringify(result)}`);
}

function extractSseText(text: string): string {
  const deltas: string[] = [];
  const completed: string[] = [];

  for (const line of text.split(/\r?\n/u)) {
    if (!line.startsWith("data:")) {
      continue;
    }

    const payload = line.slice("data:".length).trim();
    if (payload.length === 0 || payload === "[DONE]") {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(payload) as unknown;
    } catch {
      continue;
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      continue;
    }

    const record = parsed as Record<string, unknown>;
    if (typeof record.delta === "string") {
      deltas.push(record.delta);
    }

    if (record.type === "response.completed" && record.response !== undefined) {
      const responseText = extractResponseText(record.response);
      if (responseText.trim().length > 0) {
        completed.push(responseText);
      }
    }
  }

  return deltas.join("").trim() || completed.join("\n").trim();
}

function extractResponseText(response: unknown): string {
  if (typeof response === "string") {
    return extractSseText(response) || response;
  }

  if (typeof response !== "object" || response === null) {
    return String(response);
  }

  const record = response as Record<string, unknown>;
  if (typeof record.output_text === "string" && record.output_text.trim().length > 0) {
    return record.output_text.trim();
  }

  const outputValue = record.output;
  if (Array.isArray(outputValue)) {
    const parts: string[] = [];
    for (const item of outputValue) {
      if (typeof item !== "object" || item === null) {
        continue;
      }

      const itemRecord = item as Record<string, unknown>;
      const contentValue = itemRecord.content;
      if (!Array.isArray(contentValue)) {
        continue;
      }

      for (const content of contentValue) {
        if (typeof content !== "object" || content === null) {
          continue;
        }

        const contentRecord = content as Record<string, unknown>;
        const text = contentRecord.text ?? contentRecord.output_text;
        if (typeof text === "string" && text.trim().length > 0) {
          parts.push(text.trim());
        }
      }
    }

    if (parts.length > 0) {
      return parts.join("\n");
    }
  }

  const choicesValue = record.choices;
  if (Array.isArray(choicesValue)) {
    const first = choicesValue[0] as Record<string, unknown> | undefined;
    const message = first?.message as Record<string, unknown> | undefined;
    const content = message?.content ?? first?.text;
    if (typeof content === "string" && content.trim().length > 0) {
      return content.trim();
    }
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
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(candidate.slice(firstBrace, lastBrace + 1)) as unknown;
    }

    throw new Error("model did not return a JSON tool call");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeToolCall(value: unknown, context: RuntimeContext): LiveToolCall | undefined {
  const toolCall = normalizeShellLiveToolCall(value);
  if (toolCall === undefined) return undefined;
  const callArguments = { ...toolCall.arguments };
  const rawContext = callArguments.context;
  callArguments.context = {
    ...(isRecord(rawContext) ? rawContext : {}),
    runtimeId: context.runtimeId,
    sessionId: context.sessionId,
    dryRun: false,
    guard: { allowed: true, reason: "agentCore live chat local shell smoke" },
    requestedScopes: ["shell:execute"],
    allowedScopes: ["shell:execute"],
  };

  if (typeof callArguments.timeoutMs !== "number") {
    callArguments.timeoutMs = 10_000;
  }

  return { tool: toolCall.tool, arguments: callArguments };
}

function tryParseToolCall(text: string, context: RuntimeContext): LiveToolCall | undefined {
  try {
    return normalizeToolCall(parseJsonObject(text), context);
  } catch {
    return undefined;
  }
}

function normalizeFallbackToolId(raw: string): string {
  return raw.trim().replace(/^tool:/u, "");
}

function inferPathFromText(text: string): string | undefined {
  return /(?:[\w.-]+\/)+[\w.-]+(?:\.[\w.-]+)?/u.exec(text)?.[0];
}

function firstNonBlankString(...values: readonly unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function normalizeFallbackToolArguments(toolId: string, argsValue: unknown, userText = ""): Readonly<Record<string, unknown>> {
  const argsRecord = isRecord(argsValue) ? { ...argsValue } : {};
  const context = isRecord(argsRecord.context) ? { ...argsRecord.context } : {};
  context.dryRun = false;
  context.guard = { allowed: true, accepted: true, reason: "agentCore realtest chat text fallback" };
  context.grantedPermissions = ["filesystem:read", "git:read", "tool.execute"];
  argsRecord.context = context;
  if (toolId === "code.read") {
    const targetPath = firstNonBlankString(argsRecord.targetPath, argsRecord.path, argsRecord.file, inferPathFromText(userText));
    if (targetPath !== undefined) {
      argsRecord.targetPath = targetPath;
    }
  }
  if (toolId === "code.scan") {
    const directoryPath = firstNonBlankString(argsRecord.directoryPath, argsRecord.path, inferPathFromText(userText)?.split("/").slice(0, -1).join("/"));
    if (directoryPath !== undefined) {
      argsRecord.directoryPath = directoryPath;
    }
  }
  if (toolId === "git.getRepositoryStatus") {
    const target = isRecord(argsRecord.target) ? { ...argsRecord.target } : {};
    target.repositoryPath ??= architectureRoot;
    argsRecord.target = target;
    const context = isRecord(argsRecord.context) ? { ...argsRecord.context } : {};
    context.grantedPermissions ??= ["git:read", "filesystem:read"];
    argsRecord.context = context;
  }
  return argsRecord;
}

function parseFallbackToolCalls(text: string, mountedToolIds: readonly string[], userText = ""): readonly FallbackToolCall[] {
  const mounted = new Set(mountedToolIds);
  const calls: FallbackToolCall[] = [];
  const tagPattern = /<tool_call([^>]*)>([\s\S]*?)<\/tool_call>|<tool_call([^>]*?)\/>/giu;
  for (const match of text.matchAll(tagPattern)) {
    const attrs = match[1] ?? match[3] ?? "";
    const inner = match[2] ?? "";
    const toolMatch = /\b(?:name|tool)=["']([^"']+)["']/iu.exec(attrs);
    const argsMatch = /\barguments=(["'])([\s\S]*?)\1/iu.exec(attrs);
    const toolId = normalizeFallbackToolId(toolMatch?.[1] ?? "");
    if (!mounted.has(toolId)) continue;
    let parsedArgs: unknown = {};
    try {
      parsedArgs = JSON.parse(argsMatch?.[2] ?? "{}") as unknown;
    } catch {
      parsedArgs = {};
    }
    if (argsMatch === null && inner.trim().length > 0) {
      const pathMatch = /<path>([\s\S]*?)<\/path>/iu.exec(inner);
      const fileMatch = /<file>([\s\S]*?)<\/file>/iu.exec(inner);
      parsedArgs = {
        path: (pathMatch?.[1] ?? fileMatch?.[1] ?? "").trim(),
      };
    }
    calls.push({ toolId, arguments: normalizeFallbackToolArguments(toolId, parsedArgs, userText) });
  }

  const namespacedTagPattern = /<tool:([\w.-]+)>([\s\S]*?)<\/tool:\1>/giu;
  for (const match of text.matchAll(namespacedTagPattern)) {
    const toolId = normalizeFallbackToolId(match[1] ?? "");
    if (!mounted.has(toolId)) continue;
    let parsedArgs: unknown = {};
    try {
      parsedArgs = JSON.parse((match[2] ?? "{}").trim()) as unknown;
    } catch {
      parsedArgs = {};
    }
    calls.push({ toolId, arguments: normalizeFallbackToolArguments(toolId, parsedArgs, userText) });
  }

  const requestTagPattern = /<tool_request([^>]*)>([\s\S]*?)<\/tool_request>/giu;
  for (const match of text.matchAll(requestTagPattern)) {
    const attrs = match[1] ?? "";
    const inner = match[2] ?? "";
    const toolMatch = /\b(?:name|tool)=["']([^"']+)["']/iu.exec(attrs);
    const toolId = normalizeFallbackToolId(toolMatch?.[1] ?? "");
    if (!mounted.has(toolId)) continue;
    const argsText = /<arguments>([\s\S]*?)<\/arguments>/iu.exec(inner)?.[1] ?? "{}";
    let parsedArgs: unknown = {};
    try {
      parsedArgs = JSON.parse(argsText.trim()) as unknown;
    } catch {
      parsedArgs = {};
    }
    calls.push({ toolId, arguments: normalizeFallbackToolArguments(toolId, parsedArgs, userText) });
  }

  try {
    const parsed = parseJsonObject(text);
    if (isRecord(parsed) && Array.isArray(parsed.tool_calls)) {
      for (const item of parsed.tool_calls) {
        if (!isRecord(item)) continue;
        const toolId = normalizeFallbackToolId(String(item.tool ?? item.name ?? item.toolId ?? ""));
        if (!mounted.has(toolId)) continue;
        calls.push({ toolId, arguments: normalizeFallbackToolArguments(toolId, item.arguments ?? {}, userText) });
      }
    }
  } catch {
    // Text answers that are not JSON may still contain XML-ish tool_call tags.
  }

  const seen = new Set<string>();
  return calls.filter((call) => {
    const key = `${call.toolId}:${JSON.stringify(call.arguments)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function inferFallbackToolCallsFromUserText(userText: string, mountedToolIds: readonly string[]): readonly FallbackToolCall[] {
  const mounted = new Set(mountedToolIds);
  const inferredPath = inferPathFromText(userText);
  if (inferredPath !== undefined && mounted.has("code.read")) {
    return [{
      toolId: "code.read",
      arguments: normalizeFallbackToolArguments("code.read", { targetPath: inferredPath }, userText),
    }];
  }
  return [];
}

async function invokeFallbackTool(
  compiled: CompiledChatAgent,
  toolCall: FallbackToolCall,
  sessionId: string,
) {
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: `runtime.agentcore.chat.${compiled.manifest.identity.id}`,
    sessionId,
    policy: {
      workspaceRoot: architectureRoot,
      allowedRoots: [architectureRoot],
      allowGitExecution: true,
      allowRipgrep: true,
      allowShellExecution: false,
      allowFilesystemWrite: false,
      allowFilesystemDelete: false,
    },
    sandbox: {
      providerFamily: compiled.manifest.sandbox.providerFamily,
      profile: compiled.manifest.sandbox.profile,
      isolationLevel: compiled.manifest.sandbox.isolationLevel,
      ready: true,
      probe: { status: "available" },
    },
  });

  return await invokeMountedBaseTool({
    runtimeId: `runtime.agentcore.chat.${compiled.manifest.identity.id}`,
    sessionId,
    toolId: toolCall.toolId,
    toolCallId: `${sessionId}:fallback:${toolCall.toolId}:${Date.now()}`,
    input: toolCall.arguments,
    executor,
    runtimeReady: true,
    governance: { accepted: true },
    contract: { accepted: true },
    allowedScopes: [
      "agent.invoke",
      "promptPack.define",
      "tool.execute",
      `tool.${toolCall.toolId}`,
      toolCall.toolId,
      "code.read",
      "git:read",
      "filesystem:read",
    ],
    metadata: {
      mountedVia: "agentcore_chat.textToolFallback",
      realtestAgent: compiled.manifest.identity.id,
    },
  });
}

function truncateForPrompt(value: unknown, maxChars = 6_000): string {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n...<truncated>` : text;
}

function renderPrompt(history: readonly ChatMessage[], userText: string): string {
  const recentHistory = history.slice(-8);
  const transcript = recentHistory
    .map((message) => `${message.role === "user" ? "用户" : "agentCore"}: ${message.content}`)
    .join("\n");

  return [
    "你是一个临时 Praxis agentCore 对话体。",
    "你正在通过 agentCore 的 runtime / promptPack / modelAdapter 链路被调用。",
    "本交互环境已经提供可调用的 shell baseTools；当用户要求你执行、查看、列目录、读状态、监控、进程/session/resource 管理时，不要说没有 shell 工具。",
    `可用工具：${shellLiveToolIds.join(", ")}`,
    "用户问你可以使用什么工具时，直接列出这些工具和用途，不要调用工具。",
    "需要调用工具时，必须只返回 JSON，不要解释：",
    "{\"tool_calls\":[{\"tool\":\"shell.commandExecution\",\"arguments\":{\"command\":\"pwd\",\"args\":[],\"cwd\":\"/home/proview/Desktop/Praxis_series/Praxis_org\",\"timeoutMs\":10000}}]}",
    "如果用户指定某个 shell.* 工具但没有给完整参数，可以按内置测试样例生成无害参数。",
    "安全规则：真实本机命令只允许无害读取类命令；process/session/resource/background/detached/interactive 类能力由 runtime-owned fake executor 模拟，不直接操作真实危险资源。",
    "如果不需要工具，就正常回答。",
    "请用简体中文回答，保持简洁、清楚、可执行。",
    transcript.length > 0 ? `\n已有对话：\n${transcript}` : "",
    `\n当前用户输入：\n${userText}`,
  ]
    .filter((part) => part.length > 0)
    .join("\n");
}

async function callResponsesApi(prompt: string, instructions = "你是 Praxis agentCore 的交互测试对话体。请用简体中文回答，保持简洁、清楚、可执行。"): Promise<string> {
  const credentialRef = createCredentialRef({
    id: "agentcore-chat-chatgpt-codex",
    provider: "openai",
    credentialType: "chatgpt_codex_oauth",
    source: { kind: "codex-auth-file", filePath: codexAuthPath },
  });
  if (!credentialRef.ok) {
    throw new Error(JSON.stringify(credentialRef.error));
  }

  const auth = resolveAuthEnvelope({
    credentialRef: credentialRef.credentialRef,
    readFile: (filePath) => readFileSync(filePath, "utf8"),
  });
  if (!auth.ok) {
    throw new Error(JSON.stringify(auth.error));
  }

  const carrier = createChatGPTCodexResponsesCarrier({
    carrierId: "chatgpt-codex.responses.agentcore-chat",
    model,
    reasoning: { effort: reasoningEffort },
    credentialRef: credentialRef.credentialRef,
    clientName: "praxis-agentcore-chat",
    clientVersion: chatgptCodexClientVersion,
  });
  if (!carrier.ok) {
    throw new Error(JSON.stringify(carrier.error));
  }

  const caller = createProviderCaller({
    transport: fetchProviderTransport,
    authMaterial: auth.resolved.privateMaterial,
    timeoutMs: 60_000,
  });

  const result = await invokeChatGPTCodexResponses({
    operation: "create",
    baseUrl: carrier.carrier.baseURL,
    auth: auth.resolved.envelope,
    runtime: {
      runtimeId: "agentcore-chat-runtime",
      invocationId: `agentcore-chat-${Date.now()}`,
      callerId: "agentcore-chat",
    },
    governance: { accepted: true },
    dryRun: false,
    caller,
    headers: { "content-type": "application/json" },
    clientName: "praxis-agentcore-chat",
    clientVersion: chatgptCodexClientVersion,
    expectResponseObject: false,
    body: {
      model,
      instructions,
      input: prompt,
      reasoning: { effort: reasoningEffort },
      max_output_tokens: maxOutputTokens,
    },
  });

  if (!result.ok) {
    throw new Error(JSON.stringify(result.error));
  }

  return extractResponseText(result.response.raw);
}

async function invokeRegistryShellTool(context: RuntimeContext, toolCall: LiveToolCall) {
  const calls: string[] = [];
  return await invokeShellToolThroughRuntimeChain(context, toolCall, createFullShellExecutor(architectureRoot, calls), calls);
}

function createTemporaryRuntime(): RuntimeContext {
  const runtimeResult = assertOk(
    "runtime.factory",
    createAgentRuntime({
      source: { kind: "configuration", name: "temporary-chat-agent", version: "0.0.0-chat" },
      applicationId: "agentcore-chat-app",
      requestedSurfaces: [
        "runtime.applicationSurface",
        "runtime.contractSurface",
        "runtime.governancePlane",
        "runtime.invocationMethod",
        "runtime.execEngine",
        "runtime.modelAdapter",
      ],
    }),
  );

  const mountResult = assertOk(
    "application.mount",
    mountAgentApplication({
      applicationId: runtimeResult.runtime.applicationId,
      runtimeId: runtimeResult.runtime.runtimeId,
      runtimeReady: runtimeResult.runtime.readiness === "ready",
      requestedCapabilities: ["agent.invoke", "model.invoke", "prompt.pack"],
      eventSubscriptions: ["runtime.*", "agent.*", "model.*"],
    }),
  );

  const applicationRuntime = assertOk(
    "application.runtime",
    createAgentApplicationRuntime({
      runtime: runtimeResult.runtime,
      mount: mountResult.record,
      operation: "invoke",
    }),
  );

  assertOk("runtime.client", createAgentRuntimeClient({ surface: applicationRuntime.surface }));

  return {
    runtimeId: runtimeResult.runtime.runtimeId,
    applicationId: runtimeResult.runtime.applicationId,
    sessionId: runtimeResult.runtime.sessions[0]?.sessionId ?? "temporary-chat-session",
  };
}

async function invokeAgentCoreTurn(context: RuntimeContext, history: readonly ChatMessage[], userText: string): Promise<string> {
  const invocationId = `${context.runtimeId}:chat:${Date.now()}`;
  const agentEntrypoint = assertOk(
    "agent.invocation.entrypoint",
    createAgentInvocationEntrypoint({
      runtimeId: context.runtimeId,
      agentId: "temporary-chat-agent",
      source: "application",
      input: { text: userText },
      runtimeReady: true,
      requestedScopes: ["agent.invoke", "model.invoke", "prompt.pack"],
      allowedScopes: ["agent.invoke", "model.invoke", "prompt.pack"],
      trace: { correlationId: invocationId, callerId: context.applicationId, sessionId: context.sessionId },
    }),
  );

  const promptText = renderPrompt(history, userText);
  const promptPack = assertOk(
    "promptPack.provider",
    providePromptPackInput({
      runtimeId: context.runtimeId,
      sessionId: context.sessionId,
      invocationId: agentEntrypoint.plan.envelope.envelopeId,
      materials: [
        {
          id: `${invocationId}:system`,
          kind: "system",
          content: "你是一个临时 Praxis agentCore 对话体，回答要简洁、清楚、可执行。",
          source: { kind: "runtime", trusted: true },
          priority: 100,
        },
        {
          id: `${invocationId}:user`,
          kind: "user",
          content: promptText,
          source: { kind: "application", ref: context.applicationId, trusted: true },
          priority: 90,
        },
      ],
      budget: { maxEstimatedTokens: 4096, reservedForLowering: 256, maxMaterials: 8 },
      requestedScopes: ["prompt.pack"],
      allowedScopes: ["prompt.pack"],
    }),
  );

  const promptPackBinding = assertOk(
    "runtime.execEngine.bindPromptPack",
    bindPromptPack({
      runtimeId: context.runtimeId,
      caller: { kind: "application", id: context.applicationId, sessionId: context.sessionId },
      promptPack: {
        id: `${context.runtimeId}:promptPack:${context.sessionId}:${Date.now()}`,
        source: "application",
        layers: promptPack.pack.materials.map((material) => ({ kind: material.kind, ref: material.id })),
      },
    }),
  );

  const lowered = assertOk(
    "runtime.modelAdapter.promptLowering",
    lowerPromptForModelAdapter({
      runtimeId: context.runtimeId,
      caller: { kind: "application", id: context.applicationId, sessionId: context.sessionId },
      promptPack: {
        id: promptPackBinding.binding.promptPackId,
        materials: promptPack.pack.materials.map((material) => ({
          kind: material.kind,
          ref: material.id,
          text: material.content,
          priority: material.priority,
        })),
      },
      target: {
        capabilityId: "model.invoke.chat",
        carrierId: "openai.responses",
        outputMode: "single",
      },
    }),
  );

  const modelEntrypoint = assertOk(
    "model.invocation.entrypoint",
    openModelInvocationEntrypoint({
      runtimeId: context.runtimeId,
      modelCapabilityId: lowered.loweredPrompt.target.capabilityId,
      input: { kind: "prompt-pack-ref", value: lowered.loweredPrompt.promptPackId },
      runtimeReady: true,
    }),
  );

  const modelPlan = assertOk(
    "runtime.modelAdapter.modelInvocation",
    planModelInvocation({
      runtimeId: context.runtimeId,
      caller: { kind: "application", id: context.applicationId, sessionId: context.sessionId },
      loweredPrompt: {
        loweringId: lowered.loweredPrompt.loweringId,
        promptPackId: lowered.loweredPrompt.promptPackId,
        materialRefs: lowered.loweredPrompt.materialRefs,
      },
      capability: { capabilityId: lowered.loweredPrompt.target.capabilityId, kind: "chat" },
      carrier: { carrierId: lowered.loweredPrompt.target.carrierId ?? "openai.responses", provider: "openai" },
      mode: "single",
    }),
  );

  const firstAnswer = await callResponsesApi(promptText);
  const toolCall = tryParseToolCall(firstAnswer, context);
  let answer = firstAnswer;

  if (toolCall !== undefined) {
    const toolResult = await invokeRegistryShellTool(context, toolCall);
    const summarizationPrompt = [
      "你刚才请求了 Praxis shell baseTool，agentCore 已经通过 registry handler 执行完成。",
      "请根据工具结果，用简体中文给用户一个简洁结论。必须包含关键 stdout/stderr/exitCode；如果失败，说明 public-safe 错误。",
      `\n用户原始输入：\n${userText}`,
      `\n工具调用：\n${truncateForPrompt(toolCall)}`,
      `\n工具结果：\n${truncateForPrompt(toolResult)}`,
    ].join("\n");
    answer = await callResponsesApi(
      summarizationPrompt,
      "你是 Praxis agentCore 的工具结果解释器。不要声称无法调用工具，因为工具已经执行。请只解释结果。",
    );
  }

  assertOk(
    "invocation.result.surface",
    createInvocationResultSurface({
      invocationId: modelPlan.plan.invocationId,
      method: "model",
      routeId: modelEntrypoint.envelope.routeId,
      status: "completed",
      output: { text: answer },
      events: ["agentcore.chat.live.completed"],
    }),
  );

  if (verbose) {
    console.error(
      JSON.stringify(
        {
          envelopeId: agentEntrypoint.plan.envelope.envelopeId,
          promptPackId: lowered.loweredPrompt.promptPackId,
          loweringId: lowered.loweredPrompt.loweringId,
          modelInvocationId: modelPlan.plan.invocationId,
          model,
          reasoningEffort,
          modelProfile,
          auth: "codex-cli-chatgpt",
          toolCalled: toolCall?.tool,
        },
        null,
        2,
      ),
    );
  }

  return answer;
}

function printBanner(context: RuntimeContext): void {
  console.log("temporary agentCore chat is ready");
  console.log(`runtimeId=${context.runtimeId}`);
  console.log(`model=${model}`);
  console.log(`reasoning.effort=${reasoningEffort}`);
  console.log(`profile=${modelProfile}`);
  console.log("auth=Codex CLI ChatGPT login");
  console.log(`tools=${shellLiveToolIds.length} shell.* baseTools`);
  console.log("commands: /exit, /quit, /status, /clear");
  console.log("");
}

async function runChat(): Promise<void> {
  const context = createTemporaryRuntime();
  const history: ChatMessage[] = [];
  printBanner(context);

  const rl = readline.createInterface({ input, output });
  output.write("you> ");

  try {
    for await (const line of rl) {
      const userText = line.trim();
      if (userText.length === 0) {
        output.write("you> ");
        continue;
      }

      if (userText === "/exit" || userText === "/quit") {
        break;
      }

      if (userText === "/status") {
        console.log(JSON.stringify({
          ...context,
          model,
          reasoningEffort,
          modelProfile,
        auth: "codex-cli-chatgpt",
        codexAuthPath,
        tools: shellLiveToolIds,
        samplePrompts: shellLiveToolCases.slice(0, 5).map((testCase) => testCase.userPrompt),
        workspaceRoot: architectureRoot,
          turns: history.length / 2,
        }, null, 2));
        output.write("you> ");
        continue;
      }

      if (userText === "/clear") {
        history.length = 0;
        console.log("history cleared");
        output.write("you> ");
        continue;
      }

      try {
        const answer = await invokeAgentCoreTurn(context, history, userText);
        history.push({ role: "user", content: userText }, { role: "assistant", content: answer });
        console.log(`agentCore> ${answer}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`agentCore error> ${message}`);
      }

      output.write("you> ");
    }
  } finally {
    rl.close();
  }
}

function renderRealtestTask(history: readonly ChatMessage[], userText: string): string {
  const transcript = history.slice(-8)
    .map((message) => `${message.role === "user" ? "用户" : "agent"}: ${message.content}`)
    .join("\n");
  return [
    "这是 Praxis realtest 最小交互对话。请保持简洁、直接、可执行。",
    "如果需要工具，只能通过当前 AgentManifest 声明的 runtime/baseTool 链路。",
    transcript.length > 0 ? `已有对话：\n${transcript}` : "",
    `当前用户输入：\n${userText}`,
  ].filter((part) => part.length > 0).join("\n\n");
}

function printRealtestBanner(target: string, compiled: CompiledChatAgent, provider: RealtestLiveProvider): void {
  console.log("Praxis realtest chat is ready");
  console.log(`target=${target}`);
  console.log(`agent=${compiled.manifest.identity.id}`);
  console.log(`model=${compiled.manifest.model.model}`);
  console.log(`auth=${provider.authSource}`);
  console.log(`entry=${compiled.agentPath}`);
  console.log(`providerTools=${exposeProviderTools ? "enabled" : "disabled"}`);
  console.log("commands: /exit, /quit, /status, /clear");
  console.log("");
}

async function runRealtestChat(target: string): Promise<void> {
  const compiled = await compileRealtestAgent(target);
  const provider = createRealtestLiveProvider(compiled.manifest);
  const runtime = praxis.runtime.createPraxisRuntimeKernel({
    runtimeId: `runtime.agentcore.chat.${compiled.manifest.identity.id}`,
    store: praxis.runtime.createInMemorySessionStateEventStore(),
  });
  const history: ChatMessage[] = [];
  printRealtestBanner(target, compiled, provider);

  const rl = readline.createInterface({ input, output });
  output.write(`${path.basename(target)}> `);

  try {
    for await (const line of rl) {
      const userText = line.trim();
      if (userText.length === 0) {
        output.write(`${path.basename(target)}> `);
        continue;
      }
      if (userText === "/exit" || userText === "/quit") {
        break;
      }
      if (userText === "/clear") {
        history.length = 0;
        console.log("history cleared");
        output.write(`${path.basename(target)}> `);
        continue;
      }
      if (userText === "/status") {
        console.log(JSON.stringify({
          target,
          agent: compiled.manifest.identity.id,
          model: compiled.manifest.model.model,
          promptPack: compiled.manifest.promptPack.promptPackId,
          tools: compiled.manifest.harness.tools.map((tool) => tool.toolId),
          providerTools: exposeProviderTools,
          auth: provider.authSource,
          turns: history.length / 2,
        }, null, 2));
        output.write(`${path.basename(target)}> `);
        continue;
      }

      const result = await runtime.runManifest(compiled.manifest, renderRealtestTask(history, userText), {
        dryRun: false,
        allowProviderCall: true,
        allowToolExecution: true,
        auth: provider.auth,
        providerCaller: provider.providerCaller,
        storage: { cwd: architectureRoot, initMode: "on-run" },
        sandbox: { cwd: architectureRoot, failOnUnavailable: false },
        exposeProviderTools,
      });

      if (result.ok) {
        let finalOutput = result.finalOutput;
        const mountedToolIds = compiled.manifest.harness.tools.map((tool) => tool.toolId);
        const parsedFallbackToolCalls = parseFallbackToolCalls(
          result.finalOutput,
          mountedToolIds,
          userText,
        );
        const fallbackToolCalls = parsedFallbackToolCalls.length > 0
          ? parsedFallbackToolCalls
          : inferFallbackToolCallsFromUserText(userText, mountedToolIds);
        if (fallbackToolCalls.length > 0) {
          const toolResults = [];
          for (const toolCall of fallbackToolCalls.slice(0, compiled.manifest.harness.loop.maxToolCalls ?? 4)) {
            toolResults.push({
              toolCall,
              result: await invokeFallbackTool(compiled, toolCall, result.sessionId),
            });
          }
          if (verbose) {
            console.error(JSON.stringify({ fallbackToolCalls, toolResults }, null, 2));
          }
          const summaryResult = await runtime.runManifest(compiled.manifest, [
            "你刚才请求了 Praxis baseTool。agentCore 已通过 text JSON tool fallback 执行了这些工具。",
            "请根据工具结果直接回答用户。不要再输出 tool_call 标签。",
            `用户原始输入：\n${userText}`,
            `工具结果：\n${truncateForPrompt(toolResults, 12000)}`,
          ].join("\n\n"), {
            dryRun: false,
            allowProviderCall: true,
            allowToolExecution: false,
            auth: provider.auth,
            providerCaller: provider.providerCaller,
            storage: { cwd: architectureRoot, initMode: "on-run" },
            sandbox: { cwd: architectureRoot, failOnUnavailable: false },
            exposeProviderTools: false,
          });
          finalOutput = summaryResult.ok
            ? summaryResult.finalOutput
            : `工具已执行，但总结失败：${summaryResult.error.message}`;
        }
        history.push({ role: "user", content: userText }, { role: "assistant", content: finalOutput });
        console.log(`agent> ${finalOutput}`);
      } else {
        console.error(`agent error> ${result.error.code}: ${result.error.message}`);
        if (verbose) {
          console.error(JSON.stringify({
            error: result.error,
            mainLoopSteps: result.mainLoopSteps,
            stateErrors: result.state?.errors,
            invocations: result.state?.invocations,
            events: result.events,
          }, null, 2));
        }
      }
      if (verbose) {
        console.error(JSON.stringify({
          sessionId: result.sessionId,
          modelCalls: result.ok ? result.modelCalls.length : 0,
          toolCalls: result.ok ? result.toolCalls.length : 0,
          toolCallRecords: result.ok ? result.toolCalls : undefined,
          events: result.events.length,
        }, null, 2));
      }
      output.write(`${path.basename(target)}> `);
    }
  } finally {
    rl.close();
  }
}

const agentTarget = resolveAgentTarget();

(agentTarget === undefined ? runChat() : runRealtestChat(agentTarget)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`agentCore fatal> ${message}`);
  process.exitCode = 1;
});
