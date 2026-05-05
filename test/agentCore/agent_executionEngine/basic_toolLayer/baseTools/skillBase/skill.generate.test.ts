import assert from "node:assert/strict";
import test from "node:test";

import { planSkillGeneration, skillGenerateHandler } from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/skillBase/skill.generate.js";

test("skill.generate returns dry-run plan without provider", async () => {
  const result = await planSkillGeneration({
    target: { skillName: "repo-auditor", purpose: "Inspect repositories.", destinationRoot: "/workspace/.agents/skills" },
    context: { invocationId: "skill-generate-1", allowedRoots: ["/workspace/.agents/skills"] },
  });

  assert.equal(result.ok, true);
  assert.equal(result.output.generationEnvelope.skillDirectory, "/workspace/.agents/skills/repo-auditor");
  assert.equal(result.output.executionBlocked, true);
});

test("skill.generate validates malformed JSON and scope", async () => {
  assert.equal((await planSkillGeneration({ target: { skillName: 1 } })).ok, false);
  const scoped = await planSkillGeneration({
    target: { skillName: "repo-auditor", purpose: "Generate", destinationRoot: "/tmp/skills" },
    context: { allowedRoots: ["/workspace/.agents/skills"] },
  });
  assert.equal(scoped.ok, false);
  assert.equal(scoped.error.code, "SKILL_ROOT_OUTSIDE_SCOPE");
});

test("skill.generate requires guard and provider for real execution", async () => {
  const denied = await planSkillGeneration({
    target: { skillName: "repo-auditor", purpose: "Generate", destinationRoot: "/workspace/.agents/skills" },
    context: { dryRun: false, grantedPermissions: ["skill:write", "filesystem:write"] },
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, "GOVERNANCE_REJECTED");

  const unavailable = await planSkillGeneration({
    target: { skillName: "repo-auditor", purpose: "Generate", destinationRoot: "/workspace/.agents/skills" },
    context: { dryRun: false, guard: { accepted: true }, grantedPermissions: ["skill:write", "filesystem:write"] },
  });
  assert.equal(unavailable.ok, false);
  assert.equal(unavailable.error.code, "PROVIDER_UNAVAILABLE");
});

test("skill.generate handler writes through runtime provider when guarded", async () => {
  const writes: string[] = [];
  const result = await skillGenerateHandler.invoke({
    toolCallId: "tool-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      target: { skillName: "repo-auditor", purpose: "Generate", destinationRoot: "/workspace/.agents/skills" },
      context: { dryRun: false, guard: { accepted: true }, grantedPermissions: ["skill:write", "filesystem:write"] },
    },
    executor: {
      filesystem: {
        async writeText(request) {
          writes.push(request.path);
          return { ok: true, output: { bytesWritten: request.content.length } };
        },
      },
    },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(writes, ["/workspace/.agents/skills/repo-auditor/SKILL.md"]);
});
