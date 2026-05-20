import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import {
  enforceShellSandbox,
  executeShellSandboxEnforcement,
  selectShellSandboxEnforcementPractice,
  shellSandboxEnforcementDescriptor,
  shellSandboxEnforcementHandler,
} from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/shellBase/executionGuard/shell.sandboxEnforcement.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_executionEngine/basic_toolLayer/baseTools/shellBase/executionGuard/shell.sandboxEnforcement.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/executionGuard/shell.sandboxEnforcement.md",
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
  assert.equal(result.output.baseToolAppliedSandbox, false);
  assert.equal(result.output.runtimeGuardRequired, true);
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

test("enforceShellSandbox returns public-safe errors for malformed runtime JSON shapes", () => {
  const malformedCommand = enforceShellSandbox({
    command: 1,
    workingDirectory: "/repo",
    policy: { sandboxRoots: ["/repo"] },
  } as never);
  assert.equal(malformedCommand.ok, false);
  assert.equal(malformedCommand.error.code, "MISSING_COMMAND");
  assert.equal(malformedCommand.error.safeForRuntimeInspection, true);

  const malformedIntent = enforceShellSandbox({
    command: "pwd",
    workingDirectory: "/repo",
    accessIntents: [{}],
    policy: { sandboxRoots: ["/repo"] },
  } as never);
  assert.equal(malformedIntent.ok, false);
  assert.equal(malformedIntent.error.code, "INVALID_ACCESS_INTENT");

  const malformedSandboxRoots = enforceShellSandbox({
    command: "pwd",
    workingDirectory: "/repo",
    policy: { sandboxRoots: [{}] },
  } as never);
  assert.equal(malformedSandboxRoots.ok, false);
  assert.equal(malformedSandboxRoots.error.code, "MISSING_SANDBOX_ROOT");

  const malformedMetadata = enforceShellSandbox({
    command: "pwd",
    workingDirectory: "/repo",
    policy: { sandboxRoots: ["/repo"] },
    context: { auditMetadata: "not-metadata" },
  } as never);
  assert.equal(malformedMetadata.ok, true);
  assert.equal("0" in malformedMetadata.audit[0].metadata, false);
});

test("shellSandboxEnforcementHandler and registry expose the runtime-mounted handler", async () => {
  const direct = await shellSandboxEnforcementHandler.invoke({
    toolCallId: "shell-sandbox-handler",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      command: "pwd",
      workingDirectory: "/repo",
      policy: { sandboxRoots: ["/repo"] },
      context: { grantedPermissions: ["shell:sandbox"] },
    },
    executor: {},
  });
  assert.equal(direct.ok, true);
  assert.equal(direct.toolId, "shell.sandboxEnforcement");

  const registry = createBaseToolRegistry();
  const lookup = registry.lookupHandler("shell.sandboxEnforcement");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) {
    return;
  }

  const result = await lookup.handler.invoke({
    toolCallId: "shell-sandbox-registry",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      command: "pwd",
      workingDirectory: "/repo",
      policy: { sandboxRoots: ["/repo"] },
      preferredProvider: "openai",
    },
    executor: {},
  });
  assert.equal(result.ok, true);
  assert.equal(result.toolId, "shell.sandboxEnforcement");

  const selection = selectShellSandboxEnforcementPractice({ preferredProvider: "openai", provider: () => ({}) });
  assert.equal(selection.providerName, "openai");
});

