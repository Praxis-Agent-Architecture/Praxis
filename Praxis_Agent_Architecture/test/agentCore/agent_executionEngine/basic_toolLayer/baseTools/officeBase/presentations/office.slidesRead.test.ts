import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  officeSlidesReadDescriptor,
  planOfficeSlidesRead,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/officeBase/presentations/office.slidesRead.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/officeBase/presentations/office.slidesRead.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/officeBase/presentations/office.slidesRead.md",
  testFileUrl: import.meta.url,
});

test("planOfficeSlidesRead creates a guarded dry-run read envelope", () => {
  const result = planOfficeSlidesRead({
    target: {
      presentationPath: "/workspace/deck/demo.pptx",
      includeSpeakerNotes: true,
      maxSlides: 5,
    },
    context: {
      invocationId: "slides-read-1",
      allowedPresentationRoots: ["/workspace/deck"],
      grantedPermissions: ["filesystem:read", "office:slides:read"],
    },
  });

  assert.equal(officeSlidesReadDescriptor.unsafeSideEffects, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected slides read dry-run plan");
  }

  assert.equal(result.output.kind, "agentCore.basicTool.office.slidesRead");
  assert.equal(result.output.target.presentationPath, "/workspace/deck/demo.pptx");
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.deepEqual(result.output.resultEnvelope.slides, []);
  assert.deepEqual(result.events, ["basicTool.office.slidesRead.dryRun"]);
});

test("planOfficeSlidesRead rejects missing path, scope escape, denied permission, invalid max, and real execution", () => {
  const missing = planOfficeSlidesRead();

  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_PRESENTATION_PATH");
    assert.equal(missing.error.boundary, "input");
  }

  const escaped = planOfficeSlidesRead({
    target: { presentationPath: "../deck.pptx" },
  });

  assert.equal(escaped.ok, false);
  if (!escaped.ok) {
    assert.equal(escaped.error.code, "SCOPE_REJECTED");
    assert.equal(escaped.error.boundary, "scope");
  }

  const denied = planOfficeSlidesRead({
    target: { presentationPath: "/workspace/deck/demo.pptx" },
    context: { grantedPermissions: ["filesystem:read"] },
  });

  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.error.code, "PERMISSION_DENIED");
    assert.equal(denied.error.boundary, "permission");
  }

  const invalidMaxSlides = planOfficeSlidesRead({
    target: { presentationPath: "/workspace/deck/demo.pptx", maxSlides: 0 },
  });

  assert.equal(invalidMaxSlides.ok, false);
  if (!invalidMaxSlides.ok) {
    assert.equal(invalidMaxSlides.error.code, "INVALID_MAX_SLIDES");
    assert.equal(invalidMaxSlides.error.boundary, "input");
  }

  const realExecution = planOfficeSlidesRead({
    target: { presentationPath: "/workspace/deck/demo.pptx" },
    context: { dryRun: false },
  });

  assert.equal(realExecution.ok, false);
  if (!realExecution.ok) {
    assert.equal(realExecution.error.code, "REAL_EXECUTION_BLOCKED");
    assert.equal(realExecution.error.boundary, "contract");
  }
});
