import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  codeDebugRunDescriptor,
  planCodeDebugRun,
} from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/codeBase/debugCode/code.debugRun.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_executionEngine/basic_toolLayer/baseTools/codeBase/debugCode/code.debugRun.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/debugCode/code.debugRun.md",
  testFileUrl: import.meta.url,
});

test("planCodeDebugRun creates a dry-run debug launch envelope and storage plan", () => {
  const result = planCodeDebugRun({
    runtimeId: " runtime-1 ",
    sessionId: " session-1 ",
    target: {
      kind: "test",
      label: " unit tests ",
      command: [" npm ", " test "],
      cwd: " /workspace ",
    },
    breakpoints: [
      {
        file: " src/app.ts ",
        line: 12,
      },
    ],
    environment: {
      NODE_ENV: "test",
    },
    requestedScopes: ["debug:run"],
    allowedScopes: ["debug:run"],
  });

  assert.equal(codeDebugRunDescriptor.unsafeSideEffects, false);
  if (!result.ok) {
    assert.fail("valid debug run request must be accepted");
  }

  assert.equal(result.plan.toolName, "code.debugRun");
  assert.equal(result.plan.runtimeId, "runtime-1");
  assert.equal(result.plan.sessionId, "session-1");
  assert.equal(result.plan.target.kind, "test");
  assert.equal(result.plan.target.label, "unit tests");
  assert.deepEqual(result.plan.target.command, ["npm", "test"]);
  assert.equal(result.plan.target.cwd, "/workspace");
  assert.deepEqual(result.plan.breakpoints, [{ file: "src/app.ts", line: 12 }]);
  assert.deepEqual(result.plan.environmentKeys, ["NODE_ENV"]);
  assert.equal(result.plan.execution.dryRun, true);
  assert.equal(result.plan.execution.launched, false);
  assert.equal(result.plan.storage.logic.persisted, false);
  assert.ok(result.plan.plannedSteps.includes("handoff-to-tap-governance"));
});

test("planCodeDebugRun rejects missing target and real debug attempts", () => {
  const missingTarget = planCodeDebugRun({
    runtimeId: "runtime-1",
    sessionId: "session-1",
  });
  assert.equal(missingTarget.ok, false);
  if (missingTarget.ok) {
    assert.fail("missing target must be rejected");
  }
  assert.equal(missingTarget.error.code, "MISSING_DEBUG_TARGET");
  assert.equal(missingTarget.error.boundary, "input");

  const realRun = planCodeDebugRun({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    target: { kind: "program", label: "app" },
    dryRun: false,
  });
  assert.equal(realRun.ok, false);
  if (realRun.ok) {
    assert.fail("real debug run must be rejected");
  }
  assert.equal(realRun.error.code, "REAL_DEBUG_RUN_NOT_ALLOWED");
  assert.equal(realRun.error.boundary, "governance");
});

test("planCodeDebugRun rejects invalid breakpoints and scope denial", () => {
  const invalidBreakpoint = planCodeDebugRun({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    target: { kind: "program", label: "app" },
    breakpoints: [{ file: "src/app.ts", line: 0 }],
  });
  assert.equal(invalidBreakpoint.ok, false);
  if (invalidBreakpoint.ok) {
    assert.fail("invalid breakpoint must be rejected");
  }
  assert.equal(invalidBreakpoint.error.code, "INVALID_BREAKPOINT");

  const denied = planCodeDebugRun({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    target: { kind: "attach", label: "pid-1" },
    requestedScopes: ["debug:run"],
    allowedScopes: [],
  });
  assert.equal(denied.ok, false);
  if (denied.ok) {
    assert.fail("scope denial must be rejected");
  }
  assert.equal(denied.error.code, "SCOPE_DENIED");
  assert.equal(denied.error.boundary, "scope");
});
