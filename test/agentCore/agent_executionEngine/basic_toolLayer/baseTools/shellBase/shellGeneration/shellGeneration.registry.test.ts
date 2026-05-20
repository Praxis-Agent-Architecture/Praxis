import assert from "node:assert/strict";
import test from "node:test";

import type { BaseToolExecutorPort } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";

const executor = {} satisfies BaseToolExecutorPort;

test("shellGeneration handlers are registered and invokable through the baseTool registry", async () => {
  const registry = createBaseToolRegistry();

  const argumentAssembly = registry.lookupHandler("shell.argumentAssembly");
  assert.equal(argumentAssembly.ok, true);
  assert.match(
    String(argumentAssembly.handler.definition.metadata?.storagePracticePath),
    /src\/storagePool\/baseToolStorage\/shellBase\/shellGeneration\/shell\.argumentAssembly\/bestPractice\.ts$/,
  );
  const assembled = await argumentAssembly.handler.invoke({
    toolCallId: "args-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: { executable: "npm", positional: ["test"] },
  });
  assert.equal(assembled.ok, true);
  const assembledOutput = assembled.output as { argv: readonly string[] };
  assert.deepEqual(assembledOutput.argv, ["npm", "test"]);
  const assembledAudit = assembled.metadata?.audit as readonly { metadata?: Record<string, unknown> }[];
  assert.equal(assembledAudit[0]?.metadata?.runtimeId, "runtime-1");
  assert.equal(assembledAudit[0]?.metadata?.sessionId, "session-1");
  assert.equal(assembledAudit[0]?.metadata?.toolCallId, "args-1");

  const commandGeneration = registry.lookupHandler("shell.commandGeneration");
  assert.equal(commandGeneration.ok, true);
  assert.match(
    String(commandGeneration.handler.definition.metadata?.storagePracticePath),
    /src\/storagePool\/baseToolStorage\/shellBase\/shellGeneration\/shell\.commandGeneration\/bestPractice\.ts$/,
  );
  const command = await commandGeneration.handler.invoke({
    toolCallId: "command-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: { argv: ["npm", "test"], shell: "bash" },
  });
  assert.equal(command.ok, true);
  const commandOutput = command.output as { commandLine: string };
  assert.equal(commandOutput.commandLine, "npm test");

  const executionGuard = registry.lookupHandler("shell.executionGuard");
  assert.equal(executionGuard.ok, true);
  assert.match(
    String(executionGuard.handler.definition.metadata?.storagePracticePath),
    /src\/storagePool\/baseToolStorage\/shellBase\/shellGeneration\/shell\.executionGuard\/bestPractice\.ts$/,
  );
  const guard = await executionGuard.handler.invoke({
    toolCallId: "guard-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: { generatedCommand: command.output as never },
  });
  assert.equal(guard.ok, true);
  const guardOutput = guard.output as { verdict: string };
  assert.equal(guardOutput.verdict, "allowed");

  const invocationConstruction = registry.lookupHandler("shell.invocationConstruction");
  assert.equal(invocationConstruction.ok, true);
  assert.match(
    String(invocationConstruction.handler.definition.metadata?.storagePracticePath),
    /src\/storagePool\/baseToolStorage\/shellBase\/shellGeneration\/shell\.invocationConstruction\/bestPractice\.ts$/,
  );
  const invocation = await invocationConstruction.handler.invoke({
    toolCallId: "invocation-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: { generatedCommand: command.output as never, executionGuard: guard.output as never },
  });
  assert.equal(invocation.ok, true);
  const invocationOutput = invocation.output as { kind: string; invocationId: string };
  assert.equal(invocationOutput.kind, "agentCore.basicTool.shell.invocation");
  assert.equal(invocationOutput.invocationId, "invocation-1");

  const scriptGeneration = registry.lookupHandler("shell.scriptGeneration");
  assert.equal(scriptGeneration.ok, true);
  assert.match(
    String(scriptGeneration.handler.definition.metadata?.storagePracticePath),
    /src\/storagePool\/baseToolStorage\/shellBase\/shellGeneration\/shell\.scriptGeneration\/bestPractice\.ts$/,
  );
  const script = await scriptGeneration.handler.invoke({
    toolCallId: "script-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: { target: { commands: ["npm test"] } },
  });
  assert.equal(script.ok, true);
  const scriptOutput = script.output as { script: string };
  assert.match(scriptOutput.script, /npm test/);
});

