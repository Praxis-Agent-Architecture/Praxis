import assert from "node:assert/strict";
import test from "node:test";

import { runTool } from "../../../../../../examples/scripts/agentcore_tool_lab.js";

const mcpToolLabCases = [
  ["mcp.authenticate", "BaseToolExecutorPort.mcp.authenticate"],
  ["mcp.authorize", "BaseToolExecutorPort.mcp.authorize"],
  ["mcp.cache", "BaseToolExecutorPort.mcp.cache"],
  ["mcp.invalidateCache", "BaseToolExecutorPort.mcp.invalidateCache"],
  ["mcp.connect", "BaseToolExecutorPort.mcp.connect"],
  ["mcp.disconnect", "BaseToolExecutorPort.mcp.disconnect"],
  ["mcp.subscribe", "BaseToolExecutorPort.mcp.subscribe"],
  ["mcp.unsubscribe", "BaseToolExecutorPort.mcp.unsubscribe"],
  ["mcp.call", "BaseToolExecutorPort.mcp.callTool"],
  ["mcp.stream", "BaseToolExecutorPort.mcp.streamTool"],
  ["mcp.cancel", "BaseToolExecutorPort.mcp.cancelExecution"],
  ["mcp.nativeExecute", "BaseToolExecutorPort.mcp.nativeExecute"],
  ["mcp.listTools", "BaseToolExecutorPort.mcp.listTools"],
  ["mcp.registerTool", "BaseToolExecutorPort.mcp.registerTool"],
  ["mcp.updateTool", "BaseToolExecutorPort.mcp.updateTool"],
  ["mcp.unregisterTool", "BaseToolExecutorPort.mcp.unregisterTool"],
  ["mcp.listResources", "BaseToolExecutorPort.mcp.listResources"],
  ["mcp.readResource", "BaseToolExecutorPort.mcp.readResource"],
  ["mcp.createResource", "BaseToolExecutorPort.mcp.createResource"],
  ["mcp.updateResource", "BaseToolExecutorPort.mcp.updateResource"],
  ["mcp.deleteResource", "BaseToolExecutorPort.mcp.deleteResource"],
  ["mcp.ping", "BaseToolExecutorPort.mcp.ping"],
  ["mcp.healthCheck", "BaseToolExecutorPort.mcp.checkHealth"],
] as const;

function extractProviderRuntimeEntry(output: {
  providerMetadata?: { runtimeEntry?: string };
  providerResult?: { providerMetadata?: { runtimeEntry?: string } };
}): string | undefined {
  return output.providerMetadata?.runtimeEntry ?? output.providerResult?.providerMetadata?.runtimeEntry;
}

test("agentCore tool lab mounts mcp.call through the registry-backed fake MCP runtime", async () => {
  const result = await runTool("mcp.call", {
    target: {
      serverId: "fs-mcp",
      name: "read_file",
      arguments: { path: "README.md" },
    },
  });

  assert.equal(result.ok, true);
  const output = result.output as {
    kind?: string;
    providerCalled?: boolean;
    providerResult?: { content?: readonly { type?: string; text?: string }[] };
    requestEnvelope?: { toolName?: string };
  };
  assert.equal(output.kind, "agentCore.basicTool.mcp.call");
  assert.equal(output.providerCalled, true);
  assert.equal(output.requestEnvelope?.toolName, "read_file");
  assert.equal(output.providerResult?.content?.[0]?.type, "text");
  assert.match(output.providerResult?.content?.[0]?.text ?? "", /Tool Lab MCP/u);
});

test("agentCore tool lab mounts all 23 MCP tools through registry-backed runtime executor ports", async () => {
  assert.equal(mcpToolLabCases.length, 23, "MCP lab mount matrix should cover the full current catalog");

  for (const [tool, runtimeEntry] of mcpToolLabCases) {
    const result = await runTool(tool, { serverId: "fs-mcp" });

    assert.equal(result.ok, true, `${tool} should run through the lab MCP runtime`);
    const output = result.output as {
      providerCalled?: boolean;
      providerMetadata?: { runtimeEntry?: string };
      providerResult?: { providerMetadata?: { runtimeEntry?: string } };
    };
    assert.equal(output.providerCalled, true, `${tool} should call provider`);
    assert.equal(extractProviderRuntimeEntry(output), runtimeEntry, `${tool} should use ${runtimeEntry}`);
  }
});
