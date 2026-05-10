/*
 * 文件定位：raxode-cli/backend legacy direct TUI adapter。
 * 核心目的：让 legacy `direct-tui.tsx` 保持原 UI/输入协议，同时接入新的 applicationLayer Raxode 后端。
 */

import { mkdir, appendFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type {
  PraxisApplicationAttachment,
  PraxisApplicationCommandResult,
  PraxisApplicationRuntimeMode,
} from "../../src/applicationLayer/index.js";

type LegacyDirectBackendOptions = {
  projectRoot?: string;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  errorOutput?: NodeJS.WritableStream;
  cwd?: string;
  sessionId?: string;
  stateRoot?: string;
  mode?: PraxisApplicationRuntimeMode;
  now?: () => string;
};

type DirectEnvelope = {
  type?: string;
  text?: string;
  attachments?: Array<Record<string, unknown>>;
  pastedContents?: Array<Record<string, unknown>>;
  fileRefs?: Array<Record<string, unknown>>;
  answers?: Array<Record<string, unknown>>;
};

function defaultProjectRoot(): string {
  return new URL(".", import.meta.url).pathname;
}

function defaultStateRoot(cwd: string): string {
  return path.resolve(process.env.PRAXIS_STATE_ROOT ?? process.env.RAXCODE_HOME ?? path.join(cwd, ".raxode"));
}

function normalizeDirectPayload(raw: string): {
  text: string;
  inputSource: string;
  attachments: PraxisApplicationAttachment[];
} {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) {
    return { text: raw, inputSource: "manual", attachments: [] };
  }
  try {
    const parsed = JSON.parse(trimmed) as DirectEnvelope;
    if (parsed.type === "direct_question_answer") {
      const text = (parsed.answers ?? [])
        .map((answer) => {
          const questionId = typeof answer.questionId === "string" ? answer.questionId : "question";
          const value = typeof answer.answerText === "string"
            ? answer.answerText
            : typeof answer.selectedOptionLabel === "string"
              ? answer.selectedOptionLabel
              : typeof answer.selectedOptionId === "string"
                ? answer.selectedOptionId
                : "";
          return `${questionId}: ${value}`;
        })
        .filter((line) => line.trim().length > 0)
        .join("\n");
      return {
        text: text || "Question answers submitted.",
        inputSource: "question_answer",
        attachments: [],
      };
    }
    if (parsed.type !== "direct_user_input" && parsed.type !== "direct_init_request") {
      return { text: raw, inputSource: "manual", attachments: [] };
    }
    const pastedAttachments: PraxisApplicationAttachment[] = (parsed.pastedContents ?? []).flatMap((entry, index) => {
      const text = typeof entry.text === "string" ? entry.text : "";
      if (!text) return [];
      const tokenText = typeof entry.tokenText === "string" ? entry.tokenText : `[Pasted Content #${index + 1}]`;
      return [{
        id: typeof entry.id === "string" ? entry.id : `legacy-paste:${index + 1}`,
        kind: "text" as const,
        tokenText,
        displayName: tokenText,
        text,
        metadata: {
          sourceKind: "legacy-direct-tui",
        },
      }];
    });
    const fileAttachments: PraxisApplicationAttachment[] = (parsed.fileRefs ?? []).flatMap((entry, index) => {
      const localPath = typeof entry.absolutePath === "string" ? entry.absolutePath : "";
      if (!localPath) return [];
      return [{
        id: typeof entry.id === "string" ? entry.id : `legacy-file:${index + 1}`,
        kind: "file" as const,
        tokenText: typeof entry.tokenText === "string" ? entry.tokenText : `@${localPath}`,
        displayName: typeof entry.displayName === "string" ? entry.displayName : path.basename(localPath),
        localPath,
        metadata: {
          sourceKind: "legacy-direct-tui",
        },
      }];
    });
    const imageAttachments: PraxisApplicationAttachment[] = (parsed.attachments ?? []).flatMap((entry, index) => {
      const localPath = typeof entry.localPath === "string" ? entry.localPath : undefined;
      const remoteUrl = typeof entry.remoteUrl === "string" ? entry.remoteUrl : undefined;
      if (!localPath && !remoteUrl) return [];
      return [{
        id: typeof entry.id === "string" ? entry.id : `legacy-attachment:${index + 1}`,
        kind: "image" as const,
        tokenText: typeof entry.tokenText === "string" ? entry.tokenText : `[Image #${index + 1}]`,
        displayName: typeof entry.displayName === "string" ? entry.displayName : undefined,
        mimeType: typeof entry.mimeType === "string" ? entry.mimeType : undefined,
        localPath,
        remoteUrl,
        metadata: {
          sourceKind: "legacy-direct-tui",
        },
      }];
    });
    return {
      text: parsed.text ?? "",
      inputSource: parsed.type === "direct_init_request" ? "init" : "manual",
      attachments: [...imageAttachments, ...pastedAttachments, ...fileAttachments],
    };
  } catch {
    return { text: raw, inputSource: "manual", attachments: [] };
  }
}

