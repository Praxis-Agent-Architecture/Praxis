import assert from "node:assert/strict";
import test from "node:test";

import { assembleShellArguments } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/shellBase/shellGeneration/shell.argumentAssembly.js";
import { generateShellCommand } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/shellBase/shellGeneration/shell.commandGeneration.js";
import { buildShellExecutionGuard } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/shellBase/shellGeneration/shell.executionGuard.js";
import { constructShellInvocation } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/shellBase/shellGeneration/shell.invocationConstruction.js";
import { generateShellScriptPlan } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/shellBase/shellGeneration/shell.scriptGeneration.js";

test("shellGeneration core functions classify malformed runtime JSON without raw TypeError", () => {
  const cases = [
    ["argument context invocation", () => assembleShellArguments({ executable: "pwd", context: { invocationId: 1 } } as never)],
    ["argument permissions", () => assembleShellArguments({ executable: "pwd", context: { grantedPermissions: {} } } as never)],
    ["argument null request", () => assembleShellArguments(null as never)],
    ["argument null positional", () => assembleShellArguments({ executable: "pwd", positional: [null] } as never)],
    ["argument object positional", () => assembleShellArguments({ executable: "pwd", positional: [{ value: {} }] } as never)],
    ["argument options null", () => assembleShellArguments({ executable: "pwd", options: null } as never)],
    ["argument metadata scalar", () => assembleShellArguments({ executable: "pwd", context: { auditMetadata: 1 } } as never)],
    ["command context invocation", () => generateShellCommand({ argv: ["pwd"], context: { invocationId: 1 } } as never)],
    ["command permissions", () => generateShellCommand({ argv: ["pwd"], context: { grantedPermissions: {} } } as never)],
    ["command null request", () => generateShellCommand(null as never)],
    ["command null argv", () => generateShellCommand({ argv: null } as never)],
    ["command numeric argv", () => generateShellCommand({ argv: [1] } as never)],
    ["command env object", () => generateShellCommand({ argv: ["pwd"], environmentKeys: {} } as never)],
    ["command env array wrong shape", () => generateShellCommand({ argv: ["pwd"], environmentKeys: [null] } as never)],
    ["command cwd numeric", () => generateShellCommand({ argv: ["pwd"], workingDirectory: 1 } as never)],
    ["guard directory policy", () => buildShellExecutionGuard({ command: "pwd", policy: { allowedWorkingDirectories: {} } } as never)],
    ["guard denied policy", () => buildShellExecutionGuard({ command: "pwd", argv: ["pwd"], policy: { deniedExecutables: {} } } as never)],
    ["guard permissions", () => buildShellExecutionGuard({ command: "pwd", context: { grantedPermissions: {} } } as never)],
    ["guard null request", () => buildShellExecutionGuard(null as never)],
    ["guard command object", () => buildShellExecutionGuard({ command: {} } as never)],
    ["guard generated command wrong argv", () => buildShellExecutionGuard({ generatedCommand: { commandLine: "pwd", argv: {} } } as never)],
    ["guard context runtime scalar", () => buildShellExecutionGuard({ command: "pwd", context: { runtimeId: 1 } } as never)],
    [
      "invocation permissions",
      () =>
        constructShellInvocation({
          generatedCommand: {
            commandLine: "pwd",
            argv: ["pwd"],
            shell: "bash",
            executable: "pwd",
            environmentKeys: [],
          },
          executionGuard: { verdict: "allowed", requiresTapApproval: false },
          context: { grantedPermissions: {} },
        } as never),
    ],
    [
      "invocation generated command",
      () =>
        constructShellInvocation({
          generatedCommand: {
            commandLine: "pwd",
            argv: {},
            shell: "bash",
            executable: "pwd",
            environmentKeys: [],
          },
          executionGuard: { verdict: "allowed", requiresTapApproval: false },
        } as never),
    ],
    ["invocation null request", () => constructShellInvocation(null as never)],
    [
      "invocation null guard",
      () =>
        constructShellInvocation({
          generatedCommand: { commandLine: "pwd", argv: ["pwd"], shell: "bash", executable: "pwd", environmentKeys: [] },
          executionGuard: null,
        } as never),
    ],
    [
      "invocation bad guard action",
      () =>
        constructShellInvocation({
          generatedCommand: { commandLine: "pwd", argv: ["pwd"], shell: "bash", executable: "pwd", environmentKeys: [] },
          executionGuard: { verdict: "allowed", requiresTapApproval: "yes", action: {} },
        } as never),
    ],
    [
      "invocation metadata wrong shape",
      () =>
        constructShellInvocation({
          generatedCommand: { commandLine: "pwd", argv: ["pwd"], shell: "bash", executable: "pwd", environmentKeys: [] },
          executionGuard: { verdict: "allowed", requiresTapApproval: false },
          metadata: [],
        } as never),
    ],
    ["script context invocation", () => generateShellScriptPlan({ target: { commands: ["pwd"] }, context: { invocationId: 1 } } as never)],
    ["script null request", () => generateShellScriptPlan(null as never)],
    ["script target null", () => generateShellScriptPlan({ target: null } as never)],
    ["script command wrong shape", () => generateShellScriptPlan({ target: { commands: [{}] } } as never)],
    ["script env array", () => generateShellScriptPlan({ target: { commands: ["pwd"], environment: [] } } as never)],
    ["script cwd number", () => generateShellScriptPlan({ target: { commands: ["pwd"], workingDirectory: 1 } } as never)],
    ["script guard null", () => generateShellScriptPlan({ target: { commands: ["pwd"] }, context: { guard: null } } as never)],
    ["script runtimeId number", () => generateShellScriptPlan({ target: { commands: ["pwd"] }, context: { runtimeId: 1 } } as never)],
  ] as const;

  for (const [label, run] of cases) {
    assert.doesNotThrow(run, label);
    const result = run();
    assert.equal(typeof result.ok, "boolean", label);
    if (!result.ok) {
      assert.equal(result.error.internalDetailExposed, false, label);
    }
  }
});
