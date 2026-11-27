import Copy from "lucide-react/icons/copy";
import Play from "lucide-react/icons/play";
import { type SubmitEvent, useState } from "react";

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

export function RucTerminal({ apiOrigin }: { apiOrigin: string }) {
  const [ruc, setRuc] = useState(example.ruc);
  const [copyMessage, setCopyMessage] = useState("");
  const [output, setOutput] = useState({
    label: "Respuesta de ejemplo",
    body: JSON.stringify(example, null, 2),
    pending: false,
  });
  const endpoint = `${apiOrigin}/v1/ruc/`;
  const isComplete = ruc.length === 11;

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(`curl ${endpoint}${ruc}`);
      setCopyMessage("Comando copiado.");
    } catch {
      setCopyMessage(`Copia este comando: curl ${endpoint}${ruc}`);
    }
  }

  async function runCommand(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isComplete || output.pending) return;

    setOutput({ label: "Consultando RUC…", body: "", pending: true });
    try {
      const response = await fetch(`${endpoint}${ruc}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      const body = response.headers
        .get("Content-Type")
        ?.includes("application/json")
        ? JSON.stringify(await response.json(), null, 2)
        : "La API no devolvió JSON.";
      setOutput({
        label: `HTTP ${response.status} · ${ruc}`,
        body,
        pending: false,
      });
    } catch (error) {
      const timedOut =
        error instanceof DOMException && error.name === "TimeoutError";
      setOutput({
        label: timedOut
          ? "Tiempo de espera agotado."
          : "No se pudo conectar con la API.",
        body: "Intenta ejecutar el comando nuevamente.",
        pending: false,
      });
    }
  }

  return (
    <section aria-labelledby="terminal-title" className="min-w-0">
      <form
        onSubmit={runCommand}
        className="rounded-lg border border-line bg-panel"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2 sm:px-6">
          <h2 id="terminal-title" className="text-sm font-semibold">
            Terminal
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-label="Copiar comando"
              disabled={!isComplete}
              onClick={copyCommand}
              className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-control-line px-2.5 text-sm font-medium hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Copy aria-hidden="true" size={16} />
              Copiar
            </button>
            <button
              type="submit"
              disabled={!isComplete || output.pending}
              className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg bg-accent px-2.5 text-sm font-semibold text-on-accent hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Play aria-hidden="true" size={16} />
              Ejecutar
            </button>
          </div>
        </div>
        <div className="border-b border-line bg-code px-4 py-2 text-sm leading-relaxed sm:px-6">
          <span aria-hidden="true" className="mr-1 select-none text-muted">
            $
          </span>
          <code className="wrap-anywhere">
            {`curl ${apiOrigin}`}
            <wbr />
            /v1/ruc/
          </code>
          <label className="inline-block">
            <span className="sr-only">Número de RUC</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              placeholder="11 dígitos"
              required
              readOnly={output.pending}
              value={ruc}
              onChange={(event) => {
                setRuc(
                  event.currentTarget.value.replace(/[^0-9]/g, "").slice(0, 11),
                );
                setCopyMessage("");
              }}
              className="min-h-11 w-[12ch] rounded-sm border-b border-control-line bg-panel px-1 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:text-sm"
            />
          </label>
        </div>
        <p
          role="status"
          className="px-4 pt-5 text-sm font-medium text-muted sm:px-6"
        >
          {output.label}
        </p>
        <pre
          aria-busy={output.pending}
          className="min-h-56 wrap-break-word whitespace-pre-wrap px-4 pt-2 pb-5 text-sm leading-relaxed sm:px-6"
        >
          <code>{output.body}</code>
        </pre>
      </form>
      <p
        role="status"
        className="mt-2 min-h-6 wrap-break-word text-sm text-muted"
      >
        {copyMessage}
      </p>
    </section>
  );
}
