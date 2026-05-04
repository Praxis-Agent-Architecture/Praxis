import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createRuntimeBaseToolExecutorPort,
  listRuntimeBaseToolImplementedPortPaths,
} from "../../../../src/agentCore/agent_runtimeImplementation/runtime.execEngine/baseToolExecutorPortFactory.js";
import {
  evaluateBaseToolRuntimeReadiness,
} from "../../../../src/agentCore/agent_runtimeImplementation/runtime.execEngine/baseToolSupportCatalog.js";
import {
  preflightBaseToolDependencies,
} from "../../../../src/agentCore/agent_runtimeImplementation/runtime.execEngine/baseToolDependencyRuntime.js";

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
  const unavailable = await preflightBaseToolDependencies({
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
  assert.equal(unavailable.decision, "blocked");
  assert.equal(unavailable.status, "providerUnavailable");
  assert.ok(unavailable.providerUnavailableDependencies.includes("runtime.execEngine.mcp.connect"));
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
