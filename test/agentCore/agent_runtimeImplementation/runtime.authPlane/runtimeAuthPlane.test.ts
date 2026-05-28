import assert from "node:assert/strict";
import test from "node:test";

import {
  createRuntimeAuthModelEntry,
  createRuntimeAuthProviderProfile,
  bindRuntimeAuthRole,
  createRuntimeAuthRegistry,
  createRuntimeAuthResolver,
  createRuntimeAuthSecretRecord,
  createInMemoryRuntimeAuthSecretVault,
  runtimeAuthCredentialRef,
} from "../../../../src/runtimeImplementation/runtime.authPlane/index.js";
import { praxis } from "../../../../src/agentCore/index.js";

test("runtime auth vault encrypts secrets and exposes only public-safe views", async () => {
  const created = await createRuntimeAuthSecretRecord({
    secretId: "secret.openai.default",
    provider: "openai",
    providerLabel: "OpenAI",
    secretKind: "api_key",
    plaintext: { apiKey: "sk-test-secret-1234567890abcdef" },
    keyProvider: () => "local-master-key",
    now: "2026-05-25T00:00:00.000Z",
  });

  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("expected encrypted secret");
  assert.equal(JSON.stringify(created.value).includes("sk-test-secret"), false);
  assert.equal(created.value.encryptedPayload.algorithm, "AES-256-GCM");

  const vault = createInMemoryRuntimeAuthSecretVault([created.value]);
  const view = vault.listPublic()[0];
  assert.equal(view?.encryptedPayload.present, true);
  assert.equal(JSON.stringify(view).includes(created.value.encryptedPayload.ciphertext), false);
  assert.equal(JSON.stringify(view).includes("sk-test-secret"), false);
});

test("runtime auth registry binds simplified roles to provider profiles and model entries", async () => {
  const credentialRef = runtimeAuthCredentialRef({
    credentialRefId: "credential.openai.default",
    secretId: "secret.openai.default",
    provider: "openai",
    credentialType: "openai_api_key",
    secretKind: "api_key",
    publicSafe: true,
  });
  const profile = createRuntimeAuthProviderProfile({
    profileId: "profile.openai.responses",
    provider: "openai",
    endpointShape: "responses",
    baseURL: "https://api.openai.com",
    credentialRef,
    now: "2026-05-25T00:00:00.000Z",
  });
  const modelEntry = createRuntimeAuthModelEntry({
    modelEntryId: "model.gpt-5.5",
    providerProfileRef: "profile.openai.responses",
    model: "gpt-5.5",
  });
  const binding = bindRuntimeAuthRole({
    role: "primary",
    providerProfileRef: "profile.openai.responses",
    modelEntryRef: "model.gpt-5.5",
  });

  assert.equal(profile.ok, true);
  assert.equal(modelEntry.ok, true);
  assert.equal(binding.ok, true);
  if (!profile.ok || !modelEntry.ok || !binding.ok) throw new Error("expected registry records");

  const registry = createRuntimeAuthRegistry({
    profiles: [profile.value],
    modelEntries: [modelEntry.value],
    roleBindings: [binding.value],
  });
  const selected = registry.selectRole("primary");
  assert.equal(selected.ok, true);
  if (!selected.ok) throw new Error("expected role selection");
  assert.equal(selected.value.profile.profileId, "profile.openai.responses");
  assert.equal(selected.value.modelEntry?.model, "gpt-5.5");
  assert.equal(JSON.stringify(registry.snapshot()).includes("sk-"), false);
});

