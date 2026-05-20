import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import test from "node:test";

import type { BaseToolExecutorPort } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";

type OutputChunk = {
  stream: "stdout" | "stderr";
  text: string;
  receivedAtMs: number;
};

class RuntimeOwnedShellInteractionHarness {
  readonly sessionId = "real-shell-session-1";
  readonly startedAtMs = Date.now();
  readonly process: ChildProcessWithoutNullStreams;
  readonly chunks: OutputChunk[] = [];

  lastActivityAtMs = this.startedAtMs;
  exitCode: number | undefined;
  signal: string | undefined;

  constructor() {
    this.process = spawn(process.execPath, [
      "-e",
      [
        "process.stdout.write('PROMPT>');",
        "process.stdin.setEncoding('utf8');",
        "process.stdin.on('data', (data) => {",
        "  const text = String(data).trim();",
        "  if (text === 'exit') { process.stdout.write('BYE\\n'); process.exit(0); }",
        "  if (text.startsWith('answer:')) { process.stdout.write('ANSWER=' + text.slice(7) + '\\nPROMPT>'); return; }",
        "  process.stdout.write('ECHO=' + text + '\\nPROMPT>');",
        "});",
        "setInterval(() => {}, 1000);",
      ].join("\n"),
    ]);

    this.process.stdout.on("data", (chunk: Buffer) => this.pushChunk("stdout", chunk));
    this.process.stderr.on("data", (chunk: Buffer) => this.pushChunk("stderr", chunk));
    this.process.on("exit", (code, signal) => {
      this.exitCode = code ?? undefined;
      this.signal = signal ?? undefined;
      this.lastActivityAtMs = Date.now();
    });
  }

  get executor(): BaseToolExecutorPort {
    return {
      shell: {
        monitorExecution: async ({ target }) => {
          this.assertSession(target);
          const state = this.exitCode === undefined && this.signal === undefined ? "running" : "exited";
          return {
            ok: true,
            output: {
              target: { sessionId: this.sessionId, processId: this.process.pid },
              observation: {
                state,
                startedAtMs: this.startedAtMs,
                observedAtMs: Date.now(),
                lastActivityAtMs: this.lastActivityAtMs,
                exitCode: this.exitCode,
                signal: this.signal,
                stdoutBytes: this.totalBytes("stdout"),
                stderrBytes: this.totalBytes("stderr"),
              },
              health: state === "running" ? "healthy" : this.exitCode === 0 ? "completed" : "failed",
              realProcessReadBlocked: false,
            },
          };
        },
        captureOutput: async ({ target }) => {
          this.assertSession(target);
          const streams = this.readStringArray(target.streams) ?? ["stdout", "stderr"];
          const maxBytes = typeof target.maxBytes === "number" ? target.maxBytes : 64_000;
          const selected = this.chunks.filter((chunk) => streams.includes(chunk.stream));
          let totalBytes = 0;
          const captured = [];
          let truncated = false;

          for (const chunk of selected) {
            const bytes = Buffer.byteLength(chunk.text, "utf8");
            if (totalBytes + bytes > maxBytes) {
              truncated = true;
              break;
            }
            totalBytes += bytes;
            captured.push({ ...chunk, bytes });
          }

          return {
            ok: true,
            output: {
              sessionId: this.sessionId,
              streams,
              chunks: captured,
              totalBytes,
              truncated,
              realBufferReadBlocked: false,
            },
          };
        },
        feedStdin: async ({ target }) => {
          this.assertSession(target);
          const input = this.readString(target.input);
          const appendNewline = target.appendNewline === true;
          const text = appendNewline ? `${input}\n` : input;
          this.process.stdin.write(text);
          return {
            ok: true,
            output: {
              stdinWriteBlocked: false,
              resultEnvelope: {
                planned: false,
                bytesWritten: Buffer.byteLength(text, "utf8"),
              },
            },
          };
        },
        handlePrompt: async ({ target }) => {
          this.assertSession(target);
          if (target.action === "respond") {
            const responseText = this.readString(target.responseText);
            this.process.stdin.write(`${responseText}\n`);
            return {
              ok: true,
              output: {
                stdinWriteBlocked: false,
                responseBytes: Buffer.byteLength(`${responseText}\n`, "utf8"),
              },
            };
          }

          return {
            ok: true,
            output: {
              stdinWriteBlocked: true,
            },
          };
        },
        controlInteractive: async ({ target }) => {
          this.assertSession(target);
          const action = this.readString(target.action);
          if (action === "send-input") {
            const input = this.readString(target.input);
            this.process.stdin.write(input);
          } else if (action === "interrupt") {
            this.process.kill("SIGINT");
          } else if (action === "terminate") {
            this.process.kill("SIGTERM");
          }

          return {
            ok: true,
            output: {
              controlBlocked: false,
            },
          };
        },
      },
    };
  }

