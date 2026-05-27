import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createApplicationRestServer,
  createApplicationWebSocketServer,
  createApplicationProjectRuntime,
  createLocalApplicationTransport,
  describeApplicationRestTransport,
  describeApplicationWebSocketTransport,
  loadApplicationProject,
} from "../../src/applicationLayer/index.js";
import {
  applicationRuntimeTestHooks,
  invokeOpenAIResponsesApplicationAdapter,
} from "../../src/applicationLayer/applicationRuntime.js";
import { createApiKeyAuthEnvelope } from "../../src/modelAdapter/authProfileLayer/authEnvelope.js";
import { createCredentialRef } from "../../src/modelAdapter/authProfileLayer/credentialRef.js";
import {
  bindRuntimeAuthRole,
  createInMemoryRuntimeAuthSecretVault,
  createRuntimeAuthProviderProfile,
  createRuntimeAuthRegistry,
  createRuntimeAuthResolver,
  createRuntimeAuthSecretRecord,
  runtimeAuthCredentialRef,
} from "../../src/runtimeImplementation/runtime.authPlane/index.js";

const DOCTOR_PROJECT = "src/devdoctor";

test("applicationLayer loads a Praxis application project descriptor", async () => {
  const loaded = await loadApplicationProject(DOCTOR_PROJECT);
  assert.equal(loaded.ok, true);
  if (!loaded.ok) return;
  assert.equal(loaded.project.projectId, "praxis.doctor");
  assert.equal(loaded.project.applicationId, "application.praxis.doctor");
  assert.equal(loaded.project.agentEntryPath.endsWith("src/devdoctor/praxis.agent.ts"), true);
  assert.equal(loaded.project.agentEntries.primary?.agentId, "agent.praxis.doctor");
});

test("applicationLayer WebSocket server streams ready and command results", async () => {
  const created = await createApplicationProjectRuntime(DOCTOR_PROJECT, {
    now: () => "2026-05-10T00:00:00.000Z",
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const wsServer = await createApplicationWebSocketServer(created.runtime);
  const socket = new WebSocket(wsServer.url);
  try {
    const ready = await waitForWebSocketMessage(socket, (message) => message.type === "application.ready");
    assert.equal(ready.type, "application.ready");
    socket.send(JSON.stringify({
      type: "application.command",
      commandId: "ws-permission",
      command: {
        type: "application.changePermissionProfile",
        profile: "permissive",
      },
    }));
    const result = await waitForWebSocketMessage(socket, (message) =>
      message.type === "application.commandResult" && message.commandId === "ws-permission",
    );
    assert.equal(result.type, "application.commandResult");
    if (result.type === "application.commandResult") {
      assert.equal(result.result.ok, true);
      assert.equal(result.result.view.permissionProfile, "permissive");
    }
  } finally {
    socket.close();
    await wsServer.close();
  }
});

async function waitForWebSocketMessage(
  socket: WebSocket,
  predicate: (message: import("../../src/applicationLayer/index.js").PraxisApplicationProtocolMessage) => boolean,
  timeoutMs = 4000,
): Promise<import("../../src/applicationLayer/index.js").PraxisApplicationProtocolMessage> {
  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.removeEventListener("message", onMessage);
      reject(new Error("timed out waiting for websocket message"));
    }, timeoutMs);
    const onMessage = (event: MessageEvent) => {
      const message = JSON.parse(String(event.data)) as import("../../src/applicationLayer/index.js").PraxisApplicationProtocolMessage;
      if (!predicate(message)) return;
      clearTimeout(timeout);
      socket.removeEventListener("message", onMessage);
      resolve(message);
    };
    socket.addEventListener("message", onMessage);
  });
}

