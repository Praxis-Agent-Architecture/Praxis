import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { PassThrough } from "node:stream";
import test from "node:test";

import { startDirectApplicationBackend } from "../directApplicationBackend.js";

const liveEnabled = process.env.RAXODE_MCP_PLUS_LIVE_TEST === "1";

const readyLocalReadinessProbe = {
  nodeVersion: "v22.22.3",
  resolvePackage: (packageName: string) =>
    packageName === "tsx" ? "/repo/node_modules/tsx/dist/cli.mjs" : undefined,
} as const;

type DirectBackendLogRow = {
  event?: string;
  stage?: string;
  status?: string;
  capabilityKey?: string;
  providerToolName?: string;
  inputSummary?: string;
  text?: string;
  core?: {
    answer?: string;
  };
  resultMetadata?: {
    toolId?: string;
    nativeToolName?: string;
    serverId?: string;
    cacheDebug?: unknown;
  } & Record<string, unknown>;
  cacheDebug?: {
    promptPack?: {
      segments?: Array<{
        segmentKind?: string;
        materialRefs?: readonly string[];
      }>;
    };
    providerBody?: {
      toolCount?: number;
    };
  };
};

function livePrompt(): string {
  const html = encodeURIComponent("<!doctype html><title>Praxis MCP+ live smoke</title><main>Praxis MCP+ live smoke</main>");
  const url = `data:text/html,${html}`;
  return [
    "You must use the configured Playwright MCP+ browser tools for this task.",
    `First call browser_navigate with this URL: ${url}`,
    "Then call browser_snapshot and read the visible page.",
    "Finally answer only the page title text.",
  ].join(" ");
}

async function readDirectBackendLog(logPath: string): Promise<DirectBackendLogRow[]> {
  return (await readFile(logPath, "utf8"))
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as DirectBackendLogRow);
}

