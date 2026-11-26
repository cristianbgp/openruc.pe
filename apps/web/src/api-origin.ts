export function resolveApiOrigin(
  page: URL,
  development: boolean,
  configuredOrigin?: string,
): string {
  const override = configuredOrigin?.trim();
  if (override) return override.replace(/\/+$/, "");
  if (!development) return "https://api.openruc.pe";

  const localName = /(^|\.)openrucpe\.localhost$/;
  if (localName.test(page.hostname)) {
    const api = new URL(page.origin);
    api.hostname = page.hostname.replace(
      localName,
      "$1api.openrucpe.localhost",
    );
    return api.origin;
  }

  return "http://localhost:3000";
}
