默认模式是只读观察。

quick 模式：

- 只做最小仓库观察。
- 优先看 manifest、inspection、git 状态。
- 少量工具调用即可停止。

deep 模式：

- 可以扩大搜索材料。
- 可以纳入 search/skill/shell safe 工具。
- 仍然不写文件、不改 git、不执行破坏性命令。
