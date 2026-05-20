import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createRuntimeBaseToolExecutorPort,
  listRuntimeBaseToolImplementedPortPaths,
} from "../../../../src/agentCore_runtimeImplementation/runtime.execEngine/baseToolExecutorPortFactory.js";
import {
  evaluateBaseToolRuntimeReadiness,
} from "../../../../src/agentCore_runtimeImplementation/runtime.execEngine/baseToolSupportCatalog.js";
import {
  preflightBaseToolDependencies,
} from "../../../../src/agentCore_runtimeImplementation/runtime.execEngine/baseToolDependencyRuntime.js";
import type { BaseToolSupportCatalogEntry } from "../../../../src/agentCore_runtimeImplementation/runtime.execEngine/baseToolSupportCatalog.js";

test("baseToolDependencyRuntime reports ready dependencies after governance approval", async () => {
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-dependency-ready",
    sessionId: "session-dependency-ready",
  });
  const readiness = evaluateBaseToolRuntimeReadiness({
    toolId: "code.read",
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
      toolId: "code.read",
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
    toolId: "shell.invocationConstruction",
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
      toolId: "shell.invocationConstruction",
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
    toolId: "code.read",
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
      toolId: "code.read",
      toolInput: { path: "README.md" },
      governanceAccepted: false,
    },
  });
  assert.equal(needsApproval.decision, "requiresApproval");
  assert.equal(needsApproval.status, "requiresApproval");
  assert.ok(needsApproval.approvalRequiredDependencies.includes("runtime.governancePlane.workspaceReadScope"));

  const mcpReadiness = evaluateBaseToolRuntimeReadiness({
    toolId: "mcp.connect",
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
      toolId: "mcp.connect",
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
  const readiness = evaluateBaseToolRuntimeReadiness({
    toolId: "code.lsp_locateDefinition",
    executor,
    implementedPortPaths,
  });

  const result = await preflightBaseToolDependencies({
    executor,
    readiness,
    catalogEntry: readiness.entry,
    implementedPortPaths,
    context: {
      runtimeId: "runtime-dependency-lsp",
      sessionId: "session-dependency-lsp",
      invocationId: "tool-call-lsp",
      toolId: "code.lsp_locateDefinition",
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
  assert.ok(result.installableDependencies.includes("lsp.server.typescript-language-server"));
  assert.ok(result.approvalRequiredDependencies.includes("lsp.server.typescript-language-server"));
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
  const readiness = evaluateBaseToolRuntimeReadiness({
    toolId: "code.lsp_locateDefinition",
    executor,
    implementedPortPaths,
  });

  const result = await preflightBaseToolDependencies({
    executor,
    readiness,
    catalogEntry: readiness.entry,
    implementedPortPaths,
    context: {
      runtimeId: "runtime-dependency-auto",
      sessionId: "session-dependency-auto",
      invocationId: "tool-call-lsp-auto",
      toolId: "code.lsp_locateDefinition",
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
  assert.ok(result.installResults.some((entry) => entry.ok && entry.availability.dependencyId === "lsp.server.typescript-language-server"));
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

test("baseToolDependencyRuntime live-probes registered detect-only desktop dependencies", async () => {
  const managedRoot = await mkdtemp(path.join(os.tmpdir(), "praxis-dependency-runtime-detect-"));
  const binDir = path.join(managedRoot, "bin");
  await mkdir(binDir, { recursive: true });
  const python = path.join(binDir, "python3");
  await writeFile(python, "#!/usr/bin/env sh\necho gtk-launch-xdg-desktop-portal\n", "utf8");
  await chmod(python, 0o755);

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
  assert.equal(result.report?.resolutions[0]?.observedVersion, "gtk-launch-xdg-desktop-portal");
});
