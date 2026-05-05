import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildGitBasePracticeAuditMetadata,
  createGitBaseCoreHandler,
  createGitBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import { anthropicGitAddToStagingPractice } from "./anthropic.js";
import { deepmindGitAddToStagingPractice } from "./deepmind.js";
import {
  executeGitAddToStaging as executeGitAddToStagingCore,
  gitAddToStagingDescriptor,
  planGitAddToStaging,
  type GitAddToStagingOutput,
  type GitAddToStagingProvider,
  type GitAddToStagingRequest,
  type GitAddToStagingResult,
} from "./core.js";
import {
  gitAddToStagingDependencyDeclarations,
  type GitAddToStagingDependencies,
  type GitAddToStagingPracticeProviderName,
  type GitAddToStagingProviderPractice,
} from "./dependencies.js";
import { openaiGitAddToStagingPractice } from "./openai.js";

export * from "./core.js";

export type GitAddToStagingBestPracticeRequest = GitAddToStagingRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: GitAddToStagingPracticeProviderName;
};

export type GitAddToStagingHandlerInput = Omit<GitAddToStagingBestPracticeRequest, "executor">;

export type GitAddToStagingPracticeSelection = {
  providerName: GitAddToStagingPracticeProviderName;
  practice: GitAddToStagingProviderPractice;
  provider?: GitAddToStagingProvider;
};

export const gitAddToStagingProviderPractices = [
  anthropicGitAddToStagingPractice,
  openaiGitAddToStagingPractice,
  deepmindGitAddToStagingPractice,
] as const;

export const gitAddToStagingBestPracticeDescriptor = {
  toolId: "git.addToStaging",
  bestPractice: "runtime-gitExecutor-add-workspace-mutation",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: gitAddToStagingDependencyDeclarations,
} as const;

