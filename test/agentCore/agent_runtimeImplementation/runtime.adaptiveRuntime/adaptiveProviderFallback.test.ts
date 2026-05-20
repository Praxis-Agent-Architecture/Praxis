import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { planAdaptiveProviderFallback } from "../../../../src/runtimeImplementation/runtime.adaptiveRuntime/adaptiveProviderFallback.js";

defineAgentCoreContractTest({
  sourcePath: "src/runtimeImplementation/runtime.adaptiveRuntime/adaptiveProviderFallback.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.adaptiveRuntime/adaptiveProviderFallback.md",
  testFileUrl: import.meta.url,
});

test("adaptiveProviderFallback chooses a fallback chain without provider calls", () => {
  const result = planAdaptiveProviderFallback({
    runtimeId: " runtime-1 ",
    caller: { kind: "runtime-surface", id: " adaptive-runtime " },
    currentProviderId: "openai-primary",
    requiredCapabilities: ["text-generation"],
    allowedScopes: ["model.invoke"],
    providers: [
      {
        providerId: "openai-primary",
        provider: "openai",
        ready: true,
        healthScore: 0.95,
        priority: 2,
        latencyMs: 300,
        capabilities: ["text-generation"],
        scopes: ["model.invoke"],
      },
      {
        providerId: "anthropic-fallback",
        provider: "anthropic",
        ready: true,
        healthScore: 0.9,
        priority: 1,
        latencyMs: 250,
        capabilities: ["text-generation", "tool-call"],
        scopes: ["model.invoke"],
      },
      {
        providerId: "image-only",
        provider: "customFormat",
        capabilities: ["image-generation"],
      },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.planId, "runtime-1:adaptiveProviderFallback:anthropic-fallback");
  assert.equal(result.plan.route, "runtime.adaptiveRuntime.adaptiveProviderFallback");
  assert.equal(result.plan.currentProviderId, "openai-primary");
  assert.equal(result.plan.selectedProvider.providerId, "anthropic-fallback");
  assert.deepEqual(
    result.plan.fallbackChain.map((provider) => provider.providerId),
    ["anthropic-fallback"],
  );
  assert.deepEqual(result.plan.rejectedProviderIds, ["image-only"]);
  assert.equal(result.plan.dryRun, true);
  assert.equal(result.plan.unsafeSideEffects, false);
});

test("adaptiveProviderFallback rejects unavailable fallbacks and denied scopes", () => {
  const unavailable = planAdaptiveProviderFallback({
    runtimeId: "runtime-1",
    caller: { kind: "test", id: "test" },
    requiredCapabilities: ["tool-call"],
    providers: [{ providerId: "openai", provider: "openai", capabilities: ["text-generation"] }],
  });

  assert.equal(unavailable.ok, false);
  if (!unavailable.ok) {
    assert.equal(unavailable.error.code, "NO_FALLBACK_PROVIDER");
    assert.equal(unavailable.error.boundary, "provider");
  }

  const denied = planAdaptiveProviderFallback({
    runtimeId: "runtime-1",
    caller: { kind: "official-module", id: "mp" },
    allowedScopes: ["model.read"],
    providers: [{ providerId: "openai", provider: "openai", scopes: ["model.invoke"] }],
  });

  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.error.code, "SCOPE_DENIED");
    assert.equal(denied.error.boundary, "scope");
  }

  const currentOnly = planAdaptiveProviderFallback({
    runtimeId: "runtime-1",
    caller: { kind: "test", id: "test" },
    currentProviderId: "openai",
    requiredCapabilities: ["text-generation"],
    providers: [{ providerId: "openai", provider: "openai", ready: true, capabilities: ["text-generation"] }],
  });

  assert.equal(currentOnly.ok, false);
  if (!currentOnly.ok) {
    assert.equal(currentOnly.error.code, "NO_FALLBACK_PROVIDER");
    assert.equal(currentOnly.error.boundary, "provider");
  }
});
