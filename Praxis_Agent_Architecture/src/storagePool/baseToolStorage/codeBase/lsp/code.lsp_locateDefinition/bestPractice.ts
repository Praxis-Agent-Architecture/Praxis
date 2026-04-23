/*
 * 文件定位：storagePool / baseToolStorage / code.lsp_locateDefinition bestPractice。
 * 核心目的：比较三家来源实践，并给 baseTools 入口提供稳定的最佳实践调用面。
 */

import type {
  BaseToolDefinition,
  BaseToolHandler,
  BaseToolInvokeRequest,
  BaseToolInvokeResult,
} from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { anthropicLspLocateDefinitionPractice } from "./anthropic.js";
import { deepmindLspLocateDefinitionPractice } from "./deepmind.js";
import {
  buildPracticeAuditMetadata,
  createLspBaseToolDefinition,
  injectInvocationAudit,
  jsonSchema,
  lspCommonSchemaFragments,
} from "../_shared/baseToolAdapter.js";
import type {
  LspLocateDefinitionDependencies,
  LspLocateDefinitionPracticeProviderName,
  LspLocateDefinitionProviderPractice,
  LspLocateDefinitionRuntimeOptions,
} from "./dependencies.js";
import { lspLocateDefinitionDependencyDeclarations } from "./dependencies.js";
import { openaiLspLocateDefinitionPractice } from "./openai.js";
import type {
  LspLocateDefinitionOutput,
  LspLocateDefinitionProvider,
  LspLocateDefinitionRequest,
} from "../code.lsp_locateDefinition.js";
import { locateLspDefinition as locateLspDefinitionCore } from "../code.lsp_locateDefinition.js";

export type LspLocateDefinitionBestPracticeRequest = LspLocateDefinitionRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: LspLocateDefinitionPracticeProviderName;
  runtime?: LspLocateDefinitionRuntimeOptions;
};

export type LspLocateDefinitionPracticeSelection = {
  providerName: LspLocateDefinitionPracticeProviderName;
  practice: LspLocateDefinitionProviderPractice;
  provider?: LspLocateDefinitionProvider;
};

export const lspLocateDefinitionProviderPractices = [
  anthropicLspLocateDefinitionPractice,
  openaiLspLocateDefinitionPractice,
  deepmindLspLocateDefinitionPractice,
] as const;

export const lspLocateDefinitionBestPracticeDescriptor = {
  toolId: "code.lsp_locateDefinition",
  bestPractice: "anthropic.cli.lspTool.with-praxis-stdio-lsp-runtime",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: lspLocateDefinitionDependencyDeclarations,
} as const;

function orderedPractices(
  preferredProvider: LspLocateDefinitionPracticeProviderName | undefined,
): readonly LspLocateDefinitionProviderPractice[] {
  if (preferredProvider === undefined) {
    return lspLocateDefinitionProviderPractices;
  }

  return [
    ...lspLocateDefinitionProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...lspLocateDefinitionProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectLspLocateDefinitionPractice(
  dependencies: LspLocateDefinitionDependencies & {
    preferredProvider?: LspLocateDefinitionPracticeProviderName;
  } = {},
): LspLocateDefinitionPracticeSelection {
  for (const practice of orderedPractices(dependencies.preferredProvider)) {
    const provider = practice.createProvider(dependencies);
    if (provider !== undefined) {
      return {
        providerName: practice.providerName,
        practice,
        provider,
      };
    }
  }

  return {
    providerName: "praxis-native",
    practice: {
      providerName: "praxis-native",
      source: {
        kind: "praxis-native",
        label: "Praxis dry-run fallback",
      },
      directCliSupport: false,
      notes: ["No injected or host LSP provider is currently available; dry-run remains available."],
      createProvider: () => undefined,
    },
  };
}

export async function locateLspDefinition(
  request: LspLocateDefinitionBestPracticeRequest = {},
): ReturnType<typeof locateLspDefinitionCore> {
  const selection = selectLspLocateDefinitionPractice({
    executor: request.executor,
    provider: request.provider,
    runtime: request.runtime,
    preferredProvider: request.preferredProvider,
  });

  return locateLspDefinitionCore({
    target: request.target,
    context: {
      ...request.context,
      auditMetadata: {
        ...(request.context?.auditMetadata ?? {}),
        selectedPractice: selection.providerName,
        selectedPracticeSource: selection.practice.source.label,
        directCliSupport: selection.practice.directCliSupport,
      },
    },
    provider: selection.provider,
  });
}

export type LspLocateDefinitionHandlerInput = Omit<LspLocateDefinitionBestPracticeRequest, "executor">;

export const lspLocateDefinitionBaseToolDefinition = createLspBaseToolDefinition<
  LspLocateDefinitionHandlerInput,
  LspLocateDefinitionOutput
>({
  toolId: "code.lsp_locateDefinition",
  title: "Code LSP Locate Definition",
  description: "Locate the definition of a symbol through a governed LSP provider.",
  summary: "Use code.lsp_locateDefinition to resolve a symbol position to one or more definition locations.",
  permissionHints: ["workspace:read", "lsp:read"],
  dependencies: lspLocateDefinitionDependencyDeclarations,
  inputSchema: jsonSchema("code.lsp_locateDefinition.input", {
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
  outputSchema: jsonSchema("code.lsp_locateDefinition.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "locations", "dryRun", "providerCalled"],
    properties: {
      kind: { const: "agentCore.basicTool.lsp.locateDefinition" },
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

export const lspLocateDefinitionHandler: BaseToolHandler<
  LspLocateDefinitionHandlerInput,
  LspLocateDefinitionOutput
> = {
  definition: lspLocateDefinitionBaseToolDefinition,
  async invoke(
    request: BaseToolInvokeRequest<LspLocateDefinitionHandlerInput>,
  ): Promise<BaseToolInvokeResult<LspLocateDefinitionOutput>> {
    const result = await locateLspDefinition({
      ...request.input,
      executor: request.executor,
      context: {
        ...request.input.context,
        invocationId: request.input.context?.invocationId ?? request.toolCallId,
        auditMetadata: {
          ...injectInvocationAudit(
            {
              ...(() => {
                const selection = selectLspLocateDefinitionPractice({
                  executor: request.executor,
                  provider: request.input.provider,
                  runtime: request.input.runtime,
                  preferredProvider: request.input.preferredProvider,
                });
                return {
                  selectedPractice: selection.providerName,
                  selectedPracticeSource:
                    typeof selection.practice.source === "string" ? selection.practice.source : selection.practice.source.label,
                  selectedPracticeSourceKind:
                    typeof selection.practice.source === "string" ? undefined : selection.practice.source.kind,
                  selectedPracticeSourcePath:
                    typeof selection.practice.source === "string" ? undefined : selection.practice.source.path,
                  directCliSupport: selection.practice.directCliSupport,
                  sideEffectPolicy: undefined,
                };
              })(),
              ...(request.metadata ?? {}),
            },
            request.input.context?.auditMetadata,
            request,
          ),
        },
      },
    });

    if (!result.ok) {
      return {
        ok: false,
        toolId: result.toolId,
        error: {
          code: result.error.code,
          message: result.error.message,
          publicSafe: true,
        },
        events: result.events,
      };
    }

    return {
      ok: true,
      toolId: result.toolId,
      output: result.output,
      events: result.events,
      metadata: {
        audit: result.audit,
      },
    };
  },
};
