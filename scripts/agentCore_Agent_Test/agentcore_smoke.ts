import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { providePromptPackInput } from "../../src/agentCore/agent_executionEngine/promptPack/promptProvider.js";
import { createAgentApplicationRuntime } from "../../src/agentCore/agent_runtimeImplementation/runtime.applicationSurface/agentApplicationRuntime.js";
import { mountAgentApplication } from "../../src/agentCore/agent_runtimeImplementation/runtime.applicationSurface/agentApplicationMount.js";
import { createAgentRuntimeClient } from "../../src/agentCore/agent_runtimeImplementation/runtime.applicationSurface/agentRuntimeClient.js";
import { createAgentRuntime } from "../../src/agentCore/agent_runtimeImplementation/runtime.applicationSurface/agentRuntimeFactory.js";
import { createExecEngineRuntime } from "../../src/agentCore/agent_runtimeImplementation/runtime.execEngine/execEngineRuntime.js";
import { bindPromptPack } from "../../src/agentCore/agent_runtimeImplementation/runtime.execEngine/bindPromptPack.js";
import { createAgentInvocationEntrypoint } from "../../src/agentCore/agent_runtimeImplementation/runtime.invocationMethod/agentInvocationEntrypoint.js";
import { createInvocationResultSurface } from "../../src/agentCore/agent_runtimeImplementation/runtime.invocationMethod/invocationResultSurface.js";
import { openModelInvocationEntrypoint } from "../../src/agentCore/agent_runtimeImplementation/runtime.invocationMethod/modelInvocationEntrypoint.js";
import { resolveAuthEnvelope } from "../../src/agentCore/agent_modelAdapter/authProfileLayer/authResolver.js";
import { createCredentialRef } from "../../src/agentCore/agent_modelAdapter/authProfileLayer/credentialRef.js";
import { invokeChatGPTCodexResponses } from "../../src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/chatgpt_codex_responses.js";
import { createProviderCaller } from "../../src/agentCore/agent_modelAdapter/providerAccessLayer/providerCaller.js";
import { createChatGPTCodexResponsesCarrier } from "../../src/agentCore/agent_modelAdapter/providerAccessLayer/providerCarrier.js";
import { fetchProviderTransport } from "../../src/agentCore/agent_modelAdapter/providerAccessLayer/transportCaller.js";
import { planModelInvocation } from "../../src/agentCore/agent_runtimeImplementation/runtime.modelAdapter/modelInvocationRuntime.js";
import { lowerPromptForModelAdapter } from "../../src/agentCore/agent_runtimeImplementation/runtime.modelAdapter/promptLoweringRuntime.js";

type SmokeStep = {
  name: string;
  ok: boolean;
  detail: string;
};

type LiveProbe = {
  provider: "openai" | "anthropic-messages" | "google-gemini";
  status: "passed" | "failed" | "skipped";
  detail: string;
};

type JsonObject = Record<string, unknown>;

const args = new Set(process.argv.slice(2));
const live = args.has("--live") || process.env.AGENTCORE_SMOKE_LIVE === "1";
const scriptPath = fileURLToPath(import.meta.url);
const architectureRoot = path.resolve(path.dirname(scriptPath), "../..");
const localEnvPath = path.join(architectureRoot, ".env.agentcore.local");
const codexAuthPath = process.env.AGENTCORE_CODEX_AUTH_FILE
  ?? path.join(process.env.CODEX_HOME ?? path.join(process.env.HOME ?? "", ".codex"), "auth.json");
const chatgptCodexClientVersion = process.env.AGENTCORE_CODEX_CLIENT_VERSION ?? "0.118.0";

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

function okStep(name: string, detail: string): SmokeStep {
  return { name, ok: true, detail };
}

function failStep(name: string, detail: string): SmokeStep {
  return { name, ok: false, detail };
}

function assertOk<T extends { ok: boolean }>(
  name: string,
  result: T,
  detail: (result: Extract<T, { ok: true }>) => string,
): SmokeStep {
  if (result.ok) {
    return okStep(name, detail(result as Extract<T, { ok: true }>));
  }

  return failStep(name, JSON.stringify(result));
}

