import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createBatchInvocationSurface } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.invocationMethod/batchInvocationSurface.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_runtimeImplementation/runtime.invocationMethod/batchInvocationSurface.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.invocationMethod/batchInvocationSurface.md",
  testFileUrl: import.meta.url,
});

test("createBatchInvocationSurface plans multiple dry-run invocation envelopes", () => {
  const result = createBatchInvocationSurface({
    runtimeId: "runtime-1",
    batchId: "batch-1",
    source: "application",
    allowedScopes: ["invoke"],
    items: [
      {
        itemId: "item-agent",
        targetId: "agent-1",
        invocationKind: "agent",
        payload: { prompt: "hello" },
        requestedScopes: ["invoke"],
      },
      {
        itemId: "item-interface",
        targetId: "interface-1",
        invocationKind: "interface",
        payload: { operation: "ping" },
        requestedScopes: ["invoke"],
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.plan.invocationType, "batch");
  assert.equal(result.plan.batchId, "batch-1");
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.unsafeSideEffects, false);
  assert.equal(result.plan.items.length, 2);
  assert.deepEqual(
    result.plan.items.map((item) => item.envelope.invocationKind),
    ["agent", "interface"],
  );
});

test("createBatchInvocationSurface rejects empty batches and reports item-level envelope errors", () => {
  const empty = createBatchInvocationSurface({
    runtimeId: "runtime-1",
    batchId: "batch-1",
    source: "application",
    items: [],
  });
  assert.equal(empty.ok, false);
  assert.equal(empty.error.code, "EMPTY_BATCH");
  assert.equal(empty.error.boundary, "batch");

  const deniedItem = createBatchInvocationSurface({
    runtimeId: "runtime-1",
    batchId: "batch-2",
    source: "application",
    allowedScopes: ["invoke"],
    items: [
      {
        itemId: "item-agent",
        targetId: "agent-1",
        invocationKind: "agent",
        requestedScopes: ["internal-state"],
      },
    ],
  });
  assert.equal(deniedItem.ok, false);
  assert.equal(deniedItem.error.code, "SCOPE_DENIED");
  assert.equal(deniedItem.error.itemId, "item-agent");
});
