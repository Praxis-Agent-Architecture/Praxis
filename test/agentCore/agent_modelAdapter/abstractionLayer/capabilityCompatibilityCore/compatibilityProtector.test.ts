import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { protectCapabilityCompatibility } from "../../../../../src/agentCore_modelAdapter/abstractionLayer/capabilityCompatibilityCore/compatibilityProtector.js";
import { extractInterfaceCapabilities } from "../../../../../src/agentCore_modelAdapter/abstractionLayer/capabilityCompatibilityCore/interfaceCapabilityExtraction.js";
import { extractInterfaceFormats } from "../../../../../src/agentCore_modelAdapter/abstractionLayer/capabilityCompatibilityCore/interfaceFormatExtraction.js";
import { evaluateInterfaceScope } from "../../../../../src/agentCore_modelAdapter/abstractionLayer/capabilityCompatibilityCore/interfaceScope.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_modelAdapter/abstractionLayer/capabilityCompatibilityCore/compatibilityProtector.ts",
  docPath: "docs/agentCore/agent_modelAdapter/abstractionLayer/capabilityCompatibilityCore/compatibilityProtector.md",
  testFileUrl: import.meta.url,
});

test("protectCapabilityCompatibility reports a bridgeable compatible abstraction", () => {
  const capabilities = extractInterfaceCapabilities({
    providerId: "openai",
    interfaceId: "responses",
    capabilitySignals: [
      { name: "Text", kind: "text" },
      { name: "Structured Output", kind: "structured-output", aliases: ["json_schema"] },
    ],
  });
  const formats = extractInterfaceFormats({
    providerId: "openai",
    interfaceId: "responses",
    formatSignals: [{ name: "JSON", direction: "output" }],
  });
  const scope = evaluateInterfaceScope({
    providerId: "openai",
    interfaceId: "responses",
    requestedCapabilities: ["structured-output"],
    grantedCapabilities: ["text", "structured-output"],
    requestedFormats: ["json"],
    grantedFormats: ["json"],
  });

  assert.equal(capabilities.ok, true);
  assert.equal(formats.ok, true);
  assert.equal(scope.ok, true);
  if (!capabilities.ok || !formats.ok || !scope.ok) {
    return;
  }

  const result = protectCapabilityCompatibility({
    providerId: "openai",
    interfaceId: "responses",
    availableCapabilities: capabilities.capabilities,
    requiredCapabilities: ["json_schema"],
    availableFormats: formats.formats,
    requiredFormats: ["json"],
    scopeDecision: scope.decision,
    trace: { bridgeId: "bridge-a" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.report.compatible, true);
  assert.equal(result.report.bridgeable, true);
  assert.deepEqual(result.report.capabilityGaps, []);
  assert.deepEqual(result.report.formatGaps, []);
  assert.equal(result.report.trace.bridgeId, "bridge-a");
  assert.equal(result.report.unsafeSideEffects, false);
});

test("protectCapabilityCompatibility classifies missing descriptors and compatibility gaps", () => {
  const missing = protectCapabilityCompatibility({
    providerId: "anthropic",
    interfaceId: "messages",
  });
  assert.equal(missing.ok, false);
  if (missing.ok) {
    return;
  }
  assert.equal(missing.error.code, "MISSING_AVAILABLE_CAPABILITIES");
  assert.equal(missing.error.boundary, "contract");

  const result = protectCapabilityCompatibility({
    providerId: "anthropic",
    interfaceId: "messages",
    availableCapabilities: [
      {
        id: "text",
        name: "Text",
        kind: "text",
        required: false,
        aliases: [],
        limits: {},
        matchedDslIntent: false,
      },
    ],
    requiredCapabilities: ["tool"],
    availableFormats: [{ id: "text", name: "Text", direction: "bidirectional", fields: [], matchedDslIntent: false }],
    requiredFormats: ["json"],
    scopeDecision: {
      providerId: "anthropic",
      interfaceId: "messages",
      accepted: false,
      requestedCapabilities: ["tool"],
      grantedCapabilities: ["text"],
      missingCapabilities: ["tool"],
      requestedFormats: ["json"],
      grantedFormats: ["text"],
      missingFormats: ["json"],
      readonly: true,
      unsafeSideEffects: false,
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.equal(result.report.compatible, false);
  assert.equal(result.report.bridgeable, false);
  assert.deepEqual(result.report.capabilityGaps.map((gap) => gap.requested), ["tool"]);
  assert.deepEqual(result.report.formatGaps.map((gap) => gap.requested), ["json"]);
  assert.deepEqual(result.report.scopeGaps.map((gap) => gap.requested), ["tool", "json"]);
});
