import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { extractInterfaceCapabilities } from "../../../../../src/agentCore/agent_modelAdapter/abstractionLayer/capabilityCompatibilityCore/interfaceCapabilityExtraction.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_modelAdapter/abstractionLayer/capabilityCompatibilityCore/interfaceCapabilityExtraction.ts",
  docPath: "docs/agentCore/agent_modelAdapter/abstractionLayer/capabilityCompatibilityCore/interfaceCapabilityExtraction.md",
  testFileUrl: import.meta.url,
});

test("extractInterfaceCapabilities normalizes upstream capability signals without side effects", () => {
  const result = extractInterfaceCapabilities({
    providerId: " openai ",
    interfaceId: " responses ",
    dslIntentCapabilities: ["structured output", "tool-use"],
    capabilitySignals: [
      {
        name: "Structured Output",
        kind: "structured-output",
        required: true,
        aliases: ["json_schema", " structured output "],
        limits: { maxSchemaDepth: 5 },
        sourceField: "response_format",
      },
      {
        name: "Tool Use",
        kind: "tool",
      },
    ],
    trace: { correlationId: " corr-1 ", carrierId: " carrier-a " },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.providerId, "openai");
  assert.equal(result.interfaceId, "responses");
  assert.deepEqual(result.requestedDslCapabilities, ["structured-output", "tool-use"]);
  assert.equal(result.capabilities[0]?.id, "structured-output");
  assert.equal(result.capabilities[0]?.kind, "structured-output");
  assert.equal(result.capabilities[0]?.required, true);
  assert.equal(result.capabilities[0]?.matchedDslIntent, true);
  assert.equal(result.capabilities[1]?.matchedDslIntent, true);
  assert.equal(result.trace.correlationId, "corr-1");
  assert.equal(result.unsafeSideEffects, false);
});

test("extractInterfaceCapabilities rejects empty and invalid capability input with classified errors", () => {
  const missing = extractInterfaceCapabilities();
  assert.equal(missing.ok, false);
  if (missing.ok) {
    return;
  }
  assert.equal(missing.error.code, "MISSING_PROVIDER_ID");
  assert.equal(missing.error.boundary, "input");

  const unnamed = extractInterfaceCapabilities({
    providerId: "anthropic",
    interfaceId: "messages",
    capabilitySignals: [{ name: " " }],
  });
  assert.equal(unnamed.ok, false);
  if (unnamed.ok) {
    return;
  }
  assert.equal(unnamed.error.code, "EMPTY_CAPABILITY_NAME");
  assert.equal(unnamed.error.boundary, "contract");
  assert.equal(unnamed.error.publicSafe, true);
});
