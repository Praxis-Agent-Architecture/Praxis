import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildGitBasePracticeAuditMetadata,
  createGitBaseCoreHandler,
  createGitBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import { anthropicGitApplyStashChangesPractice } from "./anthropic.js";
import { deepmindGitApplyStashChangesPractice } from "./deepmind.js";
import {
  executeGitApplyStashChanges as executeGitApplyStashChangesCore,
  gitApplyStashChangesDescriptor,
  planGitApplyStashChanges,
  type GitApplyStashChangesOutput,
  type GitApplyStashChangesProvider,
  type GitApplyStashChangesRequest,
  type GitApplyStashChangesResult,
} from "./core.js";
import {
  gitApplyStashChangesDependencyDeclarations,
  type GitApplyStashChangesDependencies,
  type GitApplyStashChangesPracticeProviderName,
  type GitApplyStashChangesProviderPractice,
} from "./dependencies.js";
import { openaiGitApplyStashChangesPractice } from "./openai.js";

export * from "./core.js";

export type GitApplyStashChangesBestPracticeRequest = GitApplyStashChangesRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: GitApplyStashChangesPracticeProviderName;
};

export type GitApplyStashChangesHandlerInput = Omit<GitApplyStashChangesBestPracticeRequest, "executor">;

export type GitApplyStashChangesPracticeSelection = {
  providerName: GitApplyStashChangesPracticeProviderName;
  practice: GitApplyStashChangesProviderPractice;
  provider?: GitApplyStashChangesProvider;
};

export const gitApplyStashChangesProviderPractices = [
  anthropicGitApplyStashChangesPractice,
  openaiGitApplyStashChangesPractice,
  deepmindGitApplyStashChangesPractice,
] as const;

export const gitApplyStashChangesBestPracticeDescriptor = {
  toolId: "git.applyStashChanges",
  bestPractice: "runtime-gitExecutor-stash-apply-workspace-mutation",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: gitApplyStashChangesDependencyDeclarations,
} as const;

function orderedPractices(
  preferredProvider: GitApplyStashChangesPracticeProviderName | undefined,
): readonly GitApplyStashChangesProviderPractice[] {
  if (preferredProvider === undefined) {
    return gitApplyStashChangesProviderPractices;
  }
  return [
    ...gitApplyStashChangesProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...gitApplyStashChangesProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectGitApplyStashChangesPractice(
  dependencies: GitApplyStashChangesDependencies & {
    preferredProvider?: GitApplyStashChangesPracticeProviderName;
  } = {},
): GitApplyStashChangesPracticeSelection {
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

function practiceAuditMetadata(selection: GitApplyStashChangesPracticeSelection): Readonly<Record<string, unknown>> {
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

export async function executeGitApplyStashChanges(
  request: GitApplyStashChangesBestPracticeRequest = {},
): ReturnType<typeof executeGitApplyStashChangesCore> {
  const selection = selectGitApplyStashChangesPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  return executeGitApplyStashChangesCore({
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

export const gitApplyStashChangesBaseToolDefinition = createGitBaseToolDefinition<
  GitApplyStashChangesHandlerInput,
  GitApplyStashChangesOutput
>({
  toolId: "git.applyStashChanges",
  title: "Git Apply Stash Changes",
  description: "Apply a stash entry through a fixed git stash apply action.",
  summary: "Use git.applyStashChanges to reapply stash content without exposing arbitrary git commands.",
  storageGroup: "stash",
  riskLevel: "risky",
  permissionHints: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
  dependencies: gitApplyStashChangesDependencyDeclarations,
  metadata: {
    runtimeEntryPort: gitApplyStashChangesDescriptor.runtimeEntryPort,
    operationRisk: gitApplyStashChangesDescriptor.operationRisk,
    allowedGitSubcommand: "stash",
    argvMode: "fixed-stash-apply-workspace-mutation",
    runtimeOwnsExecution: true,
  },
  inputSchema: jsonSchema("git.applyStashChanges.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        required: ["repositoryPath"],
        properties: {
          repositoryPath: { type: "string", minLength: 1 },
          stashRef: { type: "string" },
          reinstateIndex: { type: "boolean" },
        },
      },
      context: invocationContextSchema,
      timeoutMs: { type: "integer", minimum: 1, maximum: gitApplyStashChangesDescriptor.maxTimeoutMs },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("git.applyStashChanges.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "runtimeEntry", "risk", "gitArgs", "commandPreview", "dryRun", "providerCalled", "resultEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.git.applyStashChanges" },
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

export const gitApplyStashChangesHandler: BaseToolHandler<GitApplyStashChangesHandlerInput, GitApplyStashChangesOutput> =
  createGitBaseCoreHandler(gitApplyStashChangesBaseToolDefinition, async (request) => {
    const selection = selectGitApplyStashChangesPractice({
      ...request.input,
      executor: request.executor,
      provider: request.input.provider,
    });
    const inputContext = request.input.context ?? {};
    return executeGitApplyStashChangesCore({
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

export type { GitApplyStashChangesResult };
export { gitApplyStashChangesDescriptor, planGitApplyStashChanges };