test("runtime auth registry rejects model entries owned by another provider profile", () => {
  const credentialRef = runtimeAuthCredentialRef({
    credentialRefId: "credential.openai.default",
    secretId: "secret.openai.default",
    provider: "openai",
    credentialType: "openai_api_key",
    secretKind: "api_key",
    publicSafe: true,
  });
  const profile = createRuntimeAuthProviderProfile({
    profileId: "profile.openai.responses",
    provider: "openai",
    endpointShape: "responses",
    credentialRef,
  });
  const modelEntry = createRuntimeAuthModelEntry({
    modelEntryId: "model.other-profile",
    providerProfileRef: "profile.other",
    model: "gpt-5.5",
  });
  const binding = bindRuntimeAuthRole({
    role: "primary",
    providerProfileRef: "profile.openai.responses",
    modelEntryRef: "model.other-profile",
  });
  assert.equal(profile.ok, true);
  assert.equal(modelEntry.ok, true);
  assert.equal(binding.ok, true);
  if (!profile.ok || !modelEntry.ok || !binding.ok) throw new Error("expected registry records");

  const selected = createRuntimeAuthRegistry({
    profiles: [profile.value],
    modelEntries: [modelEntry.value],
    roleBindings: [binding.value],
  }).selectRole("primary");

  assert.equal(selected.ok, false);
  if (selected.ok) throw new Error("expected profile mismatch");
  assert.equal(selected.error.code, "MODEL_ENTRY_PROFILE_MISMATCH");
});

test("runtime auth provider profile rejects mismatched credential refs", () => {
  const result = createRuntimeAuthProviderProfile({
    profileId: "profile.openai.bad-credential",
    provider: "openai",
    endpointShape: "responses",
    credentialRef: runtimeAuthCredentialRef({
      credentialRefId: "credential.gemini.wrong-profile",
      secretId: "secret.gemini.wrong-profile",
      provider: "gemini",
      credentialType: "gemini_api_key",
      secretKind: "api_key",
      publicSafe: true,
    }),
  });

  assert.equal(result.ok, false);
  if (result.ok) throw new Error("expected credential/provider mismatch");
  assert.equal(result.error.code, "CREDENTIAL_PROVIDER_MISMATCH");
});

test("runtime auth provider profile accepts vendor-named compatible defaults", () => {
  const result = createRuntimeAuthProviderProfile({
    profileId: "profile.deepseek.default",
    provider: "deepseek",
    credentialRef: runtimeAuthCredentialRef({
      credentialRefId: "credential.deepseek.default",
      secretId: "secret.deepseek.default",
      provider: "deepseek",
      credentialType: "openai_api_key",
      secretKind: "api_key",
      publicSafe: true,
    }),
  });

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected compatible provider profile");
  assert.equal(result.value.endpointShape, "responses");
});

test("runtime auth registry selects the highest priority enabled role binding", () => {
  const lowCredentialRef = runtimeAuthCredentialRef({
    credentialRefId: "credential.openai.low",
    secretId: "secret.openai.low",
    provider: "openai",
    credentialType: "openai_api_key",
    secretKind: "api_key",
    publicSafe: true,
  });
  const highCredentialRef = runtimeAuthCredentialRef({
    credentialRefId: "credential.openai.high",
    secretId: "secret.openai.high",
    provider: "openai",
    credentialType: "openai_api_key",
    secretKind: "api_key",
    publicSafe: true,
  });
  const lowProfile = createRuntimeAuthProviderProfile({
    profileId: "profile.openai.low",
    provider: "openai",
    endpointShape: "responses",
    credentialRef: lowCredentialRef,
  });
  const highProfile = createRuntimeAuthProviderProfile({
    profileId: "profile.openai.high",
    provider: "openai",
    endpointShape: "responses",
    credentialRef: highCredentialRef,
  });
  const lowBinding = bindRuntimeAuthRole({
    role: "primary",
    providerProfileRef: "profile.openai.low",
    priority: 0,
  });
  const highBinding = bindRuntimeAuthRole({
    role: "primary",
    providerProfileRef: "profile.openai.high",
    priority: 100,
  });
  assert.equal(lowProfile.ok, true);
  assert.equal(highProfile.ok, true);
  assert.equal(lowBinding.ok, true);
  assert.equal(highBinding.ok, true);
  if (!lowProfile.ok || !highProfile.ok || !lowBinding.ok || !highBinding.ok) {
    throw new Error("expected registry records");
  }

  const selected = createRuntimeAuthRegistry({
    profiles: [lowProfile.value, highProfile.value],
    roleBindings: [lowBinding.value, highBinding.value],
  }).selectRole("primary");

  assert.equal(selected.ok, true);
  if (!selected.ok) throw new Error("expected role selection");
  assert.equal(selected.value.profile.profileId, "profile.openai.high");
});

