import type { BaseToolExecutorPort } from "../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import { adaptRuntimeToolInvocation } from "../../src/agentCore/agent_executionEngine/basic_toolLayer/invocationAdapter.js";
import { bridgeExecEngineInvocation } from "../../src/agentCore/agent_runtimeImplementation/runtime.execEngine/execEngineInvocationBridge.js";

const args = process.argv.slice(2);
const argSet = new Set(args);

type SearchCase = {
  toolId: string;
  input: Readonly<Record<string, unknown>>;
  expectedCall: string | RegExp;
};

const governedContext = {
  dryRun: false,
  guard: { allowed: true, accepted: true },
  grantedPermissions: ["network:read", "network:search", "search:fetch", "search:native", "search:read", "grounding:audit"],
} as const;

const searchCases: readonly SearchCase[] = [
  {
    toolId: "search.fetch",
    input: {
      target: { url: "https://example.com", method: "GET", maxBytes: 4096, timeoutMs: 10_000 },
      context: governedContext,
    },
    expectedCall: "network.fetch:https://example.com/",
  },
  {
    toolId: "search.searchEngine",
    input: {
      target: { query: "Praxis AgentCore BaseTool", provider: "generic", maxResults: 2 },
      context: governedContext,
    },
    expectedCall: "network.search:Praxis AgentCore BaseTool",
  },
  {
    toolId: "search.nativeSearch",
    input: {
      target: { provider: "openai", query: "Praxis AgentCore native search smoke", maxResults: 2, citations: "required" },
      context: governedContext,
    },
    expectedCall: "network.nativeWebSearch:openai:Praxis AgentCore native search smoke",
  },
  {
    toolId: "search.ground",
    input: {
      target: {
        claim: "Praxis AgentCore search.ground is mounted through BaseToolExecutorPort.network.ground",
        evidence: [
          {
            id: "search-matrix-evidence",
            url: "https://example.com/search-matrix-evidence",
            title: "Search matrix evidence",
            excerpt: "The deterministic search matrix evidence proves the handler path reaches network.ground.",
          },
        ],
        provider: "generic",
        citations: "required",
      },
      context: governedContext,
    },
    expectedCall: "network.ground:Praxis AgentCore search.ground is mounted through BaseToolExecutorPort.network.ground",
  },
] as const;

function createSearchExecutor(calls: string[]): BaseToolExecutorPort {
  return {
    network: {
      async fetch(request) {
        const normalizedUrl = new URL(request.url).toString();
        calls.push(`network.fetch:${normalizedUrl}`);
        return {
          ok: true,
          output: {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" },
            body: "<html><body>Example Domain</body></html>",
            finalUrl: normalizedUrl,
          },
          metadata: { runtimeEntry: "BaseToolExecutorPort.network.fetch", labMode: "deterministic-fetch" },
        };
      },
      async search(request) {
        calls.push(`network.search:${request.query}`);
        return {
          ok: true,
          output: {
            results: [
              {
                title: `Search matrix result for ${request.query}`,
                url: "https://example.com/search-matrix-result",
                snippet: "Deterministic network.search result proving search.searchEngine reaches the runtime executor port.",
              },
            ].slice(0, request.maxResults ?? 10),
            providerMetadata: { runtimeEntry: "BaseToolExecutorPort.network.search", provider: request.provider ?? "generic" },
          },
        };
      },
      async nativeWebSearch(request) {
        calls.push(`network.nativeWebSearch:${request.provider}:${request.query}`);
        return {
          ok: true,
          output: {
            answer: `Native search matrix answer for ${request.query}`,
            sources: [
              {
                title: "Provider native search source",
                url: "https://example.com/native-search-source",
                snippet: "Deterministic native provider search result.",
                kind: "provider_native" as const,
              },
            ],
            citations: [
              {
                url: "https://example.com/native-search-source",
                title: "Provider native search source",
                snippet: "Deterministic native provider search result.",
                providerReference: "search-matrix-native",
              },
            ],
            providerMetadata: { runtimeEntry: "BaseToolExecutorPort.network.nativeWebSearch", provider: request.provider },
          },
        };
      },
      async ground(request) {
        calls.push(`network.ground:${request.claim}`);
        const firstEvidence = request.evidence[0];
        return {
          ok: true,
          output: {
            answer: `Grounded by search matrix: ${request.claim}`,
            grounded: true,
            status: "grounded" as const,
            confidence: "high" as const,
            citations: [
              {
                url: firstEvidence?.url ?? "https://example.com/search-matrix-evidence",
                title: firstEvidence?.title,
                snippet: firstEvidence?.excerpt,
                providerReference: "search-matrix-ground",
              },
            ],
            sources: [
              {
                url: firstEvidence?.url ?? "https://example.com/search-matrix-evidence",
                title: firstEvidence?.title,
                snippet: firstEvidence?.excerpt,
                kind: "citation" as const,
              },
            ],
            providerMetadata: { runtimeEntry: "BaseToolExecutorPort.network.ground", provider: request.provider ?? "generic" },
          },
        };
      },
    },
  };
}

