import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { createExecEngineRuntime } from "../../../../src/agentCore_runtimeImplementation/runtime.execEngine/execEngineRuntime.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_runtimeImplementation/runtime.execEngine/execEngineRuntime.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.execEngine/execEngineRuntime.md",
  testFileUrl: import.meta.url,
});

test("execEngineRuntime binds narrow execution engine surfaces without side effects", () => {
  const result = createExecEngineRuntime({
    runtimeId: " runtime-1 ",
    caller: { kind: "application", id: " app-1 ", sessionId: " session-1 " },
    bindings: [
      { surface: "promptPack", bindingId: "prompt-binding-1", capabilities: [" context.pack ", "context.pack"] },
      { surface: "stateBridge", bindingId: "state-binding-1", metadata: { readonly: true } },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.runtime.runtimeId, "runtime-1");
  assert.equal(result.runtime.route, "runtime.execEngine");
  assert.deepEqual(result.runtime.bindingIds, ["prompt-binding-1", "state-binding-1"]);
  assert.deepEqual(result.runtime.surfaces, ["promptPack", "stateBridge"]);
  assert.deepEqual(result.runtime.bindings[0]?.capabilities, ["context.pack"]);
  assert.equal(result.runtime.dryRun, true);
  assert.equal(result.runtime.unsafeSideEffects, false);
});

test("execEngineRuntime rejects missing and unready bindings before runtime exposure", () => {
  assert.deepEqual(
    createExecEngineRuntime({
      runtimeId: "runtime-1",
      caller: { kind: "application", id: "app-1" },
    }),
    {
      ok: false,
      error: {
        code: "MISSING_BINDINGS",
        message: "execEngine runtime requires at least one narrow binding",
        boundary: "input",
        publicSafe: true,
      },
      events: ["runtime.execEngine.rejected"],
    },
  );

  const result = createExecEngineRuntime({
    runtimeId: "runtime-1",
    caller: { kind: "application", id: "app-1" },
    bindings: [{ surface: "coreLogic", bindingId: "core-binding-1", ready: false }],
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, "BINDING_NOT_READY");
  assert.equal(result.error.boundary, "binding");
});