test("runtime auth resolver reports missing role bindings directly", async () => {
  const resolver = createRuntimeAuthResolver({
    registry: createRuntimeAuthRegistry(),
    vault: createInMemoryRuntimeAuthSecretVault(),
    keyProvider: () => "missing-role-key",
  });

  const resolved = await resolver.resolve({ role: "primary" });

  assert.equal(resolved.ok, false);
  if (resolved.ok) throw new Error("expected missing role binding");
  assert.equal(resolved.error.code, "ROLE_BINDING_NOT_FOUND");
});

test("runtime auth resolver decrypts vault material into public-safe auth envelopes", async () => {
  const secret = await createRuntimeAuthSecretRecord({
    secretId: "secret.gemini.default",
    provider: "gemini",
    secretKind: "api_key",
    plaintext: { apiKey: "gemini-secret-abcdef123456" },
    keyProvider: () => "gemini-master-key",
  });
  assert.equal(secret.ok, true);
  if (!secret.ok) throw new Error("expected secret");

  const profile = createRuntimeAuthProviderProfile({
    profileId: "profile.gemini.native",
    provider: "gemini",
    endpointShape: "gemini_generate_content",
    credentialRef: runtimeAuthCredentialRef({
      credentialRefId: "credential.gemini.default",
      secretId: secret.value.secretId,
      provider: "gemini",
      credentialType: "gemini_api_key",
      secretKind: "api_key",
      publicSafe: true,
    }),
  });
  assert.equal(profile.ok, true);
  if (!profile.ok) throw new Error("expected profile");

  const registry = createRuntimeAuthRegistry({ profiles: [profile.value] });
  const vault = createInMemoryRuntimeAuthSecretVault([secret.value]);
  const resolver = createRuntimeAuthResolver({ registry, vault, keyProvider: () => "gemini-master-key" });
  const resolved = await resolver.resolve({ providerProfileRef: "profile.gemini.native" });
  assert.equal(resolved.ok, true);
  if (!resolved.ok) throw new Error("expected resolved auth");
  assert.equal(resolved.value.auth.present, true);
  assert.equal(resolved.value.auth.headerPlan[0]?.name, "x-goog-api-key");
  assert.equal(JSON.stringify(resolved.value.auth).includes("gemini-secret"), false);
  assert.equal(resolved.value.resolved.privateMaterial?.headers?.["x-goog-api-key"], "gemini-secret-abcdef123456");

  const byCredentialRef = await resolver.resolve({ credentialRefId: "credential.gemini.default" });
  assert.equal(byCredentialRef.ok, true);
  if (!byCredentialRef.ok) throw new Error("expected credential ref auth resolution");
  assert.equal(byCredentialRef.value.providerProfile.profileId, "profile.gemini.native");
});

test("runtime auth resolver preserves custom secret header names from vault material", async () => {
  const secret = await createRuntimeAuthSecretRecord({
    secretId: "secret.custom.header",
    provider: "custom",
    secretKind: "custom",
    plaintext: { custom: { "x-api-key": "custom-secret-abcdef123456" } },
    keyProvider: () => "custom-master-key",
  });
  assert.equal(secret.ok, true);
  if (!secret.ok) throw new Error("expected secret");

  const profile = createRuntimeAuthProviderProfile({
    profileId: "profile.custom.header",
    provider: "custom",
    endpointShape: "custom",
    credentialRef: runtimeAuthCredentialRef({
      credentialRefId: "credential.custom.header",
      secretId: secret.value.secretId,
      provider: "custom",
      credentialType: "custom",
      secretKind: "custom",
      publicSafe: true,
    }),
  });
  assert.equal(profile.ok, true);
  if (!profile.ok) throw new Error("expected profile");

  const resolver = createRuntimeAuthResolver({
    registry: createRuntimeAuthRegistry({ profiles: [profile.value] }),
    vault: createInMemoryRuntimeAuthSecretVault([secret.value]),
    keyProvider: () => "custom-master-key",
  });
  const resolved = await resolver.resolve({ providerProfileRef: "profile.custom.header" });

  assert.equal(resolved.ok, true);
  if (!resolved.ok) throw new Error("expected resolved auth");
  assert.equal(resolved.value.auth.headerPlan[0]?.name, "x-api-key");
  assert.equal(resolved.value.auth.headerPlan.some((header) => header.name === "authorization"), false);
  assert.equal(resolved.value.resolved.privateMaterial?.headers?.["x-api-key"], "custom-secret-abcdef123456");
  assert.equal(resolved.value.resolved.privateMaterial?.headers?.authorization, undefined);
  assert.equal(JSON.stringify(resolved.value.auth).includes("custom-secret"), false);
});

