import assert from "node:assert/strict";
import test from "node:test";

import { praxis } from "@praxis-ai/praxis";

import RaxodeCodingAgent from "../agents/codingAgent/agent.js";
import { createRaxodeBackendModuleInventory } from "../application/backendModuleInventory.js";
import { probeLocalRaxodeReadiness } from "../application/localReadinessProbe.js";
import { resolveRaxodeRaxcellBinaryPath } from "../application/raxcellSandboxProvider.js";
import {
  createRaxodeReadinessEvent,
  inspectRaxodeBackendReadiness,
} from "../application/runtimeReadiness.js";

function compileManifest(options: ConstructorParameters<typeof RaxodeCodingAgent>[0] = {}) {
  const compiled = praxis.compileAgent(new RaxodeCodingAgent(options));
  assert.equal(compiled.ok, true);
  return compiled.manifest;
}

test("raxode backend readiness summarizes new Praxis module surfaces", () => {
  const readiness = inspectRaxodeBackendReadiness({
    now: () => "2026-05-10T00:00:00.000Z",
  });

  assert.equal(readiness.kind, "raxode.backendReadiness");
  assert.equal(readiness.permissionProfile, "permissive");
  assert.equal(readiness.toolProfile, "agentCore");
  assert.equal(readiness.tools.mountedToolIds.length, 25);
  const tools = readiness.areas.find((area) => area.area === "tools");
  assert.equal(tools?.status, "ready");
  assert.equal(tools?.owner, "basetool");
  assert.equal(tools?.phase, "implemented");
  assert.equal(tools?.severity, "ok");
  assert.equal(tools?.facts.mountedToolCount, 25);
  assert.equal(tools?.facts.expectedToolCount, 25);

  const context = readiness.areas.find((area) => area.area === "context");
  assert.equal(context?.status, "ready");
  assert.equal(context?.owner, "applicationLayer");
  assert.equal(context?.phase, "passive");
  assert.deepEqual(context?.facts.surfaces, [
    "declaredRuntimeContext",
    "projectContext",
    "retrievedContext",
    "context.load",
  ]);

  const memory = readiness.areas.find((area) => area.area === "memory");
  assert.equal(memory?.status, "ready");
  assert.deepEqual(memory?.facts.surfaces, [
    "memoryContext",
    "sessionSummary",
    "file.search",
    "file.read",
    "memoryPlane.buildPromptGuide",
  ]);
  assert.equal(readiness.areas.find((area) => area.area === "dependency")?.status, "contract-ready");
  assert.equal(readiness.areas.find((area) => area.area === "sandbox")?.status, "contract-ready");
  assert.equal(readiness.areas.find((area) => area.area === "multiagent")?.status, "ready");
  assert.equal(readiness.policy.defaultMode, "permissive");
  assert.equal(readiness.policy.approvalSurface, "application-layer");
  assert.equal(readiness.sandbox.defaultExecution, "host-observed");
  assert.equal(readiness.sandbox.fallback, "workspace-rollback");
  assert.deepEqual(readiness.dependencies.map((dependency) => dependency.dependencyId), [
    "dependency.binary.node",
    "dependency.npm.tsx",
    "dependency.binary.raxcell",
    "dependency.secret.provider.core.main",
  ]);
  assert.deepEqual(readiness.dependencies.map((dependency) => dependency.degrade), [
    "block-backend-start",
    "use-built-dist-or-install",
    "degrade-to-workspace-rollback",
    "dry-run-or-auth-required-for-live",
  ]);
  assert.equal(readiness.moduleInventory.kind, "raxode.backendModuleInventory");
  assert.deepEqual(readiness.moduleInventory.modules.map((module) => module.moduleId), [
    "basetool",
    "promptPack",
    "context",
    "memory",
    "dependency",
    "auth",
    "projectSession",
    "modelAdapter",
    "sandbox",
    "cache",
    "multiagent",
  ]);
});

test("raxode readiness event is public-safe application metadata", () => {
  const readiness = inspectRaxodeBackendReadiness({
    now: () => "2026-05-10T00:00:00.000Z",
  });
  const event = createRaxodeReadinessEvent({
    readiness,
    now: () => "2026-05-10T00:00:00.000Z",
    view: {
      applicationId: "application.raxode.coding",
      projectId: "raxode",
      runtimeId: "runtime.application.raxode.coding",
      sessionId: "session.application.raxode.coding.default",
      agentId: "agent.raxode.coding",
      agentEntries: [],
      agents: { active: 1 },
      status: "ready",
      workspaceRoot: process.cwd(),
      mode: "dry-run",
      model: { model: "gpt-5.5", reasoningEffort: "low" },
      permissionProfile: "permissive",
      toolProfile: "codingCore",
      sessions: [],
      approvals: [],
      mcp: {
        servers: [],
        recommendedMode: "mcp-plus",
        nativeCompatible: true,
        publicSafe: true,
      },
      tools: {
        profile: "codingCore",
        availableProfiles: [],
        defaultPolicyProfile: "permissive",
        extensionSlots: [],
        total: 14,
        mounted: 24,
        byFamily: {},
        byRiskLevel: {},
        byReadiness: {},
        mountedToolIds: [],
      },
      counters: {
        turns: 0,
        events: 0,
        modelCalls: 0,
        toolCalls: 0,
        mainLoopSteps: 0,
      },
      lines: [],
      events: [],
    },
  });

  assert.equal(event.eventId, "raxode.backend.readiness");
  assert.equal(event.publicSafe, true);
  assert.equal((event.metadata?.readiness as typeof readiness | undefined)?.kind, "raxode.backendReadiness");
});

