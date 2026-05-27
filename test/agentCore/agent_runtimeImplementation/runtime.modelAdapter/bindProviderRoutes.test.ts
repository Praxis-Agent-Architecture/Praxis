import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { bindProviderRoutes } from "../../../../src/runtimeImplementation/runtime.modelAdapter/bindProviderRoutes.js";

defineAgentCoreContractTest({
  sourcePath: "src/runtimeImplementation/runtime.modelAdapter/bindProviderRoutes.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.modelAdapter/bindProviderRoutes.md",
  testFileUrl: import.meta.url,
});

test("bindProviderRoutes exposes provider route refs as a runtime binding", () => {
  const result = bindProviderRoutes({
    runtimeId: " runtime-1 ",
    caller: { kind: "application", id: " app-1 ", sessionId: " session-1 " },
    routeGroup: {
      id: " default-providers ",
      routes: [
        { provider: " openai ", routeId: " openai ", protocolId: " openai.chat " },
        { provider: " openai ", routeId: " openai-responses " },
        { provider: " anthropic ", routeId: " anthropic ", protocolId: " anthropic.messages " },
      ],
      metadata: { source: "registry" },
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.binding.bindingId, "runtime-1:providerRoutes:default-providers");
  assert.equal(result.binding.surface, "provider");
  assert.equal(result.binding.route, "runtime.modelAdapter.providerRoutes");
  assert.deepEqual(result.binding.providers, ["openai", "anthropic"]);
  assert.deepEqual(result.binding.routes, [
    { provider: "openai", routeId: "openai", protocolId: "openai.chat" },
    { provider: "openai", routeId: "openai-responses" },
    { provider: "anthropic", routeId: "anthropic", protocolId: "anthropic.messages" },
  ]);
  assert.equal(result.binding.dryRun, true);
  assert.equal(result.binding.unsafeSideEffects, false);
});

test("bindProviderRoutes rejects unsafe or incomplete route bindings", () => {
  const missing = bindProviderRoutes({
    runtimeId: "runtime-1",
    caller: { kind: "application", id: "app-1" },
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.error.code, "MISSING_ROUTE_GROUP");

  const emptyRoutes = bindProviderRoutes({
    runtimeId: "runtime-1",
    caller: { kind: "application", id: "app-1" },
    routeGroup: { id: "default", routes: [{ provider: " ", routeId: " " }] },
  });
  assert.equal(emptyRoutes.ok, false);
  if (!emptyRoutes.ok) assert.equal(emptyRoutes.error.code, "EMPTY_PROVIDER_ROUTES");

  const governanceRejected = bindProviderRoutes({
    runtimeId: "runtime-1",
    caller: { kind: "application", id: "app-1" },
    routeGroup: { id: "default", routes: [{ provider: "openai", routeId: "openai" }] },
    governance: { accepted: false, reason: "provider route not allowed" },
  });
  assert.equal(governanceRejected.ok, false);
  if (!governanceRejected.ok) {
    assert.equal(governanceRejected.error.code, "GOVERNANCE_REJECTED");
    assert.equal(governanceRejected.error.boundary, "governance");
  }
});
