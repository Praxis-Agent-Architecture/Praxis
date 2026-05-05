/*
 * 文件定位：StoragePool / baseToolStorage。
 * 核心目的：承载基础工具存储池中的记录形态，不承载调用策略或治理呈现。
 * 边界：只定义 baseTool 存储内容的稳定数据形状，具体存取规则属于 storageLogic。
 */

export type BaseToolStorageRecordKind = "runtime-material" | "result-state" | "audit-trace" | "reuse-index";

export type BaseToolStorageRecordInput = {
  id?: string;
  kind?: BaseToolStorageRecordKind;
  toolName?: string;
  invocationId?: string;
  payload?: Record<string, unknown>;
  reuseKey?: string;
  tags?: readonly string[];
};

export type BaseToolStoredRecord = {
  id: string;
  kind: BaseToolStorageRecordKind;
  toolName: string;
  invocationId: string;
  payload: Readonly<Record<string, unknown>>;
  reuseKey?: string;
  tags: readonly string[];
};

export const baseToolStoragePoolDescriptor = {
  pool: "storagePool.baseToolStorage",
  purpose: "store base tool materials, result state, audit traces, and reuse indexes",
  ownsRecordShape: true,
  ownsStoragePolicy: false,
  ownsGovernanceExposure: false,
} as const;