test("shellSandboxEnforcementHandler returns public-safe errors for malformed handler input", async () => {
  const result = await shellSandboxEnforcementHandler.invoke({
    toolCallId: "shell-sandbox-null-input",
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

test("shell.sandboxEnforcement can call a runtime shell guard port through the registry", async () => {
  const registry = createBaseToolRegistry();
  const lookup = registry.lookupHandler("shell.sandboxEnforcement");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) {
    return;
  }

  let seen: {
    command?: string;
    workingDirectory?: string;
    requestedPaths?: readonly string[];
    sandboxRoots?: readonly string[];
  } = {};
  const result = await lookup.handler.invoke({
    toolCallId: "shell-sandbox-real",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      command: "  npm test  ",
      workingDirectory: "/repo/app/..",
      requestedPaths: ["/repo/app/../package.json"],
      accessIntents: ["read", "execute"],
      policy: { sandboxRoots: ["/repo/app/.."] },
      context: {
        dryRun: false,
        guard: { allowed: true },
        grantedPermissions: ["shell:sandbox"],
      },
    },
    executor: {
      shell: {
        enforceSandbox: async (request) => {
          seen = {
            command: request.command,
            workingDirectory: request.workingDirectory,
            requestedPaths: request.requestedPaths,
            sandboxRoots: request.policy?.sandboxRoots as readonly string[] | undefined,
          };
          return {
            ok: true,
            output: {
              workingDirectory: "/tmp",
              sandboxRoots: ["/"],
              requestedPaths: ["/etc/passwd"],
              decision: "enforced",
              reasons: ["runtime sandbox policy accepted the scope"],
              requiresTapApproval: false,
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
    workingDirectory: "/repo",
    requestedPaths: ["/repo/package.json"],
    sandboxRoots: ["/repo"],
  });
  assert.equal((result.output as { command: string }).command, "npm test");
  assert.equal((result.output as { workingDirectory: string }).workingDirectory, "/repo");
  assert.deepEqual((result.output as { sandboxRoots: readonly string[] }).sandboxRoots, ["/repo"]);
  assert.deepEqual((result.output as { requestedPaths: readonly string[] }).requestedPaths, ["/repo/package.json"]);
  assert.equal(output.dryRun, false);
  assert.equal(output.providerCalled, true);
  assert.equal(output.decision, "enforced");
  assert.equal((result.output as { baseToolAppliedSandbox: boolean }).baseToolAppliedSandbox, false);
  assert.equal((result.output as { unsafeSideEffects: boolean }).unsafeSideEffects, false);
  assert.equal(result.events[0], "basicTool.shell.sandboxEnforcement.providerCalled");
});

test("shell.sandboxEnforcement sends normalized provider input and preserves sandbox identity", async () => {
  let seen: {
    command?: string;
    workingDirectory?: string;
    requestedPaths?: readonly string[];
    sandboxRoots?: readonly string[];
  } = {};
  const result = await executeShellSandboxEnforcement({
    command: "  npm test  ",
    workingDirectory: "/repo/app/..",
    requestedPaths: ["/repo/app/../secret"],
    policy: { sandboxRoots: ["/repo/app/.."] },
    context: { dryRun: false, guard: { allowed: true }, grantedPermissions: ["shell:sandbox"] },
    provider: async (request) => {
      seen = {
        command: request.command,
        workingDirectory: request.workingDirectory,
        requestedPaths: request.requestedPaths,
        sandboxRoots: request.policy?.sandboxRoots,
      };
      return {
        workingDirectory: "/tmp",
        sandboxRoots: ["/"],
        requestedPaths: ["/etc/passwd"],
        decision: "requires-approval",
        reasons: ["runtime provider requires a wider approval"],
        requiresTapApproval: true,
        unsafeSideEffects: true,
      } as never;
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(seen, {
    command: "npm test",
    workingDirectory: "/repo",
    requestedPaths: ["/repo/secret"],
    sandboxRoots: ["/repo"],
  });
  if (result.ok) {
    assert.equal(result.output.kind, "agentCore.basicTool.shell.sandboxEnforcement");
    assert.equal(result.output.command, "npm test");
    assert.equal(result.output.workingDirectory, "/repo");
    assert.deepEqual(result.output.sandboxRoots, ["/repo"]);
    assert.deepEqual(result.output.requestedPaths, ["/repo/secret"]);
    assert.equal(result.output.decision, "requires-approval");
    assert.equal(result.output.baseToolAppliedSandbox, false);
    assert.equal(result.output.unsafeSideEffects, false);
  }
});

test("shell.sandboxEnforcement reports missing provider and missing or denied governance before runtime dispatch", async () => {
  const registry = createBaseToolRegistry();
  const lookup = registry.lookupHandler("shell.sandboxEnforcement");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) {
    return;
  }

  const input = {
    command: "pwd",
    workingDirectory: "/repo",
    policy: { sandboxRoots: ["/repo"] },
    context: { dryRun: false, guard: { allowed: true }, grantedPermissions: ["shell:sandbox"] as const },
  };

  const missingProvider = await lookup.handler.invoke({
    toolCallId: "shell-sandbox-missing-provider",
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
    toolCallId: "shell-sandbox-denied",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: { ...input, context: { ...input.context, guard: { allowed: false } } },
    executor: {
      shell: {
        enforceSandbox: async () => {
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
    toolCallId: "shell-sandbox-missing-guard",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: { ...input, context: { dryRun: false, grantedPermissions: ["shell:sandbox"] as const } },
    executor: {
      shell: {
        enforceSandbox: async () => {
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
    toolCallId: "shell-sandbox-malformed-guard",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: { ...input, context: { ...input.context, guard: "yes" } as never },
    executor: {
      shell: {
        enforceSandbox: async () => ({ ok: true, output: {} }),
      },
    },
  });
  assert.equal(malformedGuard.ok, false);
  if (!malformedGuard.ok) {
    assert.equal(malformedGuard.error.code, "GOVERNANCE_REJECTED");
  }

  providerCalled = false;
  const conflictingGuard = await lookup.handler.invoke({
    toolCallId: "shell-sandbox-conflicting-guard",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: { ...input, context: { ...input.context, guard: { allowed: false, accepted: true } } },
    executor: {
      shell: {
        enforceSandbox: async () => {
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

test("shell.sandboxEnforcement maps runtime provider failures to public-safe provider errors", async () => {
  const registry = createBaseToolRegistry();
  const lookup = registry.lookupHandler("shell.sandboxEnforcement");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) {
    return;
  }

  const result = await lookup.handler.invoke({
    toolCallId: "shell-sandbox-provider-failure",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      command: "pwd",
      workingDirectory: "/repo",
      policy: { sandboxRoots: ["/repo"] },
      context: { dryRun: false, guard: { allowed: true }, grantedPermissions: ["shell:sandbox"] },
    },
    executor: {
      shell: {
        enforceSandbox: async () => ({
          ok: false,
          error: { code: "RUNTIME_SANDBOX_FAILED", message: "runtime rejected sandbox", publicSafe: true },
        }),
      },
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_REJECTED");
    assert.match(result.error.message, /runtime rejected sandbox/);
  }

  const thrown = await executeShellSandboxEnforcement({
    command: "pwd",
    workingDirectory: "/repo",
    policy: { sandboxRoots: ["/repo"] },
    context: { dryRun: false, guard: { allowed: true }, grantedPermissions: ["shell:sandbox"] },
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
