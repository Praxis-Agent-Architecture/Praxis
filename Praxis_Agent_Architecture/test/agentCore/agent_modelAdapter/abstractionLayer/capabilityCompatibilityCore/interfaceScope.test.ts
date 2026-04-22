import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { evaluateInterfaceScope } from "../../../../../src/agentCore/agent_modelAdapter/abstractionLayer/capabilityCompatibilityCore/interfaceScope.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_modelAdapter/abstractionLayer/capabilityCompatibilityCore/interfaceScope.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_modelAdapter/abstractionLayer/capabilityCompatibilityCore/interfaceScope.md",
  testFileUrl: import.meta.url,
});

test("evaluateInterfaceScope allows requested capabilities and formats within granted scope", () => {
  const result = evaluateInterfaceScope({
    providerId: "custom-gateway",
    interfaceId: "responses-like",
    requestedCapabilities: ["Text", "structured output"],
    grantedCapabilities: ["text", "structured-output", "tool"],
    requestedFormats: ["json"],
    grantedFormats: ["json", "text"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.decision.accepted, true);
  assert.deepEqual(result.decision.requestedCapabilities, ["text", "structured-output"]);
  assert.deepEqual(result.decision.missingCapabilities, []);
  assert.deepEqual(result.decision.missingFormats, []);
  assert.equal(result.decision.readonly, true);
  assert.equal(result.decision.unsafeSideEffects, false);
});

test("evaluateInterfaceScope rejects governance and scope boundary violations", () => {
  const governance = evaluateInterfaceScope({
    providerId: "custom-gateway",
    interfaceId: "responses-like",
    governance: { accepted: false, reason: "model adapter locked" },
  });
  assert.equal(governance.ok, false);
  if (governance.ok) {
    return;
  }
  assert.equal(governance.error.code, "GOVERNANCE_REJECTED");
  assert.equal(governance.error.boundary, "governance");

  const denied = evaluateInterfaceScope({
    providerId: "custom-gateway",
    interfaceId: "responses-like",
    requestedCapabilities: ["tool"],
    grantedCapabilities: ["text"],
    requestedFormats: ["json"],
    grantedFormats: ["text"],
  });
  assert.equal(denied.ok, false);
  if (denied.ok) {
    return;
  }
  assert.equal(denied.error.code, "SCOPE_DENIED");
  assert.equal(denied.error.boundary, "scope");
  assert.deepEqual(denied.decision?.missingCapabilities, ["tool"]);
  assert.deepEqual(denied.decision?.missingFormats, ["json"]);
});
