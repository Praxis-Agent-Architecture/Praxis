/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / Host Executor Port。
 * 核心目的：定义 baseTools 需要宿主环境真正动手时可以调用的能力接口。
 * 边界：这里只定义端口，不在 agentCore 内直接执行 fs/shell/git/device/network 副作用。
 */

export type BaseToolExecutorResult<Output = unknown> =
  | {
      ok: true;
      output: Output;
      events?: readonly string[];
      metadata?: Readonly<Record<string, unknown>>;
    }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        publicSafe: true;
      };
      events?: readonly string[];
    };

export type BaseToolFilesystemExecutor = {
  readText?(request: {
    path: string;
    encoding?: string;
    maxBytes?: number;
  }): Promise<BaseToolExecutorResult<{ content: string; truncated: boolean }>>;
  writeText?(request: {
    path: string;
    content: string;
    encoding?: string;
  }): Promise<BaseToolExecutorResult<{ bytesWritten: number }>>;
  list?(request: {
    path: string;
    maxEntries?: number;
    depth?: number;
    includeGlobs?: readonly string[];
    excludeGlobs?: readonly string[];
  }): Promise<BaseToolExecutorResult<{ entries: readonly string[] }>>;
};

export type BaseToolShellExecutor = {
  assembleArguments?(request: {
    input: Readonly<Record<string, unknown>>;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<BaseToolExecutorResult<Readonly<Record<string, unknown>>>>;
  generateCommand?(request: {
    input: Readonly<Record<string, unknown>>;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<BaseToolExecutorResult<Readonly<Record<string, unknown>>>>;
  buildExecutionGuard?(request: {
    input: Readonly<Record<string, unknown>>;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<BaseToolExecutorResult<Readonly<Record<string, unknown>>>>;
  constructInvocation?(request: {
    input: Readonly<Record<string, unknown>>;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<BaseToolExecutorResult<Readonly<Record<string, unknown>>>>;
  generateScript?(request: {
    input: Readonly<Record<string, unknown>>;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<BaseToolExecutorResult<Readonly<Record<string, unknown>>>>;
  validateCommand?(request: {
    command: string;
    workingDirectory?: string;
    shell: "sh" | "bash" | "zsh";
    policy?: Readonly<Record<string, unknown>>;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<BaseToolExecutorResult<Readonly<Record<string, unknown>>>>;
  controlPermission?(request: {
    command: string;
    workingDirectory?: string;
    requestedPermissions: readonly string[];
    riskLevel: "low" | "medium" | "high";
    context?: Readonly<Record<string, unknown>>;
  }): Promise<BaseToolExecutorResult<Readonly<Record<string, unknown>>>>;
  enforceSandbox?(request: {
    command: string;
    workingDirectory: string;
    requestedPaths: readonly string[];
    accessIntents: readonly string[];
    policy?: Readonly<Record<string, unknown>>;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<BaseToolExecutorResult<Readonly<Record<string, unknown>>>>;
  run?(request: {
    command: string;
    args?: readonly string[];
    cwd?: string;
    timeoutMs?: number;
    stdin?: string;
  }): Promise<BaseToolExecutorResult<{ exitCode: number; stdout: string; stderr: string }>>;
  spawnProcess?(request: {
    target: Readonly<Record<string, unknown>>;
    launchMode: "foreground" | "background" | "detached";
    context?: Readonly<Record<string, unknown>>;
  }): Promise<BaseToolExecutorResult<Readonly<Record<string, unknown>>>>;
  startBackground?(request: {
    command: string;
    shell: "sh" | "bash" | "zsh";
    cwd?: string;
    jobId: string;
    monitorIntervalMs: number;
    outputBufferLimitBytes: number;
    captureOutput: boolean;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<BaseToolExecutorResult<Readonly<Record<string, unknown>>>>;
  startDetached?(request: {
    command: string;
    shell: "sh" | "bash" | "zsh";
    cwd?: string;
    launchId: string;
    pidFilePath?: string;
    stdoutLogPath?: string;
    stderrLogPath?: string;
    restartPolicy: "none" | "on-failure";
    context?: Readonly<Record<string, unknown>>;
  }): Promise<BaseToolExecutorResult<Readonly<Record<string, unknown>>>>;
  terminateProcess?(request: {
    processId: number;
    signal: "SIGTERM" | "SIGINT" | "SIGHUP" | "SIGKILL";
    reason?: string;
    force: boolean;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<BaseToolExecutorResult<Readonly<Record<string, unknown>>>>;
  monitorExecution?(request: {
    target: Readonly<Record<string, unknown>>;
    observation?: Readonly<Record<string, unknown>>;
    staleAfterMs?: number;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<BaseToolExecutorResult<Readonly<Record<string, unknown>>>>;
  captureOutput?(request: {
    target: Readonly<Record<string, unknown>>;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<BaseToolExecutorResult<Readonly<Record<string, unknown>>>>;
  controlInteractive?(request: {
    target: Readonly<Record<string, unknown>>;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<BaseToolExecutorResult<Readonly<Record<string, unknown>>>>;
  handlePrompt?(request: {
    target: Readonly<Record<string, unknown>>;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<BaseToolExecutorResult<Readonly<Record<string, unknown>>>>;
  feedStdin?(request: {
    target: Readonly<Record<string, unknown>>;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<BaseToolExecutorResult<Readonly<Record<string, unknown>>>>;
  manageLifecycle?(request: {
    target: Readonly<Record<string, unknown>>;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<BaseToolExecutorResult<Readonly<Record<string, unknown>>>>;
  manageProcess?(request: {
    target: Readonly<Record<string, unknown>>;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<BaseToolExecutorResult<Readonly<Record<string, unknown>>>>;
  manageResource?(request: {
    target: Readonly<Record<string, unknown>>;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<BaseToolExecutorResult<Readonly<Record<string, unknown>>>>;
  manageSession?(request: {
    target: Readonly<Record<string, unknown>>;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<BaseToolExecutorResult<Readonly<Record<string, unknown>>>>;
};

export type BaseToolGitExecutor = {
  runGit?(request: {
    repositoryPath: string;
    args: readonly string[];
    timeoutMs?: number;
  }): Promise<BaseToolExecutorResult<{ exitCode: number; stdout: string; stderr: string }>>;
};

export type BaseToolLspPosition = {
  filePath: string;
  line: number;
  character: number;
  languageId?: string;
};

export type BaseToolLspRange = {
  start: {
    line: number;
    character: number;
  };
  end: {
    line: number;
    character: number;
  };
};

export type BaseToolLspLocation = {
  filePath: string;
  range: BaseToolLspRange;
  uri?: string;
  symbolName?: string;
};

export type BaseToolLspDocumentSymbol = {
  name: string;
  kind: string;
  range: BaseToolLspRange;
  selectionRange?: BaseToolLspRange;
  detail?: string;
  containerName?: string;
  children?: readonly BaseToolLspDocumentSymbol[];
};

export type BaseToolLspWorkspaceSymbol = {
  name: string;
  kind: string;
  location?: BaseToolLspLocation;
  containerName?: string;
  detail?: string;
};

export type BaseToolLspTextEdit = {
  range: BaseToolLspRange;
  newText: string;
};

export type BaseToolLspCompletionItem = {
  label: string;
  kind?: string;
  detail?: string;
  documentation?: string;
  sortText?: string;
  filterText?: string;
  insertText?: string;
  textEdit?: BaseToolLspTextEdit;
};

export type BaseToolLspSignatureHelp = {
  signatures: readonly {
    label: string;
    documentation?: string;
    parameters: readonly {
      label: string;
      documentation?: string;
    }[];
  }[];
  activeSignature?: number;
  activeParameter?: number;
};

export type BaseToolLspHover = {
  contents: string;
  range?: BaseToolLspRange;
};

export type BaseToolLspDiagnostic = {
  range: BaseToolLspRange;
  message: string;
  severity?: "error" | "warning" | "information" | "hint";
  code?: string;
  source?: string;
};

export type BaseToolLspCodeAction = {
  title: string;
  kind?: string;
  diagnostics: readonly BaseToolLspDiagnostic[];
  isPreferred?: boolean;
  editAvailable: boolean;
  commandAvailable: boolean;
};

export type BaseToolLspExecutor = {
  locateDefinition?(request: {
    target: BaseToolLspPosition;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<BaseToolExecutorResult<{ locations: readonly BaseToolLspLocation[] }>>;
  locateTypeDefinition?(request: {
    target: BaseToolLspPosition;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<BaseToolExecutorResult<{ locations: readonly BaseToolLspLocation[] }>>;
  traceReferences?(request: {
    target: BaseToolLspPosition;
    includeDeclaration?: boolean;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<BaseToolExecutorResult<{ locations: readonly BaseToolLspLocation[] }>>;
  traceImplementations?(request: {
    target: BaseToolLspPosition;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<BaseToolExecutorResult<{ locations: readonly BaseToolLspLocation[] }>>;
  scanDocumentSymbols?(request: {
    target: Pick<BaseToolLspPosition, "filePath" | "languageId">;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<BaseToolExecutorResult<{ symbols: readonly BaseToolLspDocumentSymbol[] }>>;
  searchWorkspaceSymbols?(request: {
    query: string;
    limit?: number;
    workspaceRoot?: string;
    languageId?: string;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<BaseToolExecutorResult<{ symbols: readonly BaseToolLspWorkspaceSymbol[] }>>;
  suggestCodeActions?(request: {
    target: { filePath: string; languageId?: string; range: BaseToolLspRange };
    diagnostics?: readonly BaseToolLspDiagnostic[];
    only?: readonly string[];
    context?: Readonly<Record<string, unknown>>;
  }): Promise<BaseToolExecutorResult<{ actions: readonly BaseToolLspCodeAction[] }>>;
  applyCodeActionPreview?(request: {
    target: { filePath: string; languageId?: string; range: BaseToolLspRange };
    actionTitle?: string;
    actionKind?: string;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<BaseToolExecutorResult<{ actions: readonly BaseToolLspCodeAction[] }>>;
  renameSymbolPreview?(request: {
    target: BaseToolLspPosition;
    newName: string;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<BaseToolExecutorResult<{ edits: readonly { filePath: string; edits: readonly BaseToolLspTextEdit[] }[] }>>;
  completeCode?(request: {
    target: BaseToolLspPosition;
    triggerCharacter?: string;
    maxItems?: number;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<BaseToolExecutorResult<{ items: readonly BaseToolLspCompletionItem[] }>>;
  assistSignature?(request: {
    target: BaseToolLspPosition;
    triggerCharacter?: string;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<BaseToolExecutorResult<{ signatureHelp: BaseToolLspSignatureHelp }>>;
  explainSymbol?(request: {
    target: BaseToolLspPosition;
    includeDefinitionHint?: boolean;
    includeReferencesHint?: boolean;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<
    BaseToolExecutorResult<{
      hover?: BaseToolLspHover;
      definitions?: readonly BaseToolLspLocation[];
      references?: readonly BaseToolLspLocation[];
    }>
  >;
  inspectSymbol?(request: {
    target: {
      filePath: string;
      languageId?: string;
      position?: { line: number; character: number };
      symbolName?: string;
    };
    context?: Readonly<Record<string, unknown>>;
  }): Promise<BaseToolExecutorResult<{ symbols: readonly BaseToolLspDocumentSymbol[] }>>;
  inspectDiagnostics?(request: {
    target: { filePath: string; languageId?: string };
    waitMs?: number;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<BaseToolExecutorResult<{ diagnostics: readonly BaseToolLspDiagnostic[] }>>;
  formatDocumentPreview?(request: {
    target: { filePath: string; languageId?: string };
    options?: { tabSize?: number; insertSpaces?: boolean };
    context?: Readonly<Record<string, unknown>>;
  }): Promise<BaseToolExecutorResult<{ edits: readonly BaseToolLspTextEdit[] }>>;
  formatRangePreview?(request: {
    target: { filePath: string; languageId?: string; range: BaseToolLspRange };
    options?: { tabSize?: number; insertSpaces?: boolean };
    context?: Readonly<Record<string, unknown>>;
  }): Promise<BaseToolExecutorResult<{ edits: readonly BaseToolLspTextEdit[] }>>;
};

export type BaseToolNetworkExecutor = {
  fetch?(request: {
    url: string;
    method?: string;
    headers?: Readonly<Record<string, string>>;
    body?: string;
    timeoutMs?: number;
  }): Promise<BaseToolExecutorResult<{ status: number; headers: Readonly<Record<string, string>>; body: string }>>;
  search?(request: {
    query: string;
    maxResults?: number;
    recencyDays?: number;
    locale?: string;
  }): Promise<BaseToolExecutorResult<{ results: readonly { title: string; url: string; snippet?: string }[] }>>;
};

export type BaseToolSearchExecutor = {
  ripgrep?(request: {
    command: readonly string[];
    query: string;
    directoryPath: string;
    fileGlob?: string;
    maxMatches: number;
    literal: boolean;
    caseSensitive: boolean;
    includeHidden: boolean;
    multiline: boolean;
    contextLines: number;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<
    BaseToolExecutorResult<{
      exitCode: number;
      matches: readonly { path: string; line: number; column?: number; text: string }[];
      stderr?: string;
    }>
  >;
};

export type BaseToolMcpExecutor = {
  callTool?(request: {
    serverId: string;
    toolName: string;
    arguments?: Readonly<Record<string, unknown>>;
  }): Promise<BaseToolExecutorResult<unknown>>;
};

export type BaseToolDeviceExecutor = {
  captureScreenshot?(request: {
    target?: "fullscreen" | "window" | "region";
    metadata?: Readonly<Record<string, unknown>>;
  }): Promise<BaseToolExecutorResult<{ artifactId: string; mimeType: string }>>;
  captureCameraPhoto?(request: {
    cameraId: string;
    purpose: string;
    outputFormat?: string;
  }): Promise<BaseToolExecutorResult<{ artifactId: string; mimeType: string }>>;
  recordAudio?(request: {
    microphoneId: string;
    durationMs?: number;
  }): Promise<BaseToolExecutorResult<{ artifactId: string; mimeType: string }>>;
};

export type BaseToolOfficeExecutor = {
  decodeDocument?(request: {
    documentPath: string;
    format?: string;
    maxCharacters?: number;
  }): Promise<BaseToolExecutorResult<{ text?: string; metadata?: Readonly<Record<string, unknown>> }>>;
};

export type BaseToolOmniExecutor = {
  transformMedia?(request: {
    operation: string;
    inputArtifactId?: string;
    parameters?: Readonly<Record<string, unknown>>;
  }): Promise<BaseToolExecutorResult<{ artifactId: string; mimeType?: string }>>;
};

export type BaseToolSkillExecutor = {
  runSkill?(request: {
    skillId: string;
    operation: string;
    arguments?: Readonly<Record<string, unknown>>;
  }): Promise<BaseToolExecutorResult<unknown>>;
};

export type BaseToolCustomExecutor = {
  invokeCustomTool?(request: {
    toolId: string;
    arguments?: Readonly<Record<string, unknown>>;
  }): Promise<BaseToolExecutorResult<unknown>>;
};

export type BaseToolExecutorPort = {
  filesystem?: BaseToolFilesystemExecutor;
  shell?: BaseToolShellExecutor;
  git?: BaseToolGitExecutor;
  lsp?: BaseToolLspExecutor;
  search?: BaseToolSearchExecutor;
  network?: BaseToolNetworkExecutor;
  mcp?: BaseToolMcpExecutor;
  device?: BaseToolDeviceExecutor;
  office?: BaseToolOfficeExecutor;
  omni?: BaseToolOmniExecutor;
  skill?: BaseToolSkillExecutor;
  custom?: BaseToolCustomExecutor;
};

export const baseToolExecutorPortDescriptor = {
  port: "agentCore.basicTool.hostExecutor",
  agentCoreOwnsSideEffects: false,
  hostOwnsRealExecution: true,
  supportsCustomTools: true,
} as const;
