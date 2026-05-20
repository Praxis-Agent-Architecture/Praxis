import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import {
  defineOutputInterfaceCapabilities,
  outputInterfaceCapabilityDescriptor,
} from "../../../../../src/agentCore_modelAdapter/abstractionLayer/capabilityCompatibilityCore/outputInterfaceCapability.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_modelAdapter/abstractionLayer/capabilityCompatibilityCore/outputInterfaceCapability.ts",
  docPath: "docs/agentCore/agent_modelAdapter/abstractionLayer/capabilityCompatibilityCore/outputInterfaceCapability.md",
  testFileUrl: import.meta.url,
});

test("outputInterfaceCapability normalizes provider output capabilities for bridge handoff", () => {
  const result = defineOutputInterfaceCapabilities({
    runtimeId: " runtime ",
    sourceInterfaceId: " responses-output ",
    providerId: "openai",
    modelId: "gpt",
    requestedScopes: ["model.output"],
    allowedScopes: ["model.output"],
    capabilities: [
      {
        capabilityId: "text-output",
        providerKey: "output_text",
        required: true,
        available: true,
        limits: ["64k-output-window", "64k-output-window"],
        evidence: ["provider-metadata"],
      },
      {
        capabilityId: "json-output",
        providerKey: "response_format",
        available: true,
      },
    ],
  });

  assert.equal(outputInterfaceCapabilityDescriptor.providerPayloadCreated, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected output capability envelope");
  }

  assert.equal(result.envelope.kind, "agentCore.modelAdapter.outputInterfaceCapability");
  assert.equal(result.envelope.runtimeId, "runtime");
  assert.equal(result.envelope.sourceInterfaceId, "responses-output");
  assert.equal(result.envelope.compatible, true);
  assert.equal(result.envelope.bridgeReadiness, "ready");
  assert.equal(result.envelope.providerPayloadCreated, false);
  assert.equal(result.envelope.unsafeSideEffects, false);
  assert.deepEqual(result.envelope.requiredCapabilities, ["text-output"]);
  assert.deepEqual(result.envelope.missingCapabilities, []);
  assert.deepEqual(result.envelope.capabilities[0]?.limits, ["64k-output-window"]);
});

test("outputInterfaceCapability reports missing capability and public boundary failures", () => {
  const missing = defineOutputInterfaceCapabilities({
    runtimeId: "runtime",
    sourceInterfaceId: "anthropic-output",
    requiredCapabilities: ["tool-call-output"],
    capabilities: [{ capabilityId: "tool-call-output", available: false }],
  });
  assert.equal(missing.ok, true);
  if (!missing.ok) {
    throw new Error("expected missing capability to be represented as compatibility gap");
  }
  assert.equal(missing.envelope.compatible, false);
  assert.equal(missing.envelope.bridgeReadiness, "blocked-by-missing-capability");
  assert.deepEqual(missing.envelope.missingCapabilities, ["tool-call-output"]);

  const empty = defineOutputInterfaceCapabilities({ runtimeId: "runtime", sourceInterfaceId: "iface" });
  assert.equal(empty.ok, false);
  if (empty.ok) {
    throw new Error("expected empty capability rejection");
  }
  assert.equal(empty.error.code, "MISSING_CAPABILITY");
  assert.equal(empty.error.boundary, "input");

  const denied = defineOutputInterfaceCapabilities({
    runtimeId: "runtime",
    sourceInterfaceId: "iface",
    requestedScopes: ["model.output.private"],
    allowedScopes: ["model.output"],
    capabilities: [{ capabilityId: "text-output" }],
  });
  assert.equal(denied.ok, false);
  if (denied.ok) {
    throw new Error("expected scope denial");
  }
  assert.equal(denied.error.code, "SCOPE_DENIED");
  assert.equal(denied.error.safeForRuntimeInspection, true);
});
