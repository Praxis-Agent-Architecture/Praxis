import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { assembleShellArguments } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/shellBase/shellGeneration/shell.argumentAssembly.js";
import {
  generateShellCommand,
  shellCommandGenerationDescriptor,
} from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/shellBase/shellGeneration/shell.commandGeneration.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/basic_toolLayer/baseTools/shellBase/shellGeneration/shell.commandGeneration.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellGeneration/shell.commandGeneration.md",
  testFileUrl: import.meta.url,
});

test("generateShellCommand renders a provider-neutral dry-run command line", () => {
  const args = assembleShellArguments({
    executable: "npm",
    positional: ["run", "test:agentCore", "--", "shell generation"],
  });
  assert.equal(args.ok, true);

  const result = generateShellCommand({
    assembledArguments: args.output,
    shell: "bash",
    workingDirectory: "/repo",
    environmentKeys: ["NODE_ENV", "NODE_ENV", " PATH "],
    context: { invocationId: "shell-command-1", grantedPermissions: ["shell:generate"] },
  });

  assert.equal(result.ok, true);
  assert.equal(shellCommandGenerationDescriptor.defaultDryRun, true);
  assert.equal(result.output.commandLine, "npm run test:agentCore -- 'shell generation'");
  assert.equal(result.output.shell, "bash");
  assert.deepEqual(result.output.environmentKeys, ["NODE_ENV", "PATH"]);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.unsafeSideEffects, false);
});

test("generateShellCommand rejects missing argv, invalid shell, and real execution", () => {
  const missing = generateShellCommand();
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, "MISSING_ARGUMENT_VECTOR");
  assert.equal(missing.error.boundary, "input");

  const invalidShell = generateShellCommand({
    argv: ["pwd"],
    shell: "fish" as never,
  });
  assert.equal(invalidShell.ok, false);
  assert.equal(invalidShell.error.code, "INVALID_SHELL");
  assert.equal(invalidShell.error.boundary, "input");

  const real = generateShellCommand({
    argv: ["pwd"],
    context: { dryRun: false },
  });
  assert.equal(real.ok, false);
  assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
  assert.equal(real.error.boundary, "contract");
});
