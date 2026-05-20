import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import {
  executeShellCommandValidation,
  selectShellCommandValidationPractice,
  shellCommandValidationHandler,
  shellCommandValidationDescriptor,
  validateShellCommandSafety,
} from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/shellBase/executionGuard/shell.commandValidation.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_executionEngine/basic_toolLayer/baseTools/shellBase/executionGuard/shell.commandValidation.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/executionGuard/shell.commandValidation.md",
  testFileUrl: import.meta.url,
});

test("validateShellCommandSafety allows a simple audited dry-run command", () => {
  const result = validateShellCommandSafety({
    command: "pwd",
    workingDirectory: "/repo",
    shell: "bash",
    policy: { allowedCommands: ["pwd"] },
    context: { invocationId: "shell-validate-1", grantedPermissions: ["shell:validate"] },
  });

  assert.equal(result.ok, true);
  assert.equal(shellCommandValidationDescriptor.defaultDryRun, true);
  assert.equal(result.output.verdict, "allowed");
  assert.equal(result.output.requiresTapApproval, false);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.finalApprovalGranted, false);
  assert.equal(result.output.runtimeGuardRequired, true);
  assert.equal(result.output.unsafeSideEffects, false);
  assert.deepEqual(result.events, ["basicTool.shell.commandValidation.allowed"]);
});

test("validateShellCommandSafety distinguishes blocked and approval-required commands", () => {
  const blocked = validateShellCommandSafety({
    command: "rm -rf /",
    context: { grantedPermissions: ["shell:validate"] },
  });
  assert.equal(blocked.ok, true);
  assert.equal(blocked.output.verdict, "blocked");
  assert.equal(blocked.output.requiresTapApproval, true);
  assert.match(blocked.output.reasons.join("\n"), /blocked|denied/);

  const approval = validateShellCommandSafety({
    command: "echo a && echo b",
    context: { grantedPermissions: ["shell:validate"] },
  });
  assert.equal(approval.ok, true);
  assert.equal(approval.output.verdict, "requires-approval");
  assert.equal(approval.output.requiresTapApproval, true);
});

test("validateShellCommandSafety rejects empty command, missing permission, and real execution", () => {
  const empty = validateShellCommandSafety();
  assert.equal(empty.ok, false);
  assert.equal(empty.error.code, "MISSING_COMMAND");
  assert.equal(empty.error.boundary, "input");

  const permission = validateShellCommandSafety({
    command: "pwd",
    context: { grantedPermissions: [] },
  });
  assert.equal(permission.ok, false);
  assert.equal(permission.error.code, "PERMISSION_DENIED");
  assert.equal(permission.error.boundary, "permission");

  const real = validateShellCommandSafety({
    command: "pwd",
    context: { dryRun: false },
  });
  assert.equal(real.ok, false);
  assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
  assert.equal(real.error.boundary, "contract");
});

test("validateShellCommandSafety returns public-safe errors for malformed runtime JSON shapes", () => {
  const malformedCommand = validateShellCommandSafety({
    command: 1,
    context: { runtimeId: 1 },
  } as never);
  assert.equal(malformedCommand.ok, false);
  assert.equal(malformedCommand.error.code, "MISSING_COMMAND");
  assert.equal(malformedCommand.error.safeForRuntimeInspection, true);

  const malformedPolicy = validateShellCommandSafety({
    command: "pwd",
    shell: "fish",
    policy: { deniedPatterns: [null] },
  } as never);
  assert.equal(malformedPolicy.ok, false);
  assert.equal(malformedPolicy.error.code, "INVALID_SHELL");

  const malformedMetadata = validateShellCommandSafety({
    command: "pwd",
    context: { auditMetadata: "not-metadata" },
  } as never);
  assert.equal(malformedMetadata.ok, true);
  assert.equal("0" in malformedMetadata.audit[0].metadata, false);
});

test("shellCommandValidationHandler and registry expose the runtime-mounted handler", async () => {
  const direct = await shellCommandValidationHandler.invoke({
    toolCallId: "shell-validate-handler",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      command: "pwd",
      context: { grantedPermissions: ["shell:validate"] },
    },
    executor: {},
  });
  assert.equal(direct.ok, true);
  assert.equal(direct.toolId, "shell.commandValidation");

  const registry = createBaseToolRegistry();
  const lookup = registry.lookupHandler("shell.commandValidation");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) {
    return;
  }

  const result = await lookup.handler.invoke({
    toolCallId: "shell-validate-registry",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: { command: "echo ok", preferredProvider: "openai" },
    executor: {},
  });
  assert.equal(result.ok, true);
  assert.equal(result.toolId, "shell.commandValidation");

  const selection = selectShellCommandValidationPractice({ preferredProvider: "openai", provider: () => ({}) });
  assert.equal(selection.providerName, "openai");
  assert.equal(selection.practice.directCliSupport, true);
});

