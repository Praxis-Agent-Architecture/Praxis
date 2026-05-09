/*
 * 文件定位：raxode-cli / agentCore 后端适配。
 * 核心目的：把 raxode application command 转成 agentCore public API 调用。
 * 边界：这是唯一允许导入 agentCore runtime 的 raxode-cli 后端文件。
 */

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  praxis,
  type AgentManifest,
  type AgentRunResult,
  type InterfaceEnvelope,
} from "../../src/agentCore/index.js";
import type {
  RaxodeApplicationBackend,
  RaxodeApplicationBackendResult,
  RaxodeApplicationCommand,
  RaxodeApplicationEvent,
  RaxodeApplicationRunMode,
  RaxodeAgentManifestSummary,
  RaxodeBackendCapabilitySummary,
  RaxodeBackendProfile,
  RaxodeToolCatalogSummary,
  RaxodeApplicationViewModel,
} from "../contracts.js";

type ProjectDescriptor = {
  entry?: string;
  export?: string;
};

const PROFILE_DEFAULT_AGENT: Record<RaxodeBackendProfile, string> = {
  "coding-full": "realtest/caonima",
  "framework-proof": "realtest/caonima",
  "custom-agent": "realtest/minimal",
};

const PROFILE_DEFAULT_TASK: Record<RaxodeBackendProfile, string> = {
  "coding-full": [
    "你是 raxode coding 后端的全能力代理。",
    "优先理解当前仓库、工具目录、运行时证据、会话状态和审批边界。",
    "需要工具时通过 framework 暴露的 BaseTool 语义选择工具，不要伪造工具结果。",
  ].join("\n"),
  "framework-proof": "证明当前 Praxis framework 后端、BaseTool、runtime、interface surface 是否真实可用。",
  "custom-agent": "Run this Praxis agent from Raxode.",
};

function event(input: Omit<RaxodeApplicationEvent, "publicSafe">): RaxodeApplicationEvent {
  return { ...input, publicSafe: true };
}

