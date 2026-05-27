# lspDependencyResolver

> 对应源码：`src/executionEngine/basic_toolLayer/toolDependency/lspDependencyResolver.ts`

## 1. 文件位置

- 所属顶层模块：执行引擎（`agent_executionEngine`）。
- 所属路径：`agent_executionEngine/basic_toolLayer/toolDependency`。
- 当前文件：`lspDependencyResolver.ts`。
- 角色概括：LSP 语言依赖解析器。

## 2. 文件职责

根据目标文件和 workspace 语言事实判断需要哪个 LSP server。

## 2.1 文件名语义拆解

- `lsp`：Language Server Protocol，代码语义能力服务。
- `DependencyResolver`：把工具调用目标解析成具体依赖画像。
- 工程含义：工具名只说明需要 LSP；目标文件和 workspace 事实才决定需要哪个 LSP。

## 3. 目录语义

- 基础工具原语层：提供 Agent 成立所需的底层工具能力，让 TAP 在其上构建更高级工具治理系统。
- 工具依赖面：描述基础工具运行所需依赖、环境和可用性。

## 4. 源码头部能力注释

- 文件定位：Agent 执行引擎 / basic_toolLayer / toolDependency / lspDependencyResolver。
- 核心目的：兼容旧 LSP 依赖解析入口，并转发 runtime.dependencyPlane LSP resolver。
- 能力要求1：按 target file/languageId 解析语言服务器依赖。
- 能力要求2：把 LSP profile 转成 dependencyManager declaration。
- 边界：不启动 LSP、不安装 server。
- 对接：runtime.dependencyPlane.lspDependencyResolver。
- 实现提示：保持 public-safe 错误形状。

## 5. 需要提供的能力

- 按 target 和 workspace facts 解析 LSP dependency profile。
- 覆盖主流语言，不只覆盖 TS/Python/Rust/Go。
- 输出可被 dependencyManager 消费的 declarations。

## 6. 输入边界

- toolId、target.filePath、target.languageId、workspaceRoot 和 workspaceFacts。

## 7. 输出边界

- LspDependencyProfile。
- ToolDependencyDeclaration 列表。
- public-safe 的 unresolved 错误。

## 8. 错误边界

- target 缺失、语言无法识别。

## 9. 依赖对象

- dependencySourceRegistry
- Node path 工具

## 10. 被谁调用

- LSP 系列 baseTool storage practice。
- dependencyManager
- dependencyChecker
- dependencyIterationManager

## 11. 不应该做什么

- 不探测 PATH。
- 不安装 LSP server。
- 不把某个工具名硬编码成单一语言。

## 12. 最小实现建议

- 用语言注册表维护扩展名、languageId、workspace markers 和 dependencyId。
- 解析优先级固定为 languageId、扩展名、workspace marker、shebang。

## 13. 最小测试建议

- C#、Java、C/C++、Swift、Kotlin、TS、Python、Rust、Go 等主流语言解析。
- languageId 优先级高于扩展名。
- 未知语言返回可解释错误。

## 14. 与系统链路的关系

它是 LSP 依赖判断锚点，将“目标文件属于什么语言生态”转换为 toolDependency 可治理的依赖声明。
