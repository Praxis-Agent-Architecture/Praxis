import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  officeSlidesEditDescriptor,
  planOfficeSlidesEdit,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/officeBase/presentations/office.slidesEdit.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/officeBase/presentations/office.slidesEdit.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/officeBase/presentations/office.slidesEdit.md",
  testFileUrl: import.meta.url,
});

test("planOfficeSlidesEdit creates a guarded dry-run edit envelope", () => {
  const result = planOfficeSlidesEdit({
    presentationPath: "slides/demo.pptx",
    outputPath: "slides/demo.edited.pptx",
    operations: [{ kind: "set-text", slideNumber: 1, target: "title", value: " Updated " }],
    context: {
      toolCallId: "slides-edit-1",
      allowedPresentationRoots: ["slides"],
      requestedScopes: ["office.presentation.edit"],
      allowedScopes: ["office.presentation.edit"],
      grantedPermissions: ["filesystem:read", "filesystem:write", "office:read", "office:write"],
    },
  });

  assert.equal(officeSlidesEditDescriptor.unsafeSideEffects, true);
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected slides edit plan");
  }

  assert.equal(result.plan.dryRun, true);
  assert.equal(result.plan.executionBlocked, true);
  assert.equal(result.plan.writesFile, true);
  assert.deepEqual(result.plan.commandPreview, [
    "office-slides-edit",
    "--dry-run",
    "--operation-count",
    "1",
    "--input",
    "slides/demo.pptx",
    "--output",
    "slides/demo.edited.pptx",
  ]);
  assert.equal(result.plan.operations[0]?.value, "Updated");
});

test("planOfficeSlidesEdit rejects empty operations and scope violations", () => {
  const missingOperations = planOfficeSlidesEdit({
    presentationPath: "slides/demo.pptx",
    operations: [],
  });

  assert.equal(missingOperations.ok, false);
  if (!missingOperations.ok) {
    assert.equal(missingOperations.error.code, "MISSING_OPERATIONS");
    assert.equal(missingOperations.error.boundary, "input");
  }

  const scoped = planOfficeSlidesEdit({
    presentationPath: "other/demo.pptx",
    operations: [{ kind: "delete-slide", slideNumber: 1 }],
    context: { allowedPresentationRoots: ["slides"] },
  });

  assert.equal(scoped.ok, false);
  if (!scoped.ok) {
    assert.equal(scoped.error.code, "PRESENTATION_PATH_OUTSIDE_SCOPE");
  }
});

test("planOfficeSlidesEdit blocks real presentation writes", () => {
  const result = planOfficeSlidesEdit({
    presentationPath: "slides/demo.pptx",
    operations: [{ kind: "delete-slide", slideNumber: 1 }],
    context: { dryRun: false },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "REAL_EXECUTION_BLOCKED");
    assert.equal(result.error.boundary, "contract");
  }
});
