import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { planShellSessionManagement } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellManagement/shell.shellSessionManagement.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellManagement/shell.shellSessionManagement.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellManagement/shell.shellSessionManagement.md",
  testFileUrl: import.meta.url,
});

test("planShellSessionManagement creates a guarded dry-run session plan", () => {
  const result = planShellSessionManagement({
    target: {
      action: "create",
      sessionName: "main",
      shellType: "zsh",
      workingDirectory: "/workspace/project",
    },
    context: {
      invocationId: "session-1",
      grantedPermissions: ["shell:session:create"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected shell session dry-run plan");
  }

  assert.equal(result.output.kind, "agentCore.basicTool.shell.shellSessionManagement");
  assert.equal(result.output.sessionEnvelope.wouldCreateSession, true);
  assert.equal(result.output.sessionEnvelope.runtimeSessionState, "unchanged");
  assert.equal(result.audit[0]?.invocationId, "session-1");
});

test("planShellSessionManagement rejects missing session ids, scope escapes, and real execution", () => {
  const missingSession = planShellSessionManagement({
    target: { action: "attach" },
  });

  assert.equal(missingSession.ok, false);
  if (!missingSession.ok) {
    assert.equal(missingSession.error.code, "MISSING_SESSION_ID");
  }

  const scoped = planShellSessionManagement({
    target: { action: "close", sessionId: "session:outside" },
    context: { allowedSessionIds: ["session:inside"] },
  });

  assert.equal(scoped.ok, false);
  if (!scoped.ok) {
    assert.equal(scoped.error.code, "SESSION_SCOPE_DENIED");
  }

  const permission = planShellSessionManagement({
    target: { action: "close", sessionId: "session:main" },
    context: { grantedPermissions: ["shell:session:inspect"] },
  });

  assert.equal(permission.ok, false);
  if (!permission.ok) {
    assert.equal(permission.error.code, "PERMISSION_DENIED");
  }

  const real = planShellSessionManagement({
    target: { action: "create", sessionName: "main" },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
  }
});
