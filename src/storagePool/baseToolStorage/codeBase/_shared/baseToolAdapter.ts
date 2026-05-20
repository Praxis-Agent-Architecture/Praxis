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

const codeBaseSharedRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(codeBaseSharedRoot, "../../../../..");

export type CodeBasePracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type CodeBasePracticeSource = {
  kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
  label: string;
  path?: string;
};

export type CodeBasePracticeMetadata<Name extends string = CodeBasePracticeProviderName> = {
  providerName: Name;
  source: CodeBasePracticeSource;
  directCliSupport: boolean;
  sideEffectPolicy?: "read-only" | "runtime-governed" | "preview-only";
  notes?: readonly string[];
};

export type CodeBasePracticeSelection<Name extends string = CodeBasePracticeProviderName> = {
  providerName: Name;
  sourceLabel: string;
  sourceKind?: string;
  sourcePath?: string;
  directCliSupport: boolean;
  sideEffectPolicy?: string;
  notes?: readonly string[];
};

export type CodeToolAuditEvent = {
  type: string;
  toolId: string;
  invocationId: string;
  dryRun: boolean;
  metadata?: Readonly<Record<string, unknown>>;
};

export type CodeToolFailure<Code extends string = string> = {
  ok: false;
  toolId: string;
  error: {
    code: Code;
    message: string;
    boundary: string;
    safeForRuntimeInspection: true;
    internalDetailExposed: false;
  };
  audit: readonly CodeToolAuditEvent[];
  events: readonly string[];
};

export type CodeToolSuccess<Output> = {
  ok: true;
  toolId: string;
  output: Output;
  audit: readonly CodeToolAuditEvent[];
  events: readonly string[];
};

export type CodeToolResult<Output, Code extends string = string> =
  | CodeToolSuccess<Output>
  | CodeToolFailure<Code>;

export type CodeBaseToolDefinitionOptions<Input, Output> = {
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

export function codeBaseToolSkillDocPath(toolId: string, storageGroup: string): string {
  return path
    .join(repoRoot, "src", "storagePool", "baseToolStorage", "codeBase", storageGroup, toolId, `${toolId}.md`)
    .split(path.sep)
    .join("/");
}

export function codeBaseToolSourcePath(toolId: string, storageGroup: string): string {
  return path
    .join(
      repoRoot,
      "src",
      "agentCore",
      "agent_executionEngine",
      "basic_toolLayer",
      "baseTools",
      "codeBase",
      storageGroup,
      `${toolId}.ts`,
    )
    .split(path.sep)
    .join("/");
}

export function codeBaseToolStoragePracticePath(toolId: string, storageGroup: string): string {
  return path
    .join(repoRoot, "src", "storagePool", "baseToolStorage", "codeBase", storageGroup, toolId, "bestPractice.ts")
    .split(path.sep)
    .join("/");
}

export function jsonSchema(name: string, schema: unknown): BaseToolSchemaLike {
  return { kind: "json-schema", name, schema };
}

export function createCodeBaseToolDefinition<Input, Output>(
  options: CodeBaseToolDefinitionOptions<Input, Output>,
): BaseToolDefinition<Input, Output> {
  return {
    toolId: options.toolId,
    source: "builtin",
    family: "code",
    group: options.storageGroup,
    title: options.title,
    description: options.description,
    toolSkill: {
      docPath: codeBaseToolSkillDocPath(options.toolId, options.storageGroup),
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
    sourcePath: codeBaseToolSourcePath(options.toolId, options.storageGroup),
    metadata: {
      storagePracticePath: codeBaseToolStoragePracticePath(options.toolId, options.storageGroup),
      ...(options.metadata ?? {}),
    },
  };
}

export function buildCodeBasePracticeAuditMetadata(
  selection: CodeBasePracticeSelection,
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

export function adaptCodeToolResultToInvokeResult<Output, Code extends string = string>(
  result: CodeToolResult<Output, Code>,
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

export function createCodeBaseCoreHandler<Input, Output, Code extends string = string>(
  definition: BaseToolDefinition<Input, Output>,
  invokeCore: (request: BaseToolInvokeRequest<Input>) => Promise<CodeToolResult<Output, Code>>,
): BaseToolHandler<Input, Output> {
  return {
    definition,
    async invoke(request) {
      return adaptCodeToolResultToInvokeResult(await invokeCore(request));
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
