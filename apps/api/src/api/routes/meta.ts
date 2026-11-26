import { createRoute, z } from "@hono/zod-openapi";
import { ErrorSchema, jsonContent, MetadataSchema } from "../openapi";

export const MetadataResponseSchema = z
  .object({ data: MetadataSchema })
  .openapi("MetadataResponse");

export const metaRoute = createRoute({
  method: "get",
  path: "/v1/meta",
  tags: ["RUC"],
  responses: {
    200: {
      description: "Current snapshot metadata",
      ...jsonContent(MetadataResponseSchema),
    },
    429: { description: "Rate limit exceeded", ...jsonContent(ErrorSchema) },
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
