import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import nodeTest from "node:test";
import { promisify } from "node:util";

import { startDirectApplicationBackend } from "../directApplicationBackend.js";
import { saveDirectTuiSessionSnapshot } from "../../frontend/tui/input/direct-session-store.js";

const execFileAsync = promisify(execFile);
const test = nodeTest;
const responsesRoute = {
  provider: "openai",
  endpointShape: "responses",
  providerRoute: "openai_responses",
  model: "gpt-5.5",
} as const;
const readyLocalReadinessProbe = {
  nodeVersion: "v22.22.3",
  resolvePackage: (packageName: string) =>
    packageName === "tsx" ? "/repo/node_modules/tsx/dist/cli.mjs" : undefined,
} as const;

test("direct application backend speaks direct ready and writes ordered compatibility log events", async () => {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), "raxode-direct-"));
  const previousStreamFps = process.env.RAXODE_STREAM_FPS;
  process.env.RAXODE_STREAM_FPS = "1000";
  const input = new PassThrough();
  const output = new PassThrough();
  const errorOutput = new PassThrough();
  let stdout = "";
  let stderr = "";
  output.on("data", (chunk: Buffer | string) => {
    stdout += typeof chunk === "string" ? chunk : chunk.toString("utf8");
  });
  errorOutput.on("data", (chunk: Buffer | string) => {
    stderr += typeof chunk === "string" ? chunk : chunk.toString("utf8");
  });

  const done = startDirectApplicationBackend({
    input,
    output,
    errorOutput,
    cwd: process.cwd(),
    sessionId: "direct-test",
    stateRoot,
    mode: "dry-run",
    now: () => "2026-05-10T00:00:00.000Z",
    localReadinessProbe: readyLocalReadinessProbe,
  });

  input.write(`${JSON.stringify({
    type: "direct_user_input",
    text: "direct adapter smoke",
  })}\u0000/exit\u0000`);
  input.end();
  await done;

  assert.match(stdout, /direct ready: direct-test/u);
  const readinessLine = stdout
    .split(/\r?\n/u)
    .find((line) => line.startsWith("backend readiness: "));
  assert.ok(readinessLine);
  const readiness = JSON.parse(readinessLine.slice("backend readiness: ".length)) as {
    kind?: string;
    dependencies?: readonly { dependencyId?: string; probe?: { status?: string; resolvedPath?: string } }[];
    probe?: { sandbox?: { status?: string } };
    ports?: { approvalResolver?: string; liveProviderResolver?: string };
    moduleInventory?: {
      modules?: readonly { moduleId?: string; status?: string }[];
    };
  };
  assert.equal(readiness.kind, "raxode.backendReadiness");
  assert.ok(readiness.moduleInventory?.modules?.some((module) =>
    module.moduleId === "basetool" && module.status === "ready"));
  assert.ok(readiness.moduleInventory?.modules?.some((module) =>
    module.moduleId === "context" && module.status === "ready"));
  assert.ok(readiness.dependencies?.some((dependency) =>
    dependency.dependencyId === "dependency.binary.node" && dependency.probe?.status === "ready"));
  assert.ok(readiness.dependencies?.some((dependency) =>
    dependency.dependencyId === "dependency.npm.tsx"
    && dependency.probe?.status === "ready"
    && dependency.probe.resolvedPath === "/repo/node_modules/tsx/dist/cli.mjs"));
  assert.equal(readiness.probe?.sandbox?.status, "not-required");
  assert.equal(readiness.ports?.approvalResolver, "configured");
  assert.equal(readiness.ports?.liveProviderResolver, "raxode-default");
  assert.equal(stderr, "");
  const logPath = stdout.match(/log file: (.+)/u)?.[1]?.trim();
  assert.ok(logPath);
  const rows = (await readFile(logPath, "utf8"))
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as {
      event?: string;
      turnIndex?: number;
      text?: string;
      status?: string;
      moduleInventory?: {
        modules?: readonly { moduleId?: string; status?: string }[];
      };
      readiness?: {
        probe?: { sandbox?: { status?: string } };
        dependencies?: readonly { dependencyId?: string; probe?: { status?: string } }[];
      };
      elapsedMs?: number;
      core?: {
        answer?: string;
        elapsedMs?: number;
        usage?: { estimated?: boolean; inputTokens?: number; outputTokens?: number };
        context?: { windowTokens?: number; maxInputTokens?: number; usableInputTokens?: number; compressionLimitTokens?: number; promptTokens?: number };
      };
      context?: { windowTokens?: number; maxInputTokens?: number; usableInputTokens?: number };
    });
  const events = rows.map((row) => row.event);
  assert.deepEqual(events.slice(0, 5), ["session_start", "backend_readiness", "stdin_payload_received", "turn_start", "stage_start"]);
  const readinessRecord = rows.find((row) => row.event === "backend_readiness");
  assert.equal(readinessRecord?.status, "ready");
  assert.ok(readinessRecord?.moduleInventory?.modules?.some((module) =>
    module.moduleId === "basetool" && module.status === "ready"));
  assert.ok(readinessRecord?.moduleInventory?.modules?.some((module) =>
    module.moduleId === "sandbox" && module.status === "ready"));
  assert.equal(readinessRecord?.readiness?.probe?.sandbox?.status, "not-required");
  assert.ok(readinessRecord?.readiness?.dependencies?.some((dependency) =>
    dependency.dependencyId === "dependency.binary.node" && dependency.probe?.status === "ready"));
  assert.equal(rows.find((row) => row.event === "turn_start")?.turnIndex, 1);
  assert.ok(rows.some((row) => row.event === "stage_start" && row.text?.includes("Requesting")));
  assert.ok(rows.some((row) => row.event === "stage_end" && row.text?.includes("returned a model decision")));
  assert.ok(events.includes("assistant_delta"));
  assert.deepEqual(events.slice(-4), ["stage_end", "turn_result", "stdin_payload_received", "session_end"]);
  assert.match(
    rows.filter((row) => row.event === "assistant_delta").map((row) => row.text ?? "").join(""),
    /dry-run/u,
  );
  assert.equal(rows.find((row) => row.event === "session_start")?.context?.windowTokens, 400_000);
  assert.equal(rows.find((row) => row.event === "turn_result")?.core?.context?.maxInputTokens, 272_000);
  assert.equal(rows.find((row) => row.event === "turn_result")?.core?.context?.usableInputTokens, 258_400);
  assert.equal(rows.find((row) => row.event === "turn_result")?.core?.context?.compressionLimitTokens, 245_480);
  assert.equal(rows.find((row) => row.event === "turn_result")?.core?.usage?.estimated, true);
  assert.equal(rows.find((row) => row.event === "turn_result")?.core?.usage?.inputTokens, undefined);
  assert.equal(typeof rows.find((row) => row.event === "turn_result")?.core?.elapsedMs, "number");
  assert.match(rows.find((row) => row.event === "turn_result")?.core?.answer ?? "", /dry-run/u);
  if (previousStreamFps === undefined) {
    delete process.env.RAXODE_STREAM_FPS;
  } else {
    process.env.RAXODE_STREAM_FPS = previousStreamFps;
  }
  await rm(stateRoot, { recursive: true, force: true });
});

