/*
 * 文件定位：Runtime MCP Plane / 官方 MCP 与 MCP+ 组件接入面。
 * 核心目的：把标准 MCP server 声明、MCP+ exposure policy、runtime server profile、
 * dynamic harness tools 和 application view 串成一条 OAO 可编译、可检查、可挂载的合同。
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  compileMcpPlusManifest,
  createExpandToolDeclaration,
  lowerExposurePlanToMcpSurface,
  planExposure,
  type ExposureMode,
  type ExposureState,
  type McpCompatibleSurface,
  type McpPlusManifest,
  type NativeToolDeclaration,
} from "@praxis-ai/mcp-plus";

import type { ToolSpec } from "../runtimeAgentManifest.js";
import type { McpRuntimeServerProfile } from "../runtime.execEngine/mcpRuntimeAdapter.js";

export type McpHarnessServerMode = "native" | "mcp-plus";

export type McpTransportSpec =
  | {
      transport: "stdio";
      command: string;
      args?: readonly string[];
      cwd?: string;
      env?: Readonly<Record<string, string | undefined>>;
      timeoutMs?: number;
      framing?: "content-length" | "line-json";
    }
  | {
      transport: "http" | "sse";
      url: string;
      sseUrl?: string;
      headers?: Readonly<Record<string, string>>;
      timeoutMs?: number;
    };

export type McpHarnessServerSpec = McpTransportSpec & {
  serverId: string;
  mode: McpHarnessServerMode;
  title?: string;
  summary?: string;
  manifest?: McpPlusManifest;
  metadata?: Readonly<Record<string, unknown>>;
};

export type McpApplicationServerInput = McpTransportSpec & {
  serverId: string;
  mode?: McpHarnessServerMode;
  title?: string;
  summary?: string;
  manifest?: McpPlusManifest;
  metadata?: Readonly<Record<string, unknown>>;
};

type HttpMcpHelperInput = {
  url: string;
  sseUrl?: string;
  headers?: Readonly<Record<string, string>>;
  timeoutMs?: number;
} & Partial<Pick<McpHarnessServerSpec, "mode" | "title" | "summary" | "manifest" | "metadata">>;

export type McpHarnessModuleSpec = {
  kind: "praxis.mcp.module";
  version: "praxis.mcp.v1";
  servers: readonly McpHarnessServerSpec[];
  recommended: true;
  metadata?: Readonly<Record<string, unknown>>;
};

export type McpApplicationServerView = {
  serverId: string;
  mode: McpHarnessServerMode;
  transport: McpHarnessServerSpec["transport"];
  title?: string;
  summary?: string;
  manifestPresent: boolean;
  status: "declared" | "mounted" | "error";
  toolCount?: number;
  visibleToolCount?: number;
  indexedToolCount?: number;
  publicSafe: true;
};

export type McpApplicationStateView = {
  servers: readonly McpApplicationServerView[];
  recommendedMode: "mcp-plus";
  nativeCompatible: true;
  publicSafe: true;
};

export type McpExposurePlanServer = {
  serverId: string;
  mode: McpHarnessServerMode;
  surface: McpCompatibleSurface;
  dynamicToolSpecs: readonly ToolSpec[];
};

export type McpHarnessExposurePlan = {
  servers: readonly McpExposurePlanServer[];
};

export type McpPlusProfileProposal = {
  serverId: string;
  pinnedTools?: readonly string[];
  warmTools?: readonly string[];
  indexedTools?: readonly string[];
  alwaysIndexTools?: readonly string[];
  toolCards?: Readonly<Record<string, {
    title?: string;
    summary?: string;
    keywords?: readonly string[];
  }>>;
  skillChapters?: readonly {
    id: string;
    title: string;
    summary: string;
  }[];
  rationale?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type McpPlusLearnedProfile = {
  schemaVersion: "mcp-plus.profile.v1";
  serverId: string;
  projectId: string;
  exposure: NonNullable<McpPlusManifest["exposure"]>;
  skills?: NonNullable<McpPlusManifest["skills"]>;
  rationale?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type McpPlusRuntimeOverlay = {
  serverId: string;
  sessionId: string;
  mode: ExposureMode;
  activeTools: readonly string[];
  pendingReprofile?: boolean;
  counters: {
    consecutiveIndexedToolCalls: Readonly<Record<string, number>>;
  };
  updatedAt: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type McpPlusProfileStoreKey = {
  serverId: string;
  projectId: string;
};

export type McpPlusOverlayStoreKey = {
  serverId: string;
  sessionId: string;
};

export type McpPlusProfileStore = {
  load(key: McpPlusProfileStoreKey): Promise<McpPlusLearnedProfile | undefined>;
  save(key: McpPlusProfileStoreKey, profile: McpPlusLearnedProfile): Promise<void>;
};

export type McpPlusOverlayStore = {
  load(key: McpPlusOverlayStoreKey): Promise<McpPlusRuntimeOverlay | undefined>;
  save(key: McpPlusOverlayStoreKey, overlay: McpPlusRuntimeOverlay): Promise<void>;
};

export type McpPlusSkillNote = {
  id: string;
  serverId: string;
  projectId: string;
  chapter: string;
  title: string;
  summary: string;
  whenToUse?: string;
  do?: readonly string[];
  why?: string;
  avoid?: readonly string[];
  pitfalls?: readonly string[];
  createdAt: string;
  updatedAt: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type McpPlusSkillStore = {
  list(key: McpPlusProfileStoreKey): Promise<readonly McpPlusSkillNote[]>;
  read(key: McpPlusProfileStoreKey, query: { id?: string; chapter?: string }): Promise<readonly McpPlusSkillNote[]>;
  write(key: McpPlusProfileStoreKey, note: Omit<McpPlusSkillNote, "id" | "serverId" | "projectId" | "createdAt" | "updatedAt"> & { id?: string }): Promise<McpPlusSkillNote>;
};

export type McpPlusApplicationServerInput = McpTransportSpec & {
  serverId: string;
  manifest: McpPlusManifest;
  title?: string;
  summary?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export function mcpServer(
  serverId: string,
  input: McpTransportSpec & Partial<Pick<McpHarnessServerSpec, "mode" | "title" | "summary" | "manifest" | "metadata">>,
): McpHarnessServerSpec {
  return {
    ...input,
    serverId,
    mode: input.mode ?? (input.manifest === undefined ? "native" : "mcp-plus"),
  };
}

export const mcp = {
  module(input: {
    servers: readonly McpHarnessServerSpec[];
    metadata?: Readonly<Record<string, unknown>>;
  }): McpHarnessModuleSpec {
    return {
      kind: "praxis.mcp.module",
      version: "praxis.mcp.v1",
      servers: input.servers,
      recommended: true,
      metadata: input.metadata,
    };
  },
  stdio(
    serverId: string,
    input: Omit<Extract<McpTransportSpec, { transport: "stdio" }>, "transport"> &
      Partial<Pick<McpHarnessServerSpec, "mode" | "title" | "summary" | "manifest" | "metadata">>,
  ): McpHarnessServerSpec {
    return mcpServer(serverId, { ...input, transport: "stdio" });
  },
  http(
    serverId: string,
    input: HttpMcpHelperInput,
  ): McpHarnessServerSpec {
    return mcpServer(serverId, { ...input, transport: "http" });
  },
  sse(
    serverId: string,
    input: HttpMcpHelperInput,
  ): McpHarnessServerSpec {
    return mcpServer(serverId, { ...input, transport: "sse" });
  },
  recommendedTools(): readonly ToolSpec[] {
    return [
      {
        toolId: "mcp.use",
        metadata: { source: "praxis.mcp.recommendedTools", toolProviderKind: "mcp-static" },
      },
      {
        toolId: "mcp.resources",
        metadata: { source: "praxis.mcp.recommendedTools", toolProviderKind: "mcp-static" },
      },
    ];
  },
} as const;

export function isMcpHarnessModuleSpec(value: unknown): value is McpHarnessModuleSpec {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.kind === "praxis.mcp.module" && Array.isArray(record.servers);
}

export function mcpHarnessModuleFrom(input: {
  modules?: Readonly<Record<string, unknown>>;
}): McpHarnessModuleSpec | undefined {
  const candidate = input.modules?.mcp;
  return isMcpHarnessModuleSpec(candidate) ? candidate : undefined;
}

export function runtimeRequirementsForMcpModule(
  module: McpHarnessModuleSpec | undefined,
): readonly string[] {
  return module === undefined || module.servers.length === 0 ? [] : ["runtime.mcp"];
}

export function toMcpRuntimeServerProfile(server: McpHarnessServerSpec): McpRuntimeServerProfile {
  if (server.transport === "stdio") {
    return {
      serverId: server.serverId,
      transport: "stdio",
      command: server.command,
      args: server.args,
      cwd: server.cwd,
      env: server.env,
      timeoutMs: server.timeoutMs,
      framing: server.framing,
    };
  }
  return {
    serverId: server.serverId,
    transport: server.transport,
    url: server.url,
    sseUrl: server.sseUrl,
    headers: server.headers,
    timeoutMs: server.timeoutMs,
  };
}

export function buildMcpServerProfilesFromManifest(input: {
  harness: {
    modules: Readonly<Record<string, unknown>>;
  };
}): readonly McpRuntimeServerProfile[] {
  const module = mcpHarnessModuleFrom(input.harness);
  return (module?.servers ?? []).map(toMcpRuntimeServerProfile);
}

export function createMcpApplicationStateView(
  module: McpHarnessModuleSpec | undefined,
): McpApplicationStateView {
  return {
    servers: (module?.servers ?? []).map((server) => ({
      serverId: server.serverId,
      mode: server.mode,
      transport: server.transport,
      title: server.title ?? server.manifest?.server.title,
      summary: server.summary ?? server.manifest?.server.summary,
      manifestPresent: server.manifest !== undefined,
      status: "declared",
      publicSafe: true,
    })),
    recommendedMode: "mcp-plus",
    nativeCompatible: true,
    publicSafe: true,
  };
}

function toolIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/gu, ".").replace(/^\.+|\.+$/gu, "") || "tool";
}

function jsonObjectSchema(properties: Readonly<Record<string, unknown>>, required: readonly string[] = []): Record<string, unknown> {
  return {
    type: "object",
    properties,
    required: [...required],
    additionalProperties: false,
  };
}

export function createMcpPlusInitToolDeclaration(): NativeToolDeclaration {
  return {
    name: "mcp_plus.init",
    description: "Submit the first MCP+ profile proposal for this standard MCP server after inspecting its full MCP tools/list surface.",
    inputSchema: profileProposalInputSchema("init"),
  };
}

export function createMcpPlusReprofileToolDeclaration(): NativeToolDeclaration {
  return {
    name: "mcp_plus.reprofile",
    description: "Submit an updated MCP+ profile proposal for this standard MCP server when runtime usage shows the current profile is stale.",
    inputSchema: profileProposalInputSchema("reprofile"),
  };
}

export function createMcpPlusSkillReadToolDeclaration(): NativeToolDeclaration {
  return {
    name: "mcp_plus.skill_read",
    description: "Read server-bound MCP+ skill notes for the current project when a reusable workflow is relevant.",
    inputSchema: jsonObjectSchema({
      serverId: { type: "string" },
      id: { type: "string" },
      chapter: { type: "string" },
    }, ["serverId"]),
  };
}

export function createMcpPlusSkillWriteToolDeclaration(): NativeToolDeclaration {
  return {
    name: "mcp_plus.skill_write",
    description: "Write a concise server-bound MCP+ skill note for the current project after a reusable workflow, pitfall, or difficult MCP usage is discovered.",
    inputSchema: jsonObjectSchema({
      serverId: { type: "string" },
      chapter: { type: "string" },
      title: { type: "string" },
      summary: { type: "string" },
      whenToUse: { type: "string" },
      do: { type: "array", items: { type: "string" } },
      why: { type: "string" },
      avoid: { type: "array", items: { type: "string" } },
      pitfalls: { type: "array", items: { type: "string" } },
    }, ["serverId", "chapter", "title", "summary"]),
  };
}

export function createMcpPlusFinishToolDeclaration(): NativeToolDeclaration {
  return {
    name: "mcp_plus.finish",
    description: "Finish an MCP+ workflow and optionally submit a reusable skill note. Praxis records the note only when the model provides one.",
    inputSchema: jsonObjectSchema({
      serverId: { type: "string" },
      outcome: { type: "string", enum: ["success", "failure", "partial"] },
      skill: createMcpPlusSkillWriteToolDeclaration().inputSchema,
    }, ["serverId", "outcome"]),
  };
}

function profileProposalInputSchema(kind: "init" | "reprofile"): Record<string, unknown> {
  return jsonObjectSchema({
    serverId: { type: "string" },
    pinnedTools: { type: "array", items: { type: "string" } },
    warmTools: { type: "array", items: { type: "string" } },
    indexedTools: { type: "array", items: { type: "string" } },
    alwaysIndexTools: { type: "array", items: { type: "string" } },
    toolCards: {
      type: "object",
      additionalProperties: {
        type: "object",
        properties: {
          title: { type: "string" },
          summary: { type: "string" },
          keywords: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    },
    skillChapters: {
      type: "array",
      items: jsonObjectSchema({
        id: { type: "string" },
        title: { type: "string" },
        summary: { type: "string" },
      }, ["id", "title", "summary"]),
    },
    rationale: { type: "string", description: `${kind} rationale for the host runtime.` },
  }, ["serverId"]);
}

function dynamicToolSpecForNativeTool(
  serverId: string,
  tool: NativeToolDeclaration,
): ToolSpec {
  return {
    toolId: `mcp.${toolIdPart(serverId)}.${toolIdPart(tool.name)}`,
    family: "mcp",
    group: serverId,
    description: tool.description,
    inputSchema: tool.inputSchema,
    metadata: {
      toolProviderKind: "mcp-static",
      serverId,
      nativeToolName: tool.name,
      runtimeToolId: "mcp.use",
      runtimeArguments: { serverId, toolName: tool.name },
      source: "runtime.mcpPlane.dynamicTool",
    },
  };
}

function dynamicToolSpecForMcpPlusControlTool(
  serverId: string,
  tool: NativeToolDeclaration,
): ToolSpec {
  return {
    toolId: `mcp.${toolIdPart(serverId)}.${toolIdPart(tool.name)}`,
    family: "mcp",
    group: serverId,
    description: tool.description,
    inputSchema: tool.inputSchema,
    metadata: {
      toolProviderKind: "mcp-plus-control",
      serverId,
      controlName: tool.name,
      source: "runtime.mcpPlane.mcpPlusControlTool",
    },
  };
}

function isMcpPlusControlToolName(name: string): boolean {
  return name.startsWith("mcp_plus.");
}

function dynamicToolSpecsForSurface(serverId: string, surface: McpCompatibleSurface): readonly ToolSpec[] {
  return surface.tools.map((tool) => isMcpPlusControlToolName(tool.name)
    ? dynamicToolSpecForMcpPlusControlTool(serverId, tool)
    : dynamicToolSpecForNativeTool(serverId, tool));
}

export function createInMemoryMcpPlusProfileStore(initial: readonly McpPlusLearnedProfile[] = []): McpPlusProfileStore {
  const profiles = new Map(initial.map((profile) => [`${profile.projectId}:${profile.serverId}`, profile]));
  return {
    async load(key) {
      return profiles.get(`${key.projectId}:${key.serverId}`);
    },
    async save(key, profile) {
      profiles.set(`${key.projectId}:${key.serverId}`, profile);
    },
  };
}

export function createInMemoryMcpPlusOverlayStore(initial: readonly McpPlusRuntimeOverlay[] = []): McpPlusOverlayStore {
  const overlays = new Map(initial.map((overlay) => [`${overlay.sessionId}:${overlay.serverId}`, overlay]));
  return {
    async load(key) {
      return overlays.get(`${key.sessionId}:${key.serverId}`);
    },
    async save(key, overlay) {
      overlays.set(`${key.sessionId}:${key.serverId}`, overlay);
    },
  };
}

export function createInMemoryMcpPlusSkillStore(initial: readonly McpPlusSkillNote[] = []): McpPlusSkillStore {
  const notes = [...initial];
  return {
    async list(key) {
      return notes.filter((note) => note.projectId === key.projectId && note.serverId === key.serverId);
    },
    async read(key, query) {
      return notes.filter((note) =>
        note.projectId === key.projectId &&
        note.serverId === key.serverId &&
        (query.id === undefined || note.id === query.id) &&
        (query.chapter === undefined || note.chapter === query.chapter)
      );
    },
    async write(key, note) {
      const now = new Date().toISOString();
      const noteId = note.id ?? `${key.serverId}:${note.chapter}:${toolIdPart(note.title).toLowerCase()}`;
      const existingIndex = notes.findIndex((item) => item.projectId === key.projectId && item.serverId === key.serverId && item.id === noteId);
      const written: McpPlusSkillNote = {
        ...note,
        id: noteId,
        serverId: key.serverId,
        projectId: key.projectId,
        createdAt: existingIndex === -1 ? now : notes[existingIndex]?.createdAt ?? now,
        updatedAt: now,
      };
      if (existingIndex === -1) notes.push(written);
      else notes[existingIndex] = written;
      return written;
    },
  };
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function storeFilePart(value: string): string {
  return toolIdPart(value).replace(/\.+/gu, "-").toLowerCase() || "default";
}

export function createFileMcpPlusProfileStore(rootDir: string): McpPlusProfileStore {
  function profilePath(key: McpPlusProfileStoreKey): string {
    return path.join(rootDir, "profiles", storeFilePart(key.projectId), `${storeFilePart(key.serverId)}.json`);
  }
  return {
    async load(key) {
      return await readJsonFile<McpPlusLearnedProfile | undefined>(profilePath(key), undefined);
    },
    async save(key, profile) {
      await writeJsonFile(profilePath(key), profile);
    },
  };
}

export function createFileMcpPlusSkillStore(rootDir: string): McpPlusSkillStore {
  function skillPath(key: McpPlusProfileStoreKey): string {
    return path.join(rootDir, "skills", storeFilePart(key.projectId), `${storeFilePart(key.serverId)}.json`);
  }
  return {
    async list(key) {
      return await readJsonFile<McpPlusSkillNote[]>(skillPath(key), []);
    },
    async read(key, query) {
      const notes = await readJsonFile<McpPlusSkillNote[]>(skillPath(key), []);
      return notes.filter((note) =>
        (query.id === undefined || note.id === query.id) &&
        (query.chapter === undefined || note.chapter === query.chapter)
      );
    },
    async write(key, note) {
      const notes = await readJsonFile<McpPlusSkillNote[]>(skillPath(key), []);
      const now = new Date().toISOString();
      const noteId = note.id ?? `${key.serverId}:${note.chapter}:${toolIdPart(note.title).toLowerCase()}`;
      const existingIndex = notes.findIndex((item) => item.id === noteId);
      const written: McpPlusSkillNote = {
        ...note,
        id: noteId,
        serverId: key.serverId,
        projectId: key.projectId,
        createdAt: existingIndex === -1 ? now : notes[existingIndex]?.createdAt ?? now,
        updatedAt: now,
      };
      if (existingIndex === -1) notes.push(written);
      else notes[existingIndex] = written;
      await writeJsonFile(skillPath(key), notes);
      return written;
    },
  };
}

function uniqueStrings(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).filter((value) => typeof value === "string" && value.trim().length > 0).map((value) => value.trim()))];
}

function defaultToolCard(tool: NativeToolDeclaration): { title: string; summary: string; keywords: string[] } {
  return {
    title: tool.name,
    summary: tool.description || tool.name,
    keywords: tool.name.split(/[^a-zA-Z0-9]+/u).filter(Boolean),
  };
}

function learnedManifestFromProfile(profile: McpPlusLearnedProfile, server: McpHarnessServerSpec): McpPlusManifest {
  return {
    server: {
      id: server.serverId,
      title: server.title ?? server.serverId,
      summary: server.summary ?? server.manifest?.server.summary ?? "Learned MCP+ profile.",
    },
    exposure: profile.exposure,
    skills: profile.skills,
  };
}

function fallbackMcpPlusManifest(server: McpHarnessServerSpec, nativeTools: readonly NativeToolDeclaration[]): McpPlusManifest {
  const smallServer = nativeTools.length <= 8;
  return {
    server: {
      id: server.serverId,
      title: server.title ?? server.serverId,
      summary: server.summary ?? "Standard MCP server with Praxis MCP+ native exposure.",
    },
    exposure: smallServer
      ? { pinnedTools: nativeTools.map((tool) => tool.name), indexedTools: [] }
      : {
        pinnedTools: nativeTools.slice(0, 3).map((tool) => tool.name),
        indexedTools: nativeTools.slice(3).map((tool) => tool.name),
        toolCards: Object.fromEntries(nativeTools.slice(3).map((tool) => [tool.name, defaultToolCard(tool)])),
      },
  };
}

function bootstrapSurface(server: McpHarnessServerSpec, nativeTools: readonly NativeToolDeclaration[]): McpCompatibleSurface {
  return {
    tools: [
      ...nativeTools,
      createMcpPlusInitToolDeclaration(),
      createMcpPlusSkillReadToolDeclaration(),
      createMcpPlusSkillWriteToolDeclaration(),
      createMcpPlusFinishToolDeclaration(),
    ],
    sidecar: {
      serverCard: {
        id: server.serverId,
        title: server.title ?? server.serverId,
        summary: server.summary ?? "Standard MCP server awaiting MCP+ profile initialization.",
        mode: "expanded",
      },
      toolIndex: [],
      skillIndex: [],
    },
  };
}

export function learnedProfileFromProposal(input: {
  proposal: McpPlusProfileProposal;
  nativeTools: readonly NativeToolDeclaration[];
  projectId: string;
  now: string;
  existing?: McpPlusLearnedProfile;
}): { ok: true; profile: McpPlusLearnedProfile } | { ok: false; error: { code: string; message: string; publicSafe: true } } {
  if (Object.hasOwn(input.proposal as Record<string, unknown>, "modeHint")) {
    return {
      ok: false,
      error: {
        code: "MCP_PLUS_PROFILE_MODE_HINT_UNSUPPORTED",
        message: "MCP+ profile proposals do not accept modeHint in v1; runtime overlays own exposure mode.",
        publicSafe: true,
      },
    };
  }
  const nativeToolNames = new Set(input.nativeTools.map((tool) => tool.name));
  const referenced = [
    ...uniqueStrings(input.proposal.pinnedTools),
    ...uniqueStrings(input.proposal.warmTools),
    ...uniqueStrings(input.proposal.indexedTools),
    ...uniqueStrings(input.proposal.alwaysIndexTools),
    ...Object.keys(input.proposal.toolCards ?? {}),
  ];
  const unknown = referenced.filter((toolName) => !nativeToolNames.has(toolName));
  if (unknown.length > 0) {
    return {
      ok: false,
      error: {
        code: "MCP_PLUS_PROFILE_UNKNOWN_TOOL",
        message: `MCP+ profile proposal references unknown tool(s): ${unknown.join(", ")}`,
        publicSafe: true,
      },
    };
  }
  const alwaysIndex = new Set(uniqueStrings(input.proposal.alwaysIndexTools));
  const pinnedAlwaysIndex = uniqueStrings(input.proposal.pinnedTools).filter((toolName) => alwaysIndex.has(toolName));
  if (pinnedAlwaysIndex.length > 0) {
    return {
      ok: false,
      error: {
        code: "MCP_PLUS_PROFILE_ALWAYS_INDEX_PINNED",
        message: `alwaysIndexTools cannot be pinned: ${pinnedAlwaysIndex.join(", ")}`,
        publicSafe: true,
      },
    };
  }
  const profile: McpPlusLearnedProfile = {
    schemaVersion: "mcp-plus.profile.v1",
    serverId: input.proposal.serverId,
    projectId: input.projectId,
    exposure: {
      pinnedTools: uniqueStrings(input.proposal.pinnedTools),
      warmTools: uniqueStrings(input.proposal.warmTools),
      indexedTools: uniqueStrings(input.proposal.indexedTools),
      alwaysIndexTools: uniqueStrings(input.proposal.alwaysIndexTools),
      toolCards: input.proposal.toolCards === undefined ? undefined : Object.fromEntries(
        Object.entries(input.proposal.toolCards).map(([toolName, card]) => [toolName, {
          title: card.title,
          summary: card.summary,
          keywords: card.keywords === undefined ? undefined : [...card.keywords],
        }]),
      ),
    },
    skills: input.proposal.skillChapters === undefined ? input.existing?.skills : {
      ...(input.existing?.skills ?? {}),
      chapters: input.proposal.skillChapters.map((chapter) => ({ ...chapter })),
    },
    rationale: input.proposal.rationale,
    createdAt: input.existing?.createdAt ?? input.now,
    updatedAt: input.now,
    metadata: input.proposal.metadata,
  };
  return { ok: true, profile };
}

export function planMcpHarnessExposure(
  manifest: {
    harness: {
      modules: Readonly<Record<string, unknown>>;
    };
  },
  nativeToolInventoryByServerId: Readonly<Record<string, readonly NativeToolDeclaration[]>>,
  stateByServerId: Readonly<Record<string, Partial<ExposureState>>> = {},
  profileByServerId: Readonly<Record<string, McpPlusLearnedProfile | undefined>> = {},
): McpHarnessExposurePlan {
  const module = mcpHarnessModuleFrom(manifest.harness);
  const servers = (module?.servers ?? []).map((server): McpExposurePlanServer => {
    const nativeTools = [...(nativeToolInventoryByServerId[server.serverId] ?? [])];
    if (server.mode !== "mcp-plus") {
      const surface: McpCompatibleSurface = {
        tools: nativeTools,
        sidecar: {
          serverCard: {
            id: server.serverId,
            title: server.title ?? server.serverId,
            summary: server.summary ?? "Native MCP server.",
            mode: "expanded" satisfies ExposureMode,
          },
          toolIndex: [],
          skillIndex: [],
        },
      };
      return {
        serverId: server.serverId,
        mode: "native",
        surface,
        dynamicToolSpecs: nativeTools.map((tool) => dynamicToolSpecForNativeTool(server.serverId, tool)),
      };
    }
    const learnedProfile = profileByServerId[server.serverId];
    if (server.manifest === undefined && learnedProfile === undefined) {
      const surface = bootstrapSurface(server, nativeTools);
      return {
        serverId: server.serverId,
        mode: "mcp-plus",
        surface,
        dynamicToolSpecs: dynamicToolSpecsForSurface(server.serverId, surface),
      };
    }
    const effectiveManifest = server.manifest ?? (learnedProfile === undefined
      ? fallbackMcpPlusManifest(server, nativeTools)
      : learnedManifestFromProfile(learnedProfile, server));
    const graph = compileMcpPlusManifest(effectiveManifest, nativeTools);
    const state: ExposureState = {
      serverId: server.serverId,
      mode: stateByServerId[server.serverId]?.mode ?? "expanded",
      activeTools: stateByServerId[server.serverId]?.activeTools ?? [],
    };
    const plan = planExposure(graph, state);
    const surface = lowerExposurePlanToMcpSurface(plan);
    const withNativeControls: McpCompatibleSurface = {
      tools: [
        ...surface.tools.filter((tool) => tool.name !== "mcp_plus.expand"),
        createExpandToolDeclaration(),
        ...(stateByServerId[server.serverId]?.mode === "frozen" ? [] : [
          createMcpPlusSkillReadToolDeclaration(),
          createMcpPlusSkillWriteToolDeclaration(),
          createMcpPlusFinishToolDeclaration(),
        ]),
        ...(stateByServerId[server.serverId]?.activeTools?.includes("mcp_plus.reprofile") ? [createMcpPlusReprofileToolDeclaration()] : []),
      ],
      sidecar: surface.sidecar,
    };
    return {
      serverId: server.serverId,
      mode: "mcp-plus",
      surface: withNativeControls,
      dynamicToolSpecs: dynamicToolSpecsForSurface(server.serverId, withNativeControls),
    };
  });
  return { servers };
}
