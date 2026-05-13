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
          'data: {"type":"response.completed","response":{"usage":{"input_tokens":44,"output_tokens":7,"output_tokens_details":{"reasoning_tokens":3}}}}',
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
      core?: {
        usage?: {
          inputTokens?: number;
          outputTokens?: number;
          thinkingTokens?: number;
          estimated?: boolean;
          source?: string;
        };
        context?: {
          activeTokens?: number;
          promptTokens?: number;
          transcriptTokens?: number;
          contextSource?: string;
          usageSource?: string;
        };
      };
      context?: {
        activeTokens?: number;
        promptTokens?: number;
        transcriptTokens?: number;
        contextSource?: string;
        usageSource?: string;
      };
    });
  const turnResult = rows.find((row) => row.event === "turn_result");
  assert.equal(turnResult?.core?.usage?.inputTokens, 44);
  assert.equal(turnResult?.core?.usage?.outputTokens, 7);
  assert.equal(turnResult?.core?.usage?.thinkingTokens, 3);
  assert.equal(turnResult?.core?.usage?.estimated, false);
  assert.equal(turnResult?.core?.usage?.source, "openai.responses.usage");
  assert.equal(turnResult?.core?.context?.contextSource, "openai.responses.usage");
  assert.equal(turnResult?.core?.context?.usageSource, "openai.responses.usage");
  assert.equal(turnResult?.core?.context?.activeTokens, turnResult?.core?.context?.promptTokens);
  assert.equal(turnResult?.core?.context?.promptTokens, 44);
  assert.ok((turnResult?.core?.context?.transcriptTokens ?? 0) > 0);
  if (previousStreamFps === undefined) {
    delete process.env.RAXODE_STREAM_FPS;
  } else {
    process.env.RAXODE_STREAM_FPS = previousStreamFps;
  }
  await rm(stateRoot, { recursive: true, force: true });
});
