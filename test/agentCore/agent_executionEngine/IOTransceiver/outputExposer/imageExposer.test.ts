import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { exposeImageOutput } from "../../../../../src/agentCore/agent_executionEngine/IOTransceiver/outputExposer/imageExposer.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/IOTransceiver/outputExposer/imageExposer.ts",
  docPath: "docs/agentCore/agent_executionEngine/IOTransceiver/outputExposer/imageExposer.md",
  testFileUrl: import.meta.url,
});

test("exposeImageOutput creates a dry-run image envelope with display metadata", () => {
  const result = exposeImageOutput({
    outputId: " image-1 ",
    sessionId: " session-1 ",
    kind: "generated-image",
    format: " png ",
    displayRef: " artifact://images/result.png ",
    width: 1024,
    height: 768,
    altText: " generated chart ",
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.exposed.modality, "image");
  assert.equal(result.exposed.outputId, "image-1");
  assert.equal(result.exposed.payload.format, "png");
  assert.equal(result.exposed.payload.displayRef, "artifact://images/result.png");
  assert.equal(result.exposed.payload.width, 1024);
  assert.equal(result.exposed.payload.height, 768);
  assert.equal(result.exposed.payload.altText, "generated chart");
  assert.equal(result.exposed.dispatch, "dry-run");
  assert.equal(result.exposed.providerRawShapeExposed, false);
});

test("exposeImageOutput supports vision analysis results without pretending to generate images", () => {
  const result = exposeImageOutput({
    outputId: "image-analysis",
    sessionId: "session-1",
    analysis: "contains a highlighted UI error region",
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.exposed.payload.kind, "vision-analysis");
  assert.equal(result.exposed.payload.analysis, "contains a highlighted UI error region");
  assert.equal(result.exposed.payload.displayRef, undefined);
});

test("exposeImageOutput rejects missing payload and invalid dimensions", () => {
  const missing = exposeImageOutput({ outputId: "image-1", sessionId: "session-1" });
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_PAYLOAD");
  }

  const invalid = exposeImageOutput({
    outputId: "image-1",
    sessionId: "session-1",
    displayRef: "artifact://images/result.png",
    width: 0,
    height: 768,
  });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.equal(invalid.error.code, "INVALID_PAYLOAD");
    assert.equal(invalid.error.boundary, "input");
  }
});
