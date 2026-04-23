import { defineAgentCoreContractTest } from "../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { planSkillIteration } from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/skillBase/skill.iterate.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/skillBase/skill.iterate.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/skillBase/skill.iterate.md",
  testFileUrl: import.meta.url,
});

test("planSkillIteration creates a guarded dry-run skill iteration plan", () => {
  const result = planSkillIteration({
    target: {
      skillPath: "/workspace/.codex/skills/repo-auditor",
      changeIntent: "Tighten instructions after review feedback.",
      operations: [
        {
          kind: "revise-instructions",
          relativePath: "SKILL.md",
          summary: "Clarify review checklist scope.",
        },
        {
          kind: "add-example",
          relativePath: "examples/review.md",
          summary: "Add a minimal review report example.",
        },
      ],
      reason: "review follow-up",
    },
    context: {
      invocationId: "skill-iterate-1",
      allowedSkillRoots: ["/workspace/.codex/skills"],
      grantedPermissions: ["skill:iterate", "filesystem:read", "filesystem:write"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected skill iteration dry-run plan");
  }

  assert.equal(result.output.kind, "agentCore.basicTool.skill.iterate");
  assert.equal(result.output.iterationEnvelope.patchModel, "skill-iteration-patch-v1");
  assert.equal(result.output.iterationEnvelope.operationCount, 2);
  assert.deepEqual(result.output.iterationEnvelope.affectedFiles, [
    "/workspace/.codex/skills/repo-auditor/SKILL.md",
    "/workspace/.codex/skills/repo-auditor/examples/review.md",
  ]);
  assert.equal(result.output.iterationEnvelope.requiresReview, true);
  assert.equal(result.audit[0]?.invocationId, "skill-iterate-1");
});

test("planSkillIteration rejects malformed iteration plans, scope escapes, and real execution", () => {
  const missingPath = planSkillIteration({
    target: {
      changeIntent: "Update skill",
      operations: [{ kind: "revise-instructions", relativePath: "SKILL.md", summary: "Update wording." }],
    },
  });

  assert.equal(missingPath.ok, false);
  if (!missingPath.ok) {
    assert.equal(missingPath.error.code, "MISSING_SKILL_PATH");
  }

  const invalidOperation = planSkillIteration({
    target: {
      skillPath: "/workspace/.codex/skills/repo-auditor",
      changeIntent: "Update skill",
      operations: [{ kind: "update-script", relativePath: "../escape.sh", summary: "Escape scope." }],
    },
  });

  assert.equal(invalidOperation.ok, false);
  if (!invalidOperation.ok) {
    assert.equal(invalidOperation.error.code, "INVALID_ITERATION_OPERATION");
  }

  const scoped = planSkillIteration({
    target: {
      skillPath: "/tmp/skills/repo-auditor",
      changeIntent: "Update skill",
      operations: [{ kind: "revise-instructions", relativePath: "SKILL.md", summary: "Update wording." }],
    },
    context: { allowedSkillRoots: ["/workspace/.codex/skills"] },
  });

  assert.equal(scoped.ok, false);
  if (!scoped.ok) {
    assert.equal(scoped.error.code, "SKILL_PATH_OUTSIDE_SCOPE");
  }

  const permission = planSkillIteration({
    target: {
      skillPath: "/workspace/.codex/skills/repo-auditor",
      changeIntent: "Update skill",
      operations: [{ kind: "retire-file", relativePath: "examples/old.md", summary: "Retire stale example." }],
    },
    context: { grantedPermissions: ["skill:iterate", "filesystem:read"] },
  });

  assert.equal(permission.ok, false);
  if (!permission.ok) {
    assert.equal(permission.error.code, "PERMISSION_DENIED");
  }

  const real = planSkillIteration({
    target: {
      skillPath: "/workspace/.codex/skills/repo-auditor",
      changeIntent: "Update skill",
      operations: [{ kind: "revise-instructions", relativePath: "SKILL.md", summary: "Update wording." }],
    },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
  }
});