function orderedPractices(
  preferredProvider: GitAddToStagingPracticeProviderName | undefined,
): readonly GitAddToStagingProviderPractice[] {
  if (preferredProvider === undefined) {
    return gitAddToStagingProviderPractices;
  }
  return [
    ...gitAddToStagingProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...gitAddToStagingProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectGitAddToStagingPractice(
  dependencies: GitAddToStagingDependencies & {
    preferredProvider?: GitAddToStagingPracticeProviderName;
  } = {},
): GitAddToStagingPracticeSelection {
  for (const practice of orderedPractices(dependencies.preferredProvider)) {
    const provider = practice.createProvider(dependencies);
    if (provider !== undefined) {
      return { providerName: practice.providerName, practice, provider };
    }
  }
  return {
    providerName: "praxis-native",
    practice: {
      providerName: "praxis-native",
      source: { kind: "praxis-native", label: "Praxis dry-run fallback" },
      directCliSupport: false,
      sideEffectPolicy: "runtime-governed",
      notes: ["No injected or runtime git provider is currently available; dry-run remains available."],
      createProvider: () => undefined,
    },
  };
}

function practiceAuditMetadata(selection: GitAddToStagingPracticeSelection): Readonly<Record<string, unknown>> {
  return buildGitBasePracticeAuditMetadata({
    providerName: selection.providerName,
    sourceLabel: selection.practice.source.label,
    sourceKind: selection.practice.source.kind,
    sourcePath: selection.practice.source.path,
    directCliSupport: selection.practice.directCliSupport,
    sideEffectPolicy: selection.practice.sideEffectPolicy,
    notes: selection.practice.notes,
  });
}

export async function executeGitAddToStaging(
  request: GitAddToStagingBestPracticeRequest = {},
): ReturnType<typeof executeGitAddToStagingCore> {
  const selection = selectGitAddToStagingPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  return executeGitAddToStagingCore({
    ...request,
    provider: selection.provider,
    context: {
      ...request.context,
      auditMetadata: {
        ...(request.context?.auditMetadata ?? {}),
        ...practiceAuditMetadata(selection),
      },
    },
  });
}

const invocationContextSchema = {
  type: "object",
  additionalProperties: true,
  properties: {
    runtimeId: { type: "string" },
    sessionId: { type: "string" },
    invocationId: { type: "string" },
    dryRun: { type: "boolean" },
    guard: {
      type: "object",
      additionalProperties: true,
      properties: {
        allowed: { type: "boolean" },
        accepted: { type: "boolean" },
        reason: { type: "string" },
      },
    },
    allowedRepositoryRoots: { type: "array", items: { type: "string" } },
    grantedPermissions: { type: "array", items: { type: "string" } },
  },
} as const;

export const gitAddToStagingBaseToolDefinition = createGitBaseToolDefinition<
  GitAddToStagingHandlerInput,
  GitAddToStagingOutput
>({
  toolId: "git.addToStaging",
  title: "Git Add To Staging",
  description: "Stage files through a fixed git add action and the governed runtime git executor.",
  summary: "Use git.addToStaging to stage repository-relative paths or all/update sets without exposing arbitrary git commands.",
  storageGroup: "staging",
  riskLevel: "risky",
  permissionHints: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
  dependencies: gitAddToStagingDependencyDeclarations,
  metadata: {
    runtimeEntryPort: gitAddToStagingDescriptor.runtimeEntryPort,
    operationRisk: gitAddToStagingDescriptor.operationRisk,
    allowedGitSubcommand: "add",
    argvMode: "fixed-add-workspace-mutation",
    runtimeOwnsExecution: true,
  },
  inputSchema: jsonSchema("git.addToStaging.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        required: ["repositoryPath"],
        properties: {
          repositoryPath: { type: "string", minLength: 1 },
          pathspecs: { type: "array", items: { type: "string" } },
          all: { type: "boolean" },
          update: { type: "boolean" },
          intentToAdd: { type: "boolean" },
          patch: { type: "boolean" },
          force: { type: "boolean" },
        },
      },
      context: invocationContextSchema,
      timeoutMs: { type: "integer", minimum: 1, maximum: gitAddToStagingDescriptor.maxTimeoutMs },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("git.addToStaging.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "runtimeEntry", "risk", "gitArgs", "commandPreview", "dryRun", "providerCalled", "resultEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.git.addToStaging" },
      target: { type: "object" },
      runtimeEntry: { type: "object" },
      risk: { type: "object" },
      gitArgs: { type: "array", items: { type: "string" } },
      commandPreview: { type: "array", items: { type: "string" } },
      timeoutMs: { type: "integer", minimum: 1 },
      dryRun: { type: "boolean" },
      executionBlocked: { type: "boolean" },
      providerCalled: { type: "boolean" },
      exitCode: { type: "integer" },
      stdout: { type: "string" },
      stderr: { type: "string" },
      resultEnvelope: { type: "object" },
    },
  }),
});

export const gitAddToStagingHandler: BaseToolHandler<
  GitAddToStagingHandlerInput,
  GitAddToStagingOutput
> = createGitBaseCoreHandler(gitAddToStagingBaseToolDefinition, async (request) => {
  const selection = selectGitAddToStagingPractice({
    ...request.input,
    executor: request.executor,
    provider: request.input.provider,
  });
  const inputContext = request.input.context ?? {};
  return executeGitAddToStagingCore({
    ...request.input,
    provider: selection.provider,
    context: {
      ...inputContext,
      runtimeId: inputContext.runtimeId ?? request.runtimeId,
      sessionId: inputContext.sessionId ?? request.sessionId,
      invocationId: inputContext.invocationId ?? request.toolCallId,
      auditMetadata: injectRuntimeInvocationMetadata(
        {
          ...practiceAuditMetadata(selection),
          ...(request.metadata ?? {}),
        },
        inputContext.auditMetadata,
        request,
      ),
    },
  });
});

export type { GitAddToStagingResult };
export { gitAddToStagingDescriptor, planGitAddToStaging };
