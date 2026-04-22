import assert from "node:assert/strict";
import test from "node:test";

import {
  bindCoreLogic,
  createRuntimeExecEngineBinding,
} from "../../../../src/agentCore/agent_runtimeImplementation/runtime.execEngine/bindCoreLogic.js";
import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_runtimeImplementation/runtime.execEngine/bindCoreLogic.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_runtimeImplementation/runtime.execEngine/bindCoreLogic.md",
  testFileUrl: import.meta.url,
});

test("bindCoreLogic returns a dry-run runtime binding snapshot", () => {
  const result = bindCoreLogic({
    runtimeId: " runtime-alpha ",
    caller: { kind: "runtime-surface", id: " execEngineRuntime " },
    mountedModule: { id: " core-logic ", ready: true },
    requestedScopes: [" mainLoop.invoke ", "stateEngine.read", "mainLoop.invoke"],
    allowedScopes: ["mainLoop.invoke", "stateEngine.read"],
    trace: { correlationId: " bind-1 " },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected core logic binding to be accepted");
  }

  assert.equal(result.binding.runtimeId, "runtime-alpha");
  assert.equal(result.binding.bindingKind, "coreLogic");
  assert.equal(result.binding.bindingId, "runtime.execEngine.coreLogic");
  assert.deepEqual(result.binding.capabilities, ["mainLoop", "stateEngine", "reuseInvoker"]);
  assert.deepEqual(result.binding.grantedScopes, ["mainLoop.invoke", "stateEngine.read"]);
  assert.equal(result.binding.dryRun, true);
  assert.equal(result.binding.unsafeSideEffects, false);
  assert.deepEqual(result.events, ["runtime.execEngine.coreLogic.binding.accepted"]);
});

test("bindCoreLogic reports input, governance, runtime, and scope failures", () => {
  const missingRuntime = bindCoreLogic();
  assert.equal(missingRuntime.ok, false);
  if (missingRuntime.ok) {
    throw new Error("expected missing runtime id to fail");
  }
  assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");
  assert.equal(missingRuntime.error.boundary, "input");

  const governanceRejected = bindCoreLogic({
    runtimeId: "runtime-alpha",
    governance: { accepted: false, reason: "exec engine binding blocked" },
  });
  assert.equal(governanceRejected.ok, false);
  if (governanceRejected.ok) {
    throw new Error("expected governance rejection");
  }
  assert.equal(governanceRejected.error.code, "GOVERNANCE_REJECTED");
  assert.equal(governanceRejected.error.message, "exec engine binding blocked");
  assert.equal(governanceRejected.error.boundary, "governance");

  const notReady = bindCoreLogic({ runtimeId: "runtime-alpha", runtimeReady: false });
  assert.equal(notReady.ok, false);
  if (notReady.ok) {
    throw new Error("expected runtime readiness rejection");
  }
  assert.equal(notReady.error.code, "RUNTIME_NOT_READY");
  assert.equal(notReady.error.boundary, "runtime-state");

  const deniedScope = bindCoreLogic({
    runtimeId: "runtime-alpha",
    requestedScopes: ["mainLoop.invoke", "stateEngine.write"],
    allowedScopes: ["mainLoop.invoke"],
  });
  assert.equal(deniedScope.ok, false);
  if (deniedScope.ok) {
    throw new Error("expected scope rejection");
  }
  assert.equal(deniedScope.error.code, "SCOPE_DENIED");
  assert.equal(deniedScope.error.boundary, "scope");
});

test("createRuntimeExecEngineBinding preserves custom narrow binding metadata", () => {
  const result = createRuntimeExecEngineBinding(
    {
      runtimeId: "runtime-alpha",
      bindingKind: "coreLogic",
      bindingId: "custom-core",
      capabilities: [" custom.capability ", "custom.capability"],
      contract: { accepted: true },
    },
    {
      bindingKind: "coreLogic",
      bindingId: "runtime.execEngine.coreLogic",
      capabilities: ["mainLoop"],
      eventNamePrefix: "runtime.execEngine.custom.binding",
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected custom binding to be accepted");
  }

  assert.equal(result.binding.bindingId, "custom-core");
  assert.deepEqual(result.binding.capabilities, ["custom.capability"]);
  assert.deepEqual(result.events, ["runtime.execEngine.custom.binding.accepted"]);
});
