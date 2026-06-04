import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createApplicationProjectRuntime,
  createLocalApplicationTransport,
} from "@praxis-ai/praxis/application-layer";
import type {
  SandboxExecutionProviderPort,
  SandboxProviderRunRequest,
} from "@praxis-ai/praxis/agent-core";
import type { AnthropicV1MessagesRequestEnvelope } from "@praxis-ai/praxis/provider/actualInvocationLayer/anthropic/v1_messages";
import type { OpenAIV1ResponsesRequestEnvelope } from "@praxis-ai/praxis/provider/actualInvocationLayer/openai/v1_responses";
import type { AuthEnvelope } from "@praxis-ai/praxis/provider/authProfileLayer/authEnvelope";

import {
  createRaxodeBackend,
  createRaxodeBackendRestServer,
} from "../raxodeBackend.js";

const backendRoot = path.resolve("raxode-cli/backend");
const fakeAuth: AuthEnvelope = {
  kind: "none",
  present: true,
  headerPlan: [],
  queryPlan: [],
  publicSafe: true,
};
const readyLocalReadinessProbe = {
  nodeVersion: "v22.22.3",
  resolvePackage: (packageName: string) =>
    packageName === "tsx" ? "/repo/node_modules/tsx/dist/cli.mjs" : undefined,
} as const;

function fakeRaxcellSandboxProvider(seen: SandboxProviderRunRequest[]): SandboxExecutionProviderPort {
  return {
    providerId: "test.raxcell",
    providerFamily: "linux-bubblewrap",
    async prepareRun(request) {
      seen.push(request);
      return {
        kind: "runtime.sandboxPlane.provider.prepareRunResult",
        ok: true,
        providerFamily: "linux-bubblewrap",
        filesystemLowering: null,
        backendArtifacts: [],
        metadata: { preparedBy: "test.raxcell" },
      };
    },
    async run(request) {
      return {
        kind: "runtime.sandboxPlane.provider.runResult",
        ok: true,
        providerFamily: "linux-bubblewrap",
        exitCode: 0,
        stdout: `sandbox-provider:${request.command.argv.join(" ")}\n`,
        stderr: "",
        timedOut: false,
        filesystemLowering: null,
        metadata: { ranBy: "test.raxcell" },
      };
    },
  };
}

