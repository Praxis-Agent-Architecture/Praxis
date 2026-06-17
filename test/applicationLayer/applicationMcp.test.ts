import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  createApplicationProjectRuntime,
  createInMemoryMcpPlusSkillStore,
  inspectMcpRuntimeMountMatrix,
  inspectSandboxRuntimeMountMatrix,
  type PraxisApplicationOfficialAdapterMountMatrixOutput,
  type PraxisApplicationMcpMountMatrixOutput,
} from "../../src/applicationLayer/index.js";
import {
  buildMcpServerProfilesFromManifest,
  compileAgent,
  createRuntimeBaseToolExecutorPort,
  harness,
  listRuntimeBaseToolImplementedPortPaths,
  loop,
  mcp,
  model,
  policy,
  sandbox,
  session,
  storage,
  toolPolicies,
  type PraxisAgent,
} from "../../src/agentCore/index.js";

const DOCTOR_PROJECT = "src/devdoctor";

function mcpMountMatrixOutput(value: unknown): PraxisApplicationMcpMountMatrixOutput {
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
  assert.equal((value as { kind?: unknown }).kind, "praxis.application.mcpMountMatrix");
  return value as PraxisApplicationMcpMountMatrixOutput;
}

function officialAdapterMountMatrixOutput(value: unknown): PraxisApplicationOfficialAdapterMountMatrixOutput {
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
  assert.equal((value as { kind?: unknown }).kind, "praxis.application.officialAdapterMountMatrix");
  return value as PraxisApplicationOfficialAdapterMountMatrixOutput;
}

class ApplicationMcpMatrixAgent implements PraxisAgent {
  identity = "agent.application.mcpMatrix";
  model = model("gpt-test");
  storage = storage.memory();
  session = session({ persistence: "memory" });
  toolPolicy = toolPolicies.yolo();
  harness = harness({
    modules: {
      mcp: mcp.module({
        servers: [
          mcp.stdio("app-plus", {
            command: "node",
            args: ["server.js"],
            mode: "mcp-plus",
            manifest: {
              server: {
                id: "app-plus",
                title: "Application Plus",
                summary: "Application MCP+ server.",
              },
              exposure: {
                pinnedTools: ["app.read"],
                indexedTools: ["app.inspect"],
              },
            },
          }),
        ],
      }),
    },
    tools: mcp.recommendedTools(),
    policy: policy({
      allowProviderCall: true,
      allowToolExecution: true,
      scopes: ["agent.invoke", "tool.execute", "mcp:call", "mcp:resource:list", "mcp:prompt:list", "mcp:prompt:get", "mcp:completion"],
    }),
    loop: loop.standard(),
  });
}

test("application runtime accepts official MCP server options and reports them in the view", async () => {
  const created = await createApplicationProjectRuntime(DOCTOR_PROJECT, {
    now: () => "2026-06-03T00:00:00.000Z",
    mcpServers: [{
      serverId: "browser-native",
      transport: "stdio",
      command: "node",
      args: ["server.js"],
    }],
    mcpPlusServers: [{
      serverId: "browser-plus",
      transport: "stdio",
      command: "node",
      args: ["server.js"],
      manifest: {
        server: {
          id: "browser-plus",
          title: "Browser Plus",
          summary: "Browser MCP server with MCP+ exposure policy.",
        },
        exposure: {
          pinnedTools: ["browser.open"],
          indexedTools: ["network.status"],
        },
      },
    }],
  });

  assert.equal(created.ok, true);
  if (!created.ok) return;

  const view = created.runtime.getView();
  assert.equal(view.mcp.servers.length, 2);
  assert.deepEqual(view.mcp.servers.map((server) => `${server.serverId}:${server.mode}`), [
    "browser-native:native",
    "browser-plus:mcp-plus",
  ]);
  assert.equal(view.mcp.servers[1]?.manifestPresent, true);
});