test("direct application backend forwards Raxode agent options into readiness", async () => {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), "raxode-direct-options-"));
  const input = new PassThrough();
  const output = new PassThrough();
  const errorOutput = new PassThrough();
  let stdout = "";
  let stderr = "";
  output.on("data", (chunk: Buffer | string) => {
    stdout += typeof chunk === "string" ? chunk : chunk.toString("utf8");
  });
  errorOutput.on("data", (chunk: Buffer | string) => {
    stderr += typeof chunk === "string" ? chunk : chunk.toString("utf8");
  });

  const done = startDirectApplicationBackend({
    input,
    output,
    errorOutput,
    cwd: process.cwd(),
    sessionId: "direct-options-test",
    stateRoot,
    mode: "dry-run",
    policyProfile: "yolo",
    sandboxProfile: "workspaceOnly",
    persistence: "memory",
    includeAllCatalogTools: false,
    reasoningEffort: "minimal",
    maxOutputTokens: 512,
    now: () => "2026-05-10T00:00:00.000Z",
    localReadinessProbe: readyLocalReadinessProbe,
  });

  input.write("/exit\u0000");
  input.end();
  await done;

  assert.equal(stderr, "");
  const readinessLine = stdout
    .split(/\r?\n/u)
    .find((line) => line.startsWith("backend readiness: "));
  assert.ok(readinessLine);
  const readiness = JSON.parse(readinessLine.slice("backend readiness: ".length)) as {
    permissionProfile?: string;
    sandboxProfile?: string;
    sessionPersistence?: string;
    sandbox?: { defaultExecution?: string };
    model?: { model?: string };
    tools?: { expectedCoreToolIds?: readonly string[]; mountedToolIds?: readonly string[] };
  };
  assert.equal(readiness.permissionProfile, "yolo");
  assert.equal(readiness.sandboxProfile, "workspace-only");
  assert.equal(readiness.sessionPersistence, "memory");
  assert.equal(readiness.sandbox?.defaultExecution, "workspace-rollback");
  assert.equal(readiness.tools?.expectedCoreToolIds?.length, 25);
  assert.deepEqual(readiness.tools?.mountedToolIds, [
    "file.read",
    "file.search",
    "web.search",
    "web.fetch",
    "shell.run",
    "skill.load",
  ]);

  await rm(stateRoot, { recursive: true, force: true });
});

