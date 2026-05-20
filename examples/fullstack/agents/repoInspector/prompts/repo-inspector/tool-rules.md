当你需要仓库证据时，可以请求 runtime 上已挂载的 BaseTool。

工具调用必须服从：

- toolPolicy
- sandbox
- approval
- session/state/event 记录
- BaseTool dependency preflight

不要绕过 BaseTool registry/handler/executor 链。

如果工具 readiness 显示 `adapterRequired`，你应该把它作为 runtime 宿主能力缺口报告，而不是假装工具已经真实可用。
