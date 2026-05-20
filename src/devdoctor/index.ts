/*
 * File location: Praxis devdoctor backend diagnostic CLI.
 * Purpose: exercise and inspect any Praxis applicationLayer-compatible backend.
 * Boundary: records protocol-level facts; it does not bypass applicationLayer.
 */

import { appendFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createApplicationProjectRuntime,
  createLocalApplicationTransport,
  type PraxisApplicationCommand,
  type PraxisApplicationCommandResult,
  type PraxisApplicationEvent,
  type PraxisApplicationPermissionProfile,
  type PraxisApplicationReasoningEffort,
  type PraxisApplicationRuntimeMode,
  type PraxisApplicationTransportClient,
  type PraxisApplicationViewModel,
} from "../applicationLayer/index.js";
import type { RaxCliResult } from "../rax_packageManager/raxCli.js";

type JsonRecord = Record<string, unknown>;

type DevdoctorBackendConfig = {
  kind: "localProject";
  project: string;
} | {
  kind: "rest";
  url: string;
} | {
  kind: "websocket";
  url: string;
};

type DevdoctorProfileConfig = {
  backend: DevdoctorBackendConfig;
  prompt?: string;
  mode?: PraxisApplicationRuntimeMode;
  workspace?: string;
  permissionProfile?: PraxisApplicationPermissionProfile;
  model?: string;
  reasoningEffort?: PraxisApplicationReasoningEffort;
};

type DevdoctorConfig = {
  defaultProfile?: string;
  profiles?: Record<string, DevdoctorProfileConfig>;
};

type DevdoctorResolvedRun = {
  devdoctorDir: string;
  runDir: string;
  runId: string;
  profileName: string;
  profile: DevdoctorProfileConfig;
  json: boolean;
};

type DevdoctorDiagnosis = {
  runDir: string;
  status: "passed" | "failed" | "warning";
  startedAt?: string;
  completedAt: string;
  profileName?: string;
  backendKind?: string;
  project?: string;
  summary: {
    controls: number;
    events: number;
    views: number;
    errors: number;
    modelEvents: number;
    toolEvents: number;
    approvalEvents: number;
  };
  finalView?: {
    applicationId: string;
    projectId: string;
    runtimeId: string;
    sessionId: string;
    status: string;
    mode: string;
    model: string;
    reasoningEffort: string;
    workspaceRoot: string;
    mountedTools: number;
    totalTools: number;
    turns: number;
    modelCalls: number;
    toolCalls: number;
    finalOutput?: string;
    error?: { code: string; message: string };
  };
  findings: string[];
  artifacts: string[];
};

const DEFAULT_CONFIG: DevdoctorConfig = {
  defaultProfile: "local-doctor",
  profiles: {
    "local-doctor": {
      backend: { kind: "localProject", project: "doctor" },
      mode: "dry-run",
      permissionProfile: "standard",
      prompt: "Reply exactly: DEVDOCTOR_OK",
    },
  },
};

const USAGE = [
  "Usage:",
  "  rax devdoctor run|connect [--backend localProject|rest|websocket] [--profile name] [--project path] [--url http://127.0.0.1:port|ws://127.0.0.1:port/application/ws] [--prompt text] [--live|--dry-run] [--model name] [--reasoning-effort low|medium|high|xhigh] [--permission-profile standard|bapr|yolo] [--devdoctor-dir path] [--json]",
  "  rax devdoctor init [--devdoctor-dir path] [--force] [--json]",
  "  rax devdoctor inspect --run latest|path [--devdoctor-dir path] [--json]",
  "  rax devdoctor report --run latest|path [--devdoctor-dir path] [--json]",
  "  rax devdoctor cache-xray --run latest|path [--devdoctor-dir path] [--json]",
  "  rax devdoctor tools --run latest|path [--devdoctor-dir path] [--json]",
  "  rax devdoctor logs --run latest|path [--devdoctor-dir path] [--json]",
  "  rax devdoctor compat --run latest|path [--devdoctor-dir path] [--json]",
  "",
].join("\n");

function argValue(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  return args[index + 1];
}

function hasFlag(args: readonly string[], name: string): boolean {
  return args.includes(name);
}

function wantsHelp(args: readonly string[]): boolean {
  return args.includes("--help") || args.includes("-h") || args.includes("help");
}

function nowIso(): string {
  return new Date().toISOString();
}

function timestampId(): string {
  return nowIso().replaceAll(":", "-").replace(/\.\d+Z$/, "Z");
}

function defaultDevdoctorDir(): string {
  return path.join(process.cwd(), ".devdoctor");
}

function bundledDoctorProjectPath(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../doctor");
}

async function pathExists(pathname: string): Promise<boolean> {
  try {
    await stat(pathname);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile<T>(pathname: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(pathname, "utf8")) as T;
  } catch {
    return undefined;
  }
}

