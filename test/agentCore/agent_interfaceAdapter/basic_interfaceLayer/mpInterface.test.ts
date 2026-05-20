import assert from "node:assert/strict";
import test from "node:test";

import { defineMpInterfaceBoundary } from "../../../../src/agentCore_interfaceAdapter/basic_interfaceLayer/mpInterface.js";
import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_interfaceAdapter/basic_interfaceLayer/mpInterface.ts",
  docPath: "docs/agentCore/agent_interfaceAdapter/basic_interfaceLayer/mpInterface.md",
  testFileUrl: import.meta.url,
});

test("mpInterface defines a dry-run official module boundary", () => {
  const result = defineMpInterfaceBoundary({
    runtimeId: " runtime:alpha ",
    interfaceId: " mp.interface ",
    moduleId: " official:mp ",
    capabilities: [
      {
        capabilityId: " mp.memory.read ",
        inputBoundary: ["memory.query", " memory.query "],
        outputBoundary: ["memory.material"],
        rules: ["runtime-governed"],
      },
    ],
    requestedScopes: ["memory"],
    allowedScopes: ["memory", "runtime"],
    runtimeReady: true,
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected mp interface boundary definition");
  }

  assert.equal(result.contract.module, "mp");
  assert.equal(result.contract.runtimeId, "runtime:alpha");
  assert.equal(result.contract.interfaceId, "mp.interface");
  assert.equal(result.contract.route, "runtime.interfaceAdapter");
  assert.equal(result.contract.dispatch, "dry-run");
  assert.equal(result.contract.unsafeSideEffects, false);
  assert.equal(result.contract.internalStrategyIncluded, false);
  assert.deepEqual(result.contract.capabilities[0], {
    capabilityId: "mp.memory.read",
    inputBoundary: ["memory.query"],
    outputBoundary: ["memory.material"],
    rules: ["runtime-governed"],
  });
});

test("mpInterface rejects empty input with a public error boundary", () => {
  const result = defineMpInterfaceBoundary();

  assert.equal(result.ok, false);
  if (result.ok) {
    throw new Error("expected mp interface input rejection");
  }

  assert.equal(result.error.code, "MISSING_RUNTIME_ID");
  assert.equal(result.error.boundary, "input");
  assert.equal(result.error.safeForRuntimeInspection, true);
});

test("mpInterface reports contract and scope rejection without running MP strategy", () => {
  const contractRejected = defineMpInterfaceBoundary({
    runtimeId: "runtime",
    interfaceId: "mp.interface",
    moduleId: "official:mp",
    capabilities: [{ capabilityId: "mp.memory.read" }],
    contract: { accepted: false, reason: "contract missing" },
  });

  assert.equal(contractRejected.ok, false);
  if (contractRejected.ok) {
    throw new Error("expected contract rejection");
  }

  assert.equal(contractRejected.error.code, "CONTRACT_REJECTED");
  assert.equal(contractRejected.error.message, "contract missing");
  assert.equal(contractRejected.error.boundary, "contract");

  const scopeRejected = defineMpInterfaceBoundary({
    runtimeId: "runtime",
    interfaceId: "mp.interface",
    moduleId: "official:mp",
    capabilities: [{ capabilityId: "mp.memory.read" }],
    requestedScopes: ["private-memory"],
    allowedScopes: ["memory"],
  });

  assert.equal(scopeRejected.ok, false);
  if (scopeRejected.ok) {
    throw new Error("expected scope rejection");
  }

  assert.equal(scopeRejected.error.code, "SCOPE_DENIED");
  assert.equal(scopeRejected.error.boundary, "scope");
});
