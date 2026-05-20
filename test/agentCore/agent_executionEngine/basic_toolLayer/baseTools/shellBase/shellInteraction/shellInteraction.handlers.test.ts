import assert from "node:assert/strict";
import test from "node:test";

import { createBaseToolRegistry } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";

const handlerCases = [
  {
    toolId: "shell.executionMonitoring",
    input: {
      target: { sessionId: "shell-session-1" },
      observation: { state: "running", observedAtMs: 100, lastActivityAtMs: 100 },
      context: {
        dryRun: false,
        guard: { allowed: true },
        grantedPermissions: ["shell:execution:monitor"],
        allowedSessionIds: ["shell-session-1"],
      },
    },
    shellExecutor: {
      monitorExecution: async () => ({
        ok: true as const,
        output: {
          target: { sessionId: "shell-session-1", processId: 1001 },
          observation: { state: "running", observedAtMs: 100, lastActivityAtMs: 100 },
          health: "healthy",
          realProcessReadBlocked: false,
        },
      }),
    },
    expectedEvent: "basicTool.shell.executionMonitoring.monitored",
  },
  {
    toolId: "shell.interactiveControl",
    input: {
      target: { sessionId: "shell-session-1", action: "send-input", input: "ok" },
      context: {
        dryRun: false,
        guard: { allowed: true },
        grantedPermissions: ["shell:interactive:control"],
        allowedSessionIds: ["shell-session-1"],
      },
    },
    shellExecutor: {
      controlInteractive: async () => ({
        ok: true as const,
        output: { controlBlocked: false },
      }),
    },
    expectedEvent: "basicTool.shell.interactiveControl.controlled",
  },
  {
    toolId: "shell.promptHandling",
    input: {
      target: { sessionId: "shell-session-1", promptText: "Continue?", action: "observe" },
      context: {
        dryRun: false,
        guard: { allowed: true },
        grantedPermissions: ["shell:prompt:handle"],
        allowedSessionIds: ["shell-session-1"],
      },
    },
    shellExecutor: {
      handlePrompt: async () => ({
        ok: true as const,
        output: { stdinWriteBlocked: true },
      }),
    },
    expectedEvent: "basicTool.shell.promptHandling.handled",
  },
  {
    toolId: "shell.stdinFeeding",
    input: {
      target: { sessionId: "shell-session-1", input: "ok" },
      context: {
        dryRun: false,
        guard: { allowed: true },
        grantedPermissions: ["shell:stdin:feed"],
        allowedSessionIds: ["shell-session-1"],
      },
    },
    shellExecutor: {
      feedStdin: async () => ({
        ok: true as const,
        output: { stdinWriteBlocked: false, resultEnvelope: { planned: false, bytesWritten: 2 } },
      }),
    },
    expectedEvent: "basicTool.shell.stdinFeeding.fed",
  },
  {
    toolId: "shell.outputCapture",
    input: {
      target: { sessionId: "shell-session-1", chunks: [{ stream: "stdout", text: "ok" }] },
      context: {
        dryRun: false,
        guard: { allowed: true },
        grantedPermissions: ["shell:output:capture"],
        allowedSessionIds: ["shell-session-1"],
      },
    },
    shellExecutor: {
      captureOutput: async () => ({
        ok: true as const,
        output: {
          streams: ["stdout"],
          chunks: [{ stream: "stdout", text: "ok", bytes: 2 }],
          totalBytes: 2,
          truncated: false,
          realBufferReadBlocked: false,
        },
      }),
    },
    expectedEvent: "basicTool.shell.outputCapture.captured",
  },
] as const;

for (const handlerCase of handlerCases) {
  test(`${handlerCase.toolId} is mounted in the registry and can call a runtime shell interaction port`, async () => {
    const registry = createBaseToolRegistry();
    const lookup = registry.lookupHandler(handlerCase.toolId);

    assert.equal(lookup.ok, true);
    if (!lookup.ok) {
      return;
    }

    const result = await lookup.handler.invoke({
      toolCallId: `${handlerCase.toolId}:call`,
      runtimeId: "runtime-1",
      sessionId: "session-1",
      input: handlerCase.input,
      executor: { shell: handlerCase.shellExecutor },
    });

    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }

    assert.equal(result.toolId, handlerCase.toolId);
    assert.equal(result.events[0], handlerCase.expectedEvent);
    assert.equal((result.output as { dryRun: boolean }).dryRun, false);
    assert.equal(result.metadata?.audit !== undefined, true);
  });

  test(`${handlerCase.toolId} reports missing provider and denied governance before runtime dispatch`, async () => {
    const registry = createBaseToolRegistry();
    const lookup = registry.lookupHandler(handlerCase.toolId);

    assert.equal(lookup.ok, true);
    if (!lookup.ok) {
      return;
    }

    const missingProvider = await lookup.handler.invoke({
      toolCallId: `${handlerCase.toolId}:missing-provider`,
      runtimeId: "runtime-1",
      sessionId: "session-1",
      input: handlerCase.input,
      executor: {},
    });

    assert.equal(missingProvider.ok, false);
    if (!missingProvider.ok) {
      assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
      assert.equal(missingProvider.error.publicSafe, true);
    }

    const denied = await lookup.handler.invoke({
      toolCallId: `${handlerCase.toolId}:denied`,
      runtimeId: "runtime-1",
      sessionId: "session-1",
      input: {
        ...handlerCase.input,
        context: {
          ...handlerCase.input.context,
          guard: { allowed: false },
        },
      },
      executor: { shell: handlerCase.shellExecutor },
    });

    assert.equal(denied.ok, false);
    if (!denied.ok) {
      assert.equal(denied.error.code, "GOVERNANCE_REJECTED");
      assert.equal(denied.error.publicSafe, true);
    }
  });
}
