import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { invokeChatGPTCodexResponses } from "../../src/modelAdapter/actualInvocationLayer/openai/chatgpt_codex_responses.js";
import { resolveAuthEnvelope } from "../../src/modelAdapter/authProfileLayer/authResolver.js";
import { createCredentialRef } from "../../src/modelAdapter/authProfileLayer/credentialRef.js";
import { createProviderCaller } from "../../src/modelAdapter/providerAccessLayer/providerCaller.js";
import { createChatGPTCodexResponsesCarrier } from "../../src/modelAdapter/providerAccessLayer/providerCarrier.js";
import { fetchProviderTransport } from "../../src/modelAdapter/providerAccessLayer/transportCaller.js";
import {
  createFullShellExecutor,
  expectedCallSeen,
  invokeShellToolThroughRuntimeChain,
  normalizeShellLiveToolCall,
  shellLiveToolCases,
  shellToolCallFromCase,
} from "./shellFullCapabilities.js";

const args = process.argv.slice(2);
const argSet = new Set(args);
const scriptPath = fileURLToPath(import.meta.url);
const architectureRoot = path.resolve(path.dirname(scriptPath), "../..");
const codexAuthPath = process.env.AGENTCORE_CODEX_AUTH_FILE
  ?? path.join(process.env.CODEX_HOME ?? path.join(process.env.HOME ?? "", ".codex"), "auth.json");
const chatgptCodexClientVersion = process.env.AGENTCORE_CODEX_CLIENT_VERSION ?? "0.118.0";
const model = process.env.AGENTCORE_CODEX_MODEL ?? process.env.OPENAI_SMOKE_MODEL ?? "gpt-5.5";
const reasoningEffort =
  process.env.AGENTCORE_CODEX_REASONING_EFFORT ??
  process.env.OPENAI_AGENTCORE_REASONING_EFFORT ??
  process.env.OPENAI_REASONING_EFFORT ??
  "low";
const maxOutputTokens = Number(process.env.OPENAI_AGENTCORE_MAX_OUTPUT_TOKENS ?? "768");
const useModel = !argSet.has("--no-model");
const dialogueMode = argSet.has("--dialogue");

function argValue(name: string): string | undefined {
  const prefix = `${name}=`;
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
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

async function callResponsesApi(
  prompt: string,
  instructions = "你是 Praxis agentCore shell baseTool live matrix。你只输出 JSON tool_calls，不输出解释。",
): Promise<string> {
  const credentialRef = createCredentialRef({
    id: "agentcore-shell-live-matrix-chatgpt-codex",
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
    carrierId: "chatgpt-codex.responses.agentcore-shell-live-matrix",
    model,
    reasoning: { effort: reasoningEffort },
    credentialRef: credentialRef.credentialRef,
    clientName: "praxis-agentcore-shell-live-matrix",
    clientVersion: chatgptCodexClientVersion,
  });
  if (!carrier.ok) throw new Error(JSON.stringify(carrier.error));

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
      runtimeId: "agentcore-shell-live-matrix-runtime",
      invocationId: `agentcore-shell-live-matrix-${Date.now()}`,
      callerId: "agentcore-shell-live-matrix",
    },
    governance: { accepted: true },
    dryRun: false,
    caller,
    headers: { "content-type": "application/json" },
    clientName: "praxis-agentcore-shell-live-matrix",
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

  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return extractResponseText(result.response.raw);
}

function truncateText(value: unknown, maxChars = 1_200): string {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.length > maxChars ? `${text.slice(0, maxChars)}...<truncated>` : text;
}

function executorMode(calls: readonly string[]): "real-host-command" | "runtime-owned-executor-port" {
  return calls.some((call) => call.startsWith("run:")) ? "real-host-command" : "runtime-owned-executor-port";
}

async function summarizeDialogueTurn(input: {
  userPrompt: string;
  toolId: string;
  toolCall: unknown;
  toolResult: unknown;
  calls: readonly string[];
}): Promise<string> {
  return await callResponsesApi(
    [
      "你正在完成一次 Praxis agentCore 真实对话工具回合。",
      "请用中文给出最终回答，必须说明工具是否调用成功、关键输出、runtime 调用了哪个 executor port。",
      "不要输出 JSON，不要声称没有工具。",
      `用户请求：${input.userPrompt}`,
      `工具：${input.toolId}`,
      `executor calls：${input.calls.join(", ")}`,
      `工具调用：${truncateText(input.toolCall)}`,
      `工具结果：${truncateText(input.toolResult)}`,
    ].join("\n"),
    "你是 Praxis agentCore 的最终回答层。工具已经执行完毕，请把工具结果解释给用户。",
  );
}

