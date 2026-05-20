import assert from "node:assert/strict";
import test from "node:test";

import type { BaseToolExecutorPort } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import { executeShellExecutionMonitoring } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/shellBase/shellInteraction/shell.executionMonitoring.js";
import { executeShellInteractiveControl } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/shellBase/shellInteraction/shell.interactiveControl.js";
import { captureShellOutput, executeShellOutputCapture } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/shellBase/shellInteraction/shell.outputCapture.js";
import { executeShellPromptHandling } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/shellBase/shellInteraction/shell.promptHandling.js";
import { executeShellStdinFeeding } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/shellBase/shellInteraction/shell.stdinFeeding.js";

const validInputs = {
  "shell.executionMonitoring": {
    target: { sessionId: "shell-session-1" },
    observation: { state: "running", observedAtMs: 100, lastActivityAtMs: 100 },
    context: {
      dryRun: false,
      guard: { allowed: true },
      grantedPermissions: ["shell:execution:monitor"],
      allowedSessionIds: ["shell-session-1"],
    },
  },
  "shell.interactiveControl": {
    target: { sessionId: "shell-session-1", action: "send-input", input: "ok" },
    context: {
      dryRun: false,
      guard: { allowed: true },
      grantedPermissions: ["shell:interactive:control"],
      allowedSessionIds: ["shell-session-1"],
    },
  },
  "shell.promptHandling": {
    target: { sessionId: "shell-session-1", promptText: "Continue?", action: "observe" },
    context: {
      dryRun: false,
      guard: { allowed: true },
      grantedPermissions: ["shell:prompt:handle"],
      allowedSessionIds: ["shell-session-1"],
    },
  },
  "shell.stdinFeeding": {
    target: { sessionId: "shell-session-1", input: "ok" },
    context: {
      dryRun: false,
      guard: { allowed: true },
      grantedPermissions: ["shell:stdin:feed"],
      allowedSessionIds: ["shell-session-1"],
    },
  },
  "shell.outputCapture": {
    target: { sessionId: "shell-session-1", chunks: [{ stream: "stdout", text: "ok" }] },
    context: {
      dryRun: false,
      guard: { allowed: true },
      grantedPermissions: ["shell:output:capture"],
      allowedSessionIds: ["shell-session-1"],
    },
  },
} as const;

const providerFailureExecutors: Readonly<Record<keyof typeof validInputs, BaseToolExecutorPort>> = {
  "shell.executionMonitoring": { shell: { monitorExecution: async () => { throw new Error("monitor failed"); } } },
  "shell.interactiveControl": { shell: { controlInteractive: async () => { throw new Error("control failed"); } } },
  "shell.promptHandling": { shell: { handlePrompt: async () => { throw new Error("prompt failed"); } } },
  "shell.stdinFeeding": { shell: { feedStdin: async () => { throw new Error("stdin failed"); } } },
  "shell.outputCapture": { shell: { captureOutput: async () => { throw new Error("capture failed"); } } },
};

const malformedSuccessExecutors: Readonly<Record<keyof typeof validInputs, BaseToolExecutorPort>> = {
  "shell.executionMonitoring": {
    shell: {
      monitorExecution: async () => ({
        ok: true as const,
        output: { observation: { state: "running", stdoutBytes: -1 }, health: "nonsense", realProcessReadBlocked: false },
      }),
    },
  },
  "shell.interactiveControl": { shell: { controlInteractive: async () => ({ ok: true as const, output: { controlBlocked: true } }) } },
  "shell.promptHandling": { shell: { handlePrompt: async () => ({ ok: true as const, output: { stdinWriteBlocked: false } }) } },
  "shell.stdinFeeding": { shell: { feedStdin: async () => ({ ok: true as const, output: {} }) } },
  "shell.outputCapture": {
    shell: {
      captureOutput: async () => ({
        ok: true as const,
        output: { chunks: [{ stream: "stdout", text: 1 }], totalBytes: 1, realBufferReadBlocked: false },
      }),
    },
  },
};

