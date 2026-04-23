import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../agentCoreContractTestHelper.js";
import {
  planSkillRemove,
  skillRemoveDescriptor,
} from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/skillBase/skill.remove.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/skillBase/skill.remove.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/skillBase/skill.remove.md",
  testFileUrl: import.meta.url,
});

test("skill.remove returns a guarded dry-run removal plan", () => {
  const result = planSkillRemove({
    target: {
      skillId: "lint-check",
      registryRoot: "/workspace/skills",
      mode: "purge",
      keepBackup: true,
    },
    context: {
      invocationId: "invoke-remove",
      grantedPermissions: ["skill:write", "filesystem:write"],
      allowedSkillIds: ["lint-check"],
      allowedRoots: ["/workspace"],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.toolId, skillRemoveDescriptor.toolId);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.unsafeSideEffects, true);
  assert.equal(result.output.removePlan.mode, "purge");
  assert.ok(result.output.removePlan.commandPreview.includes("--dry-run"));
  assert.equal(result.audit[0]?.targetRef, "lint-check");
});

test("skill.remove rejects unsafe skill identifiers before building a command plan", () => {
  const result = planSkillRemove({
    target: {
      skillId: "../outside",
      registryRoot: "/workspace/skills",
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "INVALID_SKILL_ID");
  assert.equal(result.error.boundary, "input");
});

test("skill.remove reports permission failures without touching the filesystem", () => {
  const result = planSkillRemove({
    target: {
      skillId: "lint-check",
      registryRoot: "/workspace/skills",
    },
    context: {
      grantedPermissions: ["skill:write"],
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "PERMISSION_DENIED");
  assert.equal(result.error.boundary, "permission");
});