test("runtime auth resolver rejects expired and revoked vault records before decryption", async () => {
  let keyReads = 0;
  const keyProvider = () => {
    keyReads += 1;
    return "availability-master-key";
  };
  const revoked = await createRuntimeAuthSecretRecord({
    secretId: "secret.openai.revoked",
    provider: "openai",
    secretKind: "api_key",
    plaintext: { apiKey: "sk-revoked-secret-abcdef123456" },
    status: "revoked",
    keyProvider,
  });
  const expired = await createRuntimeAuthSecretRecord({
    secretId: "secret.openai.expired",
    provider: "openai",
    secretKind: "api_key",
    plaintext: { apiKey: "sk-expired-secret-abcdef123456" },
    expiresAt: "2026-05-01T00:00:00.000Z",
    keyProvider,
  });
  assert.equal(revoked.ok, true);
  assert.equal(expired.ok, true);
  if (!revoked.ok || !expired.ok) throw new Error("expected secrets");

  const revokedProfile = createRuntimeAuthProviderProfile({
    profileId: "profile.openai.revoked",
    provider: "openai",
    endpointShape: "responses",
    credentialRef: runtimeAuthCredentialRef({
      credentialRefId: "credential.openai.revoked",
      secretId: revoked.value.secretId,
      provider: "openai",
      credentialType: "openai_api_key",
      secretKind: "api_key",
      publicSafe: true,
    }),
  });
  const expiredProfile = createRuntimeAuthProviderProfile({
    profileId: "profile.openai.expired",
    provider: "openai",
    endpointShape: "responses",
    credentialRef: runtimeAuthCredentialRef({
      credentialRefId: "credential.openai.expired",
      secretId: expired.value.secretId,
      provider: "openai",
      credentialType: "openai_api_key",
      secretKind: "api_key",
      publicSafe: true,
    }),
  });
  assert.equal(revokedProfile.ok, true);
  assert.equal(expiredProfile.ok, true);
  if (!revokedProfile.ok || !expiredProfile.ok) throw new Error("expected profiles");

  keyReads = 0;
  const resolver = createRuntimeAuthResolver({
    registry: createRuntimeAuthRegistry({ profiles: [revokedProfile.value, expiredProfile.value] }),
    vault: createInMemoryRuntimeAuthSecretVault([revoked.value, expired.value]),
    keyProvider,
    now: () => "2026-05-25T00:00:00.000Z",
  });

  const revokedResult = await resolver.resolve({ providerProfileRef: "profile.openai.revoked" });
  assert.equal(revokedResult.ok, false);
  if (revokedResult.ok) throw new Error("expected revoked rejection");
  assert.equal(revokedResult.error.code, "SECRET_UNAVAILABLE");
  assert.equal(JSON.stringify(revokedResult).includes("sk-revoked-secret"), false);

  const expiredResult = await resolver.resolve({ providerProfileRef: "profile.openai.expired" });
  assert.equal(expiredResult.ok, false);
  if (expiredResult.ok) throw new Error("expected expired rejection");
  assert.equal(expiredResult.error.code, "SECRET_UNAVAILABLE");
  assert.equal(JSON.stringify(expiredResult).includes("sk-expired-secret"), false);
  assert.equal(keyReads, 0);
});

