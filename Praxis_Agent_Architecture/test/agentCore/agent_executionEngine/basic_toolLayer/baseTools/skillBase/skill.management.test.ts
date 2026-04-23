import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../agentCoreContractTestHelper.js";
import {
  planSkillManagement,
  skillManagementDescriptor,
} from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/skillBase/skill.management.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/skillBase/skill.management.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/skillBase/skill.management.md",
  testFileUrl: import.meta.url,
});

test("skill.management returns a dry-run management envelope", () => {
  const result = planSkillManagement({
    target: {
      action: "enable",
      skillId: "lint-check",
      registryRoot: "/workspace/skills",
      metadataPatch: { owner: "tap" },
    },
    context: {
      invocationId: "invoke-management",
      grantedPermissions: ["skill:read", "skill:write"],
      allowedSkillIds: ["lint-check"],
      allowedRoots: ["/workspace"],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.toolId, skillManagementDescriptor.toolId);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.managementPlan.action, "enable");
  assert.deepEqual(result.output.managementPlan.affectedSkillIds, ["lint-check"]);
  assert.deepEqual(result.output.permissionsRequired, ["skill:read", "skill:write"]);
  assert.equal(result.audit[0]?.invocationId, "invoke-management");
});

test("skill.management reports missing action as a public input error", () => {
  const result = planSkillManagement();

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "MISSING_ACTION");
  assert.equal(result.error.boundary, "input");
  assert.equal(result.error.publicSafe, true);
});

test("skill.management keeps real execution behind the first implementation guard", () => {
  const result = planSkillManagement({
    target: { action: "disable", skillId: "lint-check" },
    context: {
      dryRun: false,
      grantedPermissions: ["skill:read", "skill:write"],
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "REAL_EXECUTION_BLOCKED");
  assert.equal(result.error.boundary, "contract");
});
