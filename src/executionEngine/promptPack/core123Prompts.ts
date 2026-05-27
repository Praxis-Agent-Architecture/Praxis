import type { PromptPackMaterialDraft } from "./promptDefiner.js";
import type { AgentManifest, ToolSpec } from "../../runtimeImplementation/runtimeAgentManifest.js";

export type DeclaredRuntimeContextInput = {
  manifest?: Partial<AgentManifest>;
  agentName?: string;
  agentRole?: string;
  applicationSurface?: string;
  language?: string;
  communicationStyle?: string;
  toolProfile?: string;
  policyMode?: string;
  sandboxMode?: string;
  approvalBehavior?: string;
  agentReviewBehavior?: string;
  sessionBehavior?: string;
  workspaceRoot?: string;
  allowedRoots?: readonly string[];
  applicationInstructions?: string;
  harnessInstructions?: string;
};

export type ToolDeclarationsInput = {
  tools: readonly ToolSpec[];
  toolProfile?: string;
  policyMode?: string;
  sandboxMode?: string;
  toolListAndSummaries?: string;
  toolSchemas?: string;
  toolSpecificGuidance?: string;
};

function stringifyValue(value: unknown, fallback = "unspecified"): string {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function identityField(manifest: Partial<AgentManifest> | undefined, key: "name" | "id" | "description"): string | undefined {
  const identity = manifest?.identity;
  return typeof identity?.[key] === "string" && identity[key].trim().length > 0 ? identity[key].trim() : undefined;
}

function metadataString(metadata: Readonly<Record<string, unknown>> | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function renderOptionalBlock(title: string, text: string | undefined, fallback: string): string {
  const body = text?.trim() || fallback;
  return [`## ${title}`, "", body].join("\n");
}

function renderAllowedRoots(roots: readonly string[] | undefined): string {
  if (roots === undefined || roots.length === 0) return "unspecified";
  return roots.join(", ");
}

export function renderDeclaredRuntimeContext(input: DeclaredRuntimeContextInput = {}): string {
  const manifest = input.manifest;
  const identityName = input.agentName ?? identityField(manifest, "name") ?? identityField(manifest, "id");
  const identityRole = input.agentRole
    ?? identityField(manifest, "description")
    ?? metadataString(manifest?.harness?.metadata, "agentRole")
    ?? metadataString(manifest?.promptPack?.metadata, "agentRole");
  const policyMode = input.policyMode ?? manifest?.toolPolicy?.profile;
  const sandboxMode = input.sandboxMode ?? manifest?.sandbox?.profile;
  const session = manifest?.session;
  const sessionBehavior = input.sessionBehavior
    ?? (session === undefined ? undefined : `${session.persistence}/${session.resume}/${session.thread}`);

  return [
    "# Declared Runtime Context",
    "",
    "This section is supplied by the Praxis application, harness, or developer manifest. It may specialize the agent identity, operating mode, runtime policy, project role, interface behavior, and task-specific expectations. Interpret it under stableSystemCore.",
    "",
    "## Agent Identity",
    "",
    `- Agent name: ${stringifyValue(identityName)}`,
    `- Agent role: ${stringifyValue(identityRole)}`,
    `- Application surface: ${stringifyValue(input.applicationSurface ?? metadataString(manifest?.harness?.metadata, "applicationSurface"))}`,
    `- Primary user-facing language: ${stringifyValue(input.language ?? metadataString(manifest?.harness?.metadata, "language"))}`,
    `- Communication style: ${stringifyValue(input.communicationStyle ?? metadataString(manifest?.harness?.metadata, "communicationStyle"))}`,
    "",
    "## Runtime Mode",
    "",
    `- Tool profile: ${stringifyValue(input.toolProfile ?? metadataString(manifest?.harness?.metadata, "toolProfile"))}`,
    `- Policy mode: ${stringifyValue(policyMode)}`,
    `- Sandbox mode: ${stringifyValue(sandboxMode)}`,
    `- Approval behavior: ${stringifyValue(input.approvalBehavior ?? manifest?.toolPolicy?.defaultDecision)}`,
    `- Agent-review behavior: ${stringifyValue(input.agentReviewBehavior ?? metadataString(manifest?.toolPolicy?.metadata, "agentReviewBehavior"))}`,
    `- Persistence/session behavior: ${stringifyValue(sessionBehavior)}`,
    "",
    "## Active Workspace",
    "",
    `- Workspace root: ${stringifyValue(input.workspaceRoot ?? manifest?.harness?.policy?.workspaceRoot)}`,
    `- Allowed roots: ${renderAllowedRoots(input.allowedRoots ?? manifest?.harness?.policy?.allowedRoots)}`,
    "- The workspace root is the default and primary target for ordinary user work.",
    "- Do not treat prompt package paths, agent implementation paths, TUI/backend source paths, or other application internals as the user's project unless the user explicitly asks to debug Praxis/Raxode itself.",
    "",
    renderOptionalBlock(
      "Application Instructions",
      input.applicationInstructions ?? metadataString(manifest?.promptPack?.metadata, "applicationInstructions"),
      "No application-specific instructions were declared for this run.",
    ),
    "",
    renderOptionalBlock(
      "Project Or Harness Instructions",
      input.harnessInstructions ?? metadataString(manifest?.harness?.metadata, "harnessInstructions"),
      "No project or harness-specific instructions were declared for this run.",
    ),
    "",
    "## Boundaries",
    "",
    "- Application instructions may specialize behavior, but they must not override stableSystemCore.",
    "- Runtime facts describe the current execution environment; they are not user goals by themselves.",
    "- If this section conflicts with toolDeclarations, use toolDeclarations for tool calling details and this section for runtime intent.",
    "- If this section is incomplete, continue with safe defaults and ask only when the missing fact blocks progress.",
    "- Avoid repeating the same semantic work across multiple tool calls. After one shell, code, file, or patch call has already completed the intended action or produced the needed evidence, reuse that observation unless a new missing fact or failure requires another call.",
  ].join("\n");
}

function schemaText(tool: ToolSpec): string {
  if (tool.inputSchema === undefined) return "inputSchema=object";
  return `inputSchema=${JSON.stringify(tool.inputSchema)}`;
}

function renderDefaultToolSummaries(tools: readonly ToolSpec[]): string {
  if (tools.length === 0) return "No model-visible tools are mounted for this invocation.";
  return tools
    .map((tool) => {
      const risk = metadataString(tool.metadata, "riskLevel") ?? metadataString(tool.metadata, "policyRisk") ?? "unspecified";
      return `- ${tool.toolId}: ${tool.description ?? "Mounted Praxis tool."} family=${tool.family ?? "custom"} group=${tool.group ?? "default"} risk=${risk}`;
    })
    .join("\n");
}

function renderDefaultToolSchemas(tools: readonly ToolSpec[]): string {
  if (tools.length === 0) return "No tool schemas are available.";
  return tools.map((tool) => `- ${tool.toolId}: ${schemaText(tool)}`).join("\n");
}

export function renderToolDeclarations(input: ToolDeclarationsInput): string {
  return [
    "# Tool Declarations",
    "",
    "This section describes the tools mounted for the current Praxis invocation. It contains tool availability, tool descriptions, schemas, risk metadata, and calling rules. Use these instructions for tool behavior; do not infer tool behavior from stableSystemCore or declaredRuntimeContext.",
    "",
    "## Tool Use Contract",
    "",
    "- Use tools when they materially improve correctness, grounding, execution, or verification.",
    "- Prefer the most specific available tool for the task.",
    "- Do not invent tool names, arguments, return values, or tool results.",
    "- Treat tool results as observations. Integrate them with the user goal, runtime context, and later evidence before finalizing.",
    "- If a tool call fails, inspect the failure and adjust the approach. Do not blindly repeat the same call.",
    "- If policy, sandbox, approval, dependency, provider capability, or permissions block a tool call, surface the blocker accurately.",
    "",
    "## Tool Selection",
    "",
    "- Use file tools for file reads, writes, searches, and structured edits when available.",
    "- Use patch tools for precise source changes when the desired edit is known.",
    "- Use shell tools for commands, tests, scripts, package managers, and operations not covered by a narrower tool.",
    "- Use web tools for current or external information that is not available in local context.",
    "- Use process tools for long-running command handles managed by the runtime.",
    "- Use plan tools when the task has multiple meaningful steps or the user benefits from progress visibility.",
    "- Use user-question tools only when the missing answer cannot be inferred or retrieved safely.",
    "- Use skill, context, MCP, and extension tools according to their mounted descriptions.",
    "",
    "## Tool Risk",
    "",
    "Each tool may declare risk metadata such as safe, risky, or dangerous. The runtime policy and sandbox decide whether a tool call can execute, needs approval, needs agent review, or must be denied. Your responsibility is to choose the right tool, supply honest arguments, and respect the runtime result.",
    "",
    "## Runtime Tool Mode",
    "",
    `- Tool profile: ${stringifyValue(input.toolProfile)}`,
    `- Policy mode: ${stringifyValue(input.policyMode)}`,
    `- Sandbox mode: ${stringifyValue(input.sandboxMode)}`,
    "",
    "## Available Tools",
    "",
    input.toolListAndSummaries?.trim() || renderDefaultToolSummaries(input.tools),
    "",
    "## Tool Schemas",
    "",
    input.toolSchemas?.trim() || renderDefaultToolSchemas(input.tools),
    "",
    "## Tool-Specific Guidance",
    "",
    input.toolSpecificGuidance?.trim() || "Follow each mounted tool's profile-aware description, schema, risk metadata, and runtime result.",
  ].join("\n");
}

export function createDeclaredRuntimeContextMaterial(input: DeclaredRuntimeContextInput = {}): PromptPackMaterialDraft {
  return {
    id: "runtime:declared-context",
    kind: "runtime",
    text: renderDeclaredRuntimeContext(input),
    source: "runtime.declaredRuntimeContext",
    sourceCategory: "declared-built-in",
    priority: 920,
    trusted: true,
    scope: "runtime.context",
    promptSegmentKind: "declaredRuntimeContext",
    metadata: {
      promptSegmentKind: "declaredRuntimeContext",
      generatedBy: "promptPack.core123",
    },
  };
}

export function createToolDeclarationsMaterial(input: ToolDeclarationsInput): PromptPackMaterialDraft {
  return {
    id: "runtime:tool-declarations",
    kind: "tool-summary",
    text: renderToolDeclarations(input),
    source: "runtime.toolDeclarations",
    sourceCategory: "declared-built-in",
    priority: 96,
    trusted: true,
    scope: "runtime.toolCalling",
    promptSegmentKind: "toolDeclarations",
    metadata: {
      promptSegmentKind: "toolDeclarations",
      toolMaterialType: "policy",
      generatedBy: "promptPack.core123",
      mountedToolCount: input.tools.length,
      ...(input.toolProfile === undefined ? {} : { toolProfile: input.toolProfile }),
      ...(input.policyMode === undefined ? {} : { policyMode: input.policyMode }),
      ...(input.sandboxMode === undefined ? {} : { sandboxMode: input.sandboxMode }),
    },
  };
}
