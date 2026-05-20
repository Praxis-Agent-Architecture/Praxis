import type { BaseToolHandler } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import {
  buildPracticeAuditMetadata,
  createLspBaseToolDefinition,
  createLspCoreHandler,
  injectInvocationAudit,
  jsonSchema,
  lspCommonSchemaFragments,
  normalizeLspDependencyDeclarations,
  preferAnthropicExecutor,
} from "../_shared/baseToolAdapter.js";
import {
  locateLspTypeDefinition as locateLspTypeDefinitionCore,
  type LspLocateTypeDefinitionOutput,
  type LspLocateTypeDefinitionProvider,
  type LspLocateTypeDefinitionRequest,
} from "./core.js";
import { anthropicLspLocateTypeDefinitionPractice } from "./anthropic.js";
import { lspLocateTypeDefinitionDependencyDeclarations, type LspLocateTypeDefinitionPracticeProviderName } from "./dependencies.js";
import { deepmindLspLocateTypeDefinitionPractice } from "./deepmind.js";
import { openaiLspLocateTypeDefinitionPractice } from "./openai.js";

export * from "./core.js";

export type LspLocateTypeDefinitionBestPracticeRequest = LspLocateTypeDefinitionRequest & {
  preferredProvider?: LspLocateTypeDefinitionPracticeProviderName;
};

export const lspLocateTypeDefinitionProviderPractices = [
  anthropicLspLocateTypeDefinitionPractice,
  openaiLspLocateTypeDefinitionPractice,
  deepmindLspLocateTypeDefinitionPractice,
] as const;

export const lspLocateTypeDefinitionBestPracticeDescriptor = {
  toolId: "code.lsp_locateTypeDefinition",
  bestPractice: "anthropic-host-executor-or-shared-stdio-lsp-runtime",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerPractices: lspLocateTypeDefinitionProviderPractices,
  dependencies: lspLocateTypeDefinitionDependencyDeclarations,
} as const;

function createExecutorProvider(executor: BaseToolExecutorPort | undefined): LspLocateTypeDefinitionProvider | undefined {
  const locateTypeDefinition = executor?.lsp?.locateTypeDefinition;
  if (locateTypeDefinition === undefined) {
    return undefined;
  }

  return async (target, context) => {
    const result = await locateTypeDefinition({
      target,
      context: {
        invocationId: context.invocationId,
        workspaceRoot: context.workspaceRoot,
        auditMetadata: context.auditMetadata,
      },
    });

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    return result.output.locations.map((location) => ({
      ...location,
      source: "provider" as const,
    }));
  };
}

export const lspLocateTypeDefinitionBaseToolDefinition = createLspBaseToolDefinition<
  LspLocateTypeDefinitionBestPracticeRequest,
  LspLocateTypeDefinitionOutput
>({
  toolId: "code.lsp_locateTypeDefinition",
  title: "Code LSP Locate Type Definition",
  description: "Resolve the type definition location for a symbol through a governed LSP provider.",
  summary: "Use code.lsp_locateTypeDefinition when the agent needs a symbol's type-definition site.",
  permissionHints: ["workspace:read", "lsp:read"],
  dependencies: normalizeLspDependencyDeclarations(lspLocateTypeDefinitionDependencyDeclarations),
  inputSchema: jsonSchema("code.lsp_locateTypeDefinition.input", {
    type: "object",
    additionalProperties: true,
    required: ["target"],
    properties: {
      target: {
        type: "object",
        additionalProperties: false,
        required: ["filePath", "line", "character"],
        properties: {
          filePath: { type: "string", minLength: 1 },
          line: { type: "integer", minimum: 0 },
          character: { type: "integer", minimum: 0 },
          languageId: { type: "string" },
        },
      },
      context: lspCommonSchemaFragments.invocationContext,
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("code.lsp_locateTypeDefinition.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "locations", "dryRun", "providerCalled"],
    properties: {
      kind: { const: "agentCore.basicTool.lsp.locateTypeDefinition" },
      target: {
        type: "object",
        additionalProperties: false,
        required: ["filePath", "line", "character"],
        properties: {
          filePath: { type: "string" },
          line: { type: "integer", minimum: 0 },
          character: { type: "integer", minimum: 0 },
          languageId: { type: "string" },
        },
      },
      locations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: true,
          required: ["filePath", "range"],
          properties: {
            filePath: { type: "string" },
            range: lspCommonSchemaFragments.lspRange,
          },
        },
      },
      dryRun: { type: "boolean" },
      providerCalled: { type: "boolean" },
    },
  }),
});

export const lspLocateTypeDefinitionHandler: BaseToolHandler<
  LspLocateTypeDefinitionBestPracticeRequest,
  LspLocateTypeDefinitionOutput
> = createLspCoreHandler(lspLocateTypeDefinitionBaseToolDefinition, async (request) => {
  const selection = preferAnthropicExecutor(
    request.executor,
    (executor) => executor.lsp?.locateTypeDefinition !== undefined,
    lspLocateTypeDefinitionProviderPractices,
    request.input.preferredProvider,
  );

  return await locateLspTypeDefinitionCore({
    ...request.input,
    provider: request.input.provider ?? createExecutorProvider(request.executor),
    context: {
      ...request.input.context,
      invocationId: request.input.context?.invocationId ?? request.toolCallId,
      auditMetadata: injectInvocationAudit(
        {
          ...buildPracticeAuditMetadata(selection),
          ...(request.metadata ?? {}),
        },
        request.input.context?.auditMetadata,
        request,
      ),
    },
  });
});
