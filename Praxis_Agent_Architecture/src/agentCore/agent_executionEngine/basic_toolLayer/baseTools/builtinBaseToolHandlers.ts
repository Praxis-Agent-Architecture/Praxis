import type { BaseToolHandler } from "./baseToolDefinition.js";

import { shellCapabilityDetectionHandler } from "../../../../storagePool/baseToolStorage/shellBase/shellDetection/shell.capabilityDetection/bestPractice.js";
import { shellEnvironmentInspectionHandler } from "../../../../storagePool/baseToolStorage/shellBase/shellDetection/shell.environmentInspection/bestPractice.js";
import { shellSessionDetectionHandler } from "../../../../storagePool/baseToolStorage/shellBase/shellDetection/shell.sessionDetection/bestPractice.js";
import { shellTypeDetectionHandler } from "../../../../storagePool/baseToolStorage/shellBase/shellDetection/shell.typeDetection/bestPractice.js";
import { shellCommandValidationHandler } from "../../../../storagePool/baseToolStorage/shellBase/executionGuard/shell.commandValidation/bestPractice.js";
import { shellPermissionControlHandler } from "../../../../storagePool/baseToolStorage/shellBase/executionGuard/shell.permissionControl/bestPractice.js";
import { shellSandboxEnforcementHandler } from "../../../../storagePool/baseToolStorage/shellBase/executionGuard/shell.sandboxEnforcement/bestPractice.js";
import { shellCommandExecutionHandler } from "../../../../storagePool/baseToolStorage/shellBase/shellExecution/shell.commandExecution/bestPractice.js";
import { shellInvocationExecutionHandler } from "../../../../storagePool/baseToolStorage/shellBase/shellExecution/shell.invocationExecution/bestPractice.js";
import { shellScriptExecutionHandler } from "../../../../storagePool/baseToolStorage/shellBase/shellExecution/shell.scriptExecution/bestPractice.js";
import { shellExitCodeCheckingHandler } from "../../../../storagePool/baseToolStorage/shellBase/executionMonitoring/shell.exitCodeChecking/bestPractice.js";
import { shellProcessStatusTrackingHandler } from "../../../../storagePool/baseToolStorage/shellBase/executionMonitoring/shell.processStatusTracking/bestPractice.js";
import { shellRuntimeObservationHandler } from "../../../../storagePool/baseToolStorage/shellBase/executionMonitoring/shell.runtimeObservation/bestPractice.js";
import { shellBackgroundExecutionHandler } from "../../../../storagePool/baseToolStorage/shellBase/processControl/shell.backgroundExecution/bestPractice.js";
import { shellDetachedExecutionHandler } from "../../../../storagePool/baseToolStorage/shellBase/processControl/shell.detachedExecution/bestPractice.js";
import { shellForegroundExecutionHandler } from "../../../../storagePool/baseToolStorage/shellBase/processControl/shell.foregroundExecution/bestPractice.js";
import { shellProcessSpawningHandler } from "../../../../storagePool/baseToolStorage/shellBase/processControl/shell.processSpawning/bestPractice.js";
import { shellProcessTerminationHandler } from "../../../../storagePool/baseToolStorage/shellBase/processControl/shell.processTermination/bestPractice.js";
import { executionMonitoringHandler } from "../../../../storagePool/baseToolStorage/shellBase/shellInteraction/shell.executionMonitoring/bestPractice.js";
import { interactiveControlHandler } from "../../../../storagePool/baseToolStorage/shellBase/shellInteraction/shell.interactiveControl/bestPractice.js";
import { outputCaptureHandler } from "../../../../storagePool/baseToolStorage/shellBase/shellInteraction/shell.outputCapture/bestPractice.js";
import { promptHandlingHandler } from "../../../../storagePool/baseToolStorage/shellBase/shellInteraction/shell.promptHandling/bestPractice.js";
import { stdinFeedingHandler } from "../../../../storagePool/baseToolStorage/shellBase/shellInteraction/shell.stdinFeeding/bestPractice.js";
import { shellArgumentAssemblyHandler } from "../../../../storagePool/baseToolStorage/shellBase/shellGeneration/shell.argumentAssembly/bestPractice.js";
import { shellCommandGenerationHandler } from "../../../../storagePool/baseToolStorage/shellBase/shellGeneration/shell.commandGeneration/bestPractice.js";
import { shellExecutionGuardHandler } from "../../../../storagePool/baseToolStorage/shellBase/shellGeneration/shell.executionGuard/bestPractice.js";
import { shellInvocationConstructionHandler } from "../../../../storagePool/baseToolStorage/shellBase/shellGeneration/shell.invocationConstruction/bestPractice.js";
import { shellScriptGenerationHandler } from "../../../../storagePool/baseToolStorage/shellBase/shellGeneration/shell.scriptGeneration/bestPractice.js";
import { shellLifecycleManagementHandler } from "../../../../storagePool/baseToolStorage/shellBase/shellManagement/shell.shellLifecycleManagement/bestPractice.js";
import { shellProcessManagementHandler } from "../../../../storagePool/baseToolStorage/shellBase/shellManagement/shell.shellProcessManagement/bestPractice.js";
import { shellResourceManagementHandler } from "../../../../storagePool/baseToolStorage/shellBase/shellManagement/shell.shellResourceManagement/bestPractice.js";
import { shellSessionManagementHandler } from "../../../../storagePool/baseToolStorage/shellBase/shellManagement/shell.shellSessionManagement/bestPractice.js";
import { lspApplyCodeActionHandler } from "../../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_applyCodeAction/bestPractice.js";
import { lspAssistSignatureHandler } from "../../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_assistSignature/bestPractice.js";
import { lspCompleteCodeHandler } from "../../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_completeCode/bestPractice.js";
import { lspExplainSymbolHandler } from "../../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_explainSymbol/bestPractice.js";
import { lspFormatDocumentHandler } from "../../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_formatDocument/bestPractice.js";
import { lspFormatRangeHandler } from "../../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_formatRange/bestPractice.js";
import { lspInspectDiagnosticsHandler } from "../../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_inspectDiagnostics/bestPractice.js";
import { lspInspectSymbolHandler } from "../../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_inspectSymbol/bestPractice.js";
import { lspLocateDefinitionHandler } from "../../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_locateDefinition/bestPractice.js";
import { lspLocateTypeDefinitionHandler } from "../../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_locateTypeDefinition/bestPractice.js";
import { lspRenameSymbolHandler } from "../../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_renameSymbol/bestPractice.js";
import { lspScanDocumentSymbolsHandler } from "../../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_scanDocumentSymbols/bestPractice.js";
import { lspSearchWorkspaceSymbolsHandler } from "../../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_searchWorkspaceSymbols/bestPractice.js";
import { lspSuggestCodeActionsHandler } from "../../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_suggestCodeActions/bestPractice.js";
import { lspTraceImplementationsHandler } from "../../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_traceImplementations/bestPractice.js";
import { lspTraceReferencesHandler } from "../../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_traceReferences/bestPractice.js";

