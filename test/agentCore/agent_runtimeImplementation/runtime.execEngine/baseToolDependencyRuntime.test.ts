import assert from "node:assert/strict";
import { access, chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createRuntimeBaseToolExecutorPort,
  listRuntimeBaseToolImplementedPortPaths,
} from "../../../../src/runtimeImplementation/runtime.execEngine/baseToolExecutorPortFactory.js";
import {
  evaluateBaseToolRuntimeReadiness,
} from "../../../../src/runtimeImplementation/runtime.execEngine/baseToolSupportCatalog.js";
import {
  preflightBaseToolDependencies,
} from "../../../../src/runtimeImplementation/runtime.execEngine/baseToolDependencyRuntime.js";
import type { BaseToolSupportCatalogEntry } from "../../../../src/runtimeImplementation/runtime.execEngine/baseToolSupportCatalog.js";

function lspCatalogEntry(toolId = "code.lsp.locateDefinition"): BaseToolSupportCatalogEntry {
  return {
    toolId,
    family: "code",
    storageFamily: "codeBase",
    group: "lsp",
    title: "LSP Locate Definition",
    riskLevel: "read",
    permissionHints: ["filesystem:read"],
    dependencies: [],
    requiredSupports: [],
    readiness: "available",
    storageDocPath: "code.lsp.locateDefinition.md",
  };
}

test("baseToolDependencyRuntime reports ready dependencies after governance approval", async () => {
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-dependency-ready",
    sessionId: "session-dependency-ready",
  });
  const readiness = evaluateBaseToolRuntimeReadiness({
    toolId: "file.read",
    executor,
    implementedPortPaths: listRuntimeBaseToolImplementedPortPaths(),
  });

  const result = await preflightBaseToolDependencies({
    executor,
    readiness,
    catalogEntry: readiness.entry,
    implementedPortPaths: listRuntimeBaseToolImplementedPortPaths(),
    context: {
      runtimeId: "runtime-dependency-ready",
      sessionId: "session-dependency-ready",
      invocationId: "tool-call-ready",
      toolId: "file.read",
      toolInput: { path: "README.md" },
      governanceAccepted: true,
    },
  });

  assert.equal(result.decision, "ready");
  assert.equal(result.status, "available");
  assert.equal(result.publicSafe, true);
  assert.ok(result.events.includes("runtime.execEngine.baseToolDependencyRuntime.ready"));
});

test("baseToolDependencyRuntime treats generationPlane contracts as runtime-owned support", async () => {
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-dependency-generation-plane",
    sessionId: "session-dependency-generation-plane",
  });
  const implementedPortPaths = listRuntimeBaseToolImplementedPortPaths();
  const readiness = evaluateBaseToolRuntimeReadiness({
    toolId: "shell.run",
    executor,
    implementedPortPaths,
  });

  const result = await preflightBaseToolDependencies({
    executor,
    readiness,
    catalogEntry: readiness.entry,
    implementedPortPaths,
    context: {
      runtimeId: "runtime-dependency-generation-plane",
      sessionId: "session-dependency-generation-plane",
      invocationId: "tool-call-generation-plane",
      toolId: "shell.run",
      governanceAccepted: true,
    },
  });

  assert.equal(result.decision, "ready");
  assert.equal(result.status, "available");
  assert.deepEqual(result.missingDependencies, []);
});

test("baseToolDependencyRuntime exposes approval and provider-unavailable dependency boundaries", async () => {
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-dependency-boundary",
    sessionId: "session-dependency-boundary",
  });
  const implementedPortPaths = listRuntimeBaseToolImplementedPortPaths();
  const readReadiness = evaluateBaseToolRuntimeReadiness({
    toolId: "file.read",
    executor,
    implementedPortPaths,
  });

  const needsApproval = await preflightBaseToolDependencies({
    executor,
    readiness: readReadiness,
    catalogEntry: readReadiness.entry,
    implementedPortPaths,
    context: {
      runtimeId: "runtime-dependency-boundary",
      sessionId: "session-dependency-boundary",
      invocationId: "tool-call-approval",
      toolId: "file.read",
      toolInput: { path: "README.md" },
      governanceAccepted: false,
    },
  });
  assert.equal(needsApproval.decision, "requiresApproval");
  assert.equal(needsApproval.status, "requiresApproval");
  assert.ok(needsApproval.approvalRequiredDependencies.includes("runtime.governancePlane.workspaceReadScope"));

  const mcpReadiness = evaluateBaseToolRuntimeReadiness({
    toolId: "mcp.use",
    executor,
    implementedPortPaths,
  });
  const available = await preflightBaseToolDependencies({
    executor,
    readiness: mcpReadiness,
    catalogEntry: mcpReadiness.entry,
    implementedPortPaths,
    context: {
      runtimeId: "runtime-dependency-boundary",
      sessionId: "session-dependency-boundary",
      invocationId: "tool-call-unavailable",
      toolId: "mcp.use",
      toolInput: { serverId: "demo" },
      governanceAccepted: true,
    },
  });
  assert.equal(available.decision, "ready");
  assert.equal(available.status, "available");
  assert.deepEqual(available.providerUnavailableDependencies, []);
});

