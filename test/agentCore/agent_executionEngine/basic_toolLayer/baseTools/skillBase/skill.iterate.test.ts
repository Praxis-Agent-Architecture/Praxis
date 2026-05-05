import assert from "node:assert/strict";
import test from "node:test";

import { planSkillIteration, skillIterateHandler } from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/skillBase/skill.iterate.js";

test("skill.iterate returns dry-run patch envelope", async () => {
  const result = await planSkillIteration({
    target: { skillPath: "/workspace/.agents/skills/repo-auditor", changeIntent: "Add rule", operations: [{ kind: "append", relativePath: "SKILL.md", summary: "append", content: "\nrule" }] },
    context: { allowedRoots: ["/workspace/.agents/skills"] },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.output.iterationEnvelope.affectedFiles, ["/workspace/.agents/skills/repo-auditor/SKILL.md"]);
});

test("skill.iterate rejects malformed operations and missing guard", async () => {
  const bad = await planSkillIteration({ target: { skillPath: "/workspace/s", changeIntent: "x", operations: [{ kind: "append", relativePath: "../x", summary: "bad" }] } });
  assert.equal(bad.ok, false);
  assert.equal(bad.error.code, "INVALID_OPERATION");
  const denied = await planSkillIteration({ target: { skillPath: "/workspace/s", changeIntent: "x", operations: [{ kind: "append", relativePath: "SKILL.md", summary: "ok" }] }, context: { dryRun: false, grantedPermissions: ["skill:read", "skill:write", "filesystem:read", "filesystem:write"] } });
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, "GOVERNANCE_REJECTED");
});

test("skill.iterate handler uses filesystem read/write provider", async () => {
  let wrote = "";
  const result = await skillIterateHandler.invoke({
    toolCallId: "tool-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: { target: { skillPath: "/workspace/s", changeIntent: "x", operations: [{ kind: "append", relativePath: "SKILL.md", summary: "append", content: "!" }] }, context: { dryRun: false, guard: { accepted: true }, grantedPermissions: ["skill:read", "skill:write", "filesystem:read", "filesystem:write"] } },
    executor: {
      filesystem: {
        async readText() { return { ok: true, output: { content: "hello", truncated: false } }; },
        async writeText(request) { wrote = request.content; return { ok: true, output: { bytesWritten: request.content.length } }; },
      },
    },
  });
  assert.equal(result.ok, true);
  assert.equal(wrote, "hello!");
});

test("skill.iterate accepts natural model operation aliases", async () => {
  const result = await planSkillIteration({
    target: {
      skillPath: "/workspace/.agents/skills/repo-auditor",
      changeIntent: "Add coverage guidance",
      operations: [{ type: "append", path: "repo-auditor/SKILL.md", content: "\ncoverage" }],
    },
    context: { allowedRoots: ["/workspace/.agents/skills"] },
  });

  assert.equal(result.ok, true);
  assert.equal(result.output.target.operations[0]?.kind, "append");
  assert.equal(result.output.target.operations[0]?.relativePath, "SKILL.md");
  assert.equal(result.output.target.operations[0]?.summary, "Add coverage guidance");
});
