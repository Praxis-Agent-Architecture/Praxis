import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  customFormatCapabilityReceiverDescriptor,
  receiveCustomFormatCapability,
} from "../../../../../src/modelAdapter/actualInvocationLayer/customFormat/capabilityReceiver.js";

defineAgentCoreContractTest({
  sourcePath: "src/modelAdapter/actualInvocationLayer/customFormat/capabilityReceiver.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/customFormat/capabilityReceiver.md",
  testFileUrl: import.meta.url,
});

test("receiveCustomFormatCapability normalizes external capability material without retaining raw fields", () => {
  const result = receiveCustomFormatCapability({
    providerId: " custom-gateway ",
    endpointId: " /v1/private-chat ",
    capabilityId: " chat.text ",
    label: " Private Chat ",
    inputChannels: [" text ", "text"],
    outputChannels: [" text "],
    toolUse: true,
    streaming: true,
    contextWindowTokens: 32000,
    raw: { vendor_field: "hidden", nested: { value: true } },
    trace: { correlationId: " corr-1 " },
  });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  assert.equal(result.capability.providerId, "custom-gateway");
  assert.equal(result.capability.endpointId, "/v1/private-chat");
  assert.equal(result.capability.capabilityId, "chat.text");
  assert.deepEqual(result.capability.inputChannels, ["text"]);
  assert.deepEqual(result.capability.outputChannels, ["text"]);
  assert.equal(result.capability.featureFlags.toolUse, true);
  assert.equal(result.capability.featureFlags.streaming, true);
  assert.equal(result.capability.rawEnvelope.retained, false);
  assert.deepEqual(result.capability.rawEnvelope.keyHints, ["nested", "vendor_field"]);
  assert.equal(result.capability.audit.rawProviderFieldsExposed, false);
  assert.equal(customFormatCapabilityReceiverDescriptor.unsafeSideEffects, false);
});

test("receiveCustomFormatCapability rejects missing signals and malformed raw envelopes", () => {
  const missingSignal = receiveCustomFormatCapability({
    providerId: "custom-gateway",
    endpointId: "/v1/private-chat",
    capabilityId: "chat.text",
  });

  if (missingSignal.ok) {
    throw new Error("receiver should reject a capability without usable signals");
  }

  assert.equal(missingSignal.error.code, "MISSING_CAPABILITY_SIGNAL");
  assert.equal(missingSignal.error.boundary, "input");
  assert.equal(missingSignal.error.rawProviderFieldsExposed, false);

  const invalidRaw = receiveCustomFormatCapability({
    providerId: "custom-gateway",
    endpointId: "/v1/private-chat",
    capabilityId: "chat.text",
    inputChannels: ["text"],
    raw: [] as unknown as Record<string, unknown>,
  });

  if (invalidRaw.ok) {
    throw new Error("receiver should reject non-record raw envelopes");
  }

  assert.equal(invalidRaw.error.code, "INVALID_RAW_ENVELOPE");
  assert.equal(invalidRaw.error.safeForRuntimeInspection, true);
});
