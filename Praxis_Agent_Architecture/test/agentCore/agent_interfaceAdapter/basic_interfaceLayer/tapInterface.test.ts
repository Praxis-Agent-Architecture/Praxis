import assert from "node:assert/strict";
import test from "node:test";

import { defineTapInterfaceBoundary } from "../../../../src/agentCore/agent_interfaceAdapter/basic_interfaceLayer/tapInterface.js";
import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_interfaceAdapter/basic_interfaceLayer/tapInterface.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_interfaceAdapter/basic_interfaceLayer/tapInterface.md",
  testFileUrl: import.meta.url,
});

test("tapInterface defines a dry-run official module boundary", () => {
  const result = defineTapInterfaceBoundary({
    runtimeId: " runtime:alpha ",
    interfaceId: " tap.interface ",
    moduleId: " official:tap ",
    capabilities: [
      {
        capabilityId: " tap.tool.invoke ",
        inputBoundary: ["tool.request", " tool.request "],
        outputBoundary: ["tool.result"],
        rules: ["runtime-governed"],
      },
    ],
    requestedScopes: ["tooling"],
    allowedScopes: ["tooling", "runtime"],
    runtimeReady: true,
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected tap interface boundary definition");
  }

  assert.equal(result.contract.module, "tap");
  assert.equal(result.contract.runtimeId, "runtime:alpha");
  assert.equal(result.contract.interfaceId, "tap.interface");
  assert.equal(result.contract.route, "runtime.interfaceAdapter");
  assert.equal(result.contract.dispatch, "dry-run");
  assert.equal(result.contract.unsafeSideEffects, false);
  assert.equal(result.contract.internalStrategyIncluded, false);
  assert.deepEqual(result.contract.capabilities[0], {
    capabilityId: "tap.tool.invoke",
    inputBoundary: ["tool.request"],
    outputBoundary: ["tool.result"],
    rules: ["runtime-governed"],
  });
});

test("tapInterface rejects empty input with a public error boundary", () => {
  const result = defineTapInterfaceBoundary();

  assert.equal(result.ok, false);
  if (result.ok) {
    throw new Error("expected tap interface input rejection");
  }

  assert.equal(result.error.code, "MISSING_RUNTIME_ID");
  assert.equal(result.error.boundary, "input");
  assert.equal(result.error.safeForRuntimeInspection, true);
});

test("tapInterface reports governance and scope rejection without running TAP strategy", () => {
  const governanceRejected = defineTapInterfaceBoundary({
    runtimeId: "runtime",
    interfaceId: "tap.interface",
    moduleId: "official:tap",
    capabilities: [{ capabilityId: "tap.tool.invoke" }],
    governance: { accepted: false, reason: "approval policy missing" },
  });

  assert.equal(governanceRejected.ok, false);
  if (governanceRejected.ok) {
    throw new Error("expected governance rejection");
  }

  assert.equal(governanceRejected.error.code, "GOVERNANCE_REJECTED");
  assert.equal(governanceRejected.error.message, "approval policy missing");
  assert.equal(governanceRejected.error.boundary, "governance");

  const scopeRejected = defineTapInterfaceBoundary({
    runtimeId: "runtime",
    interfaceId: "tap.interface",
    moduleId: "official:tap",
    capabilities: [{ capabilityId: "tap.tool.invoke" }],
    requestedScopes: ["private-tooling"],
    allowedScopes: ["tooling"],
  });

  assert.equal(scopeRejected.ok, false);
  if (scopeRejected.ok) {
    throw new Error("expected scope rejection");
  }

  assert.equal(scopeRejected.error.code, "SCOPE_DENIED");
  assert.equal(scopeRejected.error.boundary, "scope");
});
