import assert from "node:assert/strict";
import test from "node:test";

import type { BaseToolExecutorPort } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import {
  assembleShellArgumentsBestPractice,
  selectShellArgumentAssemblyPractice,
} from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/shellBase/shellGeneration/shell.argumentAssembly.js";
import {
  generateShellCommandBestPractice,
  selectShellCommandGenerationPractice,
} from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/shellBase/shellGeneration/shell.commandGeneration.js";
import {
  buildShellExecutionGuardBestPractice,
  selectShellExecutionGuardPractice,
} from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/shellBase/shellGeneration/shell.executionGuard.js";
import {
  constructShellInvocationBestPractice,
  selectShellInvocationConstructionPractice,
} from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/shellBase/shellGeneration/shell.invocationConstruction.js";
import {
  generateShellScriptPlanBestPractice,
  selectShellScriptGenerationPractice,
} from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/shellBase/shellGeneration/shell.scriptGeneration.js";

test("shellGeneration practice selection exposes provider-backed call paths", () => {
  const argumentAssembly = selectShellArgumentAssemblyPractice({ preferredProvider: "openai" });
  assert.equal(argumentAssembly.providerName, "openai");
  assert.equal(argumentAssembly.provider, undefined);
  assert.match(argumentAssembly.practice.source.path ?? "", /codex_rust_0_123_0/);

  const commandGeneration = selectShellCommandGenerationPractice({ preferredProvider: "deepmind" });
  assert.equal(commandGeneration.providerName, "deepmind");
  assert.equal(commandGeneration.provider, undefined);
  assert.match(commandGeneration.practice.source.path ?? "", /gemini_cli_0_39_0/);

  const executionGuard = selectShellExecutionGuardPractice({ preferredProvider: "anthropic" });
  assert.equal(executionGuard.providerName, "anthropic");
  assert.equal(executionGuard.provider, undefined);
  assert.match(executionGuard.practice.source.path ?? "", /claude_code_2_1_88/);

  const invocationConstruction = selectShellInvocationConstructionPractice({ preferredProvider: "openai" });
  assert.equal(invocationConstruction.providerName, "openai");
  assert.equal(invocationConstruction.provider, undefined);
  assert.match(invocationConstruction.practice.source.path ?? "", /codex_rust_0_123_0/);

  const scriptGeneration = selectShellScriptGenerationPractice({ preferredProvider: "deepmind" });
  assert.equal(scriptGeneration.providerName, "deepmind");
  assert.equal(scriptGeneration.provider, undefined);
  assert.match(scriptGeneration.practice.source.path ?? "", /gemini_cli_0_39_0/);
});

test("shellGeneration practice selection adapts runtime executor providers", () => {
  const executor = {
    shell: {
      async generateCommand() {
        return { ok: true, output: {} };
      },
    },
  } satisfies BaseToolExecutorPort;

  const commandGeneration = selectShellCommandGenerationPractice({ preferredProvider: "openai", executor });
  assert.equal(commandGeneration.providerName, "openai");
  assert.equal(typeof commandGeneration.provider, "function");
});

test("shellGeneration dry-run bestPractice functions do not call injected providers", async () => {
  let calls = 0;
  const argumentResult = await assembleShellArgumentsBestPractice({
    executable: "printf",
    positional: ["ok"],
    provider: () => {
      calls += 1;
      throw new Error("provider should not be called during dry-run");
    },
  });
  assert.equal(argumentResult.ok, true);

  const commandResult = await generateShellCommandBestPractice({
    argv: ["printf", "ok"],
    provider: () => {
      calls += 1;
      throw new Error("provider should not be called during dry-run");
    },
  });
  assert.equal(commandResult.ok, true);

  const guardResult = await buildShellExecutionGuardBestPractice({
    command: "printf ok",
    argv: ["printf", "ok"],
    provider: () => {
      calls += 1;
      throw new Error("provider should not be called during dry-run");
    },
  });
  assert.equal(guardResult.ok, true);

  const invocationResult = await constructShellInvocationBestPractice({
    generatedCommand: commandResult.output,
    executionGuard: guardResult.output,
    provider: () => {
      calls += 1;
      throw new Error("provider should not be called during dry-run");
    },
  });
  assert.equal(invocationResult.ok, true);

  const scriptResult = await generateShellScriptPlanBestPractice({
    target: { commands: ["printf ok"] },
    provider: () => {
      calls += 1;
      throw new Error("provider should not be called during dry-run");
    },
  });
  assert.equal(scriptResult.ok, true);
  assert.equal(calls, 0);
});