async function main(): Promise<void> {
  const onlyTool = argValue("--tool");
  const limit = Number(argValue("--limit") ?? shellLiveToolCases.length);
  const selected = shellLiveToolCases
    .filter((testCase) => onlyTool === undefined || testCase.toolId === onlyTool)
    .slice(0, Number.isFinite(limit) && limit > 0 ? limit : shellLiveToolCases.length);

  const runtimeContext = {
    runtimeId: "configuration:temporary-shell-live-matrix",
    applicationId: "agentcore-shell-live-matrix-app",
    sessionId: "agentcore-shell-live-matrix-session",
  };

  const results = [];
  if (dialogueMode) {
    console.log(`agentCore shell dialogue suite`);
    console.log(`model=${model}`);
    console.log(`reasoning.effort=${reasoningEffort}`);
    console.log(`mode=${useModel ? "live-model-plus-registry-handler-plus-final-answer" : "registry-handler-only"}`);
    console.log("");
  }

  for (const testCase of selected) {
    const calls: string[] = [];
    let modelText = "";
    let toolCall = shellToolCallFromCase(testCase);
    let modelOk = true;
    let modelError: string | undefined;

    if (useModel) {
      const prompt = [
        "请模拟一次真实 agentCore 对话里的工具调用。",
        `用户请求：${testCase.userPrompt}`,
        `必须调用工具：${testCase.toolId}`,
        "必须使用以下 arguments，不能改字段名，不能省略 context：",
        JSON.stringify(testCase.input, null, 2),
        "只返回：{\"tool_calls\":[{\"tool\":\"...\",\"arguments\":{...}}]}",
      ].join("\n");

      try {
        modelText = await callResponsesApi(prompt);
        const parsedToolCall = normalizeShellLiveToolCall(parseJsonObject(modelText));
        if (parsedToolCall === undefined) {
          modelOk = false;
          modelError = "MODEL_DID_NOT_RETURN_TOOL_CALL";
        } else if (parsedToolCall.tool !== testCase.toolId) {
          modelOk = false;
          modelError = `MODEL_TOOL_MISMATCH:${parsedToolCall.tool}`;
          toolCall = parsedToolCall;
        } else {
          toolCall = parsedToolCall;
        }
      } catch (error) {
        modelOk = false;
        modelError = error instanceof Error ? error.message : String(error);
      }
    }

    const toolResult = await invokeShellToolThroughRuntimeChain(
      runtimeContext,
      toolCall,
      createFullShellExecutor(architectureRoot, calls),
      calls,
    );
    const expectedCallOk = expectedCallSeen(testCase.expectedCall, calls);
    const ok = modelOk && toolResult.ok === true && expectedCallOk;
    let finalAnswer = "";
    if (dialogueMode && useModel) {
      finalAnswer = await summarizeDialogueTurn({
        userPrompt: testCase.userPrompt,
        toolId: testCase.toolId,
        toolCall,
        toolResult,
        calls,
      });
    }

    const record = {
      ok,
      toolId: testCase.toolId,
      modelOk,
      modelError,
      expectedCallOk,
      expectedCall: String(testCase.expectedCall),
      calls,
      executorMode: executorMode(calls),
      resultOk: toolResult.ok,
      error: toolResult.error,
      outputPreview: JSON.stringify(toolResult.output ?? null).slice(0, 500),
      modelPreview: modelText.slice(0, 500),
      finalAnswerPreview: finalAnswer.slice(0, 500),
    };
    results.push(record);
    if (dialogueMode) {
      console.log(`[${results.length}/${selected.length}] user> ${testCase.userPrompt}`);
      console.log(`model tool_call> ${modelOk ? toolCall.tool : `FAILED ${modelError}`}`);
      console.log(`runtime> ok=${toolResult.ok} executor=${record.executorMode} calls=${calls.join(", ") || "(none)"}`);
      console.log(`agentCore> ${finalAnswer || record.outputPreview}`);
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
  console.error(`agentCore shell live matrix fatal> ${message}`);
  process.exitCode = 1;
});