test("direct application backend resumes turn indexes from the restored session offset", async () => {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), "raxode-direct-resume-"));
  const previousStreamFps = process.env.RAXODE_STREAM_FPS;
  process.env.RAXODE_STREAM_FPS = "1000";
  const input = new PassThrough();
  const output = new PassThrough();
  const errorOutput = new PassThrough();
  let stdout = "";
  let stderr = "";
  output.on("data", (chunk: Buffer | string) => {
    stdout += typeof chunk === "string" ? chunk : chunk.toString("utf8");
  });
  errorOutput.on("data", (chunk: Buffer | string) => {
    stderr += typeof chunk === "string" ? chunk : chunk.toString("utf8");
  });

  const done = startDirectApplicationBackend({
    input,
    output,
    errorOutput,
    cwd: process.cwd(),
    sessionId: "direct-resume-test",
    stateRoot,
    mode: "dry-run",
    initialTurnIndex: 3,
    now: () => "2026-05-10T00:00:00.000Z",
  });

  input.write(`${JSON.stringify({
    type: "direct_user_input",
    text: "resume turn smoke",
  })}\u0000/exit\u0000`);
  input.end();
  await done;

  assert.equal(stderr, "");
  const logPath = stdout.match(/log file: (.+)/u)?.[1]?.trim();
  assert.ok(logPath);
  const rows = (await readFile(logPath, "utf8"))
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as {
      event?: string;
      initialTurnIndex?: number;
      turnIndex?: number;
    });

  assert.equal(rows.find((row) => row.event === "session_start")?.initialTurnIndex, 3);
  assert.equal(rows.find((row) => row.event === "turn_start")?.turnIndex, 4);
  assert.equal(rows.find((row) => row.event === "turn_result")?.turnIndex, 4);

  if (previousStreamFps === undefined) {
    delete process.env.RAXODE_STREAM_FPS;
  } else {
    process.env.RAXODE_STREAM_FPS = previousStreamFps;
  }
  await rm(stateRoot, { recursive: true, force: true });
});

test("direct application backend maps live stream deltas onto the resumed UI turn", async () => {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), "raxode-direct-resume-stream-"));
  const previousStreamFps = process.env.RAXODE_STREAM_FPS;
  process.env.RAXODE_STREAM_FPS = "1000";
  const input = new PassThrough();
  const output = new PassThrough();
  const errorOutput = new PassThrough();
  let stdout = "";
  let stderr = "";
  output.on("data", (chunk: Buffer | string) => {
    stdout += typeof chunk === "string" ? chunk : chunk.toString("utf8");
  });
  errorOutput.on("data", (chunk: Buffer | string) => {
    stderr += typeof chunk === "string" ? chunk : chunk.toString("utf8");
  });

  const done = startDirectApplicationBackend({
    input,
    output,
    errorOutput,
    cwd: process.cwd(),
    sessionId: "direct-resume-stream-test",
    stateRoot,
    mode: "live",
    ...responsesRoute,
    initialTurnIndex: 3,
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
          'data: {"type":"response.output_text.delta","delta":"resumed stream"}',
          "",
          'data: {"type":"response.completed","response":{"usage":{"input_tokens":12,"output_tokens":3}}}',
          "",
          "data: [DONE]",
          "",
        ].join("\n"),
        providerRawShapePromoted: false,
        publicSafe: true,
      }),
    }),
  });

  input.write(`${JSON.stringify({
    type: "direct_user_input",
    text: "stream on resumed turn",
  })}\u0000/exit\u0000`);
  input.end();
  await done;

  assert.equal(stderr, "");
  const logPath = stdout.match(/log file: (.+)/u)?.[1]?.trim();
  assert.ok(logPath);
  const rows = (await readFile(logPath, "utf8"))
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as {
      event?: string;
      turnIndex?: number;
      text?: string;
    });
  const assistantDeltas = rows.filter((row) => row.event === "assistant_delta");

  assert.ok(assistantDeltas.length > 0);
  assert.deepEqual([...new Set(assistantDeltas.map((row) => row.turnIndex))], [4]);
  assert.match(assistantDeltas.map((row) => row.text ?? "").join(""), /resumed stream/u);

  if (previousStreamFps === undefined) {
    delete process.env.RAXODE_STREAM_FPS;
  } else {
    process.env.RAXODE_STREAM_FPS = previousStreamFps;
  }
  await rm(stateRoot, { recursive: true, force: true });
});

