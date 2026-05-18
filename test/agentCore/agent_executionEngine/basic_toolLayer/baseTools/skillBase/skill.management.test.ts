import assert from "node:assert/strict";
import test from "node:test";

import { planSkillManagement, skillManagementHandler } from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/skillBase/skill.management.js";

test("skill.management supports activate/load in dry-run shape", async () => {
  const result = await planSkillManagement({
    target: { action: "activate", skillId: "repo-auditor", registryRoot: "/workspace/.agents/skills" },
    context: { allowedRoots: ["/workspace/.agents/skills"], allowedSkillIds: ["repo-auditor"] },
  });
  assert.equal(result.ok, true);
  assert.equal(result.output.managementEnvelope.action, "activate");
  assert.equal(result.output.managementEnvelope.skillRoot, "/workspace/.agents/skills/repo-auditor");
});

test("skill.management rejects missing action and invalid ids", async () => {
  const missing = await planSkillManagement();
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, "MISSING_ACTION");
  const invalid = await planSkillManagement({ target: { action: "activate", skillId: "../x", registryRoot: "/workspace/skills" } });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.code, "INVALID_SKILL_ID");
});

test("skill.management activate/load reads full SKILL.md and resource index", async () => {
  const result = await skillManagementHandler.invoke({
    toolCallId: "tool-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: { target: { action: "load", skillId: "repo-auditor", registryRoot: "/workspace/.agents/skills" }, context: { dryRun: false, guard: { accepted: true }, grantedPermissions: ["skill:read", "filesystem:read"] } },
    executor: {
      filesystem: {
        async readText() { return { ok: true, output: { content: "---\nname: repo-auditor\ndescription: Audit repos\n---\n# Body", truncated: false } }; },
        async list() { return { ok: true, output: { entries: ["SKILL.md", "references/a.md"] } }; },
      },
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.output.managementEnvelope.skill?.name, "repo-auditor");
  assert.match(result.output.managementEnvelope.skill?.modelInstructionEnvelope ?? "", /<activated_skill>/u);
});
