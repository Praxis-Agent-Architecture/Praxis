import assert from "node:assert/strict";
import test from "node:test";

import { praxis } from "@praxis-ai/praxis";

import RepoInspectorAgent from "../agents/repoInspector/praxis.agent.js";
import { DeepPermissiveRepoInspectorAgent } from "../agents/repoInspector/agent.js";

test("fullstack repo inspector compiles through project agent entry", () => {
  const compiled = praxis.compileAgent(RepoInspectorAgent);
  assert.equal(compiled.ok, true);
  if (!compiled.ok) return;

  const validation = praxis.validateAgentManifest(compiled.manifest);
  assert.equal(validation.ok, true);
  if (!validation.ok) return;

  assert.equal(validation.manifest.identity.id, "agent.example.repoInspector.quick.standard");
  assert.equal(validation.manifest.model.model, "gpt-5.5");
  assert.equal(validation.manifest.session.persistence, "sqlite");
  assert.equal(validation.manifest.storage.kind, "rax-workspace");
  assert.equal(validation.manifest.promptPack.promptPackId, "prompt.example.repoInspector");
  assert.equal(validation.manifest.promptPack.materials.includes("repoInspector.toolRules"), true);
  assert.equal(validation.manifest.harness.tools.some((tool) => tool.toolId === "file.read"), true);
  assert.equal(validation.manifest.harness.tools.some((tool) => tool.toolId === "file.search"), true);
  assert.equal(validation.manifest.harness.tools.some((tool) => tool.toolId === "skill.load"), true);
});

test("fullstack repo inspector can mount declared BaseTools through runtime executor ports", () => {
  const compiled = praxis.compileAgent(RepoInspectorAgent);
  assert.equal(compiled.ok, true);
  if (!compiled.ok) return;

  const executor = praxis.runtime.createBaseToolExecutorPort({
    runtimeId: "runtime.example.repoInspector.test",
    sessionId: "session.example.repoInspector.test",
    policy: {
      workspaceRoot: process.cwd(),
      allowedRoots: [process.cwd()],
      allowRipgrep: true,
    },
    adapters: {
      skill: {
        load: async () => ({
          ok: true,
          output: {
            name: "repoInspector.skill.runtimeMount",
            summary: "test skill adapter",
          },
        }),
      },
    },
  });
  const supportByToolId = new Map(
    praxis.createBaseToolSupportCatalog({ executor }).map((entry) => [entry.toolId, entry]),
  );

  for (const toolId of ["file.read", "file.search", "skill.load"]) {
    assert.equal(compiled.manifest.harness.tools.some((tool) => tool.toolId === toolId), true);
    assert.equal(supportByToolId.get(toolId)?.readiness, "available");
  }
});

test("fullstack repo inspector can inspect sandbox mount readiness through public runtime facade", async () => {
  const compiled = praxis.compileAgent(RepoInspectorAgent);
  assert.equal(compiled.ok, true);
  if (!compiled.ok) return;

  const preparedSandbox = await praxis.sandboxPlane.prepareSandboxRuntime(compiled.manifest.sandbox, {
    cwd: process.cwd(),
    runSmoke: false,
  });
  const matrix = await praxis.runtime.inspectSandboxMountMatrix({
    sandbox: compiled.manifest.sandbox,
    policyProfile: compiled.manifest.toolPolicy.profile,
    preparedSandbox,
    toolId: "shell.run",
    command: {
      program: "true",
      cwd: process.cwd(),
    },
  });

  assert.equal(matrix.surface, "runtime.sandboxPlane.mountMatrix");
  assert.equal(matrix.sandbox.sandboxId, compiled.manifest.sandbox.sandboxId);
  assert.equal(matrix.provider.prepared, true);
  assert.equal(matrix.commandPlanPreview.executesCommand, false);
  assert.equal(matrix.falseReadyGuards.hostObservedNeverClaimsIsolation, true);
});

test("fullstack repo inspector records runtime session state and events through an injected store", async () => {
  const compiled = praxis.compileAgent(RepoInspectorAgent);
  assert.equal(compiled.ok, true);
  if (!compiled.ok) return;

  const runtimeId = "runtime.example.repoInspector.store.test";
  const sessionId = "session.example.repoInspector.store.test";
  const store = praxis.runtime.createInMemorySessionStateEventStore();
  const result = await praxis.runtime.createPraxisRuntimeKernel({ runtimeId }).runManifest(
    compiled.manifest,
    "Inspect this repo in dry-run mode.",
    {
      sessionId,
      dryRun: true,
      store,
      now: () => "2026-05-06T00:00:00.000Z",
    },
  );

  assert.equal(result.ok, true);
  const snapshot = await store.readSession(sessionId);
  assert.equal(snapshot.session?.status, "completed");
  assert.equal(snapshot.session?.runtimeId, runtimeId);
  assert.equal(snapshot.session?.agentId, compiled.manifest.identity.id);
  assert.equal(snapshot.states.at(-1)?.phase, "completed");
  assert.equal(snapshot.events.some((event) => event.type === "runtime.session.created"), true);
  assert.equal(snapshot.events.some((event) => event.type === "runtime.output.final"), true);
  assert.ok(snapshot.mainLoopSteps.some((step) => step.actionPrimitive === "buildCachePlan" && step.status === "completed"));
  assert.ok(snapshot.invocations.some((invocation) => invocation.kind === "model" && invocation.ok));
  assert.equal(snapshot.errors.length, 0);
});

test("fullstack deep permissive variant expands the harness", () => {
  const compiled = praxis.compileAgent(new DeepPermissiveRepoInspectorAgent({ persistence: "memory" }));
  assert.equal(compiled.ok, true);
  if (!compiled.ok) return;

  assert.equal(compiled.manifest.identity.id, "agent.example.repoInspector.deep.permissive");
  assert.equal(compiled.manifest.session.persistence, "memory");
  assert.equal(compiled.manifest.harness.tools.some((tool) => tool.toolId === "shell.run"), true);
  assert.equal(compiled.manifest.harness.tools.some((tool) => tool.toolId === "skill.load"), true);
  assert.ok(compiled.manifest.harness.tools.length > 5);
});
