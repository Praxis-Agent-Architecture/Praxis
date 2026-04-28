import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeMcpNativeExecute,
  mcpNativeExecuteDescriptor,
  mcpNativeExecuteHandler,
  planMcpNativeExecute,
  type McpNativeExecuteProviderRequest,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/execution/mcp.nativeExecute.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/execution/mcp.nativeExecute.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/execution/mcp.nativeExecute.md",
  testFileUrl: import.meta.url,
});

test("planMcpNativeExecute returns a governed dry-run native MCP envelope", () => {
  const result = planMcpNativeExecute({
    target: {
      serverId: " fs-mcp ",
      method: " tools/call ",
      params: { name: "read_file" },
      protocolVersion: "2025-06-18",
      idempotencyKey: " native-1 ",
    },
    context: {
      invocationId: " invoke-1 ",
      allowedServerIds: ["fs-mcp"],
      grantedPermissions: ["mcp:native-execute", "mcp:raw"],
    },
  });

  if (!result.ok) {
    assert.fail(result.error.message);
  }

  assert.equal(result.toolId, "mcp.nativeExecute");
  assert.equal(result.output.target.serverId, "fs-mcp");
  assert.equal(result.output.nativeEnvelope.method, "tools/call");
  assert.deepEqual(result.output.nativeEnvelope.params, { name: "read_file" });
  assert.equal(result.output.nativeEnvelope.protocolVersion, "2025-06-18");
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.providerCalled, false);
  assert.equal(mcpNativeExecuteDescriptor.tapOwnsApproval, true);
});

test("planMcpNativeExecute rejects empty input with a public-safe error", () => {
  const result = planMcpNativeExecute();

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("empty MCP native execute input should fail");
  }

  assert.equal(result.error.code, "MISSING_SERVER_ID");
  assert.equal(result.error.boundary, "input");
  assert.equal(result.error.publicSafe, true);
});

test("planMcpNativeExecute rejects invalid params, missing permissions, and real execution", () => {
  const invalidParams = planMcpNativeExecute({
    target: {
      serverId: "fs-mcp",
      method: "tools/call",
      params: ["not", "a", "record"] as unknown as Record<string, unknown>,
    },
  });

  assert.equal(invalidParams.ok, false);
  if (invalidParams.ok) {
    assert.fail("native params should be a record");
  }
  assert.equal(invalidParams.error.code, "INVALID_PARAMS");

  const missingPermission = planMcpNativeExecute({
    target: { serverId: "fs-mcp", method: "tools/call" },
    context: { grantedPermissions: ["mcp:native-execute"] },
  });

  assert.equal(missingPermission.ok, false);
  if (missingPermission.ok) {
    assert.fail("native execution should require raw MCP permission");
  }
  assert.equal(missingPermission.error.code, "PERMISSION_DENIED");

  const realExecution = planMcpNativeExecute({
    target: { serverId: "fs-mcp", method: "tools/call" },
    context: { dryRun: false },
  });

  assert.equal(realExecution.ok, false);
  if (realExecution.ok) {
    assert.fail("real native MCP execution should be blocked");
  }
  assert.equal(realExecution.error.code, "REAL_EXECUTION_BLOCKED");
});

test("executeMcpNativeExecute keeps dry-run provider-free and calls provider after guard", async () => {
  let calls = 0;
  const dryRun = await executeMcpNativeExecute(
    {
      target: { serverId: "fs-mcp", method: "tools/list" },
      provider: async () => {
        calls += 1;
        return { status: "executed" };
      },
    },
  );

  assert.equal(dryRun.ok, true);
  if (!dryRun.ok) assert.fail("dry-run should succeed");
  assert.equal(dryRun.output.providerCalled, false);
  assert.equal(calls, 0);

  const executed = await executeMcpNativeExecute(
    {
      target: { serverId: "fs-mcp", method: "tools/list", params: {} },
      context: {
        dryRun: false,
        guard: { accepted: true },
        allowedServerIds: ["fs-mcp"],
        grantedPermissions: ["mcp:native-execute", "mcp:raw"],
      },
      provider: async (request: McpNativeExecuteProviderRequest) => {
        calls += 1;
        assert.equal(request.method, "tools/list");
        return {
          status: "executed",
          result: { tools: [{ name: "read_file" }] },
          providerMetadata: { runtimeEntry: "BaseToolExecutorPort.mcp.nativeExecute" },
        };
      },
    },
  );

  assert.equal(executed.ok, true);
  if (!executed.ok) assert.fail("guarded native execution should succeed");
  assert.equal(calls, 1);
  assert.equal(executed.output.providerCalled, true);
  assert.equal(executed.output.nativeEnvelope.state, "executed");
  assert.deepEqual(executed.output.nativeEnvelope.result, { tools: [{ name: "read_file" }] });
});

