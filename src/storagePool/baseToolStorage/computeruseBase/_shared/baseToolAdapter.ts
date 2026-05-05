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

const computerUseSharedRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(computerUseSharedRoot, "../../../../../");

export type ComputerUseBestPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type ComputerUseBestPracticeSource = {
  kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
  label: string;
  path?: string;
};

export type ComputerUseBestPracticeMetadata<Name extends string = ComputerUseBestPracticeProviderName> = {
  providerName: Name;
  source: ComputerUseBestPracticeSource;
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-governed";
  notes: readonly string[];
};

export type ComputerUseProviderPracticeMetadata<Name extends string, Provider, Dependencies> =
  ComputerUseBestPracticeMetadata<Name> & {
    createProvider(dependencies: Dependencies): Provider | undefined;
  };

export type ComputerUseProviderPracticeSelection<Name extends string, Provider, Practice> = {
  providerName: Name;
  practice: Practice;
  provider?: Provider;
};

export type ComputerUseBaseToolDefinitionOptions<Input, Output> = {
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

export type ComputerUseCoreResult<Output> =
  | {
      ok: true;
      toolId: string;
      output: Output;
      events: readonly string[];
      audit?: unknown;
    }
  | {
      ok: false;
      toolId: string;
      error: {
        code: string;
        message: string;
      };
      events: readonly string[];
    };

export function jsonSchema(name: string, schema: unknown): BaseToolSchemaLike {
  return { kind: "json-schema", name, schema };
}

export function computerUseToolSkillDocPath(toolId: string, storageGroup: string): string {
  return path
    .join(repoRoot, "src", "storagePool", "baseToolStorage", "computeruseBase", storageGroup, toolId, `${toolId}.md`)
    .split(path.sep)
    .join("/");
}

export function computerUseToolSourcePath(toolId: string, storageGroup: string): string {
  return path
    .join(
      repoRoot,
      "src",
      "agentCore",
      "agent_executionEngine",
      "basic_toolLayer",
      "baseTools",
      "computeruseBase",
      storageGroup,
      `${toolId}.ts`,
    )
    .split(path.sep)
    .join("/");
}

export function computerUseToolStoragePracticePath(toolId: string, storageGroup: string): string {
  return path
    .join(repoRoot, "src", "storagePool", "baseToolStorage", "computeruseBase", storageGroup, toolId, "bestPractice.ts")
    .split(path.sep)
    .join("/");
}

export function createComputerUseBaseToolDefinition<Input, Output>(
  options: ComputerUseBaseToolDefinitionOptions<Input, Output>,
): BaseToolDefinition<Input, Output> {
  return {
    toolId: options.toolId,
    source: "builtin",
    family: "computeruse",
    group: options.storageGroup,
    title: options.title,
    description: options.description,
    toolSkill: {
      docPath: computerUseToolSkillDocPath(options.toolId, options.storageGroup),
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
    sourcePath: computerUseToolSourcePath(options.toolId, options.storageGroup),
    metadata: {
      storagePracticePath: computerUseToolStoragePracticePath(options.toolId, options.storageGroup),
      ...(options.metadata ?? {}),
    },
  };
}

export function orderComputerUsePractices<Name extends string, Practice extends ComputerUseBestPracticeMetadata<Name>>(
  practices: readonly Practice[],
  preferredProvider: Name | undefined,
): readonly Practice[] {
  if (preferredProvider === undefined) return practices;
  return [
    ...practices.filter((practice) => practice.providerName === preferredProvider),
    ...practices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectComputerUseProviderPractice<Name extends string, Provider, Dependencies>(
  practices: readonly ComputerUseProviderPracticeMetadata<Name, Provider, Dependencies>[],
  dependencies: Dependencies & { preferredProvider?: Name },
  fallbackPractice: ComputerUseProviderPracticeMetadata<Name, Provider, Dependencies>,
): ComputerUseProviderPracticeSelection<Name, Provider, ComputerUseProviderPracticeMetadata<Name, Provider, Dependencies>> {
  const ordered = orderComputerUsePractices(practices, dependencies.preferredProvider);
  for (const practice of ordered) {
    const provider = practice.createProvider(dependencies);
    if (provider !== undefined) {
      return { providerName: practice.providerName, practice, provider };
    }
  }
  return {
    providerName: fallbackPractice.providerName,
    practice: fallbackPractice,
    provider: fallbackPractice.createProvider(dependencies),
  };
}

export function buildComputerUsePracticeAuditMetadata(
  selection: Pick<
    ComputerUseProviderPracticeSelection<string, unknown, ComputerUseBestPracticeMetadata<string>>,
    "providerName" | "practice"
  >,
): Readonly<Record<string, unknown>> {
  return {
    selectedPractice: selection.providerName,
    selectedPracticeSource: selection.practice.source.label,
    selectedPracticeSourceKind: selection.practice.source.kind,
    selectedPracticeSourcePath: selection.practice.source.path,
    directCliSupport: selection.practice.directCliSupport,
    sideEffectPolicy: selection.practice.sideEffectPolicy,
    notes: selection.practice.notes,
  };
}

export function injectRuntimeInvocationMetadata(
  base: Readonly<Record<string, unknown>>,
  existing: Readonly<Record<string, unknown>> | undefined,
  request: Pick<BaseToolInvokeRequest, "runtimeId" | "sessionId" | "toolCallId" | "metadata">,
): Readonly<Record<string, unknown>> {
  return {
    ...base,
    ...(existing ?? {}),
    ...(request.metadata ?? {}),
    runtimeId: request.runtimeId,
    sessionId: request.sessionId,
    toolCallId: request.toolCallId,
  };
}

export function adaptComputerUseCoreResult<Output>(
  result: ComputerUseCoreResult<Output>,
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
    metadata: result.audit === undefined ? undefined : { audit: result.audit },
  };
}

export function createComputerUseCoreHandler<Input, Output>(
  definition: BaseToolDefinition<Input, Output>,
  invokeCore: (request: BaseToolInvokeRequest<Input>) => Promise<ComputerUseCoreResult<Output>> | ComputerUseCoreResult<Output>,
): BaseToolHandler<Input, Output> {
  return {
    definition,
    async invoke(request) {
      return adaptComputerUseCoreResult(await invokeCore(request));
    },
  };
}