function createCountingSuccessExecutor(): { executor: BaseToolExecutorPort; calls: () => number } {
  let calls = 0;
  return {
    calls: () => calls,
    executor: {
      shell: {
        monitorExecution: async () => {
          calls += 1;
          return {
            ok: true as const,
            output: {
              target: { sessionId: "shell-session-1", processId: 2001 },
              observation: { state: "running", observedAtMs: 100, lastActivityAtMs: 100 },
              health: "healthy",
              realProcessReadBlocked: false,
            },
          };
        },
        controlInteractive: async () => {
          calls += 1;
          return { ok: true as const, output: { controlBlocked: false } };
        },
        handlePrompt: async () => {
          calls += 1;
          return { ok: true as const, output: { stdinWriteBlocked: true } };
        },
        feedStdin: async () => {
          calls += 1;
          return { ok: true as const, output: { stdinWriteBlocked: false, resultEnvelope: { planned: false, bytesWritten: 2 } } };
        },
        captureOutput: async () => {
          calls += 1;
          return {
            ok: true as const,
            output: {
              streams: ["stdout"],
              chunks: [{ stream: "stdout", text: "ok", bytes: 2 }],
              totalBytes: 2,
              truncated: false,
              realBufferReadBlocked: false,
            },
          };
        },
      },
    },
  };
}

async function invoke(toolId: string, input: unknown, executor: BaseToolExecutorPort = {}) {
  const registry = createBaseToolRegistry();
  const lookup = registry.lookupHandler(toolId);
  assert.equal(lookup.ok, true);
  if (!lookup.ok) {
    throw new Error(`missing handler ${toolId}`);
  }

  return lookup.handler.invoke({
    toolCallId: `${toolId}:boundary`,
    runtimeId: "runtime-1",
    sessionId: "agent-session-1",
    input,
    executor,
  });
}

const directExecuteCases = [
  { toolId: "shell.executionMonitoring", execute: executeShellExecutionMonitoring },
  { toolId: "shell.interactiveControl", execute: executeShellInteractiveControl },
  { toolId: "shell.outputCapture", execute: executeShellOutputCapture },
  { toolId: "shell.promptHandling", execute: executeShellPromptHandling },
  { toolId: "shell.stdinFeeding", execute: executeShellStdinFeeding },
] as const;

for (const directCase of directExecuteCases) {
  test(`${directCase.toolId} direct execute(null) returns public-safe input error without throwing`, async () => {
    await assert.doesNotReject(async () => {
      const result = await directCase.execute(null as never);
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.publicSafe, true);
        assert.equal(result.error.internalDetailExposed, false);
      }
    });

    for (const malformedRequest of [1, "bad", []]) {
      await assert.doesNotReject(() => directCase.execute(malformedRequest as never));
    }
  });
}

test("captureShellOutput(null) returns public-safe input error without throwing", () => {
  let result: ReturnType<typeof captureShellOutput> | undefined;
  assert.doesNotThrow(() => {
    result = captureShellOutput(null as never);
  });

  assert.equal(result?.ok, false);
  if (result !== undefined && !result.ok) {
    assert.equal(result.error.code, "MISSING_SESSION_ID");
    assert.equal(result.error.publicSafe, true);
    assert.equal(result.error.internalDetailExposed, false);
  }
});

for (const toolId of Object.keys(validInputs) as (keyof typeof validInputs)[]) {
  test(`${toolId} dry-run succeeds without a provider`, async () => {
    const input = {
      ...validInputs[toolId],
      context: { ...validInputs[toolId].context, dryRun: true },
    };
    const result = await invoke(toolId, input);

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal((result.output as { dryRun: boolean }).dryRun, true);
    }
  });

  test(`${toolId} rejects malformed or missing guard before provider dispatch`, async () => {
    const input = {
      ...validInputs[toolId],
      context: { ...validInputs[toolId].context, guard: { allowed: "yes" } },
    };
    const result = await invoke(toolId, input, providerFailureExecutors[toolId]);

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, "GOVERNANCE_REJECTED");
      assert.equal(result.error.publicSafe, true);
    }
  });

  test(`${toolId} maps provider failure to a public-safe provider error`, async () => {
    const result = await invoke(toolId, validInputs[toolId], providerFailureExecutors[toolId]);

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, "PROVIDER_REJECTED");
      assert.equal(result.error.publicSafe, true);
    }
  });

  test(`${toolId} rejects malformed provider success output without reporting real success`, async () => {
    const result = await invoke(toolId, validInputs[toolId], malformedSuccessExecutors[toolId]);

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, "PROVIDER_REJECTED");
      assert.equal(result.error.publicSafe, true);
    }
  });

  test(`${toolId} does not expose provider exception internals as public error text`, async () => {
    const secretExecutor: BaseToolExecutorPort = {
      shell: {
        monitorExecution: async () => { throw new Error("internal fd 17 /tmp/secret-token failed"); },
        controlInteractive: async () => { throw new Error("internal fd 17 /tmp/secret-token failed"); },
        handlePrompt: async () => { throw new Error("internal fd 17 /tmp/secret-token failed"); },
        feedStdin: async () => { throw new Error("internal fd 17 /tmp/secret-token failed"); },
        captureOutput: async () => { throw new Error("internal fd 17 /tmp/secret-token failed"); },
      },
    };
    const result = await invoke(toolId, validInputs[toolId], secretExecutor);

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, "PROVIDER_REJECTED");
      assert.equal(result.error.publicSafe, true);
      assert.equal(result.error.message.includes("/tmp/secret-token"), false);
      assert.equal(result.error.message.includes("fd 17"), false);
    }
  });

  test(`${toolId} rejects malformed context.runtimeId without throwing`, async () => {
    const input = {
      ...validInputs[toolId],
      context: { ...validInputs[toolId].context, runtimeId: 1 },
    };
    const result = await invoke(toolId, input, providerFailureExecutors[toolId]);

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, "INVALID_RUNTIME_ID");
      assert.equal(result.error.publicSafe, true);
    }
  });

  test(`${toolId} rejects malformed allowedSessionIds before provider dispatch`, async () => {
    for (const allowedSessionIds of [{}, ["shell-session-1", 1]]) {
      const counter = createCountingSuccessExecutor();
      const result = await invoke(
        toolId,
        {
          ...validInputs[toolId],
          context: { ...validInputs[toolId].context, allowedSessionIds },
        },
        counter.executor,
      );

      assert.equal(result.ok, false);
      assert.equal(counter.calls(), 0);
      if (!result.ok) {
        assert.equal(result.error.code, "SCOPE_REJECTED");
        assert.equal(result.error.publicSafe, true);
      }
    }
  });
}

