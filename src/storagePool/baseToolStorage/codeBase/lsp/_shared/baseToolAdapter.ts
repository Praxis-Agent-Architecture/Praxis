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
} from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { LspToolAuditEvent, LspToolResult } from "../code.lsp_locateDefinition/core.js";

const lspSharedRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(lspSharedRoot, "../../../../../../");

export type LspBestPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type LspBestPracticeSource = {
  kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
  label: string;
  path?: string;
};

export type LspBestPracticeMetadata<Name extends string = LspBestPracticeProviderName> = {
  providerName: Name;
  source: string | LspBestPracticeSource;
  directCliSupport: boolean;
  sideEffectPolicy?: "read-only" | "preview-only";
  notes?: readonly string[];
};

export type LspBestPracticeSelection<Name extends string = LspBestPracticeProviderName> = {
  providerName: Name;
  sourceLabel: string;
  sourceKind?: string;
  sourcePath?: string;
  directCliSupport: boolean;
  sideEffectPolicy?: string;
  notes: readonly string[];
};

export type LspBaseToolDefinitionOptions<Input, Output> = {
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

export function architectureRelativePath(absolutePath: string): string {
  return path.relative(repoRoot, absolutePath).split(path.sep).join("/");
}

export function lspToolSkillDocPath(toolId: string): string {
  return path
    .join(repoRoot, "src", "storagePool", "baseToolStorage", "codeBase", "lsp", toolId, `${toolId}.md`)
    .split(path.sep)
    .join("/");
}

export function lspToolSourcePath(toolId: string): string {
  return path
    .join(
      repoRoot,
      "src",
      "agentCore",
      "agent_executionEngine",
      "basic_toolLayer",
      "baseTools",
      "codeBase",
      "lsp",
      `${toolId}.ts`,
    )
    .split(path.sep)
    .join("/");
}

export function lspToolStoragePracticePath(toolId: string): string {
  return path
    .join(repoRoot, "src", "storagePool", "baseToolStorage", "codeBase", "lsp", toolId, "bestPractice.ts")
    .split(path.sep)
    .join("/");
}

export function jsonSchema(name: string, schema: unknown): BaseToolSchemaLike {
  return {
    kind: "json-schema",
    name,
    schema,
  };
}

export function normalizeLspDependencyDeclarations(
  dependencyIds: readonly string[],
  descriptions: Readonly<Record<string, string>> = {},
): readonly BaseToolDependencyDeclaration[] {
  return dependencyIds.map((dependencyId) => ({
    dependencyId,
    kind:
      dependencyId.includes("workspace.read")
        ? "permission"
        : dependencyId.includes("stdioJsonRpc")
          ? "runtime"
          : dependencyId.includes("lsp.server")
            ? "runtime"
            : dependencyId.includes("workspace.edit")
              ? "permission"
              : "runtime",
    required: true,
    description: descriptions[dependencyId] ?? dependencyId,
  }));
}

export const lspCommonSchemaFragments = {
  lspPosition: {
    type: "object",
    additionalProperties: false,
    required: ["line", "character"],
    properties: {
      line: { type: "integer", minimum: 0 },
      character: { type: "integer", minimum: 0 },
    },
  },
  lspRange: {
    type: "object",
    additionalProperties: false,
    required: ["start", "end"],
    properties: {
      start: {
        type: "object",
        additionalProperties: false,
        required: ["line", "character"],
        properties: {
          line: { type: "integer", minimum: 0 },
          character: { type: "integer", minimum: 0 },
        },
      },
      end: {
        type: "object",
        additionalProperties: false,
        required: ["line", "character"],
        properties: {
          line: { type: "integer", minimum: 0 },
          character: { type: "integer", minimum: 0 },
        },
      },
    },
  },
  invocationContext: {
    type: "object",
    additionalProperties: true,
    properties: {
      invocationId: { type: "string" },
      workspaceRoot: { type: "string" },
      dryRun: { type: "boolean" },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  },
} as const;

export function createLspBaseToolDefinition<Input, Output>(
  options: LspBaseToolDefinitionOptions<Input, Output>,
): BaseToolDefinition<Input, Output> {
  return {
    toolId: options.toolId,
    source: "builtin",
    family: "code",
    group: "lsp",
    title: options.title,
    description: options.description,
    toolSkill: {
      docPath: lspToolSkillDocPath(options.toolId),
      summary: options.summary,
      riskLevel: options.riskLevel ?? "normal",
    },
    inputSchema: options.inputSchema ?? jsonSchema(`${options.toolId}.input`, { type: "object", additionalProperties: true }),
    outputSchema: options.outputSchema ?? jsonSchema(`${options.toolId}.output`, { type: "object", additionalProperties: true }),
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
    sourcePath: lspToolSourcePath(options.toolId),
    metadata: {
      storagePracticePath: lspToolStoragePracticePath(options.toolId),
      ...(options.metadata ?? {}),
    },
  };
}

function normalizePracticeSource(
  practice: LspBestPracticeMetadata,
): Pick<LspBestPracticeSelection, "sourceLabel" | "sourceKind" | "sourcePath"> {
  if (typeof practice.source === "string") {
    return {
      sourceLabel: practice.source,
      sourceKind: undefined,
      sourcePath: undefined,
    };
  }

  return {
    sourceLabel: practice.source.label,
    sourceKind: practice.source.kind,
    sourcePath: practice.source.path,
  };
}

export function orderLspPractices<Name extends string>(
  practices: readonly LspBestPracticeMetadata<Name>[],
  preferredProvider: Name | undefined,
): readonly LspBestPracticeMetadata<Name>[] {
  if (preferredProvider === undefined) {
    return practices;
  }

  return [
    ...practices.filter((practice) => practice.providerName === preferredProvider),
    ...practices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectLspPractice<Name extends LspBestPracticeProviderName>(
  practices: readonly LspBestPracticeMetadata<Name>[],
  preferredProvider: Name | undefined,
): LspBestPracticeSelection<Name> {
  const selected = orderLspPractices(practices, preferredProvider)[0];
  if (selected === undefined) {
    return {
      providerName: "praxis-native" as Name,
      sourceLabel: "Praxis native runtime fallback",
      sourceKind: "praxis-native",
      directCliSupport: false,
      sideEffectPolicy: "read-only",
      notes: ["No provider practice metadata was registered for this LSP tool."],
    };
  }

  return {
    providerName: selected.providerName,
    ...normalizePracticeSource(selected),
    directCliSupport: selected.directCliSupport,
    sideEffectPolicy: selected.sideEffectPolicy,
    notes: selected.notes ?? [],
  };
}

export function buildPracticeAuditMetadata(selection: LspBestPracticeSelection): Readonly<Record<string, unknown>> {
  return {
    selectedPractice: selection.providerName,
    selectedPracticeSource: selection.sourceLabel,
    selectedPracticeSourceKind: selection.sourceKind,
    selectedPracticeSourcePath: selection.sourcePath,
    directCliSupport: selection.directCliSupport,
    sideEffectPolicy: selection.sideEffectPolicy,
  };
}

export function adaptLspToolResultToInvokeResult<Output>(result: LspToolResult<Output>): BaseToolInvokeResult<Output> {
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

export function createLspCoreHandler<Input, Output>(
  definition: BaseToolDefinition<Input, Output>,
  invokeCore: (request: BaseToolInvokeRequest<Input>) => Promise<LspToolResult<Output>>,
): BaseToolHandler<Input, Output> {
  return {
    definition,
    async invoke(request) {
      return adaptLspToolResultToInvokeResult(await invokeCore(request));
    },
  };
}

export function injectInvocationAudit(
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

export function normalizeDocumentUriToFilePath(documentUri: string, workspaceRoot: string | undefined): string {
  const trimmed = documentUri.trim();
  if (trimmed.startsWith("file://")) {
    return fileURLToPath(trimmed);
  }

  if (path.isAbsolute(trimmed)) {
    return trimmed;
  }

  return path.resolve(workspaceRoot?.trim() || process.cwd(), trimmed);
}

export function attachAuditMetadata(
  audit: readonly LspToolAuditEvent[] | undefined,
  metadata: Readonly<Record<string, unknown>>,
): readonly LspToolAuditEvent[] {
  return (audit ?? []).map((event) => ({
    ...event,
    metadata: {
      ...(event.metadata ?? {}),
      ...metadata,
    },
  }));
}

export function baseToolInvokeSuccess<Output>(
  toolId: string,
  output: Output,
  events: readonly string[],
  metadata?: Readonly<Record<string, unknown>>,
): BaseToolInvokeResult<Output> {
  return {
    ok: true,
    toolId,
    output,
    events,
    metadata,
  };
}

export function baseToolInvokeFailure(
  toolId: string,
  code: string,
  message: string,
  events: readonly string[],
): BaseToolInvokeResult<never> {
  return {
    ok: false,
    toolId,
    error: {
      code,
      message,
      publicSafe: true,
    },
    events,
  };
}

export function preferAnthropicExecutor<Name extends LspBestPracticeProviderName>(
  executor: BaseToolExecutorPort | undefined,
  hasMethod: (executor: BaseToolExecutorPort) => boolean,
  practices: readonly LspBestPracticeMetadata<Name>[],
  preferredProvider: Name | undefined,
): LspBestPracticeSelection<Name> {
  if (executor !== undefined && hasMethod(executor)) {
    const anthropic = practices.find((practice) => practice.providerName === ("anthropic" as Name));
    if (anthropic !== undefined && (preferredProvider === undefined || preferredProvider === anthropic.providerName)) {
      return {
        providerName: anthropic.providerName,
        ...normalizePracticeSource(anthropic),
        directCliSupport: anthropic.directCliSupport,
        sideEffectPolicy: anthropic.sideEffectPolicy,
        notes: anthropic.notes ?? [],
      };
    }
  }

  return selectLspPractice(practices, preferredProvider);
}
