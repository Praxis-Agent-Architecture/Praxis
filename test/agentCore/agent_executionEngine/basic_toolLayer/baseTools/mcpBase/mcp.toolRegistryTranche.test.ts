import assert from "node:assert/strict";
import test from "node:test";

import type { BaseToolExecutorPort } from "../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import { executeMcpToolRegistration } from "../../../../../../src/executionEngine/basic_toolLayer/baseTools/mcpBase/tool/mcp.registerTool.js";
import { executeMcpToolUnregistration } from "../../../../../../src/executionEngine/basic_toolLayer/baseTools/mcpBase/tool/mcp.unregisterTool.js";
import { executeMcpToolUpdate } from "../../../../../../src/executionEngine/basic_toolLayer/baseTools/mcpBase/tool/mcp.updateTool.js";

const acceptedContext = (overrides: Record<string, unknown> = {}) => ({
  dryRun: false,
  guard: { accepted: true },
  allowedServerIds: ["fs-mcp"],
  grantedPermissions: ["mcp:tool:read", "mcp:tool:write"],
  ...overrides,
});

test("mcp tool registry tranche dry-runs without provider calls", async () => {
  let calls = 0;
  const provider = () => {
    calls += 1;
    return { status: "registered" as const };
  };

  const result = await executeMcpToolRegistration({
    target: { serverId: "fs-mcp", tool: { name: "dynamic_echo" } },
    context: { grantedPermissions: ["mcp:tool:read", "mcp:tool:write"] },
  }, provider);

  assert.equal(result.ok, true);
  assert.equal(calls, 0);
  if (result.ok) {
    assert.equal(result.output.providerCalled, false);
    assert.equal(result.output.registryEnvelope.state, "planned");
  }
});

test("mcp tool registry tranche dispatches accepted guarded calls to fake provider", async () => {
  const register = await executeMcpToolRegistration({
    target: { serverId: "fs-mcp", tool: { name: "dynamic_echo", inputSchema: { type: "object" } }, replaceExisting: true },
    context: acceptedContext(),
  }, (request) => ({ name: request.tool.name, status: "registered", providerMetadata: { runtimeEntry: "BaseToolExecutorPort.mcp.registerTool" } }));
  assert.equal(register.ok, true);
  if (register.ok) {
    assert.equal(register.output.providerCalled, true);
    assert.equal(register.output.registryEnvelope.state, "registered");
  }

  const update = await executeMcpToolUpdate({
    target: { serverId: "fs-mcp", toolName: "dynamic_echo", patch: { description: "Updated" } },
    context: acceptedContext(),
  }, (request) => ({ toolName: request.toolName, status: "updated", providerMetadata: { runtimeEntry: "BaseToolExecutorPort.mcp.updateTool" } }));
  assert.equal(update.ok, true);
  if (update.ok) assert.equal(update.output.registryEnvelope.state, "updated");

  const unregister = await executeMcpToolUnregistration({
    target: { serverId: "fs-mcp", toolName: "dynamic_echo" },
    context: acceptedContext(),
  }, (request) => ({ toolName: request.toolName, status: "unregistered", providerMetadata: { runtimeEntry: "BaseToolExecutorPort.mcp.unregisterTool" } }));
  assert.equal(unregister.ok, true);
  if (unregister.ok) assert.equal(unregister.output.registryEnvelope.state, "unregistered");
});

test("mcp tool registry tranche rejects missing provider, missing guard, provider throw, and malformed JSON safely", async () => {
  const missingProvider = await executeMcpToolRegistration({
    target: { serverId: "fs-mcp", tool: { name: "dynamic_echo" } },
    context: acceptedContext(),
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");

  const missingGuard = await executeMcpToolUpdate({
    target: { serverId: "fs-mcp", toolName: "dynamic_echo", patch: { description: "Updated" } },
    context: acceptedContext({ guard: undefined }),
  }, () => ({ status: "updated" }));
  assert.equal(missingGuard.ok, false);
  if (!missingGuard.ok) assert.equal(missingGuard.error.code, "GOVERNANCE_REJECTED");

  const providerThrow = await executeMcpToolUnregistration({
    target: { serverId: "fs-mcp", toolName: "dynamic_echo" },
    context: acceptedContext(),
  }, () => {
    throw new TypeError("private provider stack");
  });
  assert.equal(providerThrow.ok, false);
  if (!providerThrow.ok) {
    assert.equal(providerThrow.error.code, "PROVIDER_REJECTED");
    assert.doesNotMatch(providerThrow.error.message, /private provider stack/u);
  }

  for (const input of [null, [], 1, { target: null }, { target: { serverId: 1 } }, { target: { serverId: "fs-mcp", tool: { name: "x", inputSchema: [] } } }]) {
    const result = await executeMcpToolRegistration(input);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.publicSafe, true);
  }
});

test("mcp tool registry handlers resolve through registry and invoke fake executor", async () => {
  const executor: BaseToolExecutorPort = {
    mcp: {
      async registerTool(request) {
        return { ok: true, output: { name: request.tool.name, status: "registered", providerMetadata: { runtimeEntry: "BaseToolExecutorPort.mcp.registerTool" } } };
      },
      async updateTool(request) {
        return { ok: true, output: { toolName: request.toolName, status: "updated", providerMetadata: { runtimeEntry: "BaseToolExecutorPort.mcp.updateTool" } } };
      },
      async unregisterTool(request) {
        return { ok: true, output: { toolName: request.toolName, status: "unregistered", providerMetadata: { runtimeEntry: "BaseToolExecutorPort.mcp.unregisterTool" } } };
      },
    },
  };

  for (const [toolId, input] of [
    ["mcp.registerTool", { target: { serverId: "fs-mcp", tool: { name: "dynamic_echo" } }, context: acceptedContext() }],
    ["mcp.updateTool", { target: { serverId: "fs-mcp", toolName: "dynamic_echo", patch: { description: "Updated" } }, context: acceptedContext() }],
    ["mcp.unregisterTool", { target: { serverId: "fs-mcp", toolName: "dynamic_echo" }, context: acceptedContext() }],
  ] as const) {
    const lookup = createBaseToolRegistry().lookupHandler(toolId);
    assert.equal(lookup.ok, true);
    if (!lookup.ok) continue;
    const result = await lookup.handler.invoke({
      toolCallId: `${toolId}:test`,
      runtimeId: "runtime:test",
      sessionId: "session:test",
      input,
      executor,
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal((result.output as { providerCalled?: boolean }).providerCalled, true);
  }
});
