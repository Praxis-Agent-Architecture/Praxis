import { defineAgentCoreContractTest } from "../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { planSkillGeneration } from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/skillBase/skill.generate.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/skillBase/skill.generate.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/skillBase/skill.generate.md",
  testFileUrl: import.meta.url,
});

test("planSkillGeneration creates a guarded dry-run skill scaffold plan", () => {
  const result = planSkillGeneration({
    target: {
      skillName: "repo-auditor",
      purpose: "Inspect repository health signals before implementation work.",
      destinationRoot: "/workspace/.codex/skills",
      files: [
        { path: "SKILL.md", kind: "instruction", purpose: "entrypoint" },
        { path: "examples/report.md", kind: "example" },
      ],
      tags: ["agentCore", "review"],
    },
    context: {
      invocationId: "skill-generate-1",
      allowedSkillRoots: ["/workspace/.codex/skills"],
      grantedPermissions: ["skill:generate", "filesystem:write"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected skill generation dry-run plan");
  }

  assert.equal(result.output.kind, "agentCore.basicTool.skill.generate");
  assert.equal(result.output.generationEnvelope.skillDirectory, "/workspace/.codex/skills/repo-auditor");
  assert.equal(result.output.generationEnvelope.fileCount, 2);
  assert.equal(result.output.unsafeSideEffects, true);
  assert.equal(result.audit[0]?.invocationId, "skill-generate-1");
});

test("planSkillGeneration rejects malformed skill plans, scope escapes, and real execution", () => {
  const missingName = planSkillGeneration({
    target: { purpose: "Generate a skill", destinationRoot: "/workspace/.codex/skills" },
  });

  assert.equal(missingName.ok, false);
  if (!missingName.ok) {
    assert.equal(missingName.error.code, "MISSING_SKILL_NAME");
  }

  const invalidFile = planSkillGeneration({
    target: {
      skillName: "repo-auditor",
      purpose: "Generate a skill",
      destinationRoot: "/workspace/.codex/skills",
      files: [{ path: "../escape.md", kind: "instruction" }],
    },
  });

  assert.equal(invalidFile.ok, false);
  if (!invalidFile.ok) {
    assert.equal(invalidFile.error.code, "INVALID_REQUESTED_FILE");
  }

  const scoped = planSkillGeneration({
    target: {
      skillName: "repo-auditor",
      purpose: "Generate a skill",
      destinationRoot: "/tmp/skills",
    },
    context: { allowedSkillRoots: ["/workspace/.codex/skills"] },
  });

  assert.equal(scoped.ok, false);
  if (!scoped.ok) {
    assert.equal(scoped.error.code, "SKILL_ROOT_OUTSIDE_SCOPE");
  }

  const real = planSkillGeneration({
    target: {
      skillName: "repo-auditor",
      purpose: "Generate a skill",
      destinationRoot: "/workspace/.codex/skills",
    },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
  }
});