function createIsolatedBackendRoot(): { backendRoot: string; cleanup: () => void } {
  const root = mkdtempSync(path.join(tmpdir(), "raxode-backend-project-"));
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ type: "module" }));
  const isolatedBackendRoot = path.join(root, "backend");
  cpSync(backendRoot, isolatedBackendRoot, {
    recursive: true,
    filter: (source) => !source.includes(`${path.sep}.raxode${path.sep}`) && !source.endsWith(`${path.sep}.raxode`),
  });
  return {
    backendRoot: isolatedBackendRoot,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

test("raxode backend runs through applicationLayer with codingCore defaults", async () => {
  const isolated = createIsolatedBackendRoot();
  const backend = await createRaxodeBackend({
    projectRoot: isolated.backendRoot,
    now: () => "2026-05-10T00:00:00.000Z",
    localReadinessProbe: readyLocalReadinessProbe,
  });
  try {
    const readiness = await backend.inspectReadiness();
    assert.equal(readiness.kind, "raxode.backendReadiness");
    assert.equal(readiness.probe?.sandbox.status, "not-required");
    assert.ok(readiness.dependencies.some((dependency) =>
      dependency.dependencyId === "dependency.binary.node" && dependency.probe?.status === "ready"));
    assert.ok(readiness.dependencies.some((dependency) =>
      dependency.dependencyId === "dependency.npm.tsx" && dependency.probe?.status === "ready"));
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
    const result = await backend.run({
      task: "dry-run readiness",
      cwd: isolated.backendRoot,
      mode: "dry-run",
      sessionId: "session.raxode.test",
    });
    assert.equal(result.ok, true);
    assert.equal(result.view.applicationId, "application.raxode.coding");
    assert.equal(result.view.sessionId, "session.raxode.test");
    assert.equal(result.view.agentId, "agent.raxode.coding");
    assert.equal(result.view.permissionProfile, "permissive");
    assert.equal(result.view.toolProfile, "agentCore");
    assert.equal(result.view.tools.mounted, 25);
    assert.equal(result.view.model.contextWindowTokens, 400_000);
    assert.equal(result.view.model.maxInputTokens, 272_000);
    assert.equal(result.view.model.inputBudgetThreshold, 0.95);
    assert.equal(result.view.model.usableInputTokens, 258_400);
  } finally {
    isolated.cleanup();
  }
});

test("raxode backend forwards OAO construction options into the compiled application agent", async () => {
  const isolated = createIsolatedBackendRoot();
  const backend = await createRaxodeBackend({
    projectRoot: isolated.backendRoot,
    policyProfile: "standard",
    sandboxProfile: "workspaceOnly",
    persistence: "memory",
    provider: "anthropic",
    endpointShape: "messages",
    providerRoute: "anthropic_messages",
    baseURL: "https://api.anthropic.test",
    model: "claude-test",
    reasoningEffort: "high",
    maxOutputTokens: 777,
    now: () => "2026-05-10T00:00:00.000Z",
    localReadinessProbe: readyLocalReadinessProbe,
  });
  try {
    const readiness = await backend.inspectReadiness();
    assert.equal(readiness.permissionProfile, "standard");
    assert.equal(readiness.sessionPersistence, "memory");
    assert.equal(readiness.sandboxProfile, "workspace-only");
    assert.equal(readiness.sandbox.defaultExecution, "workspace-rollback");
    assert.equal(readiness.model.provider, "anthropic");
    assert.equal(readiness.model.endpointShape, "messages");
    assert.equal(readiness.model.model, "claude-test");
    assert.equal(readiness.ports.approvalResolver, "default-policy");
    assert.equal(readiness.ports.liveProviderResolver, "raxode-default");

    const result = await backend.run({
      task: "dry-run configured backend",
      cwd: isolated.backendRoot,
      mode: "dry-run",
      sessionId: "session.raxode.configured.test",
    });
    assert.equal(result.ok, true);
    assert.equal(result.view.permissionProfile, "standard");
    assert.equal(result.view.model.provider, "anthropic");
    assert.equal(result.view.model.endpointShape, "messages");
    assert.equal(result.view.model.model, "claude-test");
    assert.equal(result.view.model.reasoningEffort, "high");
    assert.equal(result.view.model.maxOutputTokens, 777);
  } finally {
    isolated.cleanup();
  }
});

test("raxode backend exposes application runtime ports for GUI and service integration", async () => {
  const isolated = createIsolatedBackendRoot();
  const backend = await createRaxodeBackend({
    projectRoot: isolated.backendRoot,
    cwd: isolated.backendRoot,
    runtimeId: "runtime.raxode.gui.test",
    sessionId: "session.raxode.gui.test",
    authStateProvider: ({ sessionId, runtimeId, model }) => ({
      defaultRole: "core.main",
      activeProfileId: "auth.raxode.test",
      profiles: [{
        profileId: "auth.raxode.test",
        provider: model.provider ?? "openai",
        providerLabel: "Test Provider",
        endpointShape: model.endpointShape,
        credentialRefId: "credential.raxode.test",
        secretPresent: true,
        status: "active",
        publicSafe: true,
      }],
      lastAuditEventKind: `${sessionId}:${runtimeId}`,
      publicSafe: true,
    }),
    approvalResolver: async () => ({ status: "approved", resolvedBy: "test", reason: "test approval" }),
    agentReviewResolver: async () => ({ status: "approved", reviewedBy: "test", reason: "test review" }),
    contextArtifactAdapters: {
      context: {},
      artifact: {},
    },
    baseToolAdapters: {
      shell: {},
    },
    liveProviderResolver: async () => undefined,
    now: () => "2026-05-10T00:00:00.000Z",
    localReadinessProbe: readyLocalReadinessProbe,
  });
  try {
    const readiness = await backend.inspectReadiness();
    assert.equal(readiness.ports.approvalResolver, "configured");
    assert.equal(readiness.ports.agentReviewResolver, "configured");
    assert.equal(readiness.ports.contextArtifactAdapters, "configured");
    assert.equal(readiness.ports.baseToolAdapters, "configured");
    assert.equal(readiness.ports.authStateProvider, "configured");
    assert.equal(readiness.ports.liveProviderResolver, "configured");
    const result = await backend.run({
      task: "dry-run gui integration ports",
      cwd: isolated.backendRoot,
      mode: "dry-run",
    });
    assert.equal(result.ok, true);
    assert.equal(result.view.runtimeId, "runtime.raxode.gui.test");
    assert.equal(result.view.sessionId, "session.raxode.gui.test");
    assert.equal(result.view.workspaceRoot, isolated.backendRoot);
    assert.equal(result.view.auth?.activeProfileId, "auth.raxode.test");
    assert.equal(result.view.auth?.profiles[0]?.secretPresent, true);
    assert.equal(result.view.auth?.lastAuditEventKind, "session.raxode.gui.test:runtime.raxode.gui.test");
  } finally {
    isolated.cleanup();
  }
});

test("raxode REST server accepts GUI runtime ports and OAO options", async () => {
  const isolated = createIsolatedBackendRoot();
  const server = await createRaxodeBackendRestServer({
    projectRoot: isolated.backendRoot,
    host: "127.0.0.1",
    port: 0,
    cwd: isolated.backendRoot,
    runtimeId: "runtime.raxode.rest.test",
    sessionId: "session.raxode.rest.test",
    policyProfile: "restricted",
    sandboxProfile: "workspaceOnly",
    persistence: "memory",
    includeAllCatalogTools: false,
    model: "gpt-5.5",
    reasoningEffort: "minimal",
    maxOutputTokens: 333,
    authStateProvider: ({ sessionId, runtimeId, model }) => ({
      defaultRole: "core.main",
      activeProfileId: "auth.raxode.rest.test",
      profiles: [{
        profileId: "auth.raxode.rest.test",
        provider: model.provider ?? "openai",
        providerLabel: "REST Test Provider",
        endpointShape: model.endpointShape,
        credentialRefId: "credential.raxode.rest.test",
        secretPresent: true,
        status: "active",
        publicSafe: true,
      }],
      lastAuditEventKind: `${sessionId}:${runtimeId}`,
      publicSafe: true,
    }),
    approvalResolver: async () => ({ status: "approved", resolvedBy: "rest-test", reason: "rest approval" }),
    liveProviderResolver: async () => undefined,
    now: () => "2026-05-10T00:00:00.000Z",
    localReadinessProbe: readyLocalReadinessProbe,
  });
  try {
    const start = await fetch(`${server.url}/application/commands`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "application.start",
        cwd: isolated.backendRoot,
        mode: "dry-run",
      }),
    });
    assert.equal(start.status, 200);
    const startPayload = await start.json() as {
      ok?: boolean;
      view?: {
        runtimeId?: string;
        sessionId?: string;
        permissionProfile?: string;
        tools?: { mounted?: number };
        model?: { reasoningEffort?: string; maxOutputTokens?: number };
        auth?: { activeProfileId?: string; lastAuditEventKind?: string };
      };
    };
    assert.equal(startPayload.ok, true);
    assert.equal(startPayload.view?.runtimeId, "runtime.raxode.rest.test");
    assert.equal(startPayload.view?.sessionId, "session.raxode.rest.test");
    assert.equal(startPayload.view?.permissionProfile, "restricted");
    assert.equal(startPayload.view?.tools?.mounted, 6);
    assert.equal(startPayload.view?.model?.reasoningEffort, "minimal");
    assert.equal(startPayload.view?.model?.maxOutputTokens, 333);
    assert.equal(startPayload.view?.auth?.activeProfileId, "auth.raxode.rest.test");
    assert.equal(startPayload.view?.auth?.lastAuditEventKind, "session.raxode.rest.test:runtime.raxode.rest.test");

    const view = await fetch(`${server.url}/application/view`);
    assert.equal(view.status, 200);
    const viewPayload = await view.json() as { status?: string; tools?: { mounted?: number } };
    assert.equal(viewPayload.status, "ready");
    assert.equal(viewPayload.tools?.mounted, 6);
  } finally {
    await server.close();
    isolated.cleanup();
  }
});