test("raxode live MCP+ smoke uses Playwright through the direct backend", {
  skip: liveEnabled ? false : "set RAXODE_MCP_PLUS_LIVE_TEST=1 to run live model + Playwright MCP+ smoke",
  timeout: 360_000,
}, async () => {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), "raxode-live-mcp-plus-"));
  const previousStreamFps = process.env.RAXODE_STREAM_FPS;
  const previousModel = process.env.AGENTCORE_CODEX_MODEL;
  const previousReasoning = process.env.AGENTCORE_CODEX_REASONING_EFFORT;
  process.env.RAXODE_STREAM_FPS = "1000";
  process.env.AGENTCORE_CODEX_MODEL = process.env.AGENTCORE_CODEX_MODEL ?? "gpt-5.5";
  process.env.AGENTCORE_CODEX_REASONING_EFFORT = process.env.AGENTCORE_CODEX_REASONING_EFFORT ?? "low";

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

  try {
    const done = startDirectApplicationBackend({
      input,
      output,
      errorOutput,
      cwd: process.cwd(),
      sessionId: "raxode-live-mcp-plus-test",
      stateRoot,
      mode: "live",
      policyProfile: "yolo",
      sandboxProfile: "hostObserved",
      provider: "openai",
      endpointShape: "responses",
      providerRoute: "chatgpt_codex_responses",
      model: process.env.AGENTCORE_CODEX_MODEL,
      reasoningEffort: "low",
      maxOutputTokens: 1024,
      localReadinessProbe: readyLocalReadinessProbe,
      mcpServers: [{
        serverId: "playwright",
        mode: "mcp-plus",
        transport: "stdio",
        command: "npx",
        args: ["-y", "@playwright/mcp@latest", "--headless"],
        cwd: process.cwd(),
        timeoutMs: 30_000,
        manifest: {
          server: {
            id: "playwright",
            title: "Playwright MCP+",
            summary: "Browser automation through Playwright MCP with compact exposure.",
          },
          exposure: {
            pinnedTools: ["browser_navigate", "browser_snapshot"],
            indexedTools: ["browser_network_requests", "browser_console_messages"],
            toolCards: {
              browser_network_requests: {
                title: "Network requests",
                summary: "Inspect browser network traffic when debugging failed requests or API calls.",
                keywords: ["network", "request", "http", "api", "debug"],
              },
              browser_console_messages: {
                title: "Console messages",
                summary: "Inspect frontend logs and JavaScript errors.",
                keywords: ["console", "logs", "error", "frontend"],
              },
            },
          },
          skills: {
            chapters: [{
              id: "snapshot-first-browser-workflow",
              title: "Snapshot-first browser workflow",
              summary: "Navigate first, then use accessibility snapshots to inspect page state before answering.",
            }],
          },
        },
      }],
      mcpPlus: {
        projectId: "project.raxode-live-mcp-plus-test",
      },
    });

    input.write(`${JSON.stringify({
      type: "direct_user_input",
      text: livePrompt(),
    })}\u0000/exit\u0000`);
    input.end();
    await done;

    assert.equal(stderr, "");
    assert.match(stdout, /direct ready: raxode-live-mcp-plus-test/u);
    const logPath = stdout.match(/log file: (.+)/u)?.[1]?.trim();
    assert.ok(logPath, stdout);
    const rows = await readDirectBackendLog(logPath);
    const modelEnd = rows.find((row) => row.event === "stage_end" && row.stage === "core/model.infer");
    assert.equal(modelEnd?.status, "completed");
    assert.ok((modelEnd?.cacheDebug?.providerBody?.toolCount ?? 0) > 0);

    const toolDeclarations = modelEnd?.cacheDebug?.promptPack?.segments?.find((segment) =>
      segment.segmentKind === "toolDeclarations");
    const materialRefs = toolDeclarations?.materialRefs ?? [];
    assert.equal(materialRefs.includes("runtime:tool-declarations"), true);
    assert.equal(materialRefs.includes("runtime:mcp-plus-native-exposure"), true);
    assert.ok(
      materialRefs.indexOf("runtime:mcp-plus-native-exposure")
      > materialRefs.indexOf("runtime:tool-declarations"),
    );

    const previewNames = rows
      .filter((row) => row.event === "tool_call_preview")
      .map((row) => row.providerToolName ?? row.text ?? "")
      .join("\n");
    assert.match(previewNames, /mcp_playwright_browser_navigate|browser_navigate/u);

    const completedMcpTools = rows
      .filter((row) => row.event === "stage_end" && row.stage === "core/capability_bridge")
      .map((row) => [
        row.capabilityKey,
        row.resultMetadata?.toolId,
        row.resultMetadata?.nativeToolName,
        row.inputSummary,
        row.text,
      ].filter(Boolean).join(" "));
    assert.ok(
      completedMcpTools.some((line) => /mcp\.playwright\.browser_navigate|browser_navigate/u.test(line)),
      completedMcpTools.join("\n"),
    );
    assert.ok(
      completedMcpTools.some((line) => /mcp\.playwright\.browser_snapshot|browser_snapshot/u.test(line)),
      completedMcpTools.join("\n"),
    );

    const finalAnswer = rows.find((row) => row.event === "turn_result")?.core?.answer ?? "";
    assert.match(finalAnswer, /Praxis MCP\+ live smoke/iu);
  } finally {
    if (previousStreamFps === undefined) {
      delete process.env.RAXODE_STREAM_FPS;
    } else {
      process.env.RAXODE_STREAM_FPS = previousStreamFps;
    }
    if (previousModel === undefined) {
      delete process.env.AGENTCORE_CODEX_MODEL;
    } else {
      process.env.AGENTCORE_CODEX_MODEL = previousModel;
    }
    if (previousReasoning === undefined) {
      delete process.env.AGENTCORE_CODEX_REASONING_EFFORT;
    } else {
      process.env.AGENTCORE_CODEX_REASONING_EFFORT = previousReasoning;
    }
    await rm(stateRoot, { recursive: true, force: true });
  }
});
