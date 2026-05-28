import type {
  BaseToolDefinition,
  BaseToolProfile,
  BaseToolProfileDescribeOverlay,
  BaseToolProfileName,
} from "./types.js";
import { semanticBaseToolCatalog } from "./catalog.js";

export const baseToolProfileNames = [
  "codingCore",
  "researchCore",
  "workCore",
  "runtimeCore",
  "agentCore",
  "fullCore",
] as const satisfies readonly BaseToolProfileName[];

const codingCoreTools = [
  "shell.run",
  "file.read",
  "file.search",
  "patch.apply",
  "web.search",
  "web.fetch",
  "plan.update",
  "user.ask",
  "skill.load",
  "context.load",
] as const;

const researchCoreTools = [
  "web.search",
  "web.fetch",
  "file.read",
  "file.search",
  "context.load",
  "mcp.resources",
  "plan.update",
  "user.ask",
] as const;

const workCoreTools = [
  "shell.run",
  "file.read",
  "file.search",
  "patch.apply",
  "web.search",
  "web.fetch",
  "skill.load",
  "context.load",
  "plan.update",
  "user.ask",
] as const;

const runtimeCoreTools = [
  "shell.run",
  "file.read",
  "file.search",
  "process.wait",
  "process.kill",
  "tool.discover",
  "tool.describe",
  "plan.update",
  "user.ask",
] as const;

const agentExtensionTools = ["skill.load", "context.load", "mcp.use", "mcp.resources"] as const;

const multiagentMeshTools = [
  "agent.spawn",
  "agent.message",
  "agent.inbox",
  "agent.list",
  "agent.inspect",
  "agent.wait",
  "agent.stop",
  "agent.kill",
] as const;

const nonRuntimeToolIds = semanticBaseToolCatalog
  .filter((definition) => definition.layer !== "runtime")
  .map((definition) => definition.toolId);

const runtimeToolIds = semanticBaseToolCatalog
  .filter((definition) => definition.layer === "runtime")
  .map((definition) => definition.toolId);

function overlay(input: BaseToolProfileDescribeOverlay): BaseToolProfileDescribeOverlay {
  return input;
}