test("shellGeneration registry handlers return public errors for malformed JSON input", async () => {
  const registry = createBaseToolRegistry();

  const argumentAssembly = registry.lookupHandler("shell.argumentAssembly");
  assert.equal(argumentAssembly.ok, true);
  const badArgumentAssembly = await argumentAssembly.handler.invoke({
    toolCallId: "bad-args",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: { executable: 1 } as never,
  });
  assert.equal(badArgumentAssembly.ok, false);
  assert.equal(badArgumentAssembly.error.publicSafe, true);
  assert.equal(badArgumentAssembly.error.code, "INVALID_ARGUMENT");

  const nullArgumentAssembly = await argumentAssembly.handler.invoke({
    toolCallId: "null-args",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: null as never,
  });
  assert.equal(nullArgumentAssembly.ok, false);
  assert.equal(nullArgumentAssembly.error.publicSafe, true);

  const commandGeneration = registry.lookupHandler("shell.commandGeneration");
  assert.equal(commandGeneration.ok, true);
  const badCommand = await commandGeneration.handler.invoke({
    toolCallId: "bad-command",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: { argv: {} } as never,
  });
  assert.equal(badCommand.ok, false);
  assert.equal(badCommand.error.code, "INVALID_ARGUMENT_VECTOR");

  const executionGuard = registry.lookupHandler("shell.executionGuard");
  assert.equal(executionGuard.ok, true);
  const badGuard = await executionGuard.handler.invoke({
    toolCallId: "bad-guard",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: { command: 1 } as never,
  });
  assert.equal(badGuard.ok, false);
  assert.equal(badGuard.error.code, "INVALID_COMMAND");

  const invocationConstruction = registry.lookupHandler("shell.invocationConstruction");
  assert.equal(invocationConstruction.ok, true);
  const badInvocation = await invocationConstruction.handler.invoke({
    toolCallId: "bad-invocation",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: {
      generatedCommand: { commandLine: "pwd", argv: {}, shell: "bash", executable: "pwd", environmentKeys: [] },
      executionGuard: { verdict: "allowed", requiresTapApproval: false },
    } as never,
  });
  assert.equal(badInvocation.ok, false);
  assert.equal(badInvocation.error.code, "INVALID_COMMAND");

  const scriptGeneration = registry.lookupHandler("shell.scriptGeneration");
  assert.equal(scriptGeneration.ok, true);
  const badScript = await scriptGeneration.handler.invoke({
    toolCallId: "bad-script",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: { target: { commands: [{}] } } as never,
  });
  assert.equal(badScript.ok, false);
  assert.equal(badScript.error.code, "INVALID_COMMAND");
});

test("shellGeneration registry handlers do not use provider path without guard and injected provider", async () => {
  const registry = createBaseToolRegistry();

  const commandGeneration = registry.lookupHandler("shell.commandGeneration");
  assert.equal(commandGeneration.ok, true);

  const missingGuard = await commandGeneration.handler.invoke({
    toolCallId: "command-real-missing-guard",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: { argv: ["pwd"], context: { dryRun: false } },
  });
  assert.equal(missingGuard.ok, false);
  assert.equal(missingGuard.error.code, "GOVERNANCE_REJECTED");
  assert.equal(missingGuard.error.publicSafe, true);

  const missingProvider = await commandGeneration.handler.invoke({
    toolCallId: "command-real-missing-provider",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: { argv: ["pwd"], context: { dryRun: false, guard: { allowed: true } } },
  });
  assert.equal(missingProvider.ok, false);
  assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
  assert.equal(missingProvider.error.publicSafe, true);
});