test("local readiness probe checks dependencies without reading secrets", () => {
  const manifest = compileManifest();
  const probe = probeLocalRaxodeReadiness({
    manifest,
    now: () => "2026-05-10T00:00:00.000Z",
    nodeVersion: "v22.22.3",
    resolvePackage: (packageName) => packageName === "tsx" ? "/repo/node_modules/tsx/dist/cli.mjs" : undefined,
  });

  assert.equal(probe.kind, "raxode.localReadinessProbe");
  assert.equal(probe.dependencies.find((dependency) => dependency.dependencyId === "dependency.binary.node")?.status, "ready");
  assert.equal(probe.dependencies.find((dependency) => dependency.dependencyId === "dependency.npm.tsx")?.status, "ready");
  const secretProbe = probe.dependencies.find((dependency) => dependency.dependencyId === "dependency.secret.provider.core.main");
  assert.equal(secretProbe?.status, "not-probed");
  assert.equal(secretProbe?.source, "auth-plane");
  assert.equal(probe.sandbox.status, "not-required");

  const currentProbe = probeLocalRaxodeReadiness({
    manifest,
    now: () => "2026-05-10T00:00:00.000Z",
    nodeVersion: "v25.0.0",
    resolvePackage: (packageName) => packageName === "tsx" ? "/repo/node_modules/tsx/dist/cli.mjs" : undefined,
  });
  assert.equal(currentProbe.dependencies.find((dependency) => dependency.dependencyId === "dependency.binary.node")?.status, "ready");
});

test("local readiness probe treats Raxcell as the linux strong sandbox provider", () => {
  const manifest = compileManifest({ sandboxProfile: "linuxBubblewrap" });
  const missingProbe = probeLocalRaxodeReadiness({
    manifest,
    now: () => "2026-05-10T00:00:00.000Z",
    nodeVersion: "v22.22.3",
    pathEnv: "/empty",
    fileExists: () => false,
    resolvePackage: (packageName) => packageName === "tsx" ? "/repo/node_modules/tsx/dist/cli.mjs" : undefined,
  });

  const missingRaxcell = missingProbe.dependencies.find((dependency) => dependency.dependencyId === "dependency.binary.raxcell");
  assert.equal(missingRaxcell?.status, "missing");
  assert.equal(missingRaxcell?.degrade, "degrade-to-workspace-rollback");
  assert.match(missingRaxcell?.message ?? "", /Raxcell/u);
  assert.equal(missingProbe.sandbox.status, "degraded");
  assert.match(missingProbe.sandbox.message ?? "", /Raxcell/u);

  const readyProbe = probeLocalRaxodeReadiness({
    manifest,
    now: () => "2026-05-10T00:00:00.000Z",
    nodeVersion: "v22.22.3",
    pathEnv: "/opt/raxcell/bin",
    fileExists: (filePath) => filePath === "/opt/raxcell/bin/raxcell",
    resolvePackage: (packageName) => packageName === "tsx" ? "/repo/node_modules/tsx/dist/cli.mjs" : undefined,
  });

  const readyRaxcell = readyProbe.dependencies.find((dependency) => dependency.dependencyId === "dependency.binary.raxcell");
  assert.equal(readyRaxcell?.status, "ready");
  assert.equal(readyRaxcell?.resolvedPath, "/opt/raxcell/bin/raxcell");
  assert.equal(readyProbe.sandbox.status, "ready");
  assert.equal(readyProbe.sandbox.executable, "/opt/raxcell/bin/raxcell");

  const packageReadyProbe = probeLocalRaxodeReadiness({
    manifest,
    now: () => "2026-05-10T00:00:00.000Z",
    nodeVersion: "v22.22.3",
    pathEnv: "/empty",
    fileExists: (filePath) => filePath === "/repo/node_modules/@praxis-ai/raxcell/dist/cli.js",
    resolvePackage: (packageName) => {
      if (packageName === "tsx") return "/repo/node_modules/tsx/dist/cli.mjs";
      if (packageName === "@praxis-ai/raxcell/package.json") return "/repo/node_modules/@praxis-ai/raxcell/package.json";
      return undefined;
    },
  });

  const packageRaxcell = packageReadyProbe.dependencies.find((dependency) => dependency.dependencyId === "dependency.binary.raxcell");
  assert.equal(packageRaxcell?.status, "ready");
  assert.equal(packageRaxcell?.resolvedPath, "/repo/node_modules/@praxis-ai/raxcell/dist/cli.js");
  assert.equal(packageReadyProbe.sandbox.status, "ready");
  assert.equal(packageReadyProbe.sandbox.executable, "/repo/node_modules/@praxis-ai/raxcell/dist/cli.js");
});

