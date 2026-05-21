/*
 * Compatibility bridge for the removed basic_toolLayer executor port.
 *
 * The new model/tool rewrite keeps runtime code compiling while the concrete
 * 176-tool implementation moves to the new toolBase surface. This file keeps
 * only the generic host-port contract that runtime.execEngine still consumes.
 */

export type BaseToolExecutorResult<Output = any> =
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
        metadata?: Readonly<Record<string, unknown>>;
      };
      events?: readonly string[];
      metadata?: Readonly<Record<string, unknown>>;
    };

export type BaseToolExecutorMethod<Output = any> = (
  request: any,
) => BaseToolExecutorResult<Output> | Promise<BaseToolExecutorResult<Output>>;

export type BaseToolExecutorNamespace = {
  readonly [method: string]: BaseToolExecutorMethod | undefined;
};

export type BaseToolShellServiceStatus =
  | "starting"
  | "spawned"
  | "alive"
  | "healthy"
  | "unverified"
  | "exited"
  | "failed";

export type BaseToolShellServiceProbe = Record<string, any>;

export type BaseToolShellServiceVerification = Record<string, any>;

export type BaseToolShellServiceHealth = {
  status: BaseToolShellServiceStatus;
  healthy?: boolean;
  verified?: boolean;
  passed?: boolean;
  message?: string;
  probe?: BaseToolShellServiceProbe;
  checkedAt?: string;
  metadata?: Readonly<Record<string, unknown>>;
  readonly [key: string]: any;
};

export type BaseToolShellServiceStatusSnapshot = {
  status: BaseToolShellServiceStatus;
  health: BaseToolShellServiceHealth;
  alive?: boolean;
  pid?: number;
  command?: string;
  args?: readonly string[];
  cwd?: string;
  launchMode?: string;
  exitCode?: number | null;
  listeningPorts?: readonly number[];
  lastStdout?: string;
  lastStderr?: string;
  stdoutBytes?: number;
  stderrBytes?: number;
  stdoutArtifactRef: string;
  stderrArtifactRef: string;
  truncatedForDisplay?: boolean;
  url?: string;
  checkedAt?: string;
  metadata?: Readonly<Record<string, unknown>>;
  readonly [key: string]: any;
};

export type BaseToolExecutorPort = {
  readonly artifact?: BaseToolExecutorNamespace;
  readonly computeruse?: BaseToolExecutorNamespace;
  readonly custom?: BaseToolExecutorNamespace;
  readonly debug?: BaseToolExecutorNamespace;
  readonly device?: BaseToolExecutorNamespace;
  readonly filesystem?: BaseToolExecutorNamespace;
  readonly git?: BaseToolExecutorNamespace;
  readonly lsp?: BaseToolExecutorNamespace;
  readonly mcp?: BaseToolExecutorNamespace;
  readonly network?: BaseToolExecutorNamespace;
  readonly office?: BaseToolExecutorNamespace;
  readonly omni?: BaseToolExecutorNamespace;
  readonly process?: BaseToolExecutorNamespace;
  readonly search?: BaseToolExecutorNamespace;
  readonly shell?: BaseToolExecutorNamespace;
  readonly skill?: BaseToolExecutorNamespace;
};
