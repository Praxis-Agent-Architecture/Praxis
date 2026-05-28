/*
 * 文件定位：Runtime / authPlane 公开聚合入口。
 * 核心目的：给 agentCore 的 praxis.auth 暴露单一、声明式的 auth/API 管理构件。
 */

import {
  createRuntimeAuthModelEntry,
  createRuntimeAuthProviderProfile,
  bindRuntimeAuthRole,
  createRuntimeAuthRegistry,
  type RuntimeAuthCredentialRef,
} from "./providerAuthRegistry.js";
import {
  createInMemoryRuntimeAuthSecretVault,
  createRuntimeAuthSecretRecord,
  decryptRuntimeAuthSecretRecord,
  toRuntimeAuthSecretPublicView,
} from "./secretVault.js";
import {
  createRuntimeAuthResolver,
} from "./runtimeAuthResolver.js";

export * from "./providerAuthRegistry.js";
export * from "./secretVault.js";
export * from "./runtimeAuthResolver.js";

export function runtimeAuthCredentialRef(input: RuntimeAuthCredentialRef): RuntimeAuthCredentialRef {
  return {
    ...input,
    credentialRefId: input.credentialRefId.trim(),
    secretId: input.secretId.trim(),
    provider: input.provider.trim(),
    publicSafe: true,
  };
}

export const runtimeAuth = Object.freeze({
  credentialRef: runtimeAuthCredentialRef,
  profile: createRuntimeAuthProviderProfile,
  modelEntry: createRuntimeAuthModelEntry,
  role: bindRuntimeAuthRole,
  registry: createRuntimeAuthRegistry,
  createSecret: createRuntimeAuthSecretRecord,
  decryptSecret: decryptRuntimeAuthSecretRecord,
  vault: createInMemoryRuntimeAuthSecretVault,
  publicSecretView: toRuntimeAuthSecretPublicView,
  resolver: createRuntimeAuthResolver,
});