test("shellCommandValidationHandler returns public-safe errors for malformed handler input", async () => {
  const result = await shellCommandValidationHandler.invoke({
    toolCallId: "shell-validate-null-input",
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

test("shell.commandValidation can call a runtime shell guard port through the registry", async () => {
  const registry = createBaseToolRegistry();
  const lookup = registry.lookupHandler("shell.commandValidation");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) {
    return;
  }

  let seen: { command?: string; shell?: string } = {};
  const result = await lookup.handler.invoke({
    toolCallId: "shell-validate-real",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      command: "  npm test  ",
      shell: "bash",
      context: {
        dryRun: false,
        guard: { allowed: true },
        grantedPermissions: ["shell:validate"],
      },
    },
    executor: {
      shell: {
        validateCommand: async (request) => {
          seen = { command: request.command, shell: request.shell };
          return {
            ok: true,
            output: {
              command: "rm -rf /",
              verdict: request.command === "npm test" ? "allowed" : "blocked",
              reasons: ["runtime command policy accepted the command"],
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

  const output = result.output as { dryRun: boolean; providerCalled: boolean; verdict: string };
  assert.deepEqual(seen, { command: "npm test", shell: "bash" });
  assert.equal((result.output as { command: string }).command, "npm test");
  assert.equal(output.dryRun, false);
  assert.equal(output.providerCalled, true);
  assert.equal(output.verdict, "allowed");
  assert.equal((result.output as { finalApprovalGranted: boolean }).finalApprovalGranted, false);
  assert.equal((result.output as { unsafeSideEffects: boolean }).unsafeSideEffects, false);
  assert.equal(result.events[0], "basicTool.shell.commandValidation.providerCalled");
});

test("shell.commandValidation sends normalized provider input and preserves envelope identity", async () => {
  let seenCommand = "";
  const result = await executeShellCommandValidation({
    command: "  npm test  ",
    context: { dryRun: false, guard: { allowed: true }, grantedPermissions: ["shell:validate"] },
    provider: async (request) => {
      seenCommand = request.command ?? "";
      return {
        kind: "wrong",
        command: "rm -rf /",
        verdict: "blocked",
        reasons: ["runtime provider rejected the normalized command"],
        requiresTapApproval: true,
        unsafeSideEffects: true,
      } as never;
    },
  });

  assert.equal(result.ok, true);
  assert.equal(seenCommand, "npm test");
  if (result.ok) {
    assert.equal(result.output.kind, "agentCore.basicTool.shell.commandValidation");
    assert.equal(result.output.command, "npm test");
    assert.equal(result.output.verdict, "blocked");
    assert.equal(result.output.requiresTapApproval, true);
    assert.equal(result.output.unsafeSideEffects, false);
    assert.equal(result.output.finalApprovalGranted, false);
  }
});

test("shell.commandValidation reports missing provider and missing or denied governance before runtime dispatch", async () => {
  const registry = createBaseToolRegistry();
  const lookup = registry.lookupHandler("shell.commandValidation");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) {
    return;
  }

  const missingProvider = await lookup.handler.invoke({
    toolCallId: "shell-validate-missing-provider",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      command: "pwd",
      context: { dryRun: false, guard: { allowed: true }, grantedPermissions: ["shell:validate"] },
    },
    executor: {},
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
  }

  let providerCalled = false;
  const denied = await lookup.handler.invoke({
    toolCallId: "shell-validate-denied",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      command: "pwd",
      context: { dryRun: false, guard: { allowed: false }, grantedPermissions: ["shell:validate"] },
    },
    executor: {
      shell: {
        validateCommand: async () => {
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
    toolCallId: "shell-validate-missing-guard",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      command: "pwd",
      context: { dryRun: false, grantedPermissions: ["shell:validate"] },
    },
    executor: {
      shell: {
        validateCommand: async () => {
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
    toolCallId: "shell-validate-malformed-guard",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      command: "pwd",
      context: { dryRun: false, guard: "yes", grantedPermissions: ["shell:validate"] } as never,
    },
    executor: {
      shell: {
        validateCommand: async () => ({ ok: true, output: {} }),
      },
    },
  });
  assert.equal(malformedGuard.ok, false);
  if (!malformedGuard.ok) {
    assert.equal(malformedGuard.error.code, "GOVERNANCE_REJECTED");
  }

  providerCalled = false;
  const conflictingGuard = await lookup.handler.invoke({
    toolCallId: "shell-validate-conflicting-guard",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      command: "pwd",
      context: { dryRun: false, guard: { allowed: false, accepted: true }, grantedPermissions: ["shell:validate"] },
    },
    executor: {
      shell: {
        validateCommand: async () => {
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

test("shell.commandValidation maps runtime provider failures to public-safe provider errors", async () => {
  const registry = createBaseToolRegistry();
  const lookup = registry.lookupHandler("shell.commandValidation");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) {
    return;
  }

  const result = await lookup.handler.invoke({
    toolCallId: "shell-validate-provider-failure",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      command: "pwd",
      context: { dryRun: false, guard: { allowed: true }, grantedPermissions: ["shell:validate"] },
    },
    executor: {
      shell: {
        validateCommand: async () => ({
          ok: false,
          error: { code: "RUNTIME_VALIDATION_FAILED", message: "runtime rejected validation", publicSafe: true },
        }),
      },
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_REJECTED");
    assert.match(result.error.message, /runtime rejected validation/);
  }

  const thrown = await executeShellCommandValidation({
    command: "pwd",
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