test("raxode application runtime preserves same-session turns in the next provider prompt", async () => {
  const isolated = createIsolatedBackendRoot();
  const providerBodies: unknown[] = [];
  const events: unknown[] = [];
  const created = await createApplicationProjectRuntime(isolated.backendRoot, {
    applicationId: "application.raxode.coding",
    mode: "live",
    provider: "openai",
    endpointShape: "responses",
    providerRoute: "openai_responses",
    model: "gpt-5.5",
    reasoningEffort: "low",
    permissionProfile: "permissive",
    toolProfile: "agentCore",
    now: () => "2026-05-10T00:00:00.000Z",
    liveProviderResolver: async () => ({
      auth: fakeAuth,
      provider: "openai",
      endpointShape: "responses",
      providerRoute: "openai_responses",
      providerCaller: async (envelope: OpenAIV1ResponsesRequestEnvelope) => {
        providerBodies.push(envelope.body);
        return {
          id: providerBodies.length === 1 ? "resp-history-1" : "resp-history-2",
          output_text: providerBodies.length === 1
            ? "已记住暗号 BLUE-ORBIT。"
            : "刚才的暗号是 BLUE-ORBIT。",
        };
      },
    }),
  });
  assert.equal(created.ok, true);
  if (!created.ok) {
    isolated.cleanup();
    return;
  }
  const transport = createLocalApplicationTransport(created.runtime);
  const unsubscribe = transport.subscribe((event) => events.push(event));
  const sessionId = "session.raxode.history.test";
  try {
    const start = await transport.dispatch({
      type: "application.start",
      sessionId,
      cwd: isolated.backendRoot,
      mode: "live",
    });
    assert.equal(start.ok, true, start.ok ? undefined : JSON.stringify(start.error));
    const first = await transport.dispatch({
      type: "application.submitTurn",
      sessionId,
      mode: "live",
      input: {
        type: "application.input",
        text: "请记住暗号 BLUE-ORBIT。",
        cwd: isolated.backendRoot,
      },
    });
    assert.equal(first.ok, true);
    assert.deepEqual(first.output, { text: "已记住暗号 BLUE-ORBIT。" });
    const firstBody = JSON.stringify(providerBodies[0]);
    assert.match(firstBody, /declaredRuntimeContext/u);
    assert.match(firstBody, /toolDeclarations/u);
    assert.match(firstBody, /file\.read/u);
    assert.match(firstBody, /patch\.apply/u);

    const second = await transport.dispatch({
      type: "application.submitTurn",
      sessionId,
      mode: "live",
      input: {
        type: "application.input",
        text: "刚才的暗号是什么？",
        cwd: isolated.backendRoot,
      },
    });
    assert.equal(second.ok, true);
    assert.ok(second.view.context);
    assert.equal(second.view.context.source, "application.history.estimate");
    assert.ok((second.view.context.activeTokens ?? 0) > 0);
  } finally {
    unsubscribe();
    isolated.cleanup();
  }
  assert.equal(providerBodies.length, 2);
  assert.equal((providerBodies[1] as { previous_response_id?: string }).previous_response_id, undefined);
  const secondBody = JSON.stringify(providerBodies[1]);
  assert.match(secondBody, /请记住暗号 BLUE-ORBIT/u);
  assert.match(secondBody, /已记住暗号 BLUE-ORBIT/u);
  assert.match(secondBody, /Current user request/u);
  assert.match(secondBody, /刚才的暗号是什么/u);

  const completedModelEvents = events
    .map((event) => event as {
      kind?: string;
      metadata?: {
        modelPhase?: string;
        providerResponseId?: string;
        previousProviderResponseId?: string;
        cacheDebug?: {
          promptPack: {
            segments: readonly {
              segmentKind: string;
              materialCount: number;
              estimatedTokens: number;
              materialRefs?: readonly string[];
            }[];
          };
          comparisonToPrevious?: {
            stablePrefixChanged?: boolean;
            dynamicPayloadChanged?: boolean;
            changedFingerprintKeys?: readonly string[];
          };
        };
      };
    })
    .filter((event) => event.kind === "model" && event.metadata?.modelPhase === "completed");
  assert.equal(completedModelEvents.length, 2);
  assert.equal(completedModelEvents[0]?.metadata?.providerResponseId, "resp-history-1");
  assert.equal(completedModelEvents[1]?.metadata?.providerResponseId, "resp-history-2");
  assert.equal(completedModelEvents[1]?.metadata?.cacheDebug?.comparisonToPrevious?.stablePrefixChanged, false);
  assert.equal(completedModelEvents[1]?.metadata?.cacheDebug?.comparisonToPrevious?.dynamicPayloadChanged, true);
  assert.ok(completedModelEvents[1]?.metadata?.cacheDebug?.comparisonToPrevious?.changedFingerprintKeys?.includes("inputHash"));
  const recentConversationSegment = completedModelEvents[1]?.metadata?.cacheDebug?.promptPack.segments.find((segment) =>
    segment.segmentKind === "recentConversation"
  );
  assert.ok(recentConversationSegment);
  assert.ok(recentConversationSegment.materialCount >= 2);
  assert.equal(recentConversationSegment.estimatedTokens > 0, true);
  assert.ok(recentConversationSegment.materialRefs?.[0]?.includes("turn.1.user"));
  assert.ok(recentConversationSegment.materialRefs?.at(-1)?.includes("turn.1.assistant.final"));
});

