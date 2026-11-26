import { createRoute, z } from "@hono/zod-openapi";
import { ErrorSchema, jsonContent } from "../openapi";

export const HealthSchema = z
  .object({
    status: z.literal("ok"),
    database: z.literal("ready"),
    snapshot: z.string(),
  })
  .openapi("Health");

export const healthRoute = createRoute({
  method: "get",
  path: "/health",
  tags: ["System"],
  responses: {
    200: {
      description: "Service and database are ready",
      ...jsonContent(HealthSchema),
    },
    503: {
      description: "Database is unavailable",
      ...jsonContent(ErrorSchema),
    },
    500: {
      description: "Unexpected server error",
      ...jsonContent(ErrorSchema),
    },
  },
});