async function writeLog(logPath: string, record: Record<string, unknown>): Promise<void> {
  await appendFile(logPath, `${JSON.stringify(record)}\n`, "utf8");
}

function contextFor(result?: PraxisApplicationCommandResult) {
  const model = result?.view.model;
  const promptTokens = 0;
  const transcriptTokens = 0;
  return {
    provider: model?.provider ?? "openai",
    model: model?.model ?? "gpt-5.5",
    promptKind: "applicationLayer",
    windowTokens: model?.contextWindowTokens ?? 400_000,
    maxInputTokens: model?.maxInputTokens ?? 272_000,
    inputBudgetThreshold: model?.inputBudgetThreshold ?? 0.95,
    usableInputTokens: model?.usableInputTokens ?? Math.floor(272_000 * 0.95),
    windowSource: model?.metadataSource ?? "manual-registry",
    promptTokens,
    transcriptTokens,
  };
}

function parseApplicationTurnIndex(turnId: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(turnId?.replace(/^turn\./u, "") ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function legacyStreamFrameMs(): number {
  const raw = Number.parseFloat(process.env.RAXODE_STREAM_FPS ?? process.env.RAXODE_RENDER_FPS ?? "120");
  const fps = Number.isFinite(raw) && raw > 0 ? raw : 120;
  return Math.max(1, 1000 / fps);
}

function chunkStreamText(text: string): string[] {
  const chars = Array.from(text);
  const targetChunkCount = Math.max(1, Math.min(chars.length, Math.ceil(chars.length / 8)));
  const chunkSize = Math.max(1, Math.ceil(chars.length / targetChunkCount));
  const chunks: string[] = [];
  for (let index = 0; index < chars.length; index += chunkSize) {
    chunks.push(chars.slice(index, index + chunkSize).join(""));
  }
  return chunks;
}

async function waitFrame(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function startLegacyDirectApplicationBackend(options: LegacyDirectBackendOptions = {}): Promise<void> {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const errorOutput = options.errorOutput ?? process.stderr;
  const cwd = path.resolve(options.cwd ?? process.env.PRAXIS_WORKSPACE_ROOT ?? process.cwd());
  const sessionId = options.sessionId ?? process.env.PRAXIS_DIRECT_SESSION_ID ?? `direct-${Date.now()}`;
  const stateRoot = defaultStateRoot(cwd);
  const reportsDir = path.resolve(options.stateRoot ?? stateRoot, "live-reports");
  await mkdir(reportsDir, { recursive: true });
  const logPath = path.join(reportsDir, `legacy-direct-application-${sessionId.replace(/[^\w.-]+/gu, "_")}-${Date.now()}.jsonl`);
  output.write(`log file: ${logPath}\n`);
  output.write(`direct ready: ${sessionId}\n`);

  const inputClosed = new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    input.on("end", finish);
    input.on("close", finish);
  });
  let buffer = "";
  let payloadQueue = Promise.resolve();
  const pendingPayloads: string[] = [];
  let handlePayloadImpl: ((rawPayload: string) => Promise<void>) | null = null;
  const enqueuePayload = (rawPayload: string) => {
    if (!handlePayloadImpl) {
      pendingPayloads.push(rawPayload);
      return;
    }
    const handler = handlePayloadImpl;
    payloadQueue = payloadQueue.then(() => handler(rawPayload)).catch((error: unknown) => {
      errorOutput.write(`legacy direct application backend payload failed: ${error instanceof Error ? error.message : String(error)}\n`);
    });
  };

  input.setEncoding("utf8");
  input.on("data", (chunk: string) => {
    buffer += chunk;
    const parts = buffer.split("\u0000");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      enqueuePayload(part);
    }
  });

  const [
    applicationLayer,
    liveProviderModule,
    applicationModule,
  ] = await Promise.all([
    import("../../src/applicationLayer/index.js"),
    import("./authentication/liveProvider.js"),
    import("./application/raxodeApplication.js"),
  ]);

  const created = await applicationLayer.createApplicationProjectRuntime(options.projectRoot ?? defaultProjectRoot(), {
    applicationId: applicationModule.raxodeApplication.id,
    mode: options.mode ?? (process.env.RAXODE_LEGACY_APPLICATION_MODE === "dry-run" ? "dry-run" : "live"),
    model: process.env.AGENTCORE_CODEX_MODEL ?? "gpt-5.5",
    reasoningEffort: (process.env.AGENTCORE_CODEX_REASONING_EFFORT as never) ?? "low",
    permissionProfile: "standard",
    now: options.now,
    liveProviderResolver: async (manifest, context) => liveProviderModule.createRaxodeLiveProvider(manifest, {
      onTextDelta: context?.onTextDelta,
    }),
  });
  if (!created.ok) {
    await writeLog(logPath, {
      ts: options.now?.() ?? new Date().toISOString(),
      event: "stage_end",
      sessionId,
      turnIndex: 0,
      stage: "application/start",
      status: "failed",
      text: created.error.message,
    });
    errorOutput.write(`legacy direct application backend failed: ${created.error.message}\n`);
    return;
  }

  const transport = applicationLayer.createLocalApplicationTransport(created.runtime);
  const streamedTextByTurn = new Map<number, string>();
  transport.subscribe((applicationEvent) => {
    if (applicationEvent.kind !== "stream" || applicationEvent.message.length === 0) {
      return;
    }
    const legacyTurnIndex = parseApplicationTurnIndex(applicationEvent.turnId, turnIndex || 1);
    streamedTextByTurn.set(legacyTurnIndex, `${streamedTextByTurn.get(legacyTurnIndex) ?? ""}${applicationEvent.message}`);
    void writeLog(logPath, {
      ts: applicationEvent.createdAt,
      event: "assistant_delta",
      sessionId,
      turnIndex: legacyTurnIndex,
      label: "core/model.infer",
      text: applicationEvent.message,
      done: false,
    }).catch((error: unknown) => {
      errorOutput.write(`legacy direct application backend stream log failed: ${error instanceof Error ? error.message : String(error)}\n`);
    });
  });
  const start = await transport.dispatch({
    type: "application.start",
    sessionId,
    cwd,
    mode: options.mode ?? (process.env.RAXODE_LEGACY_APPLICATION_MODE === "dry-run" ? "dry-run" : "live"),
  });
  await writeLog(logPath, {
    ts: options.now?.() ?? new Date().toISOString(),
    event: "session_start",
    sessionId,
    context: contextFor(start),
  });

  let turnIndex = 0;
  const handlePayload = async (rawPayload: string) => {
    const payload = rawPayload.trim();
    if (!payload) return;
    await writeLog(logPath, {
      ts: options.now?.() ?? new Date().toISOString(),
      event: "stdin_payload_received",
      sessionId,
      byteLength: Buffer.byteLength(rawPayload, "utf8"),
      preview: payload.slice(0, 120),
    });
    if (payload === "/exit" || payload === "/quit") {
      await transport.dispatch({ type: "application.close", sessionId });
      if ("destroy" in input && typeof input.destroy === "function") {
        input.destroy();
      }
      return;
    }
    if (payload.startsWith("/rewind")) {
      await transport.dispatch({ type: "application.rewind", sessionId, turnIndex: Math.max(0, turnIndex - 1) });
      await writeLog(logPath, {
        ts: options.now?.() ?? new Date().toISOString(),
        event: "rewind_applied",
        sessionId,
        targetTurnId: String(Math.max(0, turnIndex - 1)),
      });
      return;
    }

    const normalized = normalizeDirectPayload(payload);
    turnIndex += 1;
    const turnStartedAt = options.now?.() ?? new Date().toISOString();
    await writeLog(logPath, {
      ts: turnStartedAt,
      event: "turn_start",
      sessionId,
      turnIndex,
      userMessage: normalized.text,
      inputSource: normalized.inputSource,
      context: contextFor(start),
    });
    await writeLog(logPath, {
      ts: turnStartedAt,
      event: "stage_start",
      sessionId,
      turnIndex,
      stage: "core/run",
      status: "running",
      text: "Raxode application backend is running.",
    });

    const result = await transport.dispatch({
      type: "application.submitTurn",
      sessionId,
      mode: options.mode ?? (process.env.RAXODE_LEGACY_APPLICATION_MODE === "dry-run" ? "dry-run" : "live"),
      input: {
        type: "application.input",
        text: normalized.text,
        attachments: normalized.attachments,
        cwd,
      },
    });
    const finalText = result.view.finalOutput ?? result.view.error?.message ?? "";
    if (finalText.length > 0 && (streamedTextByTurn.get(turnIndex) ?? "").length === 0) {
      for (const chunk of chunkStreamText(finalText)) {
        await writeLog(logPath, {
          ts: options.now?.() ?? new Date().toISOString(),
          event: "assistant_delta",
          sessionId,
          turnIndex,
          label: "core/model.infer",
          text: chunk,
          done: false,
        });
        await waitFrame(legacyStreamFrameMs());
      }
    }
    const completedAt = options.now?.() ?? new Date().toISOString();
    await writeLog(logPath, {
      ts: completedAt,
      event: "stage_end",
      sessionId,
      turnIndex,
      stage: "core/run",
      status: result.ok ? "completed" : "failed",
      text: result.ok ? "Raxode application backend completed." : result.view.error?.message ?? "Raxode application backend failed.",
    });
    await writeLog(logPath, {
      ts: completedAt,
      event: "turn_result",
      sessionId,
      turnIndex,
      elapsedMs: 0,
      core: {
        answer: finalText,
        dispatchStatus: result.ok ? "completed" : "failed",
        taskStatus: result.ok ? "completed" : "failed",
        context: contextFor(result),
        usage: {
          estimated: true,
        },
      },
      context: contextFor(result),
    });
  };
  handlePayloadImpl = handlePayload;
  for (const pendingPayload of pendingPayloads.splice(0)) {
    enqueuePayload(pendingPayload);
  }

  await inputClosed;
  await payloadQueue;
  await writeLog(logPath, {
    ts: options.now?.() ?? new Date().toISOString(),
    event: "session_end",
    sessionId,
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await startLegacyDirectApplicationBackend();
}