test("baseToolDependencyRuntime resolves LSP target dependencies into managed installable plans", async () => {
  const managedRoot = await mkdtemp(path.join(os.tmpdir(), "praxis-dependency-runtime-"));
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-dependency-lsp",
    sessionId: "session-dependency-lsp",
    adapters: {
      lsp: {
        async locateDefinition() {
          return { ok: true, output: { locations: [] } };
        },
      },
    },
  });
  const implementedPortPaths = listRuntimeBaseToolImplementedPortPaths({
    adapters: {
      lsp: {
        async locateDefinition() {
          return { ok: true, output: { locations: [] } };
        },
      },
    },
  });
  const catalogEntry = lspCatalogEntry();

  const result = await preflightBaseToolDependencies({
    executor,
    catalogEntry,
    implementedPortPaths,
    context: {
      runtimeId: "runtime-dependency-lsp",
      sessionId: "session-dependency-lsp",
      invocationId: "tool-call-lsp",
      toolId: catalogEntry.toolId,
      toolInput: {
        target: { filePath: "src/index.ts", line: 1, character: 1, languageId: "typescript" },
      },
      governanceAccepted: true,
      managedRoot,
      mode: "observe",
    },
  });

  assert.equal(result.decision, "requiresApproval");
  assert.equal(result.status, "installable");
  assert.ok(result.installableDependencies.includes("dependency.lsp.typescriptLanguageServer"));
  assert.ok(result.approvalRequiredDependencies.includes("dependency.lsp.typescriptLanguageServer"));
  assert.equal(
    result.iterationPlan.refreshSteps.some((step) =>
      step.dependencyId === "dependency.lsp.typescriptLanguageServer" && step.action === "install"
    ),
    false,
  );
});

test("baseToolDependencyRuntime reports optional installable dependencies without approval or install actions", async () => {
  const managedRoot = await mkdtemp(path.join(os.tmpdir(), "praxis-dependency-runtime-optional-"));
  const optionalEntry: BaseToolSupportCatalogEntry = {
    toolId: "mcp.optionalEcho",
    family: "mcp",
    storageFamily: "mcpBase",
    group: "test",
    title: "Optional MCP Echo",
    riskLevel: "normal",
    permissionHints: [],
    dependencies: [{
      dependencyId: "dependency.mcp.testServer.echo",
      kind: "mcp-server",
      required: false,
      description: "Optional MCP echo server should not block runtime readiness.",
    }],
    requiredSupports: [],
    readiness: "available",
    storageDocPath: "mcp.optionalEcho.md",
  };

  const result = await preflightBaseToolDependencies({
    catalogEntry: optionalEntry,
    context: {
      runtimeId: "runtime-dependency-optional",
      sessionId: "session-dependency-optional",
      invocationId: "tool-call-optional",
      toolId: optionalEntry.toolId,
      governanceAccepted: true,
      managedRoot,
      env: {
        PATH: "",
      },
      mode: "auto",
    },
  });

  assert.equal(result.decision, "ready");
  assert.equal(result.status, "available");
  assert.deepEqual(result.approvalRequiredDependencies, []);
  assert.deepEqual(result.missingDependencies, []);
  assert.deepEqual(result.installResults, []);
  assert.ok(result.installableDependencies.includes("dependency.mcp.testServer.echo"));
  assert.equal(
    result.iterationPlan.refreshSteps.some((step) => step.dependencyId === "dependency.mcp.testServer.echo" && (step.action === "approve" || step.action === "install")),
    false,
  );
});

