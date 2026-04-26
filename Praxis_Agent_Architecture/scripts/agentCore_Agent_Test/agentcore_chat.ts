import { readFileSync } from "node:fs";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { invokeChatGPTCodexResponses } from "../../src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/chatgpt_codex_responses.js";
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

const args = new Set(process.argv.slice(2));
const verbose = args.has("--verbose");
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
    "{\"tool_calls\":[{\"tool\":\"shell.commandExecution\",\"arguments\":{\"command\":\"pwd\",\"args\":[],\"cwd\":\"/home/proview/Desktop/Praxis_series/Praxis_org/Praxis_Agent_Architecture\",\"timeoutMs\":10000}}]}",
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

runChat().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`agentCore fatal> ${message}`);
  process.exitCode = 1;
});
