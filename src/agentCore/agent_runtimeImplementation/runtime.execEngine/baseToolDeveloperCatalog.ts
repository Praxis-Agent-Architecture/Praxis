/*
 * 文件定位：Agent 运行态实现层 / 执行引擎运行态绑定面 / BaseTool 开发者目录。
 * 核心目的：把 storage-owned 175 个 BaseTool 暴露成可校验的 authoring helper，避免开发者手写散乱 toolId。
 * 边界：这里只生成 ToolSpec，不执行工具、不定义工具语义、不替代 BaseTool registry。
 */

import type { BaseToolFamily, BaseToolRiskLevel } from "../../agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { createBaseToolRegistry } from "../../agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import { tool, tools, type ToolSpec } from "../runtimeAgentManifest.js";
import {
  createBaseToolRealityLedger,
  type BaseToolRealityCapabilityClass,
  type BaseToolRealityLedgerEntry,
  type BaseToolRealityProjection,
} from "./baseToolRealityLedger.js";

export type BaseToolDeveloperCatalogEntry = {
  toolId: string;
  family: BaseToolFamily;
  storageFamily: string;
  group: string;
  title: string;
  riskLevel: BaseToolRiskLevel;
  capabilityClass: BaseToolRealityCapabilityClass;
  projection: BaseToolRealityProjection;
  modelRequired: boolean;
  description?: string;
};

export type BaseToolDeveloperLookupResult =
  | {
      ok: true;
      tool: ToolSpec;
      entry: BaseToolDeveloperCatalogEntry;
    }
  | {
      ok: false;
      error: {
        code: "BASE_TOOL_NOT_FOUND";
        message: string;
        publicSafe: true;
      };
    };

export type BaseToolSpecInput = Omit<ToolSpec, "toolId" | "family" | "group"> & {
  metadata?: Readonly<Record<string, unknown>>;
};

export type CodingToolSetOptions = {
  includeGit?: boolean;
  includeSearch?: boolean;
  includeShell?: boolean;
};

let cachedRegistry: ReturnType<typeof createBaseToolRegistry> | undefined;

function baseToolRegistry(): ReturnType<typeof createBaseToolRegistry> {
  cachedRegistry ??= createBaseToolRegistry();
  return cachedRegistry;
}

function registryInputSchema(toolId: string): Readonly<Record<string, unknown>> | undefined {
  const lookup = baseToolRegistry().lookup(toolId);
  if (!lookup.ok) return undefined;
  const schema = lookup.definition.inputSchema;
  if (schema.kind !== "json-schema" || typeof schema.schema !== "object" || schema.schema === null || Array.isArray(schema.schema)) {
    return undefined;
  }
  return schema.schema as Readonly<Record<string, unknown>>;
}

const ledgerByToolId = (): ReadonlyMap<string, BaseToolRealityLedgerEntry> => {
  return new Map(createBaseToolRealityLedger().map((entry) => [entry.toolId, entry]));
};

function developerEntry(entry: BaseToolRealityLedgerEntry): BaseToolDeveloperCatalogEntry {
  return {
    toolId: entry.toolId,
    family: entry.family,
    storageFamily: entry.storageFamily,
    group: entry.group,
    title: entry.title,
    riskLevel: entry.riskLevel,
    capabilityClass: entry.capabilityClass,
    projection: entry.projection,
    modelRequired: entry.modelRequired,
  };
}

function toToolSpec(entry: BaseToolRealityLedgerEntry, input: BaseToolSpecInput = {}): ToolSpec {
  return tool(entry.toolId, {
    ...input,
    family: entry.storageFamily,
    group: entry.group,
    description: input.description ?? entry.title,
    inputSchema: input.inputSchema ?? registryInputSchema(entry.toolId),
    metadata: {
      authoringSurface: "runtime.execEngine.baseToolDeveloperCatalog",
      baseToolFamily: entry.family,
      capabilityClass: entry.capabilityClass,
      projection: entry.projection,
      modelRequired: entry.modelRequired,
      riskLevel: entry.riskLevel,
      ...(input.metadata ?? {}),
    },
  });
}

