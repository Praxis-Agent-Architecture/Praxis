import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { bindAbstractionLayer } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.modelAdapter/bindAbstractionLayer.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_runtimeImplementation/runtime.modelAdapter/bindAbstractionLayer.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_runtimeImplementation/runtime.modelAdapter/bindAbstractionLayer.md",
  testFileUrl: import.meta.url,
});

test("bindAbstractionLayer exposes cross-provider abstractions as a dry-run runtime binding", () => {
  const result = bindAbstractionLayer({
    runtimeId: " runtime-1 ",
    caller: { kind: "runtime-surface", id: " invocation-method " },
    abstractionLayer: {
      id: " abstraction-layer-1 ",
      abstractions: [
        { kind: "responses-style", ref: " capability:responses ", fromCarrierId: " openai-carrier " },
        { kind: "tool-call", ref: " capability:tool-call " },
        { kind: "tool-call", ref: " capability:tool-call-stream " },
      ],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.binding.bindingId, "runtime-1:abstractionLayer:abstraction-layer-1");
  assert.equal(result.binding.surface, "abstractionLayer");
  assert.deepEqual(result.binding.abstractionKinds, ["responses-style", "tool-call"]);
  assert.equal(result.binding.abstractions[0]?.fromCarrierId, "openai-carrier");
  assert.equal(result.binding.dryRun, true);
  assert.equal(result.binding.unsafeSideEffects, false);
});

test("bindAbstractionLayer rejects empty abstraction sets and unready runtimes", () => {
  const empty = bindAbstractionLayer({
    runtimeId: "runtime-1",
    caller: { kind: "application", id: "app-1" },
    abstractionLayer: { id: "abstraction-layer-1", abstractions: [{ kind: " ", ref: " " }] },
  });

  assert.equal(empty.ok, false);
  if (empty.ok) {
    return;
  }

  assert.equal(empty.error.code, "EMPTY_ABSTRACTIONS");
  assert.equal(empty.error.boundary, "binding");

  const unready = bindAbstractionLayer({
    runtimeId: "runtime-1",
    caller: { kind: "application", id: "app-1" },
    abstractionLayer: { id: "abstraction-layer-1", abstractions: [{ kind: "messages-style", ref: "capability:messages" }] },
    runtimeReady: false,
  });

  assert.equal(unready.ok, false);
  if (unready.ok) {
    return;
  }

  assert.equal(unready.error.code, "RUNTIME_NOT_READY");
  assert.equal(unready.error.boundary, "runtime-state");
});
