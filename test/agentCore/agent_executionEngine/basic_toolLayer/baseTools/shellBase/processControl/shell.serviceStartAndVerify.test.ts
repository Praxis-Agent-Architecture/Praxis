import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  planShellServiceStartAndVerify,
  shellServiceStartAndVerifyDescriptor,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/processControl/shell.serviceStartAndVerify.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/processControl/shell.serviceStartAndVerify.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/processControl/shell.serviceStartAndVerify.md",
  testFileUrl: import.meta.url,
});

test("planShellServiceStartAndVerify creates a dry-run service launch and verification contract", () => {
  const result = planShellServiceStartAndVerify({
    target: {
      command: "npm run dev -- --host 127.0.0.1",
      workingDirectory: "/repo/app",
      shell: "zsh",
      serviceId: "vite-dev",
      launchMode: "background",
      outputBufferLimitBytes: 128_000,
      verification: {
        kind: "http",
        url: "http://127.0.0.1:5173/",
        expectedStatus: 200,
        expectedText: "Vite",
        timeoutMs: 20_000,
        intervalMs: 500,
      },
    },
    context: {
      invocationId: "service-1",
      allowedWorkingDirectories: ["/repo"],
      grantedPermissions: ["shell:execute", "shell:service:verify"],
      approval: { accepted: true, approvalId: "tap-service-1" },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(shellServiceStartAndVerifyDescriptor.defaultDryRun, true);
  if (!result.ok) throw new Error("service dry-run should succeed");
  assert.deepEqual(result.output.commandPreview, ["zsh", "-lc", "npm run dev -- --host 127.0.0.1"]);
  assert.equal(result.output.approvalId, "tap-service-1");
  assert.equal(result.output.serviceContract.startsService, true);
  assert.equal(result.output.serviceContract.verifiesReachability, true);
  assert.equal(result.output.serviceContract.runtimeOwnsLifecycle, true);
  assert.equal(result.output.serviceContract.finalAnswerRequiresVerifiedReachability, true);
  assert.equal(result.output.resultEnvelope.serviceHandle, "vite-dev");
  assert.deepEqual(result.output.resultEnvelope.statusSnapshot, {
    handle: "vite-dev",
    lifecycleKind: "service",
    processState: "planned",
    verificationState: "not-started",
    verified: false,
    command: "npm run dev -- --host 127.0.0.1",
    cwd: "/repo/app",
    verificationKind: "http",
    url: "http://127.0.0.1:5173/",
    expectedStatus: 200,
    summary: "service launch and reachability verification are planned, not completed",
  });
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.unsafeSideEffects, false);
  assert.deepEqual(result.events, ["basicTool.shell.serviceStartAndVerify.dryRun"]);
});

test("planShellServiceStartAndVerify rejects missing command, invalid verification, denied scope, and missing permissions", () => {
  const missing = planShellServiceStartAndVerify();
  assert.equal(missing.ok, false);
  if (missing.ok) throw new Error("missing command should fail");
  assert.equal(missing.error.code, "MISSING_COMMAND");
  assert.equal(missing.error.boundary, "input");

  const missingUrl = planShellServiceStartAndVerify({
    target: {
      command: "npm run dev",
      verification: { kind: "http" },
    },
  });
  assert.equal(missingUrl.ok, false);
  if (missingUrl.ok) throw new Error("missing url should fail");
  assert.equal(missingUrl.error.code, "MISSING_VERIFICATION_URL");
  assert.equal(missingUrl.error.boundary, "input");

  const scoped = planShellServiceStartAndVerify({
    target: {
      command: "npm run dev",
      workingDirectory: "/outside",
      verification: { kind: "http", url: "http://127.0.0.1:3000/" },
    },
    context: { allowedWorkingDirectories: ["/repo"] },
  });
  assert.equal(scoped.ok, false);
  if (scoped.ok) throw new Error("out of scope should fail");
  assert.equal(scoped.error.code, "SCOPE_REJECTED");
  assert.equal(scoped.error.boundary, "scope");

  const denied = planShellServiceStartAndVerify({
    target: {
      command: "npm run dev",
      verification: { kind: "http", url: "http://127.0.0.1:3000/" },
    },
    context: { grantedPermissions: ["shell:execute"] },
  });
  assert.equal(denied.ok, false);
  if (denied.ok) throw new Error("missing permission should fail");
  assert.equal(denied.error.code, "PERMISSION_DENIED");
  assert.equal(denied.error.boundary, "permission");
});

test("planShellServiceStartAndVerify supports command verification contracts", () => {
  const result = planShellServiceStartAndVerify({
    target: {
      command: "node server.js",
      launchMode: "detached",
      verification: {
        kind: "command",
        command: "curl -fsS http://127.0.0.1:3000/health",
        expectedText: "ok",
      },
    },
    context: {
      grantedPermissions: ["shell:execute", "shell:service:verify"],
      approval: { accepted: true },
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("command verification should plan");
  assert.equal(result.output.target.verification.kind, "command");
  assert.equal(result.output.target.launchMode, "detached");
  assert.equal(result.output.resultEnvelope.statusSnapshot.verificationKind, "command");
});

test("shell.serviceStartAndVerify provider schema describes service launch and verification target", () => {
  const lookup = createBaseToolRegistry().lookup("shell.serviceStartAndVerify");
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
  assert.deepEqual(root.properties?.target?.required, ["command", "verification"]);
  assert.ok(root.properties?.target?.properties?.command);
  assert.ok(root.properties?.target?.properties?.serviceId);
  assert.ok(root.properties?.target?.properties?.verification);
});