function knownTool(toolId: string, input: BaseToolSpecInput = {}): ToolSpec {
  const entry = ledgerByToolId().get(toolId);
  if (entry === undefined) {
    return tool(toolId, {
      ...input,
      metadata: {
        authoringSurface: "runtime.execEngine.baseToolDeveloperCatalog",
        catalogError: "BASE_TOOL_NOT_FOUND",
        ...(input.metadata ?? {}),
      },
    });
  }
  return toToolSpec(entry, input);
}

export function listBaseToolDeveloperCatalog(): readonly BaseToolDeveloperCatalogEntry[] {
  return createBaseToolRealityLedger()
    .map(developerEntry)
    .sort((left, right) => left.toolId.localeCompare(right.toolId));
}

export function tryBaseToolById(toolId: string, input: BaseToolSpecInput = {}): BaseToolDeveloperLookupResult {
  const normalizedToolId = toolId.trim();
  const entry = ledgerByToolId().get(normalizedToolId);
  if (entry === undefined) {
    return {
      ok: false,
      error: {
        code: "BASE_TOOL_NOT_FOUND",
        message: `BaseTool ${normalizedToolId} is not present in the runtime developer catalog`,
        publicSafe: true,
      },
    };
  }
  return {
    ok: true,
    tool: toToolSpec(entry, input),
    entry: developerEntry(entry),
  };
}