test("raxode application runtime places memory semantic index in memoryContext", async () => {
  const isolated = createIsolatedBackendRoot();
  const memoryRoot = mkdtempSync(path.join(tmpdir(), "raxode-memory-context-"));
  mkdirSync(path.join(memoryRoot, "daily"), { recursive: true });
  writeFileSync(
    path.join(memoryRoot, "MEMORY.md"),
    "# Project Memory\n\n## Stable Facts\n\n- raxode核心目标: build GUI-first coding product.\n",
    "utf8",
  );
  writeFileSync(
    path.join(memoryRoot, "daily", "2026-05-10.md"),
    "# Daily Memory 2026-05-10\n\n## Notes\n\n- daily验证: memoryContext layer seven works.\n",
    "utf8",
  );
  const providerBodies: unknown[] = [];
  const backend = await createRaxodeBackend({
    projectRoot: isolated.backendRoot,
    projectMemoryRoot: memoryRoot,
    memoryProfile: "appendOnly",
    now: () => "2026-05-10T00:00:00.000Z",
    localReadinessProbe: readyLocalReadinessProbe,
    liveProviderResolver: async () => ({
      auth: fakeAuth,
      provider: "openai",
      endpointShape: "responses",
      providerRoute: "openai_responses",
      providerCaller: async (envelope: OpenAIV1ResponsesRequestEnvelope) => {
        providerBodies.push(envelope.body);
        return { id: "resp-memory-context", output_text: "memory context ok" };
      },
    }),
  });
  try {
    const result = await backend.run({
      task: "inspect memory context",
      cwd: isolated.backendRoot,
      mode: "live",
      sessionId: "session.raxode.memory-context.test",
    });
    assert.equal(result.ok, true);
    const bodyText = JSON.stringify(providerBodies[0]);
    assert.match(bodyText, /Memory semantic index/u);
    assert.match(bodyText, /raxode核心目标/u);
    assert.match(bodyText, /MEMORY\.md:5/u);
    assert.match(bodyText, /daily\/2026-05-10\.md:5/u);
    const modelCompleted = result.view.events.find((event) =>
      event.kind === "model" && event.metadata?.modelPhase === "completed"
    );
    const cacheDebug = modelCompleted?.metadata?.cacheDebug as
      | {
          promptPack?: {
            segments?: Array<{
              segmentKind?: string;
              materialCount?: number;
              estimatedTokens?: number;
            }>;
          };
        }
      | undefined;
    const memorySegment = cacheDebug?.promptPack?.segments?.find((segment) =>
      segment.segmentKind === "memoryContext"
    );
    assert.equal(memorySegment?.materialCount, 1);
    assert.ok((memorySegment?.estimatedTokens ?? 0) > 0);
  } finally {
    isolated.cleanup();
    rmSync(memoryRoot, { recursive: true, force: true });
  }
});