test("Raxode Raxcell provider bridge resolves the same binary surface as readiness", () => {
  assert.equal(resolveRaxodeRaxcellBinaryPath({
    env: {},
    pathEnv: "/empty",
    fileExists: () => false,
  }), undefined);
  assert.equal(resolveRaxodeRaxcellBinaryPath({
    env: {},
    pathEnv: "/opt/raxcell/bin",
    fileExists: (filePath) => filePath === "/opt/raxcell/bin/raxcell",
  }), "/opt/raxcell/bin/raxcell");
  assert.equal(resolveRaxodeRaxcellBinaryPath({
    env: { RAXCELL_BIN: "/custom/raxcell" },
    pathEnv: "/opt/raxcell/bin",
    fileExists: (filePath) => filePath === "/custom/raxcell",
  }), "/custom/raxcell");
  assert.equal(resolveRaxodeRaxcellBinaryPath({
    env: {},
    pathEnv: "/empty",
    fileExists: (filePath) => filePath === "/repo/node_modules/@praxis-ai/raxcell/dist/cli.js",
    resolvePackage: (packageName) => packageName === "@praxis-ai/raxcell/package.json"
      ? "/repo/node_modules/@praxis-ai/raxcell/package.json"
      : undefined,
  }), "/repo/node_modules/@praxis-ai/raxcell/dist/cli.js");
});

test("readiness can carry local probe degradation facts", () => {
  const manifest = compileManifest({ sandboxProfile: "linuxBubblewrap" });
  const probe = probeLocalRaxodeReadiness({
    manifest,
    now: () => "2026-05-10T00:00:00.000Z",
    nodeVersion: "v22.22.2",
    pathEnv: "/empty",
    fileExists: () => false,
    resolvePackage: () => undefined,
  });
  const readiness = inspectRaxodeBackendReadiness({
    manifest,
    probe,
    now: () => "2026-05-10T00:00:00.000Z",
  });

  const dependency = readiness.areas.find((area) => area.area === "dependency");
  const sandbox = readiness.areas.find((area) => area.area === "sandbox");
  assert.equal(dependency?.status, "degraded");
  assert.equal(dependency?.severity, "warning");
  assert.deepEqual(dependency?.facts.blockingProbeGaps, [
    "dependency.binary.raxcell",
    "dependency.binary.node",
    "dependency.npm.tsx",
  ]);
  assert.equal(sandbox?.status, "degraded");
  assert.equal(readiness.probe?.sandbox.status, "degraded");
  assert.equal(readiness.sandbox.probe?.fallback, "workspace-rollback");
  assert.equal(readiness.dependencies.find((item) => item.dependencyId === "dependency.binary.node")?.probe?.status, "version-mismatch");
});

test("backend module inventory proves all new Praxis surfaces are declared", () => {
  const manifest = compileManifest();
  const inventory = createRaxodeBackendModuleInventory({
    manifest,
    now: () => "2026-05-10T00:00:00.000Z",
  });

  assert.equal(inventory.kind, "raxode.backendModuleInventory");
  assert.equal(inventory.applicationId, "application.raxode.coding");
  assert.equal(inventory.agentId, "agent.raxode.coding");
  assert.equal(inventory.modules.length, 11);
  assert.equal(inventory.modules.find((module) => module.moduleId === "basetool")?.status, "ready");
  assert.equal(inventory.modules.find((module) => module.moduleId === "promptPack")?.status, "ready");
  assert.equal(inventory.modules.find((module) => module.moduleId === "context")?.status, "ready");
  assert.equal(inventory.modules.find((module) => module.moduleId === "memory")?.status, "ready");
  assert.equal(inventory.modules.find((module) => module.moduleId === "dependency")?.status, "ready");
  assert.equal(inventory.modules.find((module) => module.moduleId === "auth")?.status, "ready");
  assert.equal(inventory.modules.find((module) => module.moduleId === "projectSession")?.status, "ready");
  assert.equal(inventory.modules.find((module) => module.moduleId === "modelAdapter")?.status, "ready");
  assert.equal(inventory.modules.find((module) => module.moduleId === "sandbox")?.status, "ready");
  assert.equal(inventory.modules.find((module) => module.moduleId === "cache")?.status, "ready");
  assert.equal(inventory.modules.find((module) => module.moduleId === "multiagent")?.status, "ready");
  assert.equal(inventory.modules.some((module) => module.status === "missing"), false);
});