test("baseToolDependencyRuntime auto mode can prepare trusted managed dependencies", async () => {
  const managedRoot = await mkdtemp(path.join(os.tmpdir(), "praxis-dependency-runtime-auto-"));
  const binDir = path.join(managedRoot, "bin");
  await mkdir(binDir, { recursive: true });
  const executable = path.join(binDir, "typescript-language-server");
  await writeFile(executable, "#!/usr/bin/env sh\necho 4.0.0\n", "utf8");
  await chmod(executable, 0o755);

  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-dependency-auto",
    sessionId: "session-dependency-auto",
    adapters: {
      lsp: {
        async locateDefinition() {
          return { ok: true, output: { locations: [] } };
        },
      },
    },
  });
  const implementedPortPaths = listRuntimeBaseToolImplementedPortPaths({
    adapters: {
      lsp: {
        async locateDefinition() {
          return { ok: true, output: { locations: [] } };
        },
      },
    },
  });
  const catalogEntry = lspCatalogEntry();

  const result = await preflightBaseToolDependencies({
    executor,
    catalogEntry,
    implementedPortPaths,
    context: {
      runtimeId: "runtime-dependency-auto",
      sessionId: "session-dependency-auto",
      invocationId: "tool-call-lsp-auto",
      toolId: catalogEntry.toolId,
      toolInput: {
        target: { filePath: "src/index.ts", line: 1, character: 1, languageId: "typescript" },
      },
      governanceAccepted: true,
      managedRoot,
      mode: "auto",
    },
  });

  assert.equal(result.decision, "ready");
  assert.equal(result.status, "available");
  assert.ok(result.installResults.some((entry) => entry.ok && entry.availability.dependencyId === "dependency.lsp.typescriptLanguageServer"));
});

test("baseToolDependencyRuntime blocks available dependencies with unacceptable observed versions", async () => {
  const managedRoot = await mkdtemp(path.join(os.tmpdir(), "praxis-dependency-runtime-version-"));
  const binDir = path.join(managedRoot, "bin");
  await mkdir(binDir, { recursive: true });
  const executable = path.join(binDir, "praxis-mcp-echo");
  await writeFile(executable, "#!/usr/bin/env sh\necho praxis-mcp-echo 0.1.0\n", "utf8");
  await chmod(executable, 0o755);
  const versionedEntry: BaseToolSupportCatalogEntry = {
    toolId: "mcp.versionedEcho",
    family: "mcp",
    storageFamily: "mcpBase",
    group: "test",
    title: "Versioned MCP Echo",
    riskLevel: "normal",
    permissionHints: [],
    dependencies: [{
      dependencyId: "dependency.mcp.testServer.echo",
      kind: "mcp-server",
      required: true,
      acceptedVersions: ["praxis-mcp-echo 0.2.0"],
      description: "Echo dependency must satisfy the requested runtime version.",
    }],
    requiredSupports: [],
    readiness: "available",
    storageDocPath: "mcp.versionedEcho.md",
  };

  const result = await preflightBaseToolDependencies({
    catalogEntry: versionedEntry,
    context: {
      runtimeId: "runtime-dependency-version",
      sessionId: "session-dependency-version",
      invocationId: "tool-call-version",
      toolId: versionedEntry.toolId,
      governanceAccepted: true,
      managedRoot,
      env: { PATH: process.env.PATH },
      mode: "auto",
    },
  });

  assert.equal(result.decision, "blocked");
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.missingDependencies, ["dependency.mcp.testServer.echo"]);
  assert.equal(result.report?.resolutions[0]?.status, "blocked");
  assert.match(result.report?.resolutions[0]?.detail ?? "", /praxis-mcp-echo 0\.1\.0/u);
});

