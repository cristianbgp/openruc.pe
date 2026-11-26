import "@fontsource-variable/geist-mono";
import "./styles.css";
import Copy from "lucide-react/icons/copy";
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { resolveApiOrigin } from "./api-origin";
import githubMark from "./github-mark.svg";

const api = resolveApiOrigin(
  new URL(window.location.href),
  import.meta.env.DEV,
  import.meta.env.VITE_API_URL,
);

const example = {
  ruc: "20100047218",
  razon_social: "BANCO DE CREDITO DEL PERU",
  estado: "ACTIVO",
  condicion: "HABIDO",
  direccion: "JR. CENTENARIO 156 LADERAS DE MELGAREJO",
  ubigeo: "150114",
  source: "SUNAT",
  as_of: null,
};
const command = `curl ${api}/v1/ruc/${example.ruc}`;

function RequestExample() {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(command);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  return (
    <section aria-labelledby="example-title" className="min-w-0">
      <div className="rounded-lg border border-line bg-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2 sm:px-6">
          <h2 id="example-title" className="text-sm font-semibold">
            Ejemplo de consulta
          </h2>
          <button
            type="button"
            onClick={copyCommand}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-control-line px-3 text-sm font-medium hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Copy aria-hidden="true" size={16} />
            Copiar comando
          </button>
        </div>
        <pre className="whitespace-pre-wrap break-all border-b border-line bg-code px-4 py-4 text-sm text-ink sm:px-6">
          <code>{command}</code>
        </pre>
        <p className="px-4 pt-5 text-sm font-medium text-muted sm:px-6">
          Respuesta de ejemplo
        </p>
        <pre className="wrap-break-word whitespace-pre-wrap px-4 pt-2 pb-5 text-sm leading-relaxed sm:px-6">
          <code>{JSON.stringify(example, null, 2)}</code>
        </pre>
      </div>
      <p role="status" className="mt-2 min-h-6 text-sm text-muted">
        {copyState === "copied"
          ? "Comando copiado."
          : copyState === "error"
            ? "Selecciona el comando para copiarlo manualmente."
            : null}
      </p>
    </section>
  );
}

function App() {
  return (
    <div className="mx-auto flex min-h-svh max-w-6xl flex-col px-5 sm:px-8">
      <header className="flex min-h-16 items-center border-b border-line">
        <a
          href="/"
          className="rounded-lg text-xl font-bold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          openruc.pe
        </a>
      </header>

      <main className="grid flex-1 content-center gap-10 py-12 md:grid-cols-[0.85fr_1.15fr] md:items-center md:gap-12 md:py-20">
        <div>
          <h1 className="max-w-[12ch] text-4xl leading-[1.03] font-bold tracking-[-0.05em] lg:text-6xl">
            Consulta el RUC peruano.
          </h1>
          <p className="mt-5 max-w-[34ch] text-lg leading-relaxed text-muted">
            Busca un RUC por número y obtén su razón social, estado y domicilio
            fiscal en JSON.
          </p>
          <a
            href={`${api}/docs`}
            className="mt-7 inline-flex min-h-11 items-center rounded-lg bg-accent px-4 py-2.5 font-semibold whitespace-nowrap text-on-accent hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
          >
            Documentación API
          </a>
        </div>

        <RequestExample />
      </main>

      <footer className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-t border-line py-5 text-sm text-muted">
        <p>
          Proyecto independiente. Datos del{" "}
          <a
            className="rounded-lg underline underline-offset-4 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            href="https://www.sunat.gob.pe/descargaPRR/mrc137_padron_reducido.html"
          >
            padrón reducido de SUNAT
          </a>
          .
        </p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <p>
            Made by{" "}
            <a
              className="rounded-lg underline underline-offset-4 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              href="https://cristianbgp.com"
            >
              @cristianbgp
            </a>
          </p>
          <a
            className="inline-flex items-center gap-1.5 rounded-lg underline underline-offset-4 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            href="https://github.com/cristianbgp/openruc.pe"
          >
            <img
              src={githubMark}
              width={16}
              height={16}
              alt=""
              className="shrink-0 opacity-75 dark:invert"
            />
            Código en GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing application root");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
