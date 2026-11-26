import { swaggerUI } from "@hono/swagger-ui";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { SqlitePadronRepository } from "../database/repository";
import { condicionLabel, estadoLabel } from "../padron/codes";
import { isValidRuc } from "../padron/ruc";
import { errorBody } from "./errors";
import {
  type ApiEnvironment,
  applyApiMiddleware,
  type RequestLog,
} from "./middleware";
import { ErrorSchema, jsonContent, OPENAPI_DOCUMENT } from "./openapi";
import { healthRoute } from "./routes/health";
import { metaRoute } from "./routes/meta";
import { rucRoute } from "./routes/ruc";

const IMMUTABLE_CACHE = "public, max-age=86400, stale-while-revalidate=604800";

type Repository = Pick<
  SqlitePadronRepository,
  "lookup" | "metadata" | "isReady"
>;
export interface AppOptions {
  repository: Repository;
  requestId?: () => string;
  corsOrigins?: string[];
  rateLimit?: number;
  rateWindowMs?: number;
  clientIpHeader?: string;
  now?: () => number;
  log?: (entry: RequestLog) => void;
}

export function createApp(options: AppOptions): OpenAPIHono<ApiEnvironment> {
  const app = new OpenAPIHono<ApiEnvironment>();
  const createRequestId = options.requestId ?? (() => crypto.randomUUID());

  applyApiMiddleware(app, {
    corsOrigins: options.corsOrigins ?? ["*"],
    rateLimit: options.rateLimit ?? 120,
    rateWindowMs: options.rateWindowMs ?? 60_000,
    requestId: createRequestId,
    ...(options.clientIpHeader
      ? { clientIpHeader: options.clientIpHeader }
      : {}),
    ...(options.now ? { now: options.now } : {}),
    ...(options.log ? { log: options.log } : {}),
  });

  app.openapi(healthRoute, (context) => {
    const requestId = context.get("requestId");
    try {
      if (!options.repository.isReady()) throw new Error("not ready");
      const metadata = options.repository.metadata();
      context.header("Cache-Control", "no-store");
      return context.json(
        {
          status: "ok",
          database: "ready",
          snapshot: metadata.snapshot,
        } as const,
        200,
      );
    } catch {
      context.set("errorCode", "DATABASE_UNAVAILABLE");
      context.header("Cache-Control", "no-store");
      return context.json(
        errorBody(
          "DATABASE_UNAVAILABLE",
          "The RUC database is not available.",
          requestId,
        ),
        503,
      );
    }
  });

  app.openapi(metaRoute, (context) => {
    const requestId = context.get("requestId");
    try {
      const metadata = options.repository.metadata();
      context.header("Cache-Control", IMMUTABLE_CACHE);
      return context.json({ data: metadata }, 200);
    } catch {
      context.set("errorCode", "DATABASE_UNAVAILABLE");
      context.header("Cache-Control", "no-store");
      return context.json(
        errorBody(
          "DATABASE_UNAVAILABLE",
          "The RUC database is not available.",
          requestId,
        ),
        503,
      );
    }
  });

  app.openapi(rucRoute, (context) => {
    const requestId = context.get("requestId");
    const ruc = context.req.valid("param").ruc;
    if (!isValidRuc(ruc)) {
      context.set("errorCode", "INVALID_RUC");
      context.header("Cache-Control", "no-store");
      return context.json(
        errorBody(
          "INVALID_RUC",
          "RUC must contain eleven digits with a valid check digit.",
          requestId,
        ),
        400,
      );
    }

    try {
      const record = options.repository.lookup(ruc);
      if (!record) {
        context.set("errorCode", "RUC_NOT_FOUND");
        context.header("Cache-Control", "no-store");
        return context.json(
          errorBody(
            "RUC_NOT_FOUND",
            "The requested RUC is not present in this snapshot.",
            requestId,
          ),
          404,
        );
      }
      const { lastModified } = options.repository.metadata().source;
      const modifiedAt = new Date(lastModified ?? "");
      // Round-trip the HTTP date to reject strings Date can parse loosely.
      const asOf =
        Number.isFinite(modifiedAt.getTime()) &&
        modifiedAt.toUTCString() === lastModified
          ? modifiedAt.toISOString().slice(0, 10)
          : null;

      context.header("Cache-Control", IMMUTABLE_CACHE);
      return context.json(
        {
          ruc: record.ruc,
          razon_social: record.nombre,
          estado: estadoLabel(record.estado),
          condicion: condicionLabel(record.condicion),
          direccion: record.domicilio,
          ubigeo: record.ubigeo,
          source: "SUNAT",
          as_of: asOf,
        },
        200,
      );
    } catch {
      context.set("errorCode", "DATABASE_UNAVAILABLE");
      context.header("Cache-Control", "no-store");
      return context.json(
        errorBody(
          "DATABASE_UNAVAILABLE",
          "The RUC database is not available.",
          requestId,
        ),
        503,
      );
    }
  });

  app.openAPIRegistry.registerPath({
    method: "get",
    path: "/openapi.json",
    tags: ["System"],
    responses: {
      200: { description: "OpenAPI document" },
      429: { description: "Rate limit exceeded", ...jsonContent(ErrorSchema) },
      500: {
        description: "Unexpected server error",
        ...jsonContent(ErrorSchema),
      },
    },
  });
  app.openAPIRegistry.registerPath({
    method: "get",
    path: "/docs",
    tags: ["System"],
    responses: {
      200: { description: "Interactive Swagger UI" },
      429: { description: "Rate limit exceeded", ...jsonContent(ErrorSchema) },
      500: {
        description: "Unexpected server error",
        ...jsonContent(ErrorSchema),
      },
    },
  });
  app.doc("/openapi.json", OPENAPI_DOCUMENT);
  app.get("/docs", swaggerUI({ url: "/openapi.json" }));

  app.onError((_, context) => {
    context.set("errorCode", "INTERNAL_ERROR");
    context.header("Cache-Control", "no-store");
    return context.json(
      errorBody(
        "INTERNAL_ERROR",
        "An unexpected error occurred.",
        context.get("requestId"),
      ),
      500,
    );
  });
  return app;
}
