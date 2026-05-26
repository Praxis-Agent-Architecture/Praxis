import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const queues = new Map<string, Promise<unknown>>();

export async function withMemoryLock<T>(
  lockDir: string,
  fn: () => Promise<T>,
  input: { retries?: number; retryDelayMs?: number } = {},
): Promise<T> {
  const previous = queues.get(lockDir) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(() => withDirectoryLock(lockDir, fn, input));
  queues.set(lockDir, next);
  try {
    return await next;
  } finally {
    if (queues.get(lockDir) === next) {
      queues.delete(lockDir);
    }
  }
}

async function withDirectoryLock<T>(
  lockDir: string,
  fn: () => Promise<T>,
  input: { retries?: number; retryDelayMs?: number },
): Promise<T> {
  const retries = input.retries ?? 100;
  const retryDelayMs = input.retryDelayMs ?? 25;
  let acquired = false;
  await mkdir(path.dirname(lockDir), { recursive: true });
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await mkdir(lockDir, { recursive: false });
      acquired = true;
      break;
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (code !== "EEXIST" || attempt === retries) {
        throw error;
      }
      await delay(retryDelayMs + Math.floor(Math.random() * retryDelayMs));
    }
  }

  try {
    return await fn();
  } finally {
    if (acquired) {
      await rm(lockDir, { recursive: true, force: true });
    }
  }
}
