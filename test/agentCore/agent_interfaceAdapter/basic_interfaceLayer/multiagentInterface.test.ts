import assert from "node:assert/strict";
import test from "node:test";

import { defineMultiagentInterfaceBoundary } from "../../../../src/interfaceAdapter/basic_interfaceLayer/multiagentInterface.js";
import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";

defineAgentCoreContractTest({
  sourcePath: "src/interfaceAdapter/basic_interfaceLayer/multiagentInterface.ts",
  docPath: "docs/agentCore/agent_interfaceAdapter/basic_interfaceLayer/multiagentInterface.md",
  testFileUrl: import.meta.url,
});

test("multiagentInterface defines a dry-run official module boundary", () => {
  const result = defineMultiagentInterfaceBoundary({
    runtimeId: " runtime:alpha ",
    interfaceId: " multiagent.interface ",
    moduleId: " official:multiagent ",
    capabilities: [
      {
        capabilityId: " multiagent.delegate ",
        inputBoundary: ["agent.request", " agent.request "],
        outputBoundary: ["agent.result"],
        rules: ["runtime-governed"],
      },
    ],
    requestedScopes: ["delegation"],
    allowedScopes: ["delegation", "runtime"],
    runtimeReady: true,
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected multiagent interface boundary definition");
  }

  assert.equal(result.contract.module, "multiagent");
  assert.equal(result.contract.runtimeId, "runtime:alpha");
  assert.equal(result.contract.interfaceId, "multiagent.interface");
  assert.equal(result.contract.route, "runtime.interfaceAdapter");
  assert.equal(result.contract.dispatch, "dry-run");
  assert.equal(result.contract.unsafeSideEffects, false);
  assert.equal(result.contract.internalStrategyIncluded, false);
  assert.deepEqual(result.contract.capabilities[0], {
    capabilityId: "multiagent.delegate",
    inputBoundary: ["agent.request"],
    outputBoundary: ["agent.result"],
    rules: ["runtime-governed"],
  });
});

test("multiagentInterface rejects empty input with a public error boundary", () => {
  const result = defineMultiagentInterfaceBoundary();

  assert.equal(result.ok, false);
  if (result.ok) {
    throw new Error("expected multiagent interface input rejection");
  }

  assert.equal(result.error.code, "MISSING_RUNTIME_ID");
  assert.equal(result.error.boundary, "input");
  assert.equal(result.error.safeForRuntimeInspection, true);
});

test("multiagentInterface reports runtime and scope rejection without running multiagent strategy", () => {
  const runtimeRejected = defineMultiagentInterfaceBoundary({
    runtimeId: "runtime",
    interfaceId: "multiagent.interface",
    moduleId: "official:multiagent",
    capabilities: [{ capabilityId: "multiagent.delegate" }],
    runtimeReady: false,
  });

  assert.equal(runtimeRejected.ok, false);
  if (runtimeRejected.ok) {
    throw new Error("expected runtime rejection");
  }

  assert.equal(runtimeRejected.error.code, "RUNTIME_NOT_READY");
  assert.equal(runtimeRejected.error.boundary, "runtime-state");

  const scopeRejected = defineMultiagentInterfaceBoundary({
    runtimeId: "runtime",
    interfaceId: "multiagent.interface",
    moduleId: "official:multiagent",
    capabilities: [{ capabilityId: "multiagent.delegate" }],
    requestedScopes: ["private-delegation"],
    allowedScopes: ["delegation"],
  });

  assert.equal(scopeRejected.ok, false);
  if (scopeRejected.ok) {
    throw new Error("expected scope rejection");
  }

  assert.equal(scopeRejected.error.code, "SCOPE_DENIED");
  assert.equal(scopeRejected.error.boundary, "scope");
});