test("raxode application runtime mounts multiagent tools for application sessions", async () => {
  const isolated = createIsolatedBackendRoot();
  let providerCalls = 0;
  const providerBodies: unknown[] = [];
  const created = await createApplicationProjectRuntime(isolated.backendRoot, {
    applicationId: "application.raxode.coding",
    mode: "live",
    provider: "openai",
    endpointShape: "responses",
    providerRoute: "openai_responses",
    model: "gpt-5.5",
    reasoningEffort: "low",
    permissionProfile: "bapr",
    toolProfile: "agentCore",
    now: () => "2026-05-10T00:00:00.000Z",
    liveProviderResolver: async () => ({
      auth: fakeAuth,
      provider: "openai",
      endpointShape: "responses",
      providerRoute: "openai_responses",
      providerCaller: async (envelope: OpenAIV1ResponsesRequestEnvelope) => {
        providerBodies.push(envelope.body);
        providerCalls += 1;
        if (providerCalls === 1) {
          return {
            output: [{
              type: "function_call",
              name: "praxis_tool_agent_spawn",
              call_id: "agent-spawn-call-1",
              arguments: JSON.stringify({
                task: "Inspect the markdown editor task.",
                lifecycle: "persistent",
                name: "inspector",
              }),
            }],
          };
        }
        return { output_text: "agent spawned" };
      },
    }),
  });
  assert.equal(created.ok, true);
  if (!created.ok) {
    isolated.cleanup();
    return;
  }
  const transport = createLocalApplicationTransport(created.runtime);
  const sessionId = "direct-application-agent-tool-test";
  try {
    const start = await transport.dispatch({
      type: "application.start",
      sessionId,
      cwd: isolated.backendRoot,
      mode: "live",
    });
    assert.equal(start.ok, true, start.ok ? undefined : JSON.stringify(start.error));
    const turn = await transport.dispatch({
      type: "application.submitTurn",
      sessionId,
      mode: "live",
      input: {
        type: "application.input",
        text: "Spawn an inspector agent.",
        cwd: isolated.backendRoot,
      },
    });
    assert.equal(turn.ok, true);
    assert.equal(providerCalls, 2);
    assert.equal((providerBodies[0] as { previous_response_id?: string }).previous_response_id, undefined);
    assert.equal((providerBodies[1] as { previous_response_id?: string }).previous_response_id, undefined);
    assert.equal(turn.view.sessionId, sessionId);
    assert.equal(turn.view.counters.toolCalls, 1);
    assert.equal(turn.view.finalOutput, "agent spawned");
    const followup = await transport.dispatch({
      type: "application.submitTurn",
      sessionId,
      mode: "live",
      input: {
        type: "application.input",
        text: "上一轮调用了什么工具？",
        cwd: isolated.backendRoot,
      },
    });
    assert.equal(followup.ok, true);
    assert.ok(providerCalls >= 3);
    const followupBody = JSON.stringify(providerBodies.at(-1));
    assert.match(followupBody, /Tool call completed: agent\.spawn/u);
    assert.match(followupBody, /agent-spawn-call-1/u);
  } finally {
    isolated.cleanup();
  }
});

