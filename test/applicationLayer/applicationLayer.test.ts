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
  assert.equal(start.view.tools.total, 176);
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
  assert.equal(result.view.permissionProfile, "standard");
  assert.equal(result.view.tools.total, 176);
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
});
