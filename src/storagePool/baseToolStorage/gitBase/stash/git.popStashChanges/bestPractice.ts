import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildGitBasePracticeAuditMetadata,
  createGitBaseCoreHandler,
  createGitBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import { anthropicGitPopStashChangesPractice } from "./anthropic.js";
import { deepmindGitPopStashChangesPractice } from "./deepmind.js";
import {
  executeGitPopStashChanges as executeGitPopStashChangesCore,
  gitPopStashChangesDescriptor,
  planGitPopStashChanges,
  type GitPopStashChangesOutput,
  type GitPopStashChangesProvider,
  type GitPopStashChangesRequest,
  type GitPopStashChangesResult,
} from "./core.js";
import {
  gitPopStashChangesDependencyDeclarations,
  type GitPopStashChangesDependencies,
  type GitPopStashChangesPracticeProviderName,
  type GitPopStashChangesProviderPractice,
} from "./dependencies.js";
import { openaiGitPopStashChangesPractice } from "./openai.js";

export * from "./core.js";

export type GitPopStashChangesBestPracticeRequest = GitPopStashChangesRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: GitPopStashChangesPracticeProviderName;
};

export type GitPopStashChangesHandlerInput = Omit<GitPopStashChangesBestPracticeRequest, "executor">;

export type GitPopStashChangesPracticeSelection = {
  providerName: GitPopStashChangesPracticeProviderName;
  practice: GitPopStashChangesProviderPractice;
  provider?: GitPopStashChangesProvider;
};

export const gitPopStashChangesProviderPractices = [
  anthropicGitPopStashChangesPractice,
  openaiGitPopStashChangesPractice,
  deepmindGitPopStashChangesPractice,
] as const;

export const gitPopStashChangesBestPracticeDescriptor = {
  toolId: "git.popStashChanges",
  bestPractice: "runtime-gitExecutor-stash-pop-workspace-mutation",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: gitPopStashChangesDependencyDeclarations,
} as const;

function orderedPractices(
  preferredProvider: GitPopStashChangesPracticeProviderName | undefined,
): readonly GitPopStashChangesProviderPractice[] {
  if (preferredProvider === undefined) {
    return gitPopStashChangesProviderPractices;
  }
  return [
    ...gitPopStashChangesProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...gitPopStashChangesProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectGitPopStashChangesPractice(
  dependencies: GitPopStashChangesDependencies & {
    preferredProvider?: GitPopStashChangesPracticeProviderName;
  } = {},
): GitPopStashChangesPracticeSelection {
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

function practiceAuditMetadata(selection: GitPopStashChangesPracticeSelection): Readonly<Record<string, unknown>> {
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

export async function executeGitPopStashChanges(
  request: GitPopStashChangesBestPracticeRequest = {},
): ReturnType<typeof executeGitPopStashChangesCore> {
  const selection = selectGitPopStashChangesPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  return executeGitPopStashChangesCore({
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

export const gitPopStashChangesBaseToolDefinition = createGitBaseToolDefinition<
  GitPopStashChangesHandlerInput,
  GitPopStashChangesOutput
>({
  toolId: "git.popStashChanges",
  title: "Git Pop Stash Changes",
  description: "Pop a stash entry through a fixed git stash pop action.",
  summary: "Use git.popStashChanges to apply and drop stash content without exposing arbitrary git commands.",
  storageGroup: "stash",
  riskLevel: "risky",
  permissionHints: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
  dependencies: gitPopStashChangesDependencyDeclarations,
  metadata: {
    runtimeEntryPort: gitPopStashChangesDescriptor.runtimeEntryPort,
    operationRisk: gitPopStashChangesDescriptor.operationRisk,
    allowedGitSubcommand: "stash",
    argvMode: "fixed-stash-pop-workspace-mutation",
    runtimeOwnsExecution: true,
  },
  inputSchema: jsonSchema("git.popStashChanges.input", {
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
      timeoutMs: { type: "integer", minimum: 1, maximum: gitPopStashChangesDescriptor.maxTimeoutMs },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("git.popStashChanges.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "runtimeEntry", "risk", "gitArgs", "commandPreview", "dryRun", "providerCalled", "resultEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.git.popStashChanges" },
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
      dropsStashOnSuccess: { type: "boolean" },
      resultEnvelope: { type: "object" },
    },
  }),
});

export const gitPopStashChangesHandler: BaseToolHandler<GitPopStashChangesHandlerInput, GitPopStashChangesOutput> =
  createGitBaseCoreHandler(gitPopStashChangesBaseToolDefinition, async (request) => {
    const selection = selectGitPopStashChangesPractice({
      ...request.input,
      executor: request.executor,
      provider: request.input.provider,
    });
    const inputContext = request.input.context ?? {};
    return executeGitPopStashChangesCore({
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

export type { GitPopStashChangesResult };
export { gitPopStashChangesDescriptor, planGitPopStashChanges };
