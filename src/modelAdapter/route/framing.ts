export type RaxFrameDecoder = (chunk: string) => unknown[];

export type RaxFrameDecodeResult = {
  frames: unknown[];
  remainder: string;
};

export function decodeServerSentEventChunk(chunk: string): unknown[] {
  return decodeCompleteServerSentEvents(chunk, true).frames;
}

export function decodeCompleteServerSentEvents(chunk: string, flush = false): RaxFrameDecodeResult {
  const frames: unknown[] = [];
  const boundary = lastEventBoundary(chunk);
  const completeText = boundary === -1 ? (flush ? chunk : "") : chunk.slice(0, boundary);
  const remainder = boundary === -1 ? (flush ? "" : chunk) : chunk.slice(boundary).replace(/^(?:\r?\n)+/, "");
  const blocks = completeText.split(/\r?\n\r?\n/);
  for (const block of blocks) {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") continue;
    try {
      frames.push(JSON.parse(data));
    } catch {
      frames.push(data);
    }
  }
  return { frames, remainder };
}

export function decodeJsonFrame(chunk: string): unknown[] {
  if (!chunk.trim()) return [];
  return [JSON.parse(chunk)];
}

function lastEventBoundary(chunk: string): number {
  const lf = chunk.lastIndexOf("\n\n");
  const crlf = chunk.lastIndexOf("\r\n\r\n");
  const index = Math.max(lf, crlf);
  if (index === -1) return -1;
  return index + (index === crlf ? 4 : 2);
}
