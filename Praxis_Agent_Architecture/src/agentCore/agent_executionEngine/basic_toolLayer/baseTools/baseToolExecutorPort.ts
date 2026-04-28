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
  deletePath?(request: {
    path: string;
    recursive?: boolean;
  }): Promise<BaseToolExecutorResult<{ deleted: boolean }>>;
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

export type BaseToolProcessExecutor = {
  run?(request: {
    command: string;
    args?: readonly string[];
    cwd?: string;
    timeoutMs?: number;
    stdin?: string;
    env?: Readonly<Record<string, string>>;
    intent?: "test" | "benchmark" | "generic";
    context?: Readonly<Record<string, unknown>>;
  }): Promise<BaseToolExecutorResult<{ exitCode: number; stdout: string; stderr: string; durationMs?: number }>>;
};

export type BaseToolDebugLogEntry = {
  source: string;
  level?: "trace" | "debug" | "info" | "warn" | "error";
  message: string;
  timestamp?: string;
};

export type BaseToolDebugStackFrame = {
  id?: string;
  name: string;
  filePath?: string;
  line?: number;
  column?: number;
};

export type BaseToolDebugVariable = {
  name: string;
  valuePreview: string;
  type?: string;
  variablesReference?: number;
};

export type BaseToolDebugExecutor = {
  launch?(request: {
    target: Readonly<Record<string, unknown>>;
    breakpoints?: readonly Readonly<Record<string, unknown>>[];
    environment?: Readonly<Record<string, string>>;
    timeoutMs?: number;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<
    BaseToolExecutorResult<{
      debugSessionId: string;
      state: "launched" | "attached" | "running" | "paused" | "failed";
      breakpointsAccepted?: number;
      events?: readonly BaseToolDebugLogEntry[];
    }>
  >;
  captureState?(request: {
    target: Readonly<Record<string, unknown>>;
    capture?: Readonly<Record<string, unknown>>;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<
    BaseToolExecutorResult<{
      state: "running" | "paused" | "stopped" | "unknown";
      stack?: readonly BaseToolDebugStackFrame[];
      variables?: readonly BaseToolDebugVariable[];
      breakpoints?: readonly Readonly<Record<string, unknown>>[];
    }>
  >;
  collectLogs?(request: {
    sources: readonly Readonly<Record<string, unknown>>[];
    maxEntries?: number;
    since?: string;
    redaction?: Readonly<Record<string, unknown>>;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<BaseToolExecutorResult<{ entries: readonly BaseToolDebugLogEntry[]; truncated?: boolean }>>;
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
    expectedContentType?: string;
    maxBytes?: number;
    timeoutMs?: number;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<
    BaseToolExecutorResult<{
      status: number;
      headers: Readonly<Record<string, string>>;
      body: string;
      finalUrl?: string;
    }>
  >;
  search?(request: {
    provider?: "generic" | "browser" | "custom";
    query: string;
    maxResults?: number;
    recencyDays?: number;
    safeSearch?: boolean;
    locale?: string;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<
    BaseToolExecutorResult<{
      results: readonly { title: string; url: string; snippet?: string; raw?: unknown }[];
      providerMetadata?: Readonly<Record<string, unknown>>;
      raw?: unknown;
    }>
  >;
  nativeWebSearch?(request: {
    provider: "openai" | "anthropic" | "deepmind";
    query: string;
    model?: string;
    maxResults?: number;
    recencyDays?: number;
    freshness?: "any" | "day" | "week" | "month" | "year";
    allowedDomains?: readonly string[];
    searchContextSize?: "low" | "medium" | "high";
    userLocation?: {
      city?: string;
      region?: string;
      country?: string;
      timezone?: string;
    };
    citations?: "required" | "preferred" | "off";
    context?: Readonly<Record<string, unknown>>;
  }): Promise<
    BaseToolExecutorResult<{
      answer?: string;
      sources: readonly {
        title?: string;
        url: string;
        snippet?: string;
        kind?: "search_result" | "citation" | "provider_native";
        raw?: unknown;
      }[];
      citations?: readonly {
        url: string;
        title?: string;
        snippet?: string;
        providerReference?: string;
        raw?: unknown;
      }[];
      providerMetadata?: Readonly<Record<string, unknown>>;
      raw?: unknown;
    }>
  >;
  ground?(request: {
    claim: string;
    evidence: readonly {
      id?: string;
      url?: string;
      title?: string;
      excerpt?: string;
      observedAt?: string;
    }[];
    mode?: "strict" | "balanced" | "exploratory";
    minimumEvidenceCount?: number;
    provider?: "openai" | "anthropic" | "deepmind" | "generic";
    model?: string;
    citations?: "required" | "preferred" | "off";
    context?: Readonly<Record<string, unknown>>;
  }): Promise<
    BaseToolExecutorResult<{
      answer?: string;
      grounded: boolean;
      status: "grounded" | "partially-grounded" | "unsupported";
      confidence: "high" | "medium" | "low" | "not-evaluated";
      citations: readonly {
        url: string;
        title?: string;
        snippet?: string;
        providerReference?: string;
        raw?: unknown;
      }[];
      sources: readonly {
        title?: string;
        url: string;
        snippet?: string;
        kind?: "search_result" | "citation" | "provider_native";
        raw?: unknown;
      }[];
      providerMetadata?: Readonly<Record<string, unknown>>;
      raw?: unknown;
    }>
  >;
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
  authenticate?(request: {
    serverId: string;
    authStrategy: "oauth" | "api-key" | "bearer-token" | "custom";
    credentialRef: string;
    requestedScopes?: readonly string[];
    context?: Readonly<Record<string, unknown>>;
  }): Promise<
    BaseToolExecutorResult<{
      status: "authenticated" | "already_authenticated" | "pending";
      serverId?: string;
      authSessionId?: string;
      expiresAt?: string;
      scopesGranted?: readonly string[];
      providerMetadata?: Readonly<Record<string, unknown>>;
      raw?: unknown;
    }>
  >;
  authorize?(request: {
    serverId: string;
    subjectId: string;
    action: "call-tool" | "read-resource" | "subscribe" | "cache-access";
    toolName?: string;
    resourceUri?: string;
    requestedScopes?: readonly string[];
    context?: Readonly<Record<string, unknown>>;
  }): Promise<
    BaseToolExecutorResult<{
      decision: "allowed" | "denied" | "conditional" | "pending";
      reason?: string;
      policyId?: string;
      scopesGranted?: readonly string[];
      providerMetadata?: Readonly<Record<string, unknown>>;
      raw?: unknown;
    }>
  >;
  cache?(request: {
    serverId: string;
    cacheKey: string;
    valueRef: string;
    ttlSeconds?: number;
    tags?: readonly string[];
    context?: Readonly<Record<string, unknown>>;
  }): Promise<
    BaseToolExecutorResult<{
      cacheKey?: string;
      status: "cached" | "already_cached" | "pending";
      expiresAt?: string;
      providerMetadata?: Readonly<Record<string, unknown>>;
      raw?: unknown;
    }>
  >;
  invalidateCache?(request: {
    serverId: string;
    scope: "server" | "resources" | "tools" | "all";
    cacheKey?: string;
    reason?: string;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<
    BaseToolExecutorResult<{
      scope?: "server" | "resources" | "tools" | "all";
      cacheKey?: string;
      status: "invalidated" | "not_found" | "pending";
      invalidatedCount?: number;
      providerMetadata?: Readonly<Record<string, unknown>>;
      raw?: unknown;
    }>
  >;
  connect?(request: {
    serverId: string;
    connectionId?: string;
    transportHint?: "stdio" | "http" | "sse";
    timeoutMs?: number;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<
    BaseToolExecutorResult<{
      connectionId?: string;
      status: "connected" | "reused" | "pending";
      serverId?: string;
      providerMetadata?: Readonly<Record<string, unknown>>;
      raw?: unknown;
    }>
  >;
  disconnect?(request: {
    serverId: string;
    connectionId?: string;
    reason?: string;
    force?: boolean;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<
    BaseToolExecutorResult<{
      connectionId?: string;
      status: "disconnected" | "not_found" | "already_disconnected";
      serverId?: string;
      providerMetadata?: Readonly<Record<string, unknown>>;
      raw?: unknown;
    }>
  >;
  subscribe?(request: {
    serverId: string;
    connectionId?: string;
    subjectType: "resource" | "event" | "tool";
    subject: string;
    eventKinds?: readonly string[];
    replayPolicy?: "none" | "latest";
    context?: Readonly<Record<string, unknown>>;
  }): Promise<
    BaseToolExecutorResult<{
      subscriptionId: string;
      status: "subscribed" | "already_subscribed" | "pending";
      serverId?: string;
      connectionId?: string;
      providerMetadata?: Readonly<Record<string, unknown>>;
      raw?: unknown;
    }>
  >;
  unsubscribe?(request: {
    serverId: string;
    subscriptionId: string;
    reason?: string;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<
    BaseToolExecutorResult<{
      subscriptionId?: string;
      status: "unsubscribed" | "not_found" | "already_unsubscribed";
      serverId?: string;
      providerMetadata?: Readonly<Record<string, unknown>>;
      raw?: unknown;
    }>
  >;
  callTool?(request: {
    serverId: string;
    toolName: string;
    arguments?: Readonly<Record<string, unknown>>;
    mode?: "tool" | "service";
    timeoutMs?: number;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<BaseToolExecutorResult<unknown>>;
  streamTool?(request: {
    serverId: string;
    name: string;
    channel?: "events" | "chunks";
    arguments?: Readonly<Record<string, unknown>>;
    maxEvents?: number;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<
    BaseToolExecutorResult<{
      executionId?: string;
      streamId?: string;
      status: "streaming" | "started" | "completed" | "pending";
      channel?: "events" | "chunks";
      chunks?: readonly unknown[];
      events?: readonly unknown[];
      providerMetadata?: Readonly<Record<string, unknown>>;
      raw?: unknown;
    }>
  >;
  cancelExecution?(request: {
    serverId: string;
    executionId: string;
    reason?: string;
    force?: boolean;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<
    BaseToolExecutorResult<{
      executionId?: string;
      status: "cancelled" | "not_found" | "already_finished" | "pending";
      serverId?: string;
      providerMetadata?: Readonly<Record<string, unknown>>;
      raw?: unknown;
    }>
  >;
  nativeExecute?(request: {
    serverId: string;
    method: string;
    params?: Readonly<Record<string, unknown>>;
    protocolVersion?: string;
    idempotencyKey?: string;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<
    BaseToolExecutorResult<{
      status: "executed" | "pending" | "rejected";
      result?: unknown;
      providerMetadata?: Readonly<Record<string, unknown>>;
      raw?: unknown;
    }>
  >;
  listTools?(request: {
    serverId: string;
    namespace?: string;
    includeDisabled?: boolean;
    cursor?: string;
    limit?: number;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<
    BaseToolExecutorResult<{
      tools: readonly {
        name: string;
        title?: string;
        description?: string;
        inputSchema?: unknown;
        disabled?: boolean;
        namespace?: string;
        raw?: unknown;
      }[];
      nextCursor?: string;
      providerMetadata?: Readonly<Record<string, unknown>>;
      raw?: unknown;
    }>
  >;
  registerTool?(request: {
    serverId: string;
    tool: {
      name: string;
      description?: string;
      inputSchema?: Readonly<Record<string, unknown>>;
      outputSchema?: Readonly<Record<string, unknown>>;
      metadata?: Readonly<Record<string, unknown>>;
    };
    replaceExisting?: boolean;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<
    BaseToolExecutorResult<{
      name?: string;
      status: "registered" | "already_exists" | "pending";
      providerMetadata?: Readonly<Record<string, unknown>>;
      raw?: unknown;
    }>
  >;
  updateTool?(request: {
    serverId: string;
    toolName: string;
    patch: {
      name?: string;
      description?: string;
      inputSchema?: Readonly<Record<string, unknown>>;
      outputSchema?: Readonly<Record<string, unknown>>;
      metadata?: Readonly<Record<string, unknown>>;
    };
    context?: Readonly<Record<string, unknown>>;
  }): Promise<
    BaseToolExecutorResult<{
      toolName?: string;
      status: "updated" | "not_found" | "pending";
      providerMetadata?: Readonly<Record<string, unknown>>;
      raw?: unknown;
    }>
  >;
  unregisterTool?(request: {
    serverId: string;
    toolName: string;
    keepAuditRecord?: boolean;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<
    BaseToolExecutorResult<{
      toolName?: string;
      status: "unregistered" | "not_found" | "pending";
      providerMetadata?: Readonly<Record<string, unknown>>;
      raw?: unknown;
    }>
  >;
  listResources?(request: {
    serverId: string;
    uriPrefix?: string;
    cursor?: string;
    limit?: number;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<
    BaseToolExecutorResult<{
      resources: readonly {
        uri: string;
        name?: string;
        mimeType?: string;
        raw?: unknown;
      }[];
      nextCursor?: string;
      exhausted?: boolean;
      providerMetadata?: Readonly<Record<string, unknown>>;
      raw?: unknown;
    }>
  >;
  readResource?(request: {
    serverId: string;
    resourceUri: string;
    acceptMimeTypes?: readonly string[];
    maxBytes?: number;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<
    BaseToolExecutorResult<{
      uri?: string;
      contents: readonly {
        mimeType?: string;
        text?: string;
        bytesBase64?: string;
        raw?: unknown;
      }[];
      truncated?: boolean;
      providerMetadata?: Readonly<Record<string, unknown>>;
      raw?: unknown;
    }>
  >;
  createResource?(request: {
    serverId: string;
    uri: string;
    resourceType?: string;
    mimeType?: string;
    initialContent?: unknown;
    metadata?: Readonly<Record<string, unknown>>;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<
    BaseToolExecutorResult<{
      uri?: string;
      status: "created" | "already_exists" | "pending";
      revision?: string;
      providerMetadata?: Readonly<Record<string, unknown>>;
      raw?: unknown;
    }>
  >;
  updateResource?(request: {
    serverId: string;
    resourceUri: string;
    content: { mimeType?: string; text?: string; bytesBase64?: string; metadata?: Readonly<Record<string, unknown>> };
    expectedRevision?: string;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<
    BaseToolExecutorResult<{
      uri?: string;
      status: "updated" | "not_found" | "conflict" | "pending";
      revision?: string;
      providerMetadata?: Readonly<Record<string, unknown>>;
      raw?: unknown;
    }>
  >;
  deleteResource?(request: {
    serverId: string;
    uri: string;
    expectedRevision?: string;
    reason?: string;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<
    BaseToolExecutorResult<{
      uri?: string;
      status: "deleted" | "not_found" | "conflict" | "pending";
      providerMetadata?: Readonly<Record<string, unknown>>;
      raw?: unknown;
    }>
  >;
  ping?(request: {
    serverId: string;
    connectionId?: string;
    timeoutMs?: number;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<
    BaseToolExecutorResult<{
      healthy: boolean | "unknown";
      status?: string;
      latencyMs?: number;
      providerMetadata?: Readonly<Record<string, unknown>>;
      raw?: unknown;
    }>
  >;
  checkHealth?(request: {
    serverId: string;
    connectionId?: string;
    timeoutMs?: number;
    includeCapabilities?: boolean;
    includeLatencyProbe?: boolean;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<
    BaseToolExecutorResult<{
      status: "healthy" | "degraded" | "unhealthy" | "unknown";
      connection?: string;
      latencyMs?: number;
      capabilities?: readonly string[];
      providerMetadata?: Readonly<Record<string, unknown>>;
      raw?: unknown;
    }>
  >;
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
  process?: BaseToolProcessExecutor;
  debug?: BaseToolDebugExecutor;
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