test("direct application backend hydrates persisted session transcript into resumed provider context", async () => {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), "raxode-direct-hydrate-state-"));
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "raxode-direct-hydrate-workspace-"));
  const previousStreamFps = process.env.RAXODE_STREAM_FPS;
  process.env.RAXODE_STREAM_FPS = "1000";
  const sessionId = "direct-hydrate-context-test";
  saveDirectTuiSessionSnapshot({
    schemaVersion: 1,
    sessionId,
    agentId: "agent.core:main",
    name: "hydrate-context",
    workspace: workspaceRoot,
    route: "test",
    model: responsesRoute.model,
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:01.000Z",
    selectedAgentId: "agent.core:main",
    agents: [],
    messages: [
      {
        messageId: "persisted-user-1",
        kind: "user",
        text: "请记住这个跨后端恢复标记 BLUE-ORBIT-HYDRATE。",
        createdAt: "2026-05-10T00:00:00.000Z",
        turnId: "turn-1",
      },
      {
        messageId: "persisted-tool-1",
        kind: "status",
        title: "File",
        text: "Read workflow-studio/dag.js Path: workflow-studio/dag.js",
        createdAt: "2026-05-10T00:00:00.500Z",
        turnId: "turn-1",
        metadata: { source: "tool_summary", capabilityKey: "file.read", summaryState: "completed" },
      },
      {
        messageId: "persisted-assistant-1",
        kind: "assistant",
        text: "我已经知道 BLUE-ORBIT-HYDRATE 和当前工程结构。",
        createdAt: "2026-05-10T00:00:01.000Z",
        turnId: "turn-1",
      },
    ],
    usageLedger: [],
  }, workspaceRoot);

  const input = new PassThrough();
  const output = new PassThrough();
  const errorOutput = new PassThrough();
  let stdout = "";
  let stderr = "";
  output.on("data", (chunk: Buffer | string) => {
    stdout += typeof chunk === "string" ? chunk : chunk.toString("utf8");
  });
  errorOutput.on("data", (chunk: Buffer | string) => {
    stderr += typeof chunk === "string" ? chunk : chunk.toString("utf8");
  });
  const providerBodies: unknown[] = [];

  const done = startDirectApplicationBackend({
    input,
    output,
    errorOutput,
    cwd: workspaceRoot,
    sessionId,
    stateRoot,
    mode: "live",
    ...responsesRoute,
    initialTurnIndex: 1,
    liveProviderResolver: async () => ({
      auth: {
        kind: "oauth",
        present: true,
        headerPlan: [],
        queryPlan: [],
        publicSafe: true,
      },
      providerCaller: async (envelope) => {
        providerBodies.push(envelope.body);
        return { output_text: "hydrated ok", usage: { input_tokens: 42, output_tokens: 2 } };
      },
    }),
  });

  input.write(`${JSON.stringify({
    type: "direct_user_input",
    text: "刚才的跨后端恢复标记是什么？",
  })}\u0000/exit\u0000`);
  input.end();
  await done;

  assert.equal(stderr, "");
  assert.equal(providerBodies.length, 1);
  assert.match(JSON.stringify(providerBodies[0]), /BLUE-ORBIT-HYDRATE/u);
  const logPath = stdout.match(/log file: (.+)/u)?.[1]?.trim();
  assert.ok(logPath);
  const rows = (await readFile(logPath, "utf8"))
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as {
      event?: string;
      stage?: string;
      context?: { historyMessages?: number; transcriptTokens?: number };
      cacheDebug?: {
        promptPack?: {
          segments?: Array<{ segmentKind?: string; materialCount?: number; estimatedTokens?: number }>;
        };
      };
    });
  const modelEnd = rows.find((row) => row.event === "stage_end" && row.stage === "core/model.infer");
  assert.ok((modelEnd?.context?.historyMessages ?? 0) >= 3);
  assert.ok((modelEnd?.context?.transcriptTokens ?? 0) > 0);
  const recentConversation = modelEnd?.cacheDebug?.promptPack?.segments?.find((segment) =>
    segment.segmentKind === "recentConversation");
  assert.ok((recentConversation?.materialCount ?? 0) >= 3);
  assert.ok((recentConversation?.estimatedTokens ?? 0) > 0);

  if (previousStreamFps === undefined) {
    delete process.env.RAXODE_STREAM_FPS;
  } else {
    process.env.RAXODE_STREAM_FPS = previousStreamFps;
  }
  await rm(stateRoot, { recursive: true, force: true });
  await rm(workspaceRoot, { recursive: true, force: true });
});

