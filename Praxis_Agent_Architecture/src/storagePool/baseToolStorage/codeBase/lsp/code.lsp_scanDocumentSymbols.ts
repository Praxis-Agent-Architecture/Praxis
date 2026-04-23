/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 代码基础工具 / LSP 语义工具。
 * 核心目的：提供 代码基础工具 / LSP 语义工具 中的“扫描文档符号”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  createLspToolFailure,
  ensureLspToolScope,
  type LspRange,
  type LspTextDocumentPosition,
  type LspToolAuditEvent,
  type LspToolContext,
  type LspToolResult,
} from "./code.lsp_locateDefinition.js";

export type LspDocumentTarget = {
  filePath: string;
  languageId?: string;
};

export type LspDocumentSymbol = {
  name: string;
  kind: string;
  range: LspRange;
  selectionRange?: LspRange;
  detail?: string;
  children?: readonly LspDocumentSymbol[];
};

export type LspScanDocumentSymbolsOutput = {
  kind: "agentCore.basicTool.lsp.scanDocumentSymbols";
  target: LspDocumentTarget;
  symbols: readonly LspDocumentSymbol[];
  dryRun: boolean;
  providerCalled: boolean;
  permissionsRequired: readonly ["workspace:read", "lsp:read"];
  unsafeSideEffects: false;
};

export type LspScanDocumentSymbolsProvider = (
  target: LspDocumentTarget,
  context: LspToolContext,
) => readonly LspDocumentSymbol[] | Promise<readonly LspDocumentSymbol[]>;

export type LspScanDocumentSymbolsRequest = {
  target?: Partial<LspDocumentTarget>;
  context?: LspToolContext;
  provider?: LspScanDocumentSymbolsProvider;
};

export const lspScanDocumentSymbolsDescriptor = {
  toolId: "code.lsp_scanDocumentSymbols",
  capability: "scan-document-symbols",
  route: "agent_executionEngine.basic_toolLayer.baseTools.codeBase.lsp",
  permissionsRequired: ["workspace:read", "lsp:read"],
  defaultDryRun: true,
  unsafeSideEffects: false,
  tapOwnsApproval: true,
} as const;

function isBlank(value: string | undefined): value is undefined {
  return typeof value !== "string" || value.trim().length === 0;
}

function dryRunEnabled(context: LspToolContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: LspToolContext | undefined): string {
  return context?.invocationId?.trim() || `${lspScanDocumentSymbolsDescriptor.toolId}:dry-run`;
}

function auditEvent(
  type: string,
  context: LspToolContext | undefined,
  targetFilePath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): LspToolAuditEvent {
  return {
    type,
    toolId: lspScanDocumentSymbolsDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    targetFilePath,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function normalizeDocumentTarget(target: Partial<LspDocumentTarget> | undefined): LspDocumentTarget | undefined {
  if (target === undefined || isBlank(target.filePath)) {
    return undefined;
  }

  return {
    filePath: target.filePath.trim(),
    languageId: target.languageId?.trim() || undefined,
  };
}

function scopeProbe(target: LspDocumentTarget): LspTextDocumentPosition {
  return {
    filePath: target.filePath,
    line: 0,
    character: 0,
    languageId: target.languageId,
  };
}

export async function scanLspDocumentSymbols(
  request: LspScanDocumentSymbolsRequest = {},
): Promise<LspToolResult<LspScanDocumentSymbolsOutput>> {
  const toolId = lspScanDocumentSymbolsDescriptor.toolId;
  const target = normalizeDocumentTarget(request.target);

  if (target === undefined) {
    return createLspToolFailure(
      toolId,
      "MISSING_FILE_PATH",
      "scan document symbols requires target.filePath",
      "input",
      request.context,
      request.target?.filePath,
    );
  }

  const scopeFailure = ensureLspToolScope(toolId, scopeProbe(target), request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const dryRun = dryRunEnabled(request.context);
  if (dryRun) {
    return {
      ok: true,
      toolId,
      output: {
        kind: "agentCore.basicTool.lsp.scanDocumentSymbols",
        target,
        symbols: Object.freeze([]),
        dryRun: true,
        providerCalled: false,
        permissionsRequired: lspScanDocumentSymbolsDescriptor.permissionsRequired,
        unsafeSideEffects: false,
      },
      audit: [auditEvent("agentCore.basicTool.lsp.scanDocumentSymbols.dryRun", request.context, target.filePath)],
      events: ["basicTool.lsp.scanDocumentSymbols.dryRun"],
    };
  }

  if (request.provider === undefined) {
    return createLspToolFailure(
      toolId,
      "PROVIDER_UNAVAILABLE",
      "scan document symbols requires an injected LSP provider when dryRun is disabled",
      "provider",
      request.context,
      target.filePath,
    );
  }

  try {
    const symbols = await request.provider(target, request.context ?? {});

    return {
      ok: true,
      toolId,
      output: {
        kind: "agentCore.basicTool.lsp.scanDocumentSymbols",
        target,
        symbols: Object.freeze([...symbols]),
        dryRun: false,
        providerCalled: true,
        permissionsRequired: lspScanDocumentSymbolsDescriptor.permissionsRequired,
        unsafeSideEffects: false,
      },
      audit: [
        auditEvent("agentCore.basicTool.lsp.scanDocumentSymbols.provider", request.context, target.filePath, {
          symbolCount: symbols.length,
        }),
      ],
      events: ["basicTool.lsp.scanDocumentSymbols.providerCalled"],
    };
  } catch (error) {
    return createLspToolFailure(
      toolId,
      "PROVIDER_REJECTED",
      error instanceof Error ? error.message : "scan document symbols provider rejected the invocation",
      "provider",
      request.context,
      target.filePath,
    );
  }
}
