import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  customFormatMapperDescriptor,
  mapCustomFormatEndpoint,
} from "../../../../../src/modelAdapter/actualInvocationLayer/customFormat/customMapper.js";

defineAgentCoreContractTest({
  sourcePath: "src/modelAdapter/actualInvocationLayer/customFormat/customMapper.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/customFormat/customMapper.md",
  testFileUrl: import.meta.url,
});

test("mapCustomFormatEndpoint wraps custom request, response, and capability material without retaining raw fields", () => {
  const result = mapCustomFormatEndpoint({
    providerId: " private-gateway ",
    endpointId: " /v1/custom-chat ",
    requestBody: { prompt: "hello", vendor_option: true },
    responseBody: { id: "resp_1", output: [{ text: "hi" }] },
    responseStatus: 200,
    capability: {
      capabilityId: " chat.text ",
      inputChannels: [" text ", "text"],
      outputChannels: [" text "],
      supportsStreaming: true,
    },
    trace: { correlationId: " corr-1 " },
  });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  assert.equal(result.mapping.providerId, "private-gateway");
  assert.equal(result.mapping.endpointId, "/v1/custom-chat");
  assert.deepEqual(result.mapping.requestEnvelope?.keyHints, ["prompt", "vendor_option"]);
  assert.equal(result.mapping.requestEnvelope?.retained, false);
  assert.deepEqual(result.mapping.responseEnvelope?.keyHints, ["id", "output"]);
  assert.equal(result.mapping.capability?.capabilityId, "chat.text");
  assert.deepEqual(result.mapping.capability?.inputChannels, ["text"]);
  assert.equal(result.mapping.abstractionHandoff.rawProviderFieldsExposed, false);
  assert.equal(result.mapping.abstractionHandoff.customFormatPromotedToPraxisStandard, false);
  assert.equal(customFormatMapperDescriptor.unsafeSideEffects, false);
});

test("mapCustomFormatEndpoint classifies upstream errors and rejects missing mapping material", () => {
  const errorResult = mapCustomFormatEndpoint({
    providerId: "private-gateway",
    endpointId: "/v1/custom-chat",
    upstreamError: { status: 429, message: "rate limit exceeded", detail: "hidden" },
  });

  if (!errorResult.ok) {
    throw new Error(errorResult.error.message);
  }

  assert.equal(errorResult.mapping.errorEnvelope?.category, "rate-limit");
  assert.deepEqual(errorResult.mapping.errorEnvelope?.keyHints, ["detail", "message", "status"]);
  assert.equal(errorResult.mapping.errorEnvelope?.rawProviderFieldsExposed, false);

  const missingMaterial = mapCustomFormatEndpoint({
    providerId: "private-gateway",
    endpointId: "/v1/custom-chat",
  });

  if (missingMaterial.ok) {
    throw new Error("mapper should reject empty mapping material");
  }

  assert.equal(missingMaterial.error.code, "MISSING_MAPPING_MATERIAL");
  assert.equal(missingMaterial.error.safeForRuntimeInspection, true);
  assert.equal(missingMaterial.error.rawProviderFieldsExposed, false);
});
