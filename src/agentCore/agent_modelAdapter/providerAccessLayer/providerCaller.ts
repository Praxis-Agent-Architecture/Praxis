/*
 * 文件定位：Agent 模型适配层 / Provider 接入层 / Provider Caller。
 * 核心目的：把 actualInvocationLayer 的 request envelope 安全地转成真实 transport 调用。
 * 能力要求1：通过闭包接收 private auth material，公共 request/result 只保留 redacted 形态。
 * 能力要求2：支持 timeout、abort、status/header/body 分离和 provider 错误分类。
 * 能力要求3：可适配现有 OpenAI endpoint 的 injected caller 形状。
 * 边界：不创建 PromptPack，不选择模型，不读取 credential source。
 * 对接：actualInvocationLayer 在 dryRun:false 时调用 providerCaller；live smoke 通过它替代直接 fetch。
 * 实现提示：transport 收到 raw headers，但 providerCaller 返回值必须先 redacted。
 */

import type { ProviderAuthMaterial } from "../authProfileLayer/authEnvelope.js";
import { redactHeaders, redactSecretRecord } from "../authProfileLayer/secretRedaction.js";
import { classifyProviderAccessError, type ProviderAccessError } from "./providerErrorClassifier.js";
import type { ProviderTransport, ProviderTransportResponse } from "./transportCaller.js";

export type ProviderCallerRequestEnvelope = {
  method: string;
  url: string;
  headers?: Readonly<Record<string, string>>;
  query?: Readonly<Record<string, string>>;
  body?: unknown;
  provider?: string;
  endpoint?: string;
};

export type ProviderCallerResponseEnvelope = {
  status: number;
  headers: Readonly<Record<string, string>>;
  body: unknown;
  providerRawShapePromoted: false;
  publicSafe: true;
};

export type ProviderCaller = (request: ProviderCallerRequestEnvelope) => Promise<ProviderCallerResponseEnvelope>;

export type ProviderCallerFactoryInput = {
  transport: ProviderTransport;
  authMaterial?: ProviderAuthMaterial;
  timeoutMs?: number;
  signal?: AbortSignal;
};

function mergeHeaders(
  requestHeaders: Readonly<Record<string, string>> | undefined,
  authHeaders: Readonly<Record<string, string>> | undefined,
): Readonly<Record<string, string>> {
  return {
    ...(requestHeaders ?? {}),
    ...(authHeaders ?? {}),
  };
}

function assertSuccess(response: ProviderTransportResponse): void {
  if (response.status >= 400) {
    throw { status: response.status, code: "provider_http_error" };
  }
}

export function createProviderCaller(input: ProviderCallerFactoryInput): ProviderCaller {
  return async (request) => {
    try {
      const response = await input.transport({
        method: request.method,
        url: request.url,
        headers: mergeHeaders(request.headers, input.authMaterial?.headers),
        query: {
          ...(request.query ?? {}),
          ...(input.authMaterial?.query ?? {}),
        },
        body: request.body,
        timeoutMs: input.timeoutMs,
        signal: input.signal,
      });

      assertSuccess(response);

      return {
        status: response.status,
        headers: redactHeaders(response.headers),
        body: redactSecretRecord(response.body),
        providerRawShapePromoted: false,
        publicSafe: true,
      };
    } catch (error) {
      throw classifyProviderAccessError(error);
    }
  };
}

export function unwrapProviderCallerBody(response: ProviderCallerResponseEnvelope | unknown): unknown {
  if (
    response !== null &&
    typeof response === "object" &&
    !Array.isArray(response) &&
    "body" in response &&
    "providerRawShapePromoted" in response
  ) {
    return (response as ProviderCallerResponseEnvelope).body;
  }
  return response;
}

export function providerCallerErrorCode(error: unknown): ProviderAccessError["code"] {
  return classifyProviderAccessError(error).code;
}
