import "@fontsource-variable/geist-mono";
import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { resolveApiOrigin } from "./api-origin";
import githubMark from "./github-mark.svg";
import { RucTerminal } from "./ruc-terminal";

const api = resolveApiOrigin(
  new URL(window.location.href),
  import.meta.env.DEV,
  import.meta.env.VITE_API_URL,
);

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

        <RucTerminal apiOrigin={api} />
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
