import assert from "node:assert/strict";
import test from "node:test";

import { builtinBaseToolHandlers } from "../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/builtinBaseToolHandlers.js";
import { createRuntimeBaseToolExecutorPort } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.execEngine/baseToolExecutorPortFactory.js";
import {
  createBaseToolRealityLedger,
  inspectBaseToolReality,
  snapshotBaseToolRealityLedger,
} from "../../../../src/agentCore/agent_runtimeImplementation/runtime.execEngine/baseToolRealityLedger.js";

test("baseToolRealityLedger covers all mounted storage-owned tools with canonical storage files", () => {
  const ledger = createBaseToolRealityLedger();
  const snapshot = snapshotBaseToolRealityLedger();
  const ledgerIds = new Set(ledger.map((entry) => entry.toolId));

  assert.equal(ledger.length, 175);
  assert.equal(snapshot.total, 175);
  assert.equal(snapshot.expectedTotal, 175);
  assert.equal(snapshot.byFamily.office, 0);
  assert.equal(snapshot.byStorage.canonical, 175);

  for (const handler of builtinBaseToolHandlers) {
    assert.equal(ledgerIds.has(handler.definition.toolId), true, handler.definition.toolId);
    assert.equal(typeof handler.definition.group, "string", handler.definition.toolId);
    assert.notEqual(handler.definition.group.trim(), "", handler.definition.toolId);
  }

  const codeRead = inspectBaseToolReality("code.read");
  assert.ok(codeRead);
  assert.equal(codeRead.registry, "mounted");
  assert.equal(codeRead.storage, "canonical");
  assert.equal(codeRead.group, "explore");
  assert.equal(codeRead.stages.mounted, "ready");
  assert.equal(codeRead.stages.contractReady, "ready");
  assert.deepEqual(codeRead.requiredPorts, ["filesystem.readText"]);
  assert.equal(codeRead.liveStatus, "notProven");
  assert.equal(codeRead.developerReadiness, "adapterRequired");

  assert.equal(snapshot.stageCounts.mounted, 175);
  assert.equal(snapshot.stageCounts.contractReady, 175);
});

test("baseToolRealityLedger distinguishes host-ready ports from adapter-required ports", () => {
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-ledger",
    sessionId: "session-ledger",
  });
  const ledger = createBaseToolRealityLedger({ executor });

  const codeRead = ledger.find((entry) => entry.toolId === "code.read");
  assert.ok(codeRead);
  assert.equal(codeRead.executorSupport, "hostReady");
  assert.equal(codeRead.dependencyStatus, "requiresApproval");
  assert.equal(codeRead.stages.hostReady, "ready");
  assert.equal(codeRead.stages.dependencyReady, "requiresApproval");
  assert.equal(codeRead.developerReadiness, "usableWithApproval");
  assert.deepEqual(codeRead.missingPorts, []);

  const mcpConnect = ledger.find((entry) => entry.toolId === "mcp.connect");
  assert.ok(mcpConnect);
  assert.equal(mcpConnect.executorSupport, "adapterRequired");
  assert.equal(mcpConnect.dependencyStatus, "providerUnavailable");
  assert.ok(mcpConnect.missingPorts.includes("mcp.connect"));
});

test("baseToolRealityLedger records live proof only when the runtime passes smoke evidence", () => {
  const entry = inspectBaseToolReality("git.getRepositoryStatus", {
    liveProvenToolIds: ["git.getRepositoryStatus"],
  });

  assert.ok(entry);
  assert.equal(entry.liveStatus, "liveReady");
});
