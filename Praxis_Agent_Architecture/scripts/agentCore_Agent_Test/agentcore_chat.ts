import { existsSync, readFileSync } from "node:fs";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

const args = new Set(process.argv.slice(2));
const verbose = args.has("--verbose");
const scriptPath = fileURLToPath(import.meta.url);
const architectureRoot = path.resolve(path.dirname(scriptPath), "../..");
const localEnvPath = path.join(architectureRoot, ".env.agentcore.local");

function loadLocalEnvFile(): void {
  if (!existsSync(localEnvPath)) {
    return;
  }

  const text = readFileSync(localEnvPath, "utf8");
  for (const line of text.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    const value = rawValue.replace(/^["']|["']$/gu, "");
    if (key.length > 0 && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadLocalEnvFile();

const model = process.env.OPENAI_AGENTCORE_MODEL ?? process.env.OPENAI_SMOKE_MODEL ?? "gpt-5.4";
const baseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
const maxOutputTokens = Number(process.env.OPENAI_AGENTCORE_MAX_OUTPUT_TOKENS ?? "768");
const reasoningEffort =
  process.env.OPENAI_AGENTCORE_REASONING_EFFORT ??
  process.env.OPENAI_REASONING_EFFORT ??
  "low";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function buildEndpoint(base: string, pathWithV1: string): string {
  const cleanBase = base.replace(/\/+$/, "");
  const path = pathWithV1.startsWith("/") ? pathWithV1 : `/${pathWithV1}`;
  if (cleanBase.endsWith("/v1") && path.startsWith("/v1/")) {
    return `${cleanBase}${path.slice(3)}`;
  }

  return `${cleanBase}${path}`;
}

function assertOk<T extends { ok: boolean }>(label: string, result: T): Extract<T, { ok: true }> {
  if (result.ok) {
    return result as Extract<T, { ok: true }>;
  }

  throw new Error(`${label} failed: ${JSON.stringify(result)}`);
}

function extractResponseText(response: unknown): string {
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

function renderPrompt(history: readonly ChatMessage[], userText: string): string {
  const recentHistory = history.slice(-8);
  const transcript = recentHistory
    .map((message) => `${message.role === "user" ? "用户" : "agentCore"}: ${message.content}`)
    .join("\n");

  return [
    "你是一个临时 Praxis agentCore 对话体。",
    "你正在通过 agentCore 的 runtime / promptPack / modelAdapter 链路被调用。",
    "请用简体中文回答，保持简洁、清楚、可执行。",
    transcript.length > 0 ? `\n已有对话：\n${transcript}` : "",
    `\n当前用户输入：\n${userText}`,
  ]
    .filter((part) => part.length > 0)
    .join("\n");
}

async function callResponsesApi(prompt: string): Promise<string> {
  const apiKey = requireEnv("OPENAI_API_KEY");
  const response = await fetch(buildEndpoint(baseUrl, "/v1/responses"), {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: prompt,
      reasoning: { effort: reasoningEffort },
      max_output_tokens: maxOutputTokens,
    }),
  });
  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = text.length > 0 ? JSON.parse(text) : {};
  } catch {
    parsed = { rawText: text };
  }

  if (!response.ok) {
    throw new Error(`responses call failed with HTTP ${response.status}: ${JSON.stringify(parsed).slice(0, 1200)}`);
  }

  return extractResponseText(parsed);
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

  const answer = await callResponsesApi(promptText);
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
          baseUrl,
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
      console.log(JSON.stringify({ ...context, model, reasoningEffort, baseUrl, turns: history.length / 2 }, null, 2));
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
