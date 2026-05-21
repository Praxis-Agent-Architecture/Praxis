import { tool, tools, type ToolSpec } from "../runtimeImplementation/runtimeAgentManifest.js";
import { getSemanticBaseToolDefinition, listSemanticBaseToolDefinitions } from "./catalog.js";
import { getBaseToolProfile } from "./profiles.js";
import type { BaseToolDefinition, BaseToolProfileName, BaseToolSpecInput } from "./types.js";

export type BaseToolDeveloperCatalogEntry = BaseToolDefinition;
export type BaseToolDeveloperLookupResult = ReturnType<typeof tryBaseToolById>;
export type CodingToolSetOptions = {
  includeSearch?: boolean;
  includeShell?: boolean;
};

function inputSchema(definition: BaseToolDefinition): Readonly<Record<string, unknown>> | undefined {
  return definition.inputSchema.kind === "json-schema" ? definition.inputSchema.schema : undefined;
}

export function baseToolToToolSpec(definition: BaseToolDefinition, input: BaseToolSpecInput = {}): ToolSpec {
  return tool(definition.toolId, {
    ...input,
    family: definition.storageFamily,
    group: definition.group,
    description: input.description ?? definition.description,
    inputSchema: input.inputSchema ?? inputSchema(definition),
    metadata: {
      authoringSurface: "basetool.authoring",
      basetoolLayer: definition.layer,
      visibility: definition.visibility,
      riskLevel: definition.riskLevel,
      policyRisk: definition.policyRisk,
      runtimePorts: definition.runtimePorts,
      ...(input.metadata ?? {}),
    },
  });
}

function knownTool(toolId: string, input?: BaseToolSpecInput): ToolSpec {
  const definition = getSemanticBaseToolDefinition(toolId);
  if (definition === undefined) {
    return tool(toolId, {
      ...input,
      metadata: {
        authoringSurface: "basetool.authoring",
        catalogError: "BASE_TOOL_NOT_FOUND",
        ...(input?.metadata ?? {}),
      },
    });
  }
  return baseToolToToolSpec(definition, input);
}

export function listBaseToolDeveloperCatalog(): readonly BaseToolDefinition[] {
  return listSemanticBaseToolDefinitions();
}

export function tryBaseToolById(toolId: string, input: BaseToolSpecInput = {}) {
  const definition = getSemanticBaseToolDefinition(toolId.trim());
  if (definition === undefined) {
    return {
      ok: false as const,
      error: {
        code: "BASE_TOOL_NOT_FOUND" as const,
        message: `basetool ${toolId.trim()} is not present in the semantic catalog`,
        publicSafe: true as const,
      },
    };
  }
  return {
    ok: true as const,
    tool: baseToolToToolSpec(definition, input),
    entry: definition,
  };
}

export function baseToolProfile(name: BaseToolProfileName): readonly ToolSpec[] {
  const profile = getBaseToolProfile(name);
  return tools(profile.visibleToolIds.map((toolId) => knownTool(toolId)));
}

export const basetool = {
  all: listBaseToolDeveloperCatalog,
  byId: tryBaseToolById,
  profile: baseToolProfile,
  core: {
    shellRun: (input?: BaseToolSpecInput) => knownTool("shell.run", input),
    fileRead: (input?: BaseToolSpecInput) => knownTool("file.read", input),
    fileSearch: (input?: BaseToolSpecInput) => knownTool("file.search", input),
    patchApply: (input?: BaseToolSpecInput) => knownTool("patch.apply", input),
    webSearch: (input?: BaseToolSpecInput) => knownTool("web.search", input),
    webFetch: (input?: BaseToolSpecInput) => knownTool("web.fetch", input),
    planUpdate: (input?: BaseToolSpecInput) => knownTool("plan.update", input),
    userAsk: (input?: BaseToolSpecInput) => knownTool("user.ask", input),
  },
  extension: {
    skillLoad: (input?: BaseToolSpecInput) => knownTool("skill.load", input),
    contextLoad: (input?: BaseToolSpecInput) => knownTool("context.load", input),
    mcpUse: (input?: BaseToolSpecInput) => knownTool("mcp.use", input),
    mcpResources: (input?: BaseToolSpecInput) => knownTool("mcp.resources", input),
  },
  runtime: {
    processWait: (input?: BaseToolSpecInput) => knownTool("process.wait", input),
    processKill: (input?: BaseToolSpecInput) => knownTool("process.kill", input),
    toolDiscover: (input?: BaseToolSpecInput) => knownTool("tool.discover", input),
    toolDescribe: (input?: BaseToolSpecInput) => knownTool("tool.describe", input),
  },
} as const;

