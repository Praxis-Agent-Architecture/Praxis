import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildCodeBasePracticeAuditMetadata,
  createCodeBaseCoreHandler,
  createCodeBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import { anthropicCodeTestPractice } from "./anthropic.js";
import { deepmindCodeTestPractice } from "./deepmind.js";
import { openaiCodeTestPractice } from "./openai.js";
import {
  executeCodeTest as executeCodeTestCore,
  planCodeTest,
  codeTestDescriptor,
  type CodeTestOutput,
  type CodeTestProvider,
  type CodeTestRequest,
  type CodeTestResult,
} from "./core.js";
import {
  codeTestDependencyDeclarations,
  type CodeTestDependencies,
  type CodeTestPracticeProviderName,
  type CodeTestProviderPractice,
} from "./dependencies.js";

export * from "./core.js";

export type CodeTestBestPracticeRequest = CodeTestRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: CodeTestPracticeProviderName;
};
export type CodeTestHandlerInput = Omit<CodeTestBestPracticeRequest, "executor">;
export type CodeTestPracticeSelection = {
  providerName: CodeTestPracticeProviderName;
  practice: CodeTestProviderPractice;
  provider?: CodeTestProvider;
};

export const codeTestProviderPractices = [anthropicCodeTestPractice, openaiCodeTestPractice, deepmindCodeTestPractice] as const;
export const codeTestBestPracticeDescriptor = {
  toolId: "code.testCode",
  bestPractice: "storage-owned-code-test-with-runtime-process-support",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: codeTestDependencyDeclarations,
} as const;

function orderedPractices(preferredProvider: CodeTestPracticeProviderName | undefined): readonly CodeTestProviderPractice[] {
  if (preferredProvider === undefined) return codeTestProviderPractices;
  return [...codeTestProviderPractices.filter((practice) => practice.providerName === preferredProvider), ...codeTestProviderPractices.filter((practice) => practice.providerName !== preferredProvider)];
}

export function selectCodeTestPractice(dependencies: CodeTestDependencies & { preferredProvider?: CodeTestPracticeProviderName } = {}): CodeTestPracticeSelection {
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
      notes: ["No injected or host process provider is available; dry-run remains available."],
      createProvider: () => undefined,
    },
  };
}

function practiceAuditMetadata(selection: CodeTestPracticeSelection): Readonly<Record<string, unknown>> {
  return buildCodeBasePracticeAuditMetadata({
    providerName: selection.providerName,
    sourceLabel: selection.practice.source.label,
    sourceKind: selection.practice.source.kind,
    sourcePath: selection.practice.source.path,
    directCliSupport: selection.practice.directCliSupport,
    sideEffectPolicy: selection.practice.sideEffectPolicy,
    notes: selection.practice.notes,
  });
}

export async function executeCodeTest(request: CodeTestBestPracticeRequest = {}): ReturnType<typeof executeCodeTestCore> {
  const selection = selectCodeTestPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  return executeCodeTestCore({
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
  },
} as const;

export const codeTestBaseToolDefinition = createCodeBaseToolDefinition<CodeTestHandlerInput, CodeTestOutput>({
  toolId: "code.testCode",
  title: "Code Test",
  description: "Run a fixed code test target through governed runtime process support.",
  summary: "Use code.testCode for running project tests without asking the model to compose shell commands.",
  storageGroup: "testCode",
  riskLevel: "risky",
  permissionHints: ["workspace:read", "process:spawn"],
  dependencies: codeTestDependencyDeclarations,
  inputSchema: jsonSchema("code.testCode.input", {
    type: "object",
    additionalProperties: true,
    required: ["workspaceRoot", "testTarget"],
    properties: {
      workspaceRoot: { type: "string" },
      testTarget: { type: "string" },
      command: { type: "array", items: { type: "string" } },
      testFramework: { type: "string" },
      updateSnapshots: { type: "boolean" },
      timeoutMs: { type: "integer", minimum: 1, maximum: 600000 },
      dryRun: { type: "boolean" },
      context: invocationContextSchema,
    },
  }),
  outputSchema: jsonSchema("code.testCode.output", { type: "object", additionalProperties: true }),
});

export const codeTestHandler: BaseToolHandler<CodeTestHandlerInput, CodeTestOutput> = createCodeBaseCoreHandler(
  codeTestBaseToolDefinition,
  async (request) => {
    const selection = selectCodeTestPractice({
      ...request.input,
      executor: request.executor,
      provider: request.input.provider,
    });
    const inputContext = request.input.context ?? {};
    return executeCodeTestCore({
      ...request.input,
      provider: selection.provider,
      context: {
        ...inputContext,
        runtimeId: inputContext.runtimeId ?? request.runtimeId,
        sessionId: inputContext.sessionId ?? request.sessionId,
        invocationId: inputContext.invocationId ?? request.toolCallId,
        auditMetadata: injectRuntimeInvocationMetadata({ ...practiceAuditMetadata(selection), ...(request.metadata ?? {}) }, inputContext.auditMetadata, request),
      },
    });
  },
);

export type { CodeTestResult };
export { codeTestDescriptor, planCodeTest };