test("runtime auth resolver rejects direct profile/model entry mismatches", async () => {
  const secret = await createRuntimeAuthSecretRecord({
    secretId: "secret.openai.default",
    provider: "openai",
    secretKind: "api_key",
    plaintext: { apiKey: "sk-test-secret-1234567890abcdef" },
    keyProvider: () => "resolver-master-key",
  });
  assert.equal(secret.ok, true);
  if (!secret.ok) throw new Error("expected secret");

  const profile = createRuntimeAuthProviderProfile({
    profileId: "profile.openai.responses",
    provider: "openai",
    endpointShape: "responses",
    credentialRef: runtimeAuthCredentialRef({
      credentialRefId: "credential.openai.default",
      secretId: secret.value.secretId,
      provider: "openai",
      credentialType: "openai_api_key",
      secretKind: "api_key",
      publicSafe: true,
    }),
  });
  const modelEntry = createRuntimeAuthModelEntry({
    modelEntryId: "model.other-profile",
    providerProfileRef: "profile.other",
    model: "gpt-5.5",
  });
  assert.equal(profile.ok, true);
  assert.equal(modelEntry.ok, true);
  if (!profile.ok || !modelEntry.ok) throw new Error("expected registry records");

  const resolver = createRuntimeAuthResolver({
    registry: createRuntimeAuthRegistry({ profiles: [profile.value], modelEntries: [modelEntry.value] }),
    vault: createInMemoryRuntimeAuthSecretVault([secret.value]),
    keyProvider: () => "resolver-master-key",
  });

  const resolved = await resolver.resolve({
    providerProfileRef: "profile.openai.responses",
    modelEntryRef: "model.other-profile",
  });

  assert.equal(resolved.ok, false);
  if (resolved.ok) throw new Error("expected profile mismatch");
  assert.equal(resolved.error.code, "MODEL_ENTRY_PROFILE_MISMATCH");
});

test("runtime auth resolver preserves role selection mismatch errors", async () => {
  const secret = await createRuntimeAuthSecretRecord({
    secretId: "secret.openai.default",
    provider: "openai",
    secretKind: "api_key",
    plaintext: { apiKey: "sk-test-secret-1234567890abcdef" },
    keyProvider: () => "role-master-key",
  });
  assert.equal(secret.ok, true);
  if (!secret.ok) throw new Error("expected secret");

  const profile = createRuntimeAuthProviderProfile({
    profileId: "profile.openai.responses",
    provider: "openai",
    endpointShape: "responses",
    credentialRef: runtimeAuthCredentialRef({
      credentialRefId: "credential.openai.default",
      secretId: secret.value.secretId,
      provider: "openai",
      credentialType: "openai_api_key",
      secretKind: "api_key",
      publicSafe: true,
    }),
  });
  const modelEntry = createRuntimeAuthModelEntry({
    modelEntryId: "model.other-profile",
    providerProfileRef: "profile.other",
    model: "gpt-5.5",
  });
  const binding = bindRuntimeAuthRole({
    role: "primary",
    providerProfileRef: "profile.openai.responses",
    modelEntryRef: "model.other-profile",
  });
  assert.equal(profile.ok, true);
  assert.equal(modelEntry.ok, true);
  assert.equal(binding.ok, true);
  if (!profile.ok || !modelEntry.ok || !binding.ok) throw new Error("expected registry records");

  const resolver = createRuntimeAuthResolver({
    registry: createRuntimeAuthRegistry({
      profiles: [profile.value],
      modelEntries: [modelEntry.value],
      roleBindings: [binding.value],
    }),
    vault: createInMemoryRuntimeAuthSecretVault([secret.value]),
    keyProvider: () => "role-master-key",
  });

  const resolved = await resolver.resolve({ role: "primary" });

  assert.equal(resolved.ok, false);
  if (resolved.ok) throw new Error("expected profile mismatch");
  assert.equal(resolved.error.code, "MODEL_ENTRY_PROFILE_MISMATCH");
});

test("praxis.auth facade exposes the one-object OAO authoring surface", () => {
  assert.equal(typeof praxis.auth.vault, "function");
  assert.equal(typeof praxis.auth.profile, "function");
  assert.equal(typeof praxis.auth.resolver, "function");
});
