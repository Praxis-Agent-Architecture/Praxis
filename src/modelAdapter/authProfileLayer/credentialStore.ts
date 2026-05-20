/*
 * 文件定位：Agent 模型适配层 / 鉴权画像层 / Credential Store。
 * 核心目的：提供显式注入的内存凭证注册和查询能力，避免 endpoint 隐式读取全局状态。
 * 能力要求1：按 credentialRef key 保存 provider profile、public ref 和 private material。
 * 能力要求2：查询结果默认只暴露 public-safe ref/profile，private material 只给 authResolver 使用。
 * 能力要求3：支持测试与上层 harness 用代码注册 API key 或 Codex OAuth 材料。
 * 边界：不读文件、不读环境变量、不写磁盘。
 * 对接：被 authResolver、authProbe、providerProbe 和上层 harness 初始化流程使用。
 * 实现提示：保持实例化 store，避免模块级单例造成串台。
 */

import type { ProviderAuthMaterial } from "./authEnvelope.js";
import { credentialRefKey, type CredentialRef } from "./credentialRef.js";
import type { ProviderProfile } from "./providerProfile.js";

export type CredentialStoreRecord = {
  credentialRef: CredentialRef;
  profile?: ProviderProfile;
  privateMaterial?: ProviderAuthMaterial;
  redactedIdentity?: string;
};

export type CredentialStore = {
  put(record: CredentialStoreRecord): CredentialStoreRecord;
  get(ref: CredentialRef): CredentialStoreRecord | undefined;
  listPublic(): readonly Omit<CredentialStoreRecord, "privateMaterial">[];
};

export function createCredentialStore(initialRecords: readonly CredentialStoreRecord[] = []): CredentialStore {
  const records = new Map<string, CredentialStoreRecord>();

  const store: CredentialStore = {
    put(record) {
      records.set(credentialRefKey(record.credentialRef), record);
      return record;
    },
    get(ref) {
      return records.get(credentialRefKey(ref));
    },
    listPublic() {
      return [...records.values()].map(({ privateMaterial: _privateMaterial, ...record }) => record);
    },
  };

  for (const record of initialRecords) {
    store.put(record);
  }

  return store;
}
