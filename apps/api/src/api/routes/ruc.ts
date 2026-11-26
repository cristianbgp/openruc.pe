import { createRoute, z } from "@hono/zod-openapi";
import { ErrorSchema, jsonContent } from "../openapi";

const RucResponseSchema = z
  .object({
    ruc: z.string(),
    razon_social: z.string(),
    estado: z.string(),
    condicion: z.string(),
    direccion: z.string().nullable(),
    ubigeo: z.string().nullable(),
    source: z.literal("SUNAT"),
    as_of: z.iso.date().nullable().openapi({
      description:
        "UTC date of the source ZIP's Last-Modified header, when known.",
    }),
  })
  .openapi("RucResponse");

export const rucRoute = createRoute({
  method: "get",
  path: "/v1/ruc/{ruc}",
  tags: ["RUC"],
  request: {
    params: z.object({
      ruc: z.string().openapi({
        param: { name: "ruc", in: "path" },
        example: "20100047218",
      }),
    }),
  },
  responses: {
    200: { description: "Exact RUC match", ...jsonContent(RucResponseSchema) },
    400: { description: "Invalid RUC", ...jsonContent(ErrorSchema) },
    404: {
      description: "RUC absent from this snapshot",
      ...jsonContent(ErrorSchema),
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
