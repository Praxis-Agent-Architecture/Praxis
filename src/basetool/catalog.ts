import type {
  BaseToolDefinition,
  BaseToolInputSchema,
  BaseToolLayer,
  BaseToolPolicyRisk,
  BaseToolRiskLevel,
  BaseToolVisibility,
} from "./types.js";

const emptyObjectSchema: BaseToolInputSchema = {
  kind: "json-schema",
  schema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
};

function policyRiskFor(risk: BaseToolRiskLevel): BaseToolPolicyRisk {
  if (risk === "safe" || risk === "read") return "safe";
  if (risk === "dangerous" || risk === "destructive" || risk === "high") return "dangerous";
  return "risky";
}

function familyFor(layer: BaseToolLayer, toolId: string): string {
  if (layer === "core") return "coreBase";
  if (layer === "agent") return "agentBase";
  if (layer === "runtime") return "runtimeBase";
  const family = toolId.split(".", 1)[0] ?? "optional";
  if (family === "image" || family === "audio" || family === "media") return "omniBase";
  if (family === "repo") return "gitBase";
  return `${family}Base`;
}

function groupFor(toolId: string): string {
  const family = toolId.split(".", 1)[0] ?? "tool";
  if (family === "file") return "filesystem";
  if (family === "web") return "web";
  if (family === "patch") return "edit";
  if (family === "plan") return "planning";
  if (family === "user") return "interaction";
  if (family === "agent") return "multiagent";
  if (family === "mcp") return "mcp";
  if (family === "process") return "process";
  return family;
}

function schema(schema: Readonly<Record<string, unknown>>): BaseToolInputSchema {
  return { kind: "json-schema", schema };
}

function define(input: {
  toolId: string;
  layer: BaseToolLayer;
  title: string;
  description: string;
  risk: BaseToolRiskLevel;
  visibility?: BaseToolVisibility;
  runtimePorts?: readonly string[];
  permissionHints?: readonly string[];
  inputSchema?: BaseToolInputSchema;
  metadata?: Readonly<Record<string, unknown>>;
}): BaseToolDefinition {
  const storageFamily = familyFor(input.layer, input.toolId);
  return {
    toolId: input.toolId,
    family: input.layer,
    storageFamily,
    group: groupFor(input.toolId),
    layer: input.layer,
    title: input.title,
    description: input.description,
    visibility: input.visibility ?? (input.layer === "runtime" ? "runtime" : "model"),
    riskLevel: input.risk,
    risk: input.risk,
    policyRisk: policyRiskFor(input.risk),
    permissionHints: input.permissionHints ?? [],
    runtimePorts: input.runtimePorts ?? [],
    dependencies: (input.runtimePorts ?? []).map((port) => ({
      dependencyId: `runtime.executor.${port}`,
      kind: "runtime",
      required: true,
      description: `Requires BaseToolExecutorPort.${port}.`,
    })),
    inputSchema: input.inputSchema ?? emptyObjectSchema,
    sourcePath: `src/basetool/catalog.ts#${input.toolId}`,
    toolSkill: {
      docPath: `docs/basetool/${input.layer}/${input.toolId}.md`,
    },
    metadata: input.metadata,
    projection: input.layer === "core" || input.layer === "agent" ? "runtimeObservation" : "authoringArtifact",
    modelRequired: input.visibility !== "runtime",
  };
}