test("raxode application runtime routes linux sandbox shell calls through injected Raxcell provider", async () => {
  const isolated = createIsolatedBackendRoot();
  const sandboxRequests: SandboxProviderRunRequest[] = [];
  let providerCalls = 0;
  const created = await createApplicationProjectRuntime(isolated.backendRoot, {
    applicationId: "application.raxode.coding",
    mode: "live",
    provider: "openai",
    endpointShape: "responses",
    providerRoute: "openai_responses",
    model: "gpt-5.5",
    reasoningEffort: "low",
    permissionProfile: "bapr",
    toolProfile: "agentCore",
    agentOptions: { sandboxProfile: "linuxBubblewrap", policyProfile: "bapr" },
    sandboxProvider: fakeRaxcellSandboxProvider(sandboxRequests),
    now: () => "2026-05-10T00:00:00.000Z",
    liveProviderResolver: async () => ({
      auth: fakeAuth,
      provider: "openai",
      endpointShape: "responses",
      providerRoute: "openai_responses",
      providerCaller: async () => {
        providerCalls += 1;
        if (providerCalls === 1) {
          return {
            output: [{
              type: "function_call",
              name: "shell.run",
              call_id: "raxcell-shell-call-1",
              arguments: JSON.stringify({
                command: "printf 'raxcell tui'",
                cwd: isolated.backendRoot,
                timeoutMs: 1000,
                context: {
                  dryRun: false,
                  workspaceRoot: isolated.backendRoot,
                  allowedRoots: [isolated.backendRoot],
                },
              }),
            }],
          };
        }
        return { output_text: "shell completed in injected raxcell provider" };
      },
    }),
  });
  assert.equal(created.ok, true);
  if (!created.ok) {
    isolated.cleanup();
    return;
  }

  const transport = createLocalApplicationTransport(created.runtime);
  const sessionId = "direct-application-raxcell-sandbox-test";
  try {
    const start = await transport.dispatch({
      type: "application.start",
      sessionId,
      cwd: isolated.backendRoot,
      mode: "live",
    });
    assert.equal(start.ok, true, start.ok ? undefined : JSON.stringify(start.error));
    const turn = await transport.dispatch({
      type: "application.submitTurn",
      sessionId,
      mode: "live",
      input: {
        type: "application.input",
        text: "Run printf through the linux sandbox.",
        cwd: isolated.backendRoot,
      },
    });

    assert.equal(turn.ok, true);
    assert.equal(providerCalls, 2);
    assert.equal(sandboxRequests.length, 1);
    assert.deepEqual(sandboxRequests[0]?.command.argv, ["sh", "-lc", "printf 'raxcell tui'"]);
    assert.equal(sandboxRequests[0]?.policy.profile, "bapr");
    assert.equal(sandboxRequests[0]?.policy.sandboxMode, "isolated");
    assert.equal(sandboxRequests[0]?.metadata.policyProfile, "bapr");
    assert.equal(turn.view.counters.toolCalls, 1);
    assert.equal(turn.view.finalOutput, "shell completed in injected raxcell provider");
  } finally {
    isolated.cleanup();
  }
});

