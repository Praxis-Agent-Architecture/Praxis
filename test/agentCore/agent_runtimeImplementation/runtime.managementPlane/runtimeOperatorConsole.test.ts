import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { openRuntimeOperatorConsole } from "../../../../src/agentCore_runtimeImplementation/runtime.managementPlane/runtimeOperatorConsole.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_runtimeImplementation/runtime.managementPlane/runtimeOperatorConsole.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.managementPlane/runtimeOperatorConsole.md",
  testFileUrl: import.meta.url,
});

test("runtimeOperatorConsole accepts guarded command envelopes without routing side effects", () => {
  const result = openRuntimeOperatorConsole({
    runtimeId: " runtime-alpha ",
    operator: { operatorId: " operator-1 ", role: "maintainer", sessionId: " session-1 " },
    allowedScopes: ["runtime.inspect", "runtime.mutate"],
    commands: [
      {
        commandId: " inspect-resource ",
        verb: "inspect",
        targetSurface: "resourceGovernor",
        requestedScopes: [" runtime.inspect "],
        payload: { resource: "token" },
      },
      {
        commandId: "plan-console-change",
        verb: "plan-mutation",
        targetSurface: "mutationPlanner",
        requestedScopes: ["runtime.mutate"],
      },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.console.runtimeId, "runtime-alpha");
  assert.equal(result.console.operator.operatorId, "operator-1");
  assert.equal(result.console.route, "runtime.managementPlane.operatorConsole");
  assert.deepEqual(result.console.commandIds, ["inspect-resource", "plan-console-change"]);
  assert.deepEqual(result.console.forwardedSurfaces, ["resourceGovernor", "mutationPlanner"]);
  assert.deepEqual(result.console.grantedScopes, ["runtime.inspect", "runtime.mutate"]);
  assert.equal(result.console.commands[0]?.dryRunOnly, true);
  assert.equal(result.console.mockableEnvelope, true);
  assert.equal(result.console.unsafeSideEffects, false);
});

test("runtimeOperatorConsole rejects missing commands and out-of-scope command envelopes", () => {
  const missingOperator = openRuntimeOperatorConsole({
    runtimeId: "runtime-alpha",
    commands: [{ commandId: "inspect", verb: "inspect", targetSurface: "runtimeManagementPlane" }],
  });

  assert.equal(missingOperator.ok, false);
  if (missingOperator.ok) {
    return;
  }

  assert.equal(missingOperator.error.code, "MISSING_OPERATOR");
  assert.equal(missingOperator.error.boundary, "input");

  const missingCommandVerb = openRuntimeOperatorConsole({
    runtimeId: "runtime-alpha",
    operator: { operatorId: "operator-1" },
    commands: [{ commandId: "inspect", targetSurface: "runtimeManagementPlane" }],
  });

  assert.equal(missingCommandVerb.ok, false);
  if (missingCommandVerb.ok) {
    return;
  }

  assert.equal(missingCommandVerb.error.code, "MISSING_COMMAND_VERB");
  assert.equal(missingCommandVerb.error.boundary, "input");

  const denied = openRuntimeOperatorConsole({
    runtimeId: "runtime-alpha",
    operator: { operatorId: "operator-1" },
    allowedScopes: ["runtime.inspect"],
    commands: [
      {
        commandId: "admin-change",
        verb: "plan-mutation",
        targetSurface: "mutationPlanner",
        requestedScopes: ["runtime.admin"],
      },
    ],
  });

  assert.equal(denied.ok, false);
  if (denied.ok) {
    return;
  }

  assert.equal(denied.error.code, "SCOPE_DENIED");
  assert.equal(denied.error.boundary, "scope");
  assert.equal(denied.error.internalDetailExposed, false);
});