test("direct application backend logs tool call preview events before tool execution completes", async () => {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), "raxode-direct-tool-preview-"));
  const previousStreamFps = process.env.RAXODE_STREAM_FPS;
  process.env.RAXODE_STREAM_FPS = "1000";
  const input = new PassThrough();
  const output = new PassThrough();
  const errorOutput = new PassThrough();
  let stdout = "";
  let stderr = "";
  output.on("data", (chunk: Buffer | string) => {
    stdout += typeof chunk === "string" ? chunk : chunk.toString("utf8");
  });
  errorOutput.on("data", (chunk: Buffer | string) => {
    stderr += typeof chunk === "string" ? chunk : chunk.toString("utf8");
  });

  const done = startDirectApplicationBackend({
    input,
    output,
    errorOutput,
    cwd: process.cwd(),
    sessionId: "direct-tool-preview-test",
    stateRoot,
    mode: "live",
    ...responsesRoute,
    liveProviderResolver: async (_manifest, context) => ({
      auth: {
        kind: "oauth",
        present: true,
        headerPlan: [],
        queryPlan: [],
        publicSafe: true,
      },
      providerCaller: async () => {
        (context as {
          onProviderStreamEvent?: (event: Record<string, unknown>) => void;
        } | undefined)?.onProviderStreamEvent?.({
          channel: "tool_call_preview",
          phase: "started",
          itemId: "fc_preview_1",
          outputIndex: 0,
          callId: "call_shell_preview",
          providerToolName: "praxis_tool_shell_commandExecution",
        });
        (context as {
          onProviderStreamEvent?: (event: Record<string, unknown>) => void;
        } | undefined)?.onProviderStreamEvent?.({
          channel: "tool_call_preview",
          phase: "delta",
          itemId: "fc_preview_1",
          outputIndex: 0,
          callId: "call_shell_preview",
          argumentsDelta: "{\"target\":{\"command\":\"sleep 60",
        });
        return {
          output_text: "preview done",
          usage: { input_tokens: 10, output_tokens: 2 },
        };
      },
    }),
  });

  input.write(`${JSON.stringify({
    type: "direct_user_input",
    text: "preview a long shell command",
  })}\u0000/exit\u0000`);
  input.end();
  await done;

  assert.equal(stderr, "");
  const logPath = stdout.match(/log file: (.+)/u)?.[1]?.trim();
  assert.ok(logPath);
  const rows = (await readFile(logPath, "utf8"))
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as {
      event?: string;
      turnIndex?: number;
      status?: string;
      toolCallId?: string;
      providerToolName?: string;
      text?: string;
    });
  const previewRows = rows.filter((row) => row.event === "tool_call_preview");

  assert.equal(previewRows.length, 2);
  assert.deepEqual(previewRows.map((row) => row.status), ["started", "delta"]);
  assert.deepEqual([...new Set(previewRows.map((row) => row.turnIndex))], [1]);
  assert.equal(previewRows[0]?.providerToolName, "praxis_tool_shell_commandExecution");
  assert.equal(previewRows[0]?.toolCallId, "call_shell_preview");
  assert.match(previewRows[1]?.text ?? "", /sleep 60/u);

  if (previousStreamFps === undefined) {
    delete process.env.RAXODE_STREAM_FPS;
  } else {
    process.env.RAXODE_STREAM_FPS = previousStreamFps;
  }
  await rm(stateRoot, { recursive: true, force: true });
});

test("direct application backend persists spawned agents for agents and resume views", async () => {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), "raxode-direct-agent-persist-state-"));
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "raxode-direct-agent-persist-workspace-"));
  const previousStreamFps = process.env.RAXODE_STREAM_FPS;
  process.env.RAXODE_STREAM_FPS = "1000";
  const input = new PassThrough();
  const output = new PassThrough();
  const errorOutput = new PassThrough();
  let stdout = "";
  let stderr = "";
  output.on("data", (chunk: Buffer | string) => {
    stdout += typeof chunk === "string" ? chunk : chunk.toString("utf8");
  });
  errorOutput.on("data", (chunk: Buffer | string) => {
    stderr += typeof chunk === "string" ? chunk : chunk.toString("utf8");
  });
  let parentStep = 0;

  const done = startDirectApplicationBackend({
    input,
    output,
    errorOutput,
    cwd: workspaceRoot,
    sessionId: "direct-agent-persist-test",
    stateRoot,
    mode: "live",
    policyProfile: "bapr",
    ...responsesRoute,
    liveProviderResolver: async (_manifest, context) => ({
      auth: {
        kind: "oauth",
        present: true,
        headerPlan: [],
        queryPlan: [],
        publicSafe: true,
      },
      providerCaller: async (envelope) => {
        if (context?.sessionId?.startsWith("agent-session.")) {
          return { output_text: "child persisted result" };
        }
        parentStep += 1;
        if (parentStep === 1) {
          return {
            output: [{
              type: "function_call",
              name: "praxis_tool_agent_spawn",
              call_id: "spawn-persistent-agent",
              arguments: JSON.stringify({
                task: "inspect files",
                lifecycle: "persistent",
                name: "Inspector",
                description: "Persistent inspector agent",
                workingDirectory: workspaceRoot,
              }),
            }],
          };
        }
        return { output_text: "done" };
      },
    }),
  });

  input.write(`${JSON.stringify({
    type: "direct_user_input",
    text: "spawn a persistent inspector and wait",
  })}\u0000/exit\u0000`);
  input.end();
  await done;

  assert.equal(stderr, "");
  assert.equal(parentStep, 2);
  const logPath = stdout.match(/log file: (.+)/u)?.[1]?.trim();
  assert.ok(logPath);
  const rows = (await readFile(logPath, "utf8"))
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as {
      event?: string;
      childSessionId?: string;
      childName?: string;
    });
  const started = rows.find((row) => row.event === "agent_session_started");
  assert.equal(started?.childName, "Inspector");
  assert.ok(started?.childSessionId);
  const childSessionId = started.childSessionId;
  const agents = JSON.parse(await readFile(path.join(workspaceRoot, ".raxode", "sessions", "direct-tui-agents.json"), "utf8")) as {
    agents?: readonly { agentId?: string; name?: string; lastSessionId?: string }[];
  };
  assert.ok(agents.agents?.some((agent) =>
    agent.agentId === childSessionId
    && agent.name === "Inspector"
    && agent.lastSessionId === childSessionId));
  const childSnapshot = JSON.parse(await readFile(path.join(workspaceRoot, ".raxode", "sessions", `${childSessionId}.json`), "utf8")) as {
    sessionId?: string;
    agentId?: string;
    selectedAgentId?: string;
    name?: string;
  };
  assert.equal(childSnapshot.sessionId, childSessionId);
  assert.equal(childSnapshot.agentId, childSessionId);
  assert.equal(childSnapshot.selectedAgentId, childSessionId);
  assert.equal(childSnapshot.name, "Inspector");

  if (previousStreamFps === undefined) {
    delete process.env.RAXODE_STREAM_FPS;
  } else {
    process.env.RAXODE_STREAM_FPS = previousStreamFps;
  }
  await rm(stateRoot, { recursive: true, force: true });
  await rm(workspaceRoot, { recursive: true, force: true });
});