export const baseTools = {
  all(): readonly BaseToolDeveloperCatalogEntry[] {
    return listBaseToolDeveloperCatalog();
  },
  family(storageFamily: string): readonly BaseToolDeveloperCatalogEntry[] {
    return listBaseToolDeveloperCatalog().filter((entry) => entry.storageFamily === storageFamily || entry.family === storageFamily);
  },
  byId: tryBaseToolById,
  code: {
    read: (input?: BaseToolSpecInput) => knownTool("code.read", input),
    scan: (input?: BaseToolSpecInput) => knownTool("code.scan", input),
    searchRipgrep: (input?: BaseToolSpecInput) => knownTool("code.search_Ripgrep", input),
    replaceFile: (input?: BaseToolSpecInput) => knownTool("code.replaceFile", input),
    modify: (input?: BaseToolSpecInput) => knownTool("code.modify", input),
    overwrite: (input?: BaseToolSpecInput) => knownTool("code.overwrite", input),
    delete: (input?: BaseToolSpecInput) => knownTool("code.delete", input),
    format: (input?: BaseToolSpecInput) => knownTool("code.format", input),
    testCode: (input?: BaseToolSpecInput) => knownTool("code.testCode", input),
    benchmark: (input?: BaseToolSpecInput) => knownTool("code.benchmark", input),
    debugRun: (input?: BaseToolSpecInput) => knownTool("code.debugRun", input),
    debugCaptureState: (input?: BaseToolSpecInput) => knownTool("code.debugCaptureState", input),
    debugCollectLogs: (input?: BaseToolSpecInput) => knownTool("code.debugCollectLogs", input),
    lsp: {
      locateDefinition: (input?: BaseToolSpecInput) => knownTool("code.lsp_locateDefinition", input),
      traceReferences: (input?: BaseToolSpecInput) => knownTool("code.lsp_traceReferences", input),
      inspectDiagnostics: (input?: BaseToolSpecInput) => knownTool("code.lsp_inspectDiagnostics", input),
      renameSymbol: (input?: BaseToolSpecInput) => knownTool("code.lsp_renameSymbol", input),
      completeCode: (input?: BaseToolSpecInput) => knownTool("code.lsp_completeCode", input),
    },
  },
  git: {
    getRepositoryStatus: (input?: BaseToolSpecInput) => knownTool("git.getRepositoryStatus", input),
    getWorkingTreeDiff: (input?: BaseToolSpecInput) => knownTool("git.getWorkingTreeDiff", input),
    getCommitHistory: (input?: BaseToolSpecInput) => knownTool("git.getCommitHistory", input),
    showGitObjectDetails: (input?: BaseToolSpecInput) => knownTool("git.showGitObjectDetails", input),
    traceLineOwnership: (input?: BaseToolSpecInput) => knownTool("git.traceLineOwnership", input),
    addToStaging: (input?: BaseToolSpecInput) => knownTool("git.addToStaging", input),
    resetStagingOrCommit: (input?: BaseToolSpecInput) => knownTool("git.resetStagingOrCommit", input),
    restoreWorkingTree: (input?: BaseToolSpecInput) => knownTool("git.restoreWorkingTree", input),
    stashChanges: (input?: BaseToolSpecInput) => knownTool("git.stashChanges", input),
    fetchRemoteUpdates: (input?: BaseToolSpecInput) => knownTool("git.fetchRemoteUpdates", input),
    pullRemoteChanges: (input?: BaseToolSpecInput) => knownTool("git.pullRemoteChanges", input),
    pushLocalChanges: (input?: BaseToolSpecInput) => knownTool("git.pushLocalChanges", input),
  },
  shell: {
    commandExecution: (input?: BaseToolSpecInput) => knownTool("shell.commandExecution", input),
    invocationExecution: (input?: BaseToolSpecInput) => knownTool("shell.invocationExecution", input),
    scriptExecution: (input?: BaseToolSpecInput) => knownTool("shell.scriptExecution", input),
    backgroundExecution: (input?: BaseToolSpecInput) => knownTool("shell.backgroundExecution", input),
    foregroundExecution: (input?: BaseToolSpecInput) => knownTool("shell.foregroundExecution", input),
    processSpawning: (input?: BaseToolSpecInput) => knownTool("shell.processSpawning", input),
    processTermination: (input?: BaseToolSpecInput) => knownTool("shell.processTermination", input),
    outputCapture: (input?: BaseToolSpecInput) => knownTool("shell.outputCapture", input),
    commandValidation: (input?: BaseToolSpecInput) => knownTool("shell.commandValidation", input),
    permissionControl: (input?: BaseToolSpecInput) => knownTool("shell.permissionControl", input),
    sandboxEnforcement: (input?: BaseToolSpecInput) => knownTool("shell.sandboxEnforcement", input),
  },
  search: {
    fetch: (input?: BaseToolSpecInput) => knownTool("search.fetch", input),
    searchEngine: (input?: BaseToolSpecInput) => knownTool("search.searchEngine", input),
    nativeSearch: (input?: BaseToolSpecInput) => knownTool("search.nativeSearch", input),
    ground: (input?: BaseToolSpecInput) => knownTool("search.ground", input),
  },
  skill: {
    generate: (input?: BaseToolSpecInput) => knownTool("skill.generate", input),
    iterate: (input?: BaseToolSpecInput) => knownTool("skill.iterate", input),
    management: (input?: BaseToolSpecInput) => knownTool("skill.management", input),
    remove: (input?: BaseToolSpecInput) => knownTool("skill.remove", input),
    ripgrep: (input?: BaseToolSpecInput) => knownTool("skill.ripgrep", input),
    summarize: (input?: BaseToolSpecInput) => knownTool("skill.summarize", input),
  },
  mcp: {
    connect: (input?: BaseToolSpecInput) => knownTool("mcp.connect", input),
    ping: (input?: BaseToolSpecInput) => knownTool("mcp.ping", input),
    listTools: (input?: BaseToolSpecInput) => knownTool("mcp.listTools", input),
    call: (input?: BaseToolSpecInput) => knownTool("mcp.call", input),
    stream: (input?: BaseToolSpecInput) => knownTool("mcp.stream", input),
    listResources: (input?: BaseToolSpecInput) => knownTool("mcp.listResources", input),
    readResource: (input?: BaseToolSpecInput) => knownTool("mcp.readResource", input),
  },
  omni: {
    viewImage: (input?: BaseToolSpecInput) => knownTool("omni.viewImage", input),
    generateImage: (input?: BaseToolSpecInput) => knownTool("omni.generateImage", input),
    imageFormatConversion: (input?: BaseToolSpecInput) => knownTool("omni.imageFormatConversion", input),
    listenAudio: (input?: BaseToolSpecInput) => knownTool("omni.listenAudio", input),
    generateAudio: (input?: BaseToolSpecInput) => knownTool("omni.generateAudio", input),
    viewVideo: (input?: BaseToolSpecInput) => knownTool("omni.viewVideo", input),
    generateVideo: (input?: BaseToolSpecInput) => knownTool("omni.generateVideo", input),
  },
  computeruse: {
    fullscreenScreenshot: (input?: BaseToolSpecInput) => knownTool("computeruse.fullscreenScreenshot", input),
    windowScreenshot: (input?: BaseToolSpecInput) => knownTool("computeruse.windowScreenshot", input),
    mouseClick: (input?: BaseToolSpecInput) => knownTool("computeruse.mouseClick", input),
    mouseMove: (input?: BaseToolSpecInput) => knownTool("computeruse.mouseMove", input),
    keyboardInputEmulation: (input?: BaseToolSpecInput) => knownTool("computeruse.keyboardInputEmulation", input),
    cameraCapturePhoto: (input?: BaseToolSpecInput) => knownTool("computeruse.cameraCapturePhoto", input),
    microphoneStartRecording: (input?: BaseToolSpecInput) => knownTool("computeruse.microphoneStartRecording", input),
  },
} as const;

