export const basePath = normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH ?? "");
export const isStaticExport = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";

export function withBasePath(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) {
    return path;
  }

  return `${basePath}${path}` || path;
}

function normalizeBasePath(path: string): string {
  if (!path || path === "/") {
    return "";
  }

  return path.startsWith("/") ? path.replace(/\/$/, "") : `/${path.replace(/\/$/, "")}`;
}
