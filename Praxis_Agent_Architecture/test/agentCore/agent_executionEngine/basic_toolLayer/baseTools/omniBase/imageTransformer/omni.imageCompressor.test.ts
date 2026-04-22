import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import {
  imageCompressorDescriptor,
  planImageCompression,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/imageTransformer/omni.imageCompressor.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/imageTransformer/omni.imageCompressor.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/imageTransformer/omni.imageCompressor.md",
  testFileUrl: import.meta.url,
});

test("planImageCompression creates a guarded dry-run compression plan", () => {
  const result = planImageCompression({
    imageRef: "memory://input.png",
    outputRef: "memory://output.webp",
    quality: 72,
    maxOutputBytes: 400_000,
    strategy: "size-first",
    requestedScopes: ["tool:omni:image"],
    allowedScopes: ["tool:omni:image"],
  });

  assert.equal(result.ok, true);
  assert.equal(imageCompressorDescriptor.unsafeSideEffects, false);
  assert.equal(result.plan.tool, "omni.imageCompressor");
  assert.equal(result.plan.quality, 72);
  assert.equal(result.plan.maxOutputBytes, 400_000);
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.wouldCompress, true);
  assert.equal(result.plan.unsafeSideEffects, false);
  assert.deepEqual(result.plan.acceptedScopes, ["tool:omni:image"]);
});

test("planImageCompression rejects missing image, invalid resource limits, and real compression", () => {
  const missing = planImageCompression();
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, "MISSING_IMAGE_REF");
  assert.equal(missing.error.boundary, "input");

  const invalidQuality = planImageCompression({
    imageRef: "memory://input.png",
    quality: 120,
  });
  assert.equal(invalidQuality.ok, false);
  assert.equal(invalidQuality.error.code, "INVALID_QUALITY");
  assert.equal(invalidQuality.error.boundary, "resource");

  const realSideEffect = planImageCompression({
    imageRef: "memory://input.png",
    dryRun: false,
  });
  assert.equal(realSideEffect.ok, false);
  assert.equal(realSideEffect.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
  assert.equal(realSideEffect.error.boundary, "governance");
});
