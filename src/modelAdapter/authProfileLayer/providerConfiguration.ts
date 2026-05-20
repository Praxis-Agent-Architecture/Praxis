/*
 * Location: Agent model adapter / auth profile layer / provider configuration.
 * Purpose: provide reusable, product-neutral config primitives for login shells
 * such as Raxode without making the runtime parse product config files.
 * Boundary: no filesystem access, no network calls, no raw provider invocation.
 */

export type RaxodeEndpointShape =
  | "chatgpt_codex_responses"
  | "responses"
  | "chat_completions"
  | "messages";

export type RaxodeUrlMode = "auto_append_endpoint" | "literal";

export type RaxodeProviderRequestUrlPlan = {
  inputBaseURL: string;
  endpointShape: RaxodeEndpointShape;
  urlMode: RaxodeUrlMode;
  finalRequestURL: string;
};

export type RaxodeProviderConfigurationError = {
  code:
    | "MISSING_BASE_URL"
    | "INVALID_BASE_URL"
    | "UNSUPPORTED_ENDPOINT_SHAPE"
    | "FULL_ENDPOINT_REQUIRES_TRAILING_SLASH"
    | "MISSING_SECRET"
    | "MISSING_PROFILE_ID"
    | "MISSING_MODEL"
    | "MISSING_ROLE_BINDING";
  message: string;
  boundary: "input" | "config";
  publicSafe: true;
};

export type RaxodeProviderRequestUrlResult =
  | { ok: true; plan: RaxodeProviderRequestUrlPlan }
  | { ok: false; error: RaxodeProviderConfigurationError };

export type RaxodeSecret = {
  id: string;
  providerLabel: string;
  authMode: "api_key" | "chatgpt_oauth";
  secretKind: "api_key" | "chatgpt_tokens";
  credentials: {
    apiKey?: string;
    accessToken?: string;
    refreshToken?: string;
    idToken?: string;
    accountId?: string;
  };
  display: {
    masked: string;
    redactedIdentity?: string;
  };
  encryption: {
    mode: "none";
    reserved: true;
  };
  meta: {
    createdAt: string;
    updatedAt: string;
    lastUsedAt?: string;
  };
};

export type RaxodeSecretResult =
  | { ok: true; secret: RaxodeSecret }
  | { ok: false; error: RaxodeProviderConfigurationError };

export type RaxodeModelEntry = {
  id: string;
  model: string;
  reasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh";
  contextWindowTokens?: number;
  maxOutputTokens?: number;
  inputBudgetThreshold?: number;
  usableInputTokens?: number;
  testStatus: {
    state: "unknown" | "passed" | "failed";
    checkedAt?: string;
    statusCode?: number;
    message?: string;
  };
};

export type RaxodeModelEntryResult =
  | { ok: true; modelEntry: RaxodeModelEntry }
  | { ok: false; error: RaxodeProviderConfigurationError };

export type RaxodeProviderProfile = {
  id: string;
  name: string;
  providerLabel: string;
  endpointShape: RaxodeEndpointShape;
  authSecretId: string;
  inputBaseURL: string;
  urlMode: RaxodeUrlMode;
  finalRequestURL: string;
  modelEntries: readonly RaxodeModelEntry[];
  createdAt: string;
  updatedAt: string;
};

export type RaxodeProviderProfileResult =
  | { ok: true; profile: RaxodeProviderProfile }
  | { ok: false; error: RaxodeProviderConfigurationError };

export type RaxodeRoleBinding = {
  roleId: string;
  providerProfileId?: string;
  modelEntryId?: string;
  enabled: boolean;
};

export type RaxodeRoleBindingResult =
  | { ok: true; binding: RaxodeRoleBinding }
  | { ok: false; error: RaxodeProviderConfigurationError };

const ENDPOINT_PATH_BY_SHAPE: Record<RaxodeEndpointShape, string> = {
  chatgpt_codex_responses: "",
  responses: "/v1/responses",
  chat_completions: "/v1/chat/completions",
  messages: "/v1/messages",
};

