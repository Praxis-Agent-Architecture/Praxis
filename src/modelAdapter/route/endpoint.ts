import type { RaxProviderOptions } from "../schema/index.js";

export type RaxEndpointTemplate = {
  baseUrl: string;
  path: string;
  defaultHeaders?: Record<string, string>;
  allowedNativeOptions?: string[];
};

export function joinEndpointUrl(
  endpoint: RaxEndpointTemplate,
  overrideBaseUrl?: string,
  query?: RaxProviderOptions["query"],
  pathParams?: Record<string, string>,
): string {
  const base = (overrideBaseUrl ?? endpoint.baseUrl).replace(/\/+$/, "");
  const expandedPath = Object.entries(pathParams ?? {}).reduce(
    (path, [key, value]) => path.replaceAll(`{${key}}`, encodeURIComponent(value)),
    endpoint.path,
  );
  const path = expandedPath.startsWith("/") ? expandedPath : `/${expandedPath}`;
  const url = new URL(`${base}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

export function filterNativeOptions(native: Record<string, unknown> | undefined, allowed: string[] | undefined): Record<string, unknown> {
  if (!native || !allowed?.length) return {};
  const allowedSet = new Set(allowed);
  return Object.fromEntries(Object.entries(native).filter(([key]) => allowedSet.has(key)));
}
