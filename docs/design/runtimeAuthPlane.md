# Runtime Auth Plane

Praxis 的 authPlane 是 framework/runtime 的被动鉴权面：它不替应用登录用户，也不扫描用户电脑里的 CLI auth 文件。上层应用把用户授权结果或 API key 写入自己的用户级存储，Praxis 负责提供加密 vault、provider profile、model entry、role binding、resolver 和 public-safe view。

## Core Shape

- `RuntimeAuthSecretRecord`：AES-256-GCM 加密后的用户级 secret。密文可持久化，明文只在 resolver 解密时短暂存在。
- `RuntimeAuthProviderProfile`：provider、endpoint shape、baseURL、credentialRef 的公开配置。
- `RuntimeAuthModelEntry`：某个 profile 下可用的模型和能力元数据。
- `RuntimeAuthRoleBinding`：把 `primary`、`fallback`、`media`、`embedding`、`realtime`、`batch` 等运行角色绑定到 profile/model。
- `RuntimeAuthResolver`：按 role、profile ref 或 credential ref 从 vault 解密，生成 model invocation 需要的 `AuthEnvelope`。

白话：上层应用保存“用户有什么账号和 key”，Praxis 保存“这些东西如何安全地变成一次模型调用的 auth envelope”。

## Public API

普通开发者优先使用一个入口：

```ts
import { praxis } from "@praxis-ai/praxis";

const credentialRef = praxis.auth.credentialRef({
  credentialRefId: "credential.gemini.default",
  secretId: "secret.gemini.default",
  provider: "gemini",
  credentialType: "gemini_api_key",
  secretKind: "api_key",
  publicSafe: true,
});
```

`praxis.auth` 下提供 `createSecret`、`vault`、`profile`、`modelEntry`、`role`、`registry`、`resolver`。细粒度导出保留给 application/runtime 层，但推荐上层围绕 `praxis.auth` 组织 OAO 声明。

## Security Rules

- 默认不读环境变量。
- 默认不读取 `~/.codex/auth.json`、Claude Code auth 或其他 CLI 登录态。
- 不支持“导入已有 CLI 登录文件”作为公开路径。应用应引导用户重新登录或输入 API key。
- Manifest 只保存 `providerProfileRef`、`modelEntryRef`、`credentialRefId`、`CredentialRef` 等引用，不保存 raw secret 或密文。
- public view 可以显示 provider、profile、masked、status、expiresAt、secret 是否存在；不能显示邮箱、账号 ID、access token、refresh token 或 API key。

## Provider Boundary

当前 contract 支持：

- `openai`：API key、ChatGPT/Codex OAuth contract。
- `anthropic`：API key。
- `gemini`：API key。
- `openai-compatible`：按 OpenAI chat/responses 形状调用的网关。
- `anthropic-compatible`：按 Anthropic messages 形状调用的网关。
- `custom`：应用自定义 header 与调用层。

Claude Code subscription login 目前只作为 contract/documentation boundary，不默认复用 CLI 登录态。Anthropic 官方 API 仍以 API key 或其正式认证机制为准；Claude 订阅与 API key 计费/权限不是同一个东西。

## Application Contract

`applicationLayer` 增加了两条薄契约：

- `authStateProvider`：让 Raxode 这类上层应用把 auth 状态注入 view。
- `liveProviderResolver`：让上层应用在 live 调用时注入 `AuthEnvelope`，或注入 `RuntimeAuthResolver + authSelection` 让 kernel 按 role/profile refs 现场解析。

`authStateProvider` 示例：

```ts
createApplicationProjectRuntime(root, {
  authStateProvider: () => ({
    activeProfileId: "profile.gemini.native",
    profiles: [{
      profileId: "profile.gemini.native",
      provider: "gemini",
      providerLabel: "Gemini",
      secretPresent: true,
      status: "active",
      publicSafe: true,
    }],
    publicSafe: true,
  }),
});
```

这里仍然只是 public-safe 视图，不是 secret store 本身。

`liveProviderResolver` 示例：

```ts
createApplicationProjectRuntime(root, {
  liveProviderResolver: async () => ({
    runtimeAuthResolver,
    authSelection: { role: "primary" },
    provider: "openai",
    endpointShape: "responses",
    providerCaller,
  }),
});
```

如果 manifest.model 已声明 `providerProfileRef` / `modelEntryRef`，`PraxisRuntimeKernel.runManifest(...)` 会在没有显式 `authSelection` 时自动用这些 refs 解析 auth。白话：开发者可以在 Agent/OAO 声明里写“用哪个账号配置”，runtime 会在真正调用模型时向上层注入的 resolver 要密钥。

## Live Probe

`npm run test:agentCore:auth-live -- --vault /path/to/auth-vault.json --master-key-file /path/to/master-key.txt --role primary`

这个脚本只读取显式传入的 vault 和 master-key 文件，不读环境变量。它用于本机手动验证真实 provider，不能替代上层应用的登录 UX。