const ENDPOINT_PATH_AFTER_VERSION_BY_SHAPE: Record<RaxodeEndpointShape, string> = {
  chatgpt_codex_responses: "",
  responses: "/responses",
  chat_completions: "/chat/completions",
  messages: "/messages",
};

const KNOWN_FULL_ENDPOINT_PATHS = new Set([
  "/v1/responses",
  "/responses",
  "/v1/chat/completions",
  "/chat/completions",
  "/v1/messages",
  "/messages",
]);

function nowIso(input?: string): string {
  return input?.trim() || new Date().toISOString();
}

function failure(
  code: RaxodeProviderConfigurationError["code"],
  message: string,
  boundary: RaxodeProviderConfigurationError["boundary"] = "input",
): { ok: false; error: RaxodeProviderConfigurationError } {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
    },
  };
}

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseUrl(input: string): URL | undefined {
  try {
    return new URL(input);
  } catch {
    return undefined;
  }
}

export function resolveRaxodeProviderRequestUrl(input: {
  inputBaseURL?: string;
  endpointShape?: RaxodeEndpointShape;
}): RaxodeProviderRequestUrlResult {
  const inputBaseURL = input.inputBaseURL?.trim() ?? "";
  if (!inputBaseURL) {
    return failure("MISSING_BASE_URL", "provider configuration requires a base URL");
  }
  if (!input.endpointShape || !(input.endpointShape in ENDPOINT_PATH_BY_SHAPE)) {
    return failure("UNSUPPORTED_ENDPOINT_SHAPE", "provider configuration requires a supported endpoint shape");
  }
  const parsed = parseUrl(inputBaseURL);
  if (!parsed || !["http:", "https:"].includes(parsed.protocol)) {
    return failure("INVALID_BASE_URL", "provider configuration requires a valid http or https URL");
  }

  if (inputBaseURL.endsWith("/")) {
    return {
      ok: true,
      plan: {
        inputBaseURL,
        endpointShape: input.endpointShape,
        urlMode: "literal",
        finalRequestURL: inputBaseURL,
      },
    };
  }

  const normalizedPath = parsed.pathname.replace(/\/+$/u, "");
  if (KNOWN_FULL_ENDPOINT_PATHS.has(normalizedPath)) {
    return failure(
      "FULL_ENDPOINT_REQUIRES_TRAILING_SLASH",
      "Full provider endpoints must end with a trailing slash for literal mode, or remove the endpoint path and enter the provider root.",
    );
  }

  const endpointPath = ENDPOINT_PATH_BY_SHAPE[input.endpointShape];
  const effectiveEndpointPath =
    normalizedPath === "/v1"
      ? ENDPOINT_PATH_AFTER_VERSION_BY_SHAPE[input.endpointShape]
      : endpointPath;
  return {
    ok: true,
    plan: {
      inputBaseURL,
      endpointShape: input.endpointShape,
      urlMode: "auto_append_endpoint",
      finalRequestURL: `${inputBaseURL}${effectiveEndpointPath}`,
    },
  };
}

export function maskRaxodeSecret(secret: string): string {
  const value = secret.trim();
  if (!value) {
    return "";
  }
  if (value.length <= 2) {
    return "*".repeat(value.length);
  }
  if (value.length < 12) {
    return `${value.slice(0, 1)}***${value.slice(-1)}`;
  }
  return `${value.slice(0, 6)}...${value.slice(-6)}`;
}

export function createRaxodeSecret(input: {
  id?: string;
  providerLabel?: string;
  secretKind?: "api_key" | "chatgpt_tokens";
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
  idToken?: string;
  accountId?: string;
  now?: string;
}): RaxodeSecretResult {
  if (!hasText(input.id)) {
    return failure("MISSING_SECRET", "secret requires a stable id", "config");
  }
  const secretKind = input.secretKind ?? "api_key";
  const primarySecret = secretKind === "api_key" ? input.apiKey : input.accessToken;
  if (!hasText(primarySecret)) {
    return failure("MISSING_SECRET", "secret requires credential material", "config");
  }
  const stamp = nowIso(input.now);
  return {
    ok: true,
    secret: {
      id: input.id.trim(),
      providerLabel: input.providerLabel?.trim() || "Provider",
      authMode: secretKind === "api_key" ? "api_key" : "chatgpt_oauth",
      secretKind,
      credentials: {
        apiKey: input.apiKey,
        accessToken: input.accessToken,
        refreshToken: input.refreshToken,
        idToken: input.idToken,
        accountId: input.accountId,
      },
      display: {
        masked: maskRaxodeSecret(primarySecret),
      },
      encryption: {
        mode: "none",
        reserved: true,
      },
      meta: {
        createdAt: stamp,
        updatedAt: stamp,
      },
    },
  };
}

