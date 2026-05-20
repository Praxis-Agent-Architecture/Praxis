import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { createModelAdapterRuntime } from "../../../../src/agentCore_runtimeImplementation/runtime.modelAdapter/modelAdapterRuntime.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_runtimeImplementation/runtime.modelAdapter/modelAdapterRuntime.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.modelAdapter/modelAdapterRuntime.md",
  testFileUrl: import.meta.url,
});

test("modelAdapterRuntime binds the three model adapter layer surfaces into one runtime handle", () => {
  const result = createModelAdapterRuntime({
    runtimeId: " runtime-1 ",
    caller: { kind: "application", id: " app-1 ", sessionId: " session-1 " },
    requestedScopes: [" model.invoke ", "provider.read"],
    allowedScopes: ["model.invoke", "provider.read", "model.inspect"],
    bindings: [
      {
        surface: "actualInvocationLayer",
        bindingId: " invocation-binding-1 ",
        capabilities: ["provider.carrier", " provider.carrier "],
      },
      { surface: "abstractionLayer", bindingId: "abstraction-binding-1", capabilities: ["provider.abstract"] },
      { surface: "bridgingLayer", bindingId: "bridge-binding-1", metadata: { internal: true } },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.runtime.runtimeId, "runtime-1");
  assert.equal(result.runtime.route, "runtime.modelAdapter");
  assert.deepEqual(result.runtime.bindingIds, [
    "invocation-binding-1",
    "abstraction-binding-1",
    "bridge-binding-1",
  ]);
  assert.deepEqual(result.runtime.surfaces, ["actualInvocationLayer", "abstractionLayer", "bridgingLayer"]);
  assert.deepEqual(result.runtime.bindings[0]?.capabilities, ["provider.carrier"]);
  assert.deepEqual(result.runtime.grantedScopes, ["model.invoke", "provider.read"]);
  assert.equal(result.runtime.dryRun, true);
  assert.equal(result.runtime.unsafeSideEffects, false);
});

test("modelAdapterRuntime rejects missing, unready, and out-of-scope bindings before exposure", () => {
  assert.deepEqual(
    createModelAdapterRuntime({
      runtimeId: "runtime-1",
      caller: { kind: "application", id: "app-1" },
    }),
    {
      ok: false,
      error: {
        code: "MISSING_BINDINGS",
        message: "modelAdapter runtime requires at least one narrow binding",
        boundary: "input",
        publicSafe: true,
      },
      events: ["runtime.modelAdapter.rejected"],
    },
  );

  const unready = createModelAdapterRuntime({
    runtimeId: "runtime-1",
    caller: { kind: "application", id: "app-1" },
    bindings: [{ surface: "bridgingLayer", bindingId: "bridge-binding-1", ready: false }],
  });

  assert.equal(unready.ok, false);
  if (unready.ok) {
    return;
  }

  assert.equal(unready.error.code, "BINDING_NOT_READY");
  assert.equal(unready.error.boundary, "binding");

  const denied = createModelAdapterRuntime({
    runtimeId: "runtime-1",
    caller: { kind: "official-module", id: "cmp" },
    requestedScopes: ["model.invoke", "provider.admin"],
    allowedScopes: ["model.invoke"],
    bindings: [{ surface: "actualInvocationLayer", bindingId: "invocation-binding-1" }],
  });

  assert.equal(denied.ok, false);
  if (denied.ok) {
    return;
  }

  assert.equal(denied.error.code, "SCOPE_DENIED");
  assert.equal(denied.error.boundary, "scope");
});
