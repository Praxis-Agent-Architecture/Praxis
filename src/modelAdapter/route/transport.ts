import { Effect } from "effect";
import { providerErrorDetails } from "./errorClassification.js";
import { decodeCompleteServerSentEvents, decodeJsonFrame, decodeServerSentEventChunk, type RaxFrameDecoder } from "./framing.js";
import { raxModelError, type RaxModelError, type RaxPreparedModelRequest } from "../schema/index.js";

export type RaxTransport = {
  id: string;
  send: (prepared: RaxPreparedModelRequest, decoder?: RaxFrameDecoder) => AsyncIterable<unknown>;
};

export function createFetchTransport(fetchImpl: typeof fetch = fetch): RaxTransport {
  return {
    id: "fetch",
    async *send(prepared, decoder = decodeServerSentEventChunk) {
      let response: Response;
      const composedSignal = composeSignal(prepared.signal, prepared.timeoutMs);
      try {
        response = await fetchImpl(prepared.url, {
          method: prepared.method,
          headers: prepared.headers,
          body: JSON.stringify(prepared.body),
          signal: composedSignal.signal,
        });
      } catch (error) {
        composedSignal.cleanup();
        throw raxModelError("transport_error", "Provider fetch failed", providerErrorDetails({ cause: error }), error);
      }
      try {
        if (!response.ok) {
          const text = await response.text().catch(() => "");
          throw raxModelError("provider_error", `Provider returned HTTP ${response.status}`, providerErrorDetails({
            status: response.status,
            body: text,
            headers: response.headers,
          }));
        }
        if (isJsonResponse(response)) {
          const text = await response.text();
          for (const frame of decodeJsonFrame(text)) yield frame;
          return;
        }
        if (!response.body) {
          const json = await response.json();
          yield json;
          return;
        }
        const reader = response.body.getReader();
        const textDecoder = new TextDecoder();
        let pending = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          pending += textDecoder.decode(value, { stream: true });
          const result = decoder === decodeServerSentEventChunk
            ? decodeCompleteServerSentEvents(pending)
            : { frames: decoder(pending), remainder: "" };
          pending = result.remainder;
          const frames = result.frames;
          for (const frame of frames) yield frame;
        }
        if (pending.trim()) {
          const frames = decoder === decodeServerSentEventChunk
            ? decodeCompleteServerSentEvents(pending, true).frames
            : decoder(pending);
          for (const frame of frames) yield frame;
        }
      } finally {
        composedSignal.cleanup();
      }
    },
  };
}

function isJsonResponse(response: Response): boolean {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  return contentType.includes("application/json") || contentType.includes("+json");
}

function composeSignal(signal: AbortSignal | undefined, timeoutMs: number | undefined): { signal?: AbortSignal; cleanup: () => void } {
  if (timeoutMs === undefined) return { signal, cleanup: () => undefined };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`Provider request timed out after ${timeoutMs}ms`)), timeoutMs);
  if (signal !== undefined) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }
  return { signal: controller.signal, cleanup: () => clearTimeout(timeout) };
}

export function createMockTransport(frames: unknown[]): RaxTransport {
  return {
    id: "mock",
    async *send() {
      for (const frame of frames) yield frame;
    },
  };
}

export async function runEffect<T>(effect: Effect.Effect<T, RaxModelError>): Promise<T> {
  return Effect.runPromise(effect);
}