test("executeMcpNativeExecute reports missing guard, missing provider, provider throw, and malformed JSON safely", async () => {
  const missingGuard = await executeMcpNativeExecute({
    target: { serverId: "fs-mcp", method: "tools/list" },
    context: { dryRun: false, grantedPermissions: ["mcp:native-execute", "mcp:raw"] },
  });
  assert.equal(missingGuard.ok, false);
  if (missingGuard.ok) assert.fail("missing guard should reject");
  assert.equal(missingGuard.error.code, "GOVERNANCE_REJECTED");
  assert.equal(missingGuard.error.safeForRuntimeInspection, true);

  const missingProvider = await executeMcpNativeExecute({
    target: { serverId: "fs-mcp", method: "tools/list" },
    context: { dryRun: false, guard: { accepted: true }, grantedPermissions: ["mcp:native-execute", "mcp:raw"] },
  });
  assert.equal(missingProvider.ok, false);
  if (missingProvider.ok) assert.fail("missing provider should reject");
  assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");

  const providerThrow = await executeMcpNativeExecute(
    {
      target: { serverId: "fs-mcp", method: "tools/list" },
      context: { dryRun: false, guard: { accepted: true }, grantedPermissions: ["mcp:native-execute", "mcp:raw"] },
      provider: async () => {
        throw new Error("raw secret provider stack");
      },
    },
  );
  assert.equal(providerThrow.ok, false);
  if (providerThrow.ok) assert.fail("provider throw should map to public-safe error");
  assert.equal(providerThrow.error.code, "PROVIDER_REJECTED");
  assert.equal(providerThrow.error.internalDetailExposed, false);

  const malformed = await executeMcpNativeExecute({ target: { serverId: 1, method: "tools/list", params: [] } });
  assert.equal(malformed.ok, false);
  if (malformed.ok) assert.fail("malformed native request should reject");
  assert.equal(malformed.error.publicSafe, true);
});

test("mcpNativeExecuteHandler and registry invoke runtime-owned provider", async () => {
  const executor = {
    mcp: {
      async nativeExecute(request: { serverId: string; method: string }) {
        assert.equal(request.serverId, "fs-mcp");
        assert.equal(request.method, "tools/list");
        return {
          ok: true as const,
          output: {
            status: "executed" as const,
            result: { tools: [] },
            providerMetadata: { runtimeEntry: "BaseToolExecutorPort.mcp.nativeExecute" },
          },
        };
      },
    },
  };

  const handlerResult = await mcpNativeExecuteHandler.invoke({
    toolCallId: "native-handler-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      target: { serverId: "fs-mcp", method: "tools/list" },
      context: { dryRun: false, guard: { accepted: true }, grantedPermissions: ["mcp:native-execute", "mcp:raw"] },
    },
    executor,
  });

  assert.equal(handlerResult.ok, true);
  if (!handlerResult.ok) assert.fail("handler should invoke native executor");
  assert.equal(handlerResult.output.providerCalled, true);

  const lookup = createBaseToolRegistry().lookupHandler("mcp.nativeExecute");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) assert.fail("registry should resolve mcp.nativeExecute");
  const registryResult = await lookup.handler.invoke({
    toolCallId: "native-registry-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      target: { serverId: "fs-mcp", method: "tools/list" },
      context: { dryRun: false, guard: { accepted: true }, grantedPermissions: ["mcp:native-execute", "mcp:raw"] },
    },
    executor,
  });
  assert.equal(registryResult.ok, true);
  if (!registryResult.ok) assert.fail("registry handler should invoke native executor");
  const registryOutput = registryResult.output as { providerMetadata?: { runtimeEntry?: string } };
  assert.equal(registryOutput.providerMetadata?.runtimeEntry, "BaseToolExecutorPort.mcp.nativeExecute");
});
