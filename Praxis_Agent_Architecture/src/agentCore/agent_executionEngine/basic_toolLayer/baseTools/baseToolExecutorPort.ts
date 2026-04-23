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
  }): Promise<BaseToolExecutorResult<{ entries: readonly string[] }>>;
};

export type BaseToolShellExecutor = {
  run?(request: {
    command: string;
    args?: readonly string[];
    cwd?: string;
    timeoutMs?: number;
    stdin?: string;
  }): Promise<BaseToolExecutorResult<{ exitCode: number; stdout: string; stderr: string }>>;
};

export type BaseToolGitExecutor = {
  runGit?(request: {
    repositoryPath: string;
    args: readonly string[];
    timeoutMs?: number;
  }): Promise<BaseToolExecutorResult<{ exitCode: number; stdout: string; stderr: string }>>;
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
