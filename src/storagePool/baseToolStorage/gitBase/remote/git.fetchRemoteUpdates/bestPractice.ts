import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildGitBasePracticeAuditMetadata,
  createGitBaseCoreHandler,
  createGitBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import { anthropicGitFetchRemoteUpdatesPractice } from "./anthropic.js";
import { deepmindGitFetchRemoteUpdatesPractice } from "./deepmind.js";
import {
  executeGitFetchRemoteUpdates as executeGitFetchRemoteUpdatesCore,
  gitFetchRemoteUpdatesDescriptor,
  parseGitFetchRemoteUpdatesResult,
  planFetchRemoteUpdates,
  planGitFetchRemoteUpdates,
  type GitFetchRemoteUpdatesOutput,
  type GitFetchRemoteUpdatesProvider,
  type GitFetchRemoteUpdatesRequest,
  type GitFetchRemoteUpdatesResult,
} from "./core.js";
import {
  gitFetchRemoteUpdatesDependencyDeclarations,
  type GitFetchRemoteUpdatesDependencies,
  type GitFetchRemoteUpdatesPracticeProviderName,
  type GitFetchRemoteUpdatesProviderPractice,
} from "./dependencies.js";
import { openaiGitFetchRemoteUpdatesPractice } from "./openai.js";

export * from "./core.js";

export type GitFetchRemoteUpdatesBestPracticeRequest = GitFetchRemoteUpdatesRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: GitFetchRemoteUpdatesPracticeProviderName;
};

export type GitFetchRemoteUpdatesHandlerInput = Omit<GitFetchRemoteUpdatesBestPracticeRequest, "executor">;

export type GitFetchRemoteUpdatesPracticeSelection = {
  providerName: GitFetchRemoteUpdatesPracticeProviderName;
  practice: GitFetchRemoteUpdatesProviderPractice;
  provider?: GitFetchRemoteUpdatesProvider;
};

export const gitFetchRemoteUpdatesProviderPractices = [
  anthropicGitFetchRemoteUpdatesPractice,
  openaiGitFetchRemoteUpdatesPractice,
  deepmindGitFetchRemoteUpdatesPractice,
] as const;

export const gitFetchRemoteUpdatesBestPracticeDescriptor = {
  toolId: "git.fetchRemoteUpdates",
  bestPractice: "runtime-gitExecutor-fetch-remote-network",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: gitFetchRemoteUpdatesDependencyDeclarations,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function orderedPractices(
  preferredProvider: GitFetchRemoteUpdatesPracticeProviderName | undefined,
): readonly GitFetchRemoteUpdatesProviderPractice[] {
  if (preferredProvider === undefined) {
    return gitFetchRemoteUpdatesProviderPractices;
  }
  return [
    ...gitFetchRemoteUpdatesProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...gitFetchRemoteUpdatesProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectGitFetchRemoteUpdatesPractice(
  dependencies: GitFetchRemoteUpdatesDependencies & { preferredProvider?: GitFetchRemoteUpdatesPracticeProviderName } = {},
): GitFetchRemoteUpdatesPracticeSelection {
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

function practiceAuditMetadata(selection: GitFetchRemoteUpdatesPracticeSelection): Readonly<Record<string, unknown>> {
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

export async function executeGitFetchRemoteUpdates(
  request: GitFetchRemoteUpdatesBestPracticeRequest = {},
): ReturnType<typeof executeGitFetchRemoteUpdatesCore> {
  const safeRequest = typeof request === "object" && request !== null ? request : ({} as GitFetchRemoteUpdatesBestPracticeRequest);
  const selection = selectGitFetchRemoteUpdatesPractice({
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
  return executeGitFetchRemoteUpdatesCore({
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

export const gitFetchRemoteUpdatesBaseToolDefinition = createGitBaseToolDefinition<
  GitFetchRemoteUpdatesHandlerInput,
  GitFetchRemoteUpdatesOutput
>({
  toolId: "git.fetchRemoteUpdates",
  title: "Git Fetch Remote Updates",
  description: "Fetch remote Git updates through a fixed git fetch action.",
  summary: "Use git.fetchRemoteUpdates to fetch from a remote without exposing arbitrary git commands.",
  storageGroup: "remote",
  riskLevel: "risky",
  permissionHints: ["git:read", "git:write", "filesystem:write", "network:egress"],
  dependencies: gitFetchRemoteUpdatesDependencyDeclarations,
  metadata: {
    runtimeEntryPort: gitFetchRemoteUpdatesDescriptor.runtimeEntryPort,
    operationRisk: gitFetchRemoteUpdatesDescriptor.operationRisk,
    allowedGitSubcommand: "fetch",
    argvMode: "fixed-fetch-remote-updates",
    runtimeOwnsExecution: true,
    mayUseNetwork: true,
  },
  inputSchema: jsonSchema("git.fetchRemoteUpdates.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        required: ["repositoryPath"],
        properties: {
          repositoryPath: { type: "string", minLength: 1 },
          remoteName: { type: "string" },
          refspecs: { type: "array", items: { type: "string" } },
          prune: { type: "boolean" },
          tagsMode: { type: "string", enum: ["default", "tags", "no-tags"] },
        },
      },
      context: invocationContextSchema,
      timeoutMs: { type: "integer", minimum: 1, maximum: gitFetchRemoteUpdatesDescriptor.maxTimeoutMs },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("git.fetchRemoteUpdates.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "runtimeEntry", "risk", "gitArgs", "commandPreview", "dryRun", "providerCalled", "resultEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.git.fetchRemoteUpdates" },
      target: { type: "object" },
      runtimeEntry: { type: "object" },
      risk: { type: "object" },
      gitArgs: { type: "array", items: { type: "string" } },
      commandPreview: { type: "array", items: { type: "string" } },
      dryRun: { type: "boolean" },
      executionBlocked: { type: "boolean" },
      providerCalled: { type: "boolean" },
      mayUseNetwork: { type: "boolean" },
      exitCode: { type: "integer" },
      stdout: { type: "string" },
      stderr: { type: "string" },
      resultEnvelope: { type: "object" },
    },
  }),
});

export const gitFetchRemoteUpdatesHandler: BaseToolHandler<GitFetchRemoteUpdatesHandlerInput, GitFetchRemoteUpdatesOutput> =
  createGitBaseCoreHandler(gitFetchRemoteUpdatesBaseToolDefinition, async (request) => {
    const selection = selectGitFetchRemoteUpdatesPractice({
      ...request.input,
      executor: request.executor,
      provider: request.input.provider,
    });
    const inputContext = isRecord(request.input.context) ? request.input.context : {};
    return executeGitFetchRemoteUpdatesCore({
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
                { ...practiceAuditMetadata(selection), ...(request.metadata ?? {}) },
                isRecord(inputContext.auditMetadata) ? inputContext.auditMetadata : undefined,
                request,
              ),
            }
          : request.input.context,
    });
  });

export type { GitFetchRemoteUpdatesResult };
export { gitFetchRemoteUpdatesDescriptor, parseGitFetchRemoteUpdatesResult, planFetchRemoteUpdates, planGitFetchRemoteUpdates };
