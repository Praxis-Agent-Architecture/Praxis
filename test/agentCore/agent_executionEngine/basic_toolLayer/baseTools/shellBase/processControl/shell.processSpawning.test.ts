import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  planShellProcessSpawn,
  shellProcessSpawningDescriptor,
} from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/shellBase/processControl/shell.processSpawning.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_executionEngine/basic_toolLayer/baseTools/shellBase/processControl/shell.processSpawning.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/processControl/shell.processSpawning.md",
  testFileUrl: import.meta.url,
});

test("planShellProcessSpawn creates an audited dry-run spawn plan", () => {
  const result = planShellProcessSpawn({
    target: {
      executable: "node",
      args: ["--version"],
      workingDirectory: "/repo/app",
      env: { SECRET_TOKEN: "hidden", NODE_ENV: "test" },
      stdio: "pipe",
    },
    launchMode: "foreground",
    context: {
      invocationId: "spawn-1",
      allowedWorkingDirectories: ["/repo"],
      grantedPermissions: ["shell:execute"],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(shellProcessSpawningDescriptor.defaultDryRun, true);
  assert.deepEqual(result.output.permissionsRequired, ["shell:execute"]);
  assert.deepEqual(result.output.commandPreview, ["node", "--version"]);
  assert.deepEqual(result.output.target.envKeys, ["SECRET_TOKEN", "NODE_ENV"]);
  assert.equal(result.output.target.workingDirectory, "/repo/app");
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.unsafeSideEffects, false);
  assert.deepEqual(result.events, ["basicTool.shell.processSpawning.dryRun"]);
});

test("planShellProcessSpawn rejects ambiguous targets, denied scope, and real execution", () => {
  const ambiguous = planShellProcessSpawn({ target: { executable: "node", command: "node --version" } });
  assert.equal(ambiguous.ok, false);
  assert.equal(ambiguous.error.code, "AMBIGUOUS_TARGET");
  assert.equal(ambiguous.error.boundary, "input");

  const scoped = planShellProcessSpawn({
    target: { executable: "pwd", workingDirectory: "/outside" },
    context: { allowedWorkingDirectories: ["/repo"] },
  });
  assert.equal(scoped.ok, false);
  assert.equal(scoped.error.code, "SCOPE_REJECTED");
  assert.equal(scoped.error.boundary, "scope");

  const real = planShellProcessSpawn({
    target: { command: "pwd" },
    context: { dryRun: false },
  });
  assert.equal(real.ok, false);
  assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
  assert.equal(real.error.boundary, "contract");
});

test("shell.processSpawning provider schema describes detached/browser launch shape", () => {
  const lookup = createBaseToolRegistry().lookup("shell.processSpawning");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  const schema = lookup.definition.inputSchema;
  assert.equal(schema.kind, "json-schema");
  const root = schema.schema as {
    properties?: {
      launchMode?: { enum?: readonly string[] };
      target?: {
        properties?: Record<string, unknown>;
      };
    };
  };
  assert.deepEqual(root.properties?.launchMode?.enum, ["foreground", "background", "detached"]);
  assert.ok(root.properties?.target?.properties?.executable);
  assert.ok(root.properties?.target?.properties?.args);
  assert.ok(root.properties?.target?.properties?.workingDirectory);
});

test("planShellProcessSpawn treats an explicit root scope as allowing child directories", () => {
  const result = planShellProcessSpawn({
    target: { executable: "pwd", workingDirectory: "/tmp/app" },
    context: { allowedWorkingDirectories: ["/"], grantedPermissions: ["shell:execute"] },
  });

  assert.equal(result.ok, true);
  assert.equal(result.output.target.workingDirectory, "/tmp/app");
});

test("planShellProcessSpawn separates permissions and high-risk approval", () => {
  const denied = planShellProcessSpawn({
    target: { executable: "node" },
    context: { grantedPermissions: [] },
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, "PERMISSION_DENIED");
  assert.equal(denied.error.boundary, "permission");

  const approval = planShellProcessSpawn({
    target: { command: "sudo systemctl restart app" },
    riskLevel: "high",
    context: { grantedPermissions: ["shell:execute"] },
  });
  assert.equal(approval.ok, false);
  assert.equal(approval.error.code, "APPROVAL_REQUIRED");
  assert.equal(approval.error.boundary, "approval");
});
