import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  applicationCompatibilityCheckDescriptor,
  checkApplicationModelCompatibility,
  type ApplicationBridgeCandidate,
} from "../../../../src/agentCore/agent_modelAdapter/bridgingLayer/applicationCompatibilityCheck.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_modelAdapter/bridgingLayer/applicationCompatibilityCheck.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_modelAdapter/bridgingLayer/applicationCompatibilityCheck.md",
  testFileUrl: import.meta.url,
});

function compatibleCandidate(): ApplicationBridgeCandidate {
  return {
    runtimeId: "runtime",
    bridgeId: "bridge-1",
    transformationId: "transform-1",
    sourceInterfaceId: "responses-output",
    capabilities: [
      { capabilityId: "text-output", providerKey: "output_text", available: true, required: true },
      { capabilityId: "json-output", providerKey: "response_format", available: true },
    ],
    formats: [
      { formatId: "text", mediaType: "text/plain", streaming: true, available: true },
      { formatId: "json", mediaType: "application/json", structured: true, available: true },
    ],
    compatible: true,
    bridgeReadiness: "ready",
    providerPayloadCreated: false,
    unsafeSideEffects: false,
  };
}

test("applicationCompatibilityCheck accepts a ready abstraction bridge candidate", () => {
  const result = checkApplicationModelCompatibility({
    runtimeId: " runtime ",
    checkId: " check-1 ",
    candidate: compatibleCandidate(),
    requiredCapabilityIds: ["text-output"],
    requiredFormatIds: ["json"],
    requestedScopes: ["model.invoke"],
    allowedScopes: ["model.invoke"],
  });

  assert.equal(applicationCompatibilityCheckDescriptor.providerPayloadCreated, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected compatible bridge candidate");
  }

  assert.equal(result.report.kind, "agentCore.modelAdapter.applicationCompatibility");
  assert.equal(result.report.checkId, "check-1");
  assert.equal(result.report.compatible, true);
  assert.equal(result.report.agentCoreUsable, true);
  assert.deepEqual(result.report.missingCapabilities, []);
  assert.deepEqual(result.report.missingFormats, []);
  assert.equal(result.report.providerPayloadCreated, false);
  assert.equal(result.report.unsafeSideEffects, false);
});

test("applicationCompatibilityCheck reports gaps and classifies rejected boundaries", () => {
  const missingInput = checkApplicationModelCompatibility();
  assert.equal(missingInput.ok, false);
  if (missingInput.ok) {
    throw new Error("expected missing runtime rejection");
  }
  assert.equal(missingInput.error.code, "MISSING_RUNTIME_ID");

  const gapped = checkApplicationModelCompatibility({
    runtimeId: "runtime",
    checkId: "check-2",
    candidate: {
      ...compatibleCandidate(),
      capabilities: [{ capabilityId: "text-output", available: true, required: true }],
      formats: [{ formatId: "text", available: true }],
      gaps: [{ kind: "format", id: "json", reason: "missing structured output format" }],
    },
    requiredCapabilityIds: ["text-output", "tool-call-output"],
    requiredFormatIds: ["json"],
  });

  assert.equal(gapped.ok, true);
  if (!gapped.ok) {
    throw new Error("expected compatibility gap report");
  }
  assert.equal(gapped.report.compatible, false);
  assert.deepEqual(gapped.report.missingCapabilities, ["tool-call-output"]);
  assert.deepEqual(gapped.report.missingFormats, ["json"]);
  assert.deepEqual(gapped.report.gaps, [{ kind: "format", id: "json", reason: "missing structured output format" }]);

  const denied = checkApplicationModelCompatibility({
    runtimeId: "runtime",
    checkId: "check-3",
    candidate: compatibleCandidate(),
    requestedScopes: ["model.admin"],
    allowedScopes: ["model.invoke"],
  });
  assert.equal(denied.ok, false);
  if (denied.ok) {
    throw new Error("expected scope denial");
  }
  assert.equal(denied.error.code, "SCOPE_DENIED");
  assert.equal(denied.error.boundary, "scope");
});
