import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import {
  inspectShellEnvironment,
  shellEnvironmentInspectionDescriptor,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellDetection/shell.environmentInspection.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellDetection/shell.environmentInspection.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellDetection/shell.environmentInspection.md",
  testFileUrl: import.meta.url,
});

test("inspectShellEnvironment summarizes a provided dry-run environment snapshot", () => {
  const result = inspectShellEnvironment({
    target: {
      workingDirectory: " /workspace/project/ ",
      shellExecutable: "/bin/zsh",
      environment: {
        PATH: "/usr/bin:/bin",
        OPENAI_API_KEY: "secret-value",
        LANG: "en_US.UTF-8",
      },
      variablesToInspect: ["PATH", "OPENAI_API_KEY", "LANG"],
    },
    context: {
      invocationId: " env-check ",
      allowedWorkingDirectories: ["/workspace"],
      grantedPermissions: ["shell:environment:inspect"],
    },
  });

  if (!result.ok) {
    assert.fail(result.error.message);
  }

  assert.equal(result.toolId, "shell.environmentInspection");
  assert.equal(result.output.target.workingDirectory, "/workspace/project");
  assert.deepEqual(result.output.pathEntries, ["/usr/bin", "/bin"]);
  assert.equal(result.output.variables.find((item) => item.name === "OPENAI_API_KEY")?.redacted, true);
  assert.equal(result.output.variables.find((item) => item.name === "LANG")?.valuePreview, "en_US.UTF-8");
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(shellEnvironmentInspectionDescriptor.unsafeSideEffects, false);
});

test("inspectShellEnvironment rejects empty input and invalid variable names", () => {
  const missing = inspectShellEnvironment();
  assert.equal(missing.ok, false);
  if (missing.ok) {
    assert.fail("missing working directory should fail");
  }
  assert.equal(missing.error.code, "MISSING_WORKING_DIRECTORY");
  assert.equal(missing.error.publicSafe, true);

  const invalidVariable = inspectShellEnvironment({
    target: {
      workingDirectory: "/workspace",
      variablesToInspect: ["NOT-A-SHELL-VAR"],
    },
  });

  assert.equal(invalidVariable.ok, false);
  if (invalidVariable.ok) {
    assert.fail("invalid variable name should fail");
  }
  assert.equal(invalidVariable.error.code, "INVALID_VARIABLE_NAME");
});

test("inspectShellEnvironment enforces directory scope, permissions, and dry-run boundary", () => {
  const outOfScope = inspectShellEnvironment({
    target: { workingDirectory: "/tmp/outside" },
    context: { allowedWorkingDirectories: ["/workspace"] },
  });

  assert.equal(outOfScope.ok, false);
  if (outOfScope.ok) {
    assert.fail("out-of-scope working directory should fail");
  }
  assert.equal(outOfScope.error.code, "SCOPE_REJECTED");

  const missingPermission = inspectShellEnvironment({
    target: { workingDirectory: "/workspace" },
    context: { grantedPermissions: ["filesystem:read"] },
  });

  assert.equal(missingPermission.ok, false);
  if (missingPermission.ok) {
    assert.fail("missing shell environment permission should fail");
  }
  assert.equal(missingPermission.error.code, "PERMISSION_DENIED");

  const realInspection = inspectShellEnvironment({
    target: { workingDirectory: "/workspace" },
    context: { dryRun: false },
  });

  assert.equal(realInspection.ok, false);
  if (realInspection.ok) {
    assert.fail("real environment inspection should be blocked");
  }
  assert.equal(realInspection.error.code, "REAL_INSPECTION_BLOCKED");
});
