import { tool, tools, type ToolSpec } from "../runtimeImplementation/runtimeAgentManifest.js";
import { getSemanticBaseToolDefinition, listSemanticBaseToolDefinitions } from "./catalog.js";
import {
  describeBaseToolForProfile,
  getBaseToolProfile,
  listBaseToolDefinitionsForProfile,
  listBaseToolProfiles,
} from "./profiles.js";
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

function profileFor(input: BaseToolSpecInput): BaseToolProfileName {
  return input.profileName ?? "agentCore";
}

export function baseToolToToolSpec(definition: BaseToolDefinition, input: BaseToolSpecInput = {}): ToolSpec {
  const { profileName: _profileName, metadata, ...toolInput } = input;
  const profileName = profileFor(input);
  const profiled = describeBaseToolForProfile(definition, profileName);
  return tool(profiled.toolId, {
    ...toolInput,
    family: profiled.storageFamily,
    group: profiled.group,
    description: toolInput.description ?? profiled.description,
    inputSchema: toolInput.inputSchema ?? inputSchema(profiled),
    metadata: {
      authoringSurface: "basetool.authoring",
      basetoolLayer: profiled.layer,
      visibility: profiled.visibility,
      riskLevel: profiled.riskLevel,
      policyRisk: profiled.policyRisk,
      runtimePorts: profiled.runtimePorts,
      profileName,
      profileSummary: getBaseToolProfile(profileName).summary,
      ...(profiled.metadata ?? {}),
      ...(metadata ?? {}),
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

export function listBaseToolDeveloperCatalog(input: { profileName?: BaseToolProfileName } = {}): readonly BaseToolDefinition[] {
  if (input.profileName === undefined) return listSemanticBaseToolDefinitions();
  return listBaseToolDefinitionsForProfile(input.profileName, { includeDeferred: true, includeRuntime: true });
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
    entry: describeBaseToolForProfile(definition, profileFor(input)),
  };
}

export function baseToolProfile(name: BaseToolProfileName): readonly ToolSpec[] {
  const profile = getBaseToolProfile(name);
  return tools(profile.visibleToolIds.map((toolId) => knownTool(toolId, { profileName: name })));
}

export const basetool = {
  all: listBaseToolDeveloperCatalog,
  profiles: listBaseToolProfiles,
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
    mcpPrompts: (input?: BaseToolSpecInput) => knownTool("mcp.prompts", input),
    mcpCompletions: (input?: BaseToolSpecInput) => knownTool("mcp.completions", input),
  },
  runtime: {
    processWait: (input?: BaseToolSpecInput) => knownTool("process.wait", input),
    processKill: (input?: BaseToolSpecInput) => knownTool("process.kill", input),
    toolDiscover: (input?: BaseToolSpecInput) => knownTool("tool.discover", input),
    toolDescribe: (input?: BaseToolSpecInput) => knownTool("tool.describe", input),
  },
} as const;

export const toolSets = {
  coding: {
    readonly(input: CodingToolSetOptions = {}): readonly ToolSpec[] {
      return tools([
        knownTool("file.read", { profileName: "codingCore" }),
        knownTool("file.search", { profileName: "codingCore" }),
        ...(input.includeSearch === true
          ? [knownTool("web.search", { profileName: "codingCore" }), knownTool("web.fetch", { profileName: "codingCore" })]
          : []),
      ]);
    },
    full(): readonly ToolSpec[] {
      return baseToolProfile("codingCore");
    },
  },
  shell: {
    safe(): readonly ToolSpec[] {
      return tools([knownTool("shell.run", { profileName: "runtimeCore" })]);
    },
  },
  research: {
    web(): readonly ToolSpec[] {
      return tools([
        knownTool("web.search", { profileName: "researchCore" }),
        knownTool("web.fetch", { profileName: "researchCore" }),
      ]);
    },
  },
  skill: {
    context(): readonly ToolSpec[] {
      return tools([knownTool("skill.load", { profileName: "agentCore" })]);
    },
    search(): readonly ToolSpec[] {
      return tools([
        knownTool("skill.load", { profileName: "agentCore" }),
        knownTool("file.search", { profileName: "agentCore" }),
      ]);
    },
    authoring(): readonly ToolSpec[] {
      return tools([knownTool("skill.load", { profileName: "agentCore" })]);
    },
    full(): readonly ToolSpec[] {
      return tools([
        knownTool("skill.load", { profileName: "agentCore" }),
        knownTool("file.search", { profileName: "agentCore" }),
      ]);
    },
  },
} as const;

export const baseToolDeveloperCatalogDescriptor = {
  surface: "basetool.authoring",
  validatesAgainst: "basetool.catalog",
  publicHelpers: ["basetool", "toolSets", "tryBaseToolById", "listBaseToolDeveloperCatalog"],
  semanticToolCount: listSemanticBaseToolDefinitions().length,
  profileNames: ["codingCore", "researchCore", "workCore", "runtimeCore", "agentCore", "fullCore"],
  legacyHelpersAreAliases: false,
  doesNotExecuteTools: true,
} as const;