test("shell.outputCapture rejects malformed redactionPatterns before provider dispatch", async () => {
  for (const redactionPatterns of [{}, [1], ["["]]) {
    const counter = createCountingSuccessExecutor();
    const result = await invoke(
      "shell.outputCapture",
      {
        ...validInputs["shell.outputCapture"],
        target: { ...validInputs["shell.outputCapture"].target, redactionPatterns },
      },
      counter.executor,
    );

    assert.equal(result.ok, false);
    assert.equal(counter.calls(), 0);
    if (!result.ok) {
      assert.equal(result.error.code, "INVALID_REDACTION_PATTERN");
      assert.equal(result.error.publicSafe, true);
    }
  }
});

test("shell.promptHandling rejects malformed options before provider dispatch", async () => {
  for (const options of [{}, [1], ["bad\0option"], ["x".repeat(257)]]) {
    const counter = createCountingSuccessExecutor();
    const result = await invoke(
      "shell.promptHandling",
      {
        ...validInputs["shell.promptHandling"],
        target: { ...validInputs["shell.promptHandling"].target, options },
      },
      counter.executor,
    );

    assert.equal(result.ok, false);
    assert.equal(counter.calls(), 0);
    if (!result.ok) {
      assert.equal(result.error.code, "INVALID_OPTION");
      assert.equal(result.error.publicSafe, true);
    }
  }
});

const malformedCases = [
  {
    toolId: "shell.executionMonitoring",
    input: { target: { processId: "bad" }, context: { dryRun: true } },
    code: "INVALID_PROCESS_ID",
  },
  {
    toolId: "shell.executionMonitoring",
    input: { target: { sessionId: "shell-session-1" }, observation: null, context: { dryRun: true } },
    code: "INVALID_OBSERVATION",
  },
  {
    toolId: "shell.interactiveControl",
    input: { target: { sessionId: "shell-session-1", action: "resize", terminalSize: { columns: "80", rows: 24 } }, context: { dryRun: true } },
    code: "INVALID_TERMINAL_SIZE",
  },
  {
    toolId: "shell.promptHandling",
    input: { target: { sessionId: "shell-session-1", promptText: "Password:", action: "respond", responseText: {} }, context: { dryRun: true, approval: { accepted: true } } },
    code: "MISSING_RESPONSE",
  },
  {
    toolId: "shell.stdinFeeding",
    input: { target: { sessionId: "shell-session-1", input: {} }, context: { dryRun: true } },
    code: "MISSING_INPUT",
  },
  {
    toolId: "shell.outputCapture",
    input: { target: { sessionId: "shell-session-1", chunks: {} }, context: { dryRun: true } },
    code: "INVALID_CHUNK",
  },
] as const;

for (const malformedCase of malformedCases) {
  test(`${malformedCase.toolId} returns ${malformedCase.code} for malformed JSON input`, async () => {
    const result = await invoke(malformedCase.toolId, malformedCase.input);

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, malformedCase.code);
      assert.equal(result.error.publicSafe, true);
    }
  });
}