function mergeProfile(base: DevdoctorProfileConfig, args: readonly string[]): DevdoctorProfileConfig {
  const backendKind = argValue(args, "--backend");
  const project = argValue(args, "--project");
  const url = argValue(args, "--url");
  const prompt = argValue(args, "--prompt");
  const workspace = argValue(args, "--workspace") ?? argValue(args, "--cwd");
  const model = argValue(args, "--model");
  const reasoningEffort = argValue(args, "--reasoning-effort") as PraxisApplicationReasoningEffort | undefined;
  const permissionProfile = (argValue(args, "--permission-profile") ?? argValue(args, "--permission")) as PraxisApplicationPermissionProfile | undefined;
  const mode: PraxisApplicationRuntimeMode | undefined = hasFlag(args, "--live")
    ? "live"
    : hasFlag(args, "--dry-run")
      ? "dry-run"
      : undefined;

  return {
    ...base,
    backend: backendKind === "websocket"
      ? { kind: "websocket", url: url ?? ("url" in base.backend ? base.backend.url : "ws://127.0.0.1:0/application/ws") }
      : backendKind === "rest" || url !== undefined
        ? { kind: "rest", url: url ?? ("url" in base.backend ? base.backend.url : "http://127.0.0.1:0") }
      : project === undefined
        ? base.backend
        : { kind: "localProject", project },
    prompt: prompt ?? base.prompt,
    workspace: workspace ?? base.workspace,
    model: model ?? base.model,
    reasoningEffort: reasoningEffort ?? base.reasoningEffort,
    permissionProfile: permissionProfile ?? base.permissionProfile,
    mode: mode ?? base.mode,
  };
}

function createRestApplicationTransport(baseUrl: string): PraxisApplicationTransportClient {
  const normalized = baseUrl.replace(/\/+$/, "");
  async function readJson<T>(response: Response): Promise<T> {
    if (!response.ok) {
      throw new Error(`REST applicationLayer request failed: ${response.status} ${response.statusText}`);
    }
    return await response.json() as T;
  }
  return {
    descriptor: {
      kind: "rest",
      protocol: "rest-json",
      routes: ["GET /application/view", "POST /application/commands", "GET /application/events"],
    },
    async getView() {
      return await readJson<PraxisApplicationViewModel>(await fetch(`${normalized}/application/view`));
    },
    async dispatch(command) {
      return await readJson<PraxisApplicationCommandResult>(await fetch(`${normalized}/application/commands`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(command),
      }));
    },
    subscribe(listener) {
      const controller = new AbortController();
      void (async () => {
        try {
          const response = await fetch(`${normalized}/application/events`, {
            headers: { accept: "text/event-stream" },
            signal: controller.signal,
          });
          if (!response.ok || response.body === null) return;
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          while (!controller.signal.aborted) {
            const chunk = await reader.read();
            if (chunk.done) break;
            buffer += decoder.decode(chunk.value, { stream: true });
            const frames = buffer.split(/\n\n/);
            buffer = frames.pop() ?? "";
            for (const frame of frames) {
              for (const line of frame.split(/\r?\n/)) {
                if (!line.startsWith("data:")) continue;
                const text = line.slice("data:".length).trim();
                if (text.length === 0) continue;
                listener(JSON.parse(text) as PraxisApplicationEvent);
              }
            }
          }
        } catch {
          if (!controller.signal.aborted) return;
        }
      })();
      return () => controller.abort();
    },
  };
}

type ClosableTransport = PraxisApplicationTransportClient & {
  close?(): void;
};

type DevdoctorWebSocket = {
  send(data: string): void;
  close(): void;
  addEventListener(type: "open" | "error" | "message", listener: (event: { data?: unknown }) => void): void;
};