test("baseToolDependencyRuntime does not auto-install dependencies when install is disabled", async () => {
  const managedRoot = await mkdtemp(path.join(os.tmpdir(), "praxis-dependency-runtime-disabled-"));
  const disabledEntry: BaseToolSupportCatalogEntry = {
    toolId: "mcp.disabledEcho",
    family: "mcp",
    storageFamily: "mcpBase",
    group: "test",
    title: "Disabled MCP Echo",
    riskLevel: "normal",
    permissionHints: [],
    dependencies: [{
      dependencyId: "dependency.mcp.testServer.echo",
      kind: "mcp-server",
      required: true,
      install: "disabled",
      description: "Disabled MCP echo dependency must never be auto-installed.",
    }],
    requiredSupports: [],
    readiness: "available",
    storageDocPath: "mcp.disabledEcho.md",
  };

  const result = await preflightBaseToolDependencies({
    catalogEntry: disabledEntry,
    context: {
      runtimeId: "runtime-dependency-disabled",
      sessionId: "session-dependency-disabled",
      invocationId: "tool-call-disabled",
      toolId: disabledEntry.toolId,
      governanceAccepted: true,
      managedRoot,
      env: { PATH: "" },
      mode: "auto",
    },
  });

  assert.equal(result.decision, "blocked");
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.installResults, []);
  assert.deepEqual(result.approvalRequiredDependencies, []);
  assert.deepEqual(result.missingDependencies, ["dependency.mcp.testServer.echo"]);
  assert.equal(
    result.iterationPlan?.refreshSteps.some((step) => step.action === "install"),
    false,
  );
  await assert.rejects(access(path.join(managedRoot, "bin", "praxis-mcp-echo")), /ENOENT/u);
});

test("baseToolDependencyRuntime blocks scoped managed install when required scopes are absent", async () => {
  const managedRoot = await mkdtemp(path.join(os.tmpdir(), "praxis-dependency-runtime-scope-"));
  const scopedEntry: BaseToolSupportCatalogEntry = {
    toolId: "mcp.scopedEcho",
    family: "mcp",
    storageFamily: "mcpBase",
    group: "test",
    title: "Scoped MCP Echo",
    riskLevel: "normal",
    permissionHints: [],
    dependencies: [{
      dependencyId: "dependency.mcp.testServer.echo",
      kind: "mcp-server",
      required: true,
      install: "auto",
      requiredScopes: ["dependency.install.echo"],
      description: "Scoped MCP echo dependency must require the install scope.",
    }],
    requiredSupports: [],
    readiness: "available",
    storageDocPath: "mcp.scopedEcho.md",
  };

  const result = await preflightBaseToolDependencies({
    catalogEntry: scopedEntry,
    context: {
      runtimeId: "runtime-dependency-scope",
      sessionId: "session-dependency-scope",
      invocationId: "tool-call-scope",
      toolId: scopedEntry.toolId,
      governanceAccepted: true,
      managedRoot,
      env: { PATH: "" },
      allowedScopes: [],
      mode: "auto",
    },
  });

  assert.equal(result.decision, "blocked");
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.installResults, []);
  assert.deepEqual(result.approvalRequiredDependencies, []);
  assert.deepEqual(result.missingDependencies, ["dependency.mcp.testServer.echo"]);
  assert.match(result.report?.resolutions[0]?.detail ?? "", /dependency.install.echo/u);
  await assert.rejects(access(path.join(managedRoot, "bin", "praxis-mcp-echo")), /ENOENT/u);
});

test("baseToolDependencyRuntime forwards timeoutMs to trusted managed installers", async () => {
  const managedRoot = await mkdtemp(path.join(os.tmpdir(), "praxis-dependency-runtime-timeout-"));
  const fakeBin = await mkdtemp(path.join(os.tmpdir(), "praxis-dependency-runtime-timeout-bin-"));
  const fakeNpm = path.join(fakeBin, "npm");
  await writeFile(fakeNpm, "#!/bin/sh\nsleep 0.2\nexit 0\n", "utf8");
  await chmod(fakeNpm, 0o755);

  const catalogEntry = lspCatalogEntry();
  const result = await preflightBaseToolDependencies({
    catalogEntry,
    context: {
      runtimeId: "runtime-dependency-timeout",
      sessionId: "session-dependency-timeout",
      invocationId: "tool-call-timeout",
      toolId: catalogEntry.toolId,
      toolInput: {
        target: { filePath: "src/index.ts", line: 1, character: 1, languageId: "typescript" },
      },
      governanceAccepted: true,
      managedRoot,
      env: {
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      },
      mode: "auto",
      timeoutMs: 25,
    },
  });

  const installResult = result.installResults.find((entry) => entry.dependencyId === "dependency.lsp.typescriptLanguageServer");
  assert.equal(result.decision, "blocked");
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.approvalRequiredDependencies, []);
  assert.ok(result.missingDependencies.includes("dependency.lsp.typescriptLanguageServer"));
  assert.equal(installResult?.ok, false);
  assert.match(installResult?.error?.message ?? "", /timed out/u);
  assert.match(result.reason, /dependency install timed out/u);
});

