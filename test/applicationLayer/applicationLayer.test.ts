import assert from "node:assert/strict";
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

test("applicationLayer loads a rax project descriptor", async () => {
  const loaded = await loadApplicationProject("raxode-cli/backend");
  assert.equal(loaded.ok, true);
  if (!loaded.ok) return;
  assert.equal(loaded.project.projectId, "raxode");
  assert.equal(loaded.project.applicationId, "application.raxode.coding");
  assert.equal(loaded.project.agentEntryPath.endsWith("raxode-cli/backend/agents/codingAgent/praxis.agent.ts"), true);
  assert.equal(loaded.project.agentEntries.primary?.agentId, "agent.raxode.coding");
  assert.equal(loaded.project.agentEntries.tui?.agentId, "agent.raxode.tui");
  assert.equal(loaded.project.agentEntries.tui?.entryPath.endsWith("raxode-cli/backend/agents/tuiAgent/praxis.agent.ts"), true);
});

test("applicationLayer WebSocket server streams ready and command results", async () => {
  const created = await createApplicationProjectRuntime("raxode-cli/backend", {
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
  const created = await createApplicationProjectRuntime("raxode-cli/backend", {
    now: () => "2026-05-10T00:00:00.000Z",
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const rest = await createApplicationRestServer(created.runtime);
  try {
    const viewResponse = await fetch(`${rest.url}/application/view`);
    assert.equal(viewResponse.status, 200);
    const view = await viewResponse.json() as { applicationId?: string };
    assert.equal(view.applicationId, "application.raxode.coding");

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
  const created = await createApplicationProjectRuntime("raxode-cli/backend", {
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
    ["primary", "agent.raxode.coding", "primary"],
    ["tui", "agent.raxode.tui", "sidecar"],
  ]);
  assert.equal(start.view.tools.total, 175);
  assert.equal(start.view.tools.mounted, 175);

  const result = await transport.dispatch({
    type: "application.submitTurn",
    mode: "dry-run",
    input: {
      type: "application.input",
      text: "请用 dry-run 证明 applicationLayer 可以运行 Raxode 后端。",
      cwd: process.cwd(),
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.view.applicationId, "application.raxode.coding");
  assert.equal(result.view.agentId, "agent.raxode.coding");
  assert.equal(result.view.model.model, "gpt-5.5");
  assert.equal(result.view.model.reasoningEffort, "low");
  assert.equal(result.view.model.contextWindowTokens, 400_000);
  assert.equal(result.view.model.maxInputTokens, 272_000);
  assert.equal(result.view.model.usableInputTokens, 258_400);
  assert.equal(result.view.permissionProfile, "standard");
  assert.equal(result.view.tools.total, 175);
  assert.equal(result.view.tools.mounted, 175);
  assert.equal(result.view.counters.turns, 1);
  assert.equal(result.view.status, "completed");
});

test("applicationLayer publishes stream events during live provider calls", async () => {
  const created = await createApplicationProjectRuntime("raxode-cli/backend", {
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
  const transport = createLocalApplicationTransport(created.runtime);
  const result = await transport.dispatch({
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
});

test("applicationLayer invokes tui auxiliary tasks through the tui agent", async () => {
  const created = await createApplicationProjectRuntime("raxode-cli/backend", {
    now: () => "2026-05-10T00:00:00.000Z",
    liveProviderResolver: async (manifest) => ({
      auth: {
        kind: "oauth",
        present: true,
        headerPlan: [],
        queryPlan: [],
        publicSafe: true,
      },
      providerCaller: async () => {
        assert.equal(manifest.identity.id, "agent.raxode.tui");
        assert.equal(manifest.model.model, "gpt-5.4-mini");
        assert.equal(manifest.model.reasoning?.effort, "low");
        assert.equal(manifest.harness.tools.length, 0);
        return {
          status: 200,
          headers: {},
          body: [
            'data: {"type":"response.output_text.delta","delta":"{\\"schemaVersion\\":\\"pending-composer-summary/v1\\",\\"summary\\":\\"短标题\\"}"}',
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

  const result = await createLocalApplicationTransport(created.runtime).dispatch({
    type: "application.invokeAuxiliaryTask",
    mode: "live",
    agentKey: "tui",
    agentId: "agent.raxode.tui",
    taskKind: "tui.pending-composer-summary",
    schemaVersion: "pending-composer-summary/v1",
    correlationId: "aux-test-1",
    timeoutMs: 1000,
    model: "gpt-5.4-mini",
    reasoningEffort: "low",
    input: {
      text: "这是一段非常非常长的待发送内容，需要在 rewind 列表里压成短标题。",
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.output, {
    schemaVersion: "pending-composer-summary/v1",
    summary: "短标题",
  });
  assert.equal(result.view.agentId, "agent.raxode.coding");
  assert.equal(result.view.finalOutput, undefined);
  assert.equal(result.events.some((event) => event.metadata?.agentId === "agent.raxode.tui"), true);
});

test("applicationLayer supports concurrent tui auxiliary tasks", async () => {
  const outputs = [
    '{"schemaVersion":"pending-composer-summary/v1","summary":"任务一"}',
    '{"schemaVersion":"pending-composer-summary/v1","summary":"任务二"}',
  ];
  let index = 0;
  const created = await createApplicationProjectRuntime("raxode-cli/backend", {
    now: () => "2026-05-10T00:00:00.000Z",
    liveProviderResolver: async () => ({
      auth: {
        kind: "oauth",
        present: true,
        headerPlan: [],
        queryPlan: [],
        publicSafe: true,
      },
      providerCaller: async () => {
        const output = outputs[index++] ?? outputs[0]!;
        return {
          status: 200,
          headers: {},
          body: [
            `data: ${JSON.stringify({ type: "response.output_text.delta", delta: output })}`,
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
  const transport = createLocalApplicationTransport(created.runtime);
  const [first, second] = await Promise.all([1, 2].map((item) => transport.dispatch({
    type: "application.invokeAuxiliaryTask",
    mode: "live",
    agentKey: "tui",
    taskKind: "tui.pending-composer-summary",
    schemaVersion: "pending-composer-summary/v1",
    correlationId: `aux-concurrent-${item}`,
    timeoutMs: 1000,
    input: { text: `任务 ${item}` },
  })));
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal((first.output as { summary?: string }).summary, "任务一");
  assert.equal((second.output as { summary?: string }).summary, "任务二");
});

test("applicationLayer times out tui auxiliary tasks", async () => {
  const created = await createApplicationProjectRuntime("raxode-cli/backend", {
    now: () => "2026-05-10T00:00:00.000Z",
    liveProviderResolver: async () => ({
      auth: {
        kind: "oauth",
        present: true,
        headerPlan: [],
        queryPlan: [],
        publicSafe: true,
      },
      providerCaller: async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return {
          status: 200,
          headers: {},
          body: "data: [DONE]\n\n",
          providerRawShapePromoted: false,
          publicSafe: true,
        };
      },
    }),
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const result = await createLocalApplicationTransport(created.runtime).dispatch({
    type: "application.invokeAuxiliaryTask",
    mode: "live",
    agentKey: "tui",
    taskKind: "tui.pending-composer-summary",
    schemaVersion: "pending-composer-summary/v1",
    correlationId: "aux-timeout",
    timeoutMs: 5,
    input: { text: "timeout" },
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "AUXILIARY_TASK_FAILED");
    assert.match(result.error.message, /timed out/iu);
  }
});

test("applicationLayer can cancel tui auxiliary tasks by correlation id", async () => {
  const created = await createApplicationProjectRuntime("raxode-cli/backend", {
    now: () => "2026-05-10T00:00:00.000Z",
    liveProviderResolver: async () => ({
      auth: {
        kind: "oauth",
        present: true,
        headerPlan: [],
        queryPlan: [],
        publicSafe: true,
      },
      providerCaller: async () => ({
        status: 200,
        headers: {},
        body: [
          'data: {"type":"response.output_text.delta","delta":"{\\"schemaVersion\\":\\"pending-composer-summary/v1\\",\\"summary\\":\\"cancelled\\"}"}',
          "",
          "data: [DONE]",
          "",
        ].join("\n"),
        providerRawShapePromoted: false,
        publicSafe: true,
      }),
    }),
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const transport = createLocalApplicationTransport(created.runtime);
  const cancel = await transport.dispatch({
    type: "application.cancelAuxiliaryTask",
    correlationId: "aux-cancelled",
    reason: "test cancellation",
  });
  assert.equal(cancel.ok, true);
  const result = await transport.dispatch({
    type: "application.invokeAuxiliaryTask",
    mode: "live",
    agentKey: "tui",
    taskKind: "tui.pending-composer-summary",
    schemaVersion: "pending-composer-summary/v1",
    correlationId: "aux-cancelled",
    timeoutMs: 1000,
    input: { text: "cancel me" },
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "AUXILIARY_TASK_FAILED");
    assert.match(result.error.message, /cancelled/iu);
  }
});

test("applicationLayer commands can steer session, workspace, model, and permissions", async () => {
  const created = await createApplicationProjectRuntime("raxode-cli/backend", {
    now: () => "2026-05-10T00:00:00.000Z",
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const transport = createLocalApplicationTransport(created.runtime);
  const workspace = await transport.dispatch({
    type: "application.switchWorkspace",
    sessionId: "session.raxode.steered",
    cwd: "/tmp",
  });
  assert.equal(workspace.ok, true);
  assert.equal(workspace.view.sessionId, "session.raxode.steered");
  assert.equal(workspace.view.workspaceRoot, "/tmp");
  assert.equal(workspace.view.sessions[0]?.sessionId, "session.raxode.steered");
  assert.equal(workspace.view.sessions[0]?.workspaceRoot, "/tmp");

  const model = await transport.dispatch({
    type: "application.changeModel",
    sessionId: "session.raxode.steered",
    model: "gpt-5.5",
    reasoningEffort: "medium",
  });
  assert.equal(model.ok, true);
  assert.equal(model.view.model.reasoningEffort, "medium");

  const permission = await transport.dispatch({
    type: "application.changePermissionProfile",
    sessionId: "session.raxode.steered",
    profile: "bapr",
  });
  assert.equal(permission.ok, true);
  assert.equal(permission.view.permissionProfile, "bapr");
  assert.equal(permission.view.sessions[0]?.sessionId, "session.raxode.steered");
  assert.equal(permission.view.sessions[0]?.status, "idle");

  const approvalRequested = await transport.dispatch({
    type: "application.requestApproval",
    sessionId: "session.raxode.steered",
    approvalId: "approval-1",
    reason: "needs review",
  });
  assert.equal(approvalRequested.ok, true);
  assert.equal(approvalRequested.view.status, "awaiting-approval");
  assert.equal(approvalRequested.view.approvals[0]?.status, "pending");

  const approval = await transport.dispatch({
    type: "application.approvalDecision",
    sessionId: "session.raxode.steered",
    approvalId: "approval-1",
    decision: "approve",
    note: "ok",
  });
  assert.equal(approval.ok, true);
  assert.equal(approval.view.approvals[0]?.approvalId, "approval-1");
  assert.equal(approval.view.approvals[0]?.decision, "approve");

  const sessionCreated = await transport.dispatch({
    type: "application.createSession",
    name: "Spike Session",
    cwd: "/tmp",
  });
  assert.equal(sessionCreated.ok, true);
  assert.equal(
    sessionCreated.view.sessions.find((session) => session.sessionId === sessionCreated.view.sessionId)?.name,
    "Spike Session",
  );
  assert.match(sessionCreated.view.sessionId, /Spike-Session/u);

  const renamed = await transport.dispatch({
    type: "application.renameSession",
    sessionId: sessionCreated.view.sessionId,
    name: "Better Name",
  });
  assert.equal(renamed.ok, true);
  assert.equal(
    renamed.view.sessions.find((session) => session.sessionId === sessionCreated.view.sessionId)?.name,
    "Better Name",
  );
});
