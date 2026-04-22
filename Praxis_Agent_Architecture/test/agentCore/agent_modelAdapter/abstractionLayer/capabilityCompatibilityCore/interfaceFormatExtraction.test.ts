import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { extractInterfaceFormats } from "../../../../../src/agentCore/agent_modelAdapter/abstractionLayer/capabilityCompatibilityCore/interfaceFormatExtraction.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_modelAdapter/abstractionLayer/capabilityCompatibilityCore/interfaceFormatExtraction.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_modelAdapter/abstractionLayer/capabilityCompatibilityCore/interfaceFormatExtraction.md",
  testFileUrl: import.meta.url,
});

test("extractInterfaceFormats normalizes provider format signals for the bridge layer", () => {
  const result = extractInterfaceFormats({
    providerId: " deepmind ",
    interfaceId: " generate-content ",
    dslIntentFormats: ["json", "text"],
    formatSignals: [
      {
        name: " JSON ",
        direction: "output",
        mediaType: " application/json ",
        schemaName: "responseSchema",
        fields: [" candidates ", " content ", "content"],
        sourceField: "generation_config.response_schema",
      },
      {
        name: "Text",
        direction: "bidirectional",
        mediaType: "text/plain",
      },
    ],
    trace: { correlationId: " corr-2 " },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.providerId, "deepmind");
  assert.equal(result.interfaceId, "generate-content");
  assert.deepEqual(result.requestedDslFormats, ["json", "text"]);
  assert.equal(result.formats[0]?.id, "json");
  assert.equal(result.formats[0]?.direction, "output");
  assert.equal(result.formats[0]?.mediaType, "application/json");
  assert.deepEqual(result.formats[0]?.fields, ["candidates", "content"]);
  assert.equal(result.formats[0]?.matchedDslIntent, true);
  assert.equal(result.unsafeSideEffects, false);
});

test("extractInterfaceFormats rejects missing and unnamed format signals", () => {
  const missing = extractInterfaceFormats({
    providerId: "custom",
    interfaceId: "gateway",
  });
  assert.equal(missing.ok, false);
  if (missing.ok) {
    return;
  }
  assert.equal(missing.error.code, "MISSING_FORMAT_SIGNALS");
  assert.equal(missing.error.boundary, "input");

  const unnamed = extractInterfaceFormats({
    providerId: "custom",
    interfaceId: "gateway",
    formatSignals: [{ name: "" }],
  });
  assert.equal(unnamed.ok, false);
  if (unnamed.ok) {
    return;
  }
  assert.equal(unnamed.error.code, "EMPTY_FORMAT_NAME");
  assert.equal(unnamed.error.boundary, "contract");
  assert.equal(unnamed.error.publicSafe, true);
});
