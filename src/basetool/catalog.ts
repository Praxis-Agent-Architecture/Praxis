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
  if (family === "image" || family === "audio" || family === "media") return "mediaBase";
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
    description: "Execute a governed shell command through the runtime shell port. For long-running servers, start them as detached/background services that print a pid and then verify with a separate command; do not keep an interactive process attached to shell.run.",
    risk: "execute",
    runtimePorts: ["shell.run"],
    permissionHints: ["shell", "process", "workspace"],
    inputSchema: schema({
      type: "object",
      properties: {
        command: { type: "string", description: "Command to execute." },
        cwd: { type: "string", description: "Working directory, usually workspace-relative." },
        timeoutMs: { type: "number", description: "Optional timeout in milliseconds. Use a short timeout for probes and detached service startup commands." },
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
    description: "Apply a Codex-style patch and return changed files, line stats, and a compact diff preview so successful structured edits do not need full-file readback just for confirmation. For Add File, every new content line must start with '+'.",
    risk: "write",
    runtimePorts: ["filesystem.writeText"],
    permissionHints: ["filesystem:write"],
    inputSchema: schema({
      type: "object",
      properties: {
        patch: {
          type: "string",
          description: "Patch text. Required create-file form: *** Begin Patch\\n*** Add File: path\\n+line 1\\n+line 2\\n*** End Patch. In Add File blocks every content line, including blank lines, must start with '+'. Update uses *** Update File: path plus @@ hunks where removed lines start '-' and added lines start '+'. Delete uses *** Delete File: path.",
        },
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
    permissionHints: ["context:read", "artifact:read"],
    inputSchema: schema({
      type: "object",
      properties: {
        ref: { type: "string" },
        kind: { type: "string", enum: ["artifact", "observation", "session", "workspaceIndex"] },
        query: { type: "string" },
        limit: { type: "integer", minimum: 0 },
      },
      required: ["kind"],
      additionalProperties: false,
    }),
  }),
  define({
    toolId: "agent.spawn",
    layer: "agent",
    title: "Spawn Agent Session",
    description: "Create or derive an agent session inside the current project mesh, then send its first task message.",
    risk: "risky",
    runtimePorts: ["agent.spawn"],
    permissionHints: ["agent:spawn", "project:session"],
    inputSchema: schema({
      type: "object",
      properties: {
        requesterSessionId: { type: "string", description: "Defaults to the current runtime session id." },
        agentDefinitionId: { type: "string", description: "Optional existing AgentDefinition to instantiate. Omit to derive from the requester." },
        name: { type: "string", description: "Optional display name. Runtime still generates the stable id." },
        description: { type: "string", description: "Short UI/list description." },
        model: { type: "string", description: "Optional allowed model override; defaults to inherited model." },
        appendPrompt: { type: "string", description: "Optional appended identity/behavior prompt, not the task." },
        workingDirectory: { type: "string", description: "Execution cwd inside the same project workspace root." },
        lifecycle: { type: "string", enum: ["oneshot", "persistent"] },
        task: { type: "string", description: "First human-input-style task message for the spawned agent." },
        metadata: { type: "object" },
      },
      required: ["task"],
      additionalProperties: false,
    }),
    metadata: { groupTool: "agent", meshDefault: true },
  }),
  define({
    toolId: "agent.message",
    layer: "agent",
    title: "Message Agent",
    description: "Send a queued or steer message to another agent session by sessionId. Replies use replyToMessageId.",
    risk: "safe",
    runtimePorts: ["agent.message"],
    permissionHints: ["agent:message"],
    inputSchema: schema({
      type: "object",
      properties: {
        fromSessionId: { type: "string", description: "Defaults to the current runtime session id." },
        toSessionId: { type: "string" },
        text: { type: "string" },
        parts: { type: "array", items: { type: "object", additionalProperties: true } },
        intent: { type: "string", enum: ["queue", "steer"] },
        replyToMessageId: { type: "string" },
        metadata: { type: "object" },
      },
      required: ["toSessionId"],
      additionalProperties: false,
    }),
    metadata: { groupTool: "agent", peerInstructionAuthority: "context-only" },
  }),
  define({
    toolId: "agent.inbox",
    layer: "agent",
    title: "Read Agent Inbox",
    description: "Read current agent messages. Reading marks selected messages as read; messages are not auto-summarized.",
    risk: "read",
    runtimePorts: ["agent.inbox"],
    permissionHints: ["agent:inbox"],
    inputSchema: schema({
      type: "object",
      properties: {
        sessionId: { type: "string", description: "Defaults to the current runtime session id." },
        unreadOnly: { type: "boolean", description: "Defaults to true." },
        limit: { type: "integer", minimum: 0 },
      },
      additionalProperties: false,
    }),
    metadata: { groupTool: "agent", readMarksRead: true },
  }),
  define({
    toolId: "agent.list",
    layer: "agent",
    title: "List Project Agents",
    description: "List agent sessions visible inside the current project mesh.",
    risk: "read",
    runtimePorts: ["agent.list"],
    permissionHints: ["agent:list"],
    inputSchema: schema({
      type: "object",
      properties: {
        projectId: { type: "string" },
        includeInactive: { type: "boolean" },
      },
      additionalProperties: false,
    }),
    metadata: { groupTool: "agent", projectScoped: true },
  }),
  define({
    toolId: "agent.inspect",
    layer: "agent",
    title: "Inspect Agent Session",
    description: "Inspect public-safe status, summary, and pending-message count for a project-local agent session.",
    risk: "read",
    runtimePorts: ["agent.inspect"],
    permissionHints: ["agent:inspect"],
    inputSchema: schema({
      type: "object",
      properties: {
        sessionId: { type: "string" },
      },
      required: ["sessionId"],
      additionalProperties: false,
    }),
    metadata: { groupTool: "agent", secretSafe: true },
  }),
  define({
    toolId: "agent.wait",
    layer: "agent",
    title: "Wait Agent Reply",
    description: "Wait without timeout for the reply correlated to a message sent by this session.",
    risk: "safe",
    runtimePorts: ["agent.wait"],
    permissionHints: ["agent:wait"],
    inputSchema: schema({
      type: "object",
      properties: {
        requesterSessionId: { type: "string", description: "Defaults to the current runtime session id." },
        messageId: { type: "string" },
      },
      required: ["messageId"],
      additionalProperties: false,
    }),
    metadata: { groupTool: "agent", waitsFor: "replyToMessageId" },
  }),
  define({
    toolId: "agent.stop",
    layer: "agent",
    title: "Stop Agent Session",
    description: "Request graceful stop for an agent session so it can finish or summarize.",
    risk: "risky",
    runtimePorts: ["agent.stop"],
    permissionHints: ["agent:stop"],
    inputSchema: schema({
      type: "object",
      properties: {
        sessionId: { type: "string" },
        reason: { type: "string" },
      },
      required: ["sessionId"],
      additionalProperties: false,
    }),
    metadata: { groupTool: "agent", graceful: true },
  }),
  define({
    toolId: "agent.kill",
    layer: "agent",
    title: "Kill Agent Session",
    description: "Force terminate an agent session. Inbox and audit facts remain for later inspection or revival.",
    risk: "dangerous",
    runtimePorts: ["agent.kill"],
    permissionHints: ["agent:kill"],
    inputSchema: schema({
      type: "object",
      properties: {
        sessionId: { type: "string" },
        reason: { type: "string" },
      },
      required: ["sessionId"],
      additionalProperties: false,
    }),
    metadata: { groupTool: "agent", destructiveControl: true },
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
    description: "List, read, subscribe to, or unsubscribe from MCP resources through runtime-owned MCP clients.",
    risk: "read",
    runtimePorts: ["mcp.listResources", "mcp.readResource", "mcp.subscribe", "mcp.unsubscribe"],
    permissionHints: ["mcp:resources", "mcp:read", "mcp:resource:subscribe"],
    inputSchema: schema({
      type: "object",
      properties: {
        operation: { type: "string", enum: ["list", "read", "subscribe", "unsubscribe"] },
        serverId: { type: "string" },
        uri: { type: "string" },
        uriPrefix: { type: "string" },
        cursor: { type: "string" },
        subscriptionId: { type: "string" },
      },
      required: ["operation"],
      additionalProperties: false,
    }),
  }),
  define({
    toolId: "mcp.prompts",
    layer: "agent",
    title: "Read MCP Prompts",
    description: "List or get MCP prompts through runtime-owned MCP clients.",
    risk: "read",
    runtimePorts: ["mcp.listPrompts", "mcp.getPrompt"],
    permissionHints: ["mcp:prompt:list", "mcp:prompt:get"],
    inputSchema: schema({
      type: "object",
      properties: {
        operation: { type: "string", enum: ["list", "get"] },
        serverId: { type: "string" },
        cursor: { type: "string" },
        name: { type: "string" },
        arguments: { type: "object" },
      },
      required: ["operation"],
      additionalProperties: false,
    }),
  }),
  define({
    toolId: "media.viewImage",
    layer: "optional",
    title: "View Image",
    description: "Inspect a user-provided or workspace image through the runtime media port. Use this when the user attaches an image or asks about visual content.",
    risk: "read",
    runtimePorts: ["media.viewImage"],
    permissionHints: ["media:image:read", "filesystem:read"],
    inputSchema: schema({
      type: "object",
      properties: {
        imageRef: { type: "string", description: "Attachment or artifact reference supplied by the runtime." },
        imagePath: { type: "string", description: "Workspace-relative or approved absolute image path." },
        prompt: { type: "string", description: "Question or inspection goal for the image." },
        detail: { type: "string", enum: ["low", "high", "auto"], description: "Optional image detail preference." },
        maxBytes: { type: "number", description: "Optional byte limit for local image reads." },
      },
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
