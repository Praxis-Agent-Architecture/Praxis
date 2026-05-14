import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";

import { startLegacyDirectApplicationBackend } from "../legacyDirectApplicationBackend.js";

test("legacy direct application backend speaks direct ready and writes ordered legacy log events", async () => {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), "raxode-legacy-direct-"));
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

  const done = startLegacyDirectApplicationBackend({
    input,
    output,
    errorOutput,
    cwd: process.cwd(),
    sessionId: "direct-test",
    stateRoot,
    mode: "dry-run",
    now: () => "2026-05-10T00:00:00.000Z",
  });

  input.write(`${JSON.stringify({
    type: "direct_user_input",
    text: "legacy adapter smoke",
  })}\u0000/exit\u0000`);
  input.end();
  await done;

  assert.match(stdout, /direct ready: direct-test/u);
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
      elapsedMs?: number;
      core?: {
        answer?: string;
        elapsedMs?: number;
        usage?: { estimated?: boolean; inputTokens?: number; outputTokens?: number };
        context?: { windowTokens?: number; maxInputTokens?: number; usableInputTokens?: number; promptTokens?: number };
      };
      context?: { windowTokens?: number; maxInputTokens?: number; usableInputTokens?: number };
    });
  const events = rows.map((row) => row.event);
  assert.deepEqual(events.slice(0, 4), ["session_start", "stdin_payload_received", "turn_start", "stage_start"]);
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

test("legacy direct application backend resumes turn indexes from the restored session offset", async () => {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), "raxode-legacy-direct-resume-"));
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

  const done = startLegacyDirectApplicationBackend({
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

test("legacy direct application backend maps live stream deltas onto the resumed legacy turn", async () => {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), "raxode-legacy-direct-resume-stream-"));
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

  const done = startLegacyDirectApplicationBackend({
    input,
    output,
    errorOutput,
    cwd: process.cwd(),
    sessionId: "direct-resume-stream-test",
    stateRoot,
    mode: "live",
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

test("legacy direct application backend logs tool call preview events before tool execution completes", async () => {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), "raxode-legacy-direct-tool-preview-"));
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

  const done = startLegacyDirectApplicationBackend({
    input,
    output,
    errorOutput,
    cwd: process.cwd(),
    sessionId: "direct-tool-preview-test",
    stateRoot,
    mode: "live",
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

test("legacy direct application backend writes live codex usage from framework telemetry", async () => {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), "raxode-legacy-direct-live-"));
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

  const done = startLegacyDirectApplicationBackend({
    input,
    output,
    errorOutput,
    cwd: process.cwd(),
    sessionId: "direct-live-usage-test",
    stateRoot,
    mode: "live",
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
          lastRequestInputTokens?: number;
          lastRequestTotalTokens?: number;
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
        lastRequestInputTokens?: number;
        lastRequestTotalTokens?: number;
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
          fingerprints?: {
            bodyHash?: string;
            toolsHash?: string;
            inputHash?: string;
          };
        };
      };
    });
  const modelEnd = rows.find((row) => row.event === "stage_end" && row.stage === "core/model.infer");
  assert.equal(modelEnd?.usage?.inputTokens, 44);
  assert.equal(modelEnd?.usage?.cachedInputTokens, 40);
  assert.equal(modelEnd?.context?.contextSource, "provider.model-call.usage");
  assert.equal(modelEnd?.context?.lastRequestInputTokens, 44);
  assert.equal(modelEnd?.context?.lastRequestTotalTokens, 54);
  assert.equal(modelEnd?.cacheDebug?.kind, "praxis.modelCall.cacheDebug");
  assert.ok((modelEnd?.cacheDebug?.promptPack?.segments?.length ?? 0) > 0);
  assert.ok((modelEnd?.cacheDebug?.promptPack?.cacheablePrefixEstimatedTokens ?? 0) > 0);
  assert.match(modelEnd?.cacheDebug?.promptPack?.segments?.[0]?.providerHints?.internalStateHash ?? "", /^[a-f0-9]{64}$/u);
  assert.ok((modelEnd?.cacheDebug?.providerBody?.toolCount ?? 0) > 0);
  assert.ok((modelEnd?.cacheDebug?.providerBody?.toolsEstimatedTokens ?? 0) > 0);
  assert.match(modelEnd?.cacheDebug?.providerBody?.fingerprints?.bodyHash ?? "", /^[a-f0-9]{64}$/u);
  assert.match(modelEnd?.cacheDebug?.providerBody?.fingerprints?.toolsHash ?? "", /^[a-f0-9]{64}$/u);
  const turnResult = rows.find((row) => row.event === "turn_result");
  assert.equal(turnResult?.core?.usage?.inputTokens, 44);
  assert.equal(turnResult?.core?.usage?.outputTokens, 7);
  assert.equal(turnResult?.core?.usage?.thinkingTokens, 3);
  assert.equal(turnResult?.core?.usage?.totalTokens, 54);
  assert.equal(turnResult?.core?.usage?.cachedInputTokens, 40);
  assert.equal(turnResult?.core?.usage?.lastTotalTokens, 54);
  assert.equal(turnResult?.core?.usage?.estimated, false);
  assert.equal(turnResult?.core?.usage?.source, "openai.responses.usage");
  assert.equal(turnResult?.core?.context?.contextSource, "application.history.estimate");
  assert.equal(turnResult?.core?.context?.usageSource, "openai.responses.usage");
  assert.equal(turnResult?.core?.context?.activeTokens, turnResult?.core?.context?.promptTokens);
  assert.notEqual(turnResult?.core?.context?.promptTokens, 44);
  assert.equal(turnResult?.core?.context?.lastRequestInputTokens, 44);
  assert.equal(turnResult?.core?.context?.lastRequestTotalTokens, 54);
  assert.ok((turnResult?.core?.context?.transcriptTokens ?? 0) > 0);
  if (previousStreamFps === undefined) {
    delete process.env.RAXODE_STREAM_FPS;
  } else {
    process.env.RAXODE_STREAM_FPS = previousStreamFps;
  }
  await rm(stateRoot, { recursive: true, force: true });
});
