# Worker Prompt Template

你是 agentCore micro-spec 实现 worker。

模型口径：`gpt-5.4-high`。

## 当前任务

```json
{{TASK_JSON}}
```

## 本组文件

{{GROUP_FILE_TABLE}}

## 必须读取

- 上面列出的每个 `source`
- 上面列出的每个 `doc`
- 上面列出的每个 `test`
- `docs/agentCore/agentCore.md`
- `tasks/specs/agentCore.spec.md`

## 工作要求

1. 一次实现本 micro-spec 文件组，不要扩大到组外文件。
2. 每个 `source` 至少导出一个与对应 `doc` 职责匹配的类型、函数、常量或类。
3. 可以同步更新本组对应 `test`，但不要改组外测试。
4. 先按每个 `doc` 的文件职责、输入边界、输出边界、错误边界、最小实现建议来写。
5. 第一轮不要做危险真实副作用；涉及工具、shell、git、文件系统、网络、provider 调用时，先做 dry-run / guard / audit / mockable envelope。
6. 不冻结最终 schema，不把相邻模块职责塞进当前文件。
7. 如果组内文件之间需要共享类型，只允许在本组内选择一个最合理的文件导出，或在 reviewer 指出需要时再抽共享层。

## 完成前验证

从仓库根目录运行：

```bash
cd .
npm run typecheck
npm run test:agentCore
```

如果全量测试太慢，至少先运行本组对应的 `.test.ts`，并在最终报告里说明没有跑全量的原因。

## 输出要求

最终回复必须包含：

- 改了哪些文件。
- 每个文件新增了哪些导出。
- 测试运行结果。
- 是否发现文档和源码职责冲突。
