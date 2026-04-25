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
import type { ShellToolAuditEvent, ShellToolResult } from "../shellExecution/shell.commandExecution/core.js";

const shellSharedRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(shellSharedRoot, "../../../../../");

export type ShellBestPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type ShellBestPracticeSource = {
  kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
  label: string;
  path?: string;
};

export type ShellBestPracticeMetadata<Name extends string = ShellBestPracticeProviderName> = {
  providerName: Name;
  source: string | ShellBestPracticeSource;
  directCliSupport: boolean;
  sideEffectPolicy?: "runtime-governed";
  notes?: readonly string[];
};

export type ShellBestPracticeSelection<Name extends string = ShellBestPracticeProviderName> = {
  providerName: Name;
  sourceLabel: string;
  sourceKind?: string;
  sourcePath?: string;
  directCliSupport: boolean;
  sideEffectPolicy?: string;
  notes: readonly string[];
};

export type ShellBaseToolDefinitionOptions<Input, Output> = {
  toolId: string;
  title: string;
  description: string;
  summary: string;
  storageGroup?: string;
  riskLevel?: BaseToolRiskLevel;
  permissionHints: readonly string[];
  dependencies: readonly BaseToolDependencyDeclaration[];
  inputSchema?: BaseToolSchemaLike;
  outputSchema?: BaseToolSchemaLike;
  storagePolicy?: BaseToolDefinition["storagePolicy"];
  metadata?: Readonly<Record<string, unknown>>;
};

export function shellToolSkillDocPath(toolId: string, storageGroup = "shellExecution"): string {
  return path
    .join(repoRoot, "src", "storagePool", "baseToolStorage", "shellBase", storageGroup, toolId, `${toolId}.md`)
    .split(path.sep)
    .join("/");
}

export function shellToolSourcePath(toolId: string, storageGroup = "shellExecution"): string {
  return path
    .join(
      repoRoot,
      "src",
      "agentCore",
      "agent_executionEngine",
      "basic_toolLayer",
      "baseTools",
      "shellBase",
      storageGroup,
      `${toolId}.ts`,
    )
    .split(path.sep)
    .join("/");
}

export function shellToolStoragePracticePath(toolId: string, storageGroup = "shellExecution"): string {
  return path
    .join(repoRoot, "src", "storagePool", "baseToolStorage", "shellBase", storageGroup, toolId, "bestPractice.ts")
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

export function createShellBaseToolDefinition<Input, Output>(
  options: ShellBaseToolDefinitionOptions<Input, Output>,
): BaseToolDefinition<Input, Output> {
  const storageGroup = options.storageGroup ?? "shellExecution";
  return {
    toolId: options.toolId,
    source: "builtin",
    family: "shell",
    title: options.title,
    description: options.description,
    toolSkill: {
      docPath: shellToolSkillDocPath(options.toolId, storageGroup),
      summary: options.summary,
      riskLevel: options.riskLevel ?? "risky",
    },
    inputSchema: options.inputSchema ?? jsonSchema(`${options.toolId}.input`, { type: "object", additionalProperties: true }),
    outputSchema: options.outputSchema ?? jsonSchema(`${options.toolId}.output`, { type: "object", additionalProperties: true }),
    riskLevel: options.riskLevel ?? "risky",
    permissionHints: [...options.permissionHints],
    dependencies: options.dependencies,
    storagePolicy:
      options.storagePolicy ?? {
        storesMaterial: true,
        storesResult: true,
        storesAudit: true,
        reusable: false,
      },
    sourcePath: shellToolSourcePath(options.toolId, storageGroup),
    metadata: {
      storagePracticePath: shellToolStoragePracticePath(options.toolId, storageGroup),
      ...(options.metadata ?? {}),
    },
  };
}

function normalizePracticeSource(
  practice: ShellBestPracticeMetadata,
): Pick<ShellBestPracticeSelection, "sourceLabel" | "sourceKind" | "sourcePath"> {
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

export function orderShellPractices<Name extends string>(
  practices: readonly ShellBestPracticeMetadata<Name>[],
  preferredProvider: Name | undefined,
): readonly ShellBestPracticeMetadata<Name>[] {
  if (preferredProvider === undefined) {
    return practices;
  }

  return [
    ...practices.filter((practice) => practice.providerName === preferredProvider),
    ...practices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectShellPractice<Name extends ShellBestPracticeProviderName>(
  practices: readonly ShellBestPracticeMetadata<Name>[],
  preferredProvider: Name | undefined,
): ShellBestPracticeSelection<Name> {
  const selected = orderShellPractices(practices, preferredProvider)[0];
  if (selected === undefined) {
    return {
      providerName: "praxis-native" as Name,
      sourceLabel: "Praxis native runtime fallback",
      sourceKind: "praxis-native",
      directCliSupport: false,
      sideEffectPolicy: "runtime-governed",
      notes: ["No provider practice metadata was registered for this shell tool."],
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

export function buildShellPracticeAuditMetadata(selection: ShellBestPracticeSelection): Readonly<Record<string, unknown>> {
  return {
    selectedPractice: selection.providerName,
    selectedPracticeSource: selection.sourceLabel,
    selectedPracticeSourceKind: selection.sourceKind,
    selectedPracticeSourcePath: selection.sourcePath,
    directCliSupport: selection.directCliSupport,
    sideEffectPolicy: selection.sideEffectPolicy,
  };
}

export function adaptShellToolResultToInvokeResult<Output>(result: ShellToolResult<Output>): BaseToolInvokeResult<Output> {
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

export function createShellCoreHandler<Input, Output>(
  definition: BaseToolDefinition<Input, Output>,
  invokeCore: (request: BaseToolInvokeRequest<Input>) => Promise<ShellToolResult<Output>>,
): BaseToolHandler<Input, Output> {
  return {
    definition,
    async invoke(request) {
      return adaptShellToolResultToInvokeResult(await invokeCore(request));
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

export function attachShellAuditMetadata(
  audit: readonly ShellToolAuditEvent[] | undefined,
  metadata: Readonly<Record<string, unknown>>,
): readonly ShellToolAuditEvent[] {
  return (audit ?? []).map((event) => ({
    ...event,
    metadata: {
      ...(event.metadata ?? {}),
      ...metadata,
    },
  }));
}
