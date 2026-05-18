import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildGitBasePracticeAuditMetadata,
  createGitBaseCoreHandler,
  createGitBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import { anthropicGitRemoveTrackedFilePractice } from "./anthropic.js";
import { deepmindGitRemoveTrackedFilePractice } from "./deepmind.js";
import {
  executeGitRemoveTrackedFile as executeGitRemoveTrackedFileCore,
  gitRemoveTrackedFileDescriptor,
  planGitRemoveTrackedFile,
  type GitRemoveTrackedFileOutput,
  type GitRemoveTrackedFileProvider,
  type GitRemoveTrackedFileRequest,
  type GitRemoveTrackedFileResult,
} from "./core.js";
import {
  gitRemoveTrackedFileDependencyDeclarations,
  type GitRemoveTrackedFileDependencies,
  type GitRemoveTrackedFilePracticeProviderName,
  type GitRemoveTrackedFileProviderPractice,
} from "./dependencies.js";
import { openaiGitRemoveTrackedFilePractice } from "./openai.js";

export * from "./core.js";

export type GitRemoveTrackedFileBestPracticeRequest = GitRemoveTrackedFileRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: GitRemoveTrackedFilePracticeProviderName;
};

export type GitRemoveTrackedFileHandlerInput = Omit<GitRemoveTrackedFileBestPracticeRequest, "executor">;

export type GitRemoveTrackedFilePracticeSelection = {
  providerName: GitRemoveTrackedFilePracticeProviderName;
  practice: GitRemoveTrackedFileProviderPractice;
  provider?: GitRemoveTrackedFileProvider;
};

export const gitRemoveTrackedFileProviderPractices = [
  anthropicGitRemoveTrackedFilePractice,
  openaiGitRemoveTrackedFilePractice,
  deepmindGitRemoveTrackedFilePractice,
] as const;

export const gitRemoveTrackedFileBestPracticeDescriptor = {
  toolId: "git.removeTrackedFile",
  bestPractice: "runtime-gitExecutor-remove-tracked-file-workspace-mutation",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: gitRemoveTrackedFileDependencyDeclarations,
} as const;

function orderedPractices(
  preferredProvider: GitRemoveTrackedFilePracticeProviderName | undefined,
): readonly GitRemoveTrackedFileProviderPractice[] {
  if (preferredProvider === undefined) {
    return gitRemoveTrackedFileProviderPractices;
  }
  return [
    ...gitRemoveTrackedFileProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...gitRemoveTrackedFileProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectGitRemoveTrackedFilePractice(
  dependencies: GitRemoveTrackedFileDependencies & {
    preferredProvider?: GitRemoveTrackedFilePracticeProviderName;
  } = {},
): GitRemoveTrackedFilePracticeSelection {
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

function practiceAuditMetadata(selection: GitRemoveTrackedFilePracticeSelection): Readonly<Record<string, unknown>> {
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

export async function executeGitRemoveTrackedFile(
  request: GitRemoveTrackedFileBestPracticeRequest = {},
): ReturnType<typeof executeGitRemoveTrackedFileCore> {
  const selection = selectGitRemoveTrackedFilePractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  return executeGitRemoveTrackedFileCore({
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

export const gitRemoveTrackedFileBaseToolDefinition = createGitBaseToolDefinition<
  GitRemoveTrackedFileHandlerInput,
  GitRemoveTrackedFileOutput
>({
  toolId: "git.removeTrackedFile",
  title: "Git Remove Tracked File",
  description: "Remove a tracked file through a fixed git rm action.",
  summary: "Use git.removeTrackedFile to remove a tracked file without exposing arbitrary git commands.",
  storageGroup: "file",
  riskLevel: "dangerous",
  permissionHints: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
  dependencies: gitRemoveTrackedFileDependencyDeclarations,
  metadata: {
    runtimeEntryPort: gitRemoveTrackedFileDescriptor.runtimeEntryPort,
    operationRisk: gitRemoveTrackedFileDescriptor.operationRisk,
    allowedGitSubcommand: "rm",
    argvMode: "fixed-remove-tracked-file-workspace-mutation",
    runtimeOwnsExecution: true,
    removesTrackedFile: true,
  },
  inputSchema: jsonSchema("git.removeTrackedFile.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        required: ["repositoryPath", "filePath"],
        properties: {
          repositoryPath: { type: "string", minLength: 1 },
          filePath: { type: "string", minLength: 1 },
          keepWorkingTree: { type: "boolean" },
          force: { type: "boolean" },
        },
      },
      context: invocationContextSchema,
      timeoutMs: { type: "integer", minimum: 1, maximum: gitRemoveTrackedFileDescriptor.maxTimeoutMs },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("git.removeTrackedFile.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "runtimeEntry", "risk", "gitArgs", "commandPreview", "dryRun", "providerCalled", "resultEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.git.removeTrackedFile" },
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
      removesTrackedFile: { type: "boolean" },
      resultEnvelope: { type: "object" },
    },
  }),
});

export const gitRemoveTrackedFileHandler: BaseToolHandler<GitRemoveTrackedFileHandlerInput, GitRemoveTrackedFileOutput> =
  createGitBaseCoreHandler(gitRemoveTrackedFileBaseToolDefinition, async (request) => {
    const selection = selectGitRemoveTrackedFilePractice({
      ...request.input,
      executor: request.executor,
      provider: request.input.provider,
    });
    const inputContext = request.input.context ?? {};
    return executeGitRemoveTrackedFileCore({
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

export type { GitRemoveTrackedFileResult };
export { gitRemoveTrackedFileDescriptor, planGitRemoveTrackedFile };
