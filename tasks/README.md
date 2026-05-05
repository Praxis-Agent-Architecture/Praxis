# agentCore Spec Ledger 工作流

这个目录是 `agentCore` 自动化构建任务的任务账本和调度入口。

当前目标不是让 Codex 在一个 worktree 里乱写 488 个文件，而是把工作拆成：

```text
大 spec
  -> 小 spec
  -> micro-spec 文件组
  -> worker 实现
  -> reviewer 逐文件测试和 code review
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
node tasks/scripts/agentcore_workflow.mjs init --force
node tasks/scripts/agentcore_workflow.mjs preflight
node tasks/scripts/agentcore_workflow.mjs status
node tasks/scripts/agentcore_workflow.mjs next --limit 5
node tasks/scripts/agentcore_workflow.mjs prompt AC-G-0094 --role worker
```

默认不会自动调用 Codex，也不会自动改代码。要真正调用 Codex，需要后续显式走 `run` 命令并确认 `--execute`。

## 全自动流水线试跑

先看某个任务会如何执行，不真正开 agent：

```bash
node tasks/scripts/agentcore_workflow.mjs pipeline AC-G-0094 --worktree
```

它会打印：

- 要创建的 worktree。
- worker 阶段的 `codex exec` 命令。
- reviewer 阶段的 `codex exec` 命令。
- merge 阶段的 `codex exec` 命令。

真正执行单个任务：

```bash
node tasks/scripts/agentcore_workflow.mjs pipeline AC-G-0094 --worktree --execute
```

批量 dry-run：

```bash
node tasks/scripts/agentcore_workflow.mjs batch --spec AC-SPEC-A --limit 2 --worktree
```

批量真实执行，默认最多 4 个 active run：

```bash
node tasks/scripts/agentcore_workflow.mjs batch --spec AC-SPEC-A --limit 4 --worktree --execute
```

查看正在跑的 agent：

```bash
node tasks/scripts/agentcore_workflow.mjs active
```

清理已结束进程记录：

```bash
node tasks/scripts/agentcore_workflow.mjs reap
```

杀掉某个任务或全部任务：

```bash
node tasks/scripts/agentcore_workflow.mjs kill AC-G-0094
node tasks/scripts/agentcore_workflow.mjs kill AC-G-0094 --execute
node tasks/scripts/agentcore_workflow.mjs kill all --execute
```

## 任务粒度

当前不是单文件三段流水线，而是 micro-spec 文件组流水线。

默认每组 4 个文件：

```bash
node tasks/scripts/agentcore_workflow.mjs init --force --group-size 4
```

这样比整个 small spec 更小，能控制 Codex 上下文；又比单文件更大，避免每个文件都开三次 Codex。

reviewer 仍然逐文件 review，但由一个 reviewer Codex 完成本组所有文件的 review。

## 模型配置

脚本按角色使用：

```text
worker   = gpt-5.4 high
reviewer = gpt-5.4 high
merge    = gpt-5.4 medium
```

merge 仍然由 Codex 做，但它的职责是检查 diff 范围、跑 typecheck/test、更新账本、必要时准备 cherry-pick 或合并，不负责重新写主体功能。

## 重要前置条件

使用 `--worktree --execute` 前，建议先把当前任务系统、文档和测试基线提交到 `dev/rebase`。

原因是：`git worktree` 从 `dev/rebase` 创建新工作区，如果这些文件仍是未跟踪状态，新 worktree 可能看不到它们。

运行：

```bash
node tasks/scripts/agentcore_workflow.mjs preflight
```

如果看到：

```text
foundation committed for worktree: false
```

就说明现在更适合先 commit 基础设施，或暂时不用 `--worktree` 做真实执行。

## 安全边界

- 一个 group task 默认只允许改本组列出的 `.ts` 和 `.test.ts`。
- reviewer 逐文件 review，可以改本组对应测试，但不能扩大范围。
- merge 负责验证、合并和更新账本，不负责重新设计模块。
- 并发建议从 4 个 agent 起步，稳定后最多 6 个。
- 推荐每个 slice 使用独立 `git worktree`，不要在同一个 worktree 并发写代码。
