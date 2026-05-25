/*
 * Runtime authPlane live harness.
 *
 * Usage:
 * node --import tsx examples/scripts/agentcore_auth_live_matrix.ts \
 *   --vault /path/to/auth-vault.json \
 *   --master-key-file /path/to/master-key.txt \
 *   --role primary
 *
 * The vault JSON shape is:
 * {
 *   "secrets": [RuntimeAuthSecretRecord],
 *   "profiles": [RuntimeAuthProviderProfile],
 *   "modelEntries": [RuntimeAuthModelEntry],
 *   "roleBindings": [RuntimeAuthRoleBinding]
 * }
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createInMemoryRuntimeAuthSecretVault,
  createRuntimeAuthRegistry,
  createRuntimeAuthResolver,
  type RuntimeAuthModelEntry,
  type RuntimeAuthProviderProfile,
  type RuntimeAuthRoleBinding,
  type RuntimeAuthSecretRecord,
} from "../../src/runtimeImplementation/runtime.authPlane/index.js";

type LiveVaultFile = {
  secrets?: RuntimeAuthSecretRecord[];
  profiles?: RuntimeAuthProviderProfile[];
  modelEntries?: RuntimeAuthModelEntry[];
  roleBindings?: RuntimeAuthRoleBinding[];
};

export type LiveAuthProbePlan = {
  url: string;
  method: "POST";
  headers: Readonly<Record<string, string>>;
  body: Readonly<Record<string, unknown>>;
};

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requireArg(name: string): string {
  const value = arg(name);
  if (!value) {
    throw new Error(`missing required argument ${name}`);
  }
  return value;
}

function bearer(headers: Readonly<Record<string, string>> | undefined): string | undefined {
  return headers?.authorization;
}

export function appendEndpoint(baseURL: string, endpointPath: string): string {
  const base = baseURL.replace(/\/+$/u, "");
  const endpoint = endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`;
  if (base.endsWith(endpoint)) return base;
  if (base.endsWith("/v1") && endpoint.startsWith("/v1/")) {
    return `${base}${endpoint.slice("/v1".length)}`;
  }
  if (base.endsWith("/v1beta") && endpoint.startsWith("/v1beta/")) {
    return `${base}${endpoint.slice("/v1beta".length)}`;
  }
  return `${base}${endpoint}`;
}

export function geminiGenerateContentEndpoint(model: string): string {
  const trimmed = model.trim().replace(/^\/+/u, "");
  const resource = (trimmed.startsWith("models/") ? trimmed : `models/${trimmed}`)
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `/v1beta/${resource}:generateContent`;
}

export function buildLiveAuthProbePlan(input: {
  profile: RuntimeAuthProviderProfile;
  model: string;
  headers?: Readonly<Record<string, string>>;
}): LiveAuthProbePlan {
  const baseURL = input.profile.baseURL?.replace(/\/+$/u, "");
  if (!baseURL) {
    throw new Error("live auth harness requires provider profile baseURL");
  }

  const headers = {
    "content-type": "application/json",
    ...(input.headers ?? {}),
  };

  switch (input.profile.endpointShape) {
    case "messages":
      return {
        url: appendEndpoint(baseURL, "/v1/messages"),
        method: "POST",
        headers,
        body: {
          model: input.model,
          max_tokens: 32,
          messages: [{ role: "user", content: "Say praxis-auth-ok." }],
        },
      };
    case "gemini_generate_content":
      return {
        url: appendEndpoint(baseURL, geminiGenerateContentEndpoint(input.model)),
        method: "POST",
        headers,
        body: {
          contents: [{ parts: [{ text: "Say praxis-auth-ok." }] }],
        },
      };
    case "responses":
      return {
        url: appendEndpoint(baseURL, "/v1/responses"),
        method: "POST",
        headers,
        body: {
          model: input.model,
          input: "Say praxis-auth-ok.",
          max_output_tokens: 32,
          store: false,
        },
      };
    case "chat_completions":
      return {
        url: appendEndpoint(baseURL, "/v1/chat/completions"),
        method: "POST",
        headers,
        body: {
          model: input.model,
          messages: [{ role: "user", content: "Say praxis-auth-ok." }],
          max_tokens: 32,
        },
      };
    default:
      throw new Error(`unsupported live auth endpointShape: ${input.profile.endpointShape}`);
  }
}

async function main(): Promise<void> {
  const vaultPath = requireArg("--vault");
  const masterKeyPath = requireArg("--master-key-file");
  const role = arg("--role") ?? "primary";
  const vaultJson = JSON.parse(await readFile(vaultPath, "utf8")) as LiveVaultFile;
  const masterKey = (await readFile(masterKeyPath, "utf8")).trim();
  const registry = createRuntimeAuthRegistry({
    profiles: vaultJson.profiles ?? [],
    modelEntries: vaultJson.modelEntries ?? [],
    roleBindings: vaultJson.roleBindings ?? [],
  });
  const vault = createInMemoryRuntimeAuthSecretVault(vaultJson.secrets ?? []);
  const resolver = createRuntimeAuthResolver({
    registry,
    vault,
    keyProvider: () => masterKey,
  });
  const resolved = await resolver.resolve({ role });
  if (!resolved.ok) {
    console.error(JSON.stringify({ ok: false, error: resolved.error, events: resolved.events }, null, 2));
    process.exitCode = 1;
    return;
  }

  const profile = resolved.value.providerProfile;
  const modelEntry = resolved.value.modelEntry;
  const model = modelEntry?.model ?? arg("--model");
  if (!model) {
    throw new Error("live auth harness requires a selected modelEntry or --model");
  }

  const headers = resolved.value.resolved.privateMaterial?.headers ?? {};
  const plan = buildLiveAuthProbePlan({ profile, model, headers });
  const response = await fetch(plan.url, {
    method: plan.method,
    headers: plan.headers,
    body: JSON.stringify(plan.body),
  });

  const text = await response.text();
  const publicAuth = {
    profileId: profile.profileId,
    provider: profile.provider,
    endpointShape: profile.endpointShape,
    model,
    authHeaderPresent: bearer(headers) !== undefined || headers["x-api-key"] !== undefined || headers["x-goog-api-key"] !== undefined,
  };
  console.log(JSON.stringify({
    ok: response.ok,
    status: response.status,
    auth: publicAuth,
    bodyPreview: text.slice(0, 1200),
  }, null, 2));
  if (!response.ok) process.exitCode = 1;
}

function isDirectScript(): boolean {
  const invoked = process.argv[1];
  return invoked !== undefined && path.resolve(invoked) === fileURLToPath(import.meta.url);
}

if (isDirectScript()) {
  await main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      error: {
        code: "AUTH_LIVE_HARNESS_FAILED",
        message: error instanceof Error ? error.message : String(error),
        publicSafe: true,
      },
    }, null, 2));
    process.exitCode = 1;
  });
}
