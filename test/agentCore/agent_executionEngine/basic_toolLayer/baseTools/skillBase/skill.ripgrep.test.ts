import assert from "node:assert/strict";
import test from "node:test";

import { planSkillRipgrep, skillRipgrepHandler } from "../../../../../../src/executionEngine/basic_toolLayer/baseTools/skillBase/skill.ripgrep.js";

test("skill.ripgrep returns dry-run command preview", async () => {
  const result = await planSkillRipgrep({ target: { query: "allowed-tools", registryRoot: "/workspace/.agents/skills", maxResults: 5 }, context: { allowedRoots: ["/workspace/.agents/skills"] } });
  assert.equal(result.ok, true);
  assert.equal(result.output.ripgrepEnvelope.searchRoot, "/workspace/.agents/skills");
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.search.ripgrep");
});

test("skill.ripgrep validates scope and max results", async () => {
  const scoped = await planSkillRipgrep({ target: { query: "x", registryRoot: "/tmp/skills" }, context: { allowedRoots: ["/workspace/.agents/skills"] } });
  assert.equal(scoped.ok, false);
  assert.equal(scoped.error.code, "SCOPE_REJECTED");
  const badMax = await planSkillRipgrep({ target: { query: "x", registryRoot: "/workspace/.agents/skills", maxResults: 1000 } });
  assert.equal(badMax.ok, false);
  assert.equal(badMax.error.code, "INVALID_MAX_RESULTS");
});

test("skill.ripgrep handler calls runtime search.ripgrep", async () => {
  let calledRoot = "";
  const result = await skillRipgrepHandler.invoke({
    toolCallId: "tool-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: { target: { query: "skill", registryRoot: "/workspace/.agents/skills", skillId: "repo-auditor" }, context: { dryRun: false, grantedPermissions: ["skill:read", "filesystem:read"] } },
    executor: {
      search: {
        async ripgrep(request) {
          calledRoot = request.directoryPath;
          return { ok: true, output: { exitCode: 0, matches: [{ path: "SKILL.md", line: 1, text: "skill" }] } };
        },
      },
    },
  });
  assert.equal(result.ok, true);
  assert.equal(calledRoot, "/workspace/.agents/skills/repo-auditor");
});
