/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 代码基础工具 / LSP 语义工具。
 * 核心目的：提供 代码基础工具 / LSP 语义工具 中的“定位类型定义”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  createLspDryRunLocation,
  createLspToolFailure,
  ensureLspToolScope,
  normalizeLspTextDocumentPosition,
  type LspLocation,
  type LspTextDocumentPosition,
  type LspToolAuditEvent,
  type LspToolContext,
  type LspToolResult,
} from "./code.lsp_locateDefinition.js";
import { locateTypeDefinitionWithLspRuntime, type LspLocateDefinitionRuntimeOptions } from "./_shared/runtime.js";

export type LspLocateTypeDefinitionOutput = {
  kind: "agentCore.basicTool.lsp.locateTypeDefinition";
  target: LspTextDocumentPosition;
  locations: readonly LspLocation[];
  dryRun: boolean;
  providerCalled: boolean;
  permissionsRequired: readonly ["workspace:read", "lsp:read"];
  unsafeSideEffects: false;
};

export type LspLocateTypeDefinitionProvider = (
  target: LspTextDocumentPosition,
  context: LspToolContext,
) => readonly LspLocation[] | Promise<readonly LspLocation[]>;

export type LspLocateTypeDefinitionRequest = {
  target?: Partial<LspTextDocumentPosition>;
  context?: LspToolContext;
  provider?: LspLocateTypeDefinitionProvider;
  runtime?: LspLocateDefinitionRuntimeOptions;
};

export const lspLocateTypeDefinitionDescriptor = {
  toolId: "code.lsp_locateTypeDefinition",
  capability: "locate-type-definition",
  route: "agent_executionEngine.basic_toolLayer.baseTools.codeBase.lsp",
  permissionsRequired: ["workspace:read", "lsp:read"],
  defaultDryRun: true,
  unsafeSideEffects: false,
  tapOwnsApproval: true,
} as const;

function dryRunEnabled(context: LspToolContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: LspToolContext | undefined): string {
  return context?.invocationId?.trim() || `${lspLocateTypeDefinitionDescriptor.toolId}:dry-run`;
}

function auditEvent(
  type: string,
  context: LspToolContext | undefined,
  targetFilePath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): LspToolAuditEvent {
  return {
    type,
    toolId: lspLocateTypeDefinitionDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    targetFilePath,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

export async function locateLspTypeDefinition(
  request: LspLocateTypeDefinitionRequest = {},
): Promise<LspToolResult<LspLocateTypeDefinitionOutput>> {
  const toolId = lspLocateTypeDefinitionDescriptor.toolId;
  const target = normalizeLspTextDocumentPosition(request.target);

  if ("code" in target) {
    return createLspToolFailure(toolId, target.code, target.message, target.boundary, request.context, request.target?.filePath);
  }

  const scopeFailure = ensureLspToolScope(toolId, target, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const dryRun = dryRunEnabled(request.context);
  if (dryRun) {
    return {
      ok: true,
      toolId,
      output: {
        kind: "agentCore.basicTool.lsp.locateTypeDefinition",
        target,
        locations: [createLspDryRunLocation(target)],
        dryRun: true,
        providerCalled: false,
        permissionsRequired: lspLocateTypeDefinitionDescriptor.permissionsRequired,
        unsafeSideEffects: false,
      },
      audit: [auditEvent("agentCore.basicTool.lsp.locateTypeDefinition.dryRun", request.context, target.filePath)],
      events: ["basicTool.lsp.locateTypeDefinition.dryRun"],
    };
  }

  try {
    const locations =
      request.provider !== undefined
        ? await request.provider(target, request.context ?? {})
        : await locateTypeDefinitionWithLspRuntime(target, {
            ...request.runtime,
            workspaceRoot: request.runtime?.workspaceRoot ?? request.context?.workspaceRoot,
          });

    return {
      ok: true,
      toolId,
      output: {
        kind: "agentCore.basicTool.lsp.locateTypeDefinition",
        target,
        locations: Object.freeze([...locations]),
        dryRun: false,
        providerCalled: true,
        permissionsRequired: lspLocateTypeDefinitionDescriptor.permissionsRequired,
        unsafeSideEffects: false,
      },
      audit: [
        auditEvent("agentCore.basicTool.lsp.locateTypeDefinition.provider", request.context, target.filePath, {
          locationCount: locations.length,
        }),
      ],
      events: ["basicTool.lsp.locateTypeDefinition.providerCalled"],
    };
  } catch (error) {
    return createLspToolFailure(
      toolId,
      "PROVIDER_REJECTED",
      error instanceof Error ? error.message : "locate type definition provider rejected the invocation",
      "provider",
      request.context,
      target.filePath,
    );
  }
}
