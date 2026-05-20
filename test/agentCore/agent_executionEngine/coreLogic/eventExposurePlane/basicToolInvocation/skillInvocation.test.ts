import { defineAgentCoreContractTest } from "../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { exposeSkillInvocationEvent } from "../../../../../../src/executionEngine/coreLogic/eventExposurePlane/basicToolInvocation/skillInvocation.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/coreLogic/eventExposurePlane/basicToolInvocation/skillInvocation.ts",
  docPath: "docs/agentCore/agent_executionEngine/coreLogic/eventExposurePlane/basicToolInvocation/skillInvocation.md",
  testFileUrl: import.meta.url,
});

test("exposeSkillInvocationEvent exposes a dry-run skill event without running a skill", () => {
  const result = exposeSkillInvocationEvent({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    invocationId: "skill-call-1",
    skillId: "docx.report",
    action: " render ",
    requestedScopes: ["tool.skill.invoke"],
    allowedScopes: ["tool.skill.invoke"],
    trace: { correlationId: "corr-skill" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.event.kind, "basicTool.skill.invocation");
  assert.equal(result.event.skillId, "docx.report");
  assert.equal(result.event.action, "render");
  assert.equal(result.event.phase, "planned");
  assert.equal(result.event.dryRun, true);
  assert.equal(result.event.skillExecutionPlanned, false);
  assert.equal(result.event.unsafeSideEffects, false);
});

test("exposeSkillInvocationEvent reports governance and scope failures", () => {
  const rejected = exposeSkillInvocationEvent({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    invocationId: "skill-call-1",
    skillId: "imagegen",
    governance: { accepted: false, reason: "skill invocation blocked" },
  });

  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, "GOVERNANCE_REJECTED");
  assert.equal(rejected.error.boundary, "governance");

  const deniedScope = exposeSkillInvocationEvent({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    invocationId: "skill-call-2",
    skillId: "shell-helper",
    requestedScopes: ["tool.skill.invoke", "fs.write"],
    allowedScopes: ["tool.skill.invoke"],
  });

  assert.equal(deniedScope.ok, false);
  assert.equal(deniedScope.error.code, "SCOPE_DENIED");
  assert.equal(deniedScope.error.boundary, "scope");
});
