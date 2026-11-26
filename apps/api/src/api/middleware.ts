import type { OpenAPIHono } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { type ApiErrorCode, errorBody } from "./errors";

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface FixedWindowLimiter {
  check(key: string): RateLimitResult;
  size(): number;
}

export interface RequestLog {
  requestId: string;
  method: string;
  route: string;
  status: number;
  durationMs: number;
  errorCode: ApiErrorCode | null;
}

export type ApiEnvironment = {
  Variables: { requestId: string; errorCode: ApiErrorCode | null };
};

export function createFixedWindowLimiter(options: {
  limit: number;
  windowMs: number;
  maxEntries?: number;
  now?: () => number;
}): FixedWindowLimiter {
  if (!Number.isInteger(options.limit) || options.limit < 1) {
    throw new RangeError("limit must be a positive integer");
  }
  if (!Number.isInteger(options.windowMs) || options.windowMs < 1) {
    throw new RangeError("windowMs must be a positive integer");
  }
  const maxEntries = options.maxEntries ?? 50_000;
  if (!Number.isInteger(maxEntries) || maxEntries < 1) {
    throw new RangeError("maxEntries must be a positive integer");
  }
  const now = options.now ?? Date.now;
  const clients = new Map<string, { count: number; resetAt: number }>();
  let nextPruneAt = 0;

  return {
    check(key) {
      const timestamp = now();
      if (timestamp >= nextPruneAt) {
        for (const [client, window] of clients) {
          if (window.resetAt <= timestamp) clients.delete(client);
        }
        nextPruneAt = timestamp + Math.min(options.windowMs, 60_000);
      }
      let window = clients.get(key);
      if (!window) {
        if (clients.size >= maxEntries) {
          const oldest = clients.keys().next().value;
          if (oldest !== undefined) clients.delete(oldest);
        }
        window = { count: 0, resetAt: timestamp + options.windowMs };
        clients.set(key, window);
      }
      window.count += 1;
      return {
        allowed: window.count <= options.limit,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((window.resetAt - timestamp) / 1000),
        ),
      };
    },
    size: () => clients.size,
  };
}

function safeRequestId(value: string | undefined): string | null {
  if (!value || value.length > 128) return null;
  return /^[A-Za-z0-9._:-]+$/.test(value) ? value : null;
}

function clientKey(address: string | undefined, secret: string): string {
  const client = address?.trim() || "unknown";
  return new Bun.CryptoHasher("sha256")
    .update(`${secret}:${client}`)
    .digest("hex")
    .slice(0, 16);
}

export interface ApiMiddlewareOptions {
  corsOrigins: string[];
  rateLimit: number;
  rateWindowMs: number;
  requestId: () => string;
  clientIpHeader?: string;
  now?: () => number;
  log?: (entry: RequestLog) => void;
}

export function applyApiMiddleware(
  app: OpenAPIHono<ApiEnvironment>,
  options: ApiMiddlewareOptions,
): void {
  const now = options.now ?? Date.now;
  const limiterSecret = crypto.randomUUID();
  const limiter = createFixedWindowLimiter({
    limit: options.rateLimit,
    windowMs: options.rateWindowMs,
    now,
  });
  const sink =
    options.log ?? ((entry: RequestLog) => console.log(JSON.stringify(entry)));

  app.use("*", async (context, next) => {
    const requestId =
      safeRequestId(context.req.header("X-Request-ID")) ?? options.requestId();
    const client = clientKey(
      context.req.header(options.clientIpHeader ?? "X-Real-IP"),
      limiterSecret,
    );
    context.set("requestId", requestId);
    context.set("errorCode", null);
    context.header("X-Request-ID", requestId);

    const rate =
      context.req.path === "/health"
        ? { allowed: true, retryAfterSeconds: 0 }
        : limiter.check(client);
    const startedAt = now();
    let limitedResponse: Response | undefined;
    if (!rate.allowed) {
      context.set("errorCode", "RATE_LIMITED");
      context.header("Cache-Control", "no-store");
      context.header("Retry-After", String(rate.retryAfterSeconds));
      limitedResponse = context.json(
        errorBody(
          "RATE_LIMITED",
          "Too many requests. Please retry later.",
          requestId,
        ),
        429,
      );
    } else {
      await next();
    }

    sink({
      requestId,
      method: context.req.method,
      route:
        context.req.routePath && context.req.routePath !== "/*"
          ? context.req.routePath
          : context.req.path,
      status: limitedResponse?.status ?? context.res.status,
      durationMs: Math.max(0, now() - startedAt),
      errorCode: context.get("errorCode"),
    });
    return limitedResponse;
  });
  app.use(
    "*",
    cors({
      origin: options.corsOrigins.includes("*") ? "*" : options.corsOrigins,
      exposeHeaders: ["X-Request-ID"],
    }),
  );
}
