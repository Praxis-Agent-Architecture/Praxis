import { Effect } from "effect";
import { raxModelError, type RaxAuthRef, type RaxModelError } from "../schema/index.js";

export type RaxResolvedAuth = {
  headers: Record<string, string>;
  redactedHeaders: Record<string, string>;
};

export function resolveRaxAuth(auth: RaxAuthRef | undefined): Effect.Effect<RaxResolvedAuth, RaxModelError> {
  return Effect.sync(() => {
    if (!auth || auth.type === "none") return { headers: {}, redactedHeaders: {} };
    if (auth.type === "api_key") {
      const value = auth.value ?? (auth.env ? process.env[auth.env] : undefined);
      if (!value) throw raxModelError("auth_missing", `Missing API key${auth.env ? ` from ${auth.env}` : ""}`);
      const header = auth.header ?? "Authorization";
      const prefix = header.toLowerCase() === "authorization" ? "Bearer " : "";
      return { headers: { [header]: `${prefix}${value}` }, redactedHeaders: { [header]: `${prefix}[redacted]` } };
    }
    if (auth.type === "bearer") {
      const value = auth.value ?? (auth.env ? process.env[auth.env] : undefined);
      if (!value) throw raxModelError("auth_missing", `Missing bearer token${auth.env ? ` from ${auth.env}` : ""}`);
      return { headers: { Authorization: `Bearer ${value}` }, redactedHeaders: { Authorization: "Bearer [redacted]" } };
    }
    if (auth.type === "oauth") {
      if (!auth.token) throw raxModelError("auth_missing", "Missing OAuth access token");
      return { headers: { Authorization: `Bearer ${auth.token}` }, redactedHeaders: { Authorization: "Bearer [redacted]" } };
    }
    return { headers: {}, redactedHeaders: {} };
  }).pipe(Effect.mapError((error: unknown) => (isRaxModelError(error) ? error : raxModelError("auth_missing", "Failed to resolve auth", {}, error))));
}

function isRaxModelError(error: unknown): error is RaxModelError {
  return typeof error === "object" && error !== null && "name" in error && (error as { name?: string }).name === "RaxModelError";
}
