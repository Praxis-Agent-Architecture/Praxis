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

const omniSharedRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(omniSharedRoot, "../../../../../");

export type OmniBestPracticeProviderName = "anthropic" | "openai" | "deepmind" | "local-wasm" | "external" | "praxis-native";

export type OmniBestPracticeSource = {
  kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
  label: string;
  path?: string;
};

export type OmniBestPracticeMetadata<Name extends string = OmniBestPracticeProviderName> = {
  providerName: Name;
  source: OmniBestPracticeSource;
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-governed";
  notes: readonly string[];
};

export type OmniProviderPracticeMetadata<Name extends string, Provider, Dependencies> =
  OmniBestPracticeMetadata<Name> & {
    createProvider(dependencies: Dependencies): Provider | undefined;
  };

export type OmniProviderPracticeSelection<Name extends string, Provider, Practice> = {
  providerName: Name;
  practice: Practice;
  provider?: Provider;
};

export type OmniBaseToolDefinitionOptions<Input, Output> = {
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

export type OmniCoreResult<Output> =
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

export function omniToolSkillDocPath(toolId: string, storageGroup: string): string {
  return path
    .join(repoRoot, "src", "storagePool", "baseToolStorage", "omniBase", storageGroup, toolId, `${toolId}.md`)
    .split(path.sep)
    .join("/");
}

export function omniToolSourcePath(toolId: string, storageGroup: string): string {
  return path
    .join(
      repoRoot,
      "src",
      "agentCore",
      "agent_executionEngine",
      "basic_toolLayer",
      "baseTools",
      "omniBase",
      storageGroup,
      `${toolId}.ts`,
    )
    .split(path.sep)
    .join("/");
}

export function omniToolStoragePracticePath(toolId: string, storageGroup: string): string {
  return path
    .join(repoRoot, "src", "storagePool", "baseToolStorage", "omniBase", storageGroup, toolId, "bestPractice.ts")
    .split(path.sep)
    .join("/");
}

export function createOmniBaseToolDefinition<Input, Output>(
  options: OmniBaseToolDefinitionOptions<Input, Output>,
): BaseToolDefinition<Input, Output> {
  return {
    toolId: options.toolId,
    source: "builtin",
    family: "omni",
    title: options.title,
    description: options.description,
    toolSkill: {
      docPath: omniToolSkillDocPath(options.toolId, options.storageGroup),
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
    sourcePath: omniToolSourcePath(options.toolId, options.storageGroup),
    metadata: {
      storagePracticePath: omniToolStoragePracticePath(options.toolId, options.storageGroup),
      ...(options.metadata ?? {}),
    },
  };
}

export function orderOmniPractices<Name extends string, Practice extends OmniBestPracticeMetadata<Name>>(
  practices: readonly Practice[],
  preferredProvider: Name | undefined,
): readonly Practice[] {
  if (preferredProvider === undefined) return practices;
  return [
    ...practices.filter((practice) => practice.providerName === preferredProvider),
    ...practices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectOmniProviderPractice<Name extends string, Provider, Dependencies>(
  practices: readonly OmniProviderPracticeMetadata<Name, Provider, Dependencies>[],
  dependencies: Dependencies & { preferredProvider?: Name },
  fallbackPractice: OmniProviderPracticeMetadata<Name, Provider, Dependencies>,
): OmniProviderPracticeSelection<Name, Provider, OmniProviderPracticeMetadata<Name, Provider, Dependencies>> {
  const ordered = orderOmniPractices(practices, dependencies.preferredProvider);
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

export function buildOmniPracticeAuditMetadata(
  selection: Pick<
    OmniProviderPracticeSelection<string, unknown, OmniBestPracticeMetadata<string>>,
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

export function adaptOmniCoreResult<Output>(result: OmniCoreResult<Output>): BaseToolInvokeResult<Output> {
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

export function createOmniCoreHandler<Input, Output>(
  definition: BaseToolDefinition<Input, Output>,
  invokeCore: (request: BaseToolInvokeRequest<Input>) => Promise<OmniCoreResult<Output>> | OmniCoreResult<Output>,
): BaseToolHandler<Input, Output> {
  return {
    definition,
    async invoke(request) {
      return adaptOmniCoreResult(await invokeCore(request));
    },
  };
}
