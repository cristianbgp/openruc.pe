# openruc.pe

A fast, read-only API for exact Peruvian RUC lookups, written in TypeScript with Bun, Hono, and SQLite.

This is an unofficial educational project built from SUNAT's public reduced RUC registry. It is not affiliated with SUNAT, and its snapshot can be older than SUNAT's live systems. Do not treat it as the sole source for legal, tax, or compliance decisions.

## How it works

There are two deliberately separate programs:

```text
Offline importer
SUNAT page -> ZIP discovery -> streamed download + SHA-256 -> streamed extraction
           -> CP1252 line reader -> normalization -> candidate SQLite database
           -> integrity/count checks -> atomic replacement of apps/api/data/padron.sqlite

Online API
HTTP client -> Hono route -> RUC validation -> prepared exact-key SQLite query
            -> labeled JSON response
```

The importer creates `apps/api/data/padron.sqlite.next`, validates it, and replaces `apps/api/data/padron.sqlite` only after every check succeeds. A failed or interrupted import leaves the previous snapshot untouched. The API opens the published snapshot in read-only mode.

The Bun workspace contains two independently deployable apps. `apps/api` builds and serves the registry. `apps/web` is a static React and Vite landing page with an interactive terminal. Edit the RUC and run the lookup to see the HTTP status and JSON, or copy the curl command to use it from your own terminal.

## Requirements

- Bun 1.3.14
- Node.js 24 or newer for Crew, Portless, and Vite
- Docker Desktop, only for image builds and container smoke tests

Install dependencies:

```bash
bun install --frozen-lockfile
```

## Local development

From the workspace root, create the two-record fixture if you do not already have a snapshot. The fixture command replaces the local database.

```bash
bun run data:fixture
```

Start the Portless proxy in your terminal before launching Crew. On first use, Portless may prompt for permission to configure HTTPS locally.

```bash
bun run portless proxy start
bun run dev
```

