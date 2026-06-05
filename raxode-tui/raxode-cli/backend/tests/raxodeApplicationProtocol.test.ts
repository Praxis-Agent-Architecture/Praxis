import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { startRaxodeStdioApplicationServer } from "../application/stdioApplicationServer.js";

const backendRoot = fileURLToPath(new URL("..", import.meta.url));
const readyLocalReadinessProbe = {
  nodeVersion: "v22.22.3",
  resolvePackage: (packageName: string) =>
    packageName === "tsx" ? "/repo/node_modules/tsx/dist/cli.mjs" : undefined,
} as const;

function collectLines(stream: PassThrough): string[] {
  const lines: string[] = [];
  let remainder = "";
  stream.on("data", (chunk: Buffer | string) => {
    const combined = remainder + (typeof chunk === "string" ? chunk : chunk.toString("utf8"));
    const parts = combined.split(/\r?\n/u);
    remainder = parts.pop() ?? "";
    lines.push(...parts.filter(Boolean));
  });
  return lines;
}

async function waitForLine(
  lines: readonly string[],
  predicate: (line: Record<string, unknown>) => boolean,
  timeoutMs = 4000,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const line of lines) {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      if (predicate(parsed)) return parsed;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`timed out waiting for protocol line; saw ${lines.length} lines`);
}

test("raxode stdio application server speaks application JSONL protocol", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const errors = new PassThrough();
  const lines = collectLines(output);
  const done = startRaxodeStdioApplicationServer({
    input,
    output,
    errorOutput: errors,
    projectRoot: backendRoot,
    now: () => "2026-05-10T00:00:00.000Z",
    localReadinessProbe: readyLocalReadinessProbe,
  });

  await waitForLine(lines, (line) => line.type === "application.event");
  const ready = await waitForLine(lines, (line) => line.type === "application.ready") as {
    view?: { permissionProfile?: string; toolProfile?: string; tools?: { mounted?: number; total?: number } };
  };
  assert.equal(ready.view?.permissionProfile, "permissive");
  assert.equal(ready.view?.toolProfile, "agentCore");
  assert.equal(ready.view?.tools?.mounted, 27);
  assert.equal(ready.view?.tools?.total, 27);
  const readiness = await waitForLine(lines, (line) =>
    line.type === "application.event"
    && (line.event as { eventId?: string } | undefined)?.eventId === "raxode.backend.readiness",
  ) as {
    event?: {
      metadata?: {
        readiness?: {
          kind?: string;
          areas?: readonly { area?: string; status?: string }[];
          dependencies?: readonly { dependencyId?: string; probe?: { status?: string } }[];
          probe?: { sandbox?: { status?: string } };
          ports?: { liveProviderResolver?: string };
        };
      };
    };
  };
  assert.equal(readiness.event?.metadata?.readiness?.kind, "raxode.backendReadiness");
  assert.ok(readiness.event?.metadata?.readiness?.areas?.some((area) =>
    area.area === "tools" && area.status === "ready"));
  assert.ok(readiness.event?.metadata?.readiness?.dependencies?.some((dependency) =>
    dependency.dependencyId === "dependency.binary.node" && dependency.probe?.status === "ready"));
  assert.equal(readiness.event?.metadata?.readiness?.probe?.sandbox?.status, "not-required");
  assert.equal(readiness.event?.metadata?.readiness?.ports?.liveProviderResolver, "configured");

  input.write(`${JSON.stringify({
    type: "application.command",
    commandId: "test-turn",
    command: {
      type: "application.submitTurn",
      mode: "dry-run",
      input: {
        type: "application.input",
        text: "dry-run protocol test",
      },
    },
  })}\n`);

  const resultLine = await waitForLine(
    lines,
    (line) => line.type === "application.commandResult" && line.commandId === "test-turn",
  ) as { result?: { ok?: boolean } };
  assert.equal(resultLine.result?.ok, true);

  input.write(`${JSON.stringify({
    type: "application.command",
    commandId: "close",
    command: { type: "application.close" },
  })}\n`);
  input.end();
  await done;
});

test("raxode stdio application server forwards Raxode options into readiness", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const errors = new PassThrough();
  const lines = collectLines(output);
  const done = startRaxodeStdioApplicationServer({
    input,
    output,
    errorOutput: errors,
    projectRoot: backendRoot,
    policyProfile: "restricted",
    sandboxProfile: "workspaceOnly",
    persistence: "memory",
    includeAllCatalogTools: false,
    model: "gpt-5.5",
    reasoningEffort: "minimal",
    maxOutputTokens: 256,
    now: () => "2026-05-10T00:00:00.000Z",
    localReadinessProbe: readyLocalReadinessProbe,
  });

  const ready = await waitForLine(lines, (line) => line.type === "application.ready") as {
    view?: {
      permissionProfile?: string;
      model?: { reasoningEffort?: string; maxOutputTokens?: number };
      tools?: { mounted?: number };
    };
  };
  assert.equal(ready.view?.permissionProfile, "restricted");
  assert.equal(ready.view?.model?.reasoningEffort, "minimal");
  assert.equal(ready.view?.model?.maxOutputTokens, 256);
  assert.equal(ready.view?.tools?.mounted, 6);

  const readiness = await waitForLine(lines, (line) =>
    line.type === "application.event"
    && (line.event as { eventId?: string } | undefined)?.eventId === "raxode.backend.readiness",
  ) as {
    event?: {
      metadata?: {
        readiness?: {
          permissionProfile?: string;
          sandboxProfile?: string;
          sessionPersistence?: string;
          sandbox?: { defaultExecution?: string };
          tools?: { mountedToolIds?: readonly string[] };
          ports?: { liveProviderResolver?: string };
        };
      };
    };
  };
  const readinessPayload = readiness.event?.metadata?.readiness;
  assert.equal(readinessPayload?.permissionProfile, "restricted");
  assert.equal(readinessPayload?.sandboxProfile, "workspace-only");
  assert.equal(readinessPayload?.sessionPersistence, "memory");
  assert.equal(readinessPayload?.sandbox?.defaultExecution, "workspace-rollback");
  assert.deepEqual(readinessPayload?.tools?.mountedToolIds, [
    "file.read",
    "file.search",
    "web.search",
    "web.fetch",
    "shell.run",
    "skill.load",
  ]);
  assert.equal(readinessPayload?.ports?.liveProviderResolver, "configured");

  input.write(`${JSON.stringify({
    type: "application.command",
    commandId: "close",
    command: { type: "application.close" },
  })}\n`);
  input.end();
  await done;
});