test("raxode application runtime binds multiagent workspace to application cwd", async () => {
  const isolated = createIsolatedBackendRoot();
  const workspaceRoot = mkdtempSync(path.join(tmpdir(), "raxode-agent-workspace-"));
  let providerCalls = 0;
  const created = await createApplicationProjectRuntime(isolated.backendRoot, {
    applicationId: "application.raxode.coding",
    cwd: workspaceRoot,
    mode: "live",
    provider: "openai",
    endpointShape: "responses",
    providerRoute: "openai_responses",
    model: "gpt-5.5",
    reasoningEffort: "low",
    permissionProfile: "bapr",
    toolProfile: "agentCore",
    now: () => "2026-05-10T00:00:00.000Z",
    liveProviderResolver: async () => ({
      auth: fakeAuth,
      provider: "openai",
      endpointShape: "responses",
      providerRoute: "openai_responses",
      providerCaller: async () => {
        providerCalls += 1;
        if (providerCalls === 1) {
          return {
            output: [{
              type: "function_call",
              name: "praxis_tool_agent_spawn",
              call_id: "agent-spawn-workspace-call-1",
              arguments: JSON.stringify({
                requesterSessionId: "direct-application-agent-workspace-test",
                workingDirectory: workspaceRoot,
                task: "Inspect the caller workspace.",
                lifecycle: "persistent",
                name: "workspace-inspector",
              }),
            }],
          };
        }
        return { output_text: "agent spawned in caller workspace" };
      },
    }),
  });
  assert.equal(created.ok, true);
  if (!created.ok) {
    rmSync(workspaceRoot, { recursive: true, force: true });
    isolated.cleanup();
    return;
  }
  const transport = createLocalApplicationTransport(created.runtime);
  const sessionId = "direct-application-agent-workspace-test";
  try {
    const start = await transport.dispatch({
      type: "application.start",
      sessionId,
      cwd: workspaceRoot,
      mode: "live",
    });
    assert.equal(start.ok, true);
    assert.equal(start.view.workspaceRoot, workspaceRoot);
    const turn = await transport.dispatch({
      type: "application.submitTurn",
      sessionId,
      mode: "live",
      input: {
        type: "application.input",
        text: "Spawn an inspector agent in the caller workspace.",
        cwd: workspaceRoot,
      },
    });
    assert.equal(turn.ok, true);
    assert.equal(providerCalls, 2);
    assert.equal(turn.view.finalOutput, "agent spawned in caller workspace");
    assert.equal(turn.view.agents.active, 2);
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
    isolated.cleanup();
  }
});

test("raxode application runtime runs spawned agents as background sessions", async () => {
  const isolated = createIsolatedBackendRoot();
  const workspaceRoot = mkdtempSync(path.join(tmpdir(), "raxode-agent-workspace-"));
  let parentStep = 0;
  let spawnedMessageId = "";
  const created = await createApplicationProjectRuntime(isolated.backendRoot, {
    applicationId: "application.raxode.coding",
    cwd: workspaceRoot,
    mode: "live",
    provider: "openai",
    endpointShape: "responses",
    providerRoute: "openai_responses",
    model: "gpt-5.5",
    reasoningEffort: "low",
    permissionProfile: "bapr",
    toolProfile: "agentCore",
    now: () => "2026-05-10T00:00:00.000Z",
    liveProviderResolver: async (_manifest, context) => ({
      auth: fakeAuth,
      provider: "openai",
      endpointShape: "responses",
      providerRoute: "openai_responses",
      providerCaller: async (envelope) => {
        const bodyText = JSON.stringify(envelope.body);
        if (context?.sessionId?.startsWith("agent-session.")) {
          return { output_text: "child review result: no critical vulnerabilities" };
        }
        parentStep += 1;
        if (parentStep === 1) {
          return {
            output: [{
              type: "function_call",
              name: "praxis_tool_agent_spawn",
              call_id: "agent-spawn-background-call-1",
              arguments: JSON.stringify({
                task: "Review markdown-editor for critical vulnerabilities.",
                lifecycle: "oneshot",
                name: "reviewer",
                workingDirectory: workspaceRoot,
              }),
            }],
          };
        }
        if (parentStep === 2) {
          const match = bodyText.match(/agent-message\.[A-Za-z0-9_.-]+/u);
          spawnedMessageId = match?.[0] ?? spawnedMessageId;
          assert.ok(spawnedMessageId.length > 0);
          return {
            output: [{
              type: "function_call",
              name: "praxis_tool_agent_wait",
              call_id: "agent-wait-background-call-1",
              arguments: JSON.stringify({
                messageId: spawnedMessageId,
                timeoutMs: 10_000,
              }),
            }],
          };
        }
        return { output_text: "parent received child review result" };
      },
    }),
  });
  assert.equal(created.ok, true);
  if (!created.ok) {
    rmSync(workspaceRoot, { recursive: true, force: true });
    isolated.cleanup();
    return;
  }
  const transport = createLocalApplicationTransport(created.runtime);
  const sessionId = "direct-application-agent-background-test";
  try {
    const start = await transport.dispatch({
      type: "application.start",
      sessionId,
      cwd: workspaceRoot,
      mode: "live",
    });
    assert.equal(start.ok, true);
    const turn = await transport.dispatch({
      type: "application.submitTurn",
      sessionId,
      mode: "live",
      input: {
        type: "application.input",
        text: "Spawn a reviewer agent and wait for its result.",
        cwd: workspaceRoot,
      },
    });
    assert.equal(turn.ok, true);
    assert.equal(turn.view.finalOutput, "parent received child review result");
    assert.equal(parentStep, 3);
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
    isolated.cleanup();
  }
});

