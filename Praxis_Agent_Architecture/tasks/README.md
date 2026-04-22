# agentCore Spec Ledger 工作流

这个目录是 `agentCore` 自动化构建任务的任务账本和调度入口。

当前目标不是让 Codex 在一个 worktree 里乱写 488 个文件，而是把工作拆成：

```text
大 spec
  -> 小 spec
  -> 单文件任务
  -> worker 实现
  -> reviewer 测试和 code review
  -> merge 验证与合并
  -> 自动打勾
```

## 文件说明

- `agentCore_parallel_implementation_plan.md`：人工可读的总体计划。
- `specs/agentCore.spec.md`：大 spec 和小 spec 的人工说明。
- `ledger.json`：机器可读任务账本，由脚本生成和更新。
- `prompts/worker.md`：实现 agent 的 prompt 模板。
- `prompts/reviewer.md`：测试和 review agent 的 prompt 模板。
- `prompts/merge.md`：合并和清理 agent 的 prompt 模板。
- `scripts/agentcore_workflow.mjs`：本地调度脚本。

## 快速试用

从仓库根目录运行：

```bash
node Praxis_Agent_Architecture/tasks/scripts/agentcore_workflow.mjs init --force
node Praxis_Agent_Architecture/tasks/scripts/agentcore_workflow.mjs preflight
node Praxis_Agent_Architecture/tasks/scripts/agentcore_workflow.mjs status
node Praxis_Agent_Architecture/tasks/scripts/agentcore_workflow.mjs next --limit 5
node Praxis_Agent_Architecture/tasks/scripts/agentcore_workflow.mjs lease AC-F-0001 --agent local-demo
node Praxis_Agent_Architecture/tasks/scripts/agentcore_workflow.mjs prompt AC-F-0001 --role worker
```

默认不会自动调用 Codex，也不会自动改代码。要真正调用 Codex，需要后续显式走 `run` 命令并确认 `--execute`。

## 全自动流水线试跑

先看某个任务会如何执行，不真正开 agent：

```bash
node Praxis_Agent_Architecture/tasks/scripts/agentcore_workflow.mjs pipeline AC-F-0359 --worktree
```

它会打印：

- 要创建的 worktree。
- worker 阶段的 `codex exec` 命令。
- reviewer 阶段的 `codex exec` 命令。
- merge 阶段的 `codex exec` 命令。

真正执行单个任务：

```bash
node Praxis_Agent_Architecture/tasks/scripts/agentcore_workflow.mjs pipeline AC-F-0359 --worktree --execute
```

批量 dry-run：

```bash
node Praxis_Agent_Architecture/tasks/scripts/agentcore_workflow.mjs batch --spec AC-SPEC-A --limit 2 --worktree
```

批量真实执行，默认最多 4 个 active run：

```bash
node Praxis_Agent_Architecture/tasks/scripts/agentcore_workflow.mjs batch --spec AC-SPEC-A --limit 4 --worktree --execute
```

查看正在跑的 agent：

```bash
node Praxis_Agent_Architecture/tasks/scripts/agentcore_workflow.mjs active
```

清理已结束进程记录：

```bash
node Praxis_Agent_Architecture/tasks/scripts/agentcore_workflow.mjs reap
```

杀掉某个任务或全部任务：

```bash
node Praxis_Agent_Architecture/tasks/scripts/agentcore_workflow.mjs kill AC-F-0359
node Praxis_Agent_Architecture/tasks/scripts/agentcore_workflow.mjs kill AC-F-0359 --execute
node Praxis_Agent_Architecture/tasks/scripts/agentcore_workflow.mjs kill all --execute
```

## 模型配置

脚本默认使用：

```text
model = gpt-5.4
model_reasoning_effort = high
```

也就是当前约定的 `gpt-5.4-high`。如果要临时覆盖：

```bash
AGENTCORE_CODEX_MODEL=gpt-5.4 \
AGENTCORE_CODEX_REASONING=high \
node Praxis_Agent_Architecture/tasks/scripts/agentcore_workflow.mjs pipeline AC-F-0359 --worktree
```

如果以后 Codex CLI 暴露更明确的 `fast` 档位，可以只在脚本的模型命令处替换，不需要改 488 个任务。

## 重要前置条件

使用 `--worktree --execute` 前，建议先把当前任务系统、文档和测试基线提交到 `dev/rebase`。

原因是：`git worktree` 从 `dev/rebase` 创建新工作区，如果这些文件仍是未跟踪状态，新 worktree 可能看不到它们。

运行：

```bash
node Praxis_Agent_Architecture/tasks/scripts/agentcore_workflow.mjs preflight
```

如果看到：

```text
foundation committed for worktree: false
```

就说明现在更适合先 commit 基础设施，或暂时不用 `--worktree` 做真实执行。

## 安全边界

- 一个 file task 默认只允许改自己的 `.ts` 和 `.test.ts`。
- reviewer 可以改对应测试，但不能扩大范围。
- merge 负责验证、合并和更新账本，不负责重新设计模块。
- 并发建议从 4 个 agent 起步，稳定后最多 6 个。
- 推荐每个 slice 使用独立 `git worktree`，不要在同一个 worktree 并发写代码。
