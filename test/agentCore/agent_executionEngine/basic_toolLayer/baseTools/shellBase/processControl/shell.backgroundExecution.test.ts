import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  planShellBackgroundExecution,
  shellBackgroundExecutionDescriptor,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/processControl/shell.backgroundExecution.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/processControl/shell.backgroundExecution.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/processControl/shell.backgroundExecution.md",
  testFileUrl: import.meta.url,
});

test("planShellBackgroundExecution creates a monitorable dry-run background job", () => {
  const result = planShellBackgroundExecution({
    target: {
      command: "npm run dev",
      workingDirectory: "/repo/app",
      shell: "zsh",
      jobId: "dev-server",
      monitorIntervalMs: 2_000,
      outputBufferLimitBytes: 128_000,
    },
    context: {
      invocationId: "background-1",
      allowedWorkingDirectories: ["/repo"],
      grantedPermissions: ["shell:execute"],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(shellBackgroundExecutionDescriptor.defaultDryRun, true);
  assert.deepEqual(result.output.commandPreview, ["zsh", "-lc", "npm run dev"]);
  assert.equal(result.output.backgroundContract.returnsImmediately, true);
  assert.equal(result.output.backgroundContract.monitorableByRuntime, true);
  assert.equal(result.output.backgroundContract.cancellationRequired, true);
  assert.equal(result.output.resultEnvelope.backgroundHandle, "dev-server");
  assert.deepEqual(result.output.resultEnvelope.statusSnapshot, {
    handle: "dev-server",
    lifecycleKind: "background",
    processState: "planned",
    verificationState: "not-requested",
    verified: false,
    command: "npm run dev",
    cwd: "/repo/app",
    summary: "background process launch is planned; service reachability has not been verified",
  });
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.unsafeSideEffects, false);
  assert.deepEqual(result.events, ["basicTool.shell.backgroundExecution.dryRun"]);
});

test("planShellBackgroundExecution rejects missing input, invalid resource config, and denied scope", () => {
  const missing = planShellBackgroundExecution();
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, "MISSING_COMMAND");
  assert.equal(missing.error.boundary, "input");

  const monitor = planShellBackgroundExecution({
    target: { command: "npm run dev", monitorIntervalMs: 50 },
  });
  assert.equal(monitor.ok, false);
  assert.equal(monitor.error.code, "INVALID_MONITOR_INTERVAL");
  assert.equal(monitor.error.boundary, "resource");

  const scoped = planShellBackgroundExecution({
    target: { command: "pwd", workingDirectory: "/outside" },
    context: { allowedWorkingDirectories: ["/repo"] },
  });
  assert.equal(scoped.ok, false);
  assert.equal(scoped.error.code, "SCOPE_REJECTED");
  assert.equal(scoped.error.boundary, "scope");
});

test("shell.backgroundExecution provider schema describes background command target", () => {
  const lookup = createBaseToolRegistry().lookup("shell.backgroundExecution");
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
  assert.ok(root.properties?.target?.properties?.shell);
  assert.ok(root.properties?.target?.properties?.jobId);
});

test("planShellBackgroundExecution treats an explicit root scope as allowing child directories", () => {
  const result = planShellBackgroundExecution({
    target: { command: "pwd", workingDirectory: "/tmp/app" },
    context: { allowedWorkingDirectories: ["/"], grantedPermissions: ["shell:execute"] },
  });

  assert.equal(result.ok, true);
  assert.equal(result.output.target.workingDirectory, "/tmp/app");
});

test("planShellBackgroundExecution separates permission, approval, and real execution failures", () => {
  const denied = planShellBackgroundExecution({
    target: { command: "npm run dev" },
    context: { grantedPermissions: [] },
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, "PERMISSION_DENIED");
  assert.equal(denied.error.boundary, "permission");

  const approval = planShellBackgroundExecution({
    target: { command: "sudo systemctl restart app" },
    riskLevel: "high",
    context: { grantedPermissions: ["shell:execute"] },
  });
  assert.equal(approval.ok, false);
  assert.equal(approval.error.code, "APPROVAL_REQUIRED");
  assert.equal(approval.error.boundary, "approval");

  const real = planShellBackgroundExecution({
    target: { command: "pwd" },
    context: { dryRun: false },
  });
  assert.equal(real.ok, false);
  assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
  assert.equal(real.error.boundary, "contract");
});
