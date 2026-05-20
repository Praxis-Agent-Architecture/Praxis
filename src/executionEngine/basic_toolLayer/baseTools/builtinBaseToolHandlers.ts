import type { BaseToolHandler } from "./baseToolDefinition.js";

import { shellCapabilityDetectionHandler } from "../../../storagePool/baseToolStorage/shellBase/shellDetection/shell.capabilityDetection/bestPractice.js";
import { shellEnvironmentInspectionHandler } from "../../../storagePool/baseToolStorage/shellBase/shellDetection/shell.environmentInspection/bestPractice.js";
import { shellSessionDetectionHandler } from "../../../storagePool/baseToolStorage/shellBase/shellDetection/shell.sessionDetection/bestPractice.js";
import { shellTypeDetectionHandler } from "../../../storagePool/baseToolStorage/shellBase/shellDetection/shell.typeDetection/bestPractice.js";
import { shellCommandValidationHandler } from "../../../storagePool/baseToolStorage/shellBase/executionGuard/shell.commandValidation/bestPractice.js";
import { shellPermissionControlHandler } from "../../../storagePool/baseToolStorage/shellBase/executionGuard/shell.permissionControl/bestPractice.js";
import { shellSandboxEnforcementHandler } from "../../../storagePool/baseToolStorage/shellBase/executionGuard/shell.sandboxEnforcement/bestPractice.js";
import { shellCommandExecutionHandler } from "../../../storagePool/baseToolStorage/shellBase/shellExecution/shell.commandExecution/bestPractice.js";
import { shellInvocationExecutionHandler } from "../../../storagePool/baseToolStorage/shellBase/shellExecution/shell.invocationExecution/bestPractice.js";
import { shellScriptExecutionHandler } from "../../../storagePool/baseToolStorage/shellBase/shellExecution/shell.scriptExecution/bestPractice.js";
import { shellExitCodeCheckingHandler } from "../../../storagePool/baseToolStorage/shellBase/executionMonitoring/shell.exitCodeChecking/bestPractice.js";
import { shellProcessStatusTrackingHandler } from "../../../storagePool/baseToolStorage/shellBase/executionMonitoring/shell.processStatusTracking/bestPractice.js";
import { shellRuntimeObservationHandler } from "../../../storagePool/baseToolStorage/shellBase/executionMonitoring/shell.runtimeObservation/bestPractice.js";
import { shellBackgroundExecutionHandler } from "../../../storagePool/baseToolStorage/shellBase/processControl/shell.backgroundExecution/bestPractice.js";
import { shellDetachedExecutionHandler } from "../../../storagePool/baseToolStorage/shellBase/processControl/shell.detachedExecution/bestPractice.js";
import { shellForegroundExecutionHandler } from "../../../storagePool/baseToolStorage/shellBase/processControl/shell.foregroundExecution/bestPractice.js";
import { shellProcessSpawningHandler } from "../../../storagePool/baseToolStorage/shellBase/processControl/shell.processSpawning/bestPractice.js";
import { shellServiceStartAndVerifyHandler } from "../../../storagePool/baseToolStorage/shellBase/processControl/shell.serviceStartAndVerify/bestPractice.js";
import { shellProcessTerminationHandler } from "../../../storagePool/baseToolStorage/shellBase/processControl/shell.processTermination/bestPractice.js";
import { executionMonitoringHandler } from "../../../storagePool/baseToolStorage/shellBase/shellInteraction/shell.executionMonitoring/bestPractice.js";
import { interactiveControlHandler } from "../../../storagePool/baseToolStorage/shellBase/shellInteraction/shell.interactiveControl/bestPractice.js";
import { outputCaptureHandler } from "../../../storagePool/baseToolStorage/shellBase/shellInteraction/shell.outputCapture/bestPractice.js";
import { promptHandlingHandler } from "../../../storagePool/baseToolStorage/shellBase/shellInteraction/shell.promptHandling/bestPractice.js";
import { stdinFeedingHandler } from "../../../storagePool/baseToolStorage/shellBase/shellInteraction/shell.stdinFeeding/bestPractice.js";
import { shellArgumentAssemblyHandler } from "../../../storagePool/baseToolStorage/shellBase/shellGeneration/shell.argumentAssembly/bestPractice.js";
import { shellCommandGenerationHandler } from "../../../storagePool/baseToolStorage/shellBase/shellGeneration/shell.commandGeneration/bestPractice.js";
import { shellExecutionGuardHandler } from "../../../storagePool/baseToolStorage/shellBase/shellGeneration/shell.executionGuard/bestPractice.js";
import { shellInvocationConstructionHandler } from "../../../storagePool/baseToolStorage/shellBase/shellGeneration/shell.invocationConstruction/bestPractice.js";
import { shellScriptGenerationHandler } from "../../../storagePool/baseToolStorage/shellBase/shellGeneration/shell.scriptGeneration/bestPractice.js";
import { shellLifecycleManagementHandler } from "../../../storagePool/baseToolStorage/shellBase/shellManagement/shell.shellLifecycleManagement/bestPractice.js";
import { shellProcessManagementHandler } from "../../../storagePool/baseToolStorage/shellBase/shellManagement/shell.shellProcessManagement/bestPractice.js";
import { shellResourceManagementHandler } from "../../../storagePool/baseToolStorage/shellBase/shellManagement/shell.shellResourceManagement/bestPractice.js";
import { shellSessionManagementHandler } from "../../../storagePool/baseToolStorage/shellBase/shellManagement/shell.shellSessionManagement/bestPractice.js";
import { codeReadHandler } from "../../../storagePool/baseToolStorage/codeBase/explore/code.read/bestPractice.js";
import { codeScanHandler } from "../../../storagePool/baseToolStorage/codeBase/explore/code.scan/bestPractice.js";
import { codeSearchRipgrepHandler } from "../../../storagePool/baseToolStorage/codeBase/explore/code.search_Ripgrep/bestPractice.js";
import { codeDeleteHandler } from "../../../storagePool/baseToolStorage/codeBase/edit/code.delete/bestPractice.js";
import { codeFormatHandler } from "../../../storagePool/baseToolStorage/codeBase/edit/code.format/bestPractice.js";
import { codeModifyHandler } from "../../../storagePool/baseToolStorage/codeBase/edit/code.modify/bestPractice.js";
import { codeOverwriteHandler } from "../../../storagePool/baseToolStorage/codeBase/edit/code.overwrite/bestPractice.js";
import { codeReplaceFileHandler } from "../../../storagePool/baseToolStorage/codeBase/edit/code.replaceFile/bestPractice.js";
import { codeDebugCaptureStateHandler } from "../../../storagePool/baseToolStorage/codeBase/debugCode/code.debugCaptureState/bestPractice.js";
import { codeDebugCollectLogsHandler } from "../../../storagePool/baseToolStorage/codeBase/debugCode/code.debugCollectLogs/bestPractice.js";
import { codeDebugRunHandler } from "../../../storagePool/baseToolStorage/codeBase/debugCode/code.debugRun/bestPractice.js";
import { codeBenchmarkHandler } from "../../../storagePool/baseToolStorage/codeBase/testCode/code.benchmark/bestPractice.js";
import { codeTestHandler } from "../../../storagePool/baseToolStorage/codeBase/testCode/code.testCode/bestPractice.js";
import { lspApplyCodeActionHandler } from "../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_applyCodeAction/bestPractice.js";
import { lspAssistSignatureHandler } from "../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_assistSignature/bestPractice.js";
import { lspCompleteCodeHandler } from "../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_completeCode/bestPractice.js";
import { lspExplainSymbolHandler } from "../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_explainSymbol/bestPractice.js";
import { lspFormatDocumentHandler } from "../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_formatDocument/bestPractice.js";
import { lspFormatRangeHandler } from "../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_formatRange/bestPractice.js";
import { lspInspectDiagnosticsHandler } from "../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_inspectDiagnostics/bestPractice.js";
import { lspInspectSymbolHandler } from "../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_inspectSymbol/bestPractice.js";
import { lspLocateDefinitionHandler } from "../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_locateDefinition/bestPractice.js";
import { lspLocateTypeDefinitionHandler } from "../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_locateTypeDefinition/bestPractice.js";
import { lspRenameSymbolHandler } from "../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_renameSymbol/bestPractice.js";
import { lspScanDocumentSymbolsHandler } from "../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_scanDocumentSymbols/bestPractice.js";
import { lspSearchWorkspaceSymbolsHandler } from "../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_searchWorkspaceSymbols/bestPractice.js";
import { lspSuggestCodeActionsHandler } from "../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_suggestCodeActions/bestPractice.js";
import { lspTraceImplementationsHandler } from "../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_traceImplementations/bestPractice.js";
import { lspTraceReferencesHandler } from "../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_traceReferences/bestPractice.js";
import { gitGetCommitHistoryHandler } from "../../../storagePool/baseToolStorage/gitBase/inspection/git.getCommitHistory/bestPractice.js";
import { gitGetRepositoryStatusHandler } from "../../../storagePool/baseToolStorage/gitBase/inspection/git.getRepositoryStatus/bestPractice.js";
import { gitGetWorkingTreeDiffHandler } from "../../../storagePool/baseToolStorage/gitBase/inspection/git.getWorkingTreeDiff/bestPractice.js";
import { gitShowObjectDetailsHandler } from "../../../storagePool/baseToolStorage/gitBase/inspection/git.showGitObjectDetails/bestPractice.js";
import { gitTraceLineOwnershipHandler } from "../../../storagePool/baseToolStorage/gitBase/inspection/git.traceLineOwnership/bestPractice.js";
import { gitLocateProblemCommitHandler } from "../../../storagePool/baseToolStorage/gitBase/advanced/git.locateProblemCommit/bestPractice.js";
import { gitManageSubmoduleHandler } from "../../../storagePool/baseToolStorage/gitBase/advanced/git.manageSubmodule/bestPractice.js";
import { gitManageWorktreeHandler } from "../../../storagePool/baseToolStorage/gitBase/advanced/git.manageWorktree/bestPractice.js";
import { gitCheckoutTargetHandler } from "../../../storagePool/baseToolStorage/gitBase/branch/git.checkoutTarget/bestPractice.js";
import { gitManageBranchHandler } from "../../../storagePool/baseToolStorage/gitBase/branch/git.manageBranch/bestPractice.js";
import { gitManageTagHandler } from "../../../storagePool/baseToolStorage/gitBase/branch/git.manageTag/bestPractice.js";
import { gitMergeBranchHandler } from "../../../storagePool/baseToolStorage/gitBase/branch/git.mergeBranch/bestPractice.js";
import { gitRebaseBranchHandler } from "../../../storagePool/baseToolStorage/gitBase/branch/git.rebaseBranch/bestPractice.js";
import { gitSwitchBranchHandler } from "../../../storagePool/baseToolStorage/gitBase/branch/git.switchBranch/bestPractice.js";
import { gitManageIgnoreRulesHandler } from "../../../storagePool/baseToolStorage/gitBase/file/git.manageIgnoreRules/bestPractice.js";
import { gitMoveOrRenameFileHandler } from "../../../storagePool/baseToolStorage/gitBase/file/git.moveOrRenameFile/bestPractice.js";
import { gitRemoveTrackedFileHandler } from "../../../storagePool/baseToolStorage/gitBase/file/git.removeTrackedFile/bestPractice.js";
import { gitAddToStagingHandler } from "../../../storagePool/baseToolStorage/gitBase/staging/git.addToStaging/bestPractice.js";
import { gitResetStagingOrCommitHandler } from "../../../storagePool/baseToolStorage/gitBase/staging/git.resetStagingOrCommit/bestPractice.js";
import { gitRestoreWorkingTreeHandler } from "../../../storagePool/baseToolStorage/gitBase/staging/git.restoreWorkingTree/bestPractice.js";
import { gitApplyStashChangesHandler } from "../../../storagePool/baseToolStorage/gitBase/stash/git.applyStashChanges/bestPractice.js";
import { gitCleanUntrackedFilesHandler } from "../../../storagePool/baseToolStorage/gitBase/stash/git.cleanUntrackedFiles/bestPractice.js";
import { gitPopStashChangesHandler } from "../../../storagePool/baseToolStorage/gitBase/stash/git.popStashChanges/bestPractice.js";
import { gitStashChangesHandler } from "../../../storagePool/baseToolStorage/gitBase/stash/git.stashChanges/bestPractice.js";
import { gitAmendLastCommitHandler } from "../../../storagePool/baseToolStorage/gitBase/commit/git.amendLastCommit/bestPractice.js";
import { gitCherryPickCommitHandler } from "../../../storagePool/baseToolStorage/gitBase/commit/git.cherryPickCommit/bestPractice.js";
import { gitCreateCommitHandler } from "../../../storagePool/baseToolStorage/gitBase/commit/git.createCommit/bestPractice.js";
import { gitRevertCommitHandler } from "../../../storagePool/baseToolStorage/gitBase/commit/git.revertCommit/bestPractice.js";
import { gitArchiveRepositoryHandler } from "../../../storagePool/baseToolStorage/gitBase/repository/git.archiveRepository/bestPractice.js";
import { gitCloneRepositoryHandler } from "../../../storagePool/baseToolStorage/gitBase/repository/git.cloneRepository/bestPractice.js";
import { gitInitializeRepositoryHandler } from "../../../storagePool/baseToolStorage/gitBase/repository/git.initializeRepository/bestPractice.js";
import { gitFetchRemoteUpdatesHandler } from "../../../storagePool/baseToolStorage/gitBase/remote/git.fetchRemoteUpdates/bestPractice.js";
import { gitManageRemoteHandler } from "../../../storagePool/baseToolStorage/gitBase/remote/git.manageRemote/bestPractice.js";
import { gitPullRemoteChangesHandler } from "../../../storagePool/baseToolStorage/gitBase/remote/git.pullRemoteChanges/bestPractice.js";
import { gitPushLocalChangesHandler } from "../../../storagePool/baseToolStorage/gitBase/remote/git.pushLocalChanges/bestPractice.js";
import { mcpCacheHandler } from "../../../storagePool/baseToolStorage/mcpBase/cache/mcp.cache/bestPractice.js";
import { mcpInvalidateCacheHandler } from "../../../storagePool/baseToolStorage/mcpBase/cache/mcp.invalidateCache/bestPractice.js";
import { mcpConnectHandler } from "../../../storagePool/baseToolStorage/mcpBase/connection/mcp.connect/bestPractice.js";
import { mcpDisconnectHandler } from "../../../storagePool/baseToolStorage/mcpBase/connection/mcp.disconnect/bestPractice.js";
import { mcpPingHandler } from "../../../storagePool/baseToolStorage/mcpBase/connection/mcp.ping/bestPractice.js";
import { mcpAuthenticateHandler } from "../../../storagePool/baseToolStorage/mcpBase/auth/mcp.authenticate/bestPractice.js";
import { mcpAuthorizeHandler } from "../../../storagePool/baseToolStorage/mcpBase/auth/mcp.authorize/bestPractice.js";
import { mcpCallHandler } from "../../../storagePool/baseToolStorage/mcpBase/execution/mcp.call/bestPractice.js";
import { mcpCancelHandler } from "../../../storagePool/baseToolStorage/mcpBase/execution/mcp.cancel/bestPractice.js";
import { mcpNativeExecuteHandler } from "../../../storagePool/baseToolStorage/mcpBase/execution/mcp.nativeExecute/bestPractice.js";
import { mcpStreamHandler } from "../../../storagePool/baseToolStorage/mcpBase/execution/mcp.stream/bestPractice.js";
import { mcpHealthCheckHandler } from "../../../storagePool/baseToolStorage/mcpBase/monitoring/mcp.healthCheck/bestPractice.js";
import { mcpListResourcesHandler } from "../../../storagePool/baseToolStorage/mcpBase/resource/mcp.listResources/bestPractice.js";
import { mcpCreateResourceHandler } from "../../../storagePool/baseToolStorage/mcpBase/resource/mcp.createResource/bestPractice.js";
import { mcpDeleteResourceHandler } from "../../../storagePool/baseToolStorage/mcpBase/resource/mcp.deleteResource/bestPractice.js";
import { mcpReadResourceHandler } from "../../../storagePool/baseToolStorage/mcpBase/resource/mcp.readResource/bestPractice.js";
import { mcpUpdateResourceHandler } from "../../../storagePool/baseToolStorage/mcpBase/resource/mcp.updateResource/bestPractice.js";
import { mcpSubscribeHandler } from "../../../storagePool/baseToolStorage/mcpBase/subscription/mcp.subscribe/bestPractice.js";
import { mcpUnsubscribeHandler } from "../../../storagePool/baseToolStorage/mcpBase/subscription/mcp.unsubscribe/bestPractice.js";
import { mcpListToolsHandler } from "../../../storagePool/baseToolStorage/mcpBase/tool/mcp.listTools/bestPractice.js";
import { mcpRegisterToolHandler } from "../../../storagePool/baseToolStorage/mcpBase/tool/mcp.registerTool/bestPractice.js";
import { mcpUpdateToolHandler } from "../../../storagePool/baseToolStorage/mcpBase/tool/mcp.updateTool/bestPractice.js";
import { mcpUnregisterToolHandler } from "../../../storagePool/baseToolStorage/mcpBase/tool/mcp.unregisterTool/bestPractice.js";
import { searchFetchHandler } from "../../../storagePool/baseToolStorage/searchBase/search.fetch/bestPractice.js";
import { searchGroundHandler } from "../../../storagePool/baseToolStorage/searchBase/search.ground/bestPractice.js";
import { nativeSearchHandler } from "../../../storagePool/baseToolStorage/searchBase/search.nativeSearch/bestPractice.js";
import { searchEngineHandler } from "../../../storagePool/baseToolStorage/searchBase/search.searchEngine/bestPractice.js";
import { skillGenerateHandler } from "../../../storagePool/baseToolStorage/skillBase/skill.generate/bestPractice.js";
import { skillIterateHandler } from "../../../storagePool/baseToolStorage/skillBase/skill.iterate/bestPractice.js";
import { skillManagementHandler } from "../../../storagePool/baseToolStorage/skillBase/skill.management/bestPractice.js";
import { skillRemoveHandler } from "../../../storagePool/baseToolStorage/skillBase/skill.remove/bestPractice.js";
import { skillRipgrepHandler } from "../../../storagePool/baseToolStorage/skillBase/skill.ripgrep/bestPractice.js";
import { skillSummarizeHandler } from "../../../storagePool/baseToolStorage/skillBase/skill.summarize/bestPractice.js";
import { omniViewImageHandler } from "../../../storagePool/baseToolStorage/omniBase/imageTransformer/omni.viewImage/bestPractice.js";
import { omniAudioCompressionHandler } from "../../../storagePool/baseToolStorage/omniBase/audioTransformer/omni.audioCompressor/bestPractice.js";
import { omniAudioFormatConversionHandler } from "../../../storagePool/baseToolStorage/omniBase/audioTransformer/omni.audioFormatConversion/bestPractice.js";
import { omniAudioLyricsGenerationHandler } from "../../../storagePool/baseToolStorage/omniBase/audioTransformer/omni.audioLyricsGeneration/bestPractice.js";
import { omniGenerateAudioHandler } from "../../../storagePool/baseToolStorage/omniBase/audioTransformer/omni.generateAudio/bestPractice.js";
import { omniListenAudioHandler } from "../../../storagePool/baseToolStorage/omniBase/audioTransformer/omni.listenAudio/bestPractice.js";
import { omniGenerateImageHandler } from "../../../storagePool/baseToolStorage/omniBase/imageTransformer/omni.generateImage/bestPractice.js";
import { omniImageCompressorHandler } from "../../../storagePool/baseToolStorage/omniBase/imageTransformer/omni.imageCompressor/bestPractice.js";
import { omniImageFormatConversionHandler } from "../../../storagePool/baseToolStorage/omniBase/imageTransformer/omni.imageFormatConversion/bestPractice.js";
import { omniGenerateVideoHandler } from "../../../storagePool/baseToolStorage/omniBase/videoTransformer/omni.generateVideo/bestPractice.js";
import { omniVideoCompressorHandler } from "../../../storagePool/baseToolStorage/omniBase/videoTransformer/omni.videoCompressor/bestPractice.js";
import { omniVideoFormatConversionHandler } from "../../../storagePool/baseToolStorage/omniBase/videoTransformer/omni.videoFormatConversion/bestPractice.js";
import { omniVideoSubtitleGenerationHandler } from "../../../storagePool/baseToolStorage/omniBase/videoTransformer/omni.videoSubtitleGeneration/bestPractice.js";
import { omniViewVideoHandler } from "../../../storagePool/baseToolStorage/omniBase/videoTransformer/omni.viewVideo/bestPractice.js";
import { cameraCapturePhotoHandler } from "../../../storagePool/baseToolStorage/computeruseBase/cameraAccess/computeruse.cameraCapturePhoto/bestPractice.js";
import { cameraContentStorageHandler } from "../../../storagePool/baseToolStorage/computeruseBase/cameraAccess/computeruse.cameraContentStorage/bestPractice.js";
import { cameraFaceRecognitionHandler } from "../../../storagePool/baseToolStorage/computeruseBase/cameraAccess/computeruse.cameraFaceRecognition/bestPractice.js";
import { cameraPermissionReleaseHandler } from "../../../storagePool/baseToolStorage/computeruseBase/cameraAccess/computeruse.cameraPermissionRelease/bestPractice.js";
import { cameraPermissionRequestHandler } from "../../../storagePool/baseToolStorage/computeruseBase/cameraAccess/computeruse.cameraPermissionRequest/bestPractice.js";
import { cameraSelectHandler } from "../../../storagePool/baseToolStorage/computeruseBase/cameraAccess/computeruse.cameraSelect/bestPractice.js";
import { cameraStartRecordingHandler } from "../../../storagePool/baseToolStorage/computeruseBase/cameraAccess/computeruse.cameraStartRecording/bestPractice.js";
import { cameraStopRecordingHandler } from "../../../storagePool/baseToolStorage/computeruseBase/cameraAccess/computeruse.cameraStopRecording/bestPractice.js";
import { freeformScreenshotHandler } from "../../../storagePool/baseToolStorage/computeruseBase/screenshot/computeruse.freeformScreenshot/bestPractice.js";
import { fullscreenScreenRecordingHandler } from "../../../storagePool/baseToolStorage/computeruseBase/screenRecording/computeruse.fullscreenScreenRecording/bestPractice.js";
import { fullscreenScreenshotHandler } from "../../../storagePool/baseToolStorage/computeruseBase/screenshot/computeruse.fullscreenScreenshot/bestPractice.js";
import { inputCheckboxConfirmHandler } from "../../../storagePool/baseToolStorage/computeruseBase/keyboardEmulation/computeruse.inputCheckboxConfirm/bestPractice.js";
import { keyboardEmulationHandler } from "../../../storagePool/baseToolStorage/computeruseBase/keyboardEmulation/computeruse.keyboardEmulation/bestPractice.js";
import { keyboardInputEmulationHandler } from "../../../storagePool/baseToolStorage/computeruseBase/keyboardEmulation/computeruse.keyboardInputEmulation/bestPractice.js";
import { keyboardSubmitInputHandler } from "../../../storagePool/baseToolStorage/computeruseBase/keyboardEmulation/computeruse.keyboardSubmitInput/bestPractice.js";
import { rectangularSelectionScreenRecordingHandler } from "../../../storagePool/baseToolStorage/computeruseBase/screenRecording/computeruse.rectangularSelectionScreenRecording/bestPractice.js";
import { rectangularSelectionScreenshotHandler } from "../../../storagePool/baseToolStorage/computeruseBase/screenshot/computeruse.rectangularSelectionScreenshot/bestPractice.js";
import { screenRecordingStorageHandler } from "../../../storagePool/baseToolStorage/computeruseBase/screenRecording/computeruse.screenRecordingStorage/bestPractice.js";
import { screenshotStorageHandler } from "../../../storagePool/baseToolStorage/computeruseBase/screenshot/computeruse.screenshotStorage/bestPractice.js";
import { windowScreenRecordingHandler } from "../../../storagePool/baseToolStorage/computeruseBase/screenRecording/computeruse.windowScreenRecording/bestPractice.js";
import { windowScreenshotHandler } from "../../../storagePool/baseToolStorage/computeruseBase/screenshot/computeruse.windowScreenshot/bestPractice.js";
import { microphonePermissionReleaseHandler } from "../../../storagePool/baseToolStorage/computeruseBase/microphoneAccess/computeruse.microphonePermissionRelease/bestPractice.js";
import { microphonePermissionRequestHandler } from "../../../storagePool/baseToolStorage/computeruseBase/microphoneAccess/computeruse.microphonePermissionRequest/bestPractice.js";
import { microphoneSelectHandler } from "../../../storagePool/baseToolStorage/computeruseBase/microphoneAccess/computeruse.microphoneSelect/bestPractice.js";
import { microphoneStartRecordingHandler } from "../../../storagePool/baseToolStorage/computeruseBase/microphoneAccess/computeruse.microphoneStartRecording/bestPractice.js";
import { microphoneStopRecordingHandler } from "../../../storagePool/baseToolStorage/computeruseBase/microphoneAccess/computeruse.microphoneStopRecording/bestPractice.js";
import { checkboxConfirmHandler } from "../../../storagePool/baseToolStorage/computeruseBase/mouseEmulation/computeruse.checkboxConfirm/bestPractice.js";
import { cursorLocateHandler } from "../../../storagePool/baseToolStorage/computeruseBase/mouseEmulation/computeruse.cursorLocate/bestPractice.js";
import { mouseClickHandler } from "../../../storagePool/baseToolStorage/computeruseBase/mouseEmulation/computeruse.mouseClick/bestPractice.js";
import { mouseEmulationHandler } from "../../../storagePool/baseToolStorage/computeruseBase/mouseEmulation/computeruse.mouseEmulation/bestPractice.js";
import { mouseMoveHandler } from "../../../storagePool/baseToolStorage/computeruseBase/mouseEmulation/computeruse.mouseMove/bestPractice.js";
import { mouseScrollHandler } from "../../../storagePool/baseToolStorage/computeruseBase/mouseEmulation/computeruse.mouseScroll/bestPractice.js";

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
  shellServiceStartAndVerifyHandler,
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
  codeReadHandler,
  codeScanHandler,
  codeSearchRipgrepHandler,
  codeReplaceFileHandler,
  codeModifyHandler,
  codeOverwriteHandler,
  codeDeleteHandler,
  codeFormatHandler,
  codeTestHandler,
  codeBenchmarkHandler,
  codeDebugCollectLogsHandler,
  codeDebugCaptureStateHandler,
  codeDebugRunHandler,
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
  gitGetCommitHistoryHandler,
  gitGetRepositoryStatusHandler,
  gitGetWorkingTreeDiffHandler,
  gitShowObjectDetailsHandler,
  gitTraceLineOwnershipHandler,
  gitLocateProblemCommitHandler,
  gitManageSubmoduleHandler,
  gitManageWorktreeHandler,
  gitCheckoutTargetHandler,
  gitManageBranchHandler,
  gitManageTagHandler,
  gitMergeBranchHandler,
  gitRebaseBranchHandler,
  gitSwitchBranchHandler,
  gitManageIgnoreRulesHandler,
  gitMoveOrRenameFileHandler,
  gitRemoveTrackedFileHandler,
  gitAddToStagingHandler,
  gitResetStagingOrCommitHandler,
  gitRestoreWorkingTreeHandler,
  gitStashChangesHandler,
  gitApplyStashChangesHandler,
  gitPopStashChangesHandler,
  gitCleanUntrackedFilesHandler,
  gitAmendLastCommitHandler,
  gitCherryPickCommitHandler,
  gitCreateCommitHandler,
  gitRevertCommitHandler,
  gitInitializeRepositoryHandler,
  gitCloneRepositoryHandler,
  gitArchiveRepositoryHandler,
  gitFetchRemoteUpdatesHandler,
  gitManageRemoteHandler,
  gitPullRemoteChangesHandler,
  gitPushLocalChangesHandler,
  mcpCacheHandler,
  mcpInvalidateCacheHandler,
  mcpConnectHandler,
  mcpDisconnectHandler,
  mcpPingHandler,
  mcpAuthenticateHandler,
  mcpAuthorizeHandler,
  mcpCallHandler,
  mcpStreamHandler,
  mcpCancelHandler,
  mcpNativeExecuteHandler,
  mcpHealthCheckHandler,
  mcpListResourcesHandler,
  mcpReadResourceHandler,
  mcpCreateResourceHandler,
  mcpUpdateResourceHandler,
  mcpDeleteResourceHandler,
  mcpSubscribeHandler,
  mcpUnsubscribeHandler,
  mcpListToolsHandler,
  mcpRegisterToolHandler,
  mcpUpdateToolHandler,
  mcpUnregisterToolHandler,
  searchFetchHandler,
  searchGroundHandler,
  nativeSearchHandler,
  searchEngineHandler,
  skillGenerateHandler,
  skillIterateHandler,
  skillManagementHandler,
  skillRemoveHandler,
  skillRipgrepHandler,
  skillSummarizeHandler,
  omniViewImageHandler,
  omniAudioCompressionHandler,
  omniAudioFormatConversionHandler,
  omniAudioLyricsGenerationHandler,
  omniGenerateAudioHandler,
  omniListenAudioHandler,
  omniGenerateImageHandler,
  omniImageCompressorHandler,
  omniImageFormatConversionHandler,
  omniGenerateVideoHandler,
  omniVideoCompressorHandler,
  omniVideoFormatConversionHandler,
  omniVideoSubtitleGenerationHandler,
  omniViewVideoHandler,
  cameraCapturePhotoHandler,
  cameraContentStorageHandler,
  cameraFaceRecognitionHandler,
  cameraPermissionReleaseHandler,
  cameraPermissionRequestHandler,
  cameraSelectHandler,
  cameraStartRecordingHandler,
  cameraStopRecordingHandler,
  freeformScreenshotHandler,
  fullscreenScreenRecordingHandler,
  fullscreenScreenshotHandler,
  inputCheckboxConfirmHandler,
  keyboardEmulationHandler,
  keyboardInputEmulationHandler,
  keyboardSubmitInputHandler,
  rectangularSelectionScreenRecordingHandler,
  rectangularSelectionScreenshotHandler,
  screenRecordingStorageHandler,
  screenshotStorageHandler,
  windowScreenRecordingHandler,
  windowScreenshotHandler,
  microphonePermissionReleaseHandler,
  microphonePermissionRequestHandler,
  microphoneSelectHandler,
  microphoneStartRecordingHandler,
  microphoneStopRecordingHandler,
  checkboxConfirmHandler,
  cursorLocateHandler,
  mouseClickHandler,
  mouseEmulationHandler,
  mouseMoveHandler,
  mouseScrollHandler,
] as const satisfies readonly BaseToolHandler[];

export function builtinBaseToolHandlersById(): ReadonlyMap<string, BaseToolHandler> {
  return new Map(builtinBaseToolHandlers.map((handler) => [handler.definition.toolId, handler] as const));
}