export const builtinBaseToolHandlers = [
  shellCapabilityDetectionHandler,
  shellEnvironmentInspectionHandler,
  shellSessionDetectionHandler,
  shellTypeDetectionHandler,
  shellCommandValidationHandler,
  shellPermissionControlHandler,
  shellSandboxEnforcementHandler,
  shellCommandExecutionHandler,
  shellInvocationExecutionHandler,
  shellScriptExecutionHandler,
  shellExitCodeCheckingHandler,
  shellProcessStatusTrackingHandler,
  shellRuntimeObservationHandler,
  shellBackgroundExecutionHandler,
  shellDetachedExecutionHandler,
  shellForegroundExecutionHandler,
  shellProcessSpawningHandler,
  shellProcessTerminationHandler,
  executionMonitoringHandler,
  interactiveControlHandler,
  promptHandlingHandler,
  stdinFeedingHandler,
  outputCaptureHandler,
  shellArgumentAssemblyHandler,
  shellCommandGenerationHandler,
  shellExecutionGuardHandler,
  shellInvocationConstructionHandler,
  shellScriptGenerationHandler,
  shellLifecycleManagementHandler,
  shellProcessManagementHandler,
  shellResourceManagementHandler,
  shellSessionManagementHandler,
  lspApplyCodeActionHandler,
  lspAssistSignatureHandler,
  lspCompleteCodeHandler,
  lspExplainSymbolHandler,
  lspFormatDocumentHandler,
  lspFormatRangeHandler,
  lspInspectDiagnosticsHandler,
  lspInspectSymbolHandler,
  lspLocateDefinitionHandler,
  lspLocateTypeDefinitionHandler,
  lspRenameSymbolHandler,
  lspScanDocumentSymbolsHandler,
  lspSearchWorkspaceSymbolsHandler,
  lspSuggestCodeActionsHandler,
  lspTraceImplementationsHandler,
  lspTraceReferencesHandler,
] as const satisfies readonly BaseToolHandler[];

export function builtinBaseToolHandlersById(): ReadonlyMap<string, BaseToolHandler> {
  return new Map(builtinBaseToolHandlers.map((handler) => [handler.definition.toolId, handler] as const));
}
