export type RaxFrameDecoder = (chunk: string) => unknown[];

export function decodeServerSentEventChunk(chunk: string): unknown[] {
  const frames: unknown[] = [];
  const blocks = chunk.split(/\r?\n\r?\n/);
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
  return frames;
}

export function decodeJsonFrame(chunk: string): unknown[] {
  if (!chunk.trim()) return [];
  return [JSON.parse(chunk)];
}