async function invokeSearchToolThroughRuntimeChain(
  toolId: string,
  input: Readonly<Record<string, unknown>>,
  executor: BaseToolExecutorPort,
): Promise<{ ok: boolean; output?: unknown; error?: unknown }> {
  const toolCallId = `${toolId}:search-live-matrix`;
  const runtimeId = "agentcore-search-live-matrix-runtime";
  const sessionId = "agentcore-search-live-matrix-session";
  const adapted = adaptRuntimeToolInvocation({
    context: { runtimeId, sessionId, invocationId: toolCallId },
    toolId,
    operation: toolId,
    arguments: input,
    resourceLimits: { timeoutMs: 15_000, maxOutputBytes: 12_000 },
  });
  if (!adapted.ok) return { ok: false, error: adapted.error };
  const bridged = bridgeExecEngineInvocation({
    runtimeId,
    caller: { kind: "application", id: "agentcore-search-live-matrix", sessionId },
    invocation: { invocationId: toolCallId, kind: "tool", target: toolId, payload: adapted.invocation, auditRef: adapted.invocation.audit.event },
    runtimeReady: true,
  });
  if (!bridged.ok) return { ok: false, error: bridged.error };
  const lookup = createBaseToolRegistry().lookupHandler(toolId);
  if (!lookup.ok) return { ok: false, error: lookup.error };
  return lookup.handler.invoke({ toolCallId, runtimeId, sessionId, input, executor });
}

function callMatches(calls: readonly string[], expected: string | RegExp): boolean {
  return calls.some((call) => typeof expected === "string" ? call === expected : expected.test(call));
}

function truncate(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2) ?? "";
  return text.length > 900 ? `${text.slice(0, 900)}...<truncated>` : text;
}

async function main(): Promise<void> {
  if (!argSet.has("--no-model")) {
    console.log("agentCore search live matrix currently runs deterministic no-model runtime smoke; pass --no-model for the strict registry/handler/executor path.");
  }
  const results = [];
  for (const testCase of searchCases) {
    const calls: string[] = [];
    const result = await invokeSearchToolThroughRuntimeChain(testCase.toolId, testCase.input, createSearchExecutor(calls));
    const expectedCallOk = callMatches(calls, testCase.expectedCall);
    const ok = result.ok && expectedCallOk;
    const record = {
      ok,
      toolId: testCase.toolId,
      expectedCallOk,
      expectedCall: String(testCase.expectedCall),
      calls,
      resultOk: result.ok,
      outputPreview: truncate(result.ok ? result.output : result.error),
    };
    results.push(record);
    console.log(JSON.stringify(record));
  }
  const failedTools = results.filter((result) => !result.ok).map((result) => result.toolId);
  const summary = {
    ok: failedTools.length === 0,
    mode: "registry-handler-only",
    total: results.length,
    passed: results.length - failedTools.length,
    failed: failedTools.length,
    failedTools,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) process.exitCode = 1;
}

await main();
