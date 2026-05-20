import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import type { BaseToolExecutorPort } from "../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import { assemblePromptPack } from "../../src/agentCore/agent_executionEngine/promptPack/promptAssembler.js";
import { definePromptPack } from "../../src/agentCore/agent_executionEngine/promptPack/promptDefiner.js";
import { mapPromptMaterials } from "../../src/agentCore/agent_executionEngine/promptPack/promptMapper.js";
import { invokeChatGPTCodexResponses } from "../../src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/chatgpt_codex_responses.js";
import { resolveAuthEnvelope } from "../../src/agentCore/agent_modelAdapter/authProfileLayer/authResolver.js";
import { createCredentialRef } from "../../src/agentCore/agent_modelAdapter/authProfileLayer/credentialRef.js";
import { createProviderCaller } from "../../src/agentCore/agent_modelAdapter/providerAccessLayer/providerCaller.js";
import { createChatGPTCodexResponsesCarrier } from "../../src/agentCore/agent_modelAdapter/providerAccessLayer/providerCarrier.js";
import { fetchProviderTransport } from "../../src/agentCore/agent_modelAdapter/providerAccessLayer/transportCaller.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const architectureRoot = path.resolve(testDir, "../..");
const liveEnabled = process.env.AGENTCORE_LIVE_TEST === "1";
const codexAuthPath = process.env.AGENTCORE_CODEX_AUTH_FILE
  ?? path.join(process.env.CODEX_HOME ?? path.join(process.env.HOME ?? "", ".codex"), "auth.json");
const chatgptCodexClientVersion = process.env.AGENTCORE_CODEX_CLIENT_VERSION ?? "0.118.0";

type SmokeOutput = {
  ok?: boolean;
  mode?: string;
  dryRunSteps?: Array<{ name: string; ok: boolean; detail: string }>;
  liveProbes?: Array<{ provider: string; status: string; detail: string }>;
};

type LiveToolCall = {
  tool: string;
  arguments: Readonly<Record<string, unknown>>;
};

function parseLastJsonObject(output: string): SmokeOutput {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  assert.notEqual(start, -1, "smoke output must include a JSON object");
  assert.notEqual(end, -1, "smoke output must include a complete JSON object");
  assert.ok(end > start, "smoke JSON object must be complete");
  return JSON.parse(output.slice(start, end + 1)) as SmokeOutput;
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

  const output = record.output;
  if (Array.isArray(output)) {
    const parts: string[] = [];
    for (const item of output) {
      if (typeof item !== "object" || item === null) continue;
      const content = (item as Record<string, unknown>).content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (typeof block !== "object" || block === null) continue;
        const text = (block as Record<string, unknown>).text ?? (block as Record<string, unknown>).output_text;
        if (typeof text === "string" && text.trim().length > 0) parts.push(text.trim());
      }
    }
    if (parts.length > 0) return parts.join("\n");
  }

  const choices = record.choices;
  if (Array.isArray(choices)) {
    const first = choices[0] as Record<string, unknown> | undefined;
    const message = first?.message as Record<string, unknown> | undefined;
    const content = message?.content ?? first?.text;
    if (typeof content === "string" && content.trim().length > 0) return content.trim();
  }

  return JSON.stringify(response);
}

function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  assert.notEqual(start, -1, `live model response must include JSON: ${text}`);
  assert.notEqual(end, -1, `live model response must include a complete JSON object: ${text}`);
  assert.ok(end > start, `live model JSON object must be complete: ${text}`);
  return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
}

test("agentCore provider live smoke documents Claude and Gemini env aliases", () => {
  const source = readFileSync(path.join(architectureRoot, "examples/scripts/agentcore_smoke.ts"), "utf8");

  assert.match(source, /ANTHROPIC_API_KEY/u);
  assert.match(source, /CLAUDE_API_KEY/u);
  assert.match(source, /GOOGLE_API_KEY/u);
  assert.match(source, /GEMINI_API_KEY/u);
  assert.match(source, /GOOGLE_GENAI_API_KEY/u);
  assert.match(source, /GOOGLE_GENERATIVE_AI_API_KEY/u);
});

function normalizeToolCall(value: unknown): LiveToolCall {
  assert.equal(typeof value, "object", "tool call must be an object");
  assert.notEqual(value, null, "tool call must not be null");
  assert.equal(Array.isArray(value), false, "tool call must not be an array");
  const record = value as Record<string, unknown>;
  const tool = record.tool ?? record.name;
  assert.equal(typeof tool, "string", "tool call must include a string tool");
  if (typeof tool !== "string") throw new Error("tool call must include a string tool");
  assert.match(tool, /^shell\./u, "live dialogue must request a shell.* tool");
  const args = record.arguments;
  assert.equal(typeof args, "object", "tool call arguments must be an object");
  assert.notEqual(args, null, "tool call arguments must not be null");
  assert.equal(Array.isArray(args), false, "tool call arguments must not be an array");
  return { tool, arguments: args as Readonly<Record<string, unknown>> };
}

