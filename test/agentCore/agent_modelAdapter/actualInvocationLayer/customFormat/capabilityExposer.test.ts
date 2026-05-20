import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  customFormatCapabilityExposerDescriptor,
  exposeCustomFormatCapabilities,
} from "../../../../../src/modelAdapter/actualInvocationLayer/customFormat/capabilityExposer.js";
import { indicateCustomFormatCapability } from "../../../../../src/modelAdapter/actualInvocationLayer/customFormat/capabilityIndicator.js";
import { receiveCustomFormatCapability } from "../../../../../src/modelAdapter/actualInvocationLayer/customFormat/capabilityReceiver.js";

defineAgentCoreContractTest({
  sourcePath: "src/modelAdapter/actualInvocationLayer/customFormat/capabilityExposer.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/customFormat/capabilityExposer.md",
  testFileUrl: import.meta.url,
});

test("exposeCustomFormatCapabilities exposes only usable sanitized capability signals", () => {
  const usableCapability = receiveCustomFormatCapability({
    providerId: "custom-gateway",
    endpointId: "/v1/private-chat",
    capabilityId: "chat.text",
    label: "Text Chat",
    inputChannels: ["text"],
    outputChannels: ["text"],
    streaming: true,
  });
  const authBlockedCapability = receiveCustomFormatCapability({
    providerId: "custom-gateway",
    endpointId: "/v1/private-chat",
    capabilityId: "chat.files",
    inputChannels: ["file"],
    outputChannels: ["text"],
    fileExchange: true,
  });

  if (!usableCapability.ok || !authBlockedCapability.ok) {
    throw new Error("test setup should create received capabilities");
  }

  const usableSignal = indicateCustomFormatCapability({ capability: usableCapability.capability });
  const blockedSignal = indicateCustomFormatCapability({
    capability: authBlockedCapability.capability,
    authReady: false,
  });

  if (!usableSignal.ok || !blockedSignal.ok) {
    throw new Error("test setup should create capability signals");
  }

  const result = exposeCustomFormatCapabilities({
    providerId: "custom-gateway",
    signals: [usableSignal.signal, blockedSignal.signal],
    allowedCapabilityIds: ["chat.text"],
  });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  assert.equal(result.exposure.providerId, "custom-gateway");
  assert.equal(result.exposure.exposed.length, 1);
  assert.equal(result.exposure.exposed[0]?.capabilityId, "chat.text");
  assert.equal(result.exposure.exposed[0]?.label, "Text Chat");
  assert.equal(result.exposure.exposed[0]?.next, "agent_modelAdapter.abstractionLayer");
  assert.equal(result.exposure.exposed[0]?.rawProviderFieldsExposed, false);
  assert.equal(result.exposure.withheld.length, 1);
  assert.equal(result.exposure.withheld[0]?.availability, "needs-auth");
  assert.equal(result.exposure.audit.customFormatPromotedToPraxisStandard, false);
  assert.equal(customFormatCapabilityExposerDescriptor.dryRun, true);
});

test("exposeCustomFormatCapabilities rejects provider mismatches and denied scopes", () => {
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

  const signal = indicateCustomFormatCapability({ capability: received.capability });
  if (!signal.ok) {
    throw new Error(signal.error.message);
  }

  const mismatch = exposeCustomFormatCapabilities({
    providerId: "another-gateway",
    signals: [signal.signal],
  });

  if (mismatch.ok) {
    throw new Error("exposer should reject signals from another provider");
  }

  assert.equal(mismatch.error.code, "PROVIDER_MISMATCH");
  assert.equal(mismatch.error.boundary, "input");

  const denied = exposeCustomFormatCapabilities({
    providerId: "custom-gateway",
    signals: [signal.signal],
    allowedCapabilityIds: ["chat.other"],
  });

  if (denied.ok) {
    throw new Error("exposer should reject usable capabilities outside allowed scope");
  }

  assert.equal(denied.error.code, "SCOPE_DENIED");
  assert.equal(denied.error.boundary, "scope");
  assert.equal(denied.error.rawProviderFieldsExposed, false);
});