async function createWebSocketApplicationTransport(url: string): Promise<ClosableTransport> {
  const WebSocketCtor = (globalThis as typeof globalThis & { WebSocket?: new (url: string) => DevdoctorWebSocket }).WebSocket;
  if (WebSocketCtor === undefined) {
    throw new Error("global WebSocket is not available in this Node.js runtime");
  }
  const socket = new WebSocketCtor(url);
  const listeners = new Set<(event: PraxisApplicationEvent) => void>();
  const pending = new Map<string, (result: PraxisApplicationCommandResult) => void>();
  let latestView: PraxisApplicationViewModel | undefined;
  let commandCounter = 0;

  const ready = new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve());
    socket.addEventListener("error", () => reject(new Error(`failed to open applicationLayer websocket: ${url}`)));
  });
  socket.addEventListener("message", (event) => {
    const text = typeof event.data === "string" ? event.data : Buffer.from(event.data as ArrayBuffer).toString("utf8");
    const message = JSON.parse(text) as {
      type: string;
      view?: PraxisApplicationViewModel;
      event?: PraxisApplicationEvent;
      commandId?: string;
      result?: PraxisApplicationCommandResult;
      error?: { code: string; message: string };
    };
    if (message.view !== undefined) latestView = message.view;
    if (message.type === "application.event" && message.event !== undefined) {
      for (const listener of listeners) listener(message.event);
    }
    if (message.type === "application.commandResult" && message.commandId !== undefined && message.result !== undefined) {
      pending.get(message.commandId)?.(message.result);
      pending.delete(message.commandId);
    }
    if (message.type === "application.error" && message.commandId !== undefined) {
      const view = message.view ?? latestView;
      if (view !== undefined) {
        pending.get(message.commandId)?.({
          ok: false,
          view,
          events: [],
          error: message.error ?? { code: "APPLICATION_WS_ERROR", message: "unknown websocket error" },
        });
      }
      pending.delete(message.commandId);
    }
  });
  await ready;

  return {
    descriptor: {
      kind: "websocket",
      protocol: "websocket-json",
      messageTypes: ["application.command", "application.commandResult", "application.event", "application.view"],
    },
    async getView() {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        if (latestView !== undefined) return latestView;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error("websocket backend did not send application.ready view");
    },
    async dispatch(command) {
      await ready;
      const commandId = `devdoctor.ws.${++commandCounter}`;
      const result = new Promise<PraxisApplicationCommandResult>((resolve) => pending.set(commandId, resolve));
      socket.send(JSON.stringify({ type: "application.command", commandId, command }));
      return await result;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      socket.close();
    },
  };
}

async function loadConfig(devdoctorDir: string): Promise<DevdoctorConfig> {
  const configPath = path.join(devdoctorDir, "config.json");
  const loaded = await readJsonFile<DevdoctorConfig>(configPath);
  if (loaded === undefined) return DEFAULT_CONFIG;
  return {
    ...DEFAULT_CONFIG,
    ...loaded,
    profiles: {
      ...DEFAULT_CONFIG.profiles,
      ...loaded.profiles,
    },
  };
}

async function resolveRun(args: readonly string[]): Promise<DevdoctorResolvedRun> {
  const devdoctorDir = path.resolve(argValue(args, "--devdoctor-dir") ?? defaultDevdoctorDir());
  const config = await loadConfig(devdoctorDir);
  const profileName = argValue(args, "--profile") ?? config.defaultProfile ?? "local-doctor";
  const baseProfile = config.profiles?.[profileName];
  if (baseProfile === undefined) {
    throw new Error(`unknown devdoctor profile: ${profileName}`);
  }
  const runId = timestampId();
  const runDir = path.join(devdoctorDir, "runs", runId);
  return {
    devdoctorDir,
    runDir,
    runId,
    profileName,
    profile: mergeProfile(baseProfile, args),
    json: hasFlag(args, "--json"),
  };
}