Open [the landing page](https://openrucpe.localhost) or [Swagger](https://api.openrucpe.localhost/docs). The two services run independently, and each loads its environment from its own workspace. Quit Crew with `Ctrl+Q`. To stop the proxy too, use `bun run portless proxy stop` when your other local apps are done with it.

Without Portless, run these commands in separate terminals:

```bash
bun run dev:api       # http://localhost:3000
bun run dev:web       # http://localhost:5173
```

The fixture uses local test data. The landing page points at the matching Portless API or the direct local API in development. The planned production domains are `openruc.pe` for the landing page and `api.openruc.pe` for the API. Set `VITE_API_URL` in the web workspace environment to use a different API origin.

Try every public route:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/v1/meta
curl http://localhost:3000/v1/ruc/20100047218
curl http://localhost:3000/openapi.json
curl http://localhost:3000/docs
```

`/docs` is an interactive Swagger UI generated from the same typed route definitions as `/openapi.json`.

## API contract

`GET /v1/ruc/:ruc` accepts exactly eleven digits with a valid SUNAT modulo-11 check digit. The local fixture returns this example for Banco de Crédito del Perú (BCP):

```json
{
  "ruc": "20100047218",
  "razon_social": "BANCO DE CREDITO DEL PERU",
  "estado": "ACTIVO",
  "condicion": "HABIDO",
  "direccion": "JR. CENTENARIO 156 LADERAS DE MELGAREJO",
  "ubigeo": "150114",
  "source": "SUNAT",
  "as_of": null
}
```

For a downloaded snapshot, `as_of` is the UTC date of the SUNAT ZIP's `Last-Modified` header (`YYYY-MM-DD`). It is `null` when that date is unavailable, including for the local fixture. `direccion` and `ubigeo` are also nullable. Use `GET /v1/meta` for the snapshot build date and full source metadata.

Errors have one stable shape:

```json
{
  "error": {
    "code": "RUC_NOT_FOUND",
    "message": "The requested RUC is not present in this snapshot.",
    "requestId": "..."
  }
}
```

The public error codes are `INVALID_RUC`, `RUC_NOT_FOUND`, `RATE_LIMITED`, `DATABASE_UNAVAILABLE`, and `INTERNAL_ERROR`. Lookup and metadata successes are cacheable because a deployed snapshot is immutable; health responses and errors use `no-store`.

The best-effort in-memory limiter keys clients from Railway's trusted `X-Real-IP` header. Its state is bounded, resets on restart or Serverless sleep, and is not shared across replicas. Request logs omit both raw addresses and reusable client hashes.

## Building a real snapshot

The source and parser limits live in `apps/api/config.json`. Environment variables can override `DATABASE_PATH`, `PORT`, `CORS_ORIGINS`, `RATE_LIMIT`, and `RATE_WINDOW_MS`. The root data commands run from `apps/api`, so their relative paths resolve from that directory.

Check SUNAT's lightweight remote signature without downloading the complete archive:

```bash
bun run data:check
```

Build the current dataset:

```bash
bun run data:build --target data/padron.sqlite --work-dir .work
```

For a known local archive, avoid network access:

```bash
bun run data:build --local-zip /absolute/path/padron.zip --target data/padron.sqlite --work-dir .work
```

The importer processes bounded chunks and individual lines. It does not hold the complete ZIP or extracted registry in memory. It resolves columns by normalized header names instead of assuming fixed positions, keeps RUC and ubigeo as strings, maps known SUNAT status values to compact codes, and records discarded and duplicate counts in snapshot metadata.

## SQLite design

The lookup table is intentionally small:

```sql
CREATE TABLE ruc (
  ruc TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  estado INTEGER NOT NULL,
  condicion INTEGER NOT NULL,
  ubigeo TEXT,
  domicilio TEXT
) WITHOUT ROWID;
```

An exact RUC is already the primary key, so `WITHOUT ROWID` avoids SQLite's redundant hidden row identifier and secondary primary-key index. A second `metadata` table stores the schema/pipeline versions, source signature and hash, dates, and row statistics.

Before publication, validation runs SQLite's integrity check, requires the supported schema version, requires at least one record, and compares metadata with `SELECT COUNT(*)`. The API then opens the database in strict read-only mode and reuses one prepared lookup statement.

## Source tour

```text
apps/api/src/source/     discover, download, extract, and decode SUNAT data
apps/api/src/padron/     headers, parsing, RUC rules, and status labels
apps/api/src/database/   snapshot writer, validation, and read-only repository
apps/api/src/cli/        data:check and data:build orchestration
apps/api/src/api/        Hono routes, OpenAPI schemas, errors, and middleware
apps/api/src/server.ts   Bun startup and graceful shutdown
apps/api/test/           fixtures and API tests
apps/web/                static landing page and its API origin configuration
crew.toml                local service commands
```

Start with `apps/api/src/cli/import.ts` for the offline path and `apps/api/src/api/app.ts` for the request path.

## Verification and Docker

Run formatting/lint checks, strict TypeScript, and all tests:

```bash
bun run check
bun run build
```

Build and run the same fixture image used by pull-request CI:

```bash
bun run data:fixture
docker build -t openrucpe-api:fixture .
docker run --rm -p 13000:3000 openrucpe-api:fixture
```

Then open `http://localhost:13000/health`. A local Docker build packages the existing `apps/api/data/padron.sqlite`. For production, the workflow submits the source and a fresh build marker to Railway. The Docker build on Railway uses the marker to download SUNAT's ZIP and generate a validated SQLite snapshot before copying it into the runtime image. Build the web app separately with `bun run build:web`. Its static output is `apps/web/dist/`.

## Railway cost controls

`railway.json` configures a Dockerfile build, `/health` checks, failure-only restarts, and exactly one replica. In the Railway dashboard, also enable Serverless sleep, set conservative CPU/memory ceilings after measuring the production snapshot, and configure a spending alert. Do not add PostgreSQL, Redis, or a volume: the database is immutable and included in the image.

Avoid a low workspace-wide hard spending limit if the same Railway workspace runs more important services, because reaching it can affect those services too.

Required GitHub Actions secrets are `RAILWAY_TOKEN`, `RAILWAY_PROJECT_ID`, and `RAILWAY_SERVICE_ID`. Set the `PUBLISHED_API_URL` repository variable so the scheduled change check can read `/v1/meta` from the current deployment.

## GitHub Actions updates

Pull requests and pushes to `main` install the locked Bun dependencies, run all checks, build the landing page, generate the fixture database, and build the Docker image.

At 8:30 a.m. Lima time (13:30 UTC) daily, or when manually dispatched, the production workflow compares SUNAT's ETag, Last-Modified value, Content-Length, and the pipeline version with the deployed metadata. A changed signature, unavailable metadata, or manual force triggers a Railway deployment. The upload contains source files only. Each workflow run and retry supplies a unique build marker so Railway regenerates the snapshot when it builds the Docker image. Production jobs are serialized and limited to 90 minutes.

## Deliberate non-goals

- Name, address, or partial-RUC search
- Writes, accounts, API keys, or billing
- PostgreSQL, Redis, volumes, or persistent distributed rate limits

## License

The source code is available under the [MIT License](LICENSE). SUNAT publishes the registry used by the importer. The MIT license applies to the project's source code, and generated snapshots are kept out of Git.
