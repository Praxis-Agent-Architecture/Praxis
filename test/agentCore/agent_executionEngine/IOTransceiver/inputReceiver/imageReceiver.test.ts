import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import {
  imageInputReceiverDescriptor,
  receiveImageInput,
} from "../../../../../src/executionEngine/IOTransceiver/inputReceiver/imageReceiver.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/IOTransceiver/inputReceiver/imageReceiver.ts",
  docPath: "docs/agentCore/agent_executionEngine/IOTransceiver/inputReceiver/imageReceiver.md",
  testFileUrl: import.meta.url,
});

test("receiveImageInput preserves referenced image material as visual input", () => {
  const result = receiveImageInput({
    runtimeId: " runtime:alpha ",
    sessionId: " session:image ",
    source: "application",
    payload: {
      kind: "image-reference",
      uri: " file://screenshots/one.png ",
      format: " png ",
      dimensions: { width: 800, height: 600 },
    },
    requestedScopes: ["vision-input"],
    allowedScopes: ["vision-input"],
  });

  assert.equal(imageInputReceiverDescriptor.textFallbackCreated, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected image input to be accepted");
  }

  assert.equal(result.input.kind, "image");
  assert.equal(result.input.runtimeId, "runtime:alpha");
  assert.equal(result.input.payloadKind, "image-reference");
  assert.equal(result.input.visualMaterial.uri, "file://screenshots/one.png");
  assert.equal(result.input.visualMaterial.format, "png");
  assert.deepEqual(result.input.visualMaterial.dimensions, { width: 800, height: 600 });
  assert.equal(result.input.textFallbackCreated, false);
  assert.equal(result.input.providerPayloadCreated, false);
  assert.deepEqual(result.events, ["input.image.received"]);
});

test("receiveImageInput distinguishes raw image, visual region, and context image payloads", () => {
  const raw = receiveImageInput({
    runtimeId: "runtime",
    sessionId: "session",
    payload: { kind: "raw-image", bytes: [1, 2, 3, 4], format: "png" },
  });
  assert.equal(raw.ok, true);
  if (!raw.ok) {
    throw new Error("expected raw image input");
  }
  assert.equal(raw.input.visualMaterial.byteLength, 4);

  const region = receiveImageInput({
    runtimeId: "runtime",
    sessionId: "session",
    payload: {
      kind: "visual-region",
      imageId: "image:screen",
      region: { x: 10, y: 20, width: 100, height: 80 },
      label: "button",
    },
  });
  assert.equal(region.ok, true);
  if (!region.ok) {
    throw new Error("expected visual region input");
  }
  assert.equal(region.input.payloadKind, "visual-region");
  assert.deepEqual(region.input.visualMaterial.region, { x: 10, y: 20, width: 100, height: 80 });

  const context = receiveImageInput({
    runtimeId: "runtime",
    sessionId: "session",
    payload: { kind: "context-image", contextId: "cmp:image:one", label: "prior screenshot" },
  });
  assert.equal(context.ok, true);
  if (!context.ok) {
    throw new Error("expected context image input");
  }
  assert.equal(context.input.visualMaterial.contextId, "cmp:image:one");
});

test("receiveImageInput rejects missing payload, invalid regions, and governance denial", () => {
  const missing = receiveImageInput({ runtimeId: "runtime", sessionId: "session" });
  assert.equal(missing.ok, false);
  if (missing.ok) {
    throw new Error("expected missing image payload rejection");
  }
  assert.equal(missing.error.code, "MISSING_IMAGE_PAYLOAD");
  assert.equal(missing.error.boundary, "input");
  assert.equal(missing.error.safeForRuntimeInspection, true);

  const invalidRegion = receiveImageInput({
    runtimeId: "runtime",
    sessionId: "session",
    payload: { kind: "visual-region", imageId: "image", region: { x: 0, y: 0, width: 0, height: 20 } },
  });
  assert.equal(invalidRegion.ok, false);
  if (invalidRegion.ok) {
    throw new Error("expected invalid region rejection");
  }
  assert.equal(invalidRegion.error.code, "INVALID_VISUAL_REGION");

  const governanceRejected = receiveImageInput({
    runtimeId: "runtime",
    sessionId: "session",
    payload: { kind: "context-image", contextId: "cmp:image:one" },
    governance: { accepted: false, reason: "vision input denied" },
  });
  assert.equal(governanceRejected.ok, false);
  if (governanceRejected.ok) {
    throw new Error("expected governance rejection");
  }
  assert.equal(governanceRejected.error.code, "GOVERNANCE_REJECTED");
  assert.equal(governanceRejected.error.boundary, "governance");
});
