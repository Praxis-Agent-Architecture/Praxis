import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import {
  enforceShellSandbox,
  shellSandboxEnforcementDescriptor,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/executionGuard/shell.sandboxEnforcement.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/executionGuard/shell.sandboxEnforcement.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/executionGuard/shell.sandboxEnforcement.md",
  testFileUrl: import.meta.url,
});

test("enforceShellSandbox creates an audited dry-run sandbox envelope", () => {
  const result = enforceShellSandbox({
    command: "npm test",
    workingDirectory: "/repo/app",
    requestedPaths: ["/repo/app/package.json"],
    accessIntents: ["read", "execute"],
    policy: { sandboxRoots: ["/repo"] },
    context: { invocationId: "sandbox-1", grantedPermissions: ["shell:sandbox"] },
  });

  assert.equal(result.ok, true);
  assert.equal(shellSandboxEnforcementDescriptor.defaultDryRun, true);
  assert.equal(result.output.decision, "enforced");
  assert.equal(result.output.requiresTapApproval, false);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.unsafeSideEffects, false);
  assert.deepEqual(result.events, ["basicTool.shell.sandboxEnforcement.enforced"]);
});

test("enforceShellSandbox asks TAP to approve write or host-expanding sandbox requests", () => {
  const result = enforceShellSandbox({
    command: "tee output.txt",
    workingDirectory: "/repo",
    requestedPaths: ["/repo/output.txt"],
    accessIntents: ["write"],
    policy: { sandboxRoots: ["/repo"], allowNetwork: true },
    context: { grantedPermissions: ["shell:sandbox"] },
  });

  assert.equal(result.ok, true);
  assert.equal(result.output.decision, "requires-approval");
  assert.equal(result.output.requiresTapApproval, true);
  assert.match(result.output.reasons.join("\n"), /write intent|network-enabled/);
});

test("enforceShellSandbox treats the filesystem root as a valid configured sandbox root", () => {
  const result = enforceShellSandbox({
    command: "pwd",
    workingDirectory: "/tmp/workspace",
    requestedPaths: ["/etc/hosts"],
    policy: { sandboxRoots: ["/"] },
    context: { grantedPermissions: ["shell:sandbox"] },
  });

  assert.equal(result.ok, true);
  assert.equal(result.output.decision, "enforced");
  assert.deepEqual(result.output.sandboxRoots, ["/"]);
});

test("enforceShellSandbox rejects missing input, scope escape, missing permission, and real execution", () => {
  const missing = enforceShellSandbox();
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, "MISSING_COMMAND");
  assert.equal(missing.error.boundary, "input");

  const scope = enforceShellSandbox({
    command: "cat /etc/passwd",
    workingDirectory: "/repo",
    requestedPaths: ["/etc/passwd"],
    policy: { sandboxRoots: ["/repo"] },
  });
  assert.equal(scope.ok, false);
  assert.equal(scope.error.code, "SCOPE_REJECTED");
  assert.equal(scope.error.boundary, "scope");

  const traversalScope = enforceShellSandbox({
    command: "cat ../etc/passwd",
    workingDirectory: "/repo/app/..",
    requestedPaths: ["/repo/../etc/passwd"],
    policy: { sandboxRoots: ["/repo"] },
  });
  assert.equal(traversalScope.ok, false);
  assert.equal(traversalScope.error.code, "SCOPE_REJECTED");

  const permission = enforceShellSandbox({
    command: "pwd",
    workingDirectory: "/repo",
    policy: { sandboxRoots: ["/repo"] },
    context: { grantedPermissions: [] },
  });
  assert.equal(permission.ok, false);
  assert.equal(permission.error.code, "PERMISSION_DENIED");

  const real = enforceShellSandbox({
    command: "pwd",
    workingDirectory: "/repo",
    policy: { sandboxRoots: ["/repo"] },
    context: { dryRun: false },
  });
  assert.equal(real.ok, false);
  assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
  assert.equal(real.error.boundary, "contract");
});
