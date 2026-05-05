import path from "node:path";
import { fileURLToPath } from "node:url";

import type {
  BaseToolDefinition,
  BaseToolDependencyDeclaration,
  BaseToolHandler,
  BaseToolInvokeRequest,
  BaseToolInvokeResult,
  BaseToolRiskLevel,
  BaseToolSchemaLike,
} from "../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";

const mcpBaseSharedRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(mcpBaseSharedRoot, "../../../../..");

export type McpBasePracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type McpBasePracticeSource = {
  kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
  label: string;
  path?: string;
};

export type McpBasePracticeMetadata<Name extends string = McpBasePracticeProviderName> = {
  providerName: Name;
  source: McpBasePracticeSource;
  directCliSupport: boolean;
  sideEffectPolicy?: "runtime-governed" | "runtime-owned-client" | "preview-only";
  notes?: readonly string[];
};

export type McpBasePracticeSelection<Name extends string = McpBasePracticeProviderName> = {
  providerName: Name;
  sourceLabel: string;
  sourceKind?: string;
  sourcePath?: string;
  directCliSupport: boolean;
  sideEffectPolicy?: string;
  notes?: readonly string[];
};

export type McpToolAuditEvent = {
  type: string;
  toolId: string;
  invocationId: string;
  dryRun: boolean;
  metadata?: Readonly<Record<string, unknown>>;
};

export type McpToolFailure<Code extends string = string> = {
  ok: false;
  toolId: string;
  error: {
    code: Code;
    message: string;
    boundary: string;
    publicSafe: true;
    safeForRuntimeInspection: true;
    internalDetailExposed: false;
  };
  audit: readonly McpToolAuditEvent[];
  events: readonly string[];
};

export type McpToolSuccess<Output> = {
  ok: true;
  toolId: string;
  output: Output;
  audit: readonly McpToolAuditEvent[];
  events: readonly string[];
};

export type McpToolResult<Output, Code extends string = string> =
  | McpToolSuccess<Output>
  | McpToolFailure<Code>;

export type McpBaseToolDefinitionOptions<Input, Output> = {
  toolId: string;
  title: string;
  description: string;
  summary: string;
  storageGroup: string;
  riskLevel?: BaseToolRiskLevel;
  permissionHints: readonly string[];
  dependencies: readonly BaseToolDependencyDeclaration[];
  inputSchema?: BaseToolSchemaLike;
  outputSchema?: BaseToolSchemaLike;
  storagePolicy?: BaseToolDefinition["storagePolicy"];
  metadata?: Readonly<Record<string, unknown>>;
};

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readStringArray(value: unknown): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((item): item is string => typeof item === "string");
  return strings.length === value.length ? strings : undefined;
}

export function cleanStringList(value: unknown): readonly string[] | undefined {
  const strings = readStringArray(value);
  if (strings === undefined) return undefined;
  return [...new Set(strings.map((item) => item.trim()).filter(Boolean))];
}

export function optionalTrimmedString(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function guardAccepted(guard: unknown): boolean {
  if (!isJsonObject(guard)) return false;
  return guard.accepted === true || guard.allowed === true;
}

export function mcpBaseToolSkillDocPath(toolId: string, storageGroup: string): string {
  return path
    .join(repoRoot, "src", "storagePool", "baseToolStorage", "mcpBase", storageGroup, toolId, `${toolId}.md`)
    .split(path.sep)
    .join("/");
}

export function mcpBaseToolSourcePath(toolId: string, storageGroup: string): string {
  return path
    .join(
      repoRoot,
      "src",
      "agentCore",
      "agent_executionEngine",
      "basic_toolLayer",
      "baseTools",
      "mcpBase",
      storageGroup,
      `${toolId}.ts`,
    )
    .split(path.sep)
    .join("/");
}

export function mcpBaseToolStoragePracticePath(toolId: string, storageGroup: string): string {
  return path
    .join(repoRoot, "src", "storagePool", "baseToolStorage", "mcpBase", storageGroup, toolId, "bestPractice.ts")
    .split(path.sep)
    .join("/");
}

export function jsonSchema(name: string, schema: unknown): BaseToolSchemaLike {
  return { kind: "json-schema", name, schema };
}

export function createMcpBaseToolDefinition<Input, Output>(
  options: McpBaseToolDefinitionOptions<Input, Output>,
): BaseToolDefinition<Input, Output> {
  return {
    toolId: options.toolId,
    source: "builtin",
    family: "mcp",
    group: options.storageGroup,
    title: options.title,
    description: options.description,
    toolSkill: {
      docPath: mcpBaseToolSkillDocPath(options.toolId, options.storageGroup),
      summary: options.summary,
      riskLevel: options.riskLevel ?? "risky",
    },
    inputSchema:
      options.inputSchema ?? jsonSchema(`${options.toolId}.input`, { type: "object", additionalProperties: true }),
    outputSchema:
      options.outputSchema ?? jsonSchema(`${options.toolId}.output`, { type: "object", additionalProperties: true }),
    riskLevel: options.riskLevel ?? "risky",
    permissionHints: [...options.permissionHints],
    dependencies: options.dependencies,
    storagePolicy:
      options.storagePolicy ?? {
        storesMaterial: false,
        storesResult: true,
        storesAudit: true,
        reusable: true,
      },
    sourcePath: mcpBaseToolSourcePath(options.toolId, options.storageGroup),
    metadata: {
      storagePracticePath: mcpBaseToolStoragePracticePath(options.toolId, options.storageGroup),
      runtimeOwnsMcpClient: true,
      ...(options.metadata ?? {}),
    },
  };
}

export function buildMcpPracticeAuditMetadata(
  selection: McpBasePracticeSelection,
): Readonly<Record<string, unknown>> {
  return {
    selectedPractice: selection.providerName,
    selectedPracticeSource: selection.sourceLabel,
    selectedPracticeSourceKind: selection.sourceKind,
    selectedPracticeSourcePath: selection.sourcePath,
    directCliSupport: selection.directCliSupport,
    sideEffectPolicy: selection.sideEffectPolicy,
    notes: selection.notes ?? [],
  };
}

export function adaptMcpToolResultToInvokeResult<Output, Code extends string = string>(
  result: McpToolResult<Output, Code>,
): BaseToolInvokeResult<Output> {
  if (!result.ok) {
    return {
      ok: false,
      toolId: result.toolId,
      error: {
        code: result.error.code,
        message: result.error.message,
        publicSafe: true,
      },
      events: result.events,
    };
  }

  return {
    ok: true,
    toolId: result.toolId,
    output: result.output,
    events: result.events,
    metadata: {
      audit: result.audit,
    },
  };
}

export function createMcpCoreHandler<Input, Output, Code extends string = string>(
  definition: BaseToolDefinition<Input, Output>,
  invokeCore: (request: BaseToolInvokeRequest<Input>) => Promise<McpToolResult<Output, Code>>,
): BaseToolHandler<Input, Output> {
  return {
    definition,
    async invoke(request) {
      return adaptMcpToolResultToInvokeResult(await invokeCore(request));
    },
  };
}

export function injectRuntimeInvocationMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined,
  auditMetadata: Readonly<Record<string, unknown>> | undefined,
  request: Pick<BaseToolInvokeRequest, "runtimeId" | "sessionId" | "toolCallId">,
): Readonly<Record<string, unknown>> {
  return {
    ...(auditMetadata ?? {}),
    runtimeId: request.runtimeId,
    sessionId: request.sessionId,
    toolCallId: request.toolCallId,
    ...(metadata ?? {}),
  };
}
