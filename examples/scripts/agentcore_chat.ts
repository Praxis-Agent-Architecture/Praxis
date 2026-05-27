import { readFile, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createRaxModelClient,
  openAIProvider,
  type RaxAuthRef,
  type RaxModelClient,
} from "../../src/modelAdapter/index.js";
import { callModelAdapterPrompt } from "./modelAdapterPromptClient.js";
import {
  createFullShellExecutor,
  invokeShellToolThroughRuntimeChain,
  normalizeShellLiveToolCall,
  shellLiveToolCases,
  shellLiveToolIds,
} from "./shellFullCapabilities.js";
import { providePromptPackInput } from "../../src/executionEngine/promptPack/promptProvider.js";
import { mountAgentApplication } from "../../src/runtimeImplementation/runtime.applicationSurface/agentApplicationMount.js";
import { createAgentApplicationRuntime } from "../../src/runtimeImplementation/runtime.applicationSurface/agentApplicationRuntime.js";
import { createAgentRuntimeClient } from "../../src/runtimeImplementation/runtime.applicationSurface/agentRuntimeClient.js";
import { createAgentRuntime } from "../../src/runtimeImplementation/runtime.applicationSurface/agentRuntimeFactory.js";
import { bindPromptPack } from "../../src/runtimeImplementation/runtime.execEngine/bindPromptPack.js";
import { createAgentInvocationEntrypoint } from "../../src/runtimeImplementation/runtime.invocationMethod/agentInvocationEntrypoint.js";
import { createInvocationResultSurface } from "../../src/runtimeImplementation/runtime.invocationMethod/invocationResultSurface.js";
import { openModelInvocationEntrypoint } from "../../src/runtimeImplementation/runtime.invocationMethod/modelInvocationEntrypoint.js";
import { planModelInvocation } from "../../src/runtimeImplementation/runtime.modelAdapter/modelInvocationRuntime.js";
import { lowerPromptForModelAdapter } from "../../src/runtimeImplementation/runtime.modelAdapter/promptLoweringRuntime.js";
import { createRuntimeBaseToolExecutorPort } from "../../src/runtimeImplementation/runtime.execEngine/baseToolExecutorPortFactory.js";
import { invokeMountedBaseTool } from "../../src/runtimeImplementation/runtime.execEngine/baseToolRuntimeMount.js";
import { decideTextToolFallback } from "../../src/runtimeImplementation/runtime.execEngine/textFallbackPolicy.js";
import { praxis, type AgentManifest, type RuntimeApprovalResolver } from "../../src/agentCore/index.js";

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
const autoApprovePublicSafe = args.has("--auto-approve-public-safe");
const oneShot = args.has("--one-shot");
const scriptPath = fileURLToPath(import.meta.url);
const architectureRoot = path.resolve(path.dirname(scriptPath), "../..");
const model = process.env.AGENTCORE_CODEX_MODEL ?? process.env.OPENAI_SMOKE_MODEL ?? "gpt-5.5";
const maxOutputTokens = Number(process.env.OPENAI_AGENTCORE_MAX_OUTPUT_TOKENS ?? "768");
const reasoningEffort =
  process.env.AGENTCORE_CODEX_REASONING_EFFORT ??
  process.env.OPENAI_AGENTCORE_REASONING_EFFORT ??
  process.env.OPENAI_REASONING_EFFORT ??
  "low";
const modelProfile = `${model}-${reasoningEffort}`;
const execFileAsync = promisify(execFile);
const managedTerminalWaitMs = Number(process.env.AGENTCORE_CHAT_TERMINAL_WAIT_MS ?? "240000");

type RaxProjectDescriptor = {
  entry?: string;
  export?: string;
};

type CompiledChatAgent = {
  manifest: AgentManifest;
  agentPath: string;
  projectRoot?: string;
};

type ExampleLiveProvider = {
  auth: RaxAuthRef;
  modelClient: RaxModelClient;
  authSource: string;
};

function argValue(name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index < 0) return undefined;
  return argv[index + 1];
}

