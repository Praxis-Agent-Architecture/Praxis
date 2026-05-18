import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  planShellDetachedExecution,
  shellDetachedExecutionDescriptor,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/processControl/shell.detachedExecution.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/processControl/shell.detachedExecution.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/processControl/shell.detachedExecution.md",
  testFileUrl: import.meta.url,
});

test("planShellDetachedExecution creates an approval-gated dry-run detached plan", () => {
  const result = planShellDetachedExecution({
    target: {
      command: "node server.js",
      workingDirectory: "/repo/app",
      shell: "bash",
      launchId: "server-daemon",
      pidFilePath: "/repo/run/server.pid",
      stdoutLogPath: "/repo/log/server.out",
      restartPolicy: "on-failure",
    },
    context: {
      invocationId: "detached-1",
      allowedWorkingDirectories: ["/repo"],
      grantedPermissions: ["shell:execute"],
      approval: { accepted: true, approvalId: "tap-detached-1" },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(shellDetachedExecutionDescriptor.defaultDryRun, true);
  assert.deepEqual(result.output.commandPreview, ["bash", "-lc", "node server.js"]);
  assert.equal(result.output.approvalId, "tap-detached-1");
  assert.equal(result.output.detachedContract.outlivesAgentSession, true);
  assert.equal(result.output.detachedContract.requiresTapApproval, true);
  assert.equal(result.output.resultEnvelope.detachedHandle, "server-daemon");
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.unsafeSideEffects, false);
  assert.deepEqual(result.events, ["basicTool.shell.detachedExecution.dryRun"]);
});

test("planShellDetachedExecution rejects missing input, denied scope, and invalid restart policy", () => {
  const missing = planShellDetachedExecution();
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, "MISSING_COMMAND");
  assert.equal(missing.error.boundary, "input");

  const scoped = planShellDetachedExecution({
    target: { command: "node server.js", workingDirectory: "/outside" },
    context: { allowedWorkingDirectories: ["/repo"], approval: { accepted: true } },
  });
  assert.equal(scoped.ok, false);
  assert.equal(scoped.error.code, "SCOPE_REJECTED");
  assert.equal(scoped.error.boundary, "scope");

  const restart = planShellDetachedExecution({
    target: { command: "node server.js", restartPolicy: "always" as "none" },
    context: { approval: { accepted: true } },
  });
  assert.equal(restart.ok, false);
  assert.equal(restart.error.code, "INVALID_RESTART_POLICY");
  assert.equal(restart.error.boundary, "resource");
});

test("planShellDetachedExecution treats an explicit root scope as allowing child directories", () => {
  const result = planShellDetachedExecution({
    target: { command: "node server.js", workingDirectory: "/tmp/app" },
    context: {
      allowedWorkingDirectories: ["/"],
      grantedPermissions: ["shell:execute"],
      approval: { accepted: true },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.output.target.workingDirectory, "/tmp/app");
});

test("planShellDetachedExecution requires permission, approval, and dry-run execution", () => {
  const denied = planShellDetachedExecution({
    target: { command: "node server.js" },
    context: { grantedPermissions: [], approval: { accepted: true } },
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, "PERMISSION_DENIED");
  assert.equal(denied.error.boundary, "permission");

  const approval = planShellDetachedExecution({
    target: { command: "node server.js" },
    context: { grantedPermissions: ["shell:execute"] },
  });
  assert.equal(approval.ok, false);
  assert.equal(approval.error.code, "APPROVAL_REQUIRED");
  assert.equal(approval.error.boundary, "approval");

  const real = planShellDetachedExecution({
    target: { command: "node server.js" },
    context: { dryRun: false, approval: { accepted: true } },
  });
  assert.equal(real.ok, false);
  assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
  assert.equal(real.error.boundary, "contract");
});

test("shell.detachedExecution provider schema describes detached browser launch target", () => {
  const lookup = createBaseToolRegistry().lookup("shell.detachedExecution");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  const schema = lookup.definition.inputSchema;
  assert.equal(schema.kind, "json-schema");
  const root = schema.schema as {
    properties?: {
      target?: {
        required?: readonly string[];
        properties?: Record<string, unknown>;
      };
    };
  };
  assert.deepEqual(root.properties?.target?.required, ["command"]);
  assert.ok(root.properties?.target?.properties?.command);
  assert.ok(root.properties?.target?.properties?.workingDirectory);
  assert.ok(root.properties?.target?.properties?.restartPolicy);
});
