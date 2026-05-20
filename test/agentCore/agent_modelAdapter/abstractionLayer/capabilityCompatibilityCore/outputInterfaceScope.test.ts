import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import {
  defineOutputInterfaceScope,
  outputInterfaceScopeDescriptor,
} from "../../../../../src/agentCore_modelAdapter/abstractionLayer/capabilityCompatibilityCore/outputInterfaceScope.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_modelAdapter/abstractionLayer/capabilityCompatibilityCore/outputInterfaceScope.ts",
  docPath: "docs/agentCore/agent_modelAdapter/abstractionLayer/capabilityCompatibilityCore/outputInterfaceScope.md",
  testFileUrl: import.meta.url,
});

test("defineOutputInterfaceScope normalizes bridgeable output interface scopes", () => {
  const result = defineOutputInterfaceScope({
    providerId: " openai ",
    modelId: " model:text ",
    requestedScopes: ["chat", "chat"],
    allowedScopes: ["chat", "diagnostic"],
    trace: { runtimeId: " runtime:one ", correlationId: " corr:one " },
    outputInterfaces: [
      {
        interfaceId: " text-stream ",
        modality: "text",
        channels: ["stream", "single", "stream"],
        scopes: [" chat ", "diagnostic"],
        formatHint: " responses-output ",
        required: true,
      },
    ],
  });

  assert.equal(outputInterfaceScopeDescriptor.providerRawShapeExposed, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected output interface scope to be accepted");
  }

  assert.equal(result.scope.kind, "output-interface-scope");
  assert.equal(result.scope.providerId, "openai");
  assert.equal(result.scope.modelId, "model:text");
  assert.equal(result.scope.trace.runtimeId, "runtime:one");
  assert.equal(result.scope.providerRawShapeExposed, false);
  assert.equal(result.scope.unsafeSideEffects, false);
  assert.equal(result.scope.compatibility, "compatible");
  assert.equal(result.scope.bridgeReady, true);
  assert.deepEqual(result.scope.requestedScopes, ["chat"]);
  assert.deepEqual(result.scope.interfaces[0]?.channels, ["stream", "single"]);
});

test("defineOutputInterfaceScope reports partial gaps without exposing provider raw shape", () => {
  const result = defineOutputInterfaceScope({
    providerId: "custom",
    requestedScopes: ["chat"],
    allowedScopes: ["chat"],
    outputInterfaces: [
      { interfaceId: "text", modality: "text", scopes: ["chat"] },
      { interfaceId: "future-output", modality: "hologram", scopes: ["chat"] },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected partial compatibility to stay bridgeable");
  }

  assert.equal(result.scope.compatibility, "partial");
  assert.equal(result.scope.bridgeReady, true);
  assert.equal(result.scope.gaps[0]?.interfaceId, "future-output");
  assert.equal(result.scope.gaps[0]?.reason.includes("agentCore DSL"), true);
});

test("defineOutputInterfaceScope rejects empty input, denied scopes, and required incompatible outputs", () => {
  const missingProvider = defineOutputInterfaceScope();
  assert.equal(missingProvider.ok, false);
  if (missingProvider.ok) {
    throw new Error("expected missing provider rejection");
  }
  assert.equal(missingProvider.error.code, "MISSING_PROVIDER_ID");
  assert.equal(missingProvider.error.providerRawShapeExposed, false);

  const deniedScope = defineOutputInterfaceScope({
    providerId: "provider",
    requestedScopes: ["private"],
    allowedScopes: ["chat"],
    outputInterfaces: [{ interfaceId: "text", modality: "text", scopes: ["private"] }],
  });
  assert.equal(deniedScope.ok, false);
  if (deniedScope.ok) {
    throw new Error("expected scope rejection");
  }
  assert.equal(deniedScope.error.code, "SCOPE_DENIED");

  const unsupportedRequired = defineOutputInterfaceScope({
    providerId: "provider",
    requestedScopes: ["chat"],
    allowedScopes: ["chat"],
    outputInterfaces: [{ interfaceId: "future", modality: "hologram", scopes: ["chat"], required: true }],
  });
  assert.equal(unsupportedRequired.ok, false);
  if (unsupportedRequired.ok) {
    throw new Error("expected unsupported required output rejection");
  }
  assert.equal(unsupportedRequired.error.code, "UNSUPPORTED_OUTPUT_SCOPE");
});
