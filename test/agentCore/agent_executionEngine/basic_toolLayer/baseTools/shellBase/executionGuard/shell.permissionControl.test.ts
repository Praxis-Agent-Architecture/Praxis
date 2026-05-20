import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import {
  controlShellExecutionPermission,
  executeShellPermissionControl,
  selectShellPermissionControlPractice,
  shellPermissionControlDescriptor,
  shellPermissionControlHandler,
} from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/shellBase/executionGuard/shell.permissionControl.js";
import { createBaseToolRegistry } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/basic_toolLayer/baseTools/shellBase/executionGuard/shell.permissionControl.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/executionGuard/shell.permissionControl.md",
  testFileUrl: import.meta.url,
});

test("controlShellExecutionPermission grants an audited dry-run permission decision", () => {
  const result = controlShellExecutionPermission({
    command: "npm test",
    workingDirectory: "/repo/app",
    requestedPermissions: ["shell:validate", "shell:execute"],
    riskLevel: "medium",
    context: {
      invocationId: "shell-permission-1",
      allowedWorkingDirectories: ["/repo"],
      grantedPermissions: ["shell:validate", "shell:execute"],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(shellPermissionControlDescriptor.defaultDryRun, true);
  assert.equal(result.output.decision, "granted");
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.finalAuthorizationGranted, false);
  assert.equal(result.output.runtimeGuardRequired, true);
  assert.equal(result.output.unsafeSideEffects, false);
  assert.deepEqual(result.output.missingPermissions, []);
  assert.deepEqual(result.events, ["basicTool.shell.permissionControl.granted"]);
});

test("controlShellExecutionPermission rejects missing inputs, scope, and missing permissions", () => {
  const missing = controlShellExecutionPermission();
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, "MISSING_COMMAND");

  const noPermissions = controlShellExecutionPermission({ command: "pwd" });
  assert.equal(noPermissions.ok, false);
  assert.equal(noPermissions.error.code, "MISSING_REQUESTED_PERMISSIONS");

  const scope = controlShellExecutionPermission({
    command: "pwd",
    workingDirectory: "/outside",
    requestedPermissions: ["shell:validate"],
    context: { allowedWorkingDirectories: ["/repo"], grantedPermissions: ["shell:validate"] },
  });
  assert.equal(scope.ok, false);
  assert.equal(scope.error.code, "SCOPE_REJECTED");
  assert.equal(scope.error.boundary, "scope");

  const traversalScope = controlShellExecutionPermission({
    command: "pwd",
    workingDirectory: "/repo/app/../secret",
    requestedPermissions: ["shell:validate"],
    context: { allowedWorkingDirectories: ["/repo/app"], grantedPermissions: ["shell:validate"] },
  });
  assert.equal(traversalScope.ok, false);
  assert.equal(traversalScope.error.code, "SCOPE_REJECTED");

  const denied = controlShellExecutionPermission({
    command: "pwd",
    requestedPermissions: ["shell:execute"],
    context: { grantedPermissions: ["shell:validate"] },
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, "PERMISSION_DENIED");
  assert.equal(denied.error.boundary, "permission");
});

test("controlShellExecutionPermission requires approval for high risk and blocks real execution", () => {
  const approval = controlShellExecutionPermission({
    command: "sudo systemctl restart app",
    requestedPermissions: ["shell:execute"],
    riskLevel: "high",
    context: { grantedPermissions: ["shell:execute"] },
  });
  assert.equal(approval.ok, false);
  assert.equal(approval.error.code, "APPROVAL_REQUIRED");
  assert.equal(approval.error.boundary, "approval");

  const approved = controlShellExecutionPermission({
    command: "sudo systemctl restart app",
    requestedPermissions: ["shell:execute"],
    riskLevel: "high",
    context: {
      grantedPermissions: ["shell:execute"],
      approval: { accepted: true, approvalId: "tap-approval-1" },
    },
  });
  assert.equal(approved.ok, true);
  assert.equal(approved.output.approvalId, "tap-approval-1");

  const real = controlShellExecutionPermission({
    command: "pwd",
    requestedPermissions: ["shell:validate"],
    context: { dryRun: false, grantedPermissions: ["shell:validate"] },
  });
  assert.equal(real.ok, false);
  assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
  assert.equal(real.error.boundary, "contract");
});

test("controlShellExecutionPermission returns public-safe errors for malformed runtime JSON shapes", () => {
  const malformedCommand = controlShellExecutionPermission({
    command: 1,
    requestedPermissions: ["shell:validate"],
  } as never);
  assert.equal(malformedCommand.ok, false);
  assert.equal(malformedCommand.error.code, "MISSING_COMMAND");
  assert.equal(malformedCommand.error.safeForRuntimeInspection, true);

  const malformedPermissions = controlShellExecutionPermission({
    command: "pwd",
    requestedPermissions: {},
  } as never);
  assert.equal(malformedPermissions.ok, false);
  assert.equal(malformedPermissions.error.code, "INVALID_PERMISSION");

  const unknownPermission = controlShellExecutionPermission({
    command: "pwd",
    requestedPermissions: ["shell:rootAccess"],
    context: { grantedPermissions: ["shell:rootAccess"] },
  } as never);
  assert.equal(unknownPermission.ok, false);
  assert.equal(unknownPermission.error.code, "INVALID_PERMISSION");

  const malformedMetadata = controlShellExecutionPermission({
    command: "pwd",
    requestedPermissions: ["shell:validate"],
    context: { grantedPermissions: ["shell:validate"], auditMetadata: "not-metadata" },
  } as never);
  assert.equal(malformedMetadata.ok, true);
  assert.equal("0" in malformedMetadata.audit[0].metadata, false);
});

test("shellPermissionControlHandler and registry expose the runtime-mounted handler", async () => {
  const direct = await shellPermissionControlHandler.invoke({
    toolCallId: "shell-permission-handler",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      command: "pwd",
      requestedPermissions: ["shell:validate"],
      context: { grantedPermissions: ["shell:validate"] },
    },
    executor: {},
  });
  assert.equal(direct.ok, true);
  assert.equal(direct.toolId, "shell.permissionControl");

  const registry = createBaseToolRegistry();
  const lookup = registry.lookupHandler("shell.permissionControl");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) {
    return;
  }

  const result = await lookup.handler.invoke({
    toolCallId: "shell-permission-registry",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      command: "pwd",
      requestedPermissions: ["shell:validate"],
      context: { grantedPermissions: ["shell:validate"] },
      preferredProvider: "openai",
    },
    executor: {},
  });
  assert.equal(result.ok, true);
  assert.equal(result.toolId, "shell.permissionControl");

  const selection = selectShellPermissionControlPractice({ preferredProvider: "openai", provider: () => ({}) });
  assert.equal(selection.providerName, "openai");
});