function firstToolCallFromModelText(text: string): LiveToolCall {
  const parsed = parseJsonObject(text);
  const toolCalls = parsed.tool_calls ?? parsed.toolCalls;
  assert.equal(Array.isArray(toolCalls), true, "live model must return tool_calls array");
  assert.ok((toolCalls as unknown[]).length > 0, "live model must request at least one tool call");
  return normalizeToolCall((toolCalls as unknown[])[0]);
}

async function callLiveResponses(prompt: string): Promise<string> {
  const model = process.env.AGENTCORE_CODEX_MODEL ?? process.env.OPENAI_SMOKE_MODEL ?? "gpt-5.5";
  const reasoningEffort =
    process.env.AGENTCORE_CODEX_REASONING_EFFORT ??
    process.env.OPENAI_AGENTCORE_REASONING_EFFORT ??
    "low";
  const credentialRef = createCredentialRef({
    id: "agentcore-live-chatgpt-codex",
    provider: "openai",
    credentialType: "chatgpt_codex_oauth",
    source: { kind: "codex-auth-file", filePath: codexAuthPath },
  });
  assert.equal(credentialRef.ok, true);
  if (!credentialRef.ok) {
    throw new Error("credential ref failed");
  }

  const auth = resolveAuthEnvelope({
    credentialRef: credentialRef.credentialRef,
    readFile: (filePath) => readFileSync(filePath, "utf8"),
  });
  assert.equal(auth.ok, true);
  if (!auth.ok) {
    throw new Error("auth resolver failed");
  }

  const carrier = createChatGPTCodexResponsesCarrier({
    carrierId: "chatgpt-codex.responses.live-dialogue",
    model,
    reasoning: { effort: reasoningEffort },
    credentialRef: credentialRef.credentialRef,
    clientName: "praxis-agentcore-live",
    clientVersion: chatgptCodexClientVersion,
  });
  assert.equal(carrier.ok, true);
  if (!carrier.ok) {
    throw new Error("provider carrier failed");
  }

  const defined = definePromptPack({
    runtimeId: "live-dialogue-runtime",
    sessionId: "live-dialogue-session",
    targetModel: model,
    basicCorePromptText: "You are a Praxis agentCore live smoke model surface.",
    materials: [
      {
        id: "user",
        kind: "user",
        text: prompt,
        source: "agentCoreLiveSmoke",
        priority: 100,
        trusted: true,
      },
    ],
  });
  assert.equal(defined.ok, true);
  if (!defined.ok) {
    throw new Error("prompt definition failed");
  }

  const assembled = assemblePromptPack({
    runtimeId: "live-dialogue-runtime",
    sessionId: "live-dialogue-session",
    targetModel: model,
    materials: defined.definition.materials,
  });
  assert.equal(assembled.ok, true);
  if (!assembled.ok) {
    throw new Error("prompt assembly failed");
  }

  const mapped = mapPromptMaterials({
    runtimeId: "live-dialogue-runtime",
    sessionId: "live-dialogue-session",
    promptPack: assembled.promptPack,
    targetProvider: "openai",
    targetModel: model,
  });
  assert.equal(mapped.ok, true);
  if (!mapped.ok) {
    throw new Error("prompt mapping failed");
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
    runtime: { runtimeId: "live-dialogue-runtime", invocationId: "live-dialogue-openai", callerId: "agentCoreLiveSmoke" },
    governance: { accepted: true },
    dryRun: false,
    caller,
    headers: { "content-type": "application/json" },
    clientName: "praxis-agentcore-live",
    clientVersion: chatgptCodexClientVersion,
    expectResponseObject: false,
    body: {
      ...mapped.mappedPack.providerPayload.body,
      reasoning: { effort: reasoningEffort },
      max_output_tokens: Number(process.env.OPENAI_AGENTCORE_MAX_OUTPUT_TOKENS ?? "768"),
    },
  });

  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.error));
  if (!result.ok) {
    throw new Error("responses invocation failed");
  }
  return extractResponseText(result.response.raw);
}

async function executeShellToolCall(call: LiveToolCall, executor: BaseToolExecutorPort) {
  const lookup = createBaseToolRegistry().lookupHandler(call.tool);
  assert.equal(lookup.ok, true, `${call.tool} must be mounted in the baseTool registry`);
  if (!lookup.ok) throw new Error(`${call.tool} registry lookup failed`);

  return lookup.handler.invoke({
    toolCallId: `${call.tool}:live-dialogue`,
    runtimeId: "live-dialogue-runtime",
    sessionId: "live-dialogue-session",
    input: call.arguments,
    executor,
  });
}

