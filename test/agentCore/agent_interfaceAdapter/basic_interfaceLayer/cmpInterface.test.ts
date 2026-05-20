import assert from "node:assert/strict";
import test from "node:test";

import { defineCmpInterfaceBoundary } from "../../../../src/interfaceAdapter/basic_interfaceLayer/cmpInterface.js";
import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";

defineAgentCoreContractTest({
  sourcePath: "src/interfaceAdapter/basic_interfaceLayer/cmpInterface.ts",
  docPath: "docs/agentCore/agent_interfaceAdapter/basic_interfaceLayer/cmpInterface.md",
  testFileUrl: import.meta.url,
});

test("cmpInterface defines a dry-run official module boundary", () => {
  const result = defineCmpInterfaceBoundary({
    runtimeId: " runtime:alpha ",
    interfaceId: " cmp.interface ",
    moduleId: " official:cmp ",
    capabilities: [
      {
        capabilityId: " cmp.context.material ",
        inputBoundary: ["promptPack", " promptPack "],
        outputBoundary: ["context.material"],
        rules: ["runtime-governed"],
      },
    ],
    requestedScopes: ["context"],
    allowedScopes: ["context", "runtime"],
    runtimeReady: true,
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected cmp interface boundary definition");
  }

  assert.equal(result.contract.module, "cmp");
  assert.equal(result.contract.runtimeId, "runtime:alpha");
  assert.equal(result.contract.interfaceId, "cmp.interface");
  assert.equal(result.contract.route, "runtime.interfaceAdapter");
  assert.equal(result.contract.dispatch, "dry-run");
  assert.equal(result.contract.unsafeSideEffects, false);
  assert.equal(result.contract.internalStrategyIncluded, false);
  assert.deepEqual(result.contract.capabilities[0], {
    capabilityId: "cmp.context.material",
    inputBoundary: ["promptPack"],
    outputBoundary: ["context.material"],
    rules: ["runtime-governed"],
  });
});

test("cmpInterface rejects empty input with a public error boundary", () => {
  const result = defineCmpInterfaceBoundary();

  assert.equal(result.ok, false);
  if (result.ok) {
    throw new Error("expected cmp interface input rejection");
  }

  assert.equal(result.error.code, "MISSING_RUNTIME_ID");
  assert.equal(result.error.boundary, "input");
  assert.equal(result.error.safeForRuntimeInspection, true);
});

test("cmpInterface reports governance and scope rejection without running CMP strategy", () => {
  const governanceRejected = defineCmpInterfaceBoundary({
    runtimeId: "runtime",
    interfaceId: "cmp.interface",
    moduleId: "official:cmp",
    capabilities: [{ capabilityId: "cmp.context.material" }],
    governance: { accepted: false, reason: "policy denied" },
  });

  assert.equal(governanceRejected.ok, false);
  if (governanceRejected.ok) {
    throw new Error("expected governance rejection");
  }

  assert.equal(governanceRejected.error.code, "GOVERNANCE_REJECTED");
  assert.equal(governanceRejected.error.message, "policy denied");
  assert.equal(governanceRejected.error.boundary, "governance");

  const scopeRejected = defineCmpInterfaceBoundary({
    runtimeId: "runtime",
    interfaceId: "cmp.interface",
    moduleId: "official:cmp",
    capabilities: [{ capabilityId: "cmp.context.material" }],
    requestedScopes: ["private-context"],
    allowedScopes: ["context"],
  });

  assert.equal(scopeRejected.ok, false);
  if (scopeRejected.ok) {
    throw new Error("expected scope rejection");
  }

  assert.equal(scopeRejected.error.code, "SCOPE_DENIED");
  assert.equal(scopeRejected.error.boundary, "scope");
});
