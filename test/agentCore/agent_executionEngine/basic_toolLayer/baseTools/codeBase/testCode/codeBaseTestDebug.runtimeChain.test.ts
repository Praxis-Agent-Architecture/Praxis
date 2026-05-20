import assert from "node:assert/strict";
import test from "node:test";

import type { BaseToolExecutorPort } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import { adaptRuntimeToolInvocation } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/invocationAdapter.js";
import { bridgeExecEngineInvocation } from "../../../../../../../src/agentCore_runtimeImplementation/runtime.execEngine/execEngineInvocationBridge.js";

const runtimeId = "code-test-debug-runtime-chain-1";
const sessionId = "code-test-debug-session-chain-1";

function createExecutor(calls: string[]): BaseToolExecutorPort {
  return {
    process: {
      async run(request) {
        calls.push(`process.run:${request.intent}:${request.command}:${request.args?.join(" ") ?? ""}`);
        return { ok: true, output: { exitCode: 0, stdout: "ok\n", stderr: "", durationMs: 3 } };
      },
    },
    debug: {
      async collectLogs(request) {
        calls.push(`debug.collectLogs:${request.sources.length}`);
        return { ok: true, output: { entries: [{ source: "debug", level: "info", message: "ready" }], truncated: false } };
      },
      async captureState(request) {
        calls.push(`debug.captureState:${String(request.target.id)}`);
        return { ok: true, output: { state: "paused", stack: [{ name: "main", line: 1 }], variables: [{ name: "x", valuePreview: "1" }], breakpoints: [] } };
      },
      async launch(request) {
        calls.push(`debug.launch:${String(request.target.kind)}`);
        return { ok: true, output: { debugSessionId: "debug-1", state: "launched", breakpointsAccepted: request.breakpoints?.length ?? 0 } };
      },
    },
  };
}

async function invoke(toolId: string, input: Readonly<Record<string, unknown>>, executor: BaseToolExecutorPort) {
  const toolCallId = `${toolId}:runtime-chain`;
  const adapted = adaptRuntimeToolInvocation({
    context: {
      runtimeId,
      sessionId,
      invocationId: toolCallId,
      requestedScopes: ["tool.execute", `tool.${toolId}`],
      allowedScopes: ["tool.execute", `tool.${toolId}`],
      auditMetadata: { test: "codeBaseTestDebug.runtimeChain" },
    },
    toolId,
    operation: toolId,
    arguments: input,
    resourceLimits: { timeoutMs: 1000, maxOutputBytes: 8000 },
  });
  assert.equal(adapted.ok, true);
  if (!adapted.ok) throw new Error("adapter failed");

  const bridged = bridgeExecEngineInvocation({
    runtimeId,
    caller: { kind: "application", id: "code-test-debug-runtime-chain-test", sessionId },
    invocation: { invocationId: toolCallId, kind: "tool", target: toolId, payload: adapted.invocation, auditRef: adapted.invocation.audit.event },
    runtimeReady: true,
  });
  assert.equal(bridged.ok, true);
  if (!bridged.ok) throw new Error("bridge failed");

  const lookup = createBaseToolRegistry().lookupHandler(toolId);
  assert.equal(lookup.ok, true, `${toolId} must be mounted`);
  if (!lookup.ok) throw new Error("lookup failed");
  return lookup.handler.invoke({ toolCallId, runtimeId, sessionId, input, executor });
}

test("codeBase test/debug runtime chain reaches process and debug runtime support ports", async () => {
  const calls: string[] = [];
  const executor = createExecutor(calls);
  const context = { dryRun: false, guard: { allowed: true, accepted: true } } as const;
  const cases: Array<{ toolId: string; input: Readonly<Record<string, unknown>>; expectedCall: string }> = [
    { toolId: "code.testCode", input: { workspaceRoot: "/workspace", testTarget: "test/a.test.ts", command: ["node", "--test", "test/a.test.ts"], context }, expectedCall: "process.run:test:node:--test test/a.test.ts" },
    { toolId: "code.benchmark", input: { workspaceRoot: "/workspace", benchmarkTarget: "bench/a.js", command: ["node", "bench/a.js"], iterations: 1, context }, expectedCall: "process.run:benchmark:node:bench/a.js" },
    { toolId: "code.debugCollectLogs", input: { sources: [{ kind: "debug-console", id: "debug-1" }], context }, expectedCall: "debug.collectLogs:1" },
    { toolId: "code.debugCaptureState", input: { target: { kind: "debug-session", id: "debug-1" }, context }, expectedCall: "debug.captureState:debug-1" },
    { toolId: "code.debugRun", input: { target: { kind: "test", label: "unit", command: ["node", "--test"] }, breakpoints: [{ file: "src/a.ts", line: 1 }], context }, expectedCall: "debug.launch:test" },
  ];

  for (const testCase of cases) {
    const result = await invoke(testCase.toolId, testCase.input, executor);
    assert.equal(result.ok, true, `${testCase.toolId} should complete: ${JSON.stringify(result)}`);
    assert.ok(calls.includes(testCase.expectedCall), `${testCase.toolId} should call ${testCase.expectedCall}`);
  }
});

test("codeBase test/debug registry chain rejects missing providers and denied guards before dispatch", async () => {
  const missingProvider = await invoke(
    "code.testCode",
    { workspaceRoot: "/workspace", testTarget: "test/a.test.ts", command: ["node", "--test"], context: { dryRun: false, guard: { allowed: true } } },
    {},
  );
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");

  const calls: string[] = [];
  const denied = await invoke(
    "code.debugRun",
    { target: { kind: "test", label: "unit" }, context: { dryRun: false, guard: { allowed: false, reason: "blocked" } } },
    createExecutor(calls),
  );
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.error.code, "GOVERNANCE_REJECTED");
  assert.equal(calls.some((call) => call.startsWith("debug.launch")), false);
});
