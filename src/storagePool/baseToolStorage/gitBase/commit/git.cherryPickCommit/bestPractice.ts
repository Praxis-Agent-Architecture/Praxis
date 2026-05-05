import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildGitBasePracticeAuditMetadata,
  createGitBaseCoreHandler,
  createGitBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import { anthropicGitCherryPickCommitPractice } from "./anthropic.js";
import { deepmindGitCherryPickCommitPractice } from "./deepmind.js";
import {
  executeGitCherryPickCommit as executeGitCherryPickCommitCore,
  gitCherryPickCommitDescriptor,
  parseGitCherryPickCommitResult,
  planGitCherryPickCommit,
  planGitCommitCherryPick,
  type GitCherryPickCommitOutput,
  type GitCherryPickCommitProvider,
  type GitCherryPickCommitRequest,
  type GitCherryPickCommitResult,
} from "./core.js";
import {
  gitCherryPickCommitDependencyDeclarations,
  type GitCherryPickCommitDependencies,
  type GitCherryPickCommitPracticeProviderName,
  type GitCherryPickCommitProviderPractice,
} from "./dependencies.js";
import { openaiGitCherryPickCommitPractice } from "./openai.js";

export * from "./core.js";

export type GitCherryPickCommitBestPracticeRequest = GitCherryPickCommitRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: GitCherryPickCommitPracticeProviderName;
};

export type GitCherryPickCommitHandlerInput = Omit<GitCherryPickCommitBestPracticeRequest, "executor">;

export type GitCherryPickCommitPracticeSelection = {
  providerName: GitCherryPickCommitPracticeProviderName;
  practice: GitCherryPickCommitProviderPractice;
  provider?: GitCherryPickCommitProvider;
};

export const gitCherryPickCommitProviderPractices = [
  anthropicGitCherryPickCommitPractice,
  openaiGitCherryPickCommitPractice,
  deepmindGitCherryPickCommitPractice,
] as const;

export const gitCherryPickCommitBestPracticeDescriptor = {
  toolId: "git.cherryPickCommit",
  bestPractice: "runtime-gitExecutor-cherry-pick-commit-history-mutation",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: gitCherryPickCommitDependencyDeclarations,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function orderedPractices(
  preferredProvider: GitCherryPickCommitPracticeProviderName | undefined,
): readonly GitCherryPickCommitProviderPractice[] {
  if (preferredProvider === undefined) {
    return gitCherryPickCommitProviderPractices;
  }
  return [
    ...gitCherryPickCommitProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...gitCherryPickCommitProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectGitCherryPickCommitPractice(
  dependencies: GitCherryPickCommitDependencies & {
    preferredProvider?: GitCherryPickCommitPracticeProviderName;
  } = {},
): GitCherryPickCommitPracticeSelection {
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

function practiceAuditMetadata(selection: GitCherryPickCommitPracticeSelection): Readonly<Record<string, unknown>> {
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

export async function executeGitCherryPickCommit(
  request: GitCherryPickCommitBestPracticeRequest = {},
): ReturnType<typeof executeGitCherryPickCommitCore> {
  const safeRequest = typeof request === "object" && request !== null ? request : ({} as GitCherryPickCommitBestPracticeRequest);
  const selection = selectGitCherryPickCommitPractice({
    executor: safeRequest.executor,
    provider: safeRequest.provider,
    preferredProvider: safeRequest.preferredProvider,
  });
  const context =
    safeRequest.context === undefined || isRecord(safeRequest.context)
      ? {
          ...safeRequest.context,
          auditMetadata: {
            ...(safeRequest.context?.auditMetadata ?? {}),
            ...practiceAuditMetadata(selection),
          },
        }
      : safeRequest.context;
  return executeGitCherryPickCommitCore({
    ...safeRequest,
    provider: selection.provider,
    context,
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

export const gitCherryPickCommitBaseToolDefinition = createGitBaseToolDefinition<
  GitCherryPickCommitHandlerInput,
  GitCherryPickCommitOutput
>({
  toolId: "git.cherryPickCommit",
  title: "Git Cherry Pick Commit",
  description: "Cherry-pick a commit through a fixed git cherry-pick action.",
  summary: "Use git.cherryPickCommit to apply a specific commit without exposing arbitrary git commands.",
  storageGroup: "commit",
  riskLevel: "risky",
  permissionHints: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
  dependencies: gitCherryPickCommitDependencyDeclarations,
  metadata: {
    runtimeEntryPort: gitCherryPickCommitDescriptor.runtimeEntryPort,
    operationRisk: gitCherryPickCommitDescriptor.operationRisk,
    allowedGitSubcommand: "cherry-pick",
    argvMode: "fixed-cherry-pick-commit",
    runtimeOwnsExecution: true,
    appliesCommit: true,
    mayCreateConflicts: true,
  },
  inputSchema: jsonSchema("git.cherryPickCommit.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        required: ["repositoryPath", "commitRef"],
        properties: {
          repositoryPath: { type: "string", minLength: 1 },
          commitRef: { type: "string", minLength: 1 },
          noCommit: { type: "boolean" },
          mainlineParent: { type: "integer", minimum: 1 },
          signoff: { type: "boolean" },
        },
      },
      context: invocationContextSchema,
      timeoutMs: { type: "integer", minimum: 1, maximum: gitCherryPickCommitDescriptor.maxTimeoutMs },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("git.cherryPickCommit.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "runtimeEntry", "risk", "gitArgs", "commandPreview", "dryRun", "providerCalled", "resultEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.git.cherryPickCommit" },
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
      appliesCommit: { type: "boolean" },
      resultEnvelope: { type: "object" },
    },
  }),
});

export const gitCherryPickCommitHandler: BaseToolHandler<GitCherryPickCommitHandlerInput, GitCherryPickCommitOutput> =
  createGitBaseCoreHandler(gitCherryPickCommitBaseToolDefinition, async (request) => {
    const selection = selectGitCherryPickCommitPractice({
      ...request.input,
      executor: request.executor,
      provider: request.input.provider,
    });
    const inputContext = isRecord(request.input.context) ? request.input.context : {};
    return executeGitCherryPickCommitCore({
      ...request.input,
      provider: selection.provider,
      context:
        request.input.context === undefined || isRecord(request.input.context)
          ? {
              ...inputContext,
              runtimeId: inputContext.runtimeId ?? request.runtimeId,
              sessionId: inputContext.sessionId ?? request.sessionId,
              invocationId: inputContext.invocationId ?? request.toolCallId,
              auditMetadata: injectRuntimeInvocationMetadata(
                {
                  ...practiceAuditMetadata(selection),
                  ...(request.metadata ?? {}),
                },
                isRecord(inputContext.auditMetadata) ? inputContext.auditMetadata : undefined,
                request,
              ),
            }
          : request.input.context,
    });
  });

export type { GitCherryPickCommitResult };
export { gitCherryPickCommitDescriptor, parseGitCherryPickCommitResult, planGitCherryPickCommit, planGitCommitCherryPick };