export function createRaxodeModelEntry(input: {
  id?: string;
  model?: string;
  reasoningEffort?: RaxodeModelEntry["reasoningEffort"];
  contextWindowTokens?: number;
  maxOutputTokens?: number;
  inputBudgetThreshold?: number;
  testStatus?: RaxodeModelEntry["testStatus"];
}): RaxodeModelEntryResult {
  if (!hasText(input.id)) {
    return failure("MISSING_MODEL", "model entry requires a stable id", "config");
  }
  if (!hasText(input.model)) {
    return failure("MISSING_MODEL", "model entry requires a model name", "config");
  }
  const inputBudgetThreshold = input.inputBudgetThreshold ?? 0.95;
  const maxInputTokens =
    input.contextWindowTokens !== undefined && input.maxOutputTokens !== undefined
      ? Math.max(0, input.contextWindowTokens - input.maxOutputTokens)
      : undefined;
  const usableInputTokens = maxInputTokens === undefined
    ? undefined
    : Math.floor(maxInputTokens * inputBudgetThreshold);

  return {
    ok: true,
    modelEntry: {
      id: input.id.trim(),
      model: input.model.trim(),
      reasoningEffort: input.reasoningEffort,
      contextWindowTokens: input.contextWindowTokens,
      maxOutputTokens: input.maxOutputTokens,
      inputBudgetThreshold,
      usableInputTokens,
      testStatus: input.testStatus ?? { state: "unknown" },
    },
  };
}

export function createRaxodeProviderProfile(input: {
  id?: string;
  name?: string;
  providerLabel?: string;
  endpointShape?: RaxodeEndpointShape;
  authSecretId?: string;
  inputBaseURL?: string;
  modelEntries?: readonly RaxodeModelEntry[];
  now?: string;
}): RaxodeProviderProfileResult {
  if (!hasText(input.id)) {
    return failure("MISSING_PROFILE_ID", "provider profile requires a stable id", "config");
  }
  if (!hasText(input.authSecretId)) {
    return failure("MISSING_SECRET", "provider profile requires an auth secret id", "config");
  }
  const urlPlan = resolveRaxodeProviderRequestUrl({
    inputBaseURL: input.inputBaseURL,
    endpointShape: input.endpointShape,
  });
  if (!urlPlan.ok) {
    return urlPlan;
  }
  const stamp = nowIso(input.now);
  return {
    ok: true,
    profile: {
      id: input.id.trim(),
      name: input.name?.trim() || input.id.trim(),
      providerLabel: input.providerLabel?.trim() || "Provider",
      endpointShape: urlPlan.plan.endpointShape,
      authSecretId: input.authSecretId.trim(),
      inputBaseURL: urlPlan.plan.inputBaseURL,
      urlMode: urlPlan.plan.urlMode,
      finalRequestURL: urlPlan.plan.finalRequestURL,
      modelEntries: input.modelEntries ?? [],
      createdAt: stamp,
      updatedAt: stamp,
    },
  };
}

export function bindRaxodeRoleModel(input: {
  roleId?: string;
  providerProfileId?: string;
  modelEntryId?: string;
  enabled?: boolean;
}): RaxodeRoleBindingResult {
  if (!hasText(input.roleId)) {
    return failure("MISSING_ROLE_BINDING", "role binding requires a role id", "config");
  }
  return {
    ok: true,
    binding: {
      roleId: input.roleId.trim(),
      providerProfileId: input.providerProfileId?.trim(),
      modelEntryId: input.modelEntryId?.trim(),
      enabled: input.enabled ?? true,
    },
  };
}
