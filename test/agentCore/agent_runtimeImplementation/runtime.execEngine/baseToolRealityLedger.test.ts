import assert from "node:assert/strict";
import test from "node:test";

import {
  createRuntimeBaseToolExecutorPort,
  listRuntimeBaseToolImplementedPortPaths,
} from "../../../../src/runtimeImplementation/runtime.execEngine/baseToolExecutorPortFactory.js";
import {
  createBaseToolRealityLedger,
  inspectBaseToolReality,
  snapshotBaseToolRealityLedger,
} from "../../../../src/runtimeImplementation/runtime.execEngine/baseToolRealityLedger.js";

test("baseToolRealityLedger covers the semantic basetool catalog", () => {
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-ledger-catalog",
    sessionId: "session-ledger-catalog",
  });
  const implementedPortPaths = listRuntimeBaseToolImplementedPortPaths();
  const ledger = createBaseToolRealityLedger({ executor, implementedPortPaths });
  const snapshot = snapshotBaseToolRealityLedger({ executor, implementedPortPaths });
  const ledgerIds = new Set(ledger.map((entry) => entry.toolId));

  assert.equal(ledger.length, 24);
  assert.equal(snapshot.total, 24);
  assert.equal(snapshot.expectedTotal, 24);
  assert.equal(snapshot.byFamily.work ?? 0, 0);
  assert.equal(snapshot.byStorage["semantic-catalog"], 24);
  assert.equal(ledgerIds.has("file.read"), true);
  assert.equal(ledgerIds.has("shell.run"), true);
  assert.equal(ledgerIds.has("context.load"), true);

  const fileRead = inspectBaseToolReality("file.read", { executor, implementedPortPaths });
  assert.ok(fileRead);
  assert.equal(fileRead.registry, "mounted");
  assert.equal(fileRead.storage, "semantic-catalog");
  assert.equal(fileRead.group, "filesystem");
  assert.equal(fileRead.stages.mounted, "ready");
  assert.equal(fileRead.stages.contractReady, "ready");
  assert.deepEqual(fileRead.requiredPorts, ["filesystem.readText"]);
  assert.equal(fileRead.liveStatus, "notProven");
  assert.equal(fileRead.developerReadiness, "ready");

  assert.equal(snapshot.stageCounts.mounted, 24);
  assert.equal(snapshot.stageCounts.contractReady, 24);
});

test("baseToolRealityLedger distinguishes host-ready ports from adapter-required ports", () => {
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-ledger",
    sessionId: "session-ledger",
  });
  const ledger = createBaseToolRealityLedger({
    executor,
    implementedPortPaths: listRuntimeBaseToolImplementedPortPaths(),
  });

  const fileRead = ledger.find((entry) => entry.toolId === "file.read");
  assert.ok(fileRead);
  assert.equal(fileRead.executorSupport, "hostReady");
  assert.equal(fileRead.dependencyStatus, "available");
  assert.equal(fileRead.stages.hostReady, "ready");
  assert.equal(fileRead.stages.dependencyReady, "ready");
  assert.equal(fileRead.developerReadiness, "ready");
  assert.deepEqual(fileRead.missingPorts, []);

  const agentSpawn = ledger.find((entry) => entry.toolId === "agent.spawn");
  assert.ok(agentSpawn);
  assert.equal(agentSpawn.executorSupport, "adapterRequired");
  assert.equal(agentSpawn.dependencyStatus, "providerUnavailable");
  assert.deepEqual(agentSpawn.missingPorts, ["agent.spawn"]);
});

test("baseToolRealityLedger records live proof only when the runtime passes smoke evidence", () => {
  const entry = inspectBaseToolReality("shell.run", {
    liveProvenToolIds: ["shell.run"],
  });

  assert.ok(entry);
  assert.equal(entry.liveStatus, "liveReady");
});

test("baseToolRealityLedger treats semantic skill and file tools as runtime observations", () => {
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-ledger-skill",
    sessionId: "session-ledger-skill",
    adapters: {
      skill: {
        async load() {
          return { ok: true, output: { content: "skill" } };
        },
      },
    },
  });
  const ledger = createBaseToolRealityLedger({
    executor,
    implementedPortPaths: listRuntimeBaseToolImplementedPortPaths({ adapters: executor }),
    liveProvenToolIds: ["skill.load", "file.search"],
  });

  const skillLoad = ledger.find((entry) => entry.toolId === "skill.load");
  assert.ok(skillLoad);
  assert.equal(skillLoad.capabilityClass, "externalAdapter");
  assert.equal(skillLoad.projection, "runtimeObservation");
  assert.equal(skillLoad.modelRequired, true);
  assert.equal(skillLoad.recommendedLiveGate, "adapterSmoke");
  assert.equal(skillLoad.developerReadiness, "ready");
  assert.equal(skillLoad.readiness, "available");

  const fileSearch = ledger.find((entry) => entry.toolId === "file.search");
  assert.ok(fileSearch);
  assert.equal(fileSearch.capabilityClass, "contextMaterial");
  assert.equal(fileSearch.projection, "runtimeObservation");
  assert.equal(fileSearch.modelRequired, true);
  assert.equal(fileSearch.developerReadiness, "ready");

  assert.ok(skillLoad.notes.some((note) => note.includes("semantic basetool catalog entry")));
});