test("raxode application runtime builds Anthropic messages body through configured provider route", async () => {
  const isolated = createIsolatedBackendRoot();
  const providerBodies: unknown[] = [];
  const created = await createApplicationProjectRuntime(isolated.backendRoot, {
    applicationId: "application.raxode.coding",
    mode: "live",
    provider: "anthropic",
    endpointShape: "messages",
    providerRoute: "anthropic_messages",
    baseURL: "https://api.deepseek.com/anthropic",
    model: "deepseek-v4-pro",
    reasoningEffort: "high",
    maxOutputTokens: 384_000,
    permissionProfile: "permissive",
    toolProfile: "agentCore",
    liveProviderResolver: async () => ({
      auth: fakeAuth,
      provider: "anthropic",
      endpointShape: "messages",
      providerRoute: "anthropic_messages",
      anthropicMessagesCaller: async (envelope: AnthropicV1MessagesRequestEnvelope) => {
        providerBodies.push(envelope.body);
        return [
          "event: message_start",
          "data: {\"type\":\"message_start\",\"message\":{\"id\":\"msg-anthropic-test\",\"type\":\"message\",\"role\":\"assistant\",\"model\":\"deepseek-v4-pro\",\"content\":[],\"usage\":{\"input_tokens\":101,\"cache_creation_input_tokens\":9,\"cache_read_input_tokens\":91,\"output_tokens\":1}}}",
          "",
          "event: content_block_start",
          "data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}",
          "",
          "event: content_block_delta",
          "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"ok\"}}",
          "",
          "event: message_delta",
          "data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"},\"usage\":{\"output_tokens\":7}}",
          "",
          "event: message_stop",
          "data: {\"type\":\"message_stop\"}",
          "",
          "data: [DONE]",
          "",
        ].join("\n");
      },
    }),
  });
  assert.equal(created.ok, true);
  if (!created.ok) {
    isolated.cleanup();
    return;
  }
  const transport = createLocalApplicationTransport(created.runtime);
  const sessionId = "session.raxode.anthropic.body.test";
  try {
    const start = await transport.dispatch({
      type: "application.start",
      sessionId,
      cwd: isolated.backendRoot,
      mode: "live",
    });
    assert.equal(start.ok, true);
    const turn = await transport.dispatch({
      type: "application.submitTurn",
      sessionId,
      mode: "live",
      input: {
        type: "application.input",
        text: "say ok",
        cwd: isolated.backendRoot,
      },
    });
    assert.equal(turn.ok, true);
    assert.equal(providerBodies.length, 1);
    const body = providerBodies[0] as {
      model?: string;
      max_tokens?: number;
      stream?: boolean;
      thinking?: { type?: string };
      tools?: unknown[];
      system?: string | Array<{ text?: string }>;
      messages?: Array<{ role?: string; content?: unknown }>;
    };
    assert.equal(body.model, "deepseek-v4-pro");
    assert.equal(body.max_tokens, 384_000);
    assert.equal(body.stream, true);
    assert.equal(body.thinking?.type, "enabled");
    assert.ok((body.tools?.length ?? 0) > 0);
    assert.match(JSON.stringify(body.system), /toolDeclarations/u);
    assert.match(JSON.stringify(body.messages), /say ok/u);
  } finally {
    isolated.cleanup();
  }
});
