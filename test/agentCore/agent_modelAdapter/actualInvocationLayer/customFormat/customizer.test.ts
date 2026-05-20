import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  customFormatCustomizerDescriptor,
  prepareCustomFormatInvocation,
} from "../../../../../src/agentCore/agent_modelAdapter/actualInvocationLayer/customFormat/customizer.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_modelAdapter/actualInvocationLayer/customFormat/customizer.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/customFormat/customizer.md",
  testFileUrl: import.meta.url,
});

test("prepareCustomFormatInvocation creates a dry-run carrier plan for private custom endpoints", () => {
  const result = prepareCustomFormatInvocation({
    providerId: " private-gateway ",
    endpointId: " chat ",
    endpoint: "https://private.example.test/v1/chat",
    protocol: "http",
    method: "POST",
    headers: { Authorization: "Bearer redacted", "X-Gateway": "test" },
    body: { prompt: "hello", vendor_option: true },
    auth: { required: true, present: true, scheme: "bearer" },
    timeoutMs: 5_000,
    retryLimit: 1,
  });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  assert.equal(result.plan.providerId, "private-gateway");
  assert.equal(result.plan.endpointId, "chat");
  assert.deepEqual(result.plan.headerHints, ["authorization", "x-gateway"]);
  assert.deepEqual(result.plan.mappedRequest?.keyHints, ["prompt", "vendor_option"]);
  assert.equal(result.plan.providerCarrierHandoff.mockable, true);
  assert.equal(result.plan.providerCarrierHandoff.networkCallStarted, false);
  assert.equal(result.plan.abstractionHandoff.customFormatPromotedToPraxisStandard, false);
  assert.equal(result.plan.audit.unsafeSideEffects, false);
  assert.equal(customFormatCustomizerDescriptor.dryRun, true);
});

test("prepareCustomFormatInvocation rejects official provider families and unhandled custom protocols", () => {
  const official = prepareCustomFormatInvocation({
    providerId: "openai",
    endpointId: "responses",
    endpoint: "/v1/responses",
    officialProviderFamily: "openai",
  });

  if (official.ok) {
    throw new Error("customizer should not claim official provider formats");
  }

  assert.equal(official.error.code, "OFFICIAL_PROVIDER_NOT_CUSTOM");
  assert.equal(official.error.boundary, "provider-config");
  assert.equal(official.error.rawProviderFieldsExposed, false);

  const unhandled = prepareCustomFormatInvocation({
    providerId: "private-gateway",
    endpointId: "chat",
    endpoint: "private-protocol://chat",
    protocol: "custom",
  });

  if (unhandled.ok) {
    throw new Error("custom protocol should require an injected handler");
  }

  assert.equal(unhandled.error.code, "CUSTOM_PROTOCOL_REQUIRES_HANDLER");
  assert.equal(unhandled.error.safeForRuntimeInspection, true);
});