test("application runtime defaults manifest-backed MCP servers to MCP+ mode", async () => {
  const created = await createApplicationProjectRuntime(DOCTOR_PROJECT, {
    now: () => "2026-06-03T00:00:00.000Z",
    mcpServers: [{
      serverId: "browser-plus-default",
      transport: "stdio",
      command: "node",
      args: ["server.js"],
      manifest: {
        server: {
          id: "browser-plus-default",
          title: "Browser Plus Default",
          summary: "Browser MCP server with MCP+ exposure policy.",
        },
        exposure: {
          pinnedTools: ["browser.open"],
          indexedTools: ["network.status"],
        },
      },
    }],
  });

  assert.equal(created.ok, true);
  if (!created.ok) return;

  const view = created.runtime.getView();
  assert.deepEqual(view.mcp.servers.map((server) => `${server.serverId}:${server.mode}`), [
    "browser-plus-default:mcp-plus",
  ]);
  assert.equal(view.mcp.servers[0]?.manifestPresent, true);
});

test("application rewind rejects missing conversation checkpoints", async () => {
  const created = await createApplicationProjectRuntime(DOCTOR_PROJECT, {
    now: () => "2026-06-03T00:00:00.000Z",
  });

  assert.equal(created.ok, true);
  if (!created.ok) return;

  const result = await created.runtime.dispatch({
    type: "application.rewind",
    turnId: "turn.missing",
  });

  assert.equal(result.ok, false);
  assert.equal(result.events[0]?.eventId, "application.rewind.failed");
  if (result.ok) return;
  assert.equal(result.error.code, "APPLICATION_REWIND_TARGET_NOT_FOUND");
});

test("application layer exports MCP runtime mount matrix for upper applications", async () => {
  const compiled = compileAgent(ApplicationMcpMatrixAgent);
  assert.equal(compiled.ok, true);
  if (!compiled.ok) return;

  const skillStore = createInMemoryMcpPlusSkillStore([{
    id: "app-plus:inspection:read-first",
    serverId: "app-plus",
    projectId: "project.application",
    chapter: "inspection",
    title: "Read first",
    summary: "Read the app surface before expanding diagnostics.",
    createdAt: "2026-06-04T00:00:00.000Z",
    updatedAt: "2026-06-04T00:00:00.000Z",
  }]);
  const profiles = buildMcpServerProfilesFromManifest(compiled.manifest);
  const adapters = {
    skill: {
      load: async () => ({
        ok: true,
        output: {
          name: "application.mcp.skill",
        },
      }),
    },
  };
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime.application.mcpMatrix",
    sessionId: "session.application.mcpMatrix",
    mcpServers: profiles,
    adapters,
  });
  const matrix = await inspectMcpRuntimeMountMatrix({
    manifest: compiled.manifest,
    executor,
    implementedPortPaths: listRuntimeBaseToolImplementedPortPaths({ mcpServers: profiles, adapters }),
    nativeToolInventoryByServerId: {
      "app-plus": [
        { name: "app.read", description: "Read app state.", inputSchema: { type: "object", properties: {} } },
        { name: "app.inspect", description: "Inspect app diagnostics.", inputSchema: { type: "object", properties: {} } },
      ],
    },
    projectId: "project.application",
    skillStore,
  });

  assert.equal(matrix.status, "ready");
  assert.equal(matrix.servers[0]?.serverId, "app-plus");
  assert.equal(matrix.servers[0]?.mode, "mcp-plus");
  assert.equal(matrix.servers[0]?.skillNoteCount, 1);
  assert.deepEqual(matrix.baseTools.flatMap((tool) => tool.missingPortPaths), []);
  assert.deepEqual([...new Set(matrix.baseTools.map((tool) => tool.evidenceStatus))], ["executor-backed"]);
  assert.deepEqual(matrix.resourceOperations.map((operation) => `${operation.operation}:${operation.portPath}:${operation.evidenceStatus}`), [
    "list:mcp.listResources:executor-backed",
    "templates:mcp.listResourceTemplates:executor-backed",
    "read:mcp.readResource:executor-backed",
  ]);
  assert.equal(matrix.totals.resourceOperations, 3);
  assert.equal(matrix.totals.resourceOperationMissingPorts, 0);
  assert.deepEqual(matrix.promptOperations.map((operation) => `${operation.operation}:${operation.portPath}:${operation.evidenceStatus}`), [
    "list:mcp.listPrompts:executor-backed",
    "get:mcp.getPrompt:executor-backed",
  ]);
  assert.equal(matrix.totals.promptOperations, 2);
  assert.equal(matrix.totals.promptOperationMissingPorts, 0);
  assert.deepEqual(matrix.completionOperations.map((operation) => `${operation.operation}:${operation.portPath}:${operation.evidenceStatus}`), [
    "complete:mcp.complete:executor-backed",
  ]);
  assert.equal(matrix.totals.completionOperations, 1);
  assert.equal(matrix.totals.completionOperationMissingPorts, 0);
  assert.equal(matrix.totals.declaredOnlyPorts, 0);
  assert.equal(matrix.totals.missingNativeInventories, 0);
});

