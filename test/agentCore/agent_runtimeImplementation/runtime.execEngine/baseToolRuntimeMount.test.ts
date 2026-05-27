import assert from "node:assert/strict";
import test from "node:test";

import type { BaseToolExecutorPort } from "../../../../src/basetool/types.js";
import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import {
  baseToolRuntimeMountDescriptor,
  invokeMountedBaseTool,
} from "../../../../src/runtimeImplementation/runtime.execEngine/baseToolRuntimeMount.js";

defineAgentCoreContractTest({
  sourcePath: "src/runtimeImplementation/runtime.execEngine/baseToolRuntimeMount.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.execEngine/baseToolRuntimeMount.md",
  testFileUrl: import.meta.url,
});

test("baseToolRuntimeMount invokes a registry handler through BaseToolExecutorPort", async () => {
  let receivedUrl = "";
  const executor: BaseToolExecutorPort = {
    network: {
      async fetch(request) {
        receivedUrl = request.url;
        return {
          ok: true,
          output: {
            status: 200,
            headers: { "content-type": "text/plain" },
            body: "ok",
          },
        };
      },
    },
  };

  const result = await invokeMountedBaseTool({
    runtimeId: "runtime-base-tool-1",
    sessionId: "session-base-tool-1",
    toolId: "web.fetch",
    toolCallId: "fetch-call-1",
    input: {
      url: "https://example.com/docs",
      context: {
        dryRun: false,
        guard: { accepted: true },
        grantedPermissions: ["network:read", "web:fetch"],
      },
    },
    executor,
    runtimeReady: true,
    requestedScopes: ["tool.execute", "tool.web.fetch"],
    allowedScopes: ["tool.execute", "tool.web.fetch"],
    metadata: { test: "baseToolRuntimeMount" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected mounted baseTool invocation to succeed");
  }

  assert.equal(receivedUrl, "https://example.com/docs");
  assert.equal(result.invocation.runtimeId, "runtime-base-tool-1");
  assert.equal(result.invocation.sessionId, "session-base-tool-1");
  assert.equal(result.invocation.toolId, "web.fetch");
  assert.equal(result.invocation.family, "core");
  assert.equal(result.invocation.mountedVia, "createBaseToolRegistry.lookupHandler");
  assert.equal(result.invocation.executorPort, "BaseToolExecutorPort");
  assert.equal(result.invocation.toolResultOk, true);
  assert.equal(result.invocation.runtimeReadiness.decision, "allowed");
  assert.equal(result.toolResult.ok, true);
  assert.ok(result.events.includes("runtime.execEngine.invocationBridge.planned"));
  assert.ok(result.events.includes("basetool.supportCatalog.preflight.allowed"));
  assert.ok(result.events.includes("basetool.core.web.fetch.runtimePort"));
  assert.deepEqual(baseToolRuntimeMountDescriptor.chain.slice(0, 2), [
    "agentCore.basicTool.invocationAdapter",
    "runtime.execEngine.invocationBridge",
  ]);
});

test("baseToolRuntimeMount can invoke governed runtime-owned MCP adapters", async () => {
  let dispatched = false;
  const executor: BaseToolExecutorPort = {
    mcp: {
      async call() {
        dispatched = true;
        return {
          ok: true,
          output: { callId: "mcp-1", status: "called" },
        };
      },
    },
  };

  const result = await invokeMountedBaseTool({
    runtimeId: "runtime-base-tool-2",
    sessionId: "session-base-tool-2",
    toolId: "mcp.use",
    toolCallId: "mcp-connect-call-1",
    input: {
      toolName: "ping",
      serverId: "local",
      arguments: {},
      context: {
        dryRun: false,
        guard: { accepted: true },
      },
    },
    executor,
    runtimeReady: true,
  });

  assert.equal(result.ok, true);
  assert.equal(dispatched, true);
  if (!result.ok) throw new Error("expected runtime-owned MCP mount to succeed");
  assert.equal(result.invocation.runtimeReadiness.decision, "allowed");
  assert.equal(result.toolResult.ok, true);
});

test("baseToolRuntimeMount rejects missing executors and missing handlers before dispatch", async () => {
  const missingExecutor = await invokeMountedBaseTool({
    runtimeId: "runtime-base-tool-1",
    sessionId: "session-base-tool-1",
    toolId: "web.fetch",
  });
  assert.equal(missingExecutor.ok, false);
  if (!missingExecutor.ok) {
    assert.equal(missingExecutor.error.code, "MISSING_EXECUTOR");
    assert.equal(missingExecutor.error.boundary, "input");
  }

  const missingTool = await invokeMountedBaseTool({
    runtimeId: "runtime-base-tool-1",
    sessionId: "session-base-tool-1",
    toolId: "unknown.tool",
    executor: {},
  });
  assert.equal(missingTool.ok, false);
  if (!missingTool.ok) {
    assert.equal(missingTool.error.code, "TOOL_NOT_FOUND");
    assert.equal(missingTool.error.boundary, "registry");
  }
});
