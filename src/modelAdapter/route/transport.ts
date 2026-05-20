import { Effect } from "effect";
import { decodeServerSentEventChunk, type RaxFrameDecoder } from "./framing.js";
import { raxModelError, type RaxModelError, type RaxPreparedModelRequest } from "../schema/index.js";

export type RaxTransport = {
  id: string;
  send: (prepared: RaxPreparedModelRequest, decoder?: RaxFrameDecoder) => AsyncIterable<unknown>;
};

export function createFetchTransport(fetchImpl: typeof fetch = fetch): RaxTransport {
  return {
    id: "fetch",
    async *send(prepared, decoder = decodeServerSentEventChunk) {
      const response = await fetchImpl(prepared.url, {
        method: prepared.method,
        headers: prepared.headers,
        body: JSON.stringify(prepared.body),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw raxModelError("provider_error", `Provider returned HTTP ${response.status}`, { status: response.status, body: text });
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
        const frames = decoder(pending);
        if (pending.includes("\n\n") || pending.includes("\r\n\r\n")) pending = "";
        for (const frame of frames) yield frame;
      }
      if (pending.trim()) {
        for (const frame of decoder(pending)) yield frame;
      }
    },
  };
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

