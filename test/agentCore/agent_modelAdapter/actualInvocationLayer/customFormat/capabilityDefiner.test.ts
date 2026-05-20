import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  customFormatCapabilityDefinerDescriptor,
  defineCustomFormatCapabilities,
} from "../../../../../src/agentCore_modelAdapter/actualInvocationLayer/customFormat/capabilityDefiner.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_modelAdapter/actualInvocationLayer/customFormat/capabilityDefiner.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/customFormat/capabilityDefiner.md",
  testFileUrl: import.meta.url,
});

test("defineCustomFormatCapabilities defines claimed capabilities for abstraction handoff", () => {
  const result = defineCustomFormatCapabilities({
    providerId: " custom-gateway ",
    endpointId: " /v1/private-chat ",
    claims: [
      {
        capabilityId: "chat.text",
        inputChannels: ["text"],
        outputChannels: ["text"],
        streaming: true,
      },
      {
        capabilityId: "chat.vision",
        inputChannels: ["image", " text "],
        outputChannels: ["text"],
      },
    ],
    trace: { callerId: "runtime.modelAdapter" },
  });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  assert.equal(result.definition.providerId, "custom-gateway");
  assert.equal(result.definition.endpointId, "/v1/private-chat");
  assert.deepEqual(result.definition.capabilityIds, ["chat.text", "chat.vision"]);
  assert.equal(result.definition.capabilities.length, 2);
  assert.equal(result.definition.abstractionHandoff.target, "agent_modelAdapter.abstractionLayer");
  assert.equal(result.definition.abstractionHandoff.rawProviderFieldsExposed, false);
  assert.equal(result.definition.abstractionHandoff.customFormatPromotedToPraxisStandard, false);
  assert.equal(result.definition.audit.unsafeSideEffects, false);
  assert.equal(customFormatCapabilityDefinerDescriptor.dryRun, true);
});

test("defineCustomFormatCapabilities classifies rejected claims without leaking provider internals", () => {
  const result = defineCustomFormatCapabilities({
    providerId: "custom-gateway",
    endpointId: "/v1/private-chat",
    claims: [{ capabilityId: "chat.empty" }],
  });

  if (result.ok) {
    throw new Error("definer should reject claims that the receiver cannot normalize");
  }

  assert.equal(result.error.code, "CLAIM_REJECTED");
  assert.equal(result.error.boundary, "input");
  assert.equal(result.error.safeForRuntimeInspection, true);
  assert.equal(result.error.rawProviderFieldsExposed, false);
});