test("application runtime dispatches MCP mount matrix through the application facade", async () => {
  const skillStore = createInMemoryMcpPlusSkillStore([{
    id: "app-plus:inspection:read-first",
    serverId: "app-plus",
    projectId: "project.application",
    chapter: "inspection",
    title: "Read first",
    summary: "Read the app surface before expanding diagnostics.",
    createdAt: "2026-06-04T00:00:00.000Z",
    updatedAt: "2026-06-04T00:00:00.000Z",
  }]);
  const created = await createApplicationProjectRuntime(DOCTOR_PROJECT, {
    now: () => "2026-06-04T00:00:00.000Z",
    applicationId: "application.mcpMatrixFacade",
    runtimeId: "runtime.application.mcpMatrixFacade",
    sessionId: "session.application.mcpMatrixFacade",
    toolProfile: "agentCore",
    mcpPlusServers: [{
      serverId: "app-plus",
      transport: "stdio",
      command: "node",
      args: ["server.js"],
      manifest: {
        server: {
          id: "app-plus",
          title: "Application Plus",
          summary: "Application MCP+ server.",
        },
        exposure: {
          pinnedTools: ["app.read"],
          indexedTools: ["app.inspect"],
        },
      },
    }],
    mcpPlus: {
      projectId: "project.application",
      skillStore,
    },
    baseToolAdapters: {
      skill: {
        load: async () => ({
          ok: true,
          output: {
            name: "application.mcp.skill",
          },
        }),
      },
    },
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const inspected = await created.runtime.dispatch({
    type: "application.inspectMcpMountMatrix",
    nativeToolInventoryByServerId: {
      "app-plus": [
        { name: "app.read", description: "Read app state.", inputSchema: { type: "object", properties: {} } },
        { name: "app.inspect", description: "Inspect app diagnostics.", inputSchema: { type: "object", properties: {} } },
      ],
    },
  });

  assert.equal(inspected.ok, true);
  const output = mcpMountMatrixOutput(inspected.output);
  assert.equal(output.kind, "praxis.application.mcpMountMatrix");
  assert.equal(output.sessionId, "session.application.mcpMatrixFacade");
  assert.equal(output.runtimeId, "runtime.application.mcpMatrixFacade");
  assert.equal(output.matrix.surface, "runtime.mcpPlane.mountMatrix");
  assert.equal(output.matrix.status, "ready");
  assert.equal(output.matrix.servers[0]?.serverId, "app-plus");
  assert.equal(output.matrix.servers[0]?.mode, "mcp-plus");
  assert.equal(output.matrix.servers[0]?.skillNoteCount, 1);
  assert.deepEqual(output.matrix.baseTools.flatMap((tool) => tool.missingPortPaths), []);
  assert.deepEqual([...new Set(output.matrix.baseTools.map((tool) => tool.evidenceStatus))], ["executor-backed"]);
  assert.deepEqual(output.matrix.resourceOperations.map((operation) => `${operation.operation}:${operation.portPath}:${operation.evidenceStatus}`), [
    "list:mcp.listResources:executor-backed",
    "templates:mcp.listResourceTemplates:executor-backed",
    "read:mcp.readResource:executor-backed",
  ]);
  assert.equal(output.matrix.totals.resourceOperations, 3);
  assert.equal(output.matrix.totals.resourceOperationMissingPorts, 0);
  assert.deepEqual(output.matrix.promptOperations.map((operation) => `${operation.operation}:${operation.portPath}:${operation.evidenceStatus}`), [
    "list:mcp.listPrompts:executor-backed",
    "get:mcp.getPrompt:executor-backed",
  ]);
  assert.equal(output.matrix.totals.promptOperations, 2);
  assert.equal(output.matrix.totals.promptOperationMissingPorts, 0);
  assert.deepEqual(output.matrix.completionOperations.map((operation) => `${operation.operation}:${operation.portPath}:${operation.evidenceStatus}`), [
    "complete:mcp.complete:executor-backed",
  ]);
  assert.equal(output.matrix.totals.completionOperations, 1);
  assert.equal(output.matrix.totals.completionOperationMissingPorts, 0);
  assert.equal(output.matrix.totals.declaredOnlyPorts, 0);
  assert.equal(output.matrix.totals.missingNativeInventories, 0);
  assert.equal(output.publicSafe, true);
});

test("application runtime dispatches official adapter mount matrix through the application facade", async () => {
  const created = await createApplicationProjectRuntime(DOCTOR_PROJECT, {
    now: () => "2026-06-04T00:00:00.000Z",
    applicationId: "application.officialAdapterMountMatrix",
    runtimeId: "runtime.application.officialAdapterMountMatrix",
    sessionId: "session.application.officialAdapterMountMatrix",
    mcpServers: [{
      serverId: "app-mcp",
      transport: "stdio",
      command: "node",
      args: ["server.js"],
    }],
    contextArtifactAdapters: {
      context: {
        load: async () => ({
          ok: true,
          output: {
            kind: "workspaceIndex",
            items: [],
          },
        }),
      },
    },
    baseToolAdapters: {
      skill: {
        load: async () => ({
          ok: true,
          output: {
            name: "application.officialAdapter.skill",
          },
        }),
      },
    },
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const inspected = await created.runtime.dispatch({
    type: "application.inspectOfficialAdapterMountMatrix",
  });

  assert.equal(inspected.ok, true);
  const output = officialAdapterMountMatrixOutput(inspected.output);
  assert.equal(output.kind, "praxis.application.officialAdapterMountMatrix");
  assert.equal(output.sessionId, "session.application.officialAdapterMountMatrix");
  assert.equal(output.runtimeId, "runtime.application.officialAdapterMountMatrix");
  assert.equal(output.matrix.surface, "runtime.officialAdapterPlane.mountMatrix");
  assert.equal(output.matrix.status, "ready");
  assert.deepEqual(output.matrix.adapters.map((adapter) => adapter.toolId), ["context.load", "mcp.resources", "skill.load"]);
  assert.deepEqual([...new Set(output.matrix.adapters.map((adapter) => adapter.evidenceStatus))], ["executor-backed"]);
  assert.equal(output.matrix.totals.readyAdapters, 3);
  assert.equal(output.matrix.totals.missingPorts, 0);
  assert.equal(output.matrix.totals.declaredOnlyPorts, 0);
  assert.equal(output.matrix.guardrails.executesAdapters, false);
  assert.equal(output.publicSafe, true);
});

test("application MCP mount matrix preserves manifest-owned MCP module over application options", async () => {
  const tempRoot = path.join(process.cwd(), ".tmp");
  await mkdir(tempRoot, { recursive: true });
  const projectRoot = await mkdtemp(path.join(tempRoot, "praxis-application-mcp-matrix-manifest-"));
  try {
    await writeFile(path.join(projectRoot, "rax.project.json"), `${JSON.stringify({
      id: "application-mcp-matrix-manifest",
      entry: "praxis.agent.ts",
      export: "ManifestMcpAgent",
      application: { id: "application.mcpMatrixManifest" },
      agent: { id: "agent.application.mcpMatrixManifest" },
    }, null, 2)}\n`);
    await writeFile(path.join(projectRoot, "praxis.agent.ts"), `import { praxis } from "@praxis-ai/praxis";

export class ManifestMcpAgent extends praxis.Agent {
  identity = "agent.application.mcpMatrixManifest";
  model = praxis.model("gpt-test");
  storage = praxis.storage.memory();
  session = praxis.session({ persistence: "memory" });
  toolPolicy = praxis.toolPolicies.yolo();
  harness = praxis.harness({
    modules: {
      mcp: praxis.mcp.module({
        servers: [
          praxis.mcp.stdio("manifest-owned", {
            command: "node",
            args: ["manifest-server.js"],
            mode: "mcp-plus",
            manifest: {
              server: {
                id: "manifest-owned",
                title: "Manifest Owned",
                summary: "Manifest-owned MCP+ server.",
              },
              exposure: {
                pinnedTools: ["manifest.read"],
              },
            },
          }),
        ],
      }),
    },
    tools: praxis.mcp.recommendedTools(),
    policy: praxis.policy({
      allowProviderCall: true,
      allowToolExecution: true,
      scopes: ["agent.invoke", "tool.execute", "mcp:call", "mcp:resource:list", "mcp:prompt:list", "mcp:prompt:get", "mcp:completion"],
    }),
    loop: praxis.loop.standard(),
  });
}

export default ManifestMcpAgent;
`);
    const skillStore = createInMemoryMcpPlusSkillStore([{
      id: "manifest-owned:inspection:read-first",
      serverId: "manifest-owned",
      projectId: "project.application",
      chapter: "inspection",
      title: "Read first",
      summary: "Inspect the manifest-owned MCP surface before runtime use.",
      createdAt: "2026-06-04T00:00:00.000Z",
      updatedAt: "2026-06-04T00:00:00.000Z",
    }]);
    const created = await createApplicationProjectRuntime(projectRoot, {
      now: () => "2026-06-04T00:00:00.000Z",
      runtimeId: "runtime.application.mcpMatrixManifest",
      sessionId: "session.application.mcpMatrixManifest",
      mcpPlusServers: [{
        serverId: "options-owned",
        transport: "stdio",
        command: "node",
        args: ["options-server.js"],
        manifest: {
          server: {
            id: "options-owned",
            title: "Options Owned",
            summary: "Application option MCP+ server.",
          },
          exposure: {
            pinnedTools: ["options.read"],
          },
        },
      }],
      mcpPlus: {
        projectId: "project.application",
        skillStore,
      },
      baseToolAdapters: {
        skill: {
          load: async () => ({
            ok: true,
            output: {
              name: "application.mcp.manifest.skill",
            },
          }),
        },
      },
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const inspected = await created.runtime.dispatch({
      type: "application.inspectMcpMountMatrix",
      nativeToolInventoryByServerId: {
        "manifest-owned": [
          { name: "manifest.read", description: "Read manifest state.", inputSchema: { type: "object", properties: {} } },
        ],
        "options-owned": [
          { name: "options.read", description: "Read options state.", inputSchema: { type: "object", properties: {} } },
        ],
      },
    });

    assert.equal(inspected.ok, true);
    const output = mcpMountMatrixOutput(inspected.output);
    assert.equal(output.matrix.status, "ready");
    assert.deepEqual(output.matrix.servers.map((server) => server.serverId), ["manifest-owned"]);
    assert.equal(output.matrix.servers[0]?.runtimeProfilePresent, true);
    assert.equal(output.matrix.servers[0]?.skillNoteCount, 1);
    assert.equal(output.matrix.totals.servers, 1);
    assert.equal(output.matrix.totals.mcpPlusServers, 1);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("application layer exports sandbox runtime mount matrix for upper applications", async () => {
  const matrix = await inspectSandboxRuntimeMountMatrix({
    sandbox: sandbox.hostObserved(),
    policyProfile: "standard",
    toolId: "shell.run",
  });

  assert.equal(matrix.surface, "runtime.sandboxPlane.mountMatrix");
  assert.equal(matrix.status, "degraded");
  assert.equal(matrix.sandbox.hostObserved, true);
  assert.equal(matrix.sandbox.isolationEvidence, "governed-host-observation");
  assert.equal(matrix.commandPlanPreview.executesCommand, false);
});