test("shellGeneration registry handlers can invoke runtime-provided generation providers", async () => {
  const registry = createBaseToolRegistry();
  const providerCalls: string[] = [];
  const providerInputKeys: Record<string, readonly string[]> = {};
  const assertRuntimeProviderInput = (
    tool: string,
    request: { input: Readonly<Record<string, unknown>> },
  ) => {
    providerInputKeys[tool] = Object.keys(request.input).sort();
    assert.equal(Object.hasOwn(request.input, "executor"), false);
    assert.equal(Object.hasOwn(request.input, "provider"), false);
    assert.equal(Object.hasOwn(request.input, "preferredProvider"), false);
  };
  const providerExecutor = {
    shell: {
      async assembleArguments(request) {
        providerCalls.push("assembleArguments");
        assertRuntimeProviderInput("assembleArguments", request);
        return {
          ok: true,
          output: {
            kind: "agentCore.basicTool.shell.argumentAssembly",
            executable: "printf",
            argv: ["printf", "ok"],
            renderedTokens: [],
            redactedPreview: ["printf", "ok"],
            requiredPermission: "shell:generate",
            dryRun: true,
            providerCalled: false,
            executionBlocked: true,
            unsafeSideEffects: false,
          },
        } as const;
      },
      async generateCommand(request) {
        providerCalls.push("generateCommand");
        assertRuntimeProviderInput("generateCommand", request);
        return {
          ok: true,
          output: {
            kind: "agentCore.basicTool.shell.commandGeneration",
            shell: "bash",
            commandLine: "printf ok",
            argv: ["printf", "ok"],
            executable: "printf",
            environmentKeys: [],
            requiredPermission: "shell:generate",
            dryRun: true,
            providerCalled: false,
            executionBlocked: true,
            unsafeSideEffects: false,
          },
        } as const;
      },
      async buildExecutionGuard(request) {
        providerCalls.push("buildExecutionGuard");
        assertRuntimeProviderInput("buildExecutionGuard", request);
        return {
          ok: true,
          output: {
            kind: "agentCore.basicTool.shell.executionGuard",
            command: "printf ok",
            argv: ["printf", "ok"],
            verdict: "allowed",
            reasons: ["runtime provider allowed generated command"],
            requiredPermissions: ["shell:generate"],
            requiresTapApproval: false,
            dryRun: true,
            providerCalled: false,
            executionBlocked: true,
            unsafeSideEffects: false,
          },
        } as const;
      },
      async constructInvocation(request) {
        providerCalls.push("constructInvocation");
        assertRuntimeProviderInput("constructInvocation", request);
        return {
          ok: true,
          output: {
            kind: "agentCore.basicTool.shell.invocation",
            invocationId: "runtime-invocation",
            runtimeId: "runtime-1",
            sessionId: "session-1",
            shell: "bash",
            commandLine: "printf ok",
            argv: ["printf", "ok"],
            executable: "printf",
            environmentKeys: [],
            guardVerdict: "allowed",
            approvalRequired: false,
            status: "planned",
            metadata: {},
            dryRun: true,
            providerCalled: false,
            executionBlocked: true,
            unsafeSideEffects: false,
          },
        } as const;
      },
      async generateScript(request) {
        providerCalls.push("generateScript");
        assertRuntimeProviderInput("generateScript", request);
        return {
          ok: true,
          output: {
            kind: "agentCore.basicTool.shell.scriptGeneration",
            target: { shell: "bash", commands: ["printf ok"] },
            script: "#!/usr/bin/env bash\nprintf ok\n",
            commandPreview: ["printf ok"],
            lineCount: 2,
            requiredPermission: "shell:script:generate",
            requiresTapApproval: false,
            dryRun: true,
            providerCalled: false,
            executionBlocked: true,
            unsafeSideEffects: false,
          },
        } as const;
      },
    },
  } satisfies BaseToolExecutorPort;

  const argumentAssembly = registry.lookupHandler("shell.argumentAssembly");
  assert.equal(argumentAssembly.ok, true);
  const assembled = await argumentAssembly.handler.invoke({
    toolCallId: "provider-args",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor: providerExecutor,
    input: { executable: "ignored", context: { dryRun: false, guard: { allowed: true } } },
  });
  assert.equal(assembled.ok, true);
  assert.equal((assembled.output as { providerCalled: boolean; dryRun: boolean }).providerCalled, true);
  assert.equal((assembled.output as { providerCalled: boolean; dryRun: boolean }).dryRun, false);

  const commandGeneration = registry.lookupHandler("shell.commandGeneration");
  assert.equal(commandGeneration.ok, true);
  const command = await commandGeneration.handler.invoke({
    toolCallId: "provider-command",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor: providerExecutor,
    input: { argv: ["ignored"], context: { dryRun: false, guard: { accepted: true } } },
  });
  assert.equal(command.ok, true);
  assert.equal((command.output as { providerCalled: boolean }).providerCalled, true);

  const executionGuard = registry.lookupHandler("shell.executionGuard");
  assert.equal(executionGuard.ok, true);
  const guard = await executionGuard.handler.invoke({
    toolCallId: "provider-guard",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor: providerExecutor,
    input: { command: "ignored", context: { dryRun: false, guard: { allowed: true } } },
  });
  assert.equal(guard.ok, true);
  assert.equal((guard.output as { providerCalled: boolean }).providerCalled, true);

  const invocationConstruction = registry.lookupHandler("shell.invocationConstruction");
  assert.equal(invocationConstruction.ok, true);
  const invocation = await invocationConstruction.handler.invoke({
    toolCallId: "provider-invocation",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor: providerExecutor,
    input: {
      generatedCommand: command.output as never,
      executionGuard: guard.output as never,
      context: { dryRun: false, guard: { accepted: true } },
    },
  });
  assert.equal(invocation.ok, true);
  assert.equal((invocation.output as { providerCalled: boolean }).providerCalled, true);

  const scriptGeneration = registry.lookupHandler("shell.scriptGeneration");
  assert.equal(scriptGeneration.ok, true);
  const script = await scriptGeneration.handler.invoke({
    toolCallId: "provider-script",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor: providerExecutor,
    input: { target: { commands: ["ignored"] }, context: { dryRun: false, guard: { allowed: true } } },
  });
  assert.equal(script.ok, true);
  assert.equal((script.output as { providerCalled: boolean }).providerCalled, true);

  assert.deepEqual(providerCalls, [
    "assembleArguments",
    "generateCommand",
    "buildExecutionGuard",
    "constructInvocation",
    "generateScript",
  ]);
  assert.deepEqual(providerInputKeys, {
    assembleArguments: ["executable"],
    generateCommand: ["argv"],
    buildExecutionGuard: ["command"],
    constructInvocation: ["executionGuard", "generatedCommand"],
    generateScript: ["target"],
  });
});

