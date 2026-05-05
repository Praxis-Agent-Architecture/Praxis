import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { anthropicCodeReadPractice } from "./anthropic.js";
import { deepmindCodeReadPractice } from "./deepmind.js";
import { openaiCodeReadPractice } from "./openai.js";
import {
  buildCodeBasePracticeAuditMetadata,
  createCodeBaseCoreHandler,
  createCodeBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import {
  executeCodeRead as executeCodeReadCore,
  type CodeReadContext,
  type CodeReadOutput,
  type CodeReadProvider,
  type CodeReadRequest,
} from "./core.js";
import {
  codeReadDependencyDeclarations,
  type CodeReadDependencies,
  type CodeReadPracticeProviderName,
  type CodeReadProviderPractice,
} from "./dependencies.js";

export * from "./core.js";

export type CodeReadBestPracticeRequest = CodeReadRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: CodeReadPracticeProviderName;
};

export type CodeReadHandlerInput = Omit<CodeReadBestPracticeRequest, "executor">;

export type CodeReadPracticeSelection = {
  providerName: CodeReadPracticeProviderName;
  practice: CodeReadProviderPractice;
  provider?: CodeReadProvider;
};

export const codeReadProviderPractices = [
  anthropicCodeReadPractice,
  openaiCodeReadPractice,
  deepmindCodeReadPractice,
] as const;

export const codeReadBestPracticeDescriptor = {
  toolId: "code.read",
  bestPractice: "storage-owned-code-read-with-runtime-filesystem-support",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: codeReadDependencyDeclarations,
} as const;

function orderedPractices(preferredProvider: CodeReadPracticeProviderName | undefined): readonly CodeReadProviderPractice[] {
  if (preferredProvider === undefined) {
    return codeReadProviderPractices;
  }
  return [
    ...codeReadProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...codeReadProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectCodeReadPractice(
  dependencies: CodeReadDependencies & { preferredProvider?: CodeReadPracticeProviderName } = {},
): CodeReadPracticeSelection {
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
      sideEffectPolicy: "read-only",
      notes: ["No injected or host filesystem reader is available; dry-run remains available."],
      createProvider: () => undefined,
    },
  };
}

function practiceAuditMetadata(selection: CodeReadPracticeSelection): Readonly<Record<string, unknown>> {
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

export async function executeCodeRead(request: CodeReadBestPracticeRequest = {}): ReturnType<typeof executeCodeReadCore> {
  const selection = selectCodeReadPractice({
    executor: request.executor,
    provider: request.reader ?? request.provider,
    preferredProvider: request.preferredProvider,
  });
  return executeCodeReadCore({
    ...request,
    reader: selection.provider,
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
    workspaceRoot: { type: "string" },
    allowedRoots: { type: "array", items: { type: "string" } },
    guard: {
      type: "object",
      additionalProperties: true,
      properties: {
        allowed: { type: "boolean" },
        accepted: { type: "boolean" },
        reason: { type: "string" },
      },
    },
  },
} as const;

export const codeReadBaseToolDefinition = createCodeBaseToolDefinition<CodeReadHandlerInput, CodeReadOutput>({
  toolId: "code.read",
  title: "Code Read",
  description: "Read one or more code files through governed runtime filesystem support.",
  summary: "Use code.read for small-range reads, whole-file reads, and multi-file code reads without shell.",
  storageGroup: "explore",
  riskLevel: "normal",
  permissionHints: ["filesystem:read"],
  dependencies: codeReadDependencyDeclarations,
  inputSchema: jsonSchema("code.read.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      targetPath: { type: "string" },
      targetPaths: { type: "array", items: { type: "string" } },
      targets: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: true,
          required: ["targetPath"],
          properties: {
            targetPath: { type: "string" },
            range: { type: "object", additionalProperties: true },
          },
        },
      },
      range: { type: "object", additionalProperties: true },
      maxBytes: { type: "integer", minimum: 1 },
      maxBytesPerFile: { type: "integer", minimum: 1 },
      maxTotalBytes: { type: "integer", minimum: 1 },
      encoding: { type: "string" },
      includeLineNumbers: { type: "boolean" },
      context: invocationContextSchema,
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("code.read.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "targetPath", "content", "files", "bytes", "truncated"],
    properties: {
      kind: { const: "agentCore.basicTool.code.read.output" },
      targetPath: { type: "string" },
      targetPaths: { type: "array", items: { type: "string" } },
      content: { type: "string" },
      files: { type: "array" },
      bytes: { type: "integer", minimum: 0 },
      truncated: { type: "boolean" },
    },
  }),
});

export const codeReadHandler: BaseToolHandler<CodeReadHandlerInput, CodeReadOutput> = createCodeBaseCoreHandler(
  codeReadBaseToolDefinition,
  async (request) => {
    const selection = selectCodeReadPractice({
      ...request.input,
      executor: request.executor,
      provider: request.input.reader ?? request.input.provider,
    });
    const inputContext = request.input.context ?? {};
    const context: CodeReadContext = {
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
    };
    return executeCodeReadCore({
      ...request.input,
      reader: selection.provider,
      context,
    });
  },
);
