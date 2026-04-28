import { defineAgentCoreContractTest } from "../../../agentCore/agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  officeSlidesVisionCheckDescriptor,
  planOfficeSlidesVisionCheck,
} from "../../../../src/toolabilityPool/officeBase/presentations/office.slidesVisionCheck.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/toolabilityPool/officeBase/presentations/office.slidesVisionCheck.ts",
  docPath: "Praxis_Agent_Architecture/docs/toolabilityPool/officeBase/presentations/office.slidesVisionCheck.md",
  testFileUrl: import.meta.url,
});

test("planOfficeSlidesVisionCheck creates a guarded dry-run vision envelope", () => {
  const result = planOfficeSlidesVisionCheck({
    target: {
      presentationPath: "/workspace/deck/demo.pptx",
      checks: ["renderability", "text-legibility"],
      slideNumbers: [1, 3],
      renderScale: 2,
    },
    context: {
      invocationId: "slides-vision-1",
      allowedPresentationRoots: ["/workspace/deck"],
      grantedPermissions: ["filesystem:read", "office:slides:read", "vision:read"],
    },
  });

  assert.equal(officeSlidesVisionCheckDescriptor.unsafeSideEffects, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected slides vision dry-run plan");
  }

  assert.equal(result.output.kind, "agentCore.basicTool.office.slidesVisionCheck");
  assert.deepEqual(result.output.target.checks, ["renderability", "text-legibility"]);
  assert.deepEqual(result.output.target.slideNumbers, [1, 3]);
  assert.deepEqual(result.output.resultEnvelope.findings, []);
  assert.deepEqual(result.events, ["basicTool.office.slidesVisionCheck.dryRun"]);
});

test("planOfficeSlidesVisionCheck rejects invalid slides, checks, permissions, and real execution", () => {
  const invalidSlide = planOfficeSlidesVisionCheck({
    target: { presentationPath: "/workspace/deck/demo.pptx", slideNumbers: [0] },
  });

  assert.equal(invalidSlide.ok, false);
  if (!invalidSlide.ok) {
    assert.equal(invalidSlide.error.code, "INVALID_SLIDE_NUMBER");
    assert.equal(invalidSlide.error.boundary, "input");
  }

  const deniedScope = planOfficeSlidesVisionCheck({
    target: { presentationPath: "/workspace/deck/demo.pptx" },
    context: { allowedPresentationRoots: ["/workspace/other"] },
  });

  assert.equal(deniedScope.ok, false);
  if (!deniedScope.ok) {
    assert.equal(deniedScope.error.code, "SCOPE_REJECTED");
    assert.equal(deniedScope.error.boundary, "scope");
  }

  const invalidCheck = planOfficeSlidesVisionCheck({
    target: {
      presentationPath: "/workspace/deck/demo.pptx",
      checks: ["unsupported-check" as "renderability"],
    },
  });

  assert.equal(invalidCheck.ok, false);
  if (!invalidCheck.ok) {
    assert.equal(invalidCheck.error.code, "INVALID_CHECK");
    assert.equal(invalidCheck.error.boundary, "input");
  }

  const deniedPermission = planOfficeSlidesVisionCheck({
    target: { presentationPath: "/workspace/deck/demo.pptx" },
    context: { grantedPermissions: ["filesystem:read", "office:slides:read"] },
  });

  assert.equal(deniedPermission.ok, false);
  if (!deniedPermission.ok) {
    assert.equal(deniedPermission.error.code, "PERMISSION_DENIED");
    assert.equal(deniedPermission.error.boundary, "permission");
  }

  const realExecution = planOfficeSlidesVisionCheck({
    target: { presentationPath: "/workspace/deck/demo.pptx" },
    context: { dryRun: false },
  });

  assert.equal(realExecution.ok, false);
  if (!realExecution.ok) {
    assert.equal(realExecution.error.code, "REAL_EXECUTION_BLOCKED");
    assert.equal(realExecution.error.boundary, "contract");
  }
});