test("baseToolDependencyRuntime treats unknown dependencies as unsatisfied instead of available", async () => {
  const unknownEntry: BaseToolSupportCatalogEntry = {
    toolId: "custom.unknownDependency",
    family: "custom",
    storageFamily: "custom",
    group: "test",
    title: "Unknown dependency test",
    riskLevel: "normal",
    permissionHints: [],
    dependencies: [{
      dependencyId: "unknown.runtime.contract",
      kind: "custom",
      required: true,
      description: "Unregistered dependency must not be assumed available.",
    }],
    requiredSupports: [],
    readiness: "available",
    storageDocPath: "custom.unknownDependency.md",
  };

  const result = await preflightBaseToolDependencies({
    catalogEntry: unknownEntry,
    context: {
      runtimeId: "runtime-dependency-unknown",
      sessionId: "session-dependency-unknown",
      invocationId: "tool-call-unknown",
      toolId: "custom.unknownDependency",
      governanceAccepted: true,
    },
  });

  assert.equal(result.decision, "blocked");
  assert.equal(result.status, "unknown");
  assert.deepEqual(result.missingDependencies, ["unknown.runtime.contract"]);
  assert.match(result.reason, /unsatisfied dependencies/u);
});

test("baseToolDependencyRuntime honors explicit catalogEntry runtime support status", async () => {
  const blockedEntry: BaseToolSupportCatalogEntry = {
    toolId: "custom.blockedRuntimeSupport",
    family: "custom",
    storageFamily: "custom",
    group: "test",
    title: "Blocked runtime support test",
    riskLevel: "normal",
    permissionHints: [],
    dependencies: [],
    requiredSupports: [{
      supportId: "executor:custom.missing",
      dependencyId: "runtime.executor.custom.missing",
      dependencyKind: "runtime",
      supportKind: "executor-port",
      required: true,
      description: "Missing custom executor port.",
      portPath: "custom.missing",
      status: "unavailable",
    }],
    readiness: "unavailable",
    storageDocPath: "custom.blockedRuntimeSupport.md",
  };

  const result = await preflightBaseToolDependencies({
    catalogEntry: blockedEntry,
    context: {
      runtimeId: "runtime-dependency-explicit-entry",
      sessionId: "session-dependency-explicit-entry",
      invocationId: "tool-call-explicit-entry",
      toolId: blockedEntry.toolId,
      governanceAccepted: true,
    },
  });

  assert.equal(result.decision, "blocked");
  assert.equal(result.status, "providerUnavailable");
  assert.deepEqual(result.providerUnavailableDependencies, ["runtime.executor.custom.missing"]);
});

test("baseToolDependencyRuntime live-probes registered detect-only desktop dependencies", async () => {
  const managedRoot = await mkdtemp(path.join(os.tmpdir(), "praxis-dependency-runtime-detect-"));
  const binDir = path.join(managedRoot, "bin");
  await mkdir(binDir, { recursive: true });
  const grim = path.join(binDir, "grim");
  await writeFile(grim, "#!/usr/bin/env sh\necho grim 1.0.0\n", "utf8");
  await chmod(grim, 0o755);

  const screenshotEntry: BaseToolSupportCatalogEntry = {
    toolId: "computeruse.fullscreenScreenshot",
    family: "computeruse",
    storageFamily: "computeruseBase",
    group: "screenshot",
    title: "Fullscreen Screenshot",
    riskLevel: "risky",
    permissionHints: [],
    dependencies: [{
      dependencyId: "runtime.desktop.screenshotProvider.linux",
      kind: "package",
      required: true,
      description: "Linux desktop runtime must expose a real screenshot provider stack.",
    }],
    requiredSupports: [],
    readiness: "available",
    storageDocPath: "computeruse.fullscreenScreenshot.md",
  };

  const result = await preflightBaseToolDependencies({
    catalogEntry: screenshotEntry,
    context: {
      runtimeId: "runtime-dependency-detect",
      sessionId: "session-dependency-detect",
      invocationId: "tool-call-detect",
      toolId: "computeruse.fullscreenScreenshot",
      governanceAccepted: true,
      managedRoot,
      env: {
        PATH: `${binDir}:${process.env.PATH ?? ""}`,
      },
    },
  });

  assert.equal(result.decision, "ready");
  assert.equal(result.status, "available");
  assert.deepEqual(result.missingDependencies, []);
  assert.equal(result.report?.resolutions[0]?.observedVersion, "linux-screenshot-provider grim");
});