export const baseTools = {
  all(_input?: unknown): readonly BaseToolDefinition[] {
    return listBaseToolDeveloperCatalog();
  },
  family(storageFamily: string): readonly BaseToolDefinition[] {
    return listBaseToolDeveloperCatalog().filter((entry) => entry.storageFamily === storageFamily || entry.family === storageFamily);
  },
  byId: tryBaseToolById,
  profile: baseToolProfile,
  semantic: basetool,
  code: {
    read: (input?: BaseToolSpecInput) => knownTool("file.read", input),
    scan: (input?: BaseToolSpecInput) => knownTool("file.search", input),
    searchRipgrep: (input?: BaseToolSpecInput) => knownTool("file.search", input),
    replaceFile: (input?: BaseToolSpecInput) => knownTool("patch.apply", input),
    modify: (input?: BaseToolSpecInput) => knownTool("patch.apply", input),
    delete: (input?: BaseToolSpecInput) => knownTool("shell.run", input),
    format: (input?: BaseToolSpecInput) => knownTool("shell.run", input),
    testCode: (input?: BaseToolSpecInput) => knownTool("shell.run", input),
    benchmark: (input?: BaseToolSpecInput) => knownTool("shell.run", input),
    debugRun: (input?: BaseToolSpecInput) => knownTool("shell.run", input),
    debugCaptureState: (input?: BaseToolSpecInput) => knownTool("shell.run", input),
    debugCollectLogs: (input?: BaseToolSpecInput) => knownTool("shell.run", input),
  },
  shell: {
    commandExecution: (input?: BaseToolSpecInput) => knownTool("shell.run", input),
    invocationExecution: (input?: BaseToolSpecInput) => knownTool("shell.run", input),
    scriptExecution: (input?: BaseToolSpecInput) => knownTool("shell.run", input),
    backgroundExecution: (input?: BaseToolSpecInput) => knownTool("shell.run", input),
    foregroundExecution: (input?: BaseToolSpecInput) => knownTool("shell.run", input),
    processSpawning: (input?: BaseToolSpecInput) => knownTool("shell.run", input),
    processTermination: (input?: BaseToolSpecInput) => knownTool("process.kill", input),
  },
  search: {
    fetch: (input?: BaseToolSpecInput) => knownTool("web.fetch", input),
    searchEngine: (input?: BaseToolSpecInput) => knownTool("web.search", input),
    nativeSearch: (input?: BaseToolSpecInput) => knownTool("web.search", input),
    ground: (input?: BaseToolSpecInput) => knownTool("web.search", input),
  },
  skill: {
    generate: (input?: BaseToolSpecInput) => knownTool("skill.load", input),
    iterate: (input?: BaseToolSpecInput) => knownTool("skill.load", input),
    management: (input?: BaseToolSpecInput) => knownTool("skill.load", input),
    remove: (input?: BaseToolSpecInput) => knownTool("skill.load", input),
    ripgrep: (input?: BaseToolSpecInput) => knownTool("skill.load", input),
    summarize: (input?: BaseToolSpecInput) => knownTool("skill.load", input),
  },
  mcp: {
    listTools: (input?: BaseToolSpecInput) => knownTool("mcp.use", input),
    call: (input?: BaseToolSpecInput) => knownTool("mcp.use", input),
    listResources: (input?: BaseToolSpecInput) => knownTool("mcp.resources", input),
    readResource: (input?: BaseToolSpecInput) => knownTool("mcp.resources", input),
  },
  tool: {
    discover: (input?: BaseToolSpecInput) => knownTool("tool.discover", input),
    describe: (input?: BaseToolSpecInput) => knownTool("tool.describe", input),
  },
} as const;

export const toolSets = {
  coding: {
    readonly(input: CodingToolSetOptions = {}): readonly ToolSpec[] {
      return tools([
        knownTool("file.read"),
        knownTool("file.search"),
        ...(input.includeSearch === true ? [knownTool("web.search"), knownTool("web.fetch")] : []),
      ]);
    },
    full(input: CodingToolSetOptions = {}): readonly ToolSpec[] {
      return tools([
        ...baseToolProfile("minimalCoding"),
        ...(input.includeSearch === true ? [knownTool("web.search"), knownTool("web.fetch")] : []),
      ]);
    },
  },
  shell: {
    safe(): readonly ToolSpec[] {
      return tools([knownTool("shell.run")]);
    },
  },
  research: {
    web(): readonly ToolSpec[] {
      return tools([knownTool("web.search"), knownTool("web.fetch")]);
    },
  },
  skill: {
    context(): readonly ToolSpec[] {
      return tools([knownTool("skill.load")]);
    },
    search(): readonly ToolSpec[] {
      return tools([knownTool("skill.load"), knownTool("file.search")]);
    },
    authoring(): readonly ToolSpec[] {
      return tools([knownTool("skill.load")]);
    },
    full(): readonly ToolSpec[] {
      return tools([knownTool("skill.load"), knownTool("file.search")]);
    },
  },
} as const;

export const baseToolDeveloperCatalogDescriptor = {
  surface: "basetool.authoring",
  validatesAgainst: "basetool.catalog",
  publicHelpers: ["basetool", "baseTools", "toolSets", "tryBaseToolById", "listBaseToolDeveloperCatalog"],
  semanticToolCount: listSemanticBaseToolDefinitions().length,
  legacyHelpersAreAliases: true,
  doesNotExecuteTools: true,
} as const;
