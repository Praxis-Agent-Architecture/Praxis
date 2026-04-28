import { defineAgentCoreContractTest } from "../../../agentCore/agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planOfficeSlidesVisionPosition } from "../../../../src/toolabilityPool/officeBase/presentations/office.slidesVisionPosition.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/toolabilityPool/officeBase/presentations/office.slidesVisionPosition.ts",
  docPath: "Praxis_Agent_Architecture/docs/toolabilityPool/officeBase/presentations/office.slidesVisionPosition.md",
  testFileUrl: import.meta.url,
});

test("planOfficeSlidesVisionPosition creates a guarded dry-run visual positioning envelope", () => {
  const result = planOfficeSlidesVisionPosition({
    target: {
      presentationPath: "/repo/decks/demo.pptx",
      slideNumber: 3,
      query: "chart title",
      coordinateSpace: "normalized",
      maxCandidates: 4,
    },
    context: {
      invocationId: "slides-position-1",
      allowedFileRoots: ["/repo"],
      grantedPermissions: ["filesystem:read", "office:read", "vision:read"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.office.slidesVisionPosition");
  assert.equal(result.output.target.slideNumber, 3);
  assert.equal(result.output.target.coordinateSpace, "normalized");
  assert.equal(result.output.resultEnvelope.pendingVisionExecution, true);
  assert.equal(result.output.resultEnvelope.candidates.length, 0);
  assert.equal(result.output.unsafeSideEffects, false);
  assert.equal(result.audit[0]?.invocationId, "slides-position-1");
});

test("planOfficeSlidesVisionPosition rejects invalid visual positioning requests", () => {
  const missing = planOfficeSlidesVisionPosition();

  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_PRESENTATION_PATH");
  }

  const invalidSlide = planOfficeSlidesVisionPosition({
    target: { presentationPath: "/repo/decks/demo.pptx", slideNumber: 0, query: "logo" },
  });

  assert.equal(invalidSlide.ok, false);
  if (!invalidSlide.ok) {
    assert.equal(invalidSlide.error.code, "INVALID_SLIDE_NUMBER");
  }

  const missingQuery = planOfficeSlidesVisionPosition({
    target: { presentationPath: "/repo/decks/demo.pptx", slideNumber: 1, query: " " },
  });

  assert.equal(missingQuery.ok, false);
  if (!missingQuery.ok) {
    assert.equal(missingQuery.error.code, "MISSING_QUERY");
  }

  const permission = planOfficeSlidesVisionPosition({
    target: { presentationPath: "/repo/decks/demo.pptx", slideNumber: 1, query: "logo" },
    context: { grantedPermissions: ["filesystem:read", "office:read"] },
  });

  assert.equal(permission.ok, false);
  if (!permission.ok) {
    assert.equal(permission.error.code, "PERMISSION_DENIED");
  }

  const real = planOfficeSlidesVisionPosition({
    target: { presentationPath: "/repo/decks/demo.pptx", slideNumber: 1, query: "logo" },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
    assert.equal(real.error.boundary, "contract");
  }
});
