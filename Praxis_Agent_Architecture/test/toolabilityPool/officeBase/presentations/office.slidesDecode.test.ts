import { defineAgentCoreContractTest } from "../../../agentCore/agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  officeSlidesDecodeDescriptor,
  planOfficeSlidesDecode,
} from "../../../../src/toolabilityPool/officeBase/presentations/office.slidesDecode.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/toolabilityPool/officeBase/presentations/office.slidesDecode.ts",
  docPath: "Praxis_Agent_Architecture/docs/toolabilityPool/officeBase/presentations/office.slidesDecode.md",
  testFileUrl: import.meta.url,
});

test("planOfficeSlidesDecode creates a guarded presentation decode envelope", async () => {
  const result = await planOfficeSlidesDecode({
    presentationPath: "slides/demo.pptx",
    maxSlides: 2,
    includeSpeakerNotes: true,
    includeImages: true,
    context: {
      toolCallId: "slides-decode-1",
      allowedPresentationRoots: ["slides"],
      requestedScopes: ["office.presentation.read"],
      allowedScopes: ["office.presentation.read"],
      grantedPermissions: ["filesystem:read", "office:read"],
    },
  });

  assert.equal(officeSlidesDecodeDescriptor.unsafeSideEffects, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected slides decode plan");
  }

  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.readsFileDirectly, false);
  assert.deepEqual(result.plan.commandPreview, [
    "office-slides-decode",
    "--max-slides",
    "2",
    "--speaker-notes",
    "--images",
    "--",
    "slides/demo.pptx",
  ]);
  assert.equal(result.audit.toolCallId, "slides-decode-1");
});

test("planOfficeSlidesDecode can use an injected decoder envelope", async () => {
  const result = await planOfficeSlidesDecode({
    presentationPath: "slides/demo.pptx",
    maxSlides: 1,
    context: { dryRun: false },
    decoder: () => ({
      warnings: ["truncated"],
      slides: [
        { slideNumber: 1, title: "Intro", textBlocks: ["hello"] },
        { slideNumber: 2, title: "Extra", textBlocks: ["ignored by maxSlides"] },
      ],
    }),
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected injected slides decode");
  }

  assert.equal(result.plan.dispatch, "injected-decoder");
  assert.equal(result.output?.slides.length, 1);
  assert.equal(result.output?.warnings[0], "truncated");
});

test("planOfficeSlidesDecode rejects invalid paths and missing decoder", async () => {
  const invalidPath = await planOfficeSlidesDecode({
    presentationPath: "/tmp/demo.pptx",
  });

  assert.equal(invalidPath.ok, false);
  if (!invalidPath.ok) {
    assert.equal(invalidPath.error.code, "ABSOLUTE_PRESENTATION_PATH");
  }

  const missingDecoder = await planOfficeSlidesDecode({
    presentationPath: "slides/demo.pptx",
    context: { dryRun: false },
  });

  assert.equal(missingDecoder.ok, false);
  if (!missingDecoder.ok) {
    assert.equal(missingDecoder.error.code, "DECODER_NOT_INJECTED");
  }
});