async function appendJsonl(filePath: string, value: unknown): Promise<void> {
  await appendFile(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

async function writeDefaultConfig(devdoctorDir: string, force: boolean): Promise<{ path: string; wrote: boolean; config: DevdoctorConfig }> {
  await mkdir(devdoctorDir, { recursive: true });
  const configPath = path.join(devdoctorDir, "config.json");
  if (!force && await pathExists(configPath)) {
    const existing = await readJsonFile<DevdoctorConfig>(configPath);
    return { path: configPath, wrote: false, config: existing ?? DEFAULT_CONFIG };
  }
  const config: DevdoctorConfig = {
    defaultProfile: "local-doctor",
    profiles: {
      "local-doctor": {
        backend: { kind: "localProject", project: "doctor" },
        mode: "dry-run",
        permissionProfile: "standard",
        prompt: "Reply exactly: DEVDOCTOR_OK",
      },
      "rest-template": {
        backend: { kind: "rest", url: "http://127.0.0.1:3000" },
        mode: "dry-run",
        permissionProfile: "standard",
        prompt: "Reply exactly: DEVDOCTOR_OK",
      },
      "websocket-template": {
        backend: { kind: "websocket", url: "ws://127.0.0.1:3000/application/ws" },
        mode: "dry-run",
        permissionProfile: "standard",
        prompt: "Reply exactly: DEVDOCTOR_OK",
      },
    },
  };
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return { path: configPath, wrote: true, config };
}

async function readJsonl<T>(filePath: string): Promise<T[]> {
  if (!await pathExists(filePath)) return [];
  const text = await readFile(filePath, "utf8");
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function asRecord(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null ? value as JsonRecord : {};
}

function createRecorder(runDir: string) {
  return {
    async meta(value: unknown) {
      await writeFile(path.join(runDir, "config.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
    },
    async raw(kind: string, payload: unknown) {
      await appendJsonl(path.join(runDir, "raw.jsonl"), { recordedAt: nowIso(), kind, payload });
    },
    async control(commandId: string, command: PraxisApplicationCommand) {
      const entry = { recordedAt: nowIso(), commandId, command };
      await appendJsonl(path.join(runDir, "controls.jsonl"), entry);
      await appendJsonl(path.join(runDir, "raw.jsonl"), { ...entry, kind: "control" });
    },
    async result(commandId: string, result: PraxisApplicationCommandResult) {
      const entry = { recordedAt: nowIso(), commandId, result };
      await appendJsonl(path.join(runDir, "raw.jsonl"), { ...entry, kind: "result" });
      await this.view(result.view);
      for (const event of result.events) await this.event(event);
      if (!result.ok) await this.error({ source: "commandResult", commandId, error: result.error });
    },
    async event(event: PraxisApplicationEvent) {
      await appendJsonl(path.join(runDir, "events.jsonl"), event);
      await appendJsonl(path.join(runDir, "raw.jsonl"), { recordedAt: nowIso(), kind: "event", payload: event });
      if (event.kind === "model") await appendJsonl(path.join(runDir, "model-calls.jsonl"), event);
      if (event.kind === "tool") await appendJsonl(path.join(runDir, "tool-calls.jsonl"), event);
      if (event.kind === "approval") await appendJsonl(path.join(runDir, "approval-events.jsonl"), event);
      if (event.kind === "error") await this.error({ source: "event", event });
    },
    async view(view: PraxisApplicationViewModel) {
      await appendJsonl(path.join(runDir, "views.jsonl"), view);
    },
    async error(error: unknown) {
      await appendJsonl(path.join(runDir, "errors.jsonl"), { recordedAt: nowIso(), error });
    },
  };
}

async function dispatchRecorded(input: {
  transport: PraxisApplicationTransportClient;
  recorder: ReturnType<typeof createRecorder>;
  commandId: string;
  command: PraxisApplicationCommand;
}): Promise<PraxisApplicationCommandResult> {
  await input.recorder.control(input.commandId, input.command);
  const result = await input.transport.dispatch(input.command);
  await input.recorder.result(input.commandId, result);
  return result;
}

async function runApplicationDiagnosticScript(
  resolved: DevdoctorResolvedRun,
  transport: PraxisApplicationTransportClient,
  recorder: ReturnType<typeof createRecorder>,
): Promise<void> {
  await recorder.view(await transport.getView());
  const workspace = path.resolve(resolved.profile.workspace ?? process.cwd());
  const mode = resolved.profile.mode ?? "dry-run";
  await dispatchRecorded({
    transport,
    recorder,
    commandId: "start",
    command: { type: "application.start", cwd: workspace, mode },
  });

  if (resolved.profile.permissionProfile !== undefined) {
    await dispatchRecorded({
      transport,
      recorder,
      commandId: "permission",
      command: { type: "application.changePermissionProfile", profile: resolved.profile.permissionProfile },
    });
  }

  if (resolved.profile.model !== undefined) {
    await dispatchRecorded({
      transport,
      recorder,
      commandId: "model",
      command: {
        type: "application.changeModel",
        model: resolved.profile.model,
        reasoningEffort: resolved.profile.reasoningEffort,
      },
    });
  }

  const prompt = resolved.profile.prompt ?? "Reply exactly: DEVDOCTOR_OK";
  await dispatchRecorded({
    transport,
    recorder,
    commandId: "submitTurn",
    command: {
      type: "application.submitTurn",
      mode,
      input: {
        type: "application.input",
        text: prompt,
        cwd: workspace,
      },
    },
  });

  const finalView = await transport.getView();
  await recorder.view(finalView);
  await writeTranscript(resolved.runDir, prompt, finalView);
  await dispatchRecorded({
    transport,
    recorder,
    commandId: "close",
    command: { type: "application.close" },
  });
}

async function runLocalProject(resolved: DevdoctorResolvedRun): Promise<DevdoctorDiagnosis> {
  await mkdir(resolved.runDir, { recursive: true });
  const recorder = createRecorder(resolved.runDir);
  await recorder.meta({
    tool: "rax devdoctor",
    schemaVersion: "0.1.0",
    runId: resolved.runId,
    startedAt: nowIso(),
    profileName: resolved.profileName,
    profile: resolved.profile,
  });

  if (resolved.profile.backend.kind !== "localProject") {
    await recorder.error({ source: "runLocalProject", error: { message: "profile backend is not localProject" } });
    return await writeDiagnosis(resolved.runDir, resolved.profileName, resolved.profile);
  }
  const requestedProjectPath = path.resolve(resolved.profile.backend.project);
  const projectPath = await pathExists(requestedProjectPath)
    ? requestedProjectPath
    : resolved.profile.backend.project === "doctor"
      ? bundledDoctorProjectPath()
      : requestedProjectPath;
  await recorder.raw("backend.resolve", {
    backendKind: resolved.profile.backend.kind,
    projectPath,
  });

  const created = await createApplicationProjectRuntime(projectPath, {
    now: () => nowIso(),
  });
  if (!created.ok) {
    await recorder.error({ source: "createApplicationProjectRuntime", error: created.error });
    return await writeDiagnosis(resolved.runDir, resolved.profileName, resolved.profile);
  }

  const transport = createLocalApplicationTransport(created.runtime);
  const unsubscribe = transport.subscribe((event) => {
    void recorder.event(event);
  });
  try {
    await runApplicationDiagnosticScript(resolved, transport, recorder);
  } catch (error) {
    await recorder.error({
      source: "runLocalProject",
      error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error,
    });
  } finally {
    unsubscribe();
  }
  return await writeDiagnosis(resolved.runDir, resolved.profileName, resolved.profile);
}

async function runRestBackend(resolved: DevdoctorResolvedRun): Promise<DevdoctorDiagnosis> {
  await mkdir(resolved.runDir, { recursive: true });
  const recorder = createRecorder(resolved.runDir);
  await recorder.meta({
    tool: "rax devdoctor",
    schemaVersion: "0.1.0",
    runId: resolved.runId,
    startedAt: nowIso(),
    profileName: resolved.profileName,
    profile: resolved.profile,
  });
  if (resolved.profile.backend.kind !== "rest") {
    await recorder.error({ source: "runRestBackend", error: { message: "profile backend is not rest" } });
    return await writeDiagnosis(resolved.runDir, resolved.profileName, resolved.profile);
  }
  const transport = createRestApplicationTransport(resolved.profile.backend.url);
  const unsubscribe = transport.subscribe((event) => {
    void recorder.event(event);
  });
  try {
    await recorder.raw("backend.connect", {
      backendKind: "rest",
      url: resolved.profile.backend.url,
    });
    await runApplicationDiagnosticScript(resolved, transport, recorder);
  } catch (error) {
    await recorder.error({
      source: "runRestBackend",
      error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error,
    });
  } finally {
    unsubscribe();
  }
  return await writeDiagnosis(resolved.runDir, resolved.profileName, resolved.profile);
}

async function runWebSocketBackend(resolved: DevdoctorResolvedRun): Promise<DevdoctorDiagnosis> {
  await mkdir(resolved.runDir, { recursive: true });
  const recorder = createRecorder(resolved.runDir);
  await recorder.meta({
    tool: "rax devdoctor",
    schemaVersion: "0.1.0",
    runId: resolved.runId,
    startedAt: nowIso(),
    profileName: resolved.profileName,
    profile: resolved.profile,
  });
  if (resolved.profile.backend.kind !== "websocket") {
    await recorder.error({ source: "runWebSocketBackend", error: { message: "profile backend is not websocket" } });
    return await writeDiagnosis(resolved.runDir, resolved.profileName, resolved.profile);
  }
  let transport: ClosableTransport | undefined;
  let unsubscribe: (() => void) | undefined;
  try {
    transport = await createWebSocketApplicationTransport(resolved.profile.backend.url);
    unsubscribe = transport.subscribe((event) => {
      void recorder.event(event);
    });
    await recorder.raw("backend.connect", {
      backendKind: "websocket",
      url: resolved.profile.backend.url,
    });
    await runApplicationDiagnosticScript(resolved, transport, recorder);
  } catch (error) {
    await recorder.error({
      source: "runWebSocketBackend",
      error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error,
    });
  } finally {
    unsubscribe?.();
    transport?.close?.();
  }
  return await writeDiagnosis(resolved.runDir, resolved.profileName, resolved.profile);
}

async function writeTranscript(runDir: string, prompt: string, view: PraxisApplicationViewModel): Promise<void> {
  const lines = [
    "# Devdoctor Transcript",
    "",
    `Prompt: ${prompt}`,
    "",
    `Status: ${view.status}`,
    `Model: ${view.model.model}`,
    `Reasoning effort: ${view.model.reasoningEffort}`,
    `Workspace: ${view.workspaceRoot}`,
    "",
    "## Final Output",
    "",
    view.finalOutput ?? "",
    "",
  ];
  await writeFile(path.join(runDir, "transcript.md"), lines.join("\n"), "utf8");
}

async function resolveExistingRun(args: readonly string[]): Promise<string> {
  const devdoctorDir = path.resolve(argValue(args, "--devdoctor-dir") ?? defaultDevdoctorDir());
  const requested = argValue(args, "--run") ?? args[1] ?? "latest";
  if (requested !== "latest") {
    return path.resolve(requested);
  }
  const runsDir = path.join(devdoctorDir, "runs");
  const entries = await readdir(runsDir, { withFileTypes: true });
  const dirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  const latest = dirs.at(-1);
  if (latest === undefined) {
    throw new Error(`no devdoctor runs found under ${runsDir}`);
  }
  return path.join(runsDir, latest);
}

async function writeDiagnosis(runDir: string, profileName?: string, profile?: DevdoctorProfileConfig): Promise<DevdoctorDiagnosis> {
  const controls = await readJsonl<JsonRecord>(path.join(runDir, "controls.jsonl"));
  const events = await readJsonl<PraxisApplicationEvent>(path.join(runDir, "events.jsonl"));
  const views = await readJsonl<PraxisApplicationViewModel>(path.join(runDir, "views.jsonl"));
  const errors = await readJsonl<JsonRecord>(path.join(runDir, "errors.jsonl"));
  const modelEvents = events.filter((event) => event.kind === "model");
  const toolEvents = events.filter((event) => event.kind === "tool");
  const approvalEvents = events.filter((event) => event.kind === "approval");
  const finalView = views.at(-1);
  const findings: string[] = [];
  if (errors.length > 0) findings.push(`${errors.length} error record(s) captured.`);
  if (finalView === undefined) findings.push("No application view was captured.");
  if (finalView?.status === "failed") findings.push(finalView.error?.message ?? "Application final status is failed.");
  if ((finalView?.tools.mounted ?? 0) === 0) findings.push("No mounted tools detected.");
  if (controls.length === 0) findings.push("No control command was recorded.");
  if (findings.length === 0) findings.push("ApplicationLayer run completed and protocol artifacts were captured.");

  const diagnosis: DevdoctorDiagnosis = {
    runDir,
    status: errors.length > 0 || finalView?.status === "failed" ? "failed" : finalView === undefined ? "warning" : "passed",
    startedAt: await readStartedAt(runDir),
    completedAt: nowIso(),
    profileName,
    backendKind: profile?.backend.kind,
    project: profile?.backend.kind === "localProject" ? profile.backend.project : profile?.backend.url,
    summary: {
      controls: controls.length,
      events: events.length,
      views: views.length,
      errors: errors.length,
      modelEvents: modelEvents.length,
      toolEvents: toolEvents.length,
      approvalEvents: approvalEvents.length,
    },
    finalView: finalView === undefined ? undefined : {
      applicationId: finalView.applicationId,
      projectId: finalView.projectId,
      runtimeId: finalView.runtimeId,
      sessionId: finalView.sessionId,
      status: finalView.status,
      mode: finalView.mode,
      model: finalView.model.model,
      reasoningEffort: finalView.model.reasoningEffort,
      workspaceRoot: finalView.workspaceRoot,
      mountedTools: finalView.tools.mounted,
      totalTools: finalView.tools.total,
      turns: finalView.counters.turns,
      modelCalls: finalView.counters.modelCalls,
      toolCalls: finalView.counters.toolCalls,
      finalOutput: finalView.finalOutput,
      error: finalView.error,
    },
    findings,
    artifacts: [
      "config.json",
      "controls.jsonl",
      "events.jsonl",
      "views.jsonl",
      "raw.jsonl",
      "errors.jsonl",
      "transcript.md",
      "diagnosis.json",
      "diagnosis.md",
    ],
  };
  await writeFile(path.join(runDir, "diagnosis.json"), `${JSON.stringify(diagnosis, null, 2)}\n`, "utf8");
  await writeFile(path.join(runDir, "diagnosis.md"), formatDiagnosis(diagnosis), "utf8");
  return diagnosis;
}

async function readStartedAt(runDir: string): Promise<string | undefined> {
  const config = await readJsonFile<JsonRecord>(path.join(runDir, "config.json"));
  return typeof config?.startedAt === "string" ? config.startedAt : undefined;
}

function formatDiagnosis(diagnosis: DevdoctorDiagnosis): string {
  const view = diagnosis.finalView;
  return [
    "# Devdoctor Diagnosis",
    "",
    `Status: ${diagnosis.status}`,
    `Run dir: ${diagnosis.runDir}`,
    diagnosis.profileName === undefined ? undefined : `Profile: ${diagnosis.profileName}`,
    view === undefined ? undefined : `Application: ${view.applicationId}`,
    view === undefined ? undefined : `Session: ${view.sessionId}`,
    view === undefined ? undefined : `Model: ${view.model} (${view.reasoningEffort})`,
    view === undefined ? undefined : `Tools: ${view.mountedTools}/${view.totalTools}`,
    "",
    "## Counts",
    "",
    `Controls: ${diagnosis.summary.controls}`,
    `Events: ${diagnosis.summary.events}`,
    `Errors: ${diagnosis.summary.errors}`,
    `Model events: ${diagnosis.summary.modelEvents}`,
    `Tool events: ${diagnosis.summary.toolEvents}`,
    `Approval events: ${diagnosis.summary.approvalEvents}`,
    "",
    "## Findings",
    "",
    ...diagnosis.findings.map((finding) => `- ${finding}`),
    "",
  ].filter((line): line is string => line !== undefined).join("\n");
}

function formatSummary(diagnosis: DevdoctorDiagnosis): string {
  const view = diagnosis.finalView;
  return [
    `Devdoctor ${diagnosis.status}`,
    `Run: ${diagnosis.runDir}`,
    view === undefined ? undefined : `Application: ${view.applicationId}`,
    view === undefined ? undefined : `Session: ${view.sessionId}`,
    view === undefined ? undefined : `Status: ${view.status}`,
    view === undefined ? undefined : `Model: ${view.model} (${view.reasoningEffort})`,
    view === undefined ? undefined : `Tools: ${view.mountedTools}/${view.totalTools}`,
    `Events: ${diagnosis.summary.events}, errors: ${diagnosis.summary.errors}`,
    "",
  ].filter((line): line is string => line !== undefined).join("\n");
}

async function handleRun(args: readonly string[]): Promise<RaxCliResult> {
  const resolved = await resolveRun(args);
  const diagnosis = resolved.profile.backend.kind === "rest"
    ? await runRestBackend(resolved)
    : resolved.profile.backend.kind === "websocket"
      ? await runWebSocketBackend(resolved)
    : await runLocalProject(resolved);
  return {
    exitCode: diagnosis.status === "failed" ? 1 : 0,
    output: resolved.json ? `${JSON.stringify(diagnosis, null, 2)}\n` : formatSummary(diagnosis),
  };
}

async function handleInit(args: readonly string[]): Promise<RaxCliResult> {
  const devdoctorDir = path.resolve(argValue(args, "--devdoctor-dir") ?? defaultDevdoctorDir());
  const result = await writeDefaultConfig(devdoctorDir, hasFlag(args, "--force"));
  if (hasFlag(args, "--json")) {
    return { exitCode: 0, output: `${JSON.stringify(result, null, 2)}\n` };
  }
  return {
    exitCode: 0,
    output: [
      result.wrote ? "Devdoctor config written" : "Devdoctor config already exists",
      `Path: ${result.path}`,
      "",
    ].join("\n"),
  };
}

async function handleInspect(args: readonly string[]): Promise<RaxCliResult> {
  const runDir = await resolveExistingRun(args);
  const diagnosis = await writeDiagnosis(runDir);
  return {
    exitCode: diagnosis.status === "failed" ? 1 : 0,
    output: hasFlag(args, "--json") ? `${JSON.stringify(diagnosis, null, 2)}\n` : formatSummary(diagnosis),
  };
}

async function handleCacheXray(args: readonly string[]): Promise<RaxCliResult> {
  const runDir = await resolveExistingRun(args);
  const views = await readJsonl<PraxisApplicationViewModel>(path.join(runDir, "views.jsonl"));
  const last = views.at(-1);
  const report = {
    runDir,
    status: last?.usage === undefined && last?.context === undefined ? "no-cache-telemetry" : "ok",
    usage: last?.usage,
    context: last?.context,
    model: last?.model,
    note: "cache-xray reads applicationLayer usage/context fields. Provider-specific cache payloads can be added later without changing the run recorder.",
  };
  await writeFile(path.join(runDir, "cache-xray.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (hasFlag(args, "--json")) {
    return { exitCode: 0, output: `${JSON.stringify(report, null, 2)}\n` };
  }
  return {
    exitCode: 0,
    output: [
      `Cache xray: ${report.status}`,
      `Run: ${runDir}`,
      last?.usage === undefined ? "Usage: not captured" : `Usage: ${JSON.stringify(last.usage)}`,
      last?.context === undefined ? "Context: not captured" : `Context: ${JSON.stringify(last.context)}`,
      "",
    ].join("\n"),
  };
}

async function handleTools(args: readonly string[]): Promise<RaxCliResult> {
  const runDir = await resolveExistingRun(args);
  const views = await readJsonl<PraxisApplicationViewModel>(path.join(runDir, "views.jsonl"));
  const toolEvents = await readJsonl<PraxisApplicationEvent>(path.join(runDir, "tool-calls.jsonl"));
  const last = views.at(-1);
  const report = {
    runDir,
    mounted: last?.tools.mounted ?? 0,
    total: last?.tools.total ?? 0,
    byFamily: last?.tools.byFamily ?? {},
    byRiskLevel: last?.tools.byRiskLevel ?? {},
    byReadiness: last?.tools.byReadiness ?? {},
    mountedToolIds: last?.tools.mountedToolIds ?? [],
    toolEvents: toolEvents.length,
    recentToolEvents: toolEvents.slice(-20),
  };
  await writeFile(path.join(runDir, "tool-inspector.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (hasFlag(args, "--json")) return { exitCode: 0, output: `${JSON.stringify(report, null, 2)}\n` };
  return {
    exitCode: 0,
    output: [
      `Tool inspector: ${report.mounted}/${report.total} mounted`,
      `Tool events: ${report.toolEvents}`,
      `Mounted IDs: ${report.mountedToolIds.slice(0, 20).join(", ") || "none"}`,
      report.mountedToolIds.length > 20 ? `... ${report.mountedToolIds.length - 20} more` : undefined,
      "",
    ].filter((line): line is string => line !== undefined).join("\n"),
  };
}

async function handleLogs(args: readonly string[]): Promise<RaxCliResult> {
  const runDir = await resolveExistingRun(args);
  const controls = await readJsonl<JsonRecord>(path.join(runDir, "controls.jsonl"));
  const events = await readJsonl<PraxisApplicationEvent>(path.join(runDir, "events.jsonl"));
  const errors = await readJsonl<JsonRecord>(path.join(runDir, "errors.jsonl"));
  const report = {
    runDir,
    controls: controls.length,
    events: events.length,
    errors: errors.length,
    eventKinds: events.reduce<Record<string, number>>((acc, event) => {
      acc[event.kind] = (acc[event.kind] ?? 0) + 1;
      return acc;
    }, {}),
    recentEvents: events.slice(-20),
    recentErrors: errors.slice(-20),
  };
  await writeFile(path.join(runDir, "log-inspector.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (hasFlag(args, "--json")) return { exitCode: 0, output: `${JSON.stringify(report, null, 2)}\n` };
  return {
    exitCode: 0,
    output: [
      `Log inspector: ${report.events} events, ${report.controls} controls, ${report.errors} errors`,
      `Kinds: ${JSON.stringify(report.eventKinds)}`,
      report.recentErrors.length === 0 ? "Recent errors: none" : `Recent errors: ${JSON.stringify(report.recentErrors)}`,
      "",
    ].join("\n"),
  };
}

async function handleCompat(args: readonly string[]): Promise<RaxCliResult> {
  const runDir = await resolveExistingRun(args);
  const diagnosis = await writeDiagnosis(runDir);
  const controls = await readJsonl<{ command?: PraxisApplicationCommand }>(path.join(runDir, "controls.jsonl"));
  const events = await readJsonl<PraxisApplicationEvent>(path.join(runDir, "events.jsonl"));
  const views = await readJsonl<PraxisApplicationViewModel>(path.join(runDir, "views.jsonl"));
  const commandTypes = new Set(controls.map((entry) => entry.command?.type).filter(Boolean));
  const checks = [
    { id: "view.captured", ok: views.length > 0, evidence: `${views.length} view snapshot(s)` },
    { id: "command.start", ok: commandTypes.has("application.start"), evidence: "application.start command" },
    { id: "command.submitTurn", ok: commandTypes.has("application.submitTurn"), evidence: "application.submitTurn command" },
    { id: "command.close", ok: commandTypes.has("application.close"), evidence: "application.close command" },
    { id: "events.captured", ok: events.length > 0, evidence: `${events.length} event(s)` },
    { id: "model.visible", ok: diagnosis.finalView?.model !== undefined, evidence: diagnosis.finalView?.model ?? "missing" },
    { id: "tools.visible", ok: (diagnosis.finalView?.totalTools ?? 0) > 0, evidence: `${diagnosis.finalView?.mountedTools ?? 0}/${diagnosis.finalView?.totalTools ?? 0}` },
    { id: "errors.empty", ok: diagnosis.summary.errors === 0, evidence: `${diagnosis.summary.errors} error(s)` },
  ];
  const report = {
    runDir,
    status: checks.every((check) => check.ok) ? "compatible" : "incomplete",
    checks,
  };
  await writeFile(path.join(runDir, "compatibility.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (hasFlag(args, "--json")) {
    return { exitCode: report.status === "compatible" ? 0 : 1, output: `${JSON.stringify(report, null, 2)}\n` };
  }
  return {
    exitCode: report.status === "compatible" ? 0 : 1,
    output: [
      `Compatibility: ${report.status}`,
      ...checks.map((check) => `${check.ok ? "PASS" : "FAIL"} ${check.id}: ${check.evidence}`),
      "",
    ].join("\n"),
  };
}

export async function runDevDoctor(argv = process.argv.slice(2)): Promise<RaxCliResult> {
  const [command = "run", ...rest] = argv;
  try {
    if (wantsHelp(argv)) return { exitCode: 0, output: USAGE };
    if (command === "init") return await handleInit(rest);
    if (command === "run" || command === "connect") return await handleRun(rest);
    if (command === "inspect" || command === "report") return await handleInspect(rest);
    if (command === "cache-xray") return await handleCacheXray(rest);
    if (command === "tools") return await handleTools(rest);
    if (command === "logs") return await handleLogs(rest);
    if (command === "compat") return await handleCompat(rest);
    return { exitCode: 1, output: USAGE };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { exitCode: 1, output: `Devdoctor failed: ${message}\n` };
  }
}
