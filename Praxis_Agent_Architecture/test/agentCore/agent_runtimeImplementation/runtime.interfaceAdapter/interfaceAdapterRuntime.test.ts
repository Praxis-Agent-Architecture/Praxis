import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { createInterfaceAdapterRuntime } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.interfaceAdapter/interfaceAdapterRuntime.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_runtimeImplementation/runtime.interfaceAdapter/interfaceAdapterRuntime.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_runtimeImplementation/runtime.interfaceAdapter/interfaceAdapterRuntime.md",
  testFileUrl: import.meta.url,
});

test("interfaceAdapterRuntime binds basic, custom, and bridge surfaces into one runtime handle", () => {
  const result = createInterfaceAdapterRuntime({
    runtimeId: " runtime-1 ",
    caller: { kind: "runtime-surface", id: " interface-adapter ", sessionId: " session-1 " },
    requestedScopes: [" interface.bind ", "interface.inspect"],
    allowedScopes: ["interface.bind", "interface.inspect", "interface.audit"],
    bindings: [
      {
        surface: "basicInterfaceLayer",
        bindingId: " basic-binding-1 ",
        capabilities: ["official.interface", " official.interface "],
      },
      { surface: "customInterfaceLayer", bindingId: "custom-binding-1", capabilities: ["custom.interface"] },
      {
        surface: "customInterfaceRuntimeBridge",
        bindingId: "bridge-binding-1",
        metadata: { mockableEnvelope: true },
      },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.runtime.runtimeId, "runtime-1");
  assert.equal(result.runtime.route, "runtime.interfaceAdapter");
  assert.deepEqual(result.runtime.bindingIds, ["basic-binding-1", "custom-binding-1", "bridge-binding-1"]);
  assert.deepEqual(result.runtime.surfaces, [
    "basicInterfaceLayer",
    "customInterfaceLayer",
    "customInterfaceRuntimeBridge",
  ]);
  assert.deepEqual(result.runtime.bindings[0]?.capabilities, ["official.interface"]);
  assert.deepEqual(result.runtime.grantedScopes, ["interface.bind", "interface.inspect"]);
  assert.equal(result.runtime.dryRun, true);
  assert.equal(result.runtime.unsafeSideEffects, false);
});

test("interfaceAdapterRuntime rejects missing, unready, and out-of-scope bindings before exposure", () => {
  assert.deepEqual(
    createInterfaceAdapterRuntime({
      runtimeId: "runtime-1",
      caller: { kind: "application", id: "app-1" },
    }),
    {
      ok: false,
      error: {
        code: "MISSING_BINDINGS",
        message: "interfaceAdapter runtime requires at least one narrow binding",
        boundary: "input",
        publicSafe: true,
      },
      events: ["runtime.interfaceAdapter.rejected"],
    },
  );

  const unready = createInterfaceAdapterRuntime({
    runtimeId: "runtime-1",
    caller: { kind: "application", id: "app-1" },
    bindings: [{ surface: "customInterfaceLayer", bindingId: "custom-binding-1", ready: false }],
  });

  assert.equal(unready.ok, false);
  if (unready.ok) {
    return;
  }

  assert.equal(unready.error.code, "BINDING_NOT_READY");
  assert.equal(unready.error.boundary, "binding");

  const denied = createInterfaceAdapterRuntime({
    runtimeId: "runtime-1",
    caller: { kind: "official-module", id: "cmp" },
    requestedScopes: ["interface.bind", "interface.admin"],
    allowedScopes: ["interface.bind"],
    bindings: [{ surface: "basicInterfaceLayer", bindingId: "basic-binding-1" }],
  });

  assert.equal(denied.ok, false);
  if (denied.ok) {
    return;
  }

  assert.equal(denied.error.code, "SCOPE_DENIED");
  assert.equal(denied.error.boundary, "scope");
});