test("shellPermissionControlHandler returns public-safe errors for malformed handler input", async () => {
  const result = await shellPermissionControlHandler.invoke({
    toolCallId: "shell-permission-null-input",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: null as never,
    executor: {},
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "MISSING_COMMAND");
    assert.equal(result.error.publicSafe, true);
  }
});

test("shell.permissionControl can call a runtime shell guard port through the registry", async () => {
  const registry = createBaseToolRegistry();
  const lookup = registry.lookupHandler("shell.permissionControl");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) {
    return;
  }

  let seen: { command?: string; workingDirectory?: string; requestedPermissions?: readonly string[] } = {};
  const result = await lookup.handler.invoke({
    toolCallId: "shell-permission-real",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      command: "  npm test  ",
      workingDirectory: "/repo/app/../app",
      requestedPermissions: ["shell:validate", "shell:execute", "shell:execute"],
      context: {
        dryRun: false,
        guard: { allowed: true },
        allowedWorkingDirectories: ["/repo/app"],
        grantedPermissions: ["shell:validate", "shell:execute"],
      },
    },
    executor: {
      shell: {
        controlPermission: async (request) => {
          seen = {
            command: request.command,
            workingDirectory: request.workingDirectory,
            requestedPermissions: request.requestedPermissions,
          };
          return {
            ok: true,
            output: {
              command: "rm -rf /",
              workingDirectory: "/tmp",
              requestedPermissions: ["network:access"],
              decision: request.requestedPermissions.includes("shell:execute") ? "granted" : "denied",
              missingPermissions: [],
              unsafeSideEffects: true,
            },
          };
        },
      },
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const output = result.output as { dryRun: boolean; providerCalled: boolean; decision: string };
  assert.deepEqual(seen, {
    command: "npm test",
    workingDirectory: "/repo/app",
    requestedPermissions: ["shell:validate", "shell:execute"],
  });
  assert.equal((result.output as { command: string }).command, "npm test");
  assert.equal((result.output as { workingDirectory: string }).workingDirectory, "/repo/app");
  assert.deepEqual((result.output as { requestedPermissions: readonly string[] }).requestedPermissions, [
    "shell:validate",
    "shell:execute",
  ]);
  assert.equal(output.dryRun, false);
  assert.equal(output.providerCalled, true);
  assert.equal(output.decision, "granted");
  assert.equal((result.output as { finalAuthorizationGranted: boolean }).finalAuthorizationGranted, false);
  assert.equal((result.output as { unsafeSideEffects: boolean }).unsafeSideEffects, false);
  assert.equal(result.events[0], "basicTool.shell.permissionControl.providerCalled");
});

test("shell.permissionControl sends normalized provider input and preserves envelope identity", async () => {
  let seen: { command?: string; workingDirectory?: string; requestedPermissions?: readonly string[] } = {};
  const result = await executeShellPermissionControl({
    command: "  npm test  ",
    workingDirectory: "/repo/app/../app",
    requestedPermissions: ["shell:validate", "shell:execute", "shell:execute"],
    context: {
      dryRun: false,
      guard: { allowed: true },
      allowedWorkingDirectories: ["/repo/app"],
      grantedPermissions: ["shell:validate", "shell:execute"],
    },
    provider: async (request) => {
      seen = {
        command: request.command,
        workingDirectory: request.workingDirectory,
        requestedPermissions: request.requestedPermissions,
      };
      return {
        command: "rm -rf /",
        workingDirectory: "/tmp",
        requestedPermissions: ["network:access"],
        grantedPermissions: ["shell:validate", "shell:execute"],
        missingPermissions: [],
        decision: "granted",
        unsafeSideEffects: true,
      } as never;
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(seen, {
    command: "npm test",
    workingDirectory: "/repo/app",
    requestedPermissions: ["shell:validate", "shell:execute"],
  });
  if (result.ok) {
    assert.equal(result.output.kind, "agentCore.basicTool.shell.permissionControl");
    assert.equal(result.output.command, "npm test");
    assert.equal(result.output.workingDirectory, "/repo/app");
    assert.deepEqual(result.output.requestedPermissions, ["shell:validate", "shell:execute"]);
    assert.equal(result.output.unsafeSideEffects, false);
    assert.equal(result.output.finalAuthorizationGranted, false);
  }

  const malformedProvider = await executeShellPermissionControl({
    command: "pwd",
    requestedPermissions: ["shell:validate"],
    context: { dryRun: false, guard: { allowed: true }, grantedPermissions: ["shell:validate"] },
    provider: async () => ({ grantedPermissions: ["shell:rootAccess"] }) as never,
  });
  assert.equal(malformedProvider.ok, false);
  if (!malformedProvider.ok) {
    assert.equal(malformedProvider.error.code, "PROVIDER_REJECTED");
  }
});

test("shell.permissionControl reports missing provider and missing or denied governance before runtime dispatch", async () => {
  const registry = createBaseToolRegistry();
  const lookup = registry.lookupHandler("shell.permissionControl");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) {
    return;
  }

  const input = {
    command: "pwd",
    requestedPermissions: ["shell:validate"] as const,
    context: { dryRun: false, guard: { allowed: true }, grantedPermissions: ["shell:validate"] as const },
  };

  const missingProvider = await lookup.handler.invoke({
    toolCallId: "shell-permission-missing-provider",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input,
    executor: {},
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
  }

  let providerCalled = false;
  const denied = await lookup.handler.invoke({
    toolCallId: "shell-permission-denied",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: { ...input, context: { ...input.context, guard: { allowed: false } } },
    executor: {
      shell: {
        controlPermission: async () => {
          providerCalled = true;
          return { ok: true, output: {} };
        },
      },
    },
  });
  assert.equal(denied.ok, false);
  assert.equal(providerCalled, false);
  if (!denied.ok) {
    assert.equal(denied.error.code, "GOVERNANCE_REJECTED");
  }

  providerCalled = false;
  const missingGuard = await lookup.handler.invoke({
    toolCallId: "shell-permission-missing-guard",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: { ...input, context: { dryRun: false, grantedPermissions: ["shell:validate"] as const } },
    executor: {
      shell: {
        controlPermission: async () => {
          providerCalled = true;
          return { ok: true, output: {} };
        },
      },
    },
  });
  assert.equal(missingGuard.ok, false);
  assert.equal(providerCalled, false);
  if (!missingGuard.ok) {
    assert.equal(missingGuard.error.code, "GOVERNANCE_REJECTED");
  }

  const malformedGuard = await lookup.handler.invoke({
    toolCallId: "shell-permission-malformed-guard",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: { ...input, context: { ...input.context, guard: "yes" } as never },
    executor: {
      shell: {
        controlPermission: async () => ({ ok: true, output: {} }),
      },
    },
  });
  assert.equal(malformedGuard.ok, false);
  if (!malformedGuard.ok) {
    assert.equal(malformedGuard.error.code, "GOVERNANCE_REJECTED");
  }

  providerCalled = false;
  const conflictingGuard = await lookup.handler.invoke({
    toolCallId: "shell-permission-conflicting-guard",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: { ...input, context: { ...input.context, guard: { allowed: false, accepted: true } } },
    executor: {
      shell: {
        controlPermission: async () => {
          providerCalled = true;
          return { ok: true, output: {} };
        },
      },
    },
  });
  assert.equal(conflictingGuard.ok, false);
  assert.equal(providerCalled, false);
  if (!conflictingGuard.ok) {
    assert.equal(conflictingGuard.error.code, "GOVERNANCE_REJECTED");
  }
});

test("shell.permissionControl maps runtime provider failures to public-safe provider errors", async () => {
  const registry = createBaseToolRegistry();
  const lookup = registry.lookupHandler("shell.permissionControl");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) {
    return;
  }

  const result = await lookup.handler.invoke({
    toolCallId: "shell-permission-provider-failure",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      command: "pwd",
      requestedPermissions: ["shell:validate"],
      context: { dryRun: false, guard: { allowed: true }, grantedPermissions: ["shell:validate"] },
    },
    executor: {
      shell: {
        controlPermission: async () => ({
          ok: false,
          error: { code: "RUNTIME_PERMISSION_FAILED", message: "runtime rejected permission", publicSafe: true },
        }),
      },
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_REJECTED");
    assert.match(result.error.message, /runtime rejected permission/);
  }

  const thrown = await executeShellPermissionControl({
    command: "pwd",
    requestedPermissions: ["shell:validate"],
    context: { dryRun: false, guard: { allowed: true }, grantedPermissions: ["shell:validate"] },
    provider: async () => {
      throw new Error("internal token=/home/proview/.ssh/key");
    },
  });
  assert.equal(thrown.ok, false);
  if (!thrown.ok) {
    assert.equal(thrown.error.code, "PROVIDER_REJECTED");
    assert.doesNotMatch(thrown.error.message, /token|ssh/);
  }
});
