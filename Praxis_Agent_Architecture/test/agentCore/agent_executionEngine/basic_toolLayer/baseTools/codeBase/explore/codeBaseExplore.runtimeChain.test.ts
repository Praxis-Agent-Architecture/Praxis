import assert from "node:assert/strict";
import test from "node:test";

import type { BaseToolExecutorPort } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import { adaptRuntimeToolInvocation } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/invocationAdapter.js";
import { bridgeExecEngineInvocation } from "../../../../../../../src/agentCore/agent_runtimeImplementation/runtime.execEngine/execEngineInvocationBridge.js";

type ChainInvokeResult = {
  ok: boolean;
  toolId: string;
  output?: unknown;
  error?: { code: string; publicSafe: true };
};

const runtimeId = "code-explore-runtime-chain-1";
const sessionId = "code-explore-session-chain-1";

function createRecordingExecutor(calls: string[]): BaseToolExecutorPort {
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
            matches: [{ path: `${request.directoryPath}/a.ts`, line: 1, text: request.query }],
          },
        };
      },
    },
  };
}

async function invokeThroughRuntimeChain(
  toolId: string,
  input: Readonly<Record<string, unknown>>,
  executor: BaseToolExecutorPort,
): Promise<ChainInvokeResult> {
  const toolCallId = `${toolId}:runtime-chain`;
  const adapted = adaptRuntimeToolInvocation({
    context: {
      runtimeId,
      sessionId,
      invocationId: toolCallId,
      requestedScopes: ["tool.execute", `tool.${toolId}`],
      allowedScopes: ["tool.execute", `tool.${toolId}`],
      auditMetadata: { test: "codeBaseExplore.runtimeChain" },
    },
    toolId,
    operation: toolId,
    arguments: input,
    resourceLimits: { timeoutMs: 1000, maxOutputBytes: 8000 },
  });
  assert.equal(adapted.ok, true, `${toolId} must pass the runtime tool invocation adapter`);
  if (!adapted.ok) throw new Error(`${toolId} adapter failed`);

  const bridged = bridgeExecEngineInvocation({
    runtimeId,
    caller: { kind: "application", id: "code-explore-runtime-chain-test", sessionId },
    invocation: {
      invocationId: toolCallId,
      kind: "tool",
      target: toolId,
      payload: adapted.invocation,
      auditRef: adapted.invocation.audit.event,
    },
    runtimeReady: true,
  });
  assert.equal(bridged.ok, true, `${toolId} must pass the execEngine invocation bridge`);
  if (!bridged.ok) throw new Error(`${toolId} bridge failed`);

  const lookup = createBaseToolRegistry().lookupHandler(toolId);
  assert.equal(lookup.ok, true, `${toolId} must be mounted in the baseTool registry`);
  if (!lookup.ok) throw new Error(`${toolId} registry lookup failed`);

  return lookup.handler.invoke({ toolCallId, runtimeId, sessionId, input, executor });
}

test("codeBase explore runtime chain reaches runtime support ports through registry handlers", async () => {
  const calls: string[] = [];
  const executor = createRecordingExecutor(calls);
  const context = { dryRun: false, guard: { allowed: true } } as const;
  const cases: Array<{ toolId: string; input: Readonly<Record<string, unknown>>; expectedCall: string }> = [
    { toolId: "code.read", input: { targetPath: "src/index.ts", context }, expectedCall: "readText:src/index.ts" },
    { toolId: "code.scan", input: { directoryPath: "src", context }, expectedCall: "list:src" },
    {
      toolId: "code.search_Ripgrep",
      input: { query: "needle", directoryPath: "src", context },
      expectedCall: "ripgrep:needle:src",
    },
  ];

  for (const testCase of cases) {
    const before = calls.length;
    const result = await invokeThroughRuntimeChain(testCase.toolId, testCase.input, executor);
    assert.equal(result.ok, true, `${testCase.toolId} should complete through the runtime chain: ${JSON.stringify(result)}`);
    assert.ok(calls.slice(before).includes(testCase.expectedCall), `${testCase.toolId} should call ${testCase.expectedCall}`);
  }
});

test("codeBase explore runtime chain rejects missing providers and denied guards before provider dispatch", async () => {
  const missingProvider = await invokeThroughRuntimeChain(
    "code.search_Ripgrep",
    { query: "needle", directoryPath: "src", context: { dryRun: false, guard: { allowed: true } } },
    {},
  );
  assert.equal(missingProvider.ok, false);
  assert.equal(missingProvider.error?.code, "EXECUTOR_NOT_INJECTED");
  assert.equal(missingProvider.error?.publicSafe, true);

  const calls: string[] = [];
  const denied = await invokeThroughRuntimeChain(
    "code.read",
    { targetPath: "src/index.ts", context: { dryRun: false, guard: { allowed: false, reason: "blocked" } } },
    createRecordingExecutor(calls),
  );
  assert.equal(denied.ok, false);
  assert.equal(denied.error?.code, "GOVERNANCE_REJECTED");
  assert.equal(calls.includes("readText:src/index.ts"), false, "denied guard must reject before provider dispatch");
});