test("shellGeneration bestPractice functions call injected providers only when runtime guard allows", async () => {
  let argumentProviderCalls = 0;
  const argumentResult = await assembleShellArgumentsBestPractice({
    executable: "ignored",
    context: { dryRun: false, guard: { allowed: true } },
    provider: () => {
      argumentProviderCalls += 1;
      return assembleShellArgumentsBestPractice({ executable: "printf", positional: ["ok"] });
    },
  });
  assert.equal(argumentResult.ok, true);
  assert.equal(argumentProviderCalls, 1);
  assert.deepEqual(argumentResult.output.argv, ["printf", "ok"]);

  let commandProviderCalls = 0;
  const commandResult = await generateShellCommandBestPractice({
    argv: ["ignored"],
    context: { dryRun: false, guard: { accepted: true } },
    provider: () => {
      commandProviderCalls += 1;
      return generateShellCommandBestPractice({ argv: ["printf", "ok"] });
    },
  });
  assert.equal(commandResult.ok, true);
  assert.equal(commandProviderCalls, 1);
  assert.equal(commandResult.output.commandLine, "printf ok");

  let guardProviderCalls = 0;
  const guardResult = await buildShellExecutionGuardBestPractice({
    command: "ignored",
    context: { dryRun: false, guard: { allowed: true } },
    provider: () => {
      guardProviderCalls += 1;
      return buildShellExecutionGuardBestPractice({ command: "printf ok", argv: ["printf", "ok"] });
    },
  });
  assert.equal(guardResult.ok, true);
  assert.equal(guardProviderCalls, 1);
  assert.equal(guardResult.output.verdict, "allowed");

  let invocationProviderCalls = 0;
  const invocationResult = await constructShellInvocationBestPractice({
    generatedCommand: commandResult.output,
    executionGuard: guardResult.output,
    context: { dryRun: false, guard: { allowed: true } },
    provider: () => {
      invocationProviderCalls += 1;
      return constructShellInvocationBestPractice({
        generatedCommand: commandResult.output,
        executionGuard: guardResult.output,
        invocationId: "provider-invocation",
      });
    },
  });
  assert.equal(invocationResult.ok, true);
  assert.equal(invocationProviderCalls, 1);
  assert.equal(invocationResult.invocation.invocationId, "provider-invocation");

  let scriptProviderCalls = 0;
  const scriptResult = await generateShellScriptPlanBestPractice({
    target: { commands: ["ignored"] },
    context: { dryRun: false, guard: { accepted: true } },
    provider: () => {
      scriptProviderCalls += 1;
      return generateShellScriptPlanBestPractice({ target: { commands: ["printf ok"] } });
    },
  });
  assert.equal(scriptResult.ok, true);
  assert.equal(scriptProviderCalls, 1);
  assert.match(scriptResult.output.script, /printf ok/);
});

