import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import {
  intermediateMapperDescriptor,
  mapIntermediateCapabilityCompatibility,
} from "../../../../../src/modelAdapter/abstractionLayer/capabilityCompatibilityCore/intermediateMapper.js";
import { defineOutputInterfaceCapabilities } from "../../../../../src/modelAdapter/abstractionLayer/capabilityCompatibilityCore/outputInterfaceCapability.js";
import { defineOutputInterfaceFormats } from "../../../../../src/modelAdapter/abstractionLayer/capabilityCompatibilityCore/outputInterfaceFormat.js";

defineAgentCoreContractTest({
  sourcePath: "src/modelAdapter/abstractionLayer/capabilityCompatibilityCore/intermediateMapper.ts",
  docPath: "docs/agentCore/agent_modelAdapter/abstractionLayer/capabilityCompatibilityCore/intermediateMapper.md",
  testFileUrl: import.meta.url,
});

test("intermediateMapper maps output capability and format envelopes into a bridge-neutral mapping", () => {
  const capabilities = defineOutputInterfaceCapabilities({
    runtimeId: "runtime",
    sourceInterfaceId: "responses-output",
    capabilities: [
      { capabilityId: "text-output", providerKey: "output_text", required: true, evidence: ["metadata"] },
      { capabilityId: "json-output", providerKey: "response_format", required: true },
    ],
  });
  const formats = defineOutputInterfaceFormats({
    runtimeId: "runtime",
    sourceInterfaceId: "responses-output",
    formats: [
      { formatId: "text", mediaType: "text/plain", streaming: true },
      { formatId: "json", mediaType: "application/json", structured: true },
    ],
  });

  assert.equal(capabilities.ok, true);
  assert.equal(formats.ok, true);
  if (!capabilities.ok || !formats.ok) {
    throw new Error("expected setup envelopes");
  }

  const result = mapIntermediateCapabilityCompatibility({
    runtimeId: "runtime",
    mappingId: "map-1",
    sourceInterfaceId: "responses-output",
    capabilityEnvelope: capabilities.envelope,
    formatEnvelope: formats.envelope,
    requestedScopes: ["model.output"],
    allowedScopes: ["model.output"],
  });

  assert.equal(intermediateMapperDescriptor.providerPayloadCreated, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected intermediate mapping");
  }

  assert.equal(result.mapping.kind, "agentCore.modelAdapter.intermediateMapping");
  assert.equal(result.mapping.mappingId, "map-1");
  assert.equal(result.mapping.compatible, true);
  assert.equal(result.mapping.bridgeHandoff.bridgingLayer, "pending");
  assert.equal(result.mapping.bridgeHandoff.providerPayloadCreated, false);
  assert.equal(result.mapping.unsafeSideEffects, false);
  assert.deepEqual(
    result.mapping.capabilityMatches.map((match) => [match.capabilityId, match.status]),
    [
      ["text-output", "matched"],
      ["json-output", "matched"],
    ],
  );
  assert.deepEqual(
    result.mapping.formatMatches.map((match) => [match.formatId, match.streaming, match.structured]),
    [
      ["text", true, false],
      ["json", false, true],
    ],
  );
});

test("intermediateMapper keeps compatibility gaps explicit and rejects unsafe envelopes", () => {
  const capabilities = defineOutputInterfaceCapabilities({
    runtimeId: "runtime",
    sourceInterfaceId: "responses-output",
    capabilities: [{ capabilityId: "text-output" }],
  });
  assert.equal(capabilities.ok, true);
  if (!capabilities.ok) {
    throw new Error("expected setup capability envelope");
  }

  const gapped = mapIntermediateCapabilityCompatibility({
    runtimeId: "runtime",
    mappingId: "map-2",
    sourceInterfaceId: "responses-output",
    capabilityEnvelope: capabilities.envelope,
    targetCapabilityIds: ["text-output", "tool-call-output"],
  });
  assert.equal(gapped.ok, true);
  if (!gapped.ok) {
    throw new Error("expected gapped intermediate mapping");
  }
  assert.equal(gapped.mapping.compatible, false);
  assert.deepEqual(gapped.mapping.gaps, [{ kind: "capability", id: "tool-call-output", reason: "missing" }]);

  const missingInput = mapIntermediateCapabilityCompatibility({
    runtimeId: "runtime",
    mappingId: "map-3",
    sourceInterfaceId: "responses-output",
  });
  assert.equal(missingInput.ok, false);
  if (missingInput.ok) {
    throw new Error("expected missing intermediate input rejection");
  }
  assert.equal(missingInput.error.code, "MISSING_INTERMEDIATE_INPUT");

  const mismatch = mapIntermediateCapabilityCompatibility({
    runtimeId: "runtime-2",
    mappingId: "map-4",
    sourceInterfaceId: "responses-output",
    capabilityEnvelope: capabilities.envelope,
  });
  assert.equal(mismatch.ok, false);
  if (mismatch.ok) {
    throw new Error("expected source mismatch rejection");
  }
  assert.equal(mismatch.error.code, "SOURCE_MISMATCH");
});
