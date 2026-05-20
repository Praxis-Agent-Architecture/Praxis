import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildGitBasePracticeAuditMetadata,
  createGitBaseCoreHandler,
  createGitBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import { anthropicGitStashChangesPractice } from "./anthropic.js";
import { deepmindGitStashChangesPractice } from "./deepmind.js";
import {
  executeGitStashChanges as executeGitStashChangesCore,
  gitStashChangesDescriptor,
  planGitStashChanges,
  type GitStashChangesOutput,
  type GitStashChangesProvider,
  type GitStashChangesRequest,
  type GitStashChangesResult,
} from "./core.js";
import {
  gitStashChangesDependencyDeclarations,
  type GitStashChangesDependencies,
  type GitStashChangesPracticeProviderName,
  type GitStashChangesProviderPractice,
} from "./dependencies.js";
import { openaiGitStashChangesPractice } from "./openai.js";

export * from "./core.js";

export type GitStashChangesBestPracticeRequest = GitStashChangesRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: GitStashChangesPracticeProviderName;
};

export type GitStashChangesHandlerInput = Omit<GitStashChangesBestPracticeRequest, "executor">;

export type GitStashChangesPracticeSelection = {
  providerName: GitStashChangesPracticeProviderName;
  practice: GitStashChangesProviderPractice;
  provider?: GitStashChangesProvider;
};

export const gitStashChangesProviderPractices = [
  anthropicGitStashChangesPractice,
  openaiGitStashChangesPractice,
  deepmindGitStashChangesPractice,
] as const;

export const gitStashChangesBestPracticeDescriptor = {
  toolId: "git.stashChanges",
  bestPractice: "runtime-gitExecutor-stash-push-workspace-mutation",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: gitStashChangesDependencyDeclarations,
} as const;

function orderedPractices(preferredProvider: GitStashChangesPracticeProviderName | undefined): readonly GitStashChangesProviderPractice[] {
  if (preferredProvider === undefined) {
    return gitStashChangesProviderPractices;
  }
  return [
    ...gitStashChangesProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...gitStashChangesProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectGitStashChangesPractice(
  dependencies: GitStashChangesDependencies & {
    preferredProvider?: GitStashChangesPracticeProviderName;
  } = {},
): GitStashChangesPracticeSelection {
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

function practiceAuditMetadata(selection: GitStashChangesPracticeSelection): Readonly<Record<string, unknown>> {
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

export async function executeGitStashChanges(
  request: GitStashChangesBestPracticeRequest = {},
): ReturnType<typeof executeGitStashChangesCore> {
  const selection = selectGitStashChangesPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  return executeGitStashChangesCore({
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

export const gitStashChangesBaseToolDefinition = createGitBaseToolDefinition<
  GitStashChangesHandlerInput,
  GitStashChangesOutput
>({
  toolId: "git.stashChanges",
  title: "Git Stash Changes",
  description: "Create a stash entry through a fixed git stash push action.",
  summary: "Use git.stashChanges to save working-tree changes without exposing arbitrary git commands.",
  storageGroup: "stash",
  riskLevel: "risky",
  permissionHints: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
  dependencies: gitStashChangesDependencyDeclarations,
  metadata: {
    runtimeEntryPort: gitStashChangesDescriptor.runtimeEntryPort,
    operationRisk: gitStashChangesDescriptor.operationRisk,
    allowedGitSubcommand: "stash",
    argvMode: "fixed-stash-push-workspace-mutation",
    runtimeOwnsExecution: true,
  },
  inputSchema: jsonSchema("git.stashChanges.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        required: ["repositoryPath"],
        properties: {
          repositoryPath: { type: "string", minLength: 1 },
          message: { type: "string" },
          includeUntracked: { type: "boolean" },
          keepIndex: { type: "boolean" },
          pathspecs: { type: "array", items: { type: "string" } },
        },
      },
      context: invocationContextSchema,
      timeoutMs: { type: "integer", minimum: 1, maximum: gitStashChangesDescriptor.maxTimeoutMs },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("git.stashChanges.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "runtimeEntry", "risk", "gitArgs", "commandPreview", "dryRun", "providerCalled", "resultEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.git.stashChanges" },
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

export const gitStashChangesHandler: BaseToolHandler<GitStashChangesHandlerInput, GitStashChangesOutput> =
  createGitBaseCoreHandler(gitStashChangesBaseToolDefinition, async (request) => {
    const selection = selectGitStashChangesPractice({
      ...request.input,
      executor: request.executor,
      provider: request.input.provider,
    });
    const inputContext = request.input.context ?? {};
    return executeGitStashChangesCore({
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

export type { GitStashChangesResult };
export { gitStashChangesDescriptor, planGitStashChanges };