export const toolSets = {
  coding: {
    readonly(input: CodingToolSetOptions = {}): readonly ToolSpec[] {
      return tools([
        baseTools.code.read(),
        baseTools.code.scan(),
        baseTools.code.searchRipgrep(),
        ...(input.includeGit === true ? toolSets.git.inspection() : []),
        ...(input.includeSearch === true ? [baseTools.search.nativeSearch(), baseTools.search.fetch()] : []),
      ]);
    },
    full(input: CodingToolSetOptions = {}): readonly ToolSpec[] {
      return tools([
        ...toolSets.coding.readonly({ ...input, includeGit: input.includeGit ?? true }),
        baseTools.code.replaceFile(),
        baseTools.code.modify(),
        baseTools.code.overwrite(),
        baseTools.code.delete(),
        baseTools.code.format(),
        baseTools.code.testCode(),
        baseTools.code.benchmark(),
        baseTools.git.addToStaging(),
        baseTools.git.restoreWorkingTree(),
        ...(input.includeShell === true ? toolSets.shell.safe() : []),
      ]);
    },
  },
  git: {
    inspection(): readonly ToolSpec[] {
      return tools([
        baseTools.git.getRepositoryStatus(),
        baseTools.git.getWorkingTreeDiff(),
        baseTools.git.getCommitHistory(),
        baseTools.git.showGitObjectDetails(),
        baseTools.git.traceLineOwnership(),
      ]);
    },
  },
  shell: {
    safe(): readonly ToolSpec[] {
      return tools([
        baseTools.shell.commandValidation(),
        baseTools.shell.permissionControl(),
        baseTools.shell.sandboxEnforcement(),
        baseTools.shell.outputCapture(),
        baseTools.shell.commandExecution(),
      ]);
    },
  },
  research: {
    web(): readonly ToolSpec[] {
      return tools([
        baseTools.search.searchEngine(),
        baseTools.search.fetch(),
        baseTools.search.ground(),
      ]);
    },
  },
  skill: {
    context(): readonly ToolSpec[] {
      return tools([
        baseTools.skill.management(),
        baseTools.skill.summarize(),
      ]);
    },
    search(): readonly ToolSpec[] {
      return tools([
        ...toolSets.skill.context(),
        baseTools.skill.ripgrep(),
      ]);
    },
    authoring(): readonly ToolSpec[] {
      return tools([
        baseTools.skill.generate(),
        baseTools.skill.iterate(),
        baseTools.skill.remove(),
      ]);
    },
    full(): readonly ToolSpec[] {
      return tools([
        ...toolSets.skill.search(),
        ...toolSets.skill.authoring(),
      ]);
    },
  },
} as const;

export const baseToolDeveloperCatalogDescriptor = {
  surface: "runtime.execEngine.baseToolDeveloperCatalog",
  validatesAgainst: "runtime.execEngine.baseToolRealityLedger",
  publicHelpers: ["baseTools", "toolSets", "tryBaseToolById", "listBaseToolDeveloperCatalog"],
  toolSpecFamilyUsesStorageFamily: true,
  skillBaseIsContextMaterialNotModelProvider: true,
  doesNotExecuteTools: true,
} as const;
