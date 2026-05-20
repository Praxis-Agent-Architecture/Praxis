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
} from "../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";

const skillBaseSharedRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(skillBaseSharedRoot, "../../../../..");

export type SkillBasePracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type SkillBasePracticeSource = {
  kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
  label: string;
  path?: string;
};

export type SkillBasePracticeSelection<Name extends string = SkillBasePracticeProviderName> = {
  providerName: Name;
  sourceLabel: string;
  sourceKind?: string;
  sourcePath?: string;
  directCliSupport: boolean;
  sideEffectPolicy?: string;
  notes?: readonly string[];
};

export type SkillToolAuditEvent = {
  type: string;
  toolId: string;
  invocationId: string;
  dryRun: boolean;
  targetRef?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type SkillToolFailure<Code extends string = string> = {
  ok: false;
  toolId: string;
  error: {
    code: Code;
    message: string;
    boundary: string;
    safeForRuntimeInspection: true;
    internalDetailExposed: false;
    publicSafe: true;
  };
  audit: readonly SkillToolAuditEvent[];
  events: readonly string[];
};

export type SkillToolSuccess<Output> = {
  ok: true;
  toolId: string;
  output: Output;
  audit: readonly SkillToolAuditEvent[];
  events: readonly string[];
};

export type SkillToolResult<Output, Code extends string = string> =
  | SkillToolSuccess<Output>
  | SkillToolFailure<Code>;

export type SkillBaseToolDefinitionOptions<Input, Output> = {
  toolId: string;
  title: string;
  description: string;
  summary: string;
  riskLevel?: BaseToolRiskLevel;
  permissionHints: readonly string[];
  dependencies: readonly BaseToolDependencyDeclaration[];
  inputSchema?: BaseToolSchemaLike;
  outputSchema?: BaseToolSchemaLike;
  storagePolicy?: BaseToolDefinition["storagePolicy"];
  metadata?: Readonly<Record<string, unknown>>;
};

export function skillBaseToolSkillDocPath(toolId: string): string {
  return path
    .join(repoRoot, "src", "storagePool", "baseToolStorage", "skillBase", toolId, `${toolId}.md`)
    .split(path.sep)
    .join("/");
}

export function skillBaseToolSourcePath(toolId: string): string {
  return path
    .join(
      repoRoot,
      "src",
      "agentCore",
      "agent_executionEngine",
      "basic_toolLayer",
      "baseTools",
      "skillBase",
      `${toolId}.ts`,
    )
    .split(path.sep)
    .join("/");
}

export function skillBaseToolStoragePracticePath(toolId: string): string {
  return path
    .join(repoRoot, "src", "storagePool", "baseToolStorage", "skillBase", toolId, "bestPractice.ts")
    .split(path.sep)
    .join("/");
}

export function jsonSchema(name: string, schema: unknown): BaseToolSchemaLike {
  return { kind: "json-schema", name, schema };
}

export function createSkillBaseToolDefinition<Input, Output>(
  options: SkillBaseToolDefinitionOptions<Input, Output>,
): BaseToolDefinition<Input, Output> {
  return {
    toolId: options.toolId,
    source: "builtin",
    family: "skill",
    group: "(flat)",
    title: options.title,
    description: options.description,
    toolSkill: {
      docPath: skillBaseToolSkillDocPath(options.toolId),
      summary: options.summary,
      riskLevel: options.riskLevel ?? "normal",
    },
    inputSchema:
      options.inputSchema ?? jsonSchema(`${options.toolId}.input`, { type: "object", additionalProperties: true }),
    outputSchema:
      options.outputSchema ?? jsonSchema(`${options.toolId}.output`, { type: "object", additionalProperties: true }),
    riskLevel: options.riskLevel ?? "normal",
    permissionHints: [...options.permissionHints],
    dependencies: options.dependencies,
    storagePolicy:
      options.storagePolicy ?? {
        storesMaterial: true,
        storesResult: true,
        storesAudit: true,
        reusable: true,
      },
    sourcePath: skillBaseToolSourcePath(options.toolId),
    metadata: {
      storagePracticePath: skillBaseToolStoragePracticePath(options.toolId),
      ...(options.metadata ?? {}),
    },
  };
}

export function buildSkillBasePracticeAuditMetadata(
  selection: SkillBasePracticeSelection,
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

export function adaptSkillToolResultToInvokeResult<Output, Code extends string = string>(
  result: SkillToolResult<Output, Code>,
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

export function createSkillBaseCoreHandler<Input, Output, Code extends string = string>(
  definition: BaseToolDefinition<Input, Output>,
  invokeCore: (request: BaseToolInvokeRequest<Input>) => Promise<SkillToolResult<Output, Code>>,
): BaseToolHandler<Input, Output> {
  return {
    definition,
    async invoke(request) {
      return adaptSkillToolResultToInvokeResult(await invokeCore(request));
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