function createdAt(now?: () => string): string {
  return now?.() ?? new Date().toISOString();
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveRaxodeAgentEntry(input: {
  agentPath: string;
  cwd: string;
  exportName?: string;
}): Promise<{ agentPath: string; exportName?: string; projectRoot?: string }> {
  const absolute = path.resolve(input.cwd, input.agentPath);
  const info = await stat(absolute);
  if (!info.isDirectory()) {
    return { agentPath: absolute, exportName: input.exportName };
  }

  const descriptorPath = path.join(absolute, "rax.project.json");
  if (await pathExists(descriptorPath)) {
    const descriptor = JSON.parse(await readFile(descriptorPath, "utf8")) as ProjectDescriptor;
    if (typeof descriptor.entry === "string" && descriptor.entry.trim().length > 0) {
      return {
        agentPath: path.resolve(absolute, descriptor.entry),
        exportName: input.exportName ?? descriptor.export,
        projectRoot: absolute,
      };
    }
  }

  for (const entry of ["praxis.agent.ts", "agents/mainAgent.ts", "agents/repoInspectorAgent.ts"]) {
    const candidate = path.join(absolute, entry);
    if (await pathExists(candidate)) {
      return { agentPath: candidate, exportName: input.exportName, projectRoot: absolute };
    }
  }

  throw new Error(`no Praxis agent entry found in ${absolute}`);
}

async function compileRaxodeAgent(input: {
  agentPath: string;
  cwd: string;
  exportName?: string;
}): Promise<ReturnType<typeof praxis.compileAgent> & { resolvedAgentPath?: string; projectRoot?: string }> {
  const resolved = await resolveRaxodeAgentEntry(input);
  const module = await import(pathToFileURL(resolved.agentPath).href) as Record<string, unknown>;
  const explicitExport = resolved.exportName?.trim();
  if (explicitExport) {
    return {
      ...praxis.compileAgent(module[explicitExport] as never),
      resolvedAgentPath: resolved.agentPath,
      projectRoot: resolved.projectRoot,
    };
  }

  const candidates = [
    ["default", module.default],
    ...Object.entries(module).filter(([name]) => name !== "default"),
  ] as [string, unknown][];
  for (const [, candidate] of candidates) {
    const compiled = praxis.compileAgent(candidate as never);
    if (compiled.ok) {
      return {
        ...compiled,
        resolvedAgentPath: resolved.agentPath,
        projectRoot: resolved.projectRoot,
      };
    }
  }
  return {
    ...praxis.compileAgent(undefined as never),
    resolvedAgentPath: resolved.agentPath,
    projectRoot: resolved.projectRoot,
  };
}

function okEnvelope(envelope: ReturnType<typeof praxis.interfaceAdapter.createInterfaceEnvelope>): InterfaceEnvelope | undefined {
  return envelope.ok ? envelope.envelope : undefined;
}

function summarizeToolCatalog(selectedToolIds: readonly string[] = []): RaxodeToolCatalogSummary {
  const entries = praxis.inspection.createBaseToolRealityLedger();
  const byFamily: Record<string, number> = {};
  const byRiskLevel: Record<string, number> = {};
  const byReadiness: Record<string, number> = {};
  for (const entry of entries) {
    byFamily[entry.storageFamily] = (byFamily[entry.storageFamily] ?? 0) + 1;
    byRiskLevel[entry.riskLevel] = (byRiskLevel[entry.riskLevel] ?? 0) + 1;
    byReadiness[entry.developerReadiness] = (byReadiness[entry.developerReadiness] ?? 0) + 1;
  }
  const selectedSet = new Set(selectedToolIds);
  const selectedEntries = selectedSet.size === 0
    ? entries
    : entries.filter((entry) => selectedSet.has(entry.toolId));
  return {
    total: entries.length,
    byFamily,
    byRiskLevel,
    byReadiness,
    selectedToolIds: selectedEntries.map((entry) => entry.toolId).sort(),
    selectedFamilies: [...new Set(selectedEntries.map((entry) => entry.storageFamily))].sort(),
  };
}

function manifestSummary(manifest: AgentManifest): RaxodeAgentManifestSummary {
  return {
    manifestId: manifest.manifestId,
    manifestHash: manifest.manifestHash,
    identityId: manifest.identity.id,
    model: manifest.model.model,
    promptPackId: manifest.promptPack.promptPackId,
    toolPolicyProfile: manifest.toolPolicy.profile,
    sandboxProfile: manifest.sandbox.profile,
    sessionPersistence: manifest.session.persistence,
    storageKind: manifest.storage.kind ?? "unknown",
    toolCount: manifest.harness.tools.length,
  };
}

function capabilitySummary(input: {
  profile: RaxodeBackendProfile;
  selectedToolIds?: readonly string[];
}): RaxodeBackendCapabilitySummary {
  return {
    profile: input.profile,
    backend: "agentCore",
    defaultAgentPath: PROFILE_DEFAULT_AGENT[input.profile],
    defaultTask: PROFILE_DEFAULT_TASK[input.profile],
    codingOriented: input.profile === "coding-full",
    allCatalogToolsVisible: input.profile === "coding-full" || input.profile === "framework-proof",
    toolCatalog: summarizeToolCatalog(input.selectedToolIds),
  };
}

function buildView(input: {
  mode: RaxodeApplicationRunMode;
  capability: RaxodeBackendCapabilitySummary;
  manifest?: AgentManifest;
  runtimeResult?: AgentRunResult;
  envelopes: readonly InterfaceEnvelope[];
  appEvents: readonly RaxodeApplicationEvent[];
  error?: { code: string; message: string };
}): RaxodeApplicationViewModel {
  const manifest = input.manifest;
  const result = input.runtimeResult;
  const status = result?.ok === true ? "completed" : "failed";
  const error = input.error ?? (result?.ok === false ? { code: result.error.code, message: result.error.message } : undefined);
  const runtimeId = result?.runtimeId ?? "runtime.raxode.application";
  const sessionId = result?.sessionId ?? "session.raxode.application";
  const modelCalls = result?.ok === true ? result.modelCalls.length : 0;
  const toolCalls = result?.ok === true ? result.toolCalls.length : 0;
  const mainLoopSteps = result?.mainLoopSteps?.length ?? 0;
  const runtimeEvents = result?.events.length ?? 0;
  const manifestView = manifest === undefined ? undefined : manifestSummary(manifest);
  const lines = [
    `profile: ${input.capability.profile}`,
    `agent: ${manifest?.identity.id ?? "unknown"}`,
    `model: ${manifest?.model.model ?? "unknown"}`,
    `tools: ${manifest?.harness.tools.length ?? input.capability.toolCatalog.selectedToolIds.length}/${input.capability.toolCatalog.total}`,
    `runtime: ${runtimeId}`,
    `session: ${sessionId}`,
    `interface envelopes: ${input.envelopes.length}`,
    result?.ok === true ? `final: ${result.finalOutput}` : `error: ${error?.code ?? "UNKNOWN"} ${error?.message ?? ""}`.trim(),
  ];

  return {
    title: "Raxode Application Surface",
    subtitle: "Frontend shell -> application contract -> agentCore backend",
    mode: input.mode,
    agentId: manifest?.identity.id ?? "unknown",
    model: manifest?.model.model ?? "unknown",
    sessionId,
    runtimeId,
    status,
    finalOutput: result?.ok === true ? result.finalOutput : undefined,
    error,
    counters: {
      envelopes: input.envelopes.length,
      modelCalls,
      toolCalls,
      mainLoopSteps,
      runtimeEvents,
      catalogTools: input.capability.toolCatalog.total,
      mountedTools: manifest?.harness.tools.length ?? input.capability.toolCatalog.selectedToolIds.length,
    },
    backendCapability: input.capability,
    manifest: manifestView,
    events: input.appEvents,
    lines,
  };
}

export function createAgentCoreRaxodeBackend(options: { now?: () => string } = {}): RaxodeApplicationBackend {
  const now = options.now ?? (() => new Date().toISOString());
  return {
    backendId: "agentCore",
    async describe(): Promise<RaxodeBackendCapabilitySummary> {
      return capabilitySummary({ profile: "coding-full" });
    },
    async run(command: RaxodeApplicationCommand): Promise<RaxodeApplicationBackendResult> {
      const cwd = path.resolve(command.cwd ?? process.cwd());
      const mode = command.mode ?? "dry-run";
      const profile = command.profile ?? "coding-full";
      const agentPath = command.agentPath?.trim() || PROFILE_DEFAULT_AGENT[profile];
      const envelopes: InterfaceEnvelope[] = [];
      const appEvents: RaxodeApplicationEvent[] = [
        event({
          eventId: "raxode.backend.start",
          kind: "lifecycle",
          status: "running",
          message: "agentCore backend run started",
          createdAt: createdAt(now),
          metadata: { agentPath, mode, profile },
        }),
      ];

      let compiled: Awaited<ReturnType<typeof compileRaxodeAgent>>;
      try {
        compiled = await compileRaxodeAgent({ agentPath, cwd, exportName: command.exportName });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const capability = capabilitySummary({ profile });
        appEvents.push(event({
          eventId: "raxode.backend.load.failed",
          kind: "error",
          status: "failed",
          message,
          createdAt: createdAt(now),
        }));
        const view = buildView({
          mode,
          capability,
          envelopes,
          appEvents,
          error: { code: "AGENT_LOAD_FAILED", message },
        });
        return { ok: false, backend: "agentCore", error: { code: "AGENT_LOAD_FAILED", message }, events: appEvents, view };
      }

      if (!compiled.ok) {
        const capability = capabilitySummary({ profile });
        appEvents.push(event({
          eventId: "raxode.backend.compile.failed",
          kind: "error",
          status: "failed",
          message: compiled.error.message,
          createdAt: createdAt(now),
        }));
        const view = buildView({
          mode,
          capability,
          envelopes,
          appEvents,
          error: { code: "AGENT_COMPILE_FAILED", message: compiled.error.message },
        });
        return {
          ok: false,
          backend: "agentCore",
          error: { code: "AGENT_COMPILE_FAILED", message: compiled.error.message },
          events: appEvents,
          view,
        };
      }

      const selectedToolIds = compiled.manifest.harness.tools.map((tool) => tool.toolId);
      const capability = capabilitySummary({ profile, selectedToolIds });
      appEvents.push(event({
        eventId: "raxode.backend.capability.catalog",
        kind: "capability",
        status: "running",
        message: `catalog=${capability.toolCatalog.total} mounted=${selectedToolIds.length}`,
        createdAt: createdAt(now),
        metadata: {
          profile,
          catalogTotal: capability.toolCatalog.total,
          mountedTools: selectedToolIds.length,
          selectedFamilies: capability.toolCatalog.selectedFamilies,
        },
      }));

      const runtimeId = `runtime.raxode.${compiled.manifest.identity.id}`;
      const sessionId = command.sessionId ?? `session.raxode.${compiled.manifest.identity.id}`;
      const startEnvelope = okEnvelope(praxis.interfaceAdapter.eventInterfaceEnvelope({
        eventId: "raxode.application.start",
        runtimeId,
        sessionId,
        surface: "raxode",
        payload: {
          agentId: compiled.manifest.identity.id,
          mode,
          task: command.task ?? "Run this Praxis agent from Raxode.",
        },
        createdAt: createdAt(now),
      }));
      if (startEnvelope) envelopes.push(startEnvelope);

      const runtime = praxis.runtime.createPraxisRuntimeKernel({ runtimeId });
      const runtimeTask = command.task?.trim() || PROFILE_DEFAULT_TASK[profile];
      const runtimeResult = await runtime.runManifest(compiled.manifest, runtimeTask, {
        runtimeId,
        sessionId,
        dryRun: mode !== "live",
        allowProviderCall: mode === "live",
        allowToolExecution: command.allowToolExecution ?? mode === "live",
        exposeProviderTools: command.exposeProviderTools ?? true,
        storage: {
          cwd,
          workspaceRoot: compiled.projectRoot ?? cwd,
          initMode: "on-run",
        },
        sandbox: { cwd },
        now,
      });

      const stateEnvelope = okEnvelope(praxis.interfaceAdapter.stateInterfaceEnvelope({
        stateId: "raxode.application.result",
        runtimeId,
        sessionId,
        surface: "raxode",
        payload: {
          ok: runtimeResult.ok,
          modelCalls: runtimeResult.ok ? runtimeResult.modelCalls.length : 0,
          toolCalls: runtimeResult.ok ? runtimeResult.toolCalls.length : 0,
          mainLoopSteps: runtimeResult.mainLoopSteps?.length ?? 0,
        },
        createdAt: createdAt(now),
      }));
      if (stateEnvelope) envelopes.push(stateEnvelope);
      appEvents.push(event({
        eventId: "raxode.backend.runtime.result",
        kind: runtimeResult.ok ? "state" : "error",
        status: runtimeResult.ok ? "completed" : "failed",
        message: runtimeResult.ok ? "agentCore runtime completed" : runtimeResult.error.message,
        createdAt: createdAt(now),
        metadata: { runtimeId, sessionId, envelopeCount: envelopes.length },
      }));

      const view = buildView({
        mode,
        capability,
        manifest: compiled.manifest,
        runtimeResult,
        envelopes,
        appEvents,
      });
      if (!runtimeResult.ok) {
        return {
          ok: false,
          backend: "agentCore",
          error: { code: "RUNTIME_FAILED", message: runtimeResult.error.message },
          events: appEvents,
          view,
        };
      }

      return {
        ok: true,
        backend: "agentCore",
        events: appEvents,
        view,
      };
    },
  };
}