test("direct application backend writes live codex usage from framework telemetry", async () => {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), "raxode-direct-live-"));
  const previousStreamFps = process.env.RAXODE_STREAM_FPS;
  process.env.RAXODE_STREAM_FPS = "1000";
  const input = new PassThrough();
  const output = new PassThrough();
  const errorOutput = new PassThrough();
  let stdout = "";
  let stderr = "";
  output.on("data", (chunk: Buffer | string) => {
    stdout += typeof chunk === "string" ? chunk : chunk.toString("utf8");
  });
  errorOutput.on("data", (chunk: Buffer | string) => {
    stderr += typeof chunk === "string" ? chunk : chunk.toString("utf8");
  });

  const done = startDirectApplicationBackend({
    input,
    output,
    errorOutput,
    cwd: process.cwd(),
    sessionId: "direct-live-usage-test",
    stateRoot,
    mode: "live",
    ...responsesRoute,
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
          'data: {"type":"response.output_text.delta","delta":"usage ok"}',
          "",
          'data: {"type":"response.completed","response":{"usage":{"input_tokens":44,"output_tokens":7,"total_tokens":54,"input_tokens_details":{"cached_tokens":40},"output_tokens_details":{"reasoning_tokens":3}}}}',
          "",
          "data: [DONE]",
          "",
        ].join("\n"),
        providerRawShapePromoted: false,
        publicSafe: true,
      }),
    }),
  });

  input.write(`${JSON.stringify({
    type: "direct_user_input",
    text: "report usage",
  })}\u0000/exit\u0000`);
  input.end();
  await done;

  assert.equal(stderr, "");
  const logPath = stdout.match(/log file: (.+)/u)?.[1]?.trim();
  assert.ok(logPath);
  const rows = (await readFile(logPath, "utf8"))
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as {
      event?: string;
      stage?: string;
      core?: {
        usage?: {
          inputTokens?: number;
          outputTokens?: number;
          thinkingTokens?: number;
          totalTokens?: number;
          cachedInputTokens?: number;
          lastTotalTokens?: number;
          estimated?: boolean;
          source?: string;
        };
        context?: {
          activeTokens?: number;
          promptTokens?: number;
          transcriptTokens?: number;
          contextSource?: string;
          usageSource?: string;
          sessionContextTokens?: number;
          lastRequestInputTokens?: number;
          lastRequestTotalTokens?: number;
          promptPackTokens?: number;
          estimated?: boolean;
        };
      };
      usage?: {
        inputTokens?: number;
        outputTokens?: number;
        thinkingTokens?: number;
        totalTokens?: number;
        cachedInputTokens?: number;
        source?: string;
        estimated?: boolean;
      };
      context?: {
        activeTokens?: number;
        promptTokens?: number;
        transcriptTokens?: number;
        contextSource?: string;
        usageSource?: string;
        sessionContextTokens?: number;
        lastRequestInputTokens?: number;
        lastRequestTotalTokens?: number;
        promptPackTokens?: number;
        estimated?: boolean;
      };
      cacheDebug?: {
        kind?: string;
        promptPack?: {
          cacheablePrefixEstimatedTokens?: number;
          dynamicEstimatedTokens?: number;
          segments?: Array<{
            segmentKind?: string;
            segmentHash?: string;
            estimatedTokens?: number;
            providerHints?: { internalStateHash?: string };
          }>;
        };
        providerBody?: {
          estimatedTokens?: number;
          inputEstimatedTokens?: number;
          toolsEstimatedTokens?: number;
          toolCount?: number;
          toolResultBudget?: {
            budgetBytes?: number;
            originalToolResultBytes?: number;
            replayedToolResultBytes?: number;
            fullToolResults?: number;
            compactedToolResults?: number;
          };
          fingerprints?: {
            bodyHash?: string;
            toolsHash?: string;
            inputHash?: string;
          };
          cacheShape?: {
            providerStablePrefixEstimatedTokens?: number;
            providerDynamicInputEstimatedTokens?: number;
            stablePrefixShare?: number;
            dynamicInputShare?: number;
            stablePrefixHash?: string;
            dynamicPayloadHash?: string;
          };
        };
        observedUsage?: {
          inputTokens?: number;
          cachedInputTokens?: number;
          nonCachedInputTokens?: number;
          cacheHitRate?: number;
          diagnosis?: string;
          reasons?: readonly string[];
        };
      };
    });
  const modelEnd = rows.find((row) => row.event === "stage_end" && row.stage === "core/model.infer");
  assert.equal(modelEnd?.usage?.inputTokens, 44);
  assert.equal(modelEnd?.usage?.cachedInputTokens, 40);
  assert.equal(modelEnd?.context?.contextSource, "provider.model-call.usage");
  assert.equal(modelEnd?.context?.lastRequestInputTokens, 44);
  assert.equal(modelEnd?.context?.lastRequestTotalTokens, 54);
  assert.ok((modelEnd?.context?.sessionContextTokens ?? 0) >= (modelEnd?.context?.lastRequestInputTokens ?? 0));
  assert.ok((modelEnd?.context?.sessionContextTokens ?? 0) >= (modelEnd?.context?.promptPackTokens ?? 0));
  assert.equal(modelEnd?.cacheDebug?.kind, "praxis.modelCall.cacheDebug");
  assert.ok((modelEnd?.cacheDebug?.promptPack?.segments?.length ?? 0) > 0);
  assert.ok((modelEnd?.cacheDebug?.promptPack?.cacheablePrefixEstimatedTokens ?? 0) > 0);
  assert.match(modelEnd?.cacheDebug?.promptPack?.segments?.[0]?.providerHints?.internalStateHash ?? "", /^[a-f0-9]{64}$/u);
  assert.ok((modelEnd?.cacheDebug?.providerBody?.toolCount ?? 0) > 0);
  assert.ok((modelEnd?.cacheDebug?.providerBody?.toolsEstimatedTokens ?? 0) > 0);
  assert.match(modelEnd?.cacheDebug?.providerBody?.fingerprints?.bodyHash ?? "", /^[a-f0-9]{64}$/u);
  assert.match(modelEnd?.cacheDebug?.providerBody?.fingerprints?.toolsHash ?? "", /^[a-f0-9]{64}$/u);
  assert.equal(modelEnd?.cacheDebug?.providerBody?.toolResultBudget?.budgetBytes, 128 * 1024);
  assert.ok((modelEnd?.cacheDebug?.providerBody?.toolResultBudget?.fullToolResults ?? 0) >= 0);
  assert.ok((modelEnd?.cacheDebug?.providerBody?.toolResultBudget?.compactedToolResults ?? 0) >= 0);
  assert.ok((modelEnd?.cacheDebug?.providerBody?.cacheShape?.providerStablePrefixEstimatedTokens ?? 0) > 0);
  assert.ok((modelEnd?.cacheDebug?.providerBody?.cacheShape?.providerDynamicInputEstimatedTokens ?? 0) > 0);
  assert.match(modelEnd?.cacheDebug?.providerBody?.cacheShape?.stablePrefixHash ?? "", /^[a-f0-9]{64}$/u);
  assert.match(modelEnd?.cacheDebug?.providerBody?.cacheShape?.dynamicPayloadHash ?? "", /^[a-f0-9]{64}$/u);
  assert.equal(modelEnd?.cacheDebug?.observedUsage?.inputTokens, 44);
  assert.equal(modelEnd?.cacheDebug?.observedUsage?.cachedInputTokens, 40);
  assert.equal(modelEnd?.cacheDebug?.observedUsage?.nonCachedInputTokens, 4);
  assert.equal(modelEnd?.cacheDebug?.observedUsage?.cacheHitRate, 0.9091);
  assert.equal(modelEnd?.cacheDebug?.observedUsage?.diagnosis, "warm-stable-prefix");
  assert.ok((modelEnd?.cacheDebug?.observedUsage?.reasons?.length ?? 0) > 0);
  const turnResult = rows.find((row) => row.event === "turn_result");
  assert.equal(turnResult?.core?.usage?.inputTokens, 44);
  assert.equal(turnResult?.core?.usage?.outputTokens, 7);
  assert.equal(turnResult?.core?.usage?.thinkingTokens, 3);
  assert.equal(turnResult?.core?.usage?.totalTokens, 54);
  assert.equal(turnResult?.core?.usage?.cachedInputTokens, 40);
  assert.equal(turnResult?.core?.usage?.lastTotalTokens, 54);
  assert.equal(turnResult?.core?.usage?.estimated, false);
  assert.equal(turnResult?.core?.usage?.source, "openai.responses.usage");
  assert.equal(turnResult?.core?.context?.contextSource, "provider.model-call.usage");
  assert.equal(turnResult?.core?.context?.usageSource, "openai.responses.usage");
  assert.equal(turnResult?.core?.context?.estimated, false);
  assert.equal(turnResult?.core?.context?.activeTokens, turnResult?.core?.context?.promptTokens);
  assert.equal(turnResult?.core?.context?.promptTokens, 44);
  assert.equal(turnResult?.core?.context?.lastRequestInputTokens, 44);
  assert.equal(turnResult?.core?.context?.lastRequestTotalTokens, 54);
  assert.ok((turnResult?.core?.context?.sessionContextTokens ?? 0) >= (turnResult?.core?.context?.lastRequestInputTokens ?? 0));
  assert.ok((turnResult?.core?.context?.sessionContextTokens ?? 0) >= (turnResult?.core?.context?.promptPackTokens ?? 0));
  assert.ok((turnResult?.core?.context?.transcriptTokens ?? 0) > 0);
  const xray = await execFileAsync(process.execPath, [
    path.resolve("automations/raxode-cache-xray.mjs"),
    logPath,
    "--require-new-telemetry",
  ], {
    cwd: process.cwd(),
  });
  assert.match(xray.stdout, /diagnosis: warm-stable-prefix/u);
  assert.match(xray.stdout, /telemetry coverage: observedUsage=1\/1 cacheShape=1\/1 toolResultBudget=1\/1/u);
  if (previousStreamFps === undefined) {
    delete process.env.RAXODE_STREAM_FPS;
  } else {
    process.env.RAXODE_STREAM_FPS = previousStreamFps;
  }
  await rm(stateRoot, { recursive: true, force: true });
});