test("shellGeneration provider path returns stable public errors for guard, missing provider, and provider failure", async () => {
  const denied = await generateShellCommandBestPractice({
    argv: ["printf", "ok"],
    context: { dryRun: false, guard: { accepted: false, reason: "tap denied" } },
    provider: () => generateShellCommandBestPractice({ argv: ["printf", "ok"] }),
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, "GOVERNANCE_REJECTED");
  assert.equal(denied.error.internalDetailExposed, false);

  const malformedGuard = await assembleShellArgumentsBestPractice({
    executable: "printf",
    context: { dryRun: false, guard: [] as never },
    provider: () => assembleShellArgumentsBestPractice({ executable: "printf" }),
  });
  assert.equal(malformedGuard.ok, false);
  assert.equal(malformedGuard.error.code, "GOVERNANCE_REJECTED");

  const missingProvider = await generateShellScriptPlanBestPractice({
    target: { commands: ["printf ok"] },
    context: { dryRun: false, guard: { allowed: true } },
  });
  assert.equal(missingProvider.ok, false);
  assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
  assert.equal(missingProvider.error.publicSafe, true);

  const providerFailure = await buildShellExecutionGuardBestPractice({
    command: "printf ok",
    context: { dryRun: false, guard: { allowed: true } },
    provider: () => {
      throw new Error("secret stack detail");
    },
  });
  assert.equal(providerFailure.ok, false);
  assert.equal(providerFailure.error.code, "PROVIDER_REJECTED");
  assert.equal(providerFailure.error.internalDetailExposed, false);
});

test("shellGeneration bestPractice validates malformed input before provider dispatch", async () => {
  function assertInputRejected(
    result: { ok: boolean; error?: { code: string; publicSafe: boolean; internalDetailExposed?: boolean } },
    code: string,
  ) {
    assert.equal(result.ok, false);
    assert.equal(result.error?.code, code);
    assert.equal(result.error?.publicSafe, true);
    assert.equal(result.error?.internalDetailExposed, false);
  }

  let argumentProviderCalls = 0;
  assertInputRejected(
    await assembleShellArgumentsBestPractice({
      executable: 1,
      context: { dryRun: false, guard: { allowed: true } },
      provider: () => {
        argumentProviderCalls += 1;
        throw new Error("provider should not receive malformed input");
      },
    } as never),
    "INVALID_ARGUMENT",
  );
  assert.equal(argumentProviderCalls, 0);

  let commandProviderCalls = 0;
  assertInputRejected(
    await generateShellCommandBestPractice({
      argv: {},
      context: { dryRun: false, guard: { allowed: true } },
      provider: () => {
        commandProviderCalls += 1;
        throw new Error("provider should not receive malformed input");
      },
    } as never),
    "INVALID_ARGUMENT_VECTOR",
  );
  assert.equal(commandProviderCalls, 0);

  let guardProviderCalls = 0;
  assertInputRejected(
    await buildShellExecutionGuardBestPractice({
      generatedCommand: { commandLine: "pwd", argv: {} },
      context: { dryRun: false, guard: { allowed: true } },
      provider: () => {
        guardProviderCalls += 1;
        throw new Error("provider should not receive malformed input");
      },
    } as never),
    "INVALID_COMMAND",
  );
  assert.equal(guardProviderCalls, 0);

  let invocationProviderCalls = 0;
  assertInputRejected(
    await constructShellInvocationBestPractice({
      generatedCommand: { commandLine: "pwd", argv: {}, shell: "bash", executable: "pwd", environmentKeys: [] },
      executionGuard: { verdict: "allowed", requiresTapApproval: false },
      context: { dryRun: false, guard: { allowed: true } },
      provider: () => {
        invocationProviderCalls += 1;
        throw new Error("provider should not receive malformed input");
      },
    } as never),
    "INVALID_COMMAND",
  );
  assert.equal(invocationProviderCalls, 0);

  let scriptProviderCalls = 0;
  assertInputRejected(
    await generateShellScriptPlanBestPractice({
      target: { commands: [{}] },
      context: { dryRun: false, guard: { allowed: true } },
      provider: () => {
        scriptProviderCalls += 1;
        throw new Error("provider should not receive malformed input");
      },
    } as never),
    "INVALID_COMMAND",
  );
  assert.equal(scriptProviderCalls, 0);
});

test("shellGeneration bestPractice rejects malformed injected provider results", async () => {
  function assertProviderRejected(result: { ok: boolean; error?: { code: string; publicSafe: boolean } }) {
    assert.equal(result.ok, false);
    assert.equal(result.error?.code, "PROVIDER_REJECTED");
    assert.equal(result.error?.publicSafe, true);
  }

  assertProviderRejected(
    await assembleShellArgumentsBestPractice({
      executable: "printf",
      context: { dryRun: false, guard: { allowed: true } },
      provider: () => ({ ok: true, toolId: "shell.argumentAssembly", output: {}, audit: [], events: [] }) as never,
    }),
  );

  assertProviderRejected(
    await generateShellCommandBestPractice({
      argv: ["printf", "ok"],
      context: { dryRun: false, guard: { allowed: true } },
      provider: () => ({ ok: true, toolId: "shell.commandGeneration", output: {}, audit: [], events: [] }) as never,
    }),
  );

  assertProviderRejected(
    await buildShellExecutionGuardBestPractice({
      command: "printf ok",
      context: { dryRun: false, guard: { allowed: true } },
      provider: () => ({ ok: true, toolId: "shell.executionGuard", output: {}, audit: [], events: [] }) as never,
    }),
  );

  const command = await generateShellCommandBestPractice({ argv: ["printf", "ok"] });
  assert.equal(command.ok, true);
  const guard = await buildShellExecutionGuardBestPractice({ generatedCommand: command.output });
  assert.equal(guard.ok, true);
  assertProviderRejected(
    await constructShellInvocationBestPractice({
      generatedCommand: command.output,
      executionGuard: guard.output,
      context: { dryRun: false, guard: { allowed: true } },
      provider: () => ({ ok: true, toolId: "shell.invocationConstruction", invocation: {}, audit: [], events: [] }) as never,
    }),
  );

  assertProviderRejected(
    await generateShellScriptPlanBestPractice({
      target: { commands: ["printf ok"] },
      context: { dryRun: false, guard: { allowed: true } },
      provider: () => ({ ok: true, toolId: "shell.scriptGeneration", output: {}, audit: [], events: [] }) as never,
    }),
  );
});
