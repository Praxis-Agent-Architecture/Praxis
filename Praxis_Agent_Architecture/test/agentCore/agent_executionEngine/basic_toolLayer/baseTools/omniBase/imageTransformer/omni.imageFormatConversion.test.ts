import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import {
  imageFormatConversionDescriptor,
  planImageFormatConversion,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/imageTransformer/omni.imageFormatConversion.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/imageTransformer/omni.imageFormatConversion.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/imageTransformer/omni.imageFormatConversion.md",
  testFileUrl: import.meta.url,
});

test("planImageFormatConversion creates a dry-run image format conversion plan", () => {
  const result = planImageFormatConversion({
    imageRef: "memory://input.png",
    targetFormat: "webp",
    outputRef: "memory://output.webp",
    preserveMetadata: true,
    requestedScopes: ["tool:omni:image"],
    allowedScopes: ["tool:omni:image"],
  });

  assert.equal(result.ok, true);
  assert.equal(imageFormatConversionDescriptor.unsafeSideEffects, false);
  assert.equal(result.plan.tool, "omni.imageFormatConversion");
  assert.equal(result.plan.targetFormat, "webp");
  assert.equal(result.plan.preserveMetadata, true);
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.wouldConvert, true);
  assert.equal(result.plan.unsafeSideEffects, false);
  assert.deepEqual(result.plan.acceptedScopes, ["tool:omni:image"]);
});

test("planImageFormatConversion rejects incomplete requests and real conversion", () => {
  const missingImage = planImageFormatConversion({
    targetFormat: "jpeg",
  });
  assert.equal(missingImage.ok, false);
  assert.equal(missingImage.error.code, "MISSING_IMAGE_REF");
  assert.equal(missingImage.error.boundary, "input");

  const missingFormat = planImageFormatConversion({
    imageRef: "memory://input.png",
  });
  assert.equal(missingFormat.ok, false);
  assert.equal(missingFormat.error.code, "MISSING_TARGET_FORMAT");
  assert.equal(missingFormat.error.boundary, "input");

  const realSideEffect = planImageFormatConversion({
    imageRef: "memory://input.png",
    targetFormat: "jpeg",
    dryRun: false,
  });
  assert.equal(realSideEffect.ok, false);
  assert.equal(realSideEffect.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
  assert.equal(realSideEffect.error.boundary, "governance");
});
