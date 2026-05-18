import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { createCredentialRef } from "../../../../src/agentCore/agent_modelAdapter/authProfileLayer/credentialRef.js";
import { registerProviderCarriers } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.modelAdapter/providerCarrierRegistry.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_runtimeImplementation/runtime.modelAdapter/providerCarrierRegistry.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.modelAdapter/providerCarrierRegistry.md",
  testFileUrl: import.meta.url,
});

test("providerCarrierRegistry registers provider carriers as dry-run runtime state", () => {
  const credentialRef = createCredentialRef({
    id: "default",
    provider: "openai",
    credentialType: "openai_api_key",
    source: { kind: "test", label: "unit" },
  });
  assert.equal(credentialRef.ok, true);
  if (!credentialRef.ok) {
    throw new Error("expected credentialRef");
  }

  const result = registerProviderCarriers({
    runtimeId: " runtime-1 ",
    caller: { kind: "runtime-surface", id: " model-adapter-runtime " },
    allowedScopes: ["model.invoke", "provider.read"],
    carriers: [
      {
        carrierId: " openai-carrier ",
        provider: "openai",
        endpointShape: " responses ",
        baseURL: "https://api.openai.com/",
        model: " gpt-5.4 ",
        reasoning: { effort: " low " },
        credentialRef: credentialRef.credentialRef,
        cachePolicy: { intent: "prefer-provider-cache", vendorHints: { promptCache: true } },
        capabilities: [" text-generation ", "tool-call", "tool-call"],
        scopes: ["model.invoke", " provider.read "],
      },
      {
        carrierId: "custom-carrier",
        provider: "customFormat",
        endpointShape: "custom",
        capabilities: ["text-generation"],
      },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.registry.registryId, "runtime-1:providerCarrierRegistry");
  assert.equal(result.registry.route, "runtime.modelAdapter.providerCarrierRegistry");
  assert.deepEqual(result.registry.carrierIds, ["openai-carrier", "custom-carrier"]);
  assert.deepEqual(result.registry.providers, ["openai", "customFormat"]);
  assert.deepEqual(result.registry.capabilities, ["text-generation", "tool-call"]);
  assert.deepEqual(result.registry.grantedScopes, ["model.invoke", "provider.read"]);
  assert.equal(result.registry.carriers[0]?.baseURL, "https://api.openai.com");
  assert.equal(result.registry.carriers[0]?.model, "gpt-5.4");
  assert.equal(result.registry.carriers[0]?.reasoning?.effort, "low");
  assert.equal(result.registry.carriers[0]?.credentialRef?.credentialType, "openai_api_key");
  assert.equal(result.registry.carriers[0]?.cachePolicy.intent, "prefer-provider-cache");
  assert.equal(result.registry.dryRun, true);
  assert.equal(result.registry.unsafeSideEffects, false);
});

test("providerCarrierRegistry rejects duplicate carriers and governance scope violations", () => {
  const duplicate = registerProviderCarriers({
    runtimeId: "runtime-1",
    caller: { kind: "application", id: "app-1" },
    carriers: [
      { carrierId: "carrier-1", provider: "openai" },
      { carrierId: "carrier-1", provider: "anthropic" },
    ],
  });

  assert.equal(duplicate.ok, false);
  if (duplicate.ok) {
    return;
  }

  assert.equal(duplicate.error.code, "DUPLICATE_CARRIER_ID");
  assert.equal(duplicate.error.boundary, "registry");

  const denied = registerProviderCarriers({
    runtimeId: "runtime-1",
    caller: { kind: "official-module", id: "cmp" },
    allowedScopes: ["provider.read"],
    carriers: [{ carrierId: "carrier-1", provider: "openai", scopes: ["provider.admin"] }],
  });

  assert.equal(denied.ok, false);
  if (denied.ok) {
    return;
  }

  assert.equal(denied.error.code, "SCOPE_DENIED");
  assert.equal(denied.error.boundary, "scope");
});
