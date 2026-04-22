import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import {
  mapIntermediateCapabilityCompatibility,
  type IntermediateCompatibilityMapping,
} from "../../../../../src/agentCore/agent_modelAdapter/abstractionLayer/capabilityCompatibilityCore/intermediateMapper.js";
import {
  intermediateTransformerDescriptor,
  transformIntermediateCompatibility,
} from "../../../../../src/agentCore/agent_modelAdapter/abstractionLayer/capabilityCompatibilityCore/intermediateTransformer.js";
import { defineOutputInterfaceCapabilities } from "../../../../../src/agentCore/agent_modelAdapter/abstractionLayer/capabilityCompatibilityCore/outputInterfaceCapability.js";
import { defineOutputInterfaceFormats } from "../../../../../src/agentCore/agent_modelAdapter/abstractionLayer/capabilityCompatibilityCore/outputInterfaceFormat.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_modelAdapter/abstractionLayer/capabilityCompatibilityCore/intermediateTransformer.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_modelAdapter/abstractionLayer/capabilityCompatibilityCore/intermediateTransformer.md",
  testFileUrl: import.meta.url,
});

function buildCompatibleMapping(): IntermediateCompatibilityMapping {
  const capabilities = defineOutputInterfaceCapabilities({
    runtimeId: "runtime",
    sourceInterfaceId: "responses-output",
    capabilities: [{ capabilityId: "text-output", providerKey: "output_text", required: true }],
  });
  const formats = defineOutputInterfaceFormats({
    runtimeId: "runtime",
    sourceInterfaceId: "responses-output",
    formats: [{ formatId: "text", mediaType: "text/plain", streaming: true }],
  });
  assert.equal(capabilities.ok, true);
  assert.equal(formats.ok, true);
  if (!capabilities.ok || !formats.ok) {
    throw new Error("expected setup envelopes");
  }

  const mapping = mapIntermediateCapabilityCompatibility({
    runtimeId: "runtime",
    mappingId: "map-1",
    sourceInterfaceId: "responses-output",
    capabilityEnvelope: capabilities.envelope,
    formatEnvelope: formats.envelope,
  });
  assert.equal(mapping.ok, true);
  if (!mapping.ok) {
    throw new Error("expected setup mapping");
  }
  return mapping.mapping;
}

test("intermediateTransformer produces a bridge-ready envelope from an intermediate mapping", () => {
  const result = transformIntermediateCompatibility({
    runtimeId: " runtime ",
    transformationId: " transform-1 ",
    mapping: buildCompatibleMapping(),
    requestedScopes: ["model.output"],
    allowedScopes: ["model.output"],
  });

  assert.equal(intermediateTransformerDescriptor.providerPayloadCreated, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected intermediate transformation");
  }

  assert.equal(result.envelope.kind, "agentCore.modelAdapter.intermediateTransformation");
  assert.equal(result.envelope.transformationId, "transform-1");
  assert.equal(result.envelope.bridgeReadiness, "ready");
  assert.equal(result.envelope.bridgeHandoff.bridgingLayer, "pending");
  assert.equal(result.envelope.bridgeHandoff.providerPayloadCreated, false);
  assert.equal(result.envelope.unsafeSideEffects, false);
  assert.deepEqual(result.envelope.capabilities.map((capability) => capability.capabilityId), ["text-output"]);
  assert.deepEqual(result.envelope.formats.map((format) => [format.formatId, format.streaming]), [["text", true]]);
});

test("intermediateTransformer preserves gaps unless strict compatibility is required", () => {
  const compatibleMapping = buildCompatibleMapping();
  const gappedMapping: IntermediateCompatibilityMapping = {
    ...compatibleMapping,
    compatible: false,
    gaps: [{ kind: "format", id: "json", reason: "missing" }],
  };

  const soft = transformIntermediateCompatibility({
    runtimeId: "runtime",
    transformationId: "transform-2",
    mapping: gappedMapping,
  });
  assert.equal(soft.ok, true);
  if (!soft.ok) {
    throw new Error("expected soft transformation with gaps");
  }
  assert.equal(soft.envelope.bridgeReadiness, "blocked-by-compatibility-gap");
  assert.deepEqual(soft.envelope.gaps, [{ kind: "format", id: "json", reason: "missing" }]);

  const strict = transformIntermediateCompatibility({
    runtimeId: "runtime",
    transformationId: "transform-3",
    mapping: gappedMapping,
    requireCompatibility: true,
  });
  assert.equal(strict.ok, false);
  if (strict.ok) {
    throw new Error("expected strict compatibility rejection");
  }
  assert.equal(strict.error.code, "INCOMPATIBLE_MAPPING");

  const mismatch = transformIntermediateCompatibility({
    runtimeId: "runtime-2",
    transformationId: "transform-4",
    mapping: compatibleMapping,
  });
  assert.equal(mismatch.ok, false);
  if (mismatch.ok) {
    throw new Error("expected runtime mismatch rejection");
  }
  assert.equal(mismatch.error.code, "RUNTIME_MISMATCH");
});