  async waitForOutput(pattern: string, timeoutMs = 3000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.chunks.some((chunk) => chunk.text.includes(pattern))) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.fail(`timed out waiting for output pattern ${pattern}`);
  }

  async waitForExit(timeoutMs = 3000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.exitCode !== undefined || this.signal !== undefined) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.fail("timed out waiting for shell session exit");
  }

  cleanup(): void {
    if (this.exitCode === undefined && this.signal === undefined) {
      this.process.kill("SIGTERM");
    }
  }

  private pushChunk(stream: "stdout" | "stderr", chunk: Buffer): void {
    this.lastActivityAtMs = Date.now();
    this.chunks.push({ stream, text: chunk.toString("utf8"), receivedAtMs: this.lastActivityAtMs });
  }

  private totalBytes(stream: "stdout" | "stderr"): number {
    return this.chunks
      .filter((chunk) => chunk.stream === stream)
      .reduce((total, chunk) => total + Buffer.byteLength(chunk.text, "utf8"), 0);
  }

  private assertSession(target: Readonly<Record<string, unknown>>): void {
    assert.equal(target.sessionId, this.sessionId);
  }

  private readString(value: unknown): string {
    if (typeof value !== "string") {
      throw new TypeError("expected string runtime target field");
    }
    return value;
  }

  private readStringArray(value: unknown): string[] | undefined {
    if (value === undefined) {
      return undefined;
    }
    assert.equal(Array.isArray(value), true);
    return value as string[];
  }
}

async function invokeTool(toolId: string, input: unknown, executor: BaseToolExecutorPort) {
  const registry = createBaseToolRegistry();
  const lookup = registry.lookupHandler(toolId);
  assert.equal(lookup.ok, true);
  if (!lookup.ok) {
    throw new Error(`missing handler ${toolId}`);
  }

  const result = await lookup.handler.invoke({
    toolCallId: `${toolId}:real-smoke`,
    runtimeId: "runtime-real-smoke",
    sessionId: "agent-session-real-smoke",
    input,
    executor,
  });

  if (!result.ok) {
    throw new Error(`${toolId} failed: ${result.error.code}`);
  }
  assert.equal(result.ok, true);

  return result;
}

test("shellInteraction tools can drive a real runtime-owned interactive process", async () => {
  const harness = new RuntimeOwnedShellInteractionHarness();
  const commonContext = {
    dryRun: false,
    guard: { allowed: true },
    allowedSessionIds: [harness.sessionId],
  };

  try {
    await harness.waitForOutput("PROMPT>");

    const running = await invokeTool(
      "shell.executionMonitoring",
      {
        target: { sessionId: harness.sessionId },
        context: { ...commonContext, grantedPermissions: ["shell:execution:monitor"] },
      },
      harness.executor,
    );
    assert.equal((running.output as { health: string }).health, "healthy");
    assert.equal((running.output as { realProcessReadBlocked: boolean }).realProcessReadBlocked, false);

    await invokeTool(
      "shell.promptHandling",
      {
        target: { sessionId: harness.sessionId, promptText: "PROMPT>", action: "observe" },
        context: { ...commonContext, grantedPermissions: ["shell:prompt:handle"] },
      },
      harness.executor,
    );

    const stdin = await invokeTool(
      "shell.stdinFeeding",
      {
        target: { sessionId: harness.sessionId, input: "alpha", appendNewline: true },
        context: { ...commonContext, grantedPermissions: ["shell:stdin:feed"] },
      },
      harness.executor,
    );
    assert.equal((stdin.output as { stdinWriteBlocked: boolean }).stdinWriteBlocked, false);
    await harness.waitForOutput("ECHO=alpha");

    await invokeTool(
      "shell.promptHandling",
      {
        target: {
          sessionId: harness.sessionId,
          promptText: "PROMPT>",
          action: "respond",
          responseText: "answer:42",
        },
        context: { ...commonContext, grantedPermissions: ["shell:prompt:handle"] },
      },
      harness.executor,
    );
    await harness.waitForOutput("ANSWER=42");

    const captured = await invokeTool(
      "shell.outputCapture",
      {
        target: { sessionId: harness.sessionId, streams: ["stdout"], maxBytes: 64_000 },
        context: { ...commonContext, grantedPermissions: ["shell:output:capture"] },
      },
      harness.executor,
    );
    const outputText = (captured.output as { chunks: readonly { text: string }[] }).chunks
      .map((chunk) => chunk.text)
      .join("");
    assert.match(outputText, /PROMPT>/u);
    assert.match(outputText, /ECHO=alpha/u);
    assert.match(outputText, /ANSWER=42/u);

    await invokeTool(
      "shell.interactiveControl",
      {
        target: { sessionId: harness.sessionId, action: "send-input", input: "exit\n" },
        context: { ...commonContext, grantedPermissions: ["shell:interactive:control"] },
      },
      harness.executor,
    );
    await harness.waitForExit();

    const exited = await invokeTool(
      "shell.executionMonitoring",
      {
        target: { sessionId: harness.sessionId },
        context: { ...commonContext, grantedPermissions: ["shell:execution:monitor"] },
      },
      harness.executor,
    );
    assert.equal((exited.output as { health: string }).health, "completed");
  } finally {
    harness.cleanup();
  }
});
