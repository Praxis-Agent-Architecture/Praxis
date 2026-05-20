import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  assembleShellArguments,
  quoteShellArgument,
  shellArgumentAssemblyDescriptor,
} from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/shellBase/shellGeneration/shell.argumentAssembly.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/basic_toolLayer/baseTools/shellBase/shellGeneration/shell.argumentAssembly.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellGeneration/shell.argumentAssembly.md",
  testFileUrl: import.meta.url,
});

test("assembleShellArguments creates a quoted dry-run argv envelope", () => {
  const result = assembleShellArguments({
    executable: " npm ",
    options: [
      { name: "--filter", value: "agent core", joinWithEquals: true },
      { name: "--token", value: { value: "secret value", sensitive: true } },
    ],
    positional: ["test", 42],
    context: { invocationId: "shell-args-1", grantedPermissions: ["shell:generate"] },
  });

  assert.equal(result.ok, true);
  assert.equal(shellArgumentAssemblyDescriptor.defaultDryRun, true);
  assert.equal(quoteShellArgument("agent core"), "'agent core'");
  assert.deepEqual(result.output.argv, ["npm", "--filter=agent core", "--token", "secret value", "test", "42"]);
  assert.deepEqual(result.output.redactedPreview, [
    "npm",
    "'--filter=agent core'",
    "--token",
    "[redacted]",
    "test",
    "42",
  ]);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.unsafeSideEffects, false);
});

test("assembleShellArguments rejects empty input, missing permission, and real execution", () => {
  const empty = assembleShellArguments();
  assert.equal(empty.ok, false);
  assert.equal(empty.error.code, "MISSING_EXECUTABLE");
  assert.equal(empty.error.boundary, "input");

  const permission = assembleShellArguments({
    executable: "pwd",
    context: { grantedPermissions: [] },
  });
  assert.equal(permission.ok, false);
  assert.equal(permission.error.code, "PERMISSION_DENIED");
  assert.equal(permission.error.boundary, "permission");

  const real = assembleShellArguments({
    executable: "pwd",
    context: { dryRun: false },
  });
  assert.equal(real.ok, false);
  assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
  assert.equal(real.error.boundary, "contract");
});
