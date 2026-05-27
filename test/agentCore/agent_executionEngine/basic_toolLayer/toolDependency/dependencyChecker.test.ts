import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  basicToolDependencyCheckerDescriptor,
  checkBasicToolDependencies,
  planBasicToolDependencyProbe,
} from "../../../../../src/executionEngine/basic_toolLayer/toolDependency/dependencyChecker.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/basic_toolLayer/toolDependency/dependencyChecker.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/toolDependency/dependencyChecker.md",
  testFileUrl: import.meta.url,
});

test("planBasicToolDependencyProbe checks Praxis managed bin before PATH", () => {
  const plan = planBasicToolDependencyProbe(
    { id: "lsp.server.typescript-language-server", kind: "package" },
    { managedRoot: "/tmp/praxis-tool-deps" },
  );

  assert.equal(plan.externalProbePerformed, false);
  assert.equal(plan.unsafeSideEffects, false);
  assert.equal(plan.candidates[0]?.location, "praxis-managed");
  assert.equal(plan.candidates[0]?.command, "/tmp/praxis-tool-deps/bin/typescript-language-server");
  assert.equal(plan.candidates.at(-1)?.location, "path");
  assert.equal(plan.candidates.at(-1)?.command, "typescript-language-server");
});

test("planBasicToolDependencyProbe maps canonical dependency ids to real executables", () => {
  const plan = planBasicToolDependencyProbe(
    { id: "dependency.lsp.typescriptLanguageServer", kind: "npm" },
    { managedRoot: "/tmp/praxis-tool-deps" },
  );

  assert.equal(plan.dependencyId, "dependency.lsp.typescriptLanguageServer");
  assert.equal(plan.candidates[0]?.command, "/tmp/praxis-tool-deps/bin/typescript-language-server");
  assert.equal(plan.candidates.at(-1)?.command, "typescript-language-server");
});

test("checkBasicToolDependencies accepts provided probes without probing the host", () => {
  const result = checkBasicToolDependencies({
    context: {
      runtimeId: " runtime-1 ",
      toolId: " shell.commandExecution ",
      allowedScopes: ["tool.shell.execute"],
      metadata: { caller: "runtime.inspection" },
    },
    dependencies: [
      { id: "bash", kind: "binary", versionRange: ">=5", scope: "tool.shell.execute" },
      { id: "shell-approval", kind: "permission", severity: "optional" },
    ],
    probes: [
      { id: "bash", available: true, version: "5.2" },
      { id: "shell-approval", available: false, detail: "TAP approval not attached yet" },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(basicToolDependencyCheckerDescriptor.externalProbePerformed, false);
  if (!result.ok) {
    assert.fail("dependency check should succeed");
  }

  assert.equal(result.report.runtimeId, "runtime-1");
  assert.equal(result.report.toolId, "shell.commandExecution");
  assert.equal(result.report.status, "satisfied");
  assert.deepEqual(result.report.missingRequired, []);
  assert.deepEqual(result.report.optionalMissing, ["shell-approval"]);
  assert.equal(result.report.externalProbePerformed, false);
  assert.equal(result.report.dryRun, true);
  assert.equal(result.report.unsafeSideEffects, false);
});

test("checkBasicToolDependencies matches legacy declarations with canonical probes", () => {
  const result = checkBasicToolDependencies({
    context: {
      runtimeId: "runtime-1",
      toolId: "code.lsp.locateDefinition",
    },
    dependencies: [
      { id: "lsp.server.typescript-language-server", kind: "package" },
    ],
    probes: [
      { id: "dependency.lsp.typescriptLanguageServer", available: true, version: "4.0.0" },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("canonical probe should satisfy legacy dependency declaration");
  }
  assert.deepEqual(result.report.missingRequired, []);
});

test("checkBasicToolDependencies reports missing required dependencies with a partial report", () => {
  const result = checkBasicToolDependencies({
    context: { runtimeId: "runtime-1", toolId: "mcp.call" },
    dependencies: [
      { id: "fs-mcp", kind: "mcp-server" },
      { id: "mcp-auth", kind: "permission", severity: "optional" },
    ],
    probes: [{ id: "mcp-auth", available: false }],
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("missing required dependency should fail");
  }

  assert.equal(result.error.code, "DEPENDENCY_UNAVAILABLE");
  assert.equal(result.error.boundary, "dependency");
  assert.deepEqual(result.report?.missingRequired, ["fs-mcp"]);
  assert.deepEqual(result.report?.optionalMissing, ["mcp-auth"]);
});

test("checkBasicToolDependencies classifies missing input, scope denial, and real refresh attempts", () => {
  const missingRuntime = checkBasicToolDependencies({
    context: { toolId: "shell.commandExecution" },
    dependencies: [{ id: "bash", kind: "binary" }],
  });
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) {
    assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");
    assert.equal(missingRuntime.error.boundary, "input");
  }

  const scoped = checkBasicToolDependencies({
    context: {
      runtimeId: "runtime-1",
      toolId: "shell.commandExecution",
      allowedScopes: ["tool.shell.execute"],
    },
    dependencies: [{ id: "dangerous-host-write", kind: "permission", scope: "host.fs.write" }],
  });
  assert.equal(scoped.ok, false);
  if (!scoped.ok) {
    assert.equal(scoped.error.code, "SCOPE_DENIED");
    assert.equal(scoped.error.boundary, "scope");
  }

  const realRefresh = checkBasicToolDependencies({
    context: { runtimeId: "runtime-1", toolId: "shell.commandExecution", dryRun: false },
    dependencies: [{ id: "bash", kind: "binary" }],
  });
  assert.equal(realRefresh.ok, false);
  if (!realRefresh.ok) {
    assert.equal(realRefresh.error.code, "REFRESH_PROBE_BLOCKED");
    assert.equal(realRefresh.error.boundary, "contract");
  }
});
