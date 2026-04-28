import { defineAgentCoreContractTest } from "../../../agentCore/agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  officeSlidesEncodeDescriptor,
  planOfficeSlidesEncode,
} from "../../../../src/toolabilityPool/officeBase/presentations/office.slidesEncode.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/toolabilityPool/officeBase/presentations/office.slidesEncode.ts",
  docPath: "Praxis_Agent_Architecture/docs/toolabilityPool/officeBase/presentations/office.slidesEncode.md",
  testFileUrl: import.meta.url,
});

test("planOfficeSlidesEncode creates a guarded dry-run encode envelope", () => {
  const result = planOfficeSlidesEncode({
    target: {
      outputPath: "/workspace/deck/generated.pptx",
      format: "pptx",
      overwrite: true,
      source: {
        sourceKind: "structured-outline",
        slideCount: 8,
        title: "Quarterly review",
      },
    },
    context: {
      invocationId: "slides-encode-1",
      allowedPresentationRoots: ["/workspace/deck"],
      grantedPermissions: ["filesystem:write", "office:slides:write"],
    },
  });

  assert.equal(officeSlidesEncodeDescriptor.unsafeSideEffects, true);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected slides encode dry-run plan");
  }

  assert.equal(result.output.kind, "agentCore.basicTool.office.slidesEncode");
  assert.equal(result.output.target.outputPath, "/workspace/deck/generated.pptx");
  assert.equal(result.output.target.source.slideCount, 8);
  assert.equal(result.output.executionBlocked, true);
  assert.deepEqual(result.events, ["basicTool.office.slidesEncode.dryRun"]);
});

test("planOfficeSlidesEncode rejects incomplete source, scope escape, denied permission, and real execution", () => {
  const missingSource = planOfficeSlidesEncode({
    target: { outputPath: "deck.pptx" },
  });

  assert.equal(missingSource.ok, false);
  if (!missingSource.ok) {
    assert.equal(missingSource.error.code, "MISSING_SOURCE");
    assert.equal(missingSource.error.boundary, "input");
  }

  const escaped = planOfficeSlidesEncode({
    target: {
      outputPath: "../deck.pptx",
      source: { sourceKind: "markdown-deck", slideCount: 3 },
    },
  });

  assert.equal(escaped.ok, false);
  if (!escaped.ok) {
    assert.equal(escaped.error.code, "SCOPE_REJECTED");
    assert.equal(escaped.error.boundary, "scope");
  }

  const denied = planOfficeSlidesEncode({
    target: {
      outputPath: "/workspace/deck/generated.pptx",
      source: { sourceKind: "markdown-deck", slideCount: 3 },
    },
    context: { grantedPermissions: ["filesystem:write"] },
  });

  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.error.code, "PERMISSION_DENIED");
    assert.equal(denied.error.boundary, "permission");
  }

  const invalidSlideCount = planOfficeSlidesEncode({
    target: {
      outputPath: "/workspace/deck/generated.pptx",
      source: { sourceKind: "markdown-deck", slideCount: 0 },
    },
  });

  assert.equal(invalidSlideCount.ok, false);
  if (!invalidSlideCount.ok) {
    assert.equal(invalidSlideCount.error.code, "INVALID_SLIDE_COUNT");
    assert.equal(invalidSlideCount.error.boundary, "input");
  }

  const realExecution = planOfficeSlidesEncode({
    target: {
      outputPath: "/workspace/deck/generated.pptx",
      source: { sourceKind: "html-deck", slideCount: 2 },
    },
    context: { dryRun: false },
  });

  assert.equal(realExecution.ok, false);
  if (!realExecution.ok) {
    assert.equal(realExecution.error.code, "REAL_EXECUTION_BLOCKED");
    assert.equal(realExecution.error.boundary, "contract");
  }
});
