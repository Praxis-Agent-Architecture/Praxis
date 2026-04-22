import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  officeSlidesRipgrepDescriptor,
  planOfficeSlidesRipgrep,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/officeBase/presentations/office.slidesRipgrep.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/officeBase/presentations/office.slidesRipgrep.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/officeBase/presentations/office.slidesRipgrep.md",
  testFileUrl: import.meta.url,
});

test("planOfficeSlidesRipgrep creates a guarded dry-run search envelope", () => {
  const result = planOfficeSlidesRipgrep({
    target: {
      presentationPath: "/workspace/deck/demo.pptx",
      query: "roadmap",
      includeSpeakerNotes: true,
      maxMatches: 10,
    },
    context: {
      invocationId: "slides-ripgrep-1",
      allowedPresentationRoots: ["/workspace/deck"],
      grantedPermissions: ["filesystem:read", "office:slides:read"],
    },
  });

  assert.equal(officeSlidesRipgrepDescriptor.unsafeSideEffects, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected slides ripgrep dry-run plan");
  }

  assert.equal(result.output.kind, "agentCore.basicTool.office.slidesRipgrep");
  assert.equal(result.output.target.query, "roadmap");
  assert.equal(result.output.target.maxMatches, 10);
  assert.deepEqual(result.output.resultEnvelope.matches, []);
  assert.deepEqual(result.events, ["basicTool.office.slidesRipgrep.dryRun"]);
});

test("planOfficeSlidesRipgrep rejects empty query, denied permission, invalid max, and real execution", () => {
  const missingQuery = planOfficeSlidesRipgrep({
    target: { presentationPath: "/workspace/deck/demo.pptx" },
  });

  assert.equal(missingQuery.ok, false);
  if (!missingQuery.ok) {
    assert.equal(missingQuery.error.code, "MISSING_QUERY");
    assert.equal(missingQuery.error.boundary, "input");
  }

  const denied = planOfficeSlidesRipgrep({
    target: { presentationPath: "/workspace/deck/demo.pptx", query: "roadmap" },
    context: { grantedPermissions: ["filesystem:read"] },
  });

  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.error.code, "PERMISSION_DENIED");
    assert.equal(denied.error.boundary, "permission");
  }

  const invalidMaxMatches = planOfficeSlidesRipgrep({
    target: { presentationPath: "/workspace/deck/demo.pptx", query: "roadmap", maxMatches: 0 },
  });

  assert.equal(invalidMaxMatches.ok, false);
  if (!invalidMaxMatches.ok) {
    assert.equal(invalidMaxMatches.error.code, "INVALID_MAX_MATCHES");
    assert.equal(invalidMaxMatches.error.boundary, "input");
  }

  const realExecution = planOfficeSlidesRipgrep({
    target: { presentationPath: "/workspace/deck/demo.pptx", query: "roadmap" },
    context: { dryRun: false },
  });

  assert.equal(realExecution.ok, false);
  if (!realExecution.ok) {
    assert.equal(realExecution.error.code, "REAL_EXECUTION_BLOCKED");
    assert.equal(realExecution.error.boundary, "contract");
  }
});