function liveShellExecutor(): BaseToolExecutorPort {
  return {
    shell: {
      async generateCommand() {
        return {
          ok: true,
          output: {
            kind: "agentCore.basicTool.shell.commandGeneration",
            shell: "bash",
            commandLine: "printf praxis-live-shell-ok",
            argv: ["printf", "praxis-live-shell-ok"],
            executable: "printf",
            environmentKeys: [],
            requiredPermission: "shell:generate",
            dryRun: true,
            providerCalled: false,
            executionBlocked: true,
            unsafeSideEffects: false,
          },
        };
      },
      async run(request) {
        return {
          ok: true,
          output: {
            exitCode: 0,
            stdout: request.command === "printf" ? `${request.args?.join(" ") ?? ""}` : "praxis-live-shell-ok",
            stderr: "",
          },
        };
      },
      async captureOutput() {
        return {
          ok: true,
          output: {
            sessionId: "live-shell-session",
            streams: ["stdout"],
            chunks: [{ stream: "stdout", text: "praxis-live-shell-ok", bytes: 20 }],
            totalBytes: 20,
            truncated: false,
            realBufferReadBlocked: false,
          },
        };
      },
    },
  };
}

test(
  "临时 agentCore live smoke can really call an OAI-compatible /v1/responses endpoint",
  { skip: liveEnabled ? false : "set AGENTCORE_LIVE_TEST=1 to run the live provider probe" },
  () => {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "examples/scripts/agentcore_smoke.ts", "--live"],
      {
        cwd: architectureRoot,
        env: {
          ...process.env,
          OPENAI_SMOKE_MODEL: process.env.OPENAI_SMOKE_MODEL ?? "gpt-5.5",
        },
        encoding: "utf8",
        timeout: 60_000,
      },
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const output = parseLastJsonObject(result.stdout);

    assert.equal(output.ok, true, "agentCore smoke summary should be ok");
    assert.equal(output.mode, "dry-run-plus-live-probes");
    assert.ok(output.dryRunSteps?.every((step) => step.ok), "all internal agentCore dry-run steps must pass");

    const openaiProbe = output.liveProbes?.find((probe) => probe.provider === "openai");
    assert.ok(openaiProbe, "live smoke must report the openai probe");
    assert.equal(openaiProbe.status, "passed", openaiProbe.detail);
    assert.match(openaiProbe.detail, /chatgpt codex provider path accepted model=/);
  },
);

test(
  "live model dialogue can request shell baseTools and receive registry handler results",
  { skip: liveEnabled ? false : "set AGENTCORE_LIVE_TEST=1 to run the live shell tool dialogue probe" },
  async () => {
    const scenarios = [
      {
        label: "list shell capability via command generation",
        expectedTool: "shell.commandGeneration",
        expectedNeedle: "praxis-live-shell-ok",
        arguments: {
          argv: ["printf", "praxis-live-shell-ok"],
          shell: "bash",
          context: { dryRun: false, guard: { allowed: true } },
        },
      },
      {
        label: "execute harmless command",
        expectedTool: "shell.commandExecution",
        expectedNeedle: "praxis-live-shell-ok",
        arguments: {
          command: "printf",
          args: ["praxis-live-shell-ok"],
          context: { dryRun: false, guard: { allowed: true } },
        },
      },
      {
        label: "summarize captured output",
        expectedTool: "shell.outputCapture",
        expectedNeedle: "praxis-live-shell-ok",
        arguments: {
          target: { sessionId: "live-shell-session" },
          context: {
            dryRun: false,
            guard: { allowed: true },
            grantedPermissions: ["shell:output:capture"],
            allowedSessionIds: ["live-shell-session"],
          },
        },
      },
    ] as const;

    const executor = liveShellExecutor();
    for (const scenario of scenarios) {
      const toolPlanText = await callLiveResponses([
        "You are a Praxis agentCore shell tool-call planner.",
        "Return exactly one compact JSON object and no markdown.",
        "Shape: {\"tool_calls\":[{\"tool\":\"<tool id>\",\"arguments\":{...}}]}",
        `Scenario: ${scenario.label}.`,
        `Required tool: ${scenario.expectedTool}.`,
        `Required arguments: ${JSON.stringify(scenario.arguments)}.`,
      ].join("\n"));
      const call = firstToolCallFromModelText(toolPlanText);
      assert.equal(call.tool, scenario.expectedTool, `live model must choose ${scenario.expectedTool}`);

      const result = await executeShellToolCall(call, executor);
      assert.equal(result.ok, true, `${scenario.expectedTool} handler must return ok for live dialogue: ${JSON.stringify(result)}`);
      assert.equal(result.toolId, scenario.expectedTool);
      assert.match(JSON.stringify(result), new RegExp(scenario.expectedNeedle), `${scenario.expectedTool} result must contain ${scenario.expectedNeedle}`);

      const answerText = await callLiveResponses([
        "You are the Praxis agentCore dialogue surface after a shell tool call.",
        "Return exactly one compact JSON object and no markdown.",
        "Shape: {\"answer\":\"...\"}",
        `The user asked for scenario: ${scenario.label}.`,
        `Tool result: ${JSON.stringify(result).slice(0, 4000)}.`,
        `Your answer must include this exact marker: ${scenario.expectedNeedle}.`,
      ].join("\n"));
      const answer = parseJsonObject(answerText);
      assert.equal(typeof answer.answer, "string", "live model final answer must include answer text");
      assert.match(answer.answer as string, new RegExp(scenario.expectedNeedle), "final live answer must include the shell result marker");
    }
  },
);
