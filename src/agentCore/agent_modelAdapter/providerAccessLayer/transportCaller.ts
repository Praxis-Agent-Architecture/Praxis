/*
 * 文件定位：Agent 模型适配层 / Provider 接入层 / Transport Caller。
 * 核心目的：提供可注入的 HTTP transport 形状和默认 fetch 实现。
 * 能力要求1：支持 method、url、headers、query、body、timeoutMs 和 AbortSignal。
 * 能力要求2：返回 status、headers、body 分离的 transport response。
 * 能力要求3：不记录、不打印、不返回 raw secret。
 * 边界：不懂 provider 语义，不做 credential 解析。
 * 对接：被 providerCaller 包装后供 actualInvocationLayer live 调用。
 * 实现提示：默认实现只在显式调用时执行；测试可注入 fake transport。
 */

export type ProviderTransportRequest = {
  method: string;
  url: string;
  headers?: Readonly<Record<string, string>>;
  query?: Readonly<Record<string, string>>;
  body?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
};

export type ProviderTransportResponse = {
  status: number;
  headers: Readonly<Record<string, string>>;
  body: unknown;
};

export type ProviderTransport = (request: ProviderTransportRequest) => Promise<ProviderTransportResponse>;

function appendQuery(url: string, query: Readonly<Record<string, string>> | undefined): string {
  const entries = Object.entries(query ?? {}).filter(([key, value]) => key.trim().length > 0 && value.trim().length > 0);
  if (entries.length === 0) {
    return url;
  }

  const target = new URL(url);
  for (const [key, value] of entries) {
    target.searchParams.set(key, value);
  }
  return target.toString();
}

export const fetchProviderTransport: ProviderTransport = async (request) => {
  const controller = new AbortController();
  const timeout =
    request.timeoutMs === undefined
      ? undefined
      : setTimeout(() => controller.abort(), request.timeoutMs);
  const signal = request.signal ?? controller.signal;

  try {
    const response = await fetch(appendQuery(request.url, request.query), {
      method: request.method,
      headers: request.headers,
      body:
        request.body === undefined
          ? undefined
          : typeof request.body === "string" || request.body instanceof FormData
            ? request.body
            : JSON.stringify(request.body),
      signal,
    });

    const contentType = response.headers.get("content-type") ?? "";
    const text = await response.text();
    let body: unknown = text;
    if (contentType.includes("application/json")) {
      try {
        body = text.length > 0 ? JSON.parse(text) : {};
      } catch {
        body = { rawText: text };
      }
    }

    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body,
    };
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
};
