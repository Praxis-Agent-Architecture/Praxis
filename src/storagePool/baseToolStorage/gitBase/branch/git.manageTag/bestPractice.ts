import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildGitBasePracticeAuditMetadata,
  createGitBaseCoreHandler,
  createGitBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import { anthropicGitManageTagPractice } from "./anthropic.js";
import { deepmindGitManageTagPractice } from "./deepmind.js";
import {
  executeGitManageTag as executeGitManageTagCore,
  gitManageTagDescriptor,
  parseGitManageTagResult,
  planGitManageTag,
  planGitTagManagement,
  type GitManageTagOutput,
  type GitManageTagProvider,
  type GitManageTagRequest,
  type GitManageTagResult,
} from "./core.js";
import {
  gitManageTagDependencyDeclarations,
  type GitManageTagDependencies,
  type GitManageTagPracticeProviderName,
  type GitManageTagProviderPractice,
} from "./dependencies.js";
import { openaiGitManageTagPractice } from "./openai.js";

export * from "./core.js";

export type GitManageTagBestPracticeRequest = GitManageTagRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: GitManageTagPracticeProviderName;
};

export type GitManageTagHandlerInput = Omit<GitManageTagBestPracticeRequest, "executor">;

export type GitManageTagPracticeSelection = {
  providerName: GitManageTagPracticeProviderName;
  practice: GitManageTagProviderPractice;
  provider?: GitManageTagProvider;
};

export const gitManageTagProviderPractices = [
  anthropicGitManageTagPractice,
  openaiGitManageTagPractice,
  deepmindGitManageTagPractice,
] as const;

export const gitManageTagBestPracticeDescriptor = {
  toolId: "git.manageTag",
  bestPractice: "runtime-gitExecutor-manage-tag-history-mutation",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: gitManageTagDependencyDeclarations,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function orderedPractices(
  preferredProvider: GitManageTagPracticeProviderName | undefined,
): readonly GitManageTagProviderPractice[] {
  if (preferredProvider === undefined) {
    return gitManageTagProviderPractices;
  }
  return [
    ...gitManageTagProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...gitManageTagProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectGitManageTagPractice(
  dependencies: GitManageTagDependencies & {
    preferredProvider?: GitManageTagPracticeProviderName;
  } = {},
): GitManageTagPracticeSelection {
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

function practiceAuditMetadata(selection: GitManageTagPracticeSelection): Readonly<Record<string, unknown>> {
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

export async function executeGitManageTag(
  request: GitManageTagBestPracticeRequest = {},
): ReturnType<typeof executeGitManageTagCore> {
  const safeRequest = typeof request === "object" && request !== null ? request : ({} as GitManageTagBestPracticeRequest);
  const selection = selectGitManageTagPractice({
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
  return executeGitManageTagCore({
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

export const gitManageTagBaseToolDefinition = createGitBaseToolDefinition<
  GitManageTagHandlerInput,
  GitManageTagOutput
>({
  toolId: "git.manageTag",
  title: "Git Manage Tag",
  description: "List, create, annotate, or delete tags through fixed git tag actions.",
  summary: "Use git.manageTag to manage tags without exposing arbitrary git commands.",
  storageGroup: "branch",
  riskLevel: "risky",
  permissionHints: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
  dependencies: gitManageTagDependencyDeclarations,
  metadata: {
    runtimeEntryPort: gitManageTagDescriptor.runtimeEntryPort,
    operationRisk: gitManageTagDescriptor.operationRisk,
    allowedGitSubcommand: "tag",
    argvMode: "fixed-manage-tag",
    runtimeOwnsExecution: true,
    managesTag: true,
  },
  inputSchema: jsonSchema("git.manageTag.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        required: ["repositoryPath"],
        properties: {
          repositoryPath: { type: "string", minLength: 1 },
          action: { type: "string", enum: ["list", "create", "annotate", "delete"] },
          tagName: { type: "string" },
          targetRef: { type: "string" },
          message: { type: "string" },
          force: { type: "boolean" },
        },
      },
      context: invocationContextSchema,
      timeoutMs: { type: "integer", minimum: 1, maximum: gitManageTagDescriptor.maxTimeoutMs },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("git.manageTag.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "runtimeEntry", "risk", "gitArgs", "commandPreview", "dryRun", "providerCalled", "resultEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.git.manageTag" },
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
      managesTag: { type: "boolean" },
      resultEnvelope: { type: "object" },
    },
  }),
});

export const gitManageTagHandler: BaseToolHandler<GitManageTagHandlerInput, GitManageTagOutput> =
  createGitBaseCoreHandler(gitManageTagBaseToolDefinition, async (request) => {
    const selection = selectGitManageTagPractice({
      ...request.input,
      executor: request.executor,
      provider: request.input.provider,
    });
    const inputContext = isRecord(request.input.context) ? request.input.context : {};
    return executeGitManageTagCore({
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

export type { GitManageTagResult };
export { gitManageTagDescriptor, parseGitManageTagResult, planGitManageTag, planGitTagManagement };
