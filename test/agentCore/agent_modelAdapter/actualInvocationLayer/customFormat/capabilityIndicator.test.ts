import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  customFormatCapabilityIndicatorDescriptor,
  indicateCustomFormatCapability,
} from "../../../../../src/modelAdapter/actualInvocationLayer/customFormat/capabilityIndicator.js";
import { receiveCustomFormatCapability } from "../../../../../src/modelAdapter/actualInvocationLayer/customFormat/capabilityReceiver.js";

defineAgentCoreContractTest({
  sourcePath: "src/modelAdapter/actualInvocationLayer/customFormat/capabilityIndicator.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/customFormat/capabilityIndicator.md",
  testFileUrl: import.meta.url,
});

test("indicateCustomFormatCapability marks an available custom capability for abstraction use", () => {
  const received = receiveCustomFormatCapability({
    providerId: "custom-gateway",
    endpointId: "/v1/private-chat",
    capabilityId: "chat.text",
    inputChannels: ["text"],
    outputChannels: ["text"],
  });

  if (!received.ok) {
    throw new Error(received.error.message);
  }

  const result = indicateCustomFormatCapability({
    capability: received.capability,
    authReady: true,
    configurationReady: true,
    providerReachable: true,
    observedAt: "2026-04-23T00:00:00.000Z",
  });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  assert.equal(result.signal.availability, "available");
  assert.equal(result.signal.usableByAbstractionLayer, true);
  assert.equal(result.signal.observedAt, "2026-04-23T00:00:00.000Z");
  assert.deepEqual(result.signal.reasons, []);
  assert.equal(result.signal.audit.rawProviderFieldsExposed, false);
  assert.equal(customFormatCapabilityIndicatorDescriptor.unsafeSideEffects, false);
});

test("indicateCustomFormatCapability reports auth/configuration states as non-usable signals", () => {
  const received = receiveCustomFormatCapability({
    providerId: "custom-gateway",
    endpointId: "/v1/private-chat",
    capabilityId: "chat.text",
    inputChannels: ["text"],
    outputChannels: ["text"],
  });

  if (!received.ok) {
    throw new Error(received.error.message);
  }

  const needsAuth = indicateCustomFormatCapability({
    capability: received.capability,
    authReady: false,
  });

  if (!needsAuth.ok) {
    throw new Error(needsAuth.error.message);
  }

  assert.equal(needsAuth.signal.availability, "needs-auth");
  assert.equal(needsAuth.signal.usableByAbstractionLayer, false);
  assert.deepEqual(needsAuth.signal.reasons, ["provider authentication is required"]);

  const missing = indicateCustomFormatCapability();
  if (missing.ok) {
    throw new Error("indicator should reject empty input");
  }

  assert.equal(missing.error.code, "MISSING_CAPABILITY");
  assert.equal(missing.error.boundary, "input");
});
