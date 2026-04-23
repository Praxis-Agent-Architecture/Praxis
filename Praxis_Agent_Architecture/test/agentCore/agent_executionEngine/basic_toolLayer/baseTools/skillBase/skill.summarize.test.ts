import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../agentCoreContractTestHelper.js";
import {
  planSkillSummarize,
  skillSummarizeDescriptor,
} from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/skillBase/skill.summarize.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/skillBase/skill.summarize.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/skillBase/skill.summarize.md",
  testFileUrl: import.meta.url,
});

test("skill.summarize returns an extractive dry-run summary envelope", () => {
  const result = planSkillSummarize({
    target: {
      skillId: "doc-builder",
      title: "Doc Builder",
      description: "Builds structured documentation from bounded source excerpts.",
      maxBullets: 2,
      sourceExcerpts: [
        {
          path: "SKILL.md",
          heading: "Purpose",
          content: "Use this skill when documentation output needs stable sections and reviewable evidence.",
        },
        {
          path: "examples/basic.md",
          content: "The basic example keeps output short and grounded.",
        },
      ],
    },
    context: {
      invocationId: "invoke-summary",
      grantedPermissions: ["skill:read"],
      allowedSkillIds: ["doc-builder"],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.toolId, skillSummarizeDescriptor.toolId);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.summaryEnvelope.skillId, "doc-builder");
  assert.equal(result.output.summaryEnvelope.sourceCount, 2);
  assert.equal(result.output.summaryEnvelope.bullets.length, 2);
  assert.match(result.output.summaryEnvelope.summary, /Builds structured documentation/);
});

test("skill.summarize rejects out-of-scope skills", () => {
  const result = planSkillSummarize({
    target: {
      skillId: "secret-skill",
      sourceExcerpts: [{ content: "Hidden content." }],
    },
    context: {
      allowedSkillIds: ["public-skill"],
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "SCOPE_REJECTED");
  assert.equal(result.error.boundary, "scope");
});

test("skill.summarize blocks future provider-backed real execution", () => {
  const result = planSkillSummarize({
    target: {
      skillId: "doc-builder",
      sourceExcerpts: [{ content: "Summarize me." }],
    },
    context: {
      dryRun: false,
      grantedPermissions: ["skill:read"],
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "REAL_EXECUTION_BLOCKED");
  assert.equal(result.error.boundary, "contract");
});
