import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildGitBasePracticeAuditMetadata,
  createGitBaseCoreHandler,
  createGitBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import { anthropicGitResetStagingOrCommitPractice } from "./anthropic.js";
import { deepmindGitResetStagingOrCommitPractice } from "./deepmind.js";
import {
  executeGitStagingOrCommitReset as executeGitStagingOrCommitResetCore,
  gitResetStagingOrCommitDescriptor,
  planGitStagingOrCommitReset,
  type GitResetStagingOrCommitOutput,
  type GitResetStagingOrCommitProvider,
  type GitResetStagingOrCommitRequest,
  type GitResetStagingOrCommitResult,
} from "./core.js";
import {
  gitResetStagingOrCommitDependencyDeclarations,
  type GitResetStagingOrCommitDependencies,
  type GitResetStagingOrCommitPracticeProviderName,
  type GitResetStagingOrCommitProviderPractice,
} from "./dependencies.js";
import { openaiGitResetStagingOrCommitPractice } from "./openai.js";

export * from "./core.js";

export type GitResetStagingOrCommitBestPracticeRequest = GitResetStagingOrCommitRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: GitResetStagingOrCommitPracticeProviderName;
};

export type GitResetStagingOrCommitHandlerInput = Omit<GitResetStagingOrCommitBestPracticeRequest, "executor">;

export type GitResetStagingOrCommitPracticeSelection = {
  providerName: GitResetStagingOrCommitPracticeProviderName;
  practice: GitResetStagingOrCommitProviderPractice;
  provider?: GitResetStagingOrCommitProvider;
};

export const gitResetStagingOrCommitProviderPractices = [
  anthropicGitResetStagingOrCommitPractice,
  openaiGitResetStagingOrCommitPractice,
  deepmindGitResetStagingOrCommitPractice,
] as const;

export const gitResetStagingOrCommitBestPracticeDescriptor = {
  toolId: "git.resetStagingOrCommit",
  bestPractice: "runtime-gitExecutor-reset-staging-or-commit-mutation",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: gitResetStagingOrCommitDependencyDeclarations,
} as const;

function orderedPractices(
  preferredProvider: GitResetStagingOrCommitPracticeProviderName | undefined,
): readonly GitResetStagingOrCommitProviderPractice[] {
  if (preferredProvider === undefined) {
    return gitResetStagingOrCommitProviderPractices;
  }
  return [
    ...gitResetStagingOrCommitProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...gitResetStagingOrCommitProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectGitResetStagingOrCommitPractice(
  dependencies: GitResetStagingOrCommitDependencies & {
    preferredProvider?: GitResetStagingOrCommitPracticeProviderName;
  } = {},
): GitResetStagingOrCommitPracticeSelection {
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

function practiceAuditMetadata(selection: GitResetStagingOrCommitPracticeSelection): Readonly<Record<string, unknown>> {
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

export async function executeGitStagingOrCommitReset(
  request: GitResetStagingOrCommitBestPracticeRequest = {},
): ReturnType<typeof executeGitStagingOrCommitResetCore> {
  const selection = selectGitResetStagingOrCommitPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  return executeGitStagingOrCommitResetCore({
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

export const gitResetStagingOrCommitBaseToolDefinition = createGitBaseToolDefinition<
  GitResetStagingOrCommitHandlerInput,
  GitResetStagingOrCommitOutput
>({
  toolId: "git.resetStagingOrCommit",
  title: "Git Reset Staging Or Commit",
  description: "Reset staging entries or move HEAD through fixed git reset actions.",
  summary: "Use git.resetStagingOrCommit to unstage paths or perform a governed commit reset without exposing arbitrary git commands.",
  storageGroup: "staging",
  riskLevel: "dangerous",
  permissionHints: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
  dependencies: gitResetStagingOrCommitDependencyDeclarations,
  metadata: {
    runtimeEntryPort: gitResetStagingOrCommitDescriptor.runtimeEntryPort,
    operationRisk: gitResetStagingOrCommitDescriptor.operationRisk,
    allowedGitSubcommand: "reset",
    argvMode: "fixed-reset-staging-or-commit-mutation",
    runtimeOwnsExecution: true,
  },
  inputSchema: jsonSchema("git.resetStagingOrCommit.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        required: ["repositoryPath", "action"],
        properties: {
          repositoryPath: { type: "string", minLength: 1 },
          action: { type: "string", enum: ["staging", "commit"] },
          pathspecs: { type: "array", items: { type: "string" } },
          targetRef: { type: "string" },
          mode: { type: "string", enum: ["soft", "mixed", "hard", "merge", "keep"] },
        },
      },
      context: invocationContextSchema,
      timeoutMs: { type: "integer", minimum: 1, maximum: gitResetStagingOrCommitDescriptor.maxTimeoutMs },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("git.resetStagingOrCommit.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "runtimeEntry", "risk", "gitArgs", "commandPreview", "dryRun", "providerCalled", "resultEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.git.resetStagingOrCommit" },
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

export const gitResetStagingOrCommitHandler: BaseToolHandler<
  GitResetStagingOrCommitHandlerInput,
  GitResetStagingOrCommitOutput
> = createGitBaseCoreHandler(gitResetStagingOrCommitBaseToolDefinition, async (request) => {
  const selection = selectGitResetStagingOrCommitPractice({
    ...request.input,
    executor: request.executor,
    provider: request.input.provider,
  });
  const inputContext = request.input.context ?? {};
  return executeGitStagingOrCommitResetCore({
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

export type { GitResetStagingOrCommitResult };
export { gitResetStagingOrCommitDescriptor, planGitStagingOrCommitReset };