test("shellGeneration registry handlers reject malformed runtime provider output", async () => {
  const registry = createBaseToolRegistry();
  const malformedExecutor = {
    shell: {
      async assembleArguments() {
        return { ok: true, output: { kind: "agentCore.basicTool.shell.argumentAssembly" } };
      },
      async generateCommand() {
        return { ok: true, output: { kind: "agentCore.basicTool.shell.commandGeneration" } };
      },
      async buildExecutionGuard() {
        return { ok: true, output: { kind: "agentCore.basicTool.shell.executionGuard" } };
      },
      async constructInvocation() {
        return { ok: true, output: { kind: "agentCore.basicTool.shell.invocation" } };
      },
      async generateScript() {
        return { ok: true, output: { kind: "agentCore.basicTool.shell.scriptGeneration" } };
      },
    },
  } satisfies BaseToolExecutorPort;

  function assertProviderRejected(result: { ok: boolean; error?: { code: string; publicSafe: boolean } }) {
    assert.equal(result.ok, false);
    assert.equal(result.error?.code, "PROVIDER_REJECTED");
    assert.equal(result.error?.publicSafe, true);
  }

  const argumentAssembly = registry.lookupHandler("shell.argumentAssembly");
  assert.equal(argumentAssembly.ok, true);
  assertProviderRejected(
    await argumentAssembly.handler.invoke({
      toolCallId: "malformed-provider-args",
      runtimeId: "runtime-1",
      sessionId: "session-1",
      executor: malformedExecutor,
      input: { executable: "printf", context: { dryRun: false, guard: { allowed: true } } },
    }),
  );

  const commandGeneration = registry.lookupHandler("shell.commandGeneration");
  assert.equal(commandGeneration.ok, true);
  assertProviderRejected(
    await commandGeneration.handler.invoke({
      toolCallId: "malformed-provider-command",
      runtimeId: "runtime-1",
      sessionId: "session-1",
      executor: malformedExecutor,
      input: { argv: ["printf", "ok"], context: { dryRun: false, guard: { allowed: true } } },
    }),
  );

  const executionGuard = registry.lookupHandler("shell.executionGuard");
  assert.equal(executionGuard.ok, true);
  assertProviderRejected(
    await executionGuard.handler.invoke({
      toolCallId: "malformed-provider-guard",
      runtimeId: "runtime-1",
      sessionId: "session-1",
      executor: malformedExecutor,
      input: { command: "printf ok", context: { dryRun: false, guard: { allowed: true } } },
    }),
  );

  const invocationConstruction = registry.lookupHandler("shell.invocationConstruction");
  assert.equal(invocationConstruction.ok, true);
  assertProviderRejected(
    await invocationConstruction.handler.invoke({
      toolCallId: "malformed-provider-invocation",
      runtimeId: "runtime-1",
      sessionId: "session-1",
      executor: malformedExecutor,
      input: {
        generatedCommand: {
          kind: "agentCore.basicTool.shell.commandGeneration",
          shell: "bash",
          commandLine: "printf ok",
          argv: ["printf", "ok"],
          executable: "printf",
          environmentKeys: [],
          requiredPermission: "shell:generate",
          dryRun: false,
          providerCalled: true,
          executionBlocked: true,
          unsafeSideEffects: false,
        },
        executionGuard: {
          kind: "agentCore.basicTool.shell.executionGuard",
          command: "printf ok",
          argv: ["printf", "ok"],
          verdict: "allowed",
          reasons: [],
          requiredPermissions: ["shell:generate"],
          requiresTapApproval: false,
          dryRun: false,
          providerCalled: true,
          executionBlocked: true,
          unsafeSideEffects: false,
        },
        context: { dryRun: false, guard: { allowed: true } },
      },
    }),
  );

  const scriptGeneration = registry.lookupHandler("shell.scriptGeneration");
  assert.equal(scriptGeneration.ok, true);
  assertProviderRejected(
    await scriptGeneration.handler.invoke({
      toolCallId: "malformed-provider-script",
      runtimeId: "runtime-1",
      sessionId: "session-1",
      executor: malformedExecutor,
      input: { target: { commands: ["printf ok"] }, context: { dryRun: false, guard: { allowed: true } } },
    }),
  );
});
