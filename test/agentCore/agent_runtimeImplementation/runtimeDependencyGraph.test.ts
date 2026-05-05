import { defineAgentCoreContractTest } from "../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { buildRuntimeDependencyGraph } from "../../../src/agentCore/agent_runtimeImplementation/runtimeDependencyGraph.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_runtimeImplementation/runtimeDependencyGraph.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtimeDependencyGraph.md",
  testFileUrl: import.meta.url,
});

test("buildRuntimeDependencyGraph normalizes nodes, edges, and dependency evaluation order", () => {
  const result = buildRuntimeDependencyGraph({
    runtimeId: " runtime-1 ",
    nodes: [
      { nodeId: "governance", kind: "governance-plane" },
      { nodeId: "contract", kind: "contract-surface", dependsOn: [" governance ", "governance"] },
      { nodeId: "invocation", kind: "invocation-method", dependsOn: ["contract"] },
      { nodeId: "inspection", kind: "inspection-surface", dependsOn: ["invocation"], ready: false },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.graph.runtimeId, "runtime-1");
  assert.deepEqual(result.graph.evaluationOrder, ["governance", "contract", "invocation", "inspection"]);
  assert.deepEqual(result.graph.edges, [
    { fromNodeId: "contract", toNodeId: "governance" },
    { fromNodeId: "invocation", toNodeId: "contract" },
    { fromNodeId: "inspection", toNodeId: "invocation" },
  ]);
  assert.deepEqual(result.graph.blockingIssues, [
    { nodeId: "inspection", reason: "inspection is required but not ready" },
  ]);
  assert.equal(result.graph.unsafeSideEffects, false);
  assert.deepEqual(result.events, ["runtime.dependencyGraph.blocked"]);
});

test("buildRuntimeDependencyGraph rejects invalid graph structure with stable errors", () => {
  const missingDependency = buildRuntimeDependencyGraph({
    runtimeId: "runtime-1",
    nodes: [{ nodeId: "invocation", kind: "invocation-method", dependsOn: ["contract"] }],
  });
  assert.equal(missingDependency.ok, false);
  assert.equal(missingDependency.error.code, "UNKNOWN_DEPENDENCY");
  assert.equal(missingDependency.error.boundary, "graph");
  assert.equal(missingDependency.error.safeForRuntimeInspection, true);

  const cycle = buildRuntimeDependencyGraph({
    runtimeId: "runtime-1",
    nodes: [
      { nodeId: "contract", kind: "contract-surface", dependsOn: ["governance"] },
      { nodeId: "governance", kind: "governance-plane", dependsOn: ["contract"] },
    ],
  });
  assert.equal(cycle.ok, false);
  assert.equal(cycle.error.code, "CYCLIC_DEPENDENCY");
  assert.equal(cycle.error.boundary, "graph");
});

test("buildRuntimeDependencyGraph enforces runtime, contract, and governance boundaries", () => {
  const missingRuntime = buildRuntimeDependencyGraph({
    nodes: [{ nodeId: "contract", kind: "contract-surface" }],
  });
  assert.equal(missingRuntime.ok, false);
  assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");
  assert.equal(missingRuntime.error.boundary, "input");

  const contractRejected = buildRuntimeDependencyGraph({
    runtimeId: "runtime-1",
    nodes: [{ nodeId: "contract", kind: "contract-surface" }],
    contract: { accepted: false, reason: "contract version mismatch" },
  });
  assert.equal(contractRejected.ok, false);
  assert.equal(contractRejected.error.code, "CONTRACT_REJECTED");
  assert.equal(contractRejected.error.message, "contract version mismatch");
  assert.equal(contractRejected.error.boundary, "contract");

  const governanceRejected = buildRuntimeDependencyGraph({
    runtimeId: "runtime-1",
    nodes: [{ nodeId: "governance", kind: "governance-plane" }],
    governance: { accepted: false, reason: "scope denied" },
  });
  assert.equal(governanceRejected.ok, false);
  assert.equal(governanceRejected.error.code, "GOVERNANCE_REJECTED");
  assert.equal(governanceRejected.error.boundary, "governance");
});
