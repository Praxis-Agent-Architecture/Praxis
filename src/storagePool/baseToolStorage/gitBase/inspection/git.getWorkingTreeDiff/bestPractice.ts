import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildGitBasePracticeAuditMetadata,
  createGitBaseCoreHandler,
  createGitBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import { anthropicGitWorkingTreeDiffPractice } from "./anthropic.js";
import { deepmindGitWorkingTreeDiffPractice } from "./deepmind.js";
import {
  executeGitWorkingTreeDiff as executeGitWorkingTreeDiffCore,
  gitGetWorkingTreeDiffDescriptor,
  planGetWorkingTreeDiff,
  type GitGetWorkingTreeDiffOutput,
  type GitGetWorkingTreeDiffRequest,
  type GitGetWorkingTreeDiffResult,
  type GitWorkingTreeDiffProvider,
} from "./core.js";
import {
  gitGetWorkingTreeDiffDependencyDeclarations,
  type GitGetWorkingTreeDiffDependencies,
  type GitGetWorkingTreeDiffPracticeProviderName,
  type GitGetWorkingTreeDiffProviderPractice,
} from "./dependencies.js";
import { openaiGitWorkingTreeDiffPractice } from "./openai.js";

export * from "./core.js";

export type GitGetWorkingTreeDiffBestPracticeRequest = GitGetWorkingTreeDiffRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: GitGetWorkingTreeDiffPracticeProviderName;
};

export type GitGetWorkingTreeDiffHandlerInput = Omit<GitGetWorkingTreeDiffBestPracticeRequest, "executor">;

export type GitGetWorkingTreeDiffPracticeSelection = {
  providerName: GitGetWorkingTreeDiffPracticeProviderName;
  practice: GitGetWorkingTreeDiffProviderPractice;
  provider?: GitWorkingTreeDiffProvider;
};

export const gitGetWorkingTreeDiffProviderPractices = [
  anthropicGitWorkingTreeDiffPractice,
  openaiGitWorkingTreeDiffPractice,
  deepmindGitWorkingTreeDiffPractice,
] as const;

export const gitGetWorkingTreeDiffBestPracticeDescriptor = {
  toolId: "git.getWorkingTreeDiff",
  bestPractice: "runtime-gitExecutor-diff-read",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: gitGetWorkingTreeDiffDependencyDeclarations,
} as const;

function orderedPractices(
  preferredProvider: GitGetWorkingTreeDiffPracticeProviderName | undefined,
): readonly GitGetWorkingTreeDiffProviderPractice[] {
  if (preferredProvider === undefined) {
    return gitGetWorkingTreeDiffProviderPractices;
  }
  return [
    ...gitGetWorkingTreeDiffProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...gitGetWorkingTreeDiffProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectGitGetWorkingTreeDiffPractice(
  dependencies: GitGetWorkingTreeDiffDependencies & {
    preferredProvider?: GitGetWorkingTreeDiffPracticeProviderName;
  } = {},
): GitGetWorkingTreeDiffPracticeSelection {
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

function practiceAuditMetadata(selection: GitGetWorkingTreeDiffPracticeSelection): Readonly<Record<string, unknown>> {
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

export async function executeGitWorkingTreeDiff(
  request: GitGetWorkingTreeDiffBestPracticeRequest = {},
): ReturnType<typeof executeGitWorkingTreeDiffCore> {
  const selection = selectGitGetWorkingTreeDiffPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  return executeGitWorkingTreeDiffCore({
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

export const gitGetWorkingTreeDiffBaseToolDefinition = createGitBaseToolDefinition<
  GitGetWorkingTreeDiffHandlerInput,
  GitGetWorkingTreeDiffOutput
>({
  toolId: "git.getWorkingTreeDiff",
  title: "Git Working Tree Diff",
  description: "Read a fixed git diff view through the governed runtime git executor.",
  summary: "Use git.getWorkingTreeDiff to inspect unstaged, staged, or combined working-tree diff without mutation.",
  storageGroup: "inspection",
  riskLevel: "normal",
  permissionHints: ["git:read", "filesystem:read"],
  dependencies: gitGetWorkingTreeDiffDependencyDeclarations,
  metadata: {
    runtimeEntryPort: gitGetWorkingTreeDiffDescriptor.runtimeEntryPort,
    operationRisk: gitGetWorkingTreeDiffDescriptor.operationRisk,
    allowedGitSubcommand: "diff",
    argvMode: "fixed-diff-read",
    runtimeOwnsExecution: true,
  },
  inputSchema: jsonSchema("git.getWorkingTreeDiff.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        required: ["repositoryPath"],
        properties: {
          repositoryPath: { type: "string", minLength: 1 },
          mode: { type: "string", enum: ["unstaged", "staged", "combined"] },
          compareRef: { type: "string" },
          pathspecs: { type: "array", items: { type: "string" } },
          contextLines: { type: "integer", minimum: 0, maximum: 1000 },
        },
      },
      context: invocationContextSchema,
      timeoutMs: { type: "integer", minimum: 1, maximum: gitGetWorkingTreeDiffDescriptor.maxTimeoutMs },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("git.getWorkingTreeDiff.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "runtimeEntry", "risk", "gitArgs", "commandPreview", "dryRun", "providerCalled", "resultEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.git.getWorkingTreeDiff" },
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

export const gitGetWorkingTreeDiffHandler: BaseToolHandler<
  GitGetWorkingTreeDiffHandlerInput,
  GitGetWorkingTreeDiffOutput
> = createGitBaseCoreHandler(gitGetWorkingTreeDiffBaseToolDefinition, async (request) => {
  const selection = selectGitGetWorkingTreeDiffPractice({
    ...request.input,
    executor: request.executor,
    provider: request.input.provider,
  });
  const inputContext = request.input.context ?? {};
  return executeGitWorkingTreeDiffCore({
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

export type { GitGetWorkingTreeDiffResult };
export { gitGetWorkingTreeDiffDescriptor, planGetWorkingTreeDiff };
