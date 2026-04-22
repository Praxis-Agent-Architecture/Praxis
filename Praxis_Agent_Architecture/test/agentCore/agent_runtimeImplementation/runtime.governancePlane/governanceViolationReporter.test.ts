import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { reportGovernanceViolation } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.governancePlane/governanceViolationReporter.js";
import { resolveRuntimeAuthority } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.governancePlane/runtimeAuthorityResolver.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_runtimeImplementation/runtime.governancePlane/governanceViolationReporter.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_runtimeImplementation/runtime.governancePlane/governanceViolationReporter.md",
  testFileUrl: import.meta.url,
});

test("reportGovernanceViolation creates a routable runtime event without punishing the caller", () => {
  const authority = resolveRuntimeAuthority({
    runtimeId: "runtime-1",
    caller: { kind: "operator", id: "operator.main" },
  });

  assert.equal(authority.ok, true);
  if (!authority.ok) {
    return;
  }

  const result = reportGovernanceViolation({
    runtimeId: " runtime-1 ",
    authority: authority.authority,
    violation: {
      code: "SCOPE_OVERREACH",
      message: "module requested a scope outside its grant",
      severity: "recoverable",
      decisionStatus: "deny",
      action: " tool.invoke ",
    },
    routes: ["inspection", "debug", "self-repair", "debug"],
    correlationId: " corr-1 ",
  });

  assert.equal(result.ok, true);
  assert.equal(result.event.type, "runtime.governance.violation");
  assert.equal(result.event.runtimeId, "runtime-1");
  assert.equal(result.event.violationCode, "SCOPE_OVERREACH");
  assert.equal(result.event.severity, "recoverable");
  assert.equal(result.event.decisionStatus, "deny");
  assert.equal(result.event.action, "tool.invoke");
  assert.equal(result.event.callerId, "operator.main");
  assert.deepEqual(result.event.routes, ["inspection", "debug", "self-repair"]);
  assert.equal(result.event.punishCaller, false);
  assert.equal(result.event.unsafeSideEffects, false);
});

test("reportGovernanceViolation rejects incomplete reports with public-safe errors", () => {
  assert.deepEqual(reportGovernanceViolation(), {
    ok: false,
    error: {
      code: "MISSING_RUNTIME_ID",
      message: "governance violation report requires a runtimeId",
      boundary: "input",
      publicSafe: true,
    },
    events: ["runtime.governance.violation.rejected"],
  });

  const missingMessage = reportGovernanceViolation({
    runtimeId: "runtime-1",
    violation: { code: "SCOPE_OVERREACH", message: "" },
  });

  assert.equal(missingMessage.ok, false);
  assert.equal(missingMessage.error.code, "MISSING_MESSAGE");
  assert.equal(missingMessage.error.boundary, "input");
});