function uniqueToolIds(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

const codingDescribeOverlays = {
  "shell.run": overlay({
    summary: "Run tests, build commands, diagnostics, and small repo-local scripts.",
    useWhen: ["You need command output to understand or verify a codebase."],
    avoidWhen: ["A structured file or patch tool can express the change more safely."],
  }),
  "patch.apply": overlay({
    summary: "Apply a Codex-style patch to source files after inspecting the target. For new files use exactly: *** Begin Patch, then *** Add File: path, then every content line prefixed with '+', then *** End Patch.",
    useWhen: ["You know the exact source edit and want a reviewable patch-shaped change."],
    examples: ["Create file: *** Begin Patch\\n*** Add File: server.js\\n+console.log('ok')\\n*** End Patch"],
  }),
  "file.search": overlay({
    summary: "Search source files with a fast text query before opening precise files.",
  }),
  "context.load": overlay({
    summary: "Load runtime-registered coding context, artifacts, or workspace index material.",
  }),
} satisfies Readonly<Record<string, BaseToolProfileDescribeOverlay>>;

const researchDescribeOverlays = {
  "web.search": overlay({
    summary: "Find current or externally grounded sources before answering.",
    useWhen: ["The user asks for latest, factual, source-backed, or unfamiliar information."],
  }),
  "web.fetch": overlay({
    summary: "Fetch a specific URL or cited page for precise attribution.",
  }),
  "file.search": overlay({
    summary: "Search local notes, docs, and source material that may ground the answer.",
  }),
  "mcp.resources": overlay({
    summary: "Read external MCP resources without invoking arbitrary MCP tool actions.",
  }),
} satisfies Readonly<Record<string, BaseToolProfileDescribeOverlay>>;

const workDescribeOverlays = {
  "shell.run": overlay({
    summary: "Run local scripts for documents, spreadsheets, reports, data cleanup, and checks.",
    useWhen: ["A reproducible script is the cleanest way to transform work artifacts."],
  }),
  "patch.apply": overlay({
    summary: "Create or update text-based work artifacts such as Markdown, JSON, CSV, and scripts.",
  }),
  "context.load": overlay({
    summary: "Load application-registered artifacts, session material, or workspace indexes.",
  }),
  "skill.load": overlay({
    summary: "Load specialized document, spreadsheet, PDF, or presentation workflow guidance.",
  }),
} satisfies Readonly<Record<string, BaseToolProfileDescribeOverlay>>;

const runtimeDescribeOverlays = {
  "shell.run": overlay({
    summary: "Inspect runtime state, logs, environment, and service health through governed shell commands.",
  }),
  "process.wait": overlay({
    summary: "Wait for a runtime-owned process handle and collect completion state.",
  }),
  "process.kill": overlay({
    summary: "Terminate a runtime-owned process handle only after policy approval.",
  }),
  "tool.discover": overlay({
    summary: "Inspect the mounted tool surface without executing external side effects.",
  }),
} satisfies Readonly<Record<string, BaseToolProfileDescribeOverlay>>;

const agentDescribeOverlays = {
  "agent.spawn": overlay({
    summary: "Create a project-local agent session and send its first task message.",
    useWhen: ["Parallel work or a specialized project-local agent session is useful."],
    avoidWhen: ["A simple tool call or direct answer is enough."],
  }),
  "agent.message": overlay({
    summary: "Send queued or steer messages to another project-local agent session by sessionId.",
  }),
  "agent.inbox": overlay({
    summary: "Read current session inbox messages; reading marks selected messages as read.",
  }),
  "agent.wait": overlay({
    summary: "Wait for the reply correlated to a message this session sent.",
  }),
  "media.viewImage": overlay({
    summary: "Inspect attached screenshots, workspace images, and visual artifacts through the runtime media port.",
    useWhen: ["The user provides an image or asks a visual question."],
  }),
  "mcp.use": overlay({
    summary: "Call a mounted MCP tool when the runtime has explicitly provided that server.",
  }),
  "mcp.resources": overlay({
    summary: "List or read mounted MCP resources through runtime-owned clients.",
  }),
  "skill.load": overlay({
    summary: "Load local skill instructions through the governed skill port.",
  }),
} satisfies Readonly<Record<string, BaseToolProfileDescribeOverlay>>;

export const baseToolProfiles: Readonly<Record<BaseToolProfileName, BaseToolProfile>> = {
  codingCore: {
    name: "codingCore",
    title: "Coding Core",
    description: "Default single-agent coding profile for source inspection, shell diagnostics, patch edits, web grounding, skills, and runtime context.",
    summary: "Write, inspect, test, and verify code with a compact tool surface.",
    defaultPolicyProfile: "permissive",
    visibleToolIds: codingCoreTools,
    deferredToolIds: [],
    runtimeToolIds,
    describeOverlays: codingDescribeOverlays,
  },
  researchCore: {
    name: "researchCore",
    title: "Research Core",
    description: "Grounding profile for web search/fetch, local source search, context loading, and read-only MCP resource access.",
    summary: "Gather and cite current or local evidence with minimal write capability.",
    defaultPolicyProfile: "permissive",
    visibleToolIds: researchCoreTools,
    deferredToolIds: ["shell.run", "patch.apply"],
    runtimeToolIds,
    describeOverlays: researchDescribeOverlays,
  },
  workCore: {
    name: "workCore",
    title: "Work Core",
    description: "Productivity profile for document, spreadsheet, report, data, and script workflows without product-specific plugins baked into Praxis.",
    summary: "Use coding-shaped primitives for practical work artifacts and local automation.",
    defaultPolicyProfile: "permissive",
    visibleToolIds: workCoreTools,
    deferredToolIds: ["mcp.resources"],
    runtimeToolIds,
    extensionSlots: ["work", "pdf", "spreadsheet", "presentation", "artifact"],
    describeOverlays: workDescribeOverlays,
  },
  runtimeCore: {
    name: "runtimeCore",
    title: "Runtime Core",
    description: "Runtime and operations profile for tool inspection, process handles, logs, environment checks, and governed host diagnostics.",
    summary: "Inspect and operate the runtime without turning runtime internals into product logic.",
    defaultPolicyProfile: "permissive",
    visibleToolIds: runtimeCoreTools,
    deferredToolIds: ["web.fetch", "mcp.resources"],
    runtimeToolIds,
    describeOverlays: runtimeDescribeOverlays,
  },
  agentCore: {
    name: "agentCore",
    title: "Agent Core",
    description: "Praxis-designed standard agent profile. It exposes current non-runtime core tools, including project-local mesh tools, and keeps runtime tools available to the runtime plane.",
    summary: "Use the complete Praxis agent core without opting into product/plugin full mode.",
    defaultPolicyProfile: "permissive",
    visibleToolIds: uniqueToolIds([...nonRuntimeToolIds, ...multiagentMeshTools]),
    deferredToolIds: [],
    runtimeToolIds,
    describeOverlays: agentDescribeOverlays,
  },
  fullCore: {
    name: "fullCore",
    title: "Full Core",
    description: "Application-owned full-open profile for products such as Raxode. Praxis provides the slots and current agent core; applications register the extra plugins.",
    summary: "Open the framework surface for application/plugin expansion while preserving Praxis contracts.",
    defaultPolicyProfile: "permissive",
    visibleToolIds: uniqueToolIds([...nonRuntimeToolIds, ...multiagentMeshTools]),
    deferredToolIds: [],
    runtimeToolIds,
    extensionSlots: ["mcp", "skill", "context", "work", "media", "browser", "computer", "memory", "artifact", "repo"],
    describeOverlays: {
      ...agentDescribeOverlays,
      ...workDescribeOverlays,
    },
  },
};

export function listBaseToolProfiles(): readonly BaseToolProfile[] {
  return baseToolProfileNames.map((name) => baseToolProfiles[name]);
}

export function getBaseToolProfile(name: BaseToolProfileName): BaseToolProfile {
  return baseToolProfiles[name];
}

export function isBaseToolProfileName(value: string): value is BaseToolProfileName {
  return (baseToolProfileNames as readonly string[]).includes(value);
}

export function profileOwnsBaseTool(profile: BaseToolProfile, toolId: string): boolean {
  return profile.visibleToolIds.includes(toolId)
    || profile.deferredToolIds.includes(toolId)
    || profile.runtimeToolIds.includes(toolId);
}

export function describeBaseToolForProfile(
  definition: BaseToolDefinition,
  profileName: BaseToolProfileName = "agentCore",
): BaseToolDefinition {
  const profile = getBaseToolProfile(profileName);
  const overlay = profile.describeOverlays?.[definition.toolId];
  if (overlay === undefined) {
    return {
      ...definition,
      metadata: {
        ...(definition.metadata ?? {}),
        profileName,
        profileSummary: profile.summary,
      },
    };
  }
  const useWhen = overlay.useWhen?.length ? ` Use when: ${overlay.useWhen.join(" ")}` : "";
  const avoidWhen = overlay.avoidWhen?.length ? ` Avoid when: ${overlay.avoidWhen.join(" ")}` : "";
  const examples = overlay.examples?.length ? ` Examples: ${overlay.examples.join(" ")}` : "";
  const description = overlay.description
    ?? `${overlay.summary ?? definition.description}${useWhen}${avoidWhen}${examples}`;
  return {
    ...definition,
    description,
    metadata: {
      ...(definition.metadata ?? {}),
      profileName,
      profileSummary: profile.summary,
      profileDescriptionOverlay: overlay,
    },
  };
}

export function listBaseToolDefinitionsForProfile(
  profileName: BaseToolProfileName,
  options: { includeDeferred?: boolean; includeRuntime?: boolean } = {},
): readonly BaseToolDefinition[] {
  const profile = getBaseToolProfile(profileName);
  const selected = new Set<string>([
    ...profile.visibleToolIds,
    ...(options.includeDeferred === true ? profile.deferredToolIds : []),
    ...(options.includeRuntime === true ? profile.runtimeToolIds : []),
  ]);
  return semanticBaseToolCatalog
    .filter((definition) => selected.has(definition.toolId))
    .map((definition) => describeBaseToolForProfile(definition, profileName));
}