test("applicationLayer REST server exposes view and command endpoints", async () => {
  const created = await createApplicationProjectRuntime(DOCTOR_PROJECT, {
    now: () => "2026-05-10T00:00:00.000Z",
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const rest = await createApplicationRestServer(created.runtime);
  try {
    const viewResponse = await fetch(`${rest.url}/application/view`);
    assert.equal(viewResponse.status, 200);
    const view = await viewResponse.json() as { applicationId?: string };
    assert.equal(view.applicationId, "application.praxis.doctor");

    const commandResponse = await fetch(`${rest.url}/application/commands`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "application.changePermissionProfile",
        profile: "yolo",
      }),
    });
    assert.equal(commandResponse.status, 200);
    const result = await commandResponse.json() as { ok?: boolean; view?: { permissionProfile?: string } };
    assert.equal(result.ok, true);
    assert.equal(result.view?.permissionProfile, "yolo");
  } finally {
    await rest.close();
  }
});

test("applicationLayer exposes public-safe auth state injected by the upper app", async () => {
  const seenSessions: string[] = [];
  const created = await createApplicationProjectRuntime(DOCTOR_PROJECT, {
    now: () => "2026-05-10T00:00:00.000Z",
    authStateProvider: ({ sessionId }) => {
      seenSessions.push(sessionId);
      return {
        defaultRole: "primary",
        activeProfileId: `profile.${sessionId}`,
        profiles: [{
          profileId: `profile.${sessionId}`,
          provider: "gemini",
          providerLabel: "Gemini",
          endpointShape: "gemini_generate_content",
          credentialRefId: "credential.gemini.default",
          secretId: "secret.gemini.default",
          secretPresent: true,
          status: "active",
          publicSafe: true,
        }],
        publicSafe: true,
      };
    },
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const result = await created.runtime.dispatch({ type: "application.start", sessionId: "session.auth.target" });
  assert.equal(result.ok, true);
  assert.equal(result.view.auth?.activeProfileId, "profile.session.auth.target");
  assert.equal(result.view.auth?.profiles[0]?.secretPresent, true);
  assert.equal(JSON.stringify(result.view.auth).includes("sk-"), false);
  assert.equal(seenSessions.at(-1), "session.auth.target");
});

test("applicationLayer refreshes auth state with the compiled start manifest", async () => {
  const seenManifestIds: Array<string | undefined> = [];
  const created = await createApplicationProjectRuntime(DOCTOR_PROJECT, {
    now: () => "2026-05-10T00:00:00.000Z",
    authStateProvider: ({ manifest }) => {
      const manifestAgentId = manifest?.identity.id;
      seenManifestIds.push(manifestAgentId);
      return {
        defaultRole: "primary",
        activeProfileId: manifestAgentId === undefined ? "profile.missing" : `profile.${manifestAgentId}`,
        profiles: [{
          profileId: manifestAgentId === undefined ? "profile.missing" : `profile.${manifestAgentId}`,
          provider: manifest?.model.provider ?? "unknown",
          providerLabel: manifest?.model.provider ?? "Unknown",
          endpointShape: manifest?.model.endpointShape,
          secretPresent: manifest !== undefined,
          status: manifest === undefined ? "missing" : "active",
          publicSafe: true,
        }],
        publicSafe: true,
      };
    },
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const result = await created.runtime.dispatch({ type: "application.start", sessionId: "session.auth.manifest" });

  assert.equal(result.ok, true);
  assert.equal(result.view.auth?.activeProfileId, "profile.agent.praxis.doctor");
  assert.equal(result.view.auth?.profiles[0]?.secretPresent, true);
  assert.equal(seenManifestIds.at(-1), "agent.praxis.doctor");
});

test("applicationLayer refreshes public auth state after model changes", async () => {
  const seenModels: string[] = [];
  const created = await createApplicationProjectRuntime(DOCTOR_PROJECT, {
    now: () => "2026-05-10T00:00:00.000Z",
    authStateProvider: ({ model }) => {
      seenModels.push(model.model);
      return {
        defaultRole: "primary",
        activeProfileId: `profile.${model.model}`,
        profiles: [{
          profileId: `profile.${model.model}`,
          provider: model.provider ?? "unknown",
          providerLabel: model.provider ?? "Unknown",
          endpointShape: model.endpointShape,
          secretPresent: true,
          status: "active",
          publicSafe: true,
        }],
        publicSafe: true,
      };
    },
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const result = await createLocalApplicationTransport(created.runtime).dispatch({
    type: "application.changeModel",
    sessionId: "session.auth.model-change",
    model: "gpt-5.5",
    provider: "openai",
    endpointShape: "responses",
    reasoningEffort: "medium",
  });

  assert.equal(result.ok, true);
  assert.equal(result.view.model.model, "gpt-5.5");
  assert.equal(result.view.auth?.activeProfileId, "profile.gpt-5.5");
  assert.equal(result.view.auth?.profiles[0]?.provider, "openai");
  assert.equal(seenModels.at(-1), "gpt-5.5");
});

test("applicationLayer keeps createSession command safe when auth state provider fails", async () => {
  const created = await createApplicationProjectRuntime(DOCTOR_PROJECT, {
    now: () => "2026-05-10T00:00:00.000Z",
    authStateProvider: ({ sessionId }) => {
      if (sessionId === "session.auth.fail") {
        throw new Error("auth store unavailable for sk-secret-abcdef123456");
      }
      return { profiles: [], publicSafe: true };
    },
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const errorEvents: unknown[] = [];
  created.runtime.subscribe((event) => {
    if (event.eventId === "application.auth.state.failed") {
      errorEvents.push(event);
    }
  });

  const result = await created.runtime.dispatch({
    type: "application.createSession",
    sessionId: "session.auth.fail",
  });

  assert.equal(result.ok, true);
  assert.equal(result.view.sessionId, "session.auth.fail");
  assert.equal(result.view.auth?.lastAuditEventKind, "application.auth.state.failed");
  assert.equal(errorEvents.length, 1);
  assert.equal(JSON.stringify(errorEvents).includes("sk-secret"), false);
});

test("applicationLayer exposes local, REST, and WebSocket transport shapes", () => {
  assert.equal(describeApplicationRestTransport().protocol, "rest-json");
  assert.equal(describeApplicationWebSocketTransport().protocol, "websocket-json");
  assert.deepEqual(describeApplicationRestTransport().routes, [
    "GET /application/view",
    "POST /application/commands",
    "GET /application/events",
  ]);
});

test("applicationLayer project runtime can execute a dry-run turn", async () => {
  const created = await createApplicationProjectRuntime(DOCTOR_PROJECT, {
    now: () => "2026-05-10T00:00:00.000Z",
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const transport = createLocalApplicationTransport(created.runtime);
  const start = await transport.dispatch({
    type: "application.start",
    cwd: process.cwd(),
  });
  assert.equal(start.ok, true);
  assert.equal(start.view.status, "ready");
  assert.deepEqual(start.view.agentEntries.map((entry) => [entry.key, entry.agentId, entry.role]), [
    ["primary", "agent.praxis.doctor", "primary"],
  ]);
  assert.equal(start.view.permissionProfile, "permissive");
  assert.equal(start.view.toolProfile, "codingCore");
  assert.equal(start.view.tools.total, 14);
  assert.ok(start.view.tools.mounted > 0);

  const result = await transport.dispatch({
    type: "application.submitTurn",
    mode: "dry-run",
    input: {
      type: "application.input",
      text: "Use dry-run to prove the Praxis doctor application layer fixture.",
      cwd: process.cwd(),
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.view.applicationId, "application.praxis.doctor");
  assert.equal(result.view.model.model, "gpt-5.5");
  assert.equal(result.view.model.reasoningEffort, "low");
  assert.equal(result.view.permissionProfile, "permissive");
  assert.equal(result.view.toolProfile, "codingCore");
  assert.equal(result.view.tools.total, 14);
  assert.ok(result.view.tools.mounted > 0);
  assert.equal(result.view.counters.turns, 1);
  assert.equal(result.view.status, "completed");
});

test("applicationLayer publishes stream events during live provider calls", async () => {
  const created = await createApplicationProjectRuntime(DOCTOR_PROJECT, {
    now: () => "2026-05-10T00:00:00.000Z",
    liveProviderResolver: async (_manifest, context) => ({
      auth: {
        kind: "oauth",
        present: true,
        headerPlan: [],
        queryPlan: [],
        publicSafe: true,
      },
      providerCaller: async () => {
        context?.onTextDelta?.("stream ");
        context?.onTextDelta?.("ok");
        return {
          status: 200,
          headers: {},
          body: [
            'data: {"type":"response.output_text.delta","delta":"stream "}',
            "",
            'data: {"type":"response.output_text.delta","delta":"ok"}',
            "",
            'data: {"type":"response.completed","response":{"usage":{"input_tokens":31,"output_tokens":6,"output_tokens_details":{"reasoning_tokens":2}}}}',
            "",
            "data: [DONE]",
            "",
          ].join("\n"),
          providerRawShapePromoted: false,
          publicSafe: true,
        };
      },
    }),
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const streamEvents: string[] = [];
  created.runtime.subscribe((event) => {
    if (event.kind === "stream") {
      streamEvents.push(event.message);
    }
  });
  const result = await createLocalApplicationTransport(created.runtime).dispatch({
    type: "application.submitTurn",
    mode: "live",
    input: {
      type: "application.input",
      text: "Return exactly: stream ok",
      cwd: process.cwd(),
    },
  });
  assert.equal(result.ok, true);
  assert.equal(streamEvents.join(""), "stream ok");
  assert.equal(result.view.finalOutput, "stream ok");
  assert.equal(result.view.usage?.inputTokens, 31);
  assert.equal(result.view.usage?.outputTokens, 6);
  assert.equal(result.view.usage?.thinkingTokens, 2);
  assert.equal(result.view.usage?.estimated, false);
});

test("applicationLayer tool progress summaries use semantic basetool ids", () => {
  const webStarted = applicationRuntimeTestHooks.createToolProgressEvent({
    turnId: "turn.semantic",
    status: "running",
    progress: {
      phase: "started",
      callId: "call.web.search",
      toolId: "web.search",
      arguments: { query: "praxis basetool" },
    },
  });
  assert.equal(webStarted.metadata?.familyKey, "websearch");
  assert.equal(webStarted.metadata?.inputSummary, "Searching praxis basetool");

  const webCompleted = applicationRuntimeTestHooks.createToolProgressEvent({
    turnId: "turn.semantic",
    status: "completed",
    progress: {
      phase: "completed",
      record: {
        callId: "call.web.fetch",
        toolId: "web.fetch",
        arguments: { url: "https://example.test/docs" },
        ok: true,
        output: {
          finalUrl: "https://example.test/docs",
          pageTitle: "Docs",
          status: 200,
        },
      },
    },
  });
  assert.equal(webCompleted.metadata?.familyKey, "websearch");
  assert.deepEqual(webCompleted.metadata?.humanResultSummary, [
    "页面：https://example.test/docs",
    "标题：Docs",
    "HTTP：200",
  ]);

  const mcpStarted = applicationRuntimeTestHooks.createToolProgressEvent({
    turnId: "turn.semantic",
    status: "running",
    progress: {
      phase: "started",
      callId: "call.mcp.use",
      toolId: "mcp.use",
      arguments: { serverId: "local", toolName: "read_file" },
    },
  });
  assert.equal(mcpStarted.metadata?.inputSummary, "Calling MCP tool read_file on local");

  const mcpResourceStarted = applicationRuntimeTestHooks.createToolProgressEvent({
    turnId: "turn.semantic",
    status: "running",
    progress: {
      phase: "started",
      callId: "call.mcp.resources",
      toolId: "mcp.resources",
      arguments: { serverId: "local", uri: "file://README.md" },
    },
  });
  assert.equal(mcpResourceStarted.metadata?.inputSummary, "Reading MCP resource file://README.md from local");

  const patchCompleted = applicationRuntimeTestHooks.createToolProgressEvent({
    turnId: "turn.semantic",
    status: "completed",
    progress: {
      phase: "completed",
      record: {
        callId: "call.patch.apply",
        toolId: "patch.apply",
        arguments: { patch: "*** Begin Patch\n*** Update File: README.md\n@@\n-old\n+new\n*** End Patch\n" },
        ok: true,
        output: { additions: 1, deletions: 1, changedFiles: ["README.md"] },
      },
    },
  });
  assert.equal(patchCompleted.metadata?.familyKey, "file");
  const patchMetadata = patchCompleted.metadata?.resultMetadata as Record<string, unknown> | undefined;
  assert.equal(patchMetadata?.codeAdditions, 1);
  assert.equal(patchMetadata?.codeDeletions, 1);
});

test("applicationLayer can hand runtime auth resolver into live kernel calls", async () => {
  const secret = await createRuntimeAuthSecretRecord({
    secretId: "secret.application.runtime-auth",
    provider: "openai",
    secretKind: "api_key",
    plaintext: { apiKey: "sk-application-runtime-auth-secret" },
    keyProvider: () => "application-runtime-master-key",
  });
  assert.equal(secret.ok, true);
  if (!secret.ok) return;
  const profile = createRuntimeAuthProviderProfile({
    profileId: "profile.application.runtime-auth",
    provider: "openai",
    endpointShape: "responses",
    baseURL: "https://api.openai.com",
    credentialRef: runtimeAuthCredentialRef({
      credentialRefId: "credential.application.runtime-auth",
      secretId: "secret.application.runtime-auth",
      provider: "openai",
      credentialType: "openai_api_key",
      secretKind: "api_key",
      publicSafe: true,
    }),
  });
  const binding = bindRuntimeAuthRole({
    role: "primary",
    providerProfileRef: "profile.application.runtime-auth",
  });
  assert.equal(profile.ok, true);
  assert.equal(binding.ok, true);
  if (!profile.ok || !binding.ok) return;

  const baseResolver = createRuntimeAuthResolver({
    registry: createRuntimeAuthRegistry({ profiles: [profile.value], roleBindings: [binding.value] }),
    vault: createInMemoryRuntimeAuthSecretVault([secret.value]),
    keyProvider: () => "application-runtime-master-key",
  });
  const authSelections: unknown[] = [];

  const created = await createApplicationProjectRuntime(DOCTOR_PROJECT, {
    now: () => "2026-05-10T00:00:00.000Z",
    liveProviderResolver: async () => ({
      runtimeAuthResolver: {
        resolve: async (request: Parameters<typeof baseResolver.resolve>[0]) => {
          authSelections.push(request);
          return await baseResolver.resolve(request);
        },
      },
      authSelection: { role: "primary" },
      provider: "openai",
      endpointShape: "responses",
      providerCaller: async () => ({
        output_text: "runtime auth app call",
        usage: { input_tokens: 12, output_tokens: 4 },
      }),
    }),
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const result = await createLocalApplicationTransport(created.runtime).dispatch({
    type: "application.submitTurn",
    mode: "live",
    input: {
      type: "application.input",
      text: "Use resolver-backed auth.",
      cwd: process.cwd(),
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(authSelections, [{ role: "primary" }]);
  assert.equal(result.view.finalOutput, "runtime auth app call");
  assert.equal(result.view.usage?.inputTokens, 12);
  assert.equal(result.view.usage?.outputTokens, 4);
  assert.equal(JSON.stringify(result.view).includes("sk-application-runtime-auth-secret"), false);
});

test("applicationLayer OpenAI Responses adapter keeps API-key providers on the normal Responses route", async () => {
  const ref = createCredentialRef({
    id: "application-openai-native",
    provider: "openai",
    credentialType: "openai_api_key",
    source: { kind: "test", label: "unit" },
  });
  assert.equal(ref.ok, true);
  if (!ref.ok) return;

  const auth = createApiKeyAuthEnvelope({
    credentialRef: ref.credentialRef,
    apiKey: "sk-application-native-secret",
  });

  const result = await invokeOpenAIResponsesApplicationAdapter({
    route: {
      kind: "openai_responses",
      baseURL: "https://api.openai.com/v1",
      providerCaller: async (request) => {
        assert.equal(request.url, "https://api.openai.com/v1/responses");
        assert.equal(request.endpoint, "/responses");
        assert.equal(request.headers.authorization, "[redacted:35]");
        assert.deepEqual(request.body, {
          model: "gpt-5.5",
          input: "native search probe",
          max_output_tokens: 32,
          store: false,
        });
        return { id: "resp_application_native", output_text: "native ok" };
      },
    },
    auth: auth.envelope,
    runtimeId: "runtime.application.native",
    invocationId: "native-web-search:1",
    callerId: "raxode.application.nativeWebSearch",
    requiredScopes: ["model.invoke", "openai.responses"],
    body: {
      model: "gpt-5.5",
      input: "native search probe",
      max_output_tokens: 32,
      store: false,
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal((result.response.raw as { output_text?: string }).output_text, "native ok");
});

test("applicationLayer OpenAI Responses adapter uses ChatGPT Codex normalization only for Codex routes", async () => {
  const ref = createCredentialRef({
    id: "application-chatgpt-native",
    provider: "openai",
    credentialType: "chatgpt_codex_oauth",
    source: { kind: "test", label: "unit" },
  });
  assert.equal(ref.ok, true);
  if (!ref.ok) return;

  const auth = createApiKeyAuthEnvelope({
    credentialRef: ref.credentialRef,
    apiKey: "codex-access-token-secret",
  });

  const result = await invokeOpenAIResponsesApplicationAdapter({
    route: {
      kind: "chatgpt_codex_responses",
      baseURL: "https://chatgpt.com/backend-api/codex",
      providerCaller: async (request) => {
        assert.equal(request.url, "https://chatgpt.com/backend-api/codex/responses");
        assert.equal(request.endpoint, "/responses");
        assert.equal("max_output_tokens" in (request.body as Record<string, unknown>), false);
        assert.equal((request.body as { stream?: boolean }).stream, true);
        return { id: "resp_application_codex", output_text: "codex ok" };
      },
    },
    auth: auth.envelope,
    runtimeId: "runtime.application.codex-native",
    invocationId: "native-web-search:2",
    callerId: "raxode.application.nativeWebSearch",
    requiredScopes: ["model.invoke", "chatgpt.codex.responses"],
    body: {
      model: "gpt-5.5",
      input: "native search probe",
      max_output_tokens: 32,
      store: false,
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal((result.response.raw as { output_text?: string }).output_text, "codex ok");
});

test("applicationLayer OpenAI Responses adapter corrects Codex auth to the Codex route", async () => {
  const ref = createCredentialRef({
    id: "application-chatgpt-native-late-auth",
    provider: "openai",
    credentialType: "chatgpt_codex_oauth",
    source: { kind: "test", label: "unit" },
  });
  assert.equal(ref.ok, true);
  if (!ref.ok) return;

  const auth = createApiKeyAuthEnvelope({
    credentialRef: ref.credentialRef,
    apiKey: "codex-access-token-secret",
  });

  const result = await invokeOpenAIResponsesApplicationAdapter({
    route: {
      kind: "openai_responses",
      baseURL: "https://chatgpt.com/backend-api/codex",
      providerCaller: async (request) => {
        assert.equal(request.url, "https://chatgpt.com/backend-api/codex/responses");
        assert.equal(request.endpoint, "/responses");
        assert.equal("max_output_tokens" in (request.body as Record<string, unknown>), false);
        assert.equal((request.body as { stream?: boolean }).stream, true);
        return { id: "resp_application_codex_late_auth", output_text: "codex late auth ok" };
      },
    },
    auth: auth.envelope,
    runtimeId: "runtime.application.codex-native-late-auth",
    invocationId: "native-web-search:3",
    callerId: "raxode.application.nativeWebSearch",
    requiredScopes: ["model.invoke", "openai.responses"],
    body: {
      model: "gpt-5.5",
      input: "native search probe",
      max_output_tokens: 32,
      store: false,
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal((result.response.raw as { output_text?: string }).output_text, "codex late auth ok");
});

test("applicationLayer commands can steer session, workspace, model, and permissions", async () => {
  const created = await createApplicationProjectRuntime(DOCTOR_PROJECT, {
    now: () => "2026-05-10T00:00:00.000Z",
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const transport = createLocalApplicationTransport(created.runtime);
  const workspace = await transport.dispatch({
    type: "application.switchWorkspace",
    sessionId: "session.praxis.doctor.steered",
    cwd: "/tmp",
  });
  assert.equal(workspace.ok, true);
  assert.equal(workspace.view.sessionId, "session.praxis.doctor.steered");
  assert.equal(workspace.view.workspaceRoot, "/tmp");
  assert.equal(workspace.view.sessions[0]?.sessionId, "session.praxis.doctor.steered");
  assert.equal(workspace.view.sessions[0]?.workspaceRoot, "/tmp");

  const model = await transport.dispatch({
    type: "application.changeModel",
    sessionId: "session.praxis.doctor.steered",
    model: "gpt-5.5",
    reasoningEffort: "medium",
  });
  assert.equal(model.ok, true);
  assert.equal(model.view.model.reasoningEffort, "medium");

  const permission = await transport.dispatch({
    type: "application.changePermissionProfile",
    sessionId: "session.praxis.doctor.steered",
    profile: "bapr",
  });
  assert.equal(permission.ok, true);
  assert.equal(permission.view.permissionProfile, "bapr");
  assert.equal(permission.view.sessions[0]?.sessionId, "session.praxis.doctor.steered");
  assert.equal(permission.view.sessions[0]?.status, "idle");

  const toolProfile = await transport.dispatch({
    type: "application.changeToolProfile",
    sessionId: "session.praxis.doctor.steered",
    profile: "workCore",
  });
  assert.equal(toolProfile.ok, true);
  assert.equal(toolProfile.view.toolProfile, "workCore");
  assert.equal(toolProfile.view.tools.profile, "workCore");
  assert.equal(toolProfile.view.tools.extensionSlots.includes("pdf"), true);
});

test("applicationLayer can open the foundation project plane without taking over project logic", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "praxis-application-foundation-"));
  await writeFile(path.join(root, "agent.ts"), "export default {};\n");
  await writeFile(path.join(root, "rax.project.json"), JSON.stringify({
    schema: "praxis.rax.project.v1",
    kind: "application-project",
    id: "application.foundation.fixture",
    entry: "agent.ts",
    application: { id: "application.foundation.fixture" },
    agent: { id: "agent.foundation.fixture" },
  }, null, 2));

  const created = await createApplicationProjectRuntime(root, {
    openFoundationProject: true,
    applicationId: "application.foundation.fixture",
    now: () => "2026-05-24T00:00:00.000Z",
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  try {
    const transport = createLocalApplicationTransport(created.runtime);
    const result = await transport.dispatch({
      type: "application.createSession",
      sessionId: "session.foundation.fixture",
      name: "Foundation fixture",
    });
    assert.equal(result.ok, true);
    assert.equal(result.view.foundationProject?.kind, "chat");
    assert.equal(result.view.foundationProject?.locked, true);
    assert.equal(result.view.sessions[0]?.sessionId, "session.foundation.fixture");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
