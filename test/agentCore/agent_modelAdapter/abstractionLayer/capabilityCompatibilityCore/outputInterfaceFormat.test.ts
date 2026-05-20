import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import {
  defineOutputInterfaceFormats,
  outputInterfaceFormatDescriptor,
} from "../../../../../src/agentCore/agent_modelAdapter/abstractionLayer/capabilityCompatibilityCore/outputInterfaceFormat.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_modelAdapter/abstractionLayer/capabilityCompatibilityCore/outputInterfaceFormat.ts",
  docPath: "docs/agentCore/agent_modelAdapter/abstractionLayer/capabilityCompatibilityCore/outputInterfaceFormat.md",
  testFileUrl: import.meta.url,
});

test("outputInterfaceFormat normalizes provider output formats without provider payload creation", () => {
  const result = defineOutputInterfaceFormats({
    runtimeId: " runtime ",
    sourceInterfaceId: " responses-output ",
    providerId: "openai",
    requestedScopes: ["model.output"],
    allowedScopes: ["model.output"],
    formats: [
      {
        formatId: "text",
        mediaType: "text/plain",
        providerKey: "output_text",
        streaming: true,
        available: true,
      },
      {
        formatId: "json",
        mediaType: "application/json",
        providerKey: "response_format.json_schema",
        structured: true,
        schemaRef: "dsl://schema/tool-result",
      },
    ],
    requiredFormats: ["text", "json"],
  });

  assert.equal(outputInterfaceFormatDescriptor.providerPayloadCreated, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected output format envelope");
  }

  assert.equal(result.envelope.kind, "agentCore.modelAdapter.outputInterfaceFormat");
  assert.equal(result.envelope.runtimeId, "runtime");
  assert.equal(result.envelope.sourceInterfaceId, "responses-output");
  assert.equal(result.envelope.compatible, true);
  assert.equal(result.envelope.bridgeReadiness, "ready");
  assert.equal(result.envelope.providerPayloadCreated, false);
  assert.equal(result.envelope.unsafeSideEffects, false);
  assert.deepEqual(
    result.envelope.formats.map((format) => [format.formatId, format.streaming, format.structured]),
    [
      ["text", true, false],
      ["json", false, true],
    ],
  );
});

test("outputInterfaceFormat reports missing formats and rejects invalid boundaries", () => {
  const missing = defineOutputInterfaceFormats({
    runtimeId: "runtime",
    sourceInterfaceId: "gemini-output",
    requiredFormats: ["audio"],
    formats: [{ formatId: "audio", mediaType: "audio/wav", available: false }],
  });
  assert.equal(missing.ok, true);
  if (!missing.ok) {
    throw new Error("expected missing format to be represented as compatibility gap");
  }
  assert.equal(missing.envelope.compatible, false);
  assert.equal(missing.envelope.bridgeReadiness, "blocked-by-missing-format");
  assert.deepEqual(missing.envelope.missingFormats, ["audio"]);

  const empty = defineOutputInterfaceFormats({ runtimeId: "runtime", sourceInterfaceId: "iface", formats: [] });
  assert.equal(empty.ok, false);
  if (empty.ok) {
    throw new Error("expected empty format rejection");
  }
  assert.equal(empty.error.code, "MISSING_FORMAT");

  const denied = defineOutputInterfaceFormats({
    runtimeId: "runtime",
    sourceInterfaceId: "iface",
    requestedScopes: ["model.output.private"],
    allowedScopes: ["model.output"],
    formats: [{ formatId: "text" }],
  });
  assert.equal(denied.ok, false);
  if (denied.ok) {
    throw new Error("expected scope denial");
  }
  assert.equal(denied.error.code, "SCOPE_DENIED");
  assert.equal(denied.error.safeForRuntimeInspection, true);
});
