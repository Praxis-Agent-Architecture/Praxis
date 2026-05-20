import assert from "node:assert/strict";
import test from "node:test";

import { planSkillSummarize, skillSummarizeHandler } from "../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/skillBase/skill.summarize.js";

test("skill.summarize builds model-visible metadata from excerpts", async () => {
  const result = await planSkillSummarize({ target: { skillId: "repo-auditor", sourceExcerpts: [{ heading: "SKILL.md", content: "---\nname: repo-auditor\ndescription: Audit repos\n---\n# Body" }] } });
  assert.equal(result.ok, true);
  assert.match(result.output.summaryEnvelope.modelVisibleLine, /repo-auditor/u);
  assert.equal(result.output.summaryEnvelope.sourceCount, 1);
});

test("skill.summarize validates source size and scope", async () => {
  const scoped = await planSkillSummarize({ target: { skillId: "repo-auditor" }, context: { allowedSkillIds: ["other"] } });
  assert.equal(scoped.ok, false);
  assert.equal(scoped.error.code, "SCOPE_REJECTED");
  const tooLarge = await planSkillSummarize({ target: { skillId: "repo-auditor", sourceExcerpts: [{ content: "x".repeat(25_000) }] } });
  assert.equal(tooLarge.ok, false);
  assert.equal(tooLarge.error.code, "SOURCE_TOO_LARGE");
});

test("skill.summarize handler can read skillPath through filesystem provider", async () => {
  const result = await skillSummarizeHandler.invoke({
    toolCallId: "tool-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: { target: { skillId: "repo-auditor", skillPath: "/workspace/.agents/skills/repo-auditor/SKILL.md" }, context: { dryRun: false, grantedPermissions: ["skill:read"] } },
    executor: { filesystem: { async readText() { return { ok: true, output: { content: "---\nname: repo-auditor\ndescription: Audit repos\n---\n# Body", truncated: false } }; } } },
  });
  assert.equal(result.ok, true);
  assert.equal(result.output.summaryEnvelope.sourceCount, 1);
});
