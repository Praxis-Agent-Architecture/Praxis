import path from 'node:path';

export type AppConfig = {
  host: string;
  port: number;
  databasePath: string;
};

export function getConfig(): AppConfig {
  return {
    host: process.env.HOST ?? '127.0.0.1',
    port: Number(process.env.PORT ?? 3000),
    databasePath: process.env.DATABASE_PATH ?? path.resolve(process.cwd(), 'data', 'knowledge-hub.db')
  };
}
