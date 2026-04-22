import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import {
  generateImageDescriptor,
  planGenerateImage,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/imageTransformer/omni.generateImage.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/imageTransformer/omni.generateImage.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/imageTransformer/omni.generateImage.md",
  testFileUrl: import.meta.url,
});

test("planGenerateImage creates a dry-run image generation request envelope", () => {
  const result = planGenerateImage({
    prompt: "a product sketch on a white background",
    negativePrompt: "text watermark",
    outputFormat: "webp",
    imageCount: 2,
    providerHint: "mock-provider",
    requestedScopes: ["tool:omni:image"],
    allowedScopes: ["tool:omni:image"],
  });

  assert.equal(result.ok, true);
  assert.equal(generateImageDescriptor.unsafeSideEffects, false);
  assert.equal(result.plan.tool, "omni.generateImage");
  assert.equal(result.plan.imageCount, 2);
  assert.equal(result.plan.outputFormat, "webp");
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.wouldRequestGeneration, true);
  assert.equal(result.plan.unsafeSideEffects, false);
  assert.deepEqual(result.plan.acceptedScopes, ["tool:omni:image"]);
});

test("planGenerateImage rejects empty prompts, excessive batches, and real provider calls", () => {
  const missing = planGenerateImage();
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, "MISSING_PROMPT");
  assert.equal(missing.error.boundary, "input");

  const tooMany = planGenerateImage({
    prompt: "preview",
    imageCount: 5,
    maxImages: 4,
  });
  assert.equal(tooMany.ok, false);
  assert.equal(tooMany.error.code, "IMAGE_COUNT_LIMIT_EXCEEDED");
  assert.equal(tooMany.error.boundary, "resource");

  const realSideEffect = planGenerateImage({
    prompt: "preview",
    dryRun: false,
  });
  assert.equal(realSideEffect.ok, false);
  assert.equal(realSideEffect.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
  assert.equal(realSideEffect.error.boundary, "governance");
});