test("direct application backend retains provider context after provider failure", async () => {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), "raxode-direct-provider-failure-context-"));
  const previousStreamFps = process.env.RAXODE_STREAM_FPS;
  process.env.RAXODE_STREAM_FPS = "1000";
  const input = new PassThrough();
  const output = new PassThrough();
  const errorOutput = new PassThrough();
  let stdout = "";
  let stderr = "";
  output.on("data", (chunk: Buffer | string) => {
    stdout += typeof chunk === "string" ? chunk : chunk.toString("utf8");
  });
  errorOutput.on("data", (chunk: Buffer | string) => {
    stderr += typeof chunk === "string" ? chunk : chunk.toString("utf8");
  });

  let providerCallCount = 0;
  const done = startDirectApplicationBackend({
    input,
    output,
    errorOutput,
    cwd: process.cwd(),
    sessionId: "direct-provider-failure-context-test",
    stateRoot,
    mode: "live",
    ...responsesRoute,
    liveProviderResolver: async () => ({
      auth: {
        kind: "oauth",
        present: true,
        headerPlan: [],
        queryPlan: [],
        publicSafe: true,
      },
      providerCaller: async () => {
        providerCallCount += 1;
        if (providerCallCount === 1) {
          return {
            status: 200,
            headers: {},
            body: [
              'data: {"type":"response.output_text.delta","delta":"first turn ok"}',
              "",
              'data: {"type":"response.completed","response":{"usage":{"input_tokens":98765,"output_tokens":7,"total_tokens":98772}}}',
              "",
              "data: [DONE]",
              "",
            ].join("\n"),
            providerRawShapePromoted: false,
            publicSafe: true,
          };
        }
        throw {
          status: 503,
          code: "provider_http_error",
          providerMessage: "upstream connect error or disconnect/reset before headers, connection timeout",
        };
      },
    }),
  });

  input.write(`${JSON.stringify({
    type: "direct_user_input",
    text: "capture first usage",
  })}\u0000${JSON.stringify({
    type: "direct_user_input",
    text: "hit provider failure",
  })}\u0000/exit\u0000`);
  input.end();
  await done;

  assert.equal(stderr, "");
  const logPath = stdout.match(/log file: (.+)/u)?.[1]?.trim();
  assert.ok(logPath);
  const rows = (await readFile(logPath, "utf8"))
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as {
      event?: string;
      turnIndex?: number;
      core?: {
        taskStatus?: string;
        usage?: {
          estimated?: boolean;
          inputTokens?: number;
        };
        context?: {
          contextSource?: string;
          usageSource?: string;
          lastRequestInputTokens?: number;
          retainedAfterFailure?: boolean;
          failureContextSource?: string;
        };
      };
      resultMetadata?: {
        errorCode?: string;
        errorMessage?: string;
      };
    });
  const turnResults = rows.filter((row) => row.event === "turn_result");
  assert.equal(turnResults.length, 2);
  assert.equal(turnResults[0]?.core?.context?.lastRequestInputTokens, 98765);
  assert.equal(turnResults[1]?.core?.taskStatus, "failed");
  assert.equal(turnResults[1]?.core?.usage?.estimated, true);
  assert.equal(turnResults[1]?.core?.usage?.inputTokens, undefined);
  assert.equal(turnResults[1]?.core?.context?.contextSource, "provider.model-call.usage");
  assert.equal(turnResults[1]?.core?.context?.lastRequestInputTokens, 98765);
  assert.equal(turnResults[1]?.core?.context?.retainedAfterFailure, true);
  assert.equal(turnResults[1]?.core?.context?.failureContextSource, "application.history.estimate");
  assert.equal(turnResults[1]?.resultMetadata?.errorCode, "PROVIDER_UNAVAILABLE");
  assert.match(turnResults[1]?.resultMetadata?.errorMessage ?? "", /connection timeout/u);

  if (previousStreamFps === undefined) {
    delete process.env.RAXODE_STREAM_FPS;
  } else {
    process.env.RAXODE_STREAM_FPS = previousStreamFps;
  }
  await rm(stateRoot, { recursive: true, force: true });
});