function buildEndpoint(baseUrl: string, pathWithV1: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const path = pathWithV1.startsWith("/") ? pathWithV1 : `/${pathWithV1}`;
  if (base.endsWith("/v1") && path.startsWith("/v1/")) {
    return `${base}${path.slice(3)}`;
  }

  return `${base}${path}`;
}

async function postJson(url: string, headers: Record<string, string>, body: JsonObject): Promise<JsonObject> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: JsonObject = {};
  try {
    parsed = text.length > 0 ? (JSON.parse(text) as JsonObject) : {};
  } catch {
    parsed = { rawText: text.slice(0, 500) };
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(parsed).slice(0, 800)}`);
  }

  return parsed;
}

function extractSseText(text: string): string {
  const deltas: string[] = [];

  for (const line of text.split(/\r?\n/u)) {
    if (!line.startsWith("data:")) {
      continue;
    }

    const payload = line.slice("data:".length).trim();
    if (payload.length === 0 || payload === "[DONE]") {
      continue;
    }

    try {
      const parsed = JSON.parse(payload) as Record<string, unknown>;
      if (typeof parsed.delta === "string") {
        deltas.push(parsed.delta);
      }
    } catch {
      // Ignore non-JSON SSE payloads.
    }
  }

  return deltas.join("").trim();
}

function extractProviderText(raw: unknown): string {
  if (typeof raw === "string") {
    return extractSseText(raw) || raw;
  }

  if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
    const record = raw as Record<string, unknown>;
    if (typeof record.output_text === "string") {
      return record.output_text;
    }
  }

  return JSON.stringify(raw).slice(0, 120);
}

async function probeOpenAI(): Promise<LiveProbe> {
  const model = process.env.AGENTCORE_CODEX_MODEL ?? process.env.OPENAI_SMOKE_MODEL ?? "gpt-5.5";
  const reasoningEffort =
    process.env.AGENTCORE_CODEX_REASONING_EFFORT ??
    process.env.OPENAI_SMOKE_REASONING_EFFORT ??
    process.env.OPENAI_REASONING_EFFORT ??
    "low";
  const credentialRef = createCredentialRef({
    id: "agentcore-smoke-chatgpt-codex",
    provider: "openai",
    credentialType: "chatgpt_codex_oauth",
    source: { kind: "codex-auth-file", filePath: codexAuthPath },
  });
  if (!credentialRef.ok) {
    throw new Error(JSON.stringify(credentialRef.error));
  }

  const carrier = createChatGPTCodexResponsesCarrier({
    carrierId: "chatgpt-codex.responses.smoke",
    model,
    reasoning: { effort: reasoningEffort },
    credentialRef: credentialRef.credentialRef,
    clientName: "praxis-agentcore-smoke",
    clientVersion: chatgptCodexClientVersion,
  });
  if (!carrier.ok) {
    throw new Error(JSON.stringify(carrier.error));
  }

  const auth = resolveAuthEnvelope({
    credentialRef: credentialRef.credentialRef,
    readFile: (filePath) => readFileSync(filePath, "utf8"),
  });
  if (!auth.ok) {
    throw new Error(JSON.stringify(auth.error));
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
    governance: { accepted: true },
    runtime: {
      runtimeId: "agentcore-smoke-runtime",
      invocationId: "agentcore-smoke-openai-probe",
      callerId: "agentcore-smoke",
    },
    dryRun: false,
    expectResponseObject: false,
    caller,
    headers: { "content-type": "application/json" },
    clientName: "praxis-agentcore-smoke",
    clientVersion: chatgptCodexClientVersion,
    body: {
      model,
      instructions: "Return exactly the requested marker and nothing else.",
      input: "Return exactly: agentCore-ok",
      reasoning: { effort: reasoningEffort },
      max_output_tokens: 32,
    },
  });
  if (!result.ok) {
    throw new Error(JSON.stringify(result.error));
  }

  const outputText = extractProviderText(result.response.raw);
  return {
    provider: "openai",
    status: "passed",
    detail: `chatgpt codex provider path accepted model=${model}; reasoning.effort=${reasoningEffort}; output=${outputText.slice(0, 80)}`,
  };
}

async function probeAnthropicMessages(): Promise<LiveProbe> {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    return {
      provider: "anthropic-messages",
      status: "skipped",
      detail: "缺少 ANTHROPIC_API_KEY / CLAUDE_API_KEY，跳过 /v1/messages live 探针。",
    };
  }

  const model = process.env.ANTHROPIC_SMOKE_MODEL ?? "claude-3-5-haiku-latest";
  const baseUrl = process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com/v1";
  const url = buildEndpoint(baseUrl, "/v1/messages");
  const result = await postJson(
    url,
    {
      "x-api-key": apiKey,
      "anthropic-version": process.env.ANTHROPIC_VERSION ?? "2023-06-01",
    },
    {
      model,
      max_tokens: 32,
      messages: [{ role: "user", content: "Return exactly: agentCore-ok" }],
    },
  );

  const content = Array.isArray(result.content) ? JSON.stringify(result.content).slice(0, 120) : JSON.stringify(result).slice(0, 120);
  return {
    provider: "anthropic-messages",
    status: "passed",
    detail: `/v1/messages accepted model=${model}; content=${content}`,
  };
}

async function probeGoogleGemini(): Promise<LiveProbe> {
  const apiKey = process.env.GOOGLE_API_KEY
    ?? process.env.GEMINI_API_KEY
    ?? process.env.GOOGLE_GENAI_API_KEY
    ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    return {
      provider: "google-gemini",
      status: "skipped",
      detail: "缺少 GOOGLE_API_KEY / GEMINI_API_KEY / GOOGLE_GENAI_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY，跳过 Google live 探针。",
    };
  }

  const model = process.env.GOOGLE_SMOKE_MODEL ?? "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const result = await postJson(
    url,
    {},
    {
      contents: [{ role: "user", parts: [{ text: "Return exactly: agentCore-ok" }] }],
    },
  );

  const candidates = Array.isArray(result.candidates) ? JSON.stringify(result.candidates).slice(0, 120) : JSON.stringify(result).slice(0, 120);
  return {
    provider: "google-gemini",
    status: "passed",
    detail: `generateContent accepted model=${model}; candidates=${candidates}`,
  };
}

async function runLiveProbes(): Promise<LiveProbe[]> {
  if (!live) {
    return [
      {
        provider: "openai",
        status: "skipped",
        detail: "未传 --live，只运行 agentCore 内部 dry-run 链路。",
      },
      {
        provider: "anthropic-messages",
        status: "skipped",
        detail: "未传 --live，只运行 agentCore 内部 dry-run 链路。",
      },
      {
        provider: "google-gemini",
        status: "skipped",
        detail: "未传 --live，只运行 agentCore 内部 dry-run 链路。",
      },
    ];
  }

  const probes = [probeOpenAI, probeAnthropicMessages, probeGoogleGemini];
  const results: LiveProbe[] = [];
  for (const probe of probes) {
    try {
      results.push(await probe());
    } catch (error) {
      const provider = probe === probeOpenAI ? "openai" : probe === probeAnthropicMessages ? "anthropic-messages" : "google-gemini";
      results.push({
        provider,
        status: "failed",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

async function main(): Promise<void> {
  const steps: SmokeStep[] = [];
  const runtimeResult = createAgentRuntime({
    source: { kind: "configuration", name: "temporary-smoke-agent", version: "0.0.0-smoke" },
    applicationId: "smoke-app",
    requestedSurfaces: [
      "runtime.applicationSurface",
      "runtime.contractSurface",
      "runtime.governancePlane",
      "runtime.invocationMethod",
      "runtime.execEngine",
      "runtime.modelAdapter",
    ],
  });
  steps.push(assertOk("runtime.factory", runtimeResult, (result) => result.runtime.runtimeId));
  if (!runtimeResult.ok) {
    throw new Error("runtime.factory failed");
  }

  const runtime = runtimeResult.runtime;
  const mountResult = mountAgentApplication({
    applicationId: runtime.applicationId,
    runtimeId: runtime.runtimeId,
    runtimeReady: runtime.readiness === "ready",
    requestedCapabilities: ["agent.invoke", "model.invoke", "prompt.pack"],
    eventSubscriptions: ["runtime.*", "agent.*", "model.*"],
  });
  steps.push(assertOk("application.mount", mountResult, (result) => result.record.mountId));
  if (!mountResult.ok) {
    throw new Error("application.mount failed");
  }

  const applicationRuntime = createAgentApplicationRuntime({
    runtime,
    mount: mountResult.record,
    operation: "invoke",
  });
  steps.push(assertOk("application.runtime", applicationRuntime, (result) => result.surface.status));
  if (!applicationRuntime.ok) {
    throw new Error("application.runtime failed");
  }

  const clientResult = createAgentRuntimeClient({ surface: applicationRuntime.surface });
  steps.push(assertOk("runtime.client", clientResult, (result) => result.client.enabledOperations.join(",")));
  if (!clientResult.ok) {
    throw new Error("runtime.client failed");
  }

  const clientInvoke = clientResult.client.call({
    operation: "invoke",
    payload: { text: "hello from temporary agentCore smoke" },
  });
  steps.push({
    name: "runtime.client.invoke",
    ok: clientInvoke.ok,
    detail: JSON.stringify(clientInvoke),
  });
  if (!clientInvoke.ok) {
    throw new Error("runtime.client.invoke failed");
  }

  const agentEntrypoint = createAgentInvocationEntrypoint({
    runtimeId: runtime.runtimeId,
    agentId: "temporary-smoke-agent",
    source: "application",
    input: { text: "hello from temporary agentCore smoke" },
    runtimeReady: true,
    requestedScopes: ["agent.invoke", "model.invoke", "prompt.pack"],
    allowedScopes: ["agent.invoke", "model.invoke", "prompt.pack"],
    trace: { correlationId: "agentcore-smoke", callerId: "smoke-app", sessionId: runtime.sessions[0]?.sessionId },
  });
  steps.push(assertOk("agent.invocation.entrypoint", agentEntrypoint, (result) => result.plan.envelope.envelopeId));
  if (!agentEntrypoint.ok) {
    throw new Error("agent.invocation.entrypoint failed");
  }

  const promptPack = providePromptPackInput({
    runtimeId: runtime.runtimeId,
    sessionId: runtime.sessions[0]?.sessionId ?? "smoke-session",
    invocationId: agentEntrypoint.plan.envelope.envelopeId,
    materials: [
      {
        id: "system:governance",
        kind: "system",
        content: "You are a temporary Praxis agentCore smoke agent.",
        source: { kind: "runtime", trusted: true },
        priority: 100,
      },
      {
        id: "user:intent",
        kind: "user",
        content: "Return a tiny success message.",
        source: { kind: "application", ref: "smoke-app", trusted: true },
        priority: 90,
      },
      {
        id: "tool:summary",
        kind: "tool-summary",
        content: "No tools are executed in this smoke run.",
        source: { kind: "tool", ref: "dry-run-tool-summary", trusted: true },
        priority: 70,
      },
    ],
    budget: { maxEstimatedTokens: 256, reservedForLowering: 64, maxMaterials: 8 },
    requestedScopes: ["prompt.pack"],
    allowedScopes: ["prompt.pack"],
  });
  steps.push(assertOk("promptPack.provider", promptPack, (result) => `${result.pack.materials.length} materials`));
  if (!promptPack.ok) {
    throw new Error("promptPack.provider failed");
  }

  const promptPackBinding = bindPromptPack({
    runtimeId: runtime.runtimeId,
    caller: { kind: "application", id: runtime.applicationId, sessionId: runtime.sessions[0]?.sessionId },
    promptPack: {
      id: promptPack.pack.runtimeId + ":promptPack:" + promptPack.pack.sessionId,
      source: "application",
      layers: promptPack.pack.materials.map((material) => ({ kind: material.kind, ref: material.id })),
    },
  });
  steps.push(assertOk("runtime.execEngine.bindPromptPack", promptPackBinding, (result) => result.binding.bindingId));
  if (!promptPackBinding.ok) {
    throw new Error("runtime.execEngine.bindPromptPack failed");
  }

  const execRuntime = createExecEngineRuntime({
    runtimeId: runtime.runtimeId,
    caller: { kind: "application", id: runtime.applicationId, sessionId: runtime.sessions[0]?.sessionId },
    bindings: [
      {
        surface: "promptPack",
        bindingId: promptPackBinding.binding.bindingId,
        ready: true,
        capabilities: ["prompt.pack"],
      },
      {
        surface: "invocationBridge",
        bindingId: `${runtime.runtimeId}:invocationBridge:smoke`,
        ready: true,
        capabilities: ["agent.invoke"],
      },
    ],
  });
  steps.push(assertOk("runtime.execEngine", execRuntime, (result) => result.runtime.surfaces.join(",")));
  if (!execRuntime.ok) {
    throw new Error("runtime.execEngine failed");
  }

  const lowered = lowerPromptForModelAdapter({
    runtimeId: runtime.runtimeId,
    caller: { kind: "application", id: runtime.applicationId, sessionId: runtime.sessions[0]?.sessionId },
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
  });
  steps.push(assertOk("runtime.modelAdapter.promptLowering", lowered, (result) => result.loweredPrompt.loweringId));
  if (!lowered.ok) {
    throw new Error("runtime.modelAdapter.promptLowering failed");
  }

  const modelEntrypoint = openModelInvocationEntrypoint({
    runtimeId: runtime.runtimeId,
    modelCapabilityId: lowered.loweredPrompt.target.capabilityId,
    input: { kind: "prompt-pack-ref", value: lowered.loweredPrompt.promptPackId },
    runtimeReady: true,
  });
  steps.push(assertOk("model.invocation.entrypoint", modelEntrypoint, (result) => result.envelope.routeId));
  if (!modelEntrypoint.ok) {
    throw new Error("model.invocation.entrypoint failed");
  }

  const modelPlan = planModelInvocation({
    runtimeId: runtime.runtimeId,
    caller: { kind: "application", id: runtime.applicationId, sessionId: runtime.sessions[0]?.sessionId },
    loweredPrompt: {
      loweringId: lowered.loweredPrompt.loweringId,
      promptPackId: lowered.loweredPrompt.promptPackId,
      materialRefs: lowered.loweredPrompt.materialRefs,
    },
    capability: { capabilityId: lowered.loweredPrompt.target.capabilityId, kind: "chat" },
    carrier: { carrierId: lowered.loweredPrompt.target.carrierId ?? "openai.responses", provider: "openai" },
    mode: "single",
  });
  steps.push(assertOk("runtime.modelAdapter.modelInvocation", modelPlan, (result) => result.plan.invocationId));
  if (!modelPlan.ok) {
    throw new Error("runtime.modelAdapter.modelInvocation failed");
  }

  const resultSurface = createInvocationResultSurface({
    invocationId: modelPlan.plan.invocationId,
    method: "model",
    routeId: modelEntrypoint.envelope.routeId,
    status: "completed",
    output: {
      kind: "dry-run-agentCore-smoke-result",
      providerCallPermitted: modelPlan.plan.providerCallPermitted,
      transport: modelPlan.plan.transport,
    },
    events: [...runtimeResult.events, ...agentEntrypoint.events, ...promptPack.events, ...lowered.events, ...modelPlan.events],
  });
  steps.push(assertOk("invocation.result.surface", resultSurface, (result) => result.surface.status));
  if (!resultSurface.ok) {
    throw new Error("invocation.result.surface failed");
  }

  const liveProbes = await runLiveProbes();
  const failedLive = liveProbes.filter((probe) => probe.status === "failed");
  const failedDryRun = steps.filter((step) => !step.ok);

  const summary = {
    ok: failedDryRun.length === 0 && failedLive.length === 0,
    mode: live ? "dry-run-plus-live-probes" : "dry-run-only",
    runtimeId: runtime.runtimeId,
    dryRunSteps: steps,
    liveProbes,
    notes: [
      "当前 agentCore 主链仍以 dry-run/contract-first 为主。",
      "live probes 只验证外部 provider endpoint 是否可达，不代表 agentCore 已经执行真实 provider 调用。",
      "OpenAI live probe 使用 Codex CLI ChatGPT 登录态，不把 ChatGPT 订阅伪装成普通 OPENAI_API_KEY。",
    ],
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!summary.ok) {
    process.exitCode = 1;
  }
}

await main();
