# Runtime Sandbox Plane

Praxis 的 sandbox 面向 host effect：写文件、跑进程、git 变更、网络访问、杀进程等会真实影响宿主系统的行为。只读文件读取默认不进入进程沙箱，但仍然经过 workspace path policy 和 secret path policy。

## Execution Chain

一次 BaseTool 调用的执行链路是：

```text
tool call
-> baseTool policy adjudication
-> approval / agent-review / session approval cache
-> BaseTool sandbox plan
-> BaseTool handler
-> executor port
-> SandboxCommandRunner
-> provider execution / workspace rollback
-> structured denial / diff / audit events
```

工具 handler 不直接感知沙箱；真实 host effect 由 executor port 托管。`shell.run`、`process.run`、`git.runGit`、`search.ripgrep` 和 `sandbox.run` 统一通过 `SandboxCommandRunner` 承载。`patch.apply` 这类纯 TypeScript 写操作不走进程 runner，但在 `workspace-rollback` 模式下由 Kernel 在调用前后包裹 snapshot/diff/restore。

`process.wait` / `process.kill` 控制的是宿主已有进程，不进入进程沙箱。`process.kill` 在 `permissive` / `standard` / `restricted` 下需要 runtime approval context，拒绝时返回可路由的 `PROCESS_KILL_APPROVAL_REQUIRED` 和 `process.kill:process:<pid>` scope。

## Policy Profiles

- `bapr`: 不进入沙箱，不硬拦 secret path，只审计。
- `yolo`: 不进入强隔离；对命令类写入启用 workspace rollback；不硬拦 `.env*`。
- `permissive` / `standard` / `restricted`: 默认要求强隔离。强隔离不可用时按 BaseTool sandbox plan 降级到 workspace rollback，并保留结构化降级事件。

`.env` 和 `.env.*` 在 `permissive`、`standard`、`restricted` 下由 executor path policy 硬拦。Linux `bubblewrap` 命令计划还会扫描 workspace 内的 `.env*` 文件并在沙箱内用空文件遮蔽，避免 shell 直接读取 secret 文件。后续如果要放行，需要通过 application approval surface 显式开洞。

## Providers

- Linux: `linux-bubblewrap`，live provider。运行态会 probe/smoke `bwrap`，命令通过 `bwrap` 包装。
- macOS: `macos-containerization` 对应 Seatbelt / `sandbox-exec` provider。当前 runtime 在 macOS 上探测 `/usr/bin/sandbox-exec`，并生成 Seatbelt command plan。
- Windows: `windows-sandbox` 对应 restricted process native-helper contract。当前 provider 暴露 `praxis.windowsSandbox.restrictedProcess.v1` 契约；真正 token/job-object enforcement 需要 native helper 组件由 dependency/application policy 安装或注入。provider 会输出 `dependency.praxis.windowsSandboxHelper` 的 provider-managed install envelope，供 application 决定是否安装。
- Remote: `remote-worker` 通过 `SandboxRemoteWorkerAdapter` 注入。Praxis 本地 runtime 负责 policy、approval 和 session cache；remote worker 只执行命令并返回 stdout/stderr/exitCode/events/artifacts/diff。`createLocalSandboxRemoteWorkerAdapter` 提供同协议的本地 adapter，便于 application 和测试在远端 worker 接入前复用协议。
- Fallback: `workspace-rollback` 是跨平台中等强度保护，只承诺保护 workspace 文件，不保护 home、系统路径、全局缓存或外部服务。

## Workspace Rollback

`workspace-rollback` 不复制整个仓库。它创建文件 manifest 和必要的文件快照：

- git 仓库：记录 git-aware baseline，同时对普通 workspace 文件做 manifest。
- 非 git 仓库：使用 size/mtime/sha256 manifest。
- 执行后生成 changed file diff。
- 命令失败或纯 TS 写工具失败时自动恢复可恢复文件；新增文件删除，修改/删除文件从 snapshot 恢复。

该机制主要服务 `yolo` 和强沙箱不可用时的降级路径。

## Dependency Boundary

Dependency/provision plane 负责声明、探测、计划安装和输出 install envelope。Framework core 不私自运行系统级安装命令；application/developer policy 决定是否执行自动安装。

Linux `bubblewrap` 缺失时输出系统包管理器 command preview；Windows restricted provider 输出 native helper 的 provider-managed envelope；macOS Seatbelt 主要是 OS-provided detect path。

## Network Gate

`web.fetch` 的 handler 会把 runtime context 转发到 `network.fetch`。在 `permissive` / `standard` / `restricted` 且 sandbox network policy 为 `deny` 或 `approval` 时，executor 按 domain 拒绝未批准请求，返回 `NETWORK_POLICY_DENIED`、`approvalScopeKey: web.fetch:domain:<domain>` 和 public-safe metadata。approval 由 application surface 解决后，同一 domain scope 可以走 session cache。

## Public Runtime Surface

Application 层可以通过 `sandboxPlane.runSandboxCommand` / `sandboxPlane.createSandboxCommandPlan` 复用底层命令计划，也可以用 `sandboxPlane.createLocalSandboxRemoteWorkerAdapter` 或在 `PraxisRuntimeKernelOptions.sandbox.remoteWorker` 注入自定义 remote provider。普通工具仍然只通过 BaseTool executor port 运行，不需要直接调用 `sandbox.run`。
