import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  detectShellType,
  shellTypeDetectionDescriptor,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellDetection/shell.typeDetection.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellDetection/shell.typeDetection.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellDetection/shell.typeDetection.md",
  testFileUrl: import.meta.url,
});

test("detectShellType classifies supplied shell hints without probing the host", () => {
  const result = detectShellType({
    context: {
      runtimeId: "runtime-1",
      invocationId: "detect-1",
      requestedScopes: ["tool.shell.detect"],
      allowedScopes: ["tool.shell.detect"],
    },
    shellPath: "/usr/bin/zsh",
    platform: "linux",
  });

  assert.equal(result.ok, true);
  assert.equal(shellTypeDetectionDescriptor.defaultDispatch, "dry-run");
  if (!result.ok) {
    return;
  }

  assert.equal(result.report.toolId, "shell.typeDetection");
  assert.equal(result.report.detectedType, "zsh");
  assert.equal(result.report.confidence, "high");
  assert.equal(result.report.normalizedShellName, "zsh");
  assert.equal(result.report.source, "shellPath");
  assert.equal(result.report.dryRun, true);
  assert.equal(result.report.unsafeSideEffects, false);
  assert.deepEqual(result.report.acceptedScopes, ["tool.shell.detect"]);
});

test("detectShellType reports unknown shells as a safe low-confidence result", () => {
  const result = detectShellType({
    context: { runtimeId: "runtime-1" },
    executableName: "custom-shell",
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.report.detectedType, "unknown");
  assert.equal(result.report.confidence, "low");
});

test("detectShellType classifies missing input, scope denial, and real probe attempts", () => {
  const missing = detectShellType();
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_RUNTIME_ID");
    assert.equal(missing.error.boundary, "input");
  }

  const noHint = detectShellType({ context: { runtimeId: "runtime-1" } });
  assert.equal(noHint.ok, false);
  if (!noHint.ok) {
    assert.equal(noHint.error.code, "MISSING_SHELL_HINT");
    assert.equal(noHint.error.boundary, "input");
  }

  const denied = detectShellType({
    context: {
      runtimeId: "runtime-1",
      requestedScopes: ["tool.shell.detect", "host.env.read"],
      allowedScopes: ["tool.shell.detect"],
    },
    envShell: "/bin/bash",
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.error.code, "SCOPE_DENIED");
    assert.equal(denied.error.boundary, "scope");
  }

  const realProbe = detectShellType({
    context: { runtimeId: "runtime-1", dryRun: false },
    shellPath: "/bin/bash",
  });
  assert.equal(realProbe.ok, false);
  if (!realProbe.ok) {
    assert.equal(realProbe.error.code, "REAL_SHELL_PROBE_NOT_ALLOWED");
    assert.equal(realProbe.error.boundary, "contract");
  }
});