export const semanticBaseToolCatalog = [
  define({
    toolId: "shell.run",
    layer: "core",
    title: "Run Shell Command",
    description: "Execute a governed shell command through the runtime shell port.",
    risk: "execute",
    runtimePorts: ["shell.run"],
    permissionHints: ["shell", "process", "workspace"],
    inputSchema: schema({
      type: "object",
      properties: {
        command: { type: "string", description: "Command to execute." },
        cwd: { type: "string", description: "Working directory, usually workspace-relative." },
        timeoutMs: { type: "number", description: "Optional timeout in milliseconds." },
      },
      required: ["command"],
      additionalProperties: false,
    }),
  }),
  define({
    toolId: "file.read",
    layer: "core",
    title: "Read File",
    description: "Read a UTF-8 workspace file through the runtime filesystem port.",
    risk: "read",
    runtimePorts: ["filesystem.readText"],
    permissionHints: ["filesystem:read"],
    inputSchema: schema({
      type: "object",
      properties: {
        path: { type: "string", description: "Workspace-relative or approved absolute path." },
        maxBytes: { type: "number", description: "Optional byte limit for the returned content." },
      },
      required: ["path"],
      additionalProperties: false,
    }),
  }),
  define({
    toolId: "file.search",
    layer: "core",
    title: "Search Files",
    description: "Search workspace files, preferably through ripgrep when available.",
    risk: "read",
    runtimePorts: ["search.ripgrep"],
    permissionHints: ["filesystem:read"],
    inputSchema: schema({
      type: "object",
      properties: {
        query: { type: "string" },
        cwd: { type: "string" },
        glob: { type: "string" },
      },
      required: ["query"],
      additionalProperties: false,
    }),
  }),
  define({
    toolId: "patch.apply",
    layer: "core",
    title: "Apply Patch",
    description: "Apply a Codex-style patch first, with room for unified diff support later.",
    risk: "write",
    runtimePorts: ["filesystem.writeText"],
    permissionHints: ["filesystem:write"],
    inputSchema: schema({
      type: "object",
      properties: {
        patch: { type: "string", description: "Patch text, preferably *** Begin Patch format." },
        cwd: { type: "string" },
      },
      required: ["patch"],
      additionalProperties: false,
    }),
  }),
  define({
    toolId: "web.search",
    layer: "core",
    title: "Search Web",
    description: "Search the web for current or grounded information through a runtime/network port.",
    risk: "network",
    runtimePorts: ["network.search"],
    permissionHints: ["network:egress"],
    inputSchema: schema({
      type: "object",
      properties: {
        query: { type: "string" },
        maxResults: { type: "number" },
      },
      required: ["query"],
      additionalProperties: false,
    }),
  }),
  define({
    toolId: "web.fetch",
    layer: "core",
    title: "Fetch Web Page",
    description: "Fetch a URL through a governed runtime/network port.",
    risk: "network",
    runtimePorts: ["network.fetch"],
    permissionHints: ["network:egress"],
    inputSchema: schema({
      type: "object",
      properties: {
        url: { type: "string" },
        maxBytes: { type: "number" },
      },
      required: ["url"],
      additionalProperties: false,
    }),
  }),
  define({
    toolId: "plan.update",
    layer: "core",
    title: "Update Plan",
    description: "Record a concise task plan update for the current run.",
    risk: "safe",
    runtimePorts: ["plan.update"],
    inputSchema: schema({
      type: "object",
      properties: {
        explanation: { type: "string" },
        plan: {
          type: "array",
          items: {
            type: "object",
            properties: {
              step: { type: "string" },
              status: { type: "string", enum: ["pending", "in_progress", "completed"] },
            },
            required: ["step", "status"],
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    }),
  }),
  define({
    toolId: "user.ask",
    layer: "core",
    title: "Ask User",
    description: "Ask the user for missing information when runtime policy or task ambiguity requires it.",
    risk: "safe",
    runtimePorts: ["userInteraction.ask"],
    inputSchema: schema({
      type: "object",
      properties: {
        prompt: { type: "string" },
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              question: { type: "string" },
              header: { type: "string" },
            },
            required: ["id", "question"],
            additionalProperties: true,
          },
        },
      },
      additionalProperties: false,
    }),
  }),
  define({
    toolId: "skill.load",
    layer: "agent",
    title: "Load Skill",
    description: "Load local skill instructions through the runtime skill port.",
    risk: "read",
    runtimePorts: ["skill.load"],
    permissionHints: ["skill:read", "filesystem:read"],
    inputSchema: schema({
      type: "object",
      properties: {
        name: { type: "string" },
        path: { type: "string" },
      },
      additionalProperties: false,
    }),
  }),
  define({
    toolId: "context.load",
    layer: "agent",
    title: "Load Context",
    description: "Load runtime-registered contextual material, artifacts, observations, session material, or workspace index entries.",
    risk: "read",
    runtimePorts: ["context.load"],
    permissionHints: ["context:read"],
    inputSchema: schema({
      type: "object",
      properties: {
        ref: { type: "string" },
        kind: { type: "string", enum: ["artifact", "observation", "session", "workspaceIndex"] },
        query: { type: "string" },
        limit: { type: "number" },
      },
      additionalProperties: false,
    }),
  }),
  define({
    toolId: "mcp.use",
    layer: "agent",
    title: "Use MCP Tool",
    description: "Call a mounted MCP tool through runtime-owned MCP clients.",
    risk: "execute",
    runtimePorts: ["mcp.call"],
    permissionHints: ["mcp:call"],
    inputSchema: schema({
      type: "object",
      properties: {
        serverId: { type: "string" },
        toolName: { type: "string" },
        arguments: { type: "object" },
      },
      required: ["toolName"],
      additionalProperties: false,
    }),
  }),
  define({
    toolId: "mcp.resources",
    layer: "agent",
    title: "Read MCP Resources",
    description: "List or read MCP resources through runtime-owned MCP clients.",
    risk: "read",
    runtimePorts: ["mcp.listResources", "mcp.readResource"],
    permissionHints: ["mcp:resources", "mcp:read"],
    inputSchema: schema({
      type: "object",
      properties: {
        operation: { type: "string", enum: ["list", "read"] },
        serverId: { type: "string" },
        uri: { type: "string" },
      },
      required: ["operation"],
      additionalProperties: false,
    }),
  }),
  define({
    toolId: "process.wait",
    layer: "runtime",
    title: "Wait Process",
    description: "Runtime-only process wait.",
    risk: "safe",
    runtimePorts: ["process.wait"],
    inputSchema: schema({
      type: "object",
      properties: {
        processId: { type: "string" },
        timeoutMs: { type: "number" },
      },
      required: ["processId"],
      additionalProperties: false,
    }),
  }),
  define({
    toolId: "process.kill",
    layer: "runtime",
    title: "Kill Process",
    description: "Runtime-only process termination.",
    risk: "dangerous",
    runtimePorts: ["process.kill"],
    inputSchema: schema({
      type: "object",
      properties: {
        processId: { type: "string" },
        signal: { type: "string" },
      },
      required: ["processId"],
      additionalProperties: false,
    }),
  }),
  define({
    toolId: "tool.discover",
    layer: "runtime",
    title: "Discover Tools",
    description: "Discover the currently mounted core tool surface.",
    risk: "safe",
    runtimePorts: ["tool.discover"],
    inputSchema: schema({
      type: "object",
      properties: {
        query: { type: "string" },
        layer: { type: "string" },
      },
      additionalProperties: false,
    }),
  }),
  define({
    toolId: "tool.describe",
    layer: "runtime",
    title: "Describe Tool",
    description: "Describe one mounted core tool and its schema.",
    risk: "safe",
    runtimePorts: ["tool.describe"],
    inputSchema: schema({
      type: "object",
      properties: {
        toolId: { type: "string" },
      },
      required: ["toolId"],
      additionalProperties: false,
    }),
  }),
] as const satisfies readonly BaseToolDefinition[];

export function listSemanticBaseToolDefinitions(): readonly BaseToolDefinition[] {
  return semanticBaseToolCatalog;
}

export function getSemanticBaseToolDefinition(toolId: string): BaseToolDefinition | undefined {
  return semanticBaseToolCatalog.find((definition) => definition.toolId === toolId);
}
