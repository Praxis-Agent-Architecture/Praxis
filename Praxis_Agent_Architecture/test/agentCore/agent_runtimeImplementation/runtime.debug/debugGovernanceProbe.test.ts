import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { probeDebugGovernance } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.debug/debugGovernanceProbe.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_runtimeImplementation/runtime.debug/debugGovernanceProbe.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_runtimeImplementation/runtime.debug/debugGovernanceProbe.md",
  testFileUrl: import.meta.url,
});

test("debugGovernanceProbe summarizes governance decisions without enforcing side effects", () => {
  const result = probeDebugGovernance({
    runtimeId: " runtime:alpha ",
    caller: { kind: "runtime-surface", id: " debug-runtime " },
    decisions: [
      {
        decisionId: " allow-agent ",
        action: " agent.invoke ",
        status: "allow",
        policyId: "policy:runtime",
      },
      {
        decisionId: " approve-tool ",
        action: " tool.shell ",
        status: "requires-approval",
        reason: "shell requires tap approval",
      },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.report.runtimeId, "runtime:alpha");
  assert.equal(result.report.caller.id, "debug-runtime");
  assert.equal(result.report.status, "approval-needed");
  assert.equal(result.report.approvalDecisions[0]?.action, "tool.shell");
  assert.equal(result.report.unsafeSideEffects, false);
});

test("debugGovernanceProbe can fail closed when a deny decision is present", () => {
  const result = probeDebugGovernance({
    runtimeId: "runtime:alpha",
    caller: { kind: "debug", id: "debugger" },
    failOnDeny: true,
    decisions: [
      {
        decisionId: "deny-provider",
        action: "model.raw-provider",
        status: "deny",
      },
    ],
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, "GOVERNANCE_DENIED");
  assert.equal(result.error.boundary, "governance");
});

test("debugGovernanceProbe rejects missing caller and upstream governance gates", () => {
  const missingCaller = probeDebugGovernance({
    runtimeId: "runtime:alpha",
  });

  assert.equal(missingCaller.ok, false);
  if (!missingCaller.ok) {
    assert.equal(missingCaller.error.code, "MISSING_CALLER");
    assert.equal(missingCaller.error.boundary, "input");
  }

  const rejected = probeDebugGovernance({
    runtimeId: "runtime:alpha",
    caller: { kind: "inspection", id: "inspector" },
    governance: { accepted: false, reason: "debug surface disabled" },
  });

  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.equal(rejected.error.code, "GOVERNANCE_REJECTED");
    assert.equal(rejected.error.boundary, "governance");
  }
});
