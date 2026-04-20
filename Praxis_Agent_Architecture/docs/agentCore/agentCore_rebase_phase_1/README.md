# agentCore_rebase_phase_1

## 1. phase 定位

`agentCore_rebase_phase_1` 是 `agentCore` 文档体系重组后的第一阶段收口目录。

这一 phase 的目标是固化新的 `agentCore` 设计基线，把第一批正式基线文档统一收束到同一读取入口下，作为后续分层扩展的稳定起点。

## 2. 读取约定

当前这一批 `agentCore` 基线文档，应统一从 `Praxis_Agent_Architecture/docs/agentCore/agentCore_rebase_phase_1/` 目录读取。

旧的 `Praxis_Agent_Architecture/docs/` 平铺路径不再作为这批文档的标准读取入口，也不再作为后续引用的主路径。

## 3. 当前收录主题

本 phase 当前收录的主题包括：

- 宿主总纲：`agent-core-host-design-baseline-v1.md`
- `Spec / Class` 声明模型：`agent-core-spec-class-declaration-model-v1.md`
- `PromptPack` 语义层与 provider/carrier 映射：`agent-core-promptpack-semantics-and-provider-carrier-mapping-baseline-v1.md`
- 能力系统、名称映射与宽度策略：`agent-core-capability-name-mapping-and-width-strategy-baseline-v1.md`
- `ModelCarrier`：`agent-core-modelcarrier-formal-baseline-v1.md`
- `runtime-table` 与 `compile / checker / exporter`：`agent-core-runtime-table-formal-baseline-v1.md`、`agent-core-runtime-table-compile-checker-exporter-formal-baseline-v1.md`
- `InterfacePack`：`agent-core-interfacepack-formal-baseline-v1.md`
- `boot`：`agent-core-boot-formal-baseline-v1.md`
- 恢复链路 `resume / recover / hydrate`：`agent-core-runtime-resume-recover-hydrate-formal-baseline-v1.md`
- 材料层 `checkpoint / snapshot`：`agent-core-checkpoint-snapshot-material-layer-formal-baseline-v1.md`
- `journal / receipt / cursor / reconciliation`：`agent-core-journal-receipt-cursor-reconciliation-formal-baseline-v1.md`

## 4. 后续扩展

后续 phase 可以继续沿 `Praxis_Agent_Architecture/docs/agentCore/` 目录分层扩展，例如按 phase、专题或更细的子系统层级继续下钻，但本 phase 已作为第一批 `agentCore` 正式基线的统一锚点保留。
