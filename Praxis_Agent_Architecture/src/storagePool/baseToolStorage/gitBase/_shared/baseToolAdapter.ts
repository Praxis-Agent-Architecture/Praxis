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

const gitBaseSharedRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(gitBaseSharedRoot, "../../../../..");

export type GitBasePracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type GitBasePracticeSource = {
  kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
  label: string;
  path?: string;
};

export type GitBasePracticeSelection<Name extends string = GitBasePracticeProviderName> = {
  providerName: Name;
  sourceLabel: string;
  sourceKind?: string;
  sourcePath?: string;
  directCliSupport: boolean;
  sideEffectPolicy?: string;
  notes?: readonly string[];
};

export type GitToolAuditEvent = {
  type: string;
  toolId: string;
  invocationId: string;
  dryRun: boolean;
  repositoryPath?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type GitToolFailure<Code extends string = string> = {
  ok: false;
  toolId: string;
  error: {
    code: Code;
    message: string;
    boundary: string;
    safeForRuntimeInspection: true;
    internalDetailExposed: false;
  };
  audit: readonly GitToolAuditEvent[];
  events: readonly string[];
};

export type GitToolSuccess<Output> = {
  ok: true;
  toolId: string;
  output: Output;
  audit: readonly GitToolAuditEvent[];
  events: readonly string[];
};

export type GitToolResult<Output, Code extends string = string> =
  | GitToolSuccess<Output>
  | GitToolFailure<Code>;

export type GitBaseToolDefinitionOptions<Input, Output> = {
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

export function gitBaseToolSkillDocPath(toolId: string, storageGroup: string): string {
  return path
    .join(repoRoot, "src", "storagePool", "baseToolStorage", "gitBase", storageGroup, toolId, `${toolId}.md`)
    .split(path.sep)
    .join("/");
}

export function gitBaseToolSourcePath(toolId: string, storageGroup: string): string {
  return path
    .join(
      repoRoot,
      "src",
      "agentCore",
      "agent_executionEngine",
      "basic_toolLayer",
      "baseTools",
      "gitBase",
      storageGroup,
      `${toolId}.ts`,
    )
    .split(path.sep)
    .join("/");
}

export function gitBaseToolStoragePracticePath(toolId: string, storageGroup: string): string {
  return path
    .join(repoRoot, "src", "storagePool", "baseToolStorage", "gitBase", storageGroup, toolId, "bestPractice.ts")
    .split(path.sep)
    .join("/");
}

export function jsonSchema(name: string, schema: unknown): BaseToolSchemaLike {
  return { kind: "json-schema", name, schema };
}

export function createGitBaseToolDefinition<Input, Output>(
  options: GitBaseToolDefinitionOptions<Input, Output>,
): BaseToolDefinition<Input, Output> {
  return {
    toolId: options.toolId,
    source: "builtin",
    family: "git",
    title: options.title,
    description: options.description,
    toolSkill: {
      docPath: gitBaseToolSkillDocPath(options.toolId, options.storageGroup),
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
    sourcePath: gitBaseToolSourcePath(options.toolId, options.storageGroup),
    metadata: {
      storagePracticePath: gitBaseToolStoragePracticePath(options.toolId, options.storageGroup),
      ...(options.metadata ?? {}),
    },
  };
}

export function buildGitBasePracticeAuditMetadata(
  selection: GitBasePracticeSelection,
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

export function adaptGitToolResultToInvokeResult<Output, Code extends string = string>(
  result: GitToolResult<Output, Code>,
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

export function createGitBaseCoreHandler<Input, Output, Code extends string = string>(
  definition: BaseToolDefinition<Input, Output>,
  invokeCore: (request: BaseToolInvokeRequest<Input>) => Promise<GitToolResult<Output, Code>>,
): BaseToolHandler<Input, Output> {
  return {
    definition,
    async invoke(request) {
      return adaptGitToolResultToInvokeResult(await invokeCore(request));
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
