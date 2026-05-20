import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildGitBasePracticeAuditMetadata,
  createGitBaseCoreHandler,
  createGitBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import { anthropicGitManageIgnoreRulesPractice } from "./anthropic.js";
import {
  executeGitManageIgnoreRules as executeGitManageIgnoreRulesCore,
  gitManageIgnoreRulesDescriptor,
  planGitIgnoreRuleManagement,
  type GitManageIgnoreRulesOutput,
  type GitManageIgnoreRulesProvider,
  type GitManageIgnoreRulesRequest,
  type GitManageIgnoreRulesResult,
} from "./core.js";
import { deepmindGitManageIgnoreRulesPractice } from "./deepmind.js";
import {
  gitManageIgnoreRulesDependencyDeclarations,
  type GitManageIgnoreRulesDependencies,
  type GitManageIgnoreRulesPracticeProviderName,
  type GitManageIgnoreRulesProviderPractice,
} from "./dependencies.js";
import { openaiGitManageIgnoreRulesPractice } from "./openai.js";

export * from "./core.js";

export type GitManageIgnoreRulesBestPracticeRequest = GitManageIgnoreRulesRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: GitManageIgnoreRulesPracticeProviderName;
};

export type GitManageIgnoreRulesHandlerInput = Omit<GitManageIgnoreRulesBestPracticeRequest, "executor">;

export type GitManageIgnoreRulesPracticeSelection = {
  providerName: GitManageIgnoreRulesPracticeProviderName;
  practice: GitManageIgnoreRulesProviderPractice;
  provider?: GitManageIgnoreRulesProvider;
};

export const gitManageIgnoreRulesProviderPractices = [
  anthropicGitManageIgnoreRulesPractice,
  openaiGitManageIgnoreRulesPractice,
  deepmindGitManageIgnoreRulesPractice,
] as const;

export const gitManageIgnoreRulesBestPracticeDescriptor = {
  toolId: "git.manageIgnoreRules",
  bestPractice: "storage-owned-ignore-rules-with-runtime-filesystem-support",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: gitManageIgnoreRulesDependencyDeclarations,
} as const;

function orderedPractices(
  preferredProvider: GitManageIgnoreRulesPracticeProviderName | undefined,
): readonly GitManageIgnoreRulesProviderPractice[] {
  if (preferredProvider === undefined) return gitManageIgnoreRulesProviderPractices;
  return [
    ...gitManageIgnoreRulesProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...gitManageIgnoreRulesProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectGitManageIgnoreRulesPractice(
  dependencies: GitManageIgnoreRulesDependencies & { preferredProvider?: GitManageIgnoreRulesPracticeProviderName } = {},
): GitManageIgnoreRulesPracticeSelection {
  for (const practice of orderedPractices(dependencies.preferredProvider)) {
    const provider = practice.createProvider(dependencies);
    if (provider !== undefined) return { providerName: practice.providerName, practice, provider };
  }
  return {
    providerName: "praxis-native",
    practice: {
      providerName: "praxis-native",
      source: { kind: "praxis-native", label: "Praxis dry-run fallback" },
      directCliSupport: false,
      sideEffectPolicy: "runtime-governed",
      notes: ["No injected or runtime filesystem provider is currently available; dry-run remains available."],
      createProvider: () => undefined,
    },
  };
}

function practiceAuditMetadata(selection: GitManageIgnoreRulesPracticeSelection): Readonly<Record<string, unknown>> {
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

export async function executeGitManageIgnoreRules(
  request: GitManageIgnoreRulesBestPracticeRequest = {},
): ReturnType<typeof executeGitManageIgnoreRulesCore> {
  const selection = selectGitManageIgnoreRulesPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  return executeGitManageIgnoreRulesCore({
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
    guard: { type: "object", additionalProperties: true },
    allowedRepositoryRoots: { type: "array", items: { type: "string" } },
    grantedPermissions: { type: "array", items: { type: "string" } },
  },
} as const;

export const gitManageIgnoreRulesBaseToolDefinition = createGitBaseToolDefinition<
  GitManageIgnoreRulesHandlerInput,
  GitManageIgnoreRulesOutput
>({
  toolId: "git.manageIgnoreRules",
  title: "Git Manage Ignore Rules",
  description: "Inspect or mutate repository ignore rules through governed runtime filesystem IO.",
  summary: "Use git.manageIgnoreRules for .gitignore changes instead of shell redirection or arbitrary git commands.",
  storageGroup: "file",
  riskLevel: "risky",
  permissionHints: ["git:read", "filesystem:read", "filesystem:write"],
  dependencies: gitManageIgnoreRulesDependencyDeclarations,
  metadata: {
    runtimeEntryPort: gitManageIgnoreRulesDescriptor.runtimeEntryPort,
    operationRisk: gitManageIgnoreRulesDescriptor.operationRisk,
    fixedAction: "manage-ignore-rules",
    runtimeOwnsExecution: true,
  },
  inputSchema: jsonSchema("git.manageIgnoreRules.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        required: ["repositoryPath", "action"],
        properties: {
          repositoryPath: { type: "string", minLength: 1 },
          action: { enum: ["inspect", "add", "remove", "replace"] },
          ignoreFilePath: { type: "string" },
          rules: { type: "array", items: { type: "string" } },
        },
      },
      context: invocationContextSchema,
      timeoutMs: { type: "integer", minimum: 1, maximum: gitManageIgnoreRulesDescriptor.maxTimeoutMs },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("git.manageIgnoreRules.output", { type: "object", additionalProperties: true }),
});

export const gitManageIgnoreRulesHandler: BaseToolHandler<GitManageIgnoreRulesHandlerInput, GitManageIgnoreRulesOutput> =
  createGitBaseCoreHandler(gitManageIgnoreRulesBaseToolDefinition, async (request) => {
    const selection = selectGitManageIgnoreRulesPractice({
      ...request.input,
      executor: request.executor,
      provider: request.input.provider,
    });
    const inputContext = request.input.context ?? {};
    return executeGitManageIgnoreRulesCore({
      ...request.input,
      provider: selection.provider,
      context: {
        ...inputContext,
        runtimeId: inputContext.runtimeId ?? request.runtimeId,
        sessionId: inputContext.sessionId ?? request.sessionId,
        invocationId: inputContext.invocationId ?? request.toolCallId,
        auditMetadata: injectRuntimeInvocationMetadata(
          { ...practiceAuditMetadata(selection), ...(request.metadata ?? {}) },
          inputContext.auditMetadata,
          request,
        ),
      },
    });
  });

export type { GitManageIgnoreRulesResult };
export { gitManageIgnoreRulesDescriptor, planGitIgnoreRuleManagement };
