import assert from "node:assert/strict";
import test from "node:test";

import { builtinBaseToolHandlers } from "../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/builtinBaseToolHandlers.js";
import { createRuntimeBaseToolExecutorPort } from "../../../../src/agentCore_runtimeImplementation/runtime.execEngine/baseToolExecutorPortFactory.js";
import {
  createBaseToolRealityLedger,
  inspectBaseToolReality,
  snapshotBaseToolRealityLedger,
} from "../../../../src/agentCore_runtimeImplementation/runtime.execEngine/baseToolRealityLedger.js";

test("baseToolRealityLedger covers all mounted storage-owned tools with canonical storage files", () => {
  const ledger = createBaseToolRealityLedger();
  const snapshot = snapshotBaseToolRealityLedger();
  const ledgerIds = new Set(ledger.map((entry) => entry.toolId));

  assert.equal(ledger.length, 176);
  assert.equal(snapshot.total, 176);
  assert.equal(snapshot.expectedTotal, 176);
  assert.equal(snapshot.byFamily.office, 0);
  assert.equal(snapshot.byStorage.canonical, 176);

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
  assert.equal(codeRead.developerReadiness, "usableWithApproval");

  assert.equal(snapshot.stageCounts.mounted, 176);
  assert.equal(snapshot.stageCounts.contractReady, 176);
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
  assert.equal(mcpConnect.executorSupport, "hostReady");
  assert.equal(mcpConnect.dependencyStatus, "requiresApproval");
  assert.deepEqual(mcpConnect.missingPorts, []);
});

test("baseToolRealityLedger records live proof only when the runtime passes smoke evidence", () => {
  const entry = inspectBaseToolReality("git.getRepositoryStatus", {
    liveProvenToolIds: ["git.getRepositoryStatus"],
  });

  assert.ok(entry);
  assert.equal(entry.liveStatus, "liveReady");
});

test("baseToolRealityLedger treats skillBase as local context material instead of model adapter work", () => {
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-ledger-skill",
    sessionId: "session-ledger-skill",
  });
  const ledger = createBaseToolRealityLedger({
    executor,
    liveProvenToolIds: [
      "skill.generate",
      "skill.iterate",
      "skill.management",
      "skill.remove",
      "skill.ripgrep",
      "skill.summarize",
    ],
  });

  const summarize = ledger.find((entry) => entry.toolId === "skill.summarize");
  assert.ok(summarize);
  assert.equal(summarize.capabilityClass, "contextMaterial");
  assert.equal(summarize.projection, "promptPackMaterial");
  assert.equal(summarize.modelRequired, false);
  assert.equal(summarize.recommendedLiveGate, "noModelSmoke");
  assert.equal(summarize.developerReadiness, "ready");
  assert.equal(summarize.readiness, "available");

  const ripgrep = ledger.find((entry) => entry.toolId === "skill.ripgrep");
  assert.ok(ripgrep);
  assert.equal(ripgrep.capabilityClass, "contextSearch");
  assert.equal(ripgrep.projection, "promptPackMaterial");
  assert.equal(ripgrep.modelRequired, false);
  assert.equal(ripgrep.developerReadiness, "usableWithApproval");

  const generate = ledger.find((entry) => entry.toolId === "skill.generate");
  assert.ok(generate);
  assert.equal(generate.capabilityClass, "governedAuthoring");
  assert.equal(generate.projection, "authoringArtifact");
  assert.equal(generate.modelRequired, false);
  assert.equal(generate.developerReadiness, "usableWithApproval");
  assert.ok(generate.notes.some((note) => note.includes("no model provider is required")));
});
