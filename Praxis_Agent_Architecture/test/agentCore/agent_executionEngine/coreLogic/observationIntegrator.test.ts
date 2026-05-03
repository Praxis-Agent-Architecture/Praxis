import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { createObservationMaterial } from "../../../../src/agentCore/agent_executionEngine/coreLogic/observationIntegrator.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/coreLogic/observationIntegrator.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/coreLogic/observationIntegrator.md",
  testFileUrl: import.meta.url,
});

test("createObservationMaterial turns tool output into PromptPack material", () => {
  const observation = createObservationMaterial({
    observationId: "observation-1",
    source: "baseTool",
    status: "completed",
    title: "BaseTool code.read",
    summary: "read file",
    refs: ["call-1", "code.read"],
    payload: { text: "hello" },
    metadata: { toolCallId: "call-1" },
  });

  assert.equal(observation.observationId, "observation-1");
  assert.equal(observation.material.kind, "tool-summary");
  assert.equal(observation.material.trusted, true);
  assert.equal(observation.material.metadata?.observationStatus, "completed");
  assert.deepEqual(observation.refs, ["call-1", "code.read"]);
  assert.match(observation.material.text, /hello/u);
});

test("createObservationMaterial keeps runtime observations provider-neutral", () => {
  const observation = createObservationMaterial({
    observationId: "observation-runtime",
    source: "runtime",
    status: "failed",
    title: "Runtime governance",
    summary: "denied",
  });

  assert.equal(observation.material.kind, "runtime");
  assert.equal(observation.material.priority, 80);
  assert.equal(observation.material.source, "runtime.observation.runtime");
});