function resolveAgentTarget(): string | undefined {
  const explicit = argValue("--agent") ?? argValue("--project") ?? argValue("--example");
  if (explicit !== undefined && explicit.trim().length > 0) {
    return explicit.trim();
  }

  const positional = argv.find((value) => !value.startsWith("-"));
  if (positional === "minimal" || positional === "fullstack") {
    return `examples/`;
  }
  return undefined;
}

function exampleAgentOptions(): Readonly<Record<string, unknown>> {
  return {
    mode: args.has("--deep") || args.has("--all-testable") ? "deep" : "quick",
    policyProfile: argValue("--policy") ?? (args.has("--all-testable") ? "permissive" : "standard"),
    sandboxProfile: argValue("--sandbox") ?? "hostObserved",
    persistence: args.has("--sqlite") ? "sqlite" : "memory",
    includeShell: args.has("--shell") || args.has("--all-testable"),
    includeSkillAuthoring: args.has("--skill-authoring") || args.has("--all-testable"),
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
  const normalized = inputPath === "minimal" || inputPath === "fullstack" ? `examples/` : inputPath;
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

async function compileExampleAgent(target: string): Promise<CompiledChatAgent> {
  const entry = await resolveAgentEntry(target);
  const module = await import(pathToFileURL(entry.agentPath).href) as Record<string, unknown>;
  const candidate = entry.exportName !== undefined && entry.exportName.trim().length > 0
    ? module[entry.exportName]
    : module.default;
  const agentInput = entry.projectRoot?.endsWith(path.join("examples", "fullstack")) === true && typeof candidate === "function"
    ? new (candidate as new (options: Readonly<Record<string, unknown>>) => unknown)(exampleAgentOptions())
    : candidate;
  const compiled = praxis.compileAgent(agentInput as never);
  if (!compiled.ok) {
    throw new Error(`compile ${target} failed: ${compiled.error.message}`);
  }
  return { manifest: compiled.manifest, agentPath: entry.agentPath, projectRoot: entry.projectRoot };
}

function createExampleLiveProvider(manifest: AgentManifest): ExampleLiveProvider {
  const baseRoute = openAIProvider.routes[0];
  if (baseRoute === undefined) {
    throw new Error("openAIProvider has no routes");
  }
  const modelClient = createRaxModelClient([
    { ...baseRoute, id: manifest.model.carrierId, providerId: manifest.model.provider },
    baseRoute,
  ]);

  return {
    auth: { type: "api_key", env: process.env.AGENTCORE_MODEL_API_KEY_ENV ?? "OPENAI_API_KEY" },
    modelClient,
    authSource: process.env.AGENTCORE_MODEL_API_KEY_ENV ?? "OPENAI_API_KEY",
  };
}

function assertOk<T extends { ok: boolean }>(label: string, result: T): Extract<T, { ok: true }> {
  if (result.ok) {
    return result as Extract<T, { ok: true }>;
  }

  throw new Error(`${label} failed: ${JSON.stringify(result)}`);
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
  context.guard = { allowed: true, accepted: true, reason: "agentCore example chat text fallback" };
  context.grantedPermissions = ["filesystem:read", "git:read", "tool.execute"];
  argsRecord.context = context;
  if (toolId === "file.read") {
    const path = firstNonBlankString(argsRecord.path, argsRecord.targetPath, argsRecord.file, inferPathFromText(userText));
    if (path !== undefined) {
      argsRecord.path = path;
    }
  }
  if (toolId === "file.search") {
    const query = firstNonBlankString(argsRecord.query, argsRecord.pattern, argsRecord.q);
    if (query !== undefined) {
      argsRecord.query = query;
    }
    const cwd = firstNonBlankString(argsRecord.cwd, argsRecord.directoryPath, argsRecord.path, inferPathFromText(userText)?.split("/").slice(0, -1).join("/"));
    if (cwd !== undefined) {
      argsRecord.cwd = cwd;
    }
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
  if (inferredPath !== undefined && mounted.has("file.read")) {
    return [{
      toolId: "file.read",
      arguments: normalizeFallbackToolArguments("file.read", { path: inferredPath }, userText),
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
      "file.read",
      "git:read",
      "filesystem:read",
    ],
    metadata: {
      mountedVia: "agentcore_chat.textToolFallback",
      exampleAgent: compiled.manifest.identity.id,
    },
  });
}

function truncateForPrompt(value: unknown, maxChars = 6_000): string {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n...<truncated>` : text;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractManagedTmuxSessions(value: unknown): readonly string[] {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text === undefined) return [];

  const sessions = new Set<string>();
  const patterns = [
    /\btmux:([A-Za-z0-9_.:@-]+)/gu,
    /\btmuxSession["']?\s*[:=]\s*["']([A-Za-z0-9_.:@-]+)["']/gu,
    /\bsession["']?\s*[:=]\s*["']([A-Za-z0-9_.:@-]+)["']/gu,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const session = match[1]?.trim();
      if (session !== undefined && session.length > 0) {
        sessions.add(session);
      }
    }
  }

  return [...sessions];
}

async function captureTmuxPane(session: string): Promise<string | undefined> {
  try {
    await execFileAsync("tmux", ["has-session", "-t", session], { timeout: 5_000 });
    const { stdout } = await execFileAsync("tmux", ["capture-pane", "-t", session, "-p", "-S", "-500"], {
      timeout: 5_000,
      maxBuffer: 2_000_000,
    });
    return stdout;
  } catch {
    return undefined;
  }
}

function managedTerminalLooksBusy(capture: string): boolean {
  const tail = capture.split(/\r?\n/u).slice(-80).join("\n");
  return /(?:^|\n)\s*[◦•]\s*(?:Working|Searching the web)\b/u.test(tail)
    || /\bWorking \(\d+s\b/u.test(tail)
    || /\besc to interrupt\b/u.test(tail);
}

function managedTerminalLooksSettled(capture: string): boolean {
  const tail = capture.split(/\r?\n/u).slice(-80).join("\n");
  return /(?:^|\n)\s*›\s+(?:Use \/skills|Find and fix|$)/u.test(tail)
    || /(?:^|\n)\s*─ Worked for\b/u.test(tail);
}

type ManagedTerminalObservation = {
  session: string;
  capture: string;
  busy: boolean;
  settled: boolean;
};

async function waitForManagedTerminals(
  sessions: readonly string[],
): Promise<{ waited: boolean; observations: readonly ManagedTerminalObservation[] }> {
  const uniqueSessions = [...new Set(sessions)].filter((session) => session.length > 0);
  if (uniqueSessions.length === 0 || managedTerminalWaitMs <= 0) {
    return { waited: false, observations: [] };
  }

  const deadline = Date.now() + managedTerminalWaitMs;
  let waited = false;
  let observations: ManagedTerminalObservation[] = [];

  while (true) {
    observations = [];
    for (const session of uniqueSessions) {
      const capture = await captureTmuxPane(session);
      if (capture === undefined) continue;
      observations.push({
        session,
        capture,
        busy: managedTerminalLooksBusy(capture),
        settled: managedTerminalLooksSettled(capture),
      });
    }

    const busy = observations.some((observation) => observation.busy && !observation.settled);
    if (!busy || Date.now() >= deadline) {
      return { waited, observations };
    }

    if (!waited) {
      console.error(`terminal-watch> waiting for managed terminal(s): ${uniqueSessions.join(", ")}`);
    }
    waited = true;
    await sleep(10_000);
  }
}

async function summarizeManagedTerminalFollowup(
  compiled: CompiledChatAgent,
  runtime: ReturnType<typeof praxis.runtime.createPraxisRuntimeKernel>,
  provider: ExampleLiveProvider,
  userText: string,
  priorFinalOutput: string,
  observations: readonly ManagedTerminalObservation[],
): Promise<string> {
  const summaryResult = await runtime.runManifest(compiled.manifest, [
    "你刚才的 example 回合涉及一个或多个受控可视化 tmux 终端。agentCore 测试 TUI 在最终输出前额外抓取了这些终端，避免父 agent 在子 Codex 仍 Working 时提前结束。",
    "请基于下面的终端观察给用户一个直接结论：如果子 Codex 已经完成，摘出它的关键答案和证据；如果仍在运行，明确说还没完成并给 session。",
    "不要声称只要启动命令成功就算完成。",
    `用户原始输入：\n${userText}`,
    `父 agent 原始输出：\n${priorFinalOutput}`,
    `受控终端观察：\n${truncateForPrompt(observations.map((observation) => ({
      session: observation.session,
      busy: observation.busy,
      settled: observation.settled,
      tail: observation.capture.split(/\r?\n/u).slice(-140).join("\n"),
    })), 18000)}`,
  ].join("\n\n"), {
    dryRun: false,
    allowProviderCall: true,
    allowToolExecution: false,
    auth: provider.auth,
    modelClient: provider.modelClient,
    storage: { cwd: architectureRoot, initMode: "on-run" },
    sandbox: { cwd: architectureRoot, failOnUnavailable: false },
    exposeProviderTools: false,
  });

  return summaryResult.ok
    ? summaryResult.finalOutput
    : `${priorFinalOutput}\n\nterminal-watch 总结失败：${summaryResult.error.message}`;
}

async function summarizeNativeToolNoTextOutput(
  compiled: CompiledChatAgent,
  runtime: ReturnType<typeof praxis.runtime.createPraxisRuntimeKernel>,
  provider: ExampleLiveProvider,
  userText: string,
  toolCalls: readonly unknown[],
): Promise<string> {
  const summaryResult = await runtime.runManifest(compiled.manifest, [
    "上一轮 example 回合已经发生了 provider-native Praxis baseTool 调用，但模型最终没有输出可读正文。",
    "这是测试 TUI 的证据恢复路径：请只根据用户原始任务和工具调用记录总结真实完成情况。",
    "如果工具记录不足以证明任务完成，请明确说证据不足；不要补编不存在的结果。",
    "请用中文输出 pass/fail/needs-review、关键文件或命令、以及还缺什么证据。",
    `用户原始输入：\n${userText}`,
    `provider-native tool call records：\n${truncateForPrompt(toolCalls, 20000)}`,
  ].join("\n\n"), {
    dryRun: false,
    allowProviderCall: true,
    allowToolExecution: false,
    auth: provider.auth,
    modelClient: provider.modelClient,
    storage: { cwd: architectureRoot, initMode: "on-run" },
    sandbox: { cwd: architectureRoot, failOnUnavailable: false },
    exposeProviderTools: false,
  });

  return summaryResult.ok
    ? summaryResult.finalOutput
    : [
      "PraxisRuntimeKernel completed without text output.",
      "",
      `native-tool-summary failed: ${summaryResult.error.message}`,
      `native tool call count: ${toolCalls.length}`,
    ].join("\n");
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
    "{\"tool_calls\":[{\"tool\":\"shell.run\",\"arguments\":{\"command\":\"pwd\",\"cwd\":\"/workspace/project\",\"timeoutMs\":10000}}]}",
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
  return await callModelAdapterPrompt(prompt, instructions, { model, reasoningEffort, maxOutputTokens });
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
          auth: process.env.AGENTCORE_MODEL_API_KEY_ENV ?? "OPENAI_API_KEY",
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

function renderExampleTask(history: readonly ChatMessage[], userText: string): string {
  const transcript = history.slice(-8)
    .map((message) => `${message.role === "user" ? "用户" : "agent"}: ${message.content}`)
    .join("\n");
  return [
    "这是 Praxis example 最小交互对话。请保持简洁、直接、可执行。",
    "如果需要工具，只能通过当前 AgentManifest 声明的 runtime/baseTool 链路。",
    "当前 agent 若处于 bapr/yolo policy，用户已经把开发实测授权给 runtime；遇到可执行工具时直接调用工具，不要先用 praxis_request_approval 自我阻塞。",
    "重要边界：AgentManifest 中的工具表示“已声明/已挂载”，不等于当前宿主已经具备真实 provider 或依赖。",
    "当用户询问“可以正常使用的工具”时，必须区分 mounted/catalog tools 与 verified executable tools；不能把未验证的 computer、media、mcp、GUI 自动化能力说成已经正常可用。",
    "只有工具观察结果明确 ok 且没有 providerUnavailable、approvalRequired、executed:false、dry-run、prepared-only 等语义时，才可以说动作已经完成。",
    "对于打开 GUI 应用、向窗口输入、鼠标键盘模拟、摄像头/麦克风/屏幕录制等桌面动作，必须先调用对应工具并根据工具结果报告；没有真实 provider 时要报告缺口，不得声称已打开或已输入。",
    "当用户要求“可视化终端/工作焦点/输入命令”时，启动动作必须获得或记录一个可寻址的 runtime 终端目标；如果只有 GUI 终端窗口但没有 session/pty/terminal id，后续不能当作稳定输入目标。",
    "在当前 Linux runtime 中，如果还没有专门的 terminal.openManagedSession 工具，但 shell.run 和 computer.keyboard* 可用，可用 shell 创建唯一 tmux session 并启动 GUI 终端 attach 到该 session；后续用同一个 targetHint（如 tmux:<session>）输入，并用 tmux capture-pane 观察终端输出。",
    "创建受控可视化终端时只允许启动一个空 shell/交互 shell 会话，不要在创建命令里直接运行 codex、编辑器或用户后续命令；创建后必须先 capture-pane 验证该 tmux session 存在且仍在 shell prompt，再继续输入。",
    "执行用户给出的终端步骤必须严格按顺序：先确认 shell prompt，再输入 cd/目录命令并提交，再 capture 验证目录已切换，再输入 codex --yolo 并提交，再处理 Codex UI 提示，最后才向 Codex 输入问题。任何一步 capture 失败或 target 不存在，都要停下报错，不要继续向不确定目标输入。",
    "用户要求“键入/输入/Enter/提交”时，shell 只可负责创建/观察受控会话；实际文字输入和 Enter 必须优先调用 computer.keyboardInputEmulation / computer.keyboardSubmitInput，不要用 `tmux send-keys` 替代 keyboard BaseTool。",
    "如果终端里出现数字菜单或升级提示，优先用 keyboardInputEmulation 输入菜单数字，再用 keyboardSubmitInput 提交；只有需要方向键等快捷键时才使用 keyboardEmulation，并且 actions 必须是对象数组。",
    "受控终端输入必须带同一个显式 targetHint（例如 runtime 返回的 tmux:<session>、pty:<session> 或 terminal:<session>）；输入应保持原文、绕过输入法和焦点漂移，具体 provider、session、终端应用和平台命令由 runtime 工具发现/返回结果决定，不要在 prompt 中臆造固定实现。",
    "如果你在受控终端里启动了 Codex、Claude、编辑器、测试进程或任何长任务，看到 capture-pane 尾部仍有 Working、Searching、Running、esc to interrupt 等进行中标记时，本轮还没有完成；必须继续观察或明确报告仍在运行，禁止输出空结果或说已完成。",
    "对子 Codex 的问答/比对任务，最终答复必须包含从受控终端抓到的子 Codex 完整答案或明确说明仍未完成；不能只说命令已发送。",
    "实时行情、新闻、价格等必须有真实来源证据；web.search 如果只返回 prepared、sources 为空或 liveRankedResults:false，不算完成。此时应改用 web.fetch 抓取明确 URL，或用 shell.run 调用公开 HTTPS API 并引用返回字段。",
    "如果只能使用桌面键鼠模拟，必须明确说明它依赖当前焦点和系统输入法；如果需要稳定工作终端但 runtime 没有受控 PTY/terminal provider，应报告缺口。",
    transcript.length > 0 ? `已有对话：\n${transcript}` : "",
    `当前用户输入：\n${userText}`,
  ].filter((part) => part.length > 0).join("\n\n");
}

function printExampleBanner(target: string, compiled: CompiledChatAgent, provider: ExampleLiveProvider): void {
  console.log("Praxis example chat is ready");
  console.log(`target=${target}`);
  console.log(`agent=${compiled.manifest.identity.id}`);
  console.log(`model=${compiled.manifest.model.model}`);
  console.log(`auth=${provider.authSource}`);
  console.log(`entry=${compiled.agentPath}`);
  console.log(`providerTools=${exposeProviderTools ? "enabled" : "disabled"}`);
  console.log(`autoApprovePublicSafe=${autoApprovePublicSafe ? "enabled" : "disabled"}`);
  console.log(`oneShot=${oneShot ? "enabled" : "disabled"}`);
  console.log("commands: /exit, /quit, /status, /clear");
  console.log("");
}

const autoApprovePublicSafeResolver: RuntimeApprovalResolver = async (approval) => {
  const status = approval.publicSafe ? "approved" : "denied";
  console.log(`approval> ${status} ${approval.approvalId}: ${approval.reason}`);
  return {
    status,
    resolvedBy: "agentcore-chat.autoApprovePublicSafe",
    reason: approval.publicSafe
      ? "agentcore_chat --auto-approve-public-safe approved a public-safe approval envelope"
      : "agentcore_chat --auto-approve-public-safe denied a non-public-safe approval envelope",
  };
};

function printVerboseExampleResult(result: Awaited<ReturnType<ReturnType<typeof praxis.runtime.createPraxisRuntimeKernel>["runManifest"]>>): void {
  if (!verbose) return;
  console.error(JSON.stringify({
    sessionId: result.sessionId,
    modelCalls: result.ok ? result.modelCalls.length : 0,
    toolCalls: result.ok ? result.toolCalls.length : 0,
    toolCallRecords: result.ok ? result.toolCalls : undefined,
    events: result.events.length,
  }, null, 2));
}

async function runExampleChat(target: string): Promise<void> {
  const compiled = await compileExampleAgent(target);
  const provider = createExampleLiveProvider(compiled.manifest);
  const baprLikePolicy = compiled.manifest.toolPolicy.profile === "bapr" || compiled.manifest.toolPolicy.profile === "yolo";
  const approvalResolver = autoApprovePublicSafe || baprLikePolicy ? autoApprovePublicSafeResolver : undefined;
  const runtime = praxis.runtime.createPraxisRuntimeKernel({
    runtimeId: `runtime.agentcore.chat.${compiled.manifest.identity.id}`,
    store: praxis.runtime.createInMemorySessionStateEventStore(),
  });
  const history: ChatMessage[] = [];
  printExampleBanner(target, compiled, provider);

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

      const result = await runtime.runManifest(compiled.manifest, renderExampleTask(history, userText), {
        dryRun: false,
        allowProviderCall: true,
        allowToolExecution: true,
        auth: provider.auth,
        modelClient: provider.modelClient,
        storage: { cwd: architectureRoot, initMode: "on-run" },
        sandbox: { cwd: architectureRoot, failOnUnavailable: false },
        exposeProviderTools,
        approvalResolver,
      });

      if (result.ok) {
        let finalOutput = result.finalOutput;
        const mountedToolIds = compiled.manifest.harness.tools.map((tool) => tool.toolId);
        const parsedFallbackToolCalls = parseFallbackToolCalls(
          result.finalOutput,
          mountedToolIds,
          userText,
        );
        const inferredFallbackToolCalls = inferFallbackToolCallsFromUserText(userText, mountedToolIds);
        const fallbackDecision = decideTextToolFallback({
          runOk: result.ok,
          providerToolsEnabled: exposeProviderTools,
          nativeToolCallCount: result.toolCalls.length,
          explicitFallbackRequestCount: parsedFallbackToolCalls.length,
          inferredFallbackRequestCount: inferredFallbackToolCalls.length,
        });
        const fallbackToolCalls = fallbackDecision.shouldRun
          ? (parsedFallbackToolCalls.length > 0 ? parsedFallbackToolCalls : inferredFallbackToolCalls)
          : [];
        if (fallbackToolCalls.length > 0) {
          const toolResults = [];
          for (const toolCall of fallbackToolCalls.slice(0, compiled.manifest.harness.loop.maxToolCalls ?? 4)) {
            toolResults.push({
              toolCall,
              result: await invokeFallbackTool(compiled, toolCall, result.sessionId),
            });
          }
          if (verbose) {
            console.error(JSON.stringify({
              fallbackMode: "debug/degraded",
              fallbackDecision,
              fallbackToolCalls,
              toolResults,
            }, null, 2));
          }
          const summaryResult = await runtime.runManifest(compiled.manifest, [
            "你刚才请求了 Praxis baseTool。agentCore 已通过 text JSON tool fallback 执行了这些工具。",
            "注意：这是 debug/degraded 兜底路径，不代表 provider-native modelDialogueReady 已通过。",
            "请根据工具结果直接回答用户。不要再输出 tool_call 标签。",
            `用户原始输入：\n${userText}`,
            `工具结果：\n${truncateForPrompt(toolResults, 12000)}`,
          ].join("\n\n"), {
            dryRun: false,
            allowProviderCall: true,
            allowToolExecution: false,
            auth: provider.auth,
            modelClient: provider.modelClient,
            storage: { cwd: architectureRoot, initMode: "on-run" },
            sandbox: { cwd: architectureRoot, failOnUnavailable: false },
            exposeProviderTools: false,
          });
          finalOutput = summaryResult.ok
            ? summaryResult.finalOutput
            : `工具已执行，但总结失败：${summaryResult.error.message}`;
        } else if (verbose && (parsedFallbackToolCalls.length > 0 || inferredFallbackToolCalls.length > 0)) {
          console.error(JSON.stringify({
            fallbackMode: "disabled",
            fallbackDecision,
            parsedFallbackToolCalls,
            inferredFallbackToolCalls,
          }, null, 2));
        }

        if (
          finalOutput.includes("PraxisRuntimeKernel completed without text output")
          && result.toolCalls.length > 0
        ) {
          finalOutput = await summarizeNativeToolNoTextOutput(
            compiled,
            runtime,
            provider,
            userText,
            result.toolCalls,
          );
        }

        const managedSessions = extractManagedTmuxSessions({
          finalOutput,
          toolCalls: result.toolCalls,
        });
        const terminalFollowup = await waitForManagedTerminals(managedSessions);
        if (terminalFollowup.observations.length > 0) {
          const shouldSummarizeTerminalState =
            terminalFollowup.waited
            || finalOutput.includes("PraxisRuntimeKernel completed without text output")
            || finalOutput.includes("仍在")
            || finalOutput.includes("Working")
            || terminalFollowup.observations.some((observation) => observation.settled);
          if (shouldSummarizeTerminalState) {
            finalOutput = await summarizeManagedTerminalFollowup(
              compiled,
              runtime,
              provider,
              userText,
              finalOutput,
              terminalFollowup.observations,
            );
          }
        }
        history.push({ role: "user", content: userText }, { role: "assistant", content: finalOutput });
        console.log(`agent> ${finalOutput}`);
        printVerboseExampleResult(result);
        if (oneShot) {
          break;
        }
      } else {
        console.error(`agent error> ${result.error.code}: ${result.error.message}`);
        printVerboseExampleResult(result);
        if (oneShot) {
          break;
        }
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
      output.write(`${path.basename(target)}> `);
    }
  } finally {
    rl.close();
  }
}

const agentTarget = resolveAgentTarget();

(agentTarget === undefined ? runChat() : runExampleChat(agentTarget)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`agentCore fatal> ${message}`);
  process.exitCode = 1;
});
