import { createApp } from "./api/app";
import type { RequestLog } from "./api/middleware";
import type { AppConfig } from "./config";
import { loadConfig } from "./config";
import { SqlitePadronRepository } from "./database/repository";

type ServerRepository = Pick<
  SqlitePadronRepository,
  "lookup" | "metadata" | "isReady" | "close"
>;

export interface RunningServer {
  port: number;
  stop(): Promise<void>;
}

export function startServer(
  config: AppConfig,
  dependencies: {
    repository?: ServerRepository;
    log?: (entry: RequestLog) => void;
  } = {},
): RunningServer {
  const repository =
    dependencies.repository ?? SqlitePadronRepository.open(config.databasePath);
  const app = createApp({
    repository,
    corsOrigins: config.api.corsOrigins,
    rateLimit: config.api.rateLimit,
    rateWindowMs: config.api.rateWindowMs,
    ...(dependencies.log ? { log: dependencies.log } : {}),
  });

  let server: ReturnType<typeof Bun.serve>;
  try {
    server = Bun.serve({ port: config.port, fetch: app.fetch });
  } catch (error) {
    repository.close();
    throw error;
  }
  const port = server.port;
  if (port === undefined) {
    void server.stop(true);
    repository.close();
    throw new Error("Bun did not bind a numeric TCP port");
  }

  let stopped = false;
  const stop = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    process.off("SIGTERM", stopFromSignal);
    process.off("SIGINT", stopFromSignal);
    await server.stop(true);
    repository.close();
  };
  const stopFromSignal = (): void => {
    void stop();
  };
  process.on("SIGTERM", stopFromSignal);
  process.on("SIGINT", stopFromSignal);

  return { port, stop };
}

if (import.meta.main) {
  startServer(await loadConfig());
}
