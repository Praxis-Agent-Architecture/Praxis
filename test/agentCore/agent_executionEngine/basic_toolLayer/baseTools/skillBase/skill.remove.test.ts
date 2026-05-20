import assert from "node:assert/strict";
import test from "node:test";

import { planSkillRemove, skillRemoveHandler } from "../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/skillBase/skill.remove.js";

test("skill.remove returns guarded dry-run removal plan", async () => {
  const result = await planSkillRemove({ target: { skillId: "repo-auditor", registryRoot: "/workspace/.agents/skills", mode: "purge" }, context: { allowedRoots: ["/workspace/.agents/skills"] } });
  assert.equal(result.ok, true);
  assert.equal(result.output.removalEnvelope.plannedPath, "/workspace/.agents/skills/repo-auditor");
});

test("skill.remove requires guard for real execution", async () => {
  const result = await planSkillRemove({ target: { skillId: "repo-auditor", registryRoot: "/workspace/.agents/skills", mode: "purge" }, context: { dryRun: false, grantedPermissions: ["skill:write", "filesystem:write"] } });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "GOVERNANCE_REJECTED");
});

test("skill.remove handler calls deletePath for purge", async () => {
  let deleted = "";
  const result = await skillRemoveHandler.invoke({
    toolCallId: "tool-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: { target: { skillId: "repo-auditor", registryRoot: "/workspace/.agents/skills", mode: "purge" }, context: { dryRun: false, guard: { accepted: true }, grantedPermissions: ["skill:write", "filesystem:write"] } },
    executor: { filesystem: { async deletePath(request) { deleted = request.path; return { ok: true, output: { deleted: true } }; } } },
  });
  assert.equal(result.ok, true);
  assert.equal(deleted, "/workspace/.agents/skills/repo-auditor");
});
